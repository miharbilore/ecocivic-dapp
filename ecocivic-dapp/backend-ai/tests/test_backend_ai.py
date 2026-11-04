"""
Comprehensive Pytest Suite for EcoCivic Backend AI, Game Theory Engine & EIP-712 Oracle Signer
"""
import io
import os
import sys
import tempfile

import cv2
import numpy as np
import pytest
from PIL import Image, PngImagePlugin

# Add backend-ai root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ai.anomaly_detection import analyze_consumption_delta, check_anomaly
from ai.model_utils import (
    check_image_authenticity,
    preprocess_meter_image,
    safe_cleanup_file,
)
from ai.ocr import read_water_meter
from app import app
from database.db import Base, engine
from services.game_theory_engine import (
    compute_nash_audit_probability,
    evaluate_inspection_game,
    simulate_inspection_game_matrix,
)
from services.oracle_signer import (
    get_oracle_signer_address,
    sign_recycling_voucher,
    sign_water_reading_voucher,
    verify_recycling_voucher,
    verify_water_reading_voucher,
)


def _create_natural_meter_image(
    filepath: str,
    meter_no: str = "MTR-5501",
    meter_index: int = 138,
    software_meta: str | None = None,
) -> str:
    """
    OpenCV ile doğal gradyan ve rakam içeren gerçekçi su sayacı test görüntüsü üretir.
    """
    rng = np.random.default_rng(42)
    base = np.linspace(60, 195, 256 * 256, dtype=np.float32).reshape((256, 256))
    noise = rng.normal(0, 12, (256, 256)).astype(np.float32)
    img = np.clip(base + noise, 0, 255).astype(np.uint8)
    img_bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    # Sayaç çerçevesi ve endeks metni çiz
    cv2.rectangle(img_bgr, (20, 60), (235, 190), (30, 30, 30), 2)
    cv2.putText(
        img_bgr,
        f"ID:{meter_no}",
        (30, 105),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (10, 10, 10),
        2,
    )
    cv2.putText(
        img_bgr,
        f"{meter_index} m3",
        (30, 155),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.85,
        (0, 0, 0),
        2,
    )

    pil_img = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    png_info = PngImagePlugin.PngInfo()
    png_info.add_text("meter_no", str(meter_no))
    png_info.add_text("meter_index", str(meter_index))
    if software_meta:
        png_info.add_text("Software", software_meta)

    pil_img.save(filepath, format="PNG", pnginfo=png_info)
    return filepath


def _create_blank_spoof_image(filepath: str) -> str:
    """Düşük kontrastlı (siyah/boş ekran) sahte görsel üretir."""
    blank = np.full((256, 256, 3), 15, dtype=np.uint8)
    Image.fromarray(blank).save(filepath, format="PNG")
    return filepath


