"""
Game Theory Autonomous Inspection Engine (2x2 Mixed-Strategy Inspection Game)
TÜBİTAK 2209-B: Akıllı Şehirlerde Hibrit Güven Modeli - Nash Dengesi Denetim Olasılığı (p*),
Beklenen Fayda Analizi (E[U_honest] vs E[U_cheat]) ve Dinamik Teminat/Ödül Optimizasyonu.
"""
import secrets
from typing import Any, Dict, List, Optional


P_BASE = 0.20          # R_i = 100 için baz denetim olasılığı (%20)
ALPHA_ANOMALY = 0.65   # Anomali skoru katsayısı
BETA_CONFIDENCE = 0.40 # Düşük OCR güveni ceza katsayısı
P_MIN = 0.02           # Minimum otonom örnekleme olasılığı (%2)
P_MAX = 1.00           # Maksimum denetim olasılığı (%100)
ANOMALY_AUDIT_THRESHOLD = 0.60
CONFIDENCE_MIN_THRESHOLD = 0.70

BASE_REQUIRED_STAKE_USDC = 1000.0
INITIAL_REPUTATION = 100


def clamp(val: float, low: float, high: float) -> float:
    return max(low, min(high, val))


def compute_nash_audit_probability(
    reputation_score: int,
    anomaly_score: float,
    confidence_score: float = 0.90,
) -> float:
    """
    Nash Dengesi Denetim Olasılığı Formülü:
    p*(R_i, AnomalyScore) = clamp((p_base * 100 / R_i) + alpha * AnomalyScore + beta * max(0, 0.85 - Confidence), 0.02, 1.0)
    """
    rep = max(10, min(1000, int(reputation_score or INITIAL_REPUTATION)))
    anom = clamp(float(anomaly_score or 0.0), 0.0, 1.0)
    conf = clamp(float(confidence_score if confidence_score is not None else 0.90), 0.0, 1.0)

    reputation_component = (P_BASE * INITIAL_REPUTATION) / float(rep)
    anomaly_component = ALPHA_ANOMALY * anom
    confidence_penalty = BETA_CONFIDENCE * max(0.0, 0.85 - conf)

    p_star = clamp(reputation_component + anomaly_component + confidence_penalty, P_MIN, P_MAX)
    return round(p_star, 4)


def compute_reputation_metrics(reputation_score: int) -> Dict[str, float]:
    """
    Akıllı kontrat (CitizenReputation.sol) ile birebir uyumlu:
    - Gerekli Teminat: S_req(R_i) = (S_base * 100) / R_i
    - Ödül Çarpanı: R_i <= 100 için R_i/100, R_i > 100 için 1.0 + (R_i - 100)*0.001
    """
    rep = max(10, min(1000, int(reputation_score or INITIAL_REPUTATION)))
    required_stake = (BASE_REQUIRED_STAKE_USDC * INITIAL_REPUTATION) / float(rep)

    if rep <= INITIAL_REPUTATION:
        reward_multiplier = float(rep) / float(INITIAL_REPUTATION)
    else:
        reward_multiplier = 1.0 + ((rep - INITIAL_REPUTATION) * 0.001)

    return {
        "reputation_score": rep,
        "required_stake_usdc": round(required_stake, 2),
        "reward_multiplier": round(reward_multiplier, 4),
        "reward_multiplier_bps": int(round(reward_multiplier * 10000)),
    }


