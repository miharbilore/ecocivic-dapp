"""
Water Consumption Delta (Δ) Anomaly Detection Module
TÜBİTAK 2209-B: Kümülatif endeks hatası giderilerek Aylık Tüketim Farkı (Δ = I_t - I_{t-1}),
Z-Skoru ve Fiziksel Sayaç Müdahale (Rollback / Bypass) Analizi.
"""
from typing import Any, Dict, List, Optional
import numpy as np


DEFAULT_HISTORICAL_DELTAS = [14.0, 16.0, 15.0, 15.0]  # m3/ay


def extract_deltas_from_cumulative(readings: List[int]) -> List[float]:
    """Kümülatif sayaç okumalarından aylık tüketim farklarını (Δ) çıkarır."""
    if not readings or len(readings) < 2:
        return list(DEFAULT_HISTORICAL_DELTAS)
    deltas = []
    for i in range(1, len(readings)):
        diff = float(readings[i] - readings[i - 1])
        if diff >= 0:
            deltas.append(diff)
    return deltas if deltas else list(DEFAULT_HISTORICAL_DELTAS)


def analyze_consumption_delta(
    current_reading: int,
    previous_reading: int,
    historical_deltas: Optional[List[float]] = None,
    historical_cumulative_readings: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """
    Aylık tüketim farkı (Δ = current_reading - previous_reading) üzerinden
    istatistiksel Z-Score ve fiziksel anomali analizi yapar.
    """
    if current_reading is None or previous_reading is None:
        return {
            "valid": False,
            "is_anomaly": True,
            "fraud_suspected": False,
            "delta_m3": 0.0,
            "historical_mean_delta": 0.0,
            "historical_std_delta": 0.0,
            "z_score": 0.0,
            "relative_deviation": 1.0,
            "anomaly_score": 1.0,
            "reason": "Missing current or previous meter reading",
        }

    delta = float(current_reading - previous_reading)

    # Geçmiş aylık tüketim deltalarını hazırla
    if historical_deltas and len(historical_deltas) > 0:
        deltas = [float(d) for d in historical_deltas if d >= 0]
    elif historical_cumulative_readings and len(historical_cumulative_readings) >= 2:
        deltas = extract_deltas_from_cumulative(historical_cumulative_readings)
    else:
        deltas = list(DEFAULT_HISTORICAL_DELTAS)

    mean_delta = float(np.mean(deltas)) if deltas else 15.0
    raw_std = float(np.std(deltas)) if len(deltas) > 1 else 2.0
    # Aşırı sabit geçmişte sıfıra bölünmeyi önlemek için minimum efektif standart sapma
    effective_std = max(raw_std, 0.15 * mean_delta, 1.5)

    # 1. Fiziksel İmkansızlık: Sayaç geriye gitmişse (Δ < 0 -> Kesin Müdahale / Hile)
    if delta < 0:
        return {
            "valid": False,
            "is_anomaly": True,
            "fraud_suspected": True,
            "delta_m3": delta,
            "historical_mean_delta": round(mean_delta, 2),
            "historical_std_delta": round(effective_std, 2),
            "z_score": 10.0,
            "relative_deviation": round(abs(delta - mean_delta) / max(mean_delta, 1.0), 3),
            "anomaly_score": 1.0,
            "reason": "Negative consumption delta: Meter rollback or tampering detected",
        }

    # 2. Sıfır Tüketim (Bypass Şüphesi)
    if delta == 0 and mean_delta >= 5.0:
        return {
            "valid": False,
            "is_anomaly": True,
            "fraud_suspected": True,
            "delta_m3": 0.0,
            "historical_mean_delta": round(mean_delta, 2),
            "historical_std_delta": round(effective_std, 2),
            "z_score": round(mean_delta / effective_std, 2),
            "relative_deviation": 1.0,
            "anomaly_score": 0.82,
            "reason": "Zero consumption delta despite active historical usage (potential bypass)",
        }

    # 3. İstatistiksel Z-Skoru ve Oransal Sapma Analizi
    z_score = abs(delta - mean_delta) / effective_std
    relative_dev = abs(delta - mean_delta) / max(mean_delta, 1.0)

    # Normalize edilmiş anomali skoru [0.0, 1.0]
    anomaly_score = float(np.clip((z_score / 4.5) * 0.6 + (relative_dev / 1.2) * 0.4, 0.0, 1.0))

    # Şüpheli aşırı düşüş (örn. geçmiş ortalamanın %20'sinin altı -> kaçak hat şüphesi)
    if delta < 0.20 * mean_delta and mean_delta >= 10.0:
        return {
            "valid": False,
            "is_anomaly": True,
            "fraud_suspected": True,
            "delta_m3": round(delta, 2),
            "historical_mean_delta": round(mean_delta, 2),
            "historical_std_delta": round(effective_std, 2),
            "z_score": round(z_score, 2),
            "relative_deviation": round(relative_dev, 3),
            "anomaly_score": round(max(anomaly_score, 0.78), 3),
            "reason": "Abnormally low consumption delta (<20% of historical average)",
        }

    # Aşırı sıçrama (örn. boru patlağı veya OCR yanlış okuma: Z > 3.2 ve sapma > %75)
    if z_score > 3.2 and relative_dev > 0.75:
        return {
            "valid": False,
            "is_anomaly": True,
            "fraud_suspected": False,
            "delta_m3": round(delta, 2),
            "historical_mean_delta": round(mean_delta, 2),
            "historical_std_delta": round(effective_std, 2),
            "z_score": round(z_score, 2),
            "relative_deviation": round(relative_dev, 3),
            "anomaly_score": round(max(anomaly_score, 0.75), 3),
            "reason": "Extreme consumption spike detected (leakage or OCR misread)",
        }

    return {
        "valid": True,
        "is_anomaly": False,
        "fraud_suspected": False,
        "delta_m3": round(delta, 2),
        "historical_mean_delta": round(mean_delta, 2),
        "historical_std_delta": round(effective_std, 2),
        "z_score": round(z_score, 2),
        "relative_deviation": round(relative_dev, 3),
        "anomaly_score": round(anomaly_score, 3),
        "reason": None,
    }


def check_anomaly(
    current_index: int,
    historical_indexes: List[int],
    previous_index: Optional[int] = None,
) -> bool:
    """
    Geriye dönük uyumlu yardımcı fonksiyon: Kümülatif listeden aylık deltaları çıkarır
    ve son okumaya göre Δ bazlı anomali kontrolü yapar.
    """
    if current_index is None or not historical_indexes:
        return False

    prev = previous_index if previous_index is not None else historical_indexes[-1]
    analysis = analyze_consumption_delta(
        current_reading=current_index,
        previous_reading=prev,
        historical_cumulative_readings=historical_indexes,
    )
    return bool(analysis["valid"])
