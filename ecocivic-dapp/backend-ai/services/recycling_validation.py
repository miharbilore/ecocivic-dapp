"""
Recycling Validation & Kiosk Load-Cell Verification Service
Geri dönüşüm QR doğrulama, Load-Cell (Tartı) sensörü karşılaştırma ve
İtibar Skoru (R_i) çarpanlı ödül hesaplama servisi.
"""
from typing import Any, Dict, Optional
from services.qr_service import verify_qr_token
from services.game_theory_engine import compute_reputation_metrics


MATERIAL_MULTIPLIERS = {
    "glass": 1.0,
    "paper": 1.5,
    "metal": 2.0,
}


def validate_recycling_submission(
    material_type: str,
    qr_token: Dict[str, Any],
    wallet_address: str,
    measured_weight_kg: Optional[float] = None,
    reputation_score: int = 100,
) -> Dict[str, Any]:
    """
    Geri dönüşüm gönderimini ve Kiosk Load-Cell ağırlığını doğrular.
    """
    mat = (material_type or "").strip().lower()
    if mat not in MATERIAL_MULTIPLIERS:
        return {"valid": False, "error": "Invalid material type"}

    if not wallet_address or not wallet_address.startswith("0x") or len(wallet_address) != 42:
        return {"valid": False, "error": "Invalid wallet address"}

    is_valid, error_msg = verify_qr_token(qr_token)
    if not is_valid:
        return {"valid": False, "error": error_msg or "QR token verification failed"}

    if qr_token.get("wallet_address", "").lower() != wallet_address.lower():
        return {"valid": False, "error": "Wallet address mismatch"}

    if qr_token.get("material_type", "").lower() != mat:
        return {"valid": False, "error": "Material type mismatch"}

    declared_amount = float(qr_token.get("amount", 0))
    actual_weight = float(measured_weight_kg) if measured_weight_kg is not None else declared_amount

    if actual_weight <= 0 or actual_weight > 1000:
        return {"valid": False, "error": "Invalid measured weight on load-cell"}

    # Beyan edilen ağırlık ile Kiosk tartısı (Load-cell) arasında >%35 fark varsa hile/anomali
    weight_discrepancy = abs(actual_weight - declared_amount) / max(declared_amount, 0.1)
    if weight_discrepancy > 0.35:
        return {
            "valid": False,
            "anomaly_detected": True,
            "error": (
                f"Load-cell weight discrepancy too high: declared {declared_amount} kg "
                f"vs measured {actual_weight} kg"
            ),
        }

    material_multiplier = MATERIAL_MULTIPLIERS[mat]
    base_reward = actual_weight * material_multiplier

    rep_metrics = compute_reputation_metrics(reputation_score)
    rep_multiplier = rep_metrics["reward_multiplier"]
    final_reward = round(base_reward * rep_multiplier, 4)

    return {
        "valid": True,
        "anomaly_detected": False,
        "material_type": mat,
        "declared_amount_kg": declared_amount,
        "measured_weight_kg": actual_weight,
        "material_multiplier": material_multiplier,
        "reputation_score": rep_metrics["reputation_score"],
        "reputation_multiplier": rep_multiplier,
        "base_reward_belt": round(base_reward, 4),
        "reward_amount": final_reward,
        "qr_hash": qr_token.get("hash"),
        "qr_token_id": qr_token.get("token_id"),
    }