def evaluate_inspection_game(
    reputation_score: int = 100,
    anomaly_score: float = 0.0,
    confidence_score: float = 0.90,
    spoof_detected: bool = False,
    fraud_gain_estimate: float = 40.0,
    base_honest_reward: float = 25.0,
    random_draw_override: Optional[float] = None,
) -> Dict[str, Any]:
    """
    2x2 Karma Stratejili Denetim Oyunu (Citizen vs Municipal AI Auditor) Karar Motoru.
    Beklenen faydaları (E[U_honest] vs E[U_cheat]) ve fiziksel zabıta teftişi
    ('AUDIT_REQUIRED') kararını üretir.
    """
    rep_metrics = compute_reputation_metrics(reputation_score)
    rep = rep_metrics["reputation_score"]
    required_stake = rep_metrics["required_stake_usdc"]
    reward_multiplier = rep_metrics["reward_multiplier"]

    if spoof_detected:
        p_star = 1.0
    else:
        p_star = compute_nash_audit_probability(
            reputation_score=rep,
            anomaly_score=anomaly_score,
            confidence_score=confidence_score,
        )

    # Kriptografik güvenli rastgele çekiliş [0.0, 1.0)
    if random_draw_override is not None:
        random_draw = clamp(float(random_draw_override), 0.0, 0.9999)
    else:
        random_draw = (secrets.randbelow(10000)) / 10000.0

    # Fiziksel Denetim Kararı (AUDIT_REQUIRED)
    threshold_triggered = (
        spoof_detected
        or anomaly_score >= ANOMALY_AUDIT_THRESHOLD
        or confidence_score < CONFIDENCE_MIN_THRESHOLD
    )
    stochastic_triggered = random_draw < p_star
    audit_required = bool(threshold_triggered or stochastic_triggered)

    if spoof_detected:
        decision_status = "SLASHING_SIGNAL_SPOOF"
        audit_reason = "Anti-spoofing failure: Digital screen recapture or manipulated image"
    elif anomaly_score >= ANOMALY_AUDIT_THRESHOLD:
        decision_status = "AUDIT_REQUIRED"
        audit_reason = f"High consumption delta anomaly score ({anomaly_score:.2f} >= {ANOMALY_AUDIT_THRESHOLD})"
    elif confidence_score < CONFIDENCE_MIN_THRESHOLD:
        decision_status = "AUDIT_REQUIRED"
        audit_reason = f"Low OCR confidence ({confidence_score:.2f} < {CONFIDENCE_MIN_THRESHOLD})"
    elif stochastic_triggered:
        decision_status = "AUDIT_REQUIRED"
        audit_reason = f"Nash Equilibrium stochastic inspection triggered (draw={random_draw:.3f} < p*={p_star:.3f})"
    else:
        decision_status = "AUTONOMOUS_APPROVED"
        audit_reason = "Passed AI verification and stochastic game theory threshold"

    # Beklenen Fayda Hesabı (Expected Utility Analysis for Q1/Q2 Publication)
    # Slashing cezası: Teminatın %30'u + İtibarın %50 düşmesinden doğan gelecek ödül kaybı
    slash_penalty_value = 0.30 * required_stake + (0.50 * rep * 0.5)
    expected_utility_honest = round(base_honest_reward * reward_multiplier + (5 * 0.5), 2)
    expected_utility_cheat = round(
        (1.0 - p_star) * fraud_gain_estimate - p_star * slash_penalty_value,
        2,
    )

    # Teşvik Uyumluluk Kısıtı (Incentive Compatibility: E[U_honest] >= E[U_cheat])
    critical_audit_prob = round(
        fraud_gain_estimate / max(fraud_gain_estimate + slash_penalty_value, 1.0),
        4,
    )
    incentive_compatible = expected_utility_honest >= expected_utility_cheat

    return {
        "decision": decision_status,
        "audit_required": audit_required,
        "audit_reason": audit_reason,
        "nash_audit_probability": p_star,
        "nash_audit_probability_bps": int(round(p_star * 10000)),
        "critical_deterrence_probability": critical_audit_prob,
        "random_draw": round(random_draw, 4),
        "reputation_score": rep,
        "required_stake_usdc": required_stake,
        "reward_multiplier": reward_multiplier,
        "reward_multiplier_bps": rep_metrics["reward_multiplier_bps"],
        "expected_utility_honest": expected_utility_honest,
        "expected_utility_cheat": expected_utility_cheat,
        "slash_penalty_equivalent": round(slash_penalty_value, 2),
        "incentive_compatible": incentive_compatible,
    }


def simulate_inspection_game_matrix(
    reputation_levels: Optional[List[int]] = None,
    anomaly_levels: Optional[List[float]] = None,
    fraud_gain: float = 50.0,
) -> Dict[str, Any]:
    """
    Akademik makale simülasyonu ve Yönetim Paneli için farklı R_i ve Anomali
    senaryolarında Nash Dengesi Denetim Olasılığı (p*) ve Beklenen Fayda matrisini üretir.
    """
    rep_list = reputation_levels or [25, 50, 100, 200, 500, 1000]
    anom_list = anomaly_levels or [0.0, 0.25, 0.50, 0.75, 1.0]

    matrix: List[Dict[str, Any]] = []
    for r_i in rep_list:
        row_scenarios = []
        for anom in anom_list:
            eval_res = evaluate_inspection_game(
                reputation_score=r_i,
                anomaly_score=anom,
                confidence_score=0.92,
                fraud_gain_estimate=fraud_gain,
                random_draw_override=0.50,
            )
            row_scenarios.append(
                {
                    "anomaly_score": anom,
                    "nash_audit_probability": eval_res["nash_audit_probability"],
                    "expected_utility_honest": eval_res["expected_utility_honest"],
                    "expected_utility_cheat": eval_res["expected_utility_cheat"],
                    "incentive_compatible": eval_res["incentive_compatible"],
                    "audit_required_at_median_draw": eval_res["audit_required"],
                }
            )
        rep_meta = compute_reputation_metrics(r_i)
        matrix.append(
            {
                "reputation_score": r_i,
                "required_stake_usdc": rep_meta["required_stake_usdc"],
                "reward_multiplier": rep_meta["reward_multiplier"],
                "scenarios": row_scenarios,
            }
        )

    return {
        "model": "2x2 Mixed-Strategy Municipal Inspection Game",
        "parameters": {
            "p_base": P_BASE,
            "alpha_anomaly": ALPHA_ANOMALY,
            "beta_confidence": BETA_CONFIDENCE,
            "base_required_stake_usdc": BASE_REQUIRED_STAKE_USDC,
            "fraud_gain_assumed": fraud_gain,
        },
        "matrix": matrix,
    }
