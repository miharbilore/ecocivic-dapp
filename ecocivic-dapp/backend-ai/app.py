import json
import logging
import os
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from web3 import Web3

from ai.anomaly_detection import DEFAULT_HISTORICAL_DELTAS, analyze_consumption_delta
from ai.model_utils import safe_cleanup_file
from ai.ocr import read_water_meter
from config import API_HOST, API_PORT, DEBUG
from database.db import get_db, init_db
from database.models import (
    CitizenProfile,
    PenaltyRecord,
    RecyclingSubmission,
    VirtualCardTransaction,
    WaterMeterReading,
)
from services.game_theory_engine import (
    compute_nash_audit_probability,
    compute_reputation_metrics,
    evaluate_inspection_game,
    simulate_inspection_game_matrix,
)
from services.oracle_signer import (
    get_oracle_signer_address,
    sign_recycling_voucher,
    sign_water_reading_voucher,
)
from services.qr_service import build_escpos_thermal_receipt, generate_qr_token
from services.recycling_validation import validate_recycling_submission
from services.water_validation import calculate_water_bill


app = Flask(__name__)

# Maximum upload size: 10 MB (aligned with Frontend validation)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.config["DEBUG"] = DEBUG

CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ecocivic-backend")

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize database tables automatically
init_db()

DEFAULT_CITIZEN_WALLET = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"


def _error_response(message: str, status_code: int = 400, extra: dict | None = None):
    payload = {"error": message}
    if extra:
        payload.update(extra)
    return jsonify(payload), status_code


def _normalize_wallet(wallet_address: str | None) -> str:
    if not wallet_address or not str(wallet_address).startswith("0x") or len(str(wallet_address)) != 42:
        return DEFAULT_CITIZEN_WALLET
    try:
        return Web3.to_checksum_address(wallet_address)
    except Exception:
        return DEFAULT_CITIZEN_WALLET


def _get_or_create_citizen(db, wallet_address: str) -> CitizenProfile:
    checksum_addr = _normalize_wallet(wallet_address)
    profile = (
        db.query(CitizenProfile)
        .filter(CitizenProfile.wallet_address == checksum_addr)
        .first()
    )
    if not profile:
        profile = CitizenProfile(
            wallet_address=checksum_addr,
            reputation_score=100,
            honest_declarations_count=0,
            slashing_count=0,
            eip712_nonce=0,
            deposit_amount_usdc=1000.0,
            card_balance_try=225.0,
            total_burned_belt=0.0,
            under_investigation=False,
        )
        db.add(profile)
        db.flush()
    return profile


BELT_TO_TRY_RATE = 1.50  # Sabit Dönüşüm Kuru: 1 BELT = 1.50 TL

ALLOWED_GREEN_MCC_CATALOG = {
    "9399": "Belediye Online Su & Çevre Vergisi Veznesi (Tüm Belediyeler)",
    "4111": "Şehir İçi Toplu Ulaşım & Metro/Otobüs Temassız POS",
    "5411": "Yerel Üretici Kooperatifi & Halk Market POS",
    "4900": "Su ve Atıksu İdaresi (İSKİ / ASKİ / İZSU / Evrensel Fatura POS)",
}


