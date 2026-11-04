"""
Water Validation & Saving-Based Reward Calculation Service
WaterBilling.sol kontratındaki Ters Teşvik (Perverse Incentive) düzeltmeli
tasarruf ödülü ve fatura hesaplama modeliyle birebir uyumlu servis.
"""
from typing import Any, Dict, Optional
from services.game_theory_engine import compute_reputation_metrics


DEFAULT_BASELINE_M3 = 20.0
BASE_DECLARATION_REWARD_BELT = 10.0
SAVING_BONUS_PER_M3_BELT = 5.0


def calculate_water_bill(
    current_index: int,
    previous_index: Optional[int] = None,
    historical_avg_m3: Optional[float] = None,
    reputation_score: int = 100,
    price_per_m3: float = 5.0,
) -> Dict[str, Any]:
    """
    Su faturasını ve su tasarrufu + İtibar Skoru (R_i) bazlı BELT ödülünü hesaplar.
    """
    if current_index is None or current_index < 0:
        return {"valid": False, "error": "Invalid current index"}

    if previous_index is not None:
        if previous_index < 0:
            return {"valid": False, "error": "Invalid previous index"}
        if current_index < previous_index:
            return {
                "valid": False,
                "error": "Current index cannot be less than previous index (meter rollback)",
            }
        consumption = float(current_index - previous_index)
    else:
        consumption = float(current_index)

    reference_avg = (
        float(historical_avg_m3)
        if (historical_avg_m3 is not None and historical_avg_m3 > 0)
        else DEFAULT_BASELINE_M3
    )

    saved_m3 = max(0.0, reference_avg - consumption)
    saving_bonus = saved_m3 * SAVING_BONUS_PER_M3_BELT
    raw_reward = BASE_DECLARATION_REWARD_BELT + saving_bonus

    rep_metrics = compute_reputation_metrics(reputation_score)
    rep_multiplier = rep_metrics["reward_multiplier"]
    final_reward = round(raw_reward * rep_multiplier, 4)

    bill_amount = round(consumption * price_per_m3, 2)

    return {
        "valid": True,
        "current_index": int(current_index),
        "previous_index": int(previous_index) if previous_index is not None else 0,
        "consumption_m3": round(consumption, 2),
        "reference_avg_m3": round(reference_avg, 2),
        "saved_m3": round(saved_m3, 2),
        "bill_amount": bill_amount,
        "base_reward_belt": BASE_DECLARATION_REWARD_BELT,
        "saving_bonus_belt": round(saving_bonus, 4),
        "reputation_score": rep_metrics["reputation_score"],
        "reputation_multiplier": rep_multiplier,
        "reward_amount": final_reward,
        "price_per_m3": price_per_m3,
    }
