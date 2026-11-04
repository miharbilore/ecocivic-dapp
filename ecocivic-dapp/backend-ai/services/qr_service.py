"""
QR Token & Kiosk ESC/POS Thermal Receipt Service
Geri dönüşüm QR kodları için kriptografik HMAC/SHA-256 token oluşturma,
doğrulama ve Raspberry Pi Kiosk Termal Yazıcı (ESC/POS) fiş üretimi servisi.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from config import QR_SECRET_KEY, QR_TOKEN_EXPIRY_HOURS


def generate_qr_token(
    material_type: str,
    amount: float,
    wallet_address: str,
) -> Dict[str, Any]:
    """
    Vatandaşın geri dönüşüm beyanı için kriptografik imzalı QR token oluşturur.
    """
    mat = (material_type or "").strip().lower()
    if mat not in ["glass", "paper", "metal"]:
        raise ValueError("Invalid material type. Must be glass, paper, or metal.")

    amt = float(amount or 0)
    if amt <= 0 or amt > 1000:
        raise ValueError("Amount must be between 0.1 and 1000 kg")

    if not wallet_address or not wallet_address.startswith("0x") or len(wallet_address) != 42:
        raise ValueError("Invalid Ethereum wallet address")

    token_id = secrets.token_urlsafe(24)
    now_utc = datetime.now(timezone.utc)
    expires_at = now_utc + timedelta(hours=QR_TOKEN_EXPIRY_HOURS)

    payload = f"{token_id}:{mat}:{amt:.2f}:{wallet_address.lower()}:{expires_at.isoformat()}"
    token_hash = hashlib.sha256(f"{payload}:{QR_SECRET_KEY}".encode("utf-8")).hexdigest()

    return {
        "token_id": token_id,
        "material_type": mat,
        "amount": round(amt, 2),
        "wallet_address": wallet_address,
        "expires_at": expires_at.isoformat(),
        "hash": token_hash,
        "created_at": now_utc.isoformat(),
    }


def verify_qr_token(token_data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    QR token'ın bütünlüğünü (SHA-256) ve geçerlilik süresini doğrular.
    """
    try:
        required_fields = [
            "token_id",
            "material_type",
            "amount",
            "wallet_address",
            "expires_at",
            "hash",
        ]
        for field in required_fields:
            if field not in token_data:
                return False, f"Missing required field: {field}"

        expires_at = datetime.fromisoformat(str(token_data["expires_at"]))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if datetime.now(timezone.utc) > expires_at:
            return False, "QR token expired"

        mat = str(token_data["material_type"]).strip().lower()
        amt = float(token_data["amount"])
        wallet = str(token_data["wallet_address"]).lower()

        payload = f"{token_data['token_id']}:{mat}:{amt:.2f}:{wallet}:{token_data['expires_at']}"
        expected_hash = hashlib.sha256(f"{payload}:{QR_SECRET_KEY}".encode("utf-8")).hexdigest()

        if token_data["hash"] != expected_hash:
            return False, "Invalid QR token cryptographic hash"

        if mat not in ["glass", "paper", "metal"]:
            return False, "Invalid material type"

        if amt <= 0 or amt > 1000:
            return False, "Invalid amount"

        return True, None
    except Exception as exc:
        return False, f"Token verification failed: {str(exc)}"


def build_escpos_thermal_receipt(
    kiosk_id: str,
    wallet_address: str,
    material_type: str,
    measured_weight_kg: float,
    reward_belt: float,
    reputation_score: int,
    qr_hash: str,
    nonce: int,
) -> Dict[str, Any]:
    """
    Raspberry Pi Atık Beyan Kiosku üzerindeki Termal Yazıcı (ESC/POS protokolü)
    için fiş verisini ve donanım komut özetini üretir.
    """
    timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    short_wallet = f"{wallet_address[:6]}...{wallet_address[-4:]}"
    short_hash = f"{qr_hash[:10]}...{qr_hash[-6:]}"

    receipt_lines = [
        "========================================",
        "      ECOCIVIC AKILLI SEHIR KIOSKU      ",
        f"Kiosk ID  : {kiosk_id}",
        f"Tarih     : {timestamp_str}",
        "----------------------------------------",
        f"Vatandas  : {short_wallet}",
        f"Itibar Ri : {reputation_score} Puan",
        f"Atik Turu : {material_type.upper()}",
        f"Agirlik   : {measured_weight_kg:.2f} kg (Load-Cell Onayli)",
        f"Kazanilan : {reward_belt:.2f} BELT Token",
        "----------------------------------------",
        f"Voucher # : {nonce}",
        f"QR Hash   : {short_hash}",
        "Durum     : EIP-712 IMZALANDI (ON-CHAIN)",
        "========================================",
    ]

    return {
        "kiosk_id": kiosk_id,
        "protocol": "ESC/POS-80mm",
        "escpos_hex_header": "1b401b6101",  # ESC @ (Init), ESC a 1 (Center align)
        "escpos_cut_command": "1d564100",   # GS V A 0 (Full paper cut)
        "printable_text": "\n".join(receipt_lines),
        "qr_payload_for_print": qr_hash,
        "timestamp": timestamp_str,
    }
