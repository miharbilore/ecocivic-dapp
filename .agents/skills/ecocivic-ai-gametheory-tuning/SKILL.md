---
name: ecocivic-ai-gametheory-tuning
description: >-
  EcoCivic Python/Flask Backend AI Oracle katmanında 2D FFT Moiré Anti-Spoofing, CLAHE + OCR,
  aylık tüketim deltası (Δ) Z-Score anomali tespiti, Karma Strateji Nash Dengesi (p*) motoru ve
  10.000 haneli Q1/Q2 Monte Carlo akademik makale simülasyonu (academic_paper_sim.py) geliştirmesi için kullanılır.
---

# EcoCivic AI Oracle, Game Theory & Academic Simulation Skill

## Ne Zaman Kullanılır?
- `ecocivic-dapp/backend-ai/` altındaki görüntü işleme (`ai/model_utils.py`, `ai/ocr.py`), anomali tespiti (`ai/anomaly_detection.py`) veya oyun teorisi motorunda (`services/game_theory_engine.py`) değişiklik yapılacağında.
- `simulations/academic_paper_sim.py` veya `docs/academic-simulation-results.md` üzerinde akademik deney, LaTeX tablo veya duyarlılık (sensitivity) analizi güncelleneceğinde.

## 1. Görüntü İşleme ve Anti-Spoofing Pipeline (`backend-ai/ai/`)

1. **2D FFT Spektral Moiré Analizi (`ai/model_utils.py`):**
   - `detect_screen_spoofing(image)` fonksiyonu 2 boyutlu FFT frekans spektrumunda yüksek frekans enerji oranını, Moiré ızgara tepelerini ve HSV doygunluk/parlama anomalilerini ölçer.
   - Spoof tespitinde `is_spoofed = True` döner ve `services/water_validation.py` içinde denetim olasılığı $p^* \ge 0.95$ olarak kilitlenir.
2. **Ön İşleme ve OCR Strategy (`ai/ocr.py`):**
   - Görüntü ön işleme sırası: `Grayscale -> Bilateral Filter -> CLAHE -> Adaptive Threshold`.
   - `WaterMeterOCR` sınıfı `TesseractDigitsStrategy` ile okuma yapar; Tesseract binary yoksa `DeterministicFallbackStrategy` devreye girer.

## 2. Tüketim Deltası ($\Delta$) ve Oyun Teorisi Motoru (`backend-ai/services/`)

1. **Aylık Tüketim Deltası ($\Delta_t = C_t - C_{t-1}$):**
   - `ai/anomaly_detection.py` kümülatif endeks yerine aylık $\Delta_t$ değerini analiz eder.
   - $\Delta_t < 0$: Fiziksel sayaç geri sarma (`ROLLBACK_DETECTED`).
   - $|Z| > 2.5$ veya geçmiş ortalamaya göre $\ge \%70$ ani düşüş: İstatistiksel anomali bayrağı (`I_AI = 1`).
2. **Nash Dengesi ve Teşvik Uyumluluk Kısıtı (`services/game_theory_engine.py`):**
   - $S_{\text{req}}(R_i) = 100 \cdot \frac{100}{\max(R_i, 25)}$ USDC.
   - $\mu_R(R_i) = 0.50 + 1.50 \cdot (R_i / 1000)$.
   - $p^*(R_i) = \gamma(R_i) \cdot \frac{G}{G + \lambda \cdot S_{\text{req}}(R_i)}$ ve AI anomali durumunda $p_{\text{hybrid}} = \max(p^*(R_i), 0.88)$.

## 3. Doğrulama Komutları

Değişiklik sonrası her zaman çalıştır:
```bash
cd ecocivic-dapp/backend-ai
python -m pytest tests/test_backend_ai.py -v
python simulations/academic_paper_sim.py
```