def _build_virtual_card_info(db, citizen: CitizenProfile) -> dict:
    """Vatandaşın deterministik EcoCivic Troy/Mastercard Sanal Kart bilgilerini üretir."""
    import hashlib

    digest = hashlib.sha256(citizen.wallet_address.lower().encode("utf-8")).hexdigest()
    digits = "".join(str(int(ch, 16) % 10) for ch in digest[:12])
    # 9792 (Troy) / 5342 (Mastercard) BaaS Ön Ödemeli Sanal Kart BIN
    full_pan = f"9792 {digits[0:4]} {digits[4:8]} {digits[8:12]}"
    masked_pan = f"9792 **** **** {digits[8:12]}"
    cvv = f"{(int(digest[12:16], 16) % 900) + 100}"

    tx_rows = (
        db.query(VirtualCardTransaction)
        .filter(VirtualCardTransaction.wallet_address == citizen.wallet_address)
        .order_by(VirtualCardTransaction.id.desc())
        .limit(15)
        .all()
    )

    return {
        "card_holder": f"ECOCIVIC CITIZEN ({citizen.wallet_address[:6]}...{citizen.wallet_address[-4:]})",
        "card_scheme": "TROY / Mastercard BaaS Virtual Prepaid",
        "card_number_masked": masked_pan,
        "card_number_full": full_pan,
        "expiry_date": "08/29",
        "cvv": cvv,
        "card_balance_try": round(float(citizen.card_balance_try or 0.0), 2),
        "total_burned_belt": round(float(citizen.total_burned_belt or 0.0), 2),
        "conversion_rate_try": BELT_TO_TRY_RATE,
        "mcc_green_restriction": "ACTIVE",
        "allowed_mcc_catalog": ALLOWED_GREEN_MCC_CATALOG,
        "transactions": [
            {
                "id": t.id,
                "tx_type": t.tx_type,
                "belt_burned": t.belt_burned,
                "amount_try": t.amount_try,
                "balance_after_try": t.balance_after_try,
                "mcc_code": t.mcc_code,
                "merchant_name": t.merchant_name,
                "auth_code": t.auth_code,
                "blockchain_tx_hash": t.blockchain_tx_hash,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in tx_rows
        ],
    }


@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(e):
    return _error_response("Uploaded file exceeds the 10MB limit.", 413)


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    if isinstance(e, HTTPException):
        return e
    logger.exception("Unexpected server error")
    if app.config.get("DEBUG"):
        return _error_response(f"Internal server error: {str(e)}", 500)
    return _error_response("An unexpected error occurred.", 500)


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify(
        {
            "status": "ok",
            "oracle_signer": get_oracle_signer_address(),
            "architecture": "Clean-Pipeline-EIP712-GameTheory-v2",
        }
    ), 200


@app.route("/api/water/validate", methods=["POST"])
def validate_water_meter():
    """
    Su sayacı fotoğrafını uçtan uca işler:
    1) Anti-Spoofing (Moiré / FFT / Kontrast Analizi)
    2) OpenCV Ön İşleme & OCR Stratejisi
    3) Delta (Δ) Tüketim Anomali Analizi
    4) 2x2 Oyun Teorisi Denetim Kararı (Nash Dengesi p*)
    5) EIP-712 WaterReadingVoucher Kriptografik İmzalama ve DB Kaydı
    """
    if "image" not in request.files:
        return _error_response("Image not provided", 400)

    image = request.files["image"]
    if not image or image.filename == "":
        return _error_response("Image file name is empty", 400)

    allowed_mimes = {"image/jpeg", "image/png", "image/jpg", "image/webp"}
    if image.mimetype not in allowed_mimes:
        return _error_response("Unsupported image type. Allowed: JPG, PNG, WebP.", 400)

    wallet_address = _normalize_wallet(request.form.get("wallet_address"))
    meter_no_hint = request.form.get("meter_no")
    reading_override_raw = request.form.get("reading_override")
    reading_override = int(reading_override_raw) if reading_override_raw not in (None, "") else None
    random_draw_raw = request.form.get("random_draw_override")
    random_draw_override = float(random_draw_raw) if random_draw_raw not in (None, "") else None

    ext = os.path.splitext(image.filename)[1] or ".jpg"
    temp_filename = f"{uuid.uuid4().hex}_{os.path.basename(image.filename)}"
    if not temp_filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        temp_filename += ext
    filepath = os.path.join(UPLOAD_FOLDER, temp_filename)

    try:
        image.save(filepath)

        # 1. Anti-Spoofing + OpenCV Ön İşleme + OCR Okuma
        ocr_result = read_water_meter(
            filepath,
            meter_no_override=meter_no_hint,
            reading_override=reading_override,
        )

        # Sahte / Ekran Görüntüsü (Spoof) Yakalandıysa
        if ocr_result.get("spoof_detected"):
            with get_db() as db:
                citizen = _get_or_create_citizen(db, wallet_address)
                citizen.under_investigation = True

                spoof_record = WaterMeterReading(
                    meter_no=meter_no_hint or "MTR-SPOOF",
                    wallet_address=citizen.wallet_address,
                    reading_index=0,
                    previous_index=0,
                    consumption_m3=0.0,
                    saved_m3=0.0,
                    bill_amount=0.0,
                    reward_amount=0.0,
                    reputation_score=citizen.reputation_score,
                    confidence_score=0.0,
                    anomaly_score=1.0,
                    spoof_detected=True,
                    is_valid=False,
                    anomaly_detected=True,
                    audit_required=True,
                    audit_status="AUDIT_REQUIRED",
                    audit_reason=ocr_result.get("error", "Anti-spoofing failure"),
                )
                db.add(spoof_record)
                db.flush()
                record_id = spoof_record.id

            return jsonify(
                {
                    "valid": False,
                    "spoof_detected": True,
                    "slashing_signal": True,
                    "audit_required": True,
                    "reading_id": record_id,
                    "reason": ocr_result.get("error"),
                    "authenticity": ocr_result.get("authenticity"),
                }
            ), 400

        if ocr_result.get("index") is None:
            return jsonify(
                {
                    "valid": False,
                    "reason": "OCR failed to extract reading index",
                    "data": ocr_result,
                }
            ), 400

        current_index = int(ocr_result["index"])
        meter_no = str(ocr_result.get("meter_no") or meter_no_hint or "MTR-1001")
        confidence_score = float(ocr_result.get("confidence_score", 0.90))

        with get_db() as db:
            citizen = _get_or_create_citizen(db, wallet_address)

            # Vatandaşın geçmiş okumalarını DB'den çek
            past_readings = (
                db.query(WaterMeterReading)
                .filter(
                    WaterMeterReading.wallet_address == citizen.wallet_address,
                    WaterMeterReading.is_valid.is_(True),
                )
                .order_by(WaterMeterReading.id.asc())
                .all()
            )

            if past_readings:
                previous_index = past_readings[-1].reading_index
                historical_deltas = [
                    float(r.consumption_m3) for r in past_readings if r.consumption_m3 > 0
                ]
                if not historical_deltas:
                    historical_deltas = list(DEFAULT_HISTORICAL_DELTAS)
            else:
                # İlk okuma için varsayılan başlangıç: eğer current_index > 100 ise önceki 125, değilse 0
                previous_index = 125 if current_index >= 125 else 0
                historical_deltas = list(DEFAULT_HISTORICAL_DELTAS)

            # 2. Aylık Tüketim Deltası (Δ) Anomali Analizi
            delta_analysis = analyze_consumption_delta(
                current_reading=current_index,
                previous_reading=previous_index,
                historical_deltas=historical_deltas,
            )

            # 3. Oyun Teorisi (2x2 Inspection Game) Denetim Kararı
            game_eval = evaluate_inspection_game(
                reputation_score=citizen.reputation_score,
                anomaly_score=delta_analysis["anomaly_score"],
                confidence_score=confidence_score,
                spoof_detected=False,
                random_draw_override=random_draw_override,
            )

            # Anomali varsa (ör. sayaç geriye gitmişse veya aşırı sapma varsa)
            if not delta_analysis["valid"]:
                citizen.under_investigation = True
                flagged_reading = WaterMeterReading(
                    meter_no=meter_no,
                    wallet_address=citizen.wallet_address,
                    reading_index=current_index,
                    previous_index=previous_index,
                    consumption_m3=delta_analysis["delta_m3"],
                    saved_m3=0.0,
                    bill_amount=0.0,
                    reward_amount=0.0,
                    reputation_score=citizen.reputation_score,
                    confidence_score=confidence_score,
                    anomaly_score=delta_analysis["anomaly_score"],
                    spoof_detected=False,
                    is_valid=False,
                    anomaly_detected=True,
                    audit_required=True,
                    audit_status="AUDIT_REQUIRED",
                    audit_reason=delta_analysis["reason"],
                )
                db.add(flagged_reading)
                db.flush()

                return jsonify(
                    {
                        "valid": False,
                        "reading_id": flagged_reading.id,
                        "meter_no": meter_no,
                        "current_index": current_index,
                        "previous_index": previous_index,
                        "consumption_m3": delta_analysis["delta_m3"],
                        "historical_avg": delta_analysis["historical_mean_delta"],
                        "anomaly_analysis": delta_analysis,
                        "game_theory": game_eval,
                        "audit_required": True,
                        "reason": delta_analysis["reason"],
                    }
                ), 200

            # 4. Tasarruf Ödülü ve Fatura Hesaplama
            billing_info = calculate_water_bill(
                current_index=current_index,
                previous_index=previous_index,
                historical_avg_m3=delta_analysis["historical_mean_delta"],
                reputation_score=citizen.reputation_score,
            )

            # 5. EIP-712 WaterReadingVoucher İmzala
            citizen.eip712_nonce += 1
            nonce = citizen.eip712_nonce
            voucher_bundle = sign_water_reading_voucher(
                citizen_address=citizen.wallet_address,
                current_reading=current_index,
                meter_id=meter_no,
                nonce=nonce,
            )

            audit_req = bool(game_eval["audit_required"])
            audit_status = "AUDIT_REQUIRED" if audit_req else "AUTO_APPROVED"

            if not audit_req:
                citizen.reputation_score = min(1000, citizen.reputation_score + 5)
                citizen.honest_declarations_count += 1

            reading_record = WaterMeterReading(
                meter_no=meter_no,
                wallet_address=citizen.wallet_address,
                reading_index=current_index,
                previous_index=previous_index,
                consumption_m3=billing_info["consumption_m3"],
                saved_m3=billing_info["saved_m3"],
                bill_amount=billing_info["bill_amount"],
                reward_amount=billing_info["reward_amount"],
                reputation_score=citizen.reputation_score,
                confidence_score=confidence_score,
                anomaly_score=delta_analysis["anomaly_score"],
                spoof_detected=False,
                is_valid=True,
                anomaly_detected=False,
                audit_required=audit_req,
                audit_status=audit_status,
                audit_reason=game_eval["audit_reason"],
                eip712_nonce=nonce,
                voucher_signature=voucher_bundle["signature"],
            )
            db.add(reading_record)
            db.flush()

            return jsonify(
                {
                    "valid": True,
                    "reading_id": reading_record.id,
                    "meter_no": meter_no,
                    "current_index": current_index,
                    "previous_index": previous_index,
                    "consumption_m3": billing_info["consumption_m3"],
                    "saved_m3": billing_info["saved_m3"],
                    "historical_avg": delta_analysis["historical_mean_delta"],
                    "reward_eligible": True,
                    "reward_amount": billing_info["reward_amount"],
                    "bill_amount": billing_info["bill_amount"],
                    "reputation_score": citizen.reputation_score,
                    "confidence_score": confidence_score,
                    "audit_required": audit_req,
                    "audit_status": audit_status,
                    "anomaly_analysis": delta_analysis,
                    "game_theory": game_eval,
                    "eip712_voucher": voucher_bundle,
                }
            ), 200

    finally:
        # Geçici görseli diskten her koşulda temizle (Disk DoS koruması)
        safe_cleanup_file(filepath)


@app.route("/api/recycling/qr/generate", methods=["POST"])
def generate_recycling_qr():
    """Vatandaş için kriptografik geri dönüşüm QR token'ı üretir."""
    body = request.get_json(silent=True) or {}
    material_type = body.get("material_type", "glass")
    amount = body.get("amount", 1.0)
    wallet_address = _normalize_wallet(body.get("wallet_address"))

    try:
        qr_token = generate_qr_token(
            material_type=material_type,
            amount=float(amount),
            wallet_address=wallet_address,
        )
        return jsonify({"valid": True, "qr_token": qr_token}), 200
    except ValueError as exc:
        return _error_response(str(exc), 400)


@app.route("/api/kiosk/verify-and-print", methods=["POST"])
@app.route("/api/recycling/validate", methods=["POST"])
def verify_kiosk_recycling_and_print():
    """
    Raspberry Pi Atık Beyan Kiosku Endpoint'i:
    1) QR token, malzeme türü ve Load-Cell (Tartı) ağırlığını doğrular.
    2) Oyun Teorisi Denetim Motorunu çalıştırır.
    3) EIP-712 RecyclingVoucher kriptografik imzasını üretir.
    4) ESC/POS Termal Yazıcı fiş komutlarını döner ve DB'ye kaydeder.
    """
    body = request.get_json(silent=True) or {}
    material_type = body.get("material_type")
    qr_token = body.get("qr_token")
    wallet_address = _normalize_wallet(body.get("wallet_address"))
    measured_weight_kg = body.get("measured_weight_kg")
    kiosk_id = body.get("kiosk_id", "KIOSK-RPI-01")
    random_draw_override = body.get("random_draw_override")

    if not isinstance(qr_token, dict):
        return _error_response("Valid qr_token object is required", 400)

    with get_db() as db:
        citizen = _get_or_create_citizen(db, wallet_address)

        # Replay kontrolü: QR hash daha önce kullanılmış mı?
        qr_hash = str(qr_token.get("hash", ""))
        existing = (
            db.query(RecyclingSubmission)
            .filter(RecyclingSubmission.qr_hash == qr_hash)
            .first()
        )
        if existing:
            return _error_response("QR token hash has already been processed", 400)

        validation = validate_recycling_submission(
            material_type=material_type,
            qr_token=qr_token,
            wallet_address=citizen.wallet_address,
            measured_weight_kg=measured_weight_kg,
            reputation_score=citizen.reputation_score,
        )

        if not validation.get("valid"):
            if validation.get("anomaly_detected"):
                citizen.under_investigation = True
            return jsonify(validation), 400

        # Oyun Teorisi Denetim Değerlendirmesi
        game_eval = evaluate_inspection_game(
            reputation_score=citizen.reputation_score,
            anomaly_score=0.05,
            confidence_score=0.95,
            random_draw_override=random_draw_override,
        )

        citizen.eip712_nonce += 1
        nonce = citizen.eip712_nonce

        # Kontrat 18 decimal baz miktar bekler
        actual_kg = float(validation["measured_weight_kg"])
        amount_wei = int(round(actual_kg * (10**18)))

        voucher_bundle = sign_recycling_voucher(
            citizen_address=citizen.wallet_address,
            material_type=validation["material_type"],
            amount_wei=amount_wei,
            qr_hash=qr_hash,
            nonce=nonce,
        )

        if not game_eval["audit_required"]:
            citizen.reputation_score = min(1000, citizen.reputation_score + 5)
            citizen.honest_declarations_count += 1

        thermal_receipt = build_escpos_thermal_receipt(
            kiosk_id=kiosk_id,
            wallet_address=citizen.wallet_address,
            material_type=validation["material_type"],
            measured_weight_kg=actual_kg,
            reward_belt=validation["reward_amount"],
            reputation_score=citizen.reputation_score,
            qr_hash=qr_hash,
            nonce=nonce,
        )

        submission = RecyclingSubmission(
            wallet_address=citizen.wallet_address,
            material_type=validation["material_type"],
            amount_kg=actual_kg,
            qr_token_id=str(validation["qr_token_id"]),
            qr_hash=qr_hash,
            reward_amount=validation["reward_amount"],
            reputation_score=citizen.reputation_score,
            confidence_score=0.95,
            audit_required=bool(game_eval["audit_required"]),
            eip712_nonce=nonce,
            voucher_signature=voucher_bundle["signature"],
            kiosk_id=kiosk_id,
            thermal_receipt_payload=json.dumps(thermal_receipt),
            is_processed=True,
            processed_at=datetime.now(timezone.utc),
        )
        db.add(submission)
        db.flush()

        return jsonify(
            {
                "valid": True,
                "submission_id": submission.id,
                "kiosk_id": kiosk_id,
                "wallet_address": citizen.wallet_address,
                "material_type": validation["material_type"],
                "measured_weight_kg": actual_kg,
                "reward_amount": validation["reward_amount"],
                "reputation_score": citizen.reputation_score,
                "audit_required": game_eval["audit_required"],
                "game_theory": game_eval,
                "eip712_voucher": voucher_bundle,
                "thermal_receipt": thermal_receipt,
            }
        ), 200


@app.route("/api/citizen/<wallet_address>/status", methods=["GET"])
def get_citizen_status(wallet_address: str):
    """
    Vatandaşın DB'deki geçmiş su/atık beyanlarını, İtibar Skorunu (R_i)
    ve Oyun Teorisi parametrelerini döner.
    """
    checksum_wallet = _normalize_wallet(wallet_address)
    with get_db() as db:
        citizen = _get_or_create_citizen(db, checksum_wallet)
        rep_metrics = compute_reputation_metrics(citizen.reputation_score)
        nash_prob = compute_nash_audit_probability(
            reputation_score=citizen.reputation_score,
            anomaly_score=0.0,
            confidence_score=0.92,
        )

        water_readings = (
            db.query(WaterMeterReading)
            .filter(WaterMeterReading.wallet_address == citizen.wallet_address)
            .order_by(WaterMeterReading.id.desc())
            .limit(20)
            .all()
        )
        recyclings = (
            db.query(RecyclingSubmission)
            .filter(RecyclingSubmission.wallet_address == citizen.wallet_address)
            .order_by(RecyclingSubmission.id.desc())
            .limit(20)
            .all()
        )
        penalties = (
            db.query(PenaltyRecord)
            .filter(PenaltyRecord.wallet_address == citizen.wallet_address)
            .order_by(PenaltyRecord.id.desc())
            .limit(20)
            .all()
        )

        return jsonify(
            {
                "wallet_address": citizen.wallet_address,
                "reputation_score": citizen.reputation_score,
                "honest_declarations_count": citizen.honest_declarations_count,
                "slashing_count": citizen.slashing_count,
                "deposit_amount_usdc": citizen.deposit_amount_usdc,
                "card_balance_try": round(float(citizen.card_balance_try or 0.0), 2),
                "total_burned_belt": round(float(citizen.total_burned_belt or 0.0), 2),
                "virtual_card": _build_virtual_card_info(db, citizen),
                "under_investigation": citizen.under_investigation,
                "eip712_nonce": citizen.eip712_nonce,
                "game_theory_profile": {
                    "required_stake_usdc": rep_metrics["required_stake_usdc"],
                    "has_sufficient_stake": citizen.deposit_amount_usdc >= rep_metrics["required_stake_usdc"],
                    "reward_multiplier": rep_metrics["reward_multiplier"],
                    "reward_multiplier_bps": rep_metrics["reward_multiplier_bps"],
                    "baseline_audit_probability": nash_prob,
                },
                "water_readings": [
                    {
                        "id": r.id,
                        "meter_no": r.meter_no,
                        "reading_index": r.reading_index,
                        "previous_index": r.previous_index,
                        "consumption_m3": r.consumption_m3,
                        "saved_m3": r.saved_m3,
                        "reward_amount": r.reward_amount,
                        "anomaly_score": r.anomaly_score,
                        "audit_required": r.audit_required,
                        "audit_status": r.audit_status,
                        "audit_reason": r.audit_reason,
                    }
                    for r in water_readings
                ],
                "recycling_submissions": [
                    {
                        "id": s.id,
                        "material_type": s.material_type,
                        "amount_kg": s.amount_kg,
                        "reward_amount": s.reward_amount,
                        "kiosk_id": s.kiosk_id,
                        "qr_hash": s.qr_hash,
                    }
                    for s in recyclings
                ],
                "penalties": [
                    {
                        "id": p.id,
                        "penalty_type": p.penalty_type,
                        "penalty_amount": p.penalty_amount,
                        "reputation_before": p.reputation_before,
                        "reputation_after": p.reputation_after,
                        "inspector_reward": p.inspector_reward,
                        "treasury_share": p.treasury_share,
                        "description": p.description,
                    }
                    for p in penalties
                ],
            }
        ), 200


@app.route("/api/admin/anomalies", methods=["GET"])
def list_admin_anomalies():
    """
    Belediye Yönetim Paneli için fiziksel denetime (AUDIT_REQUIRED) veya
    anomaliye takılan şüpheli beyanları listeler.
    """
    with get_db() as db:
        pending_audits = (
            db.query(WaterMeterReading)
            .filter(WaterMeterReading.audit_required.is_(True))
            .order_by(WaterMeterReading.id.desc())
            .all()
        )

        items = [
            {
                "reading_id": r.id,
                "wallet_address": r.wallet_address,
                "meter_no": r.meter_no,
                "reading_index": r.reading_index,
                "previous_index": r.previous_index,
                "consumption_m3": r.consumption_m3,
                "reputation_score": r.reputation_score,
                "confidence_score": r.confidence_score,
                "anomaly_score": r.anomaly_score,
                "spoof_detected": r.spoof_detected,
                "audit_status": r.audit_status,
                "audit_reason": r.audit_reason,
            }
            for r in pending_audits
        ]

        return jsonify(
            {
                "total_count": len(items),
                "anomalies": items,
            }
        ), 200


@app.route("/api/admin/audit-decision", methods=["POST"])
def submit_admin_audit_decision():
    """
    Belediye Denetçisinin fiziksel inceleme sonrası verdiği kararı işler:
    - decision == "APPROVE": Beyanı onaylar, R_i + 5 verir ve EIP-712 imzası üretir.
    - decision == "SLASH": Slashing tetikler, R_i'yi %50 düşürür, teminattan kesinti
      yapar (%20 Denetçi Ödülü, %80 Belediye Çevre Fonu).
    """
    body = request.get_json(silent=True) or {}
    reading_id = body.get("reading_id")
    decision = str(body.get("decision", "")).strip().upper()
    inspector_address = _normalize_wallet(body.get("inspector_address"))
    slash_amount_usdc = float(body.get("slash_amount_usdc", 300.0))
    reason = body.get("reason", "Municipal physical inspection decision")

    if not reading_id or decision not in ("APPROVE", "SLASH"):
        return _error_response("reading_id and decision ('APPROVE' or 'SLASH') are required", 400)

    with get_db() as db:
        reading = (
            db.query(WaterMeterReading)
            .filter(WaterMeterReading.id == int(reading_id))
            .first()
        )
        if not reading:
            return _error_response("WaterMeterReading record not found", 404)

        citizen = _get_or_create_citizen(db, reading.wallet_address)

        if decision == "APPROVE":
            reading.audit_status = "APPROVED"
            reading.is_valid = True
            citizen.under_investigation = False
            citizen.reputation_score = min(1000, citizen.reputation_score + 5)
            citizen.honest_declarations_count += 1

            if not reading.voucher_signature:
                citizen.eip712_nonce += 1
                voucher = sign_water_reading_voucher(
                    citizen_address=citizen.wallet_address,
                    current_reading=max(1, reading.reading_index),
                    meter_id=reading.meter_no,
                    nonce=citizen.eip712_nonce,
                )
                reading.eip712_nonce = citizen.eip712_nonce
                reading.voucher_signature = voucher["signature"]

            return jsonify(
                {
                    "status": "APPROVED",
                    "reading_id": reading.id,
                    "wallet_address": citizen.wallet_address,
                    "new_reputation_score": citizen.reputation_score,
                    "voucher_signature": reading.voucher_signature,
                }
            ), 200

        # decision == "SLASH"
        rep_before = citizen.reputation_score
        rep_after = max(10, rep_before // 2)
        citizen.reputation_score = rep_after
        citizen.slashing_count += 1
        citizen.under_investigation = False

        actual_slash = min(citizen.deposit_amount_usdc, slash_amount_usdc)
        citizen.deposit_amount_usdc = round(max(0.0, citizen.deposit_amount_usdc - actual_slash), 2)

        inspector_reward = round(actual_slash * 0.20, 2)
        treasury_share = round(actual_slash - inspector_reward, 2)

        reading.audit_status = "SLASHED"
        reading.is_valid = False

        penalty = PenaltyRecord(
            wallet_address=citizen.wallet_address,
            penalty_type="INSPECTION_SLASHING",
            penalty_amount=actual_slash,
            reputation_before=rep_before,
            reputation_after=rep_after,
            inspector_address=inspector_address,
            inspector_reward=inspector_reward,
            treasury_share=treasury_share,
            description=reason,
            is_paid=True,
            paid_at=datetime.now(timezone.utc),
        )
        db.add(penalty)
        db.flush()

        rep_metrics = compute_reputation_metrics(rep_after)

        return jsonify(
            {
                "status": "SLASHED",
                "reading_id": reading.id,
                "penalty_id": penalty.id,
                "wallet_address": citizen.wallet_address,
                "slashed_amount_usdc": actual_slash,
                "remaining_deposit_usdc": citizen.deposit_amount_usdc,
                "inspector_reward_usdc": inspector_reward,
                "treasury_share_usdc": treasury_share,
                "reputation_before": rep_before,
                "reputation_after": rep_after,
                "new_required_stake_usdc": rep_metrics["required_stake_usdc"],
            }
        ), 200


@app.route("/api/gametheory/simulate", methods=["GET", "POST"])
def simulate_game_theory():
    """
    Akademik makale (Q1/Q2) ve Yönetim Paneli için farklı İtibar Skoru (R_i)
    ve hile kazancı senaryolarında Nash Dengesi Denetim Olasılığı (p*) matrisini döner.
    """
    body = request.get_json(silent=True) or {}
    fraud_gain = float(body.get("illicit_gain", request.args.get("fraud_gain", 50.0)))
    simulation = simulate_inspection_game_matrix(fraud_gain=fraud_gain)
    return jsonify(simulation), 200


@app.route("/api/citizen/<wallet_address>/card", methods=["GET"])
def get_citizen_virtual_card(wallet_address: str):
    """Vatandaşın EcoCivic Ön Ödemeli Sanal Kart detaylarını ve işlem geçmişini döner."""
    checksum_wallet = _normalize_wallet(wallet_address)
    with get_db() as db:
        citizen = _get_or_create_citizen(db, checksum_wallet)
        return jsonify(_build_virtual_card_info(db, citizen)), 200


# Demo personaları için deterministik başlangıç profilleri (Jüri / B2G sunumları)
DEMO_PERSONA_SEEDS = {
    "citizen": {
        "reputation_score": 250,
        "honest_declarations_count": 30,
        "slashing_count": 0,
        "deposit_amount_usdc": 1500.0,
        "card_balance_try": 225.0,
        "under_investigation": False,
    },
    "riskyCitizen": {
        "reputation_score": 45,
        "honest_declarations_count": 2,
        "slashing_count": 2,
        "deposit_amount_usdc": 700.0,
        "card_balance_try": 40.0,
        "under_investigation": True,
    },
    "inspector": {
        "reputation_score": 500,
        "honest_declarations_count": 0,
        "slashing_count": 0,
        "deposit_amount_usdc": 0.0,
        "card_balance_try": 0.0,
        "under_investigation": False,
    },
}


@app.route("/api/demo/reset", methods=["POST"])
def reset_demo_persona():
    """
    Demo Verilerini Sıfırla: Seçili demo cüzdanının tüm beyan, ceza ve sanal kart
    geçmişini temizler ve profili deterministik başlangıç değerlerine döndürür.
    """
    body = request.get_json(silent=True) or {}
    wallet_address = _normalize_wallet(body.get("wallet_address"))
    persona = str(body.get("persona", "citizen"))
    seed = DEMO_PERSONA_SEEDS.get(persona, DEMO_PERSONA_SEEDS["citizen"])

    with get_db() as db:
        for model in (WaterMeterReading, RecyclingSubmission, PenaltyRecord, VirtualCardTransaction):
            db.query(model).filter(model.wallet_address == wallet_address).delete(
                synchronize_session=False
            )

        citizen = _get_or_create_citizen(db, wallet_address)
        citizen.reputation_score = seed["reputation_score"]
        citizen.honest_declarations_count = seed["honest_declarations_count"]
        citizen.slashing_count = seed["slashing_count"]
        citizen.deposit_amount_usdc = seed["deposit_amount_usdc"]
        citizen.card_balance_try = seed["card_balance_try"]
        citizen.total_burned_belt = 0.0
        citizen.under_investigation = seed["under_investigation"]
        citizen.eip712_nonce = 0
        db.flush()

        return jsonify(
            {
                "status": "RESET",
                "persona": persona,
                "wallet_address": citizen.wallet_address,
                "reputation_score": citizen.reputation_score,
                "card_balance_try": citizen.card_balance_try,
            }
        ), 200


@app.route("/api/citizen/card/convert", methods=["POST"])
def convert_belt_to_virtual_card():
    """
    Evrensel Sanal Kart & Nakit Dönüşüm Köprüsü (Token-to-Fiat Virtual Card Bridge):
    Vatandaşın yaktığı BELT miktarını sabit kurdan (1 BELT = 1.50 TL)
    EcoCivic Sanal Kart bakiyesine (`card_balance_try`) ekler.
    """
    body = request.get_json(silent=True) or {}
    wallet_address = _normalize_wallet(body.get("wallet_address"))
    try:
        belt_amount = float(body.get("belt_amount", 0))
    except (TypeError, ValueError):
        return _error_response("Geçerli bir belt_amount değeri giriniz.", 400)

    if belt_amount <= 0:
        return _error_response("Dönüştürülecek BELT miktarı 0'dan büyük olmalıdır.", 400)

    tx_hash = body.get("tx_hash") or ("0x" + uuid.uuid4().hex + uuid.uuid4().hex)

    with get_db() as db:
        citizen = _get_or_create_citizen(db, wallet_address)
        fiat_added_try = round(belt_amount * BELT_TO_TRY_RATE, 2)
        citizen.card_balance_try = round(float(citizen.card_balance_try or 0.0) + fiat_added_try, 2)
        citizen.total_burned_belt = round(float(citizen.total_burned_belt or 0.0) + belt_amount, 2)

        auth_code = f"CNV-{uuid.uuid4().hex[:8].upper()}"
        card_tx = VirtualCardTransaction(
            wallet_address=citizen.wallet_address,
            tx_type="CONVERT_LOAD",
            belt_burned=round(belt_amount, 2),
            amount_try=fiat_added_try,
            balance_after_try=citizen.card_balance_try,
            mcc_code="0000",
            merchant_name="BELT Token Yakım -> Sanal Kart TL Yükleme",
            auth_code=auth_code,
            blockchain_tx_hash=str(tx_hash)[:66],
        )
        db.add(card_tx)
        db.flush()

        card_info = _build_virtual_card_info(db, citizen)

        return jsonify(
            {
                "status": "CONVERTED",
                "wallet_address": citizen.wallet_address,
                "belt_burned": round(belt_amount, 2),
                "conversion_rate_try": BELT_TO_TRY_RATE,
                "fiat_added_try": fiat_added_try,
                "card_balance_try": citizen.card_balance_try,
                "auth_code": auth_code,
                "blockchain_tx_hash": str(tx_hash)[:66],
                "virtual_card": card_info,
            }
        ), 200


@app.route("/api/citizen/card/spend", methods=["POST"])
def spend_virtual_card_balance():
    """
    Sanal Kart ile Evrensel POS / MCC Harcama Uç Noktası:
    Herhangi bir belediyenin online su/vergi veznesi (MCC 9399 / 4900),
    şehir içi ulaşım (MCC 4111) veya yerel kooperatif/market (MCC 5411)
    üzerinden özel entegrasyon gerektirmeden standart kart provizyonu üretir.
    """
    body = request.get_json(silent=True) or {}
    wallet_address = _normalize_wallet(body.get("wallet_address"))
    mcc_code = str(body.get("mcc_code", "9399")).strip()

    try:
        amount_try = round(float(body.get("amount_try", 0)), 2)
    except (TypeError, ValueError):
        return _error_response("Geçerli bir harcama tutarı (amount_try) giriniz.", 400)

    if amount_try <= 0:
        return _error_response("Harcama tutarı 0 TL'den büyük olmalıdır.", 400)

    if mcc_code not in ALLOWED_GREEN_MCC_CATALOG:
        return _error_response(
            f"MCC {mcc_code} kodu Yeşil Sivil Harcama Kısıtlaması (Green MCC Filter) kapsamında reddedildi.",
            400,
            {"allowed_mcc_catalog": ALLOWED_GREEN_MCC_CATALOG},
        )

    merchant_name = body.get("merchant_name") or ALLOWED_GREEN_MCC_CATALOG[mcc_code]

    with get_db() as db:
        citizen = _get_or_create_citizen(db, wallet_address)
        current_balance = round(float(citizen.card_balance_try or 0.0), 2)

        if current_balance < amount_try:
            return _error_response(
                f"Yetersiz Sanal Kart TL bakiyesi (Mevcut: {current_balance:.2f} TL, İstenen: {amount_try:.2f} TL).",
                400,
            )

        citizen.card_balance_try = round(current_balance - amount_try, 2)
        auth_code = f"POS-{uuid.uuid4().hex[:8].upper()}"

        card_tx = VirtualCardTransaction(
            wallet_address=citizen.wallet_address,
            tx_type="MCC_SPEND",
            belt_burned=0.0,
            amount_try=amount_try,
            balance_after_try=citizen.card_balance_try,
            mcc_code=mcc_code,
            merchant_name=str(merchant_name)[:120],
            auth_code=auth_code,
            blockchain_tx_hash=None,
        )
        db.add(card_tx)
        db.flush()

        card_info = _build_virtual_card_info(db, citizen)

        return jsonify(
            {
                "status": "APPROVED",
                "wallet_address": citizen.wallet_address,
                "mcc_code": mcc_code,
                "merchant_name": merchant_name,
                "amount_try": amount_try,
                "card_balance_try": citizen.card_balance_try,
                "auth_code": auth_code,
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "virtual_card": card_info,
            }
        ), 200


if __name__ == "__main__":
    app.run(host=API_HOST, port=API_PORT, debug=DEBUG)