@pytest.fixture(autouse=True)
def reset_database():
    """Her test öncesi veritabanı tablolarını sıfırlar."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


# =====================================================================
# 1. ANTI-SPOOFING & OPENCV OCR PIPELINE TESTS
# =====================================================================
def test_anti_spoofing_and_opencv_pipeline():
    with tempfile.TemporaryDirectory() as tmpdir:
        valid_path = os.path.join(tmpdir, "meter_MTR5501_idx_138.png")
        _create_natural_meter_image(valid_path, meter_no="MTR-5501", meter_index=138)

        # 1. Doğal görsel canlılık kontrolünden geçmeli
        auth_ok = check_image_authenticity(valid_path)
        assert auth_ok["is_authentic"] is True
        assert auth_ok["spoof_detected"] is False

        # 2. OpenCV ön işleme (Grayscale -> Denoise -> CLAHE -> Adaptive Threshold)
        stages = preprocess_meter_image(valid_path)
        assert "clahe" in stages and "thresholded" in stages
        assert stages["clahe"].shape == (256, 256)

        # 3. OCR okuma stratejisi
        ocr_res = read_water_meter(valid_path)
        assert ocr_res["spoof_detected"] is False
        assert ocr_res["preprocessing_applied"] is True
        assert ocr_res["index"] == 138
        assert ocr_res["confidence_score"] > 0.75

        # 4. Siyah/boş ekran görüntüsü Anti-Spoofing tarafından reddedilmeli
        blank_path = os.path.join(tmpdir, "blank_spoof.png")
        _create_blank_spoof_image(blank_path)
        ocr_blank = read_water_meter(blank_path)
        assert ocr_blank["spoof_detected"] is True
        assert ocr_blank["index"] is None

        # 5. Screenshot metadata içeren görüntü reddedilmeli
        screen_path = os.path.join(tmpdir, "screenshot_spoof.png")
        _create_natural_meter_image(
            screen_path,
            meter_no="MTR-999",
            meter_index=200,
            software_meta="Windows Snipping Screenshot Tool",
        )
        ocr_screen = read_water_meter(screen_path)
        assert ocr_screen["spoof_detected"] is True

        # 6. Güvenli dosya temizleme (DoS önleme)
        assert safe_cleanup_file(valid_path) is True
        assert not os.path.exists(valid_path)


# =====================================================================
# 2. CONSUMPTION DELTA (Δ) ANOMALY DETECTION TESTS
# =====================================================================
def test_delta_based_anomaly_detection_fixes_cumulative_bug():
    # Uzun süreli kümülatif sayaç okumaları (her ay ~15 m3 düzenli tüketim)
    cumulative_history = [100, 115, 130, 145, 160, 175, 190, 205, 220, 235]
    # Yeni okuma: 250 m3 (Bu ayki tüketim Δ = 250 - 235 = 15 m3)
    # Eski hatalı kümülatif algoritma 250'yi ortalama 167 ile kıyaslayıp reddediyordu;
    # Yeni Δ algoritması Δ=15 m3 olduğu için %100 geçerli saymalıdır!
    assert check_anomaly(current_index=250, historical_indexes=cumulative_history) is True

    res_normal = analyze_consumption_delta(
        current_reading=250,
        previous_reading=235,
        historical_cumulative_readings=cumulative_history,
    )
    assert res_normal["valid"] is True
    assert res_normal["is_anomaly"] is False
    assert res_normal["delta_m3"] == 15.0
    assert res_normal["anomaly_score"] < 0.25

    # Sayaç geriye gitmişse (Δ < 0 -> Fiziksel müdahale / Hile)
    res_rollback = analyze_consumption_delta(
        current_reading=220,
        previous_reading=235,
        historical_cumulative_readings=cumulative_history,
    )
    assert res_rollback["valid"] is False
    assert res_rollback["is_anomaly"] is True
    assert res_rollback["fraud_suspected"] is True
    assert res_rollback["anomaly_score"] == 1.0

    # Aşırı sıçrama (örn. Δ = 95 m3, geçmiş ortalama 15 m3)
    res_spike = analyze_consumption_delta(
        current_reading=330,
        previous_reading=235,
        historical_cumulative_readings=cumulative_history,
    )
    assert res_spike["valid"] is False
    assert res_spike["is_anomaly"] is True


# =====================================================================
# 3. GAME THEORY 2x2 INSPECTION ENGINE TESTS
# =====================================================================
def test_game_theory_nash_equilibrium_and_audit_decisions():
    # Düşük itibarlı (R_i = 50) vatandaşın baz denetim olasılığı (%40),
    # yüksek itibarlı (R_i = 250) vatandaştan (%8) büyük olmalıdır
    p_low_rep = compute_nash_audit_probability(reputation_score=50, anomaly_score=0.0, confidence_score=0.90)
    p_base_rep = compute_nash_audit_probability(reputation_score=100, anomaly_score=0.0, confidence_score=0.90)
    p_high_rep = compute_nash_audit_probability(reputation_score=250, anomaly_score=0.0, confidence_score=0.90)

    assert p_low_rep == pytest.approx(0.40, rel=1e-2)
    assert p_base_rep == pytest.approx(0.20, rel=1e-2)
    assert p_high_rep == pytest.approx(0.08, rel=1e-2)
    assert p_low_rep > p_base_rep > p_high_rep

    # Yüksek anomali skoru (0.80) doğrudan AUDIT_REQUIRED tetiklemeli
    eval_anom = evaluate_inspection_game(
        reputation_score=100,
        anomaly_score=0.80,
        confidence_score=0.92,
        random_draw_override=0.95,
    )
    assert eval_anom["audit_required"] is True
    assert eval_anom["decision"] == "AUDIT_REQUIRED"

    # Dürüst ve yüksek itibarlı vatandaş (draw > p*) otonom onay almalı
    eval_honest = evaluate_inspection_game(
        reputation_score=200,
        anomaly_score=0.05,
        confidence_score=0.95,
        random_draw_override=0.50,
    )
    assert eval_honest["audit_required"] is False
    assert eval_honest["decision"] == "AUTONOMOUS_APPROVED"
    assert eval_honest["incentive_compatible"] is True

    # Simülasyon matrisi kontrolü
    sim = simulate_inspection_game_matrix()
    assert len(sim["matrix"]) == 6
    assert sim["matrix"][0]["reputation_score"] == 25


# =====================================================================
# 4. EIP-712 CRYPTOGRAPHIC VOUCHER SIGNER TESTS
# =====================================================================
def test_eip712_water_and_recycling_voucher_signatures():
    oracle_addr = get_oracle_signer_address()
    citizen_addr = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"

    # 1. WaterReadingVoucher imzala ve doğrula
    water_signed = sign_water_reading_voucher(
        citizen_address=citizen_addr,
        current_reading=142,
        meter_id="MTR-1001",
        nonce=1,
    )
    recovered_water = verify_water_reading_voucher(
        voucher_payload=water_signed["voucher"],
        signature=water_signed["signature"],
    )
    assert recovered_water.lower() == oracle_addr.lower()

    # 2. RecyclingVoucher imzala ve doğrula
    rec_signed = sign_recycling_voucher(
        citizen_address=citizen_addr,
        material_type="metal",
        amount_wei=25 * 10**18,
        qr_hash="a1b2c3d4e5",
        nonce=2,
    )
    recovered_rec = verify_recycling_voucher(
        voucher_payload=rec_signed["voucher"],
        signature=rec_signed["signature"],
    )
    assert recovered_rec.lower() == oracle_addr.lower()
    assert rec_signed["voucher"]["material"] == 2  # Metal = 2


# =====================================================================
# 5. END-TO-END FLASK API, KIOSK & ADMIN AUDIT TESTS
# =====================================================================
def test_end_to_end_water_kiosk_and_admin_endpoints(client):
    citizen_wallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
    inspector_wallet = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

    # 1. Health Check
    resp_health = client.get("/api/health")
    assert resp_health.status_code == 200
    assert resp_health.get_json()["status"] == "ok"

    # 2. POST /api/water/validate (Geçerli su sayacı fotoğrafı -> Tasarruf ödülü + EIP-712 Voucher)
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = os.path.join(tmpdir, "meter_MTR2026_idx_137.png")
        _create_natural_meter_image(img_path, meter_no="MTR-2026", meter_index=137)

        with open(img_path, "rb") as f:
            data = {
                "image": (io.BytesIO(f.read()), "meter_MTR2026_idx_137.png"),
                "wallet_address": citizen_wallet,
                "meter_no": "MTR-2026",
                "random_draw_override": "0.95",  # Stokastik denetime takılmasın
            }
            resp_water = client.post(
                "/api/water/validate",
                data=data,
                content_type="multipart/form-data",
            )

        assert resp_water.status_code == 200
        w_json = resp_water.get_json()
        assert w_json["valid"] is True
        assert w_json["current_index"] == 137
        assert w_json["consumption_m3"] == 12.0  # 137 - 125 = 12 m3 (3 m3 tasarruf vs 15 m3 ortalama)
        assert w_json["reputation_score"] == 105  # +5 Dürüst beyan artışı
        assert "eip712_voucher" in w_json
        assert w_json["eip712_voucher"]["signature"].startswith("0x")

        # 3. POST /api/water/validate (Sayaç geriye gitme hilesi: 130 < 137 -> AUDIT_REQUIRED)
        with open(img_path, "rb") as f:
            data_fraud = {
                "image": (io.BytesIO(f.read()), "meter_MTR2026_idx_130.png"),
                "wallet_address": citizen_wallet,
                "meter_no": "MTR-2026",
                "reading_override": "130",
            }
            resp_fraud = client.post(
                "/api/water/validate",
                data=data_fraud,
                content_type="multipart/form-data",
            )

        assert resp_fraud.status_code == 200
        f_json = resp_fraud.get_json()
        assert f_json["valid"] is False
        assert f_json["audit_required"] is True
        flagged_reading_id = f_json["reading_id"]

    # 4. GET /api/admin/anomalies & POST /api/admin/audit-decision (SLASHING)
    resp_anom = client.get("/api/admin/anomalies")
    assert resp_anom.status_code == 200
    anom_list = resp_anom.get_json()["anomalies"]
    assert any(a["reading_id"] == flagged_reading_id for a in anom_list)

    resp_slash = client.post(
        "/api/admin/audit-decision",
        json={
            "reading_id": flagged_reading_id,
            "decision": "SLASH",
            "inspector_address": inspector_wallet,
            "slash_amount_usdc": 400.0,
            "reason": "Confirmed physical meter tampering",
        },
    )
    assert resp_slash.status_code == 200
    s_json = resp_slash.get_json()
    assert s_json["status"] == "SLASHED"
    assert s_json["reputation_before"] == 105
    assert s_json["reputation_after"] == 52  # %50 kesinti (105 // 2 = 52)
    assert s_json["inspector_reward_usdc"] == 80.0  # %20 ihbarcı/denetçi payı
    assert s_json["treasury_share_usdc"] == 320.0   # %80 Belediye Çevre Fonu payı

    # 5. POST /api/recycling/qr/generate & POST /api/kiosk/verify-and-print
    resp_qr = client.post(
        "/api/recycling/qr/generate",
        json={
            "material_type": "metal",
            "amount": 10.0,
            "wallet_address": citizen_wallet,
        },
    )
    assert resp_qr.status_code == 200
    qr_token = resp_qr.get_json()["qr_token"]

    resp_kiosk = client.post(
        "/api/kiosk/verify-and-print",
        json={
            "material_type": "metal",
            "qr_token": qr_token,
            "wallet_address": citizen_wallet,
            "measured_weight_kg": 10.0,
            "kiosk_id": "KIOSK-BESIKTAS-01",
            "random_draw_override": 0.99,
        },
    )
    assert resp_kiosk.status_code == 200
    k_json = resp_kiosk.get_json()
    assert k_json["valid"] is True
    assert "eip712_voucher" in k_json
    assert "thermal_receipt" in k_json
    assert "ECOCIVIC AKILLI SEHIR KIOSKU" in k_json["thermal_receipt"]["printable_text"]

    # Replay Attack: Aynı QR token tekrar okutulursa reddedilmeli
    resp_replay = client.post(
        "/api/kiosk/verify-and-print",
        json={
            "material_type": "metal",
            "qr_token": qr_token,
            "wallet_address": citizen_wallet,
            "measured_weight_kg": 10.0,
        },
    )
    assert resp_replay.status_code == 400

    # 6. GET /api/citizen/<wallet>/status & GET /api/gametheory/simulate
    resp_status = client.get(f"/api/citizen/{citizen_wallet}/status")
    assert resp_status.status_code == 200
    st_json = resp_status.get_json()
    assert st_json["reputation_score"] == 57  # 52 + 5 = 57
    assert len(st_json["water_readings"]) == 2
    assert len(st_json["recycling_submissions"]) == 1
    assert len(st_json["penalties"]) == 1

    resp_sim = client.get("/api/gametheory/simulate?fraud_gain=60")
    assert resp_sim.status_code == 200
    assert resp_sim.get_json()["parameters"]["fraud_gain_assumed"] == 60.0

    # 7. POST /api/citizen/card/convert & POST /api/citizen/card/spend (BaaS Virtual Card Bridge)
    resp_conv = client.post(
        "/api/citizen/card/convert",
        json={
            "wallet_address": citizen_wallet,
            "belt_amount": 100.0,
            "tx_hash": "0x" + "a" * 64,
        },
    )
    assert resp_conv.status_code == 200
    c_json = resp_conv.get_json()
    assert c_json["status"] == "CONVERTED"
    assert c_json["fiat_added_try"] == 150.0  # 100 BELT * 1.50 TL = 150 TL
    assert c_json["card_balance_try"] == 375.0  # 225.0 başlangıç + 150.0 = 375.0 TL

    # MCC 9399 (Belediye Online Su/Vergi Veznesi) harcaması
    resp_spend = client.post(
        "/api/citizen/card/spend",
        json={
            "wallet_address": citizen_wallet,
            "amount_try": 125.0,
            "mcc_code": "9399",
            "merchant_name": "İSKİ / Kadıköy Belediyesi Online Su Veznesi",
        },
    )
    assert resp_spend.status_code == 200
    sp_json = resp_spend.get_json()
    assert sp_json["status"] == "APPROVED"
    assert sp_json["card_balance_try"] == 250.0
    assert sp_json["auth_code"].startswith("POS-")

    # Yasaklı MCC kodu (Örn: 7995 Bahis/Kumar) Green MCC Filter tarafından reddedilmeli
    resp_bad_mcc = client.post(
        "/api/citizen/card/spend",
        json={
            "wallet_address": citizen_wallet,
            "amount_try": 50.0,
            "mcc_code": "7995",
        },
    )
    assert resp_bad_mcc.status_code == 400
