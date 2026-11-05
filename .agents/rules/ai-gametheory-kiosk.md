---
trigger: always_on
description: AI 2D FFT Anti-Spoofing + CLAHE pipeline, Tüketim Deltası (Δ) Z-Score analizi, Oyun Teorisi Nash dengesi (p*) ve Raspberry Pi Kiosk HAL kuralları.
---

# AI Oracle, Game Theory & Edge Kiosk HAL Rules

## 1. 5 Aşamalı Görüntü İşleme ve 2D FFT Anti-Spoofing (`backend-ai/ai/`)

Su sayacı fotoğraf beyanlarında (`services/water_validation.py`, `ai/model_utils.py`, `ai/ocr.py`) aşağıdaki 5 aşamalı doğrulama hattı zorunludur:

1. **2D FFT Spektral Moiré Anti-Spoofing:** Görüntüye 2 boyutlu Hızlı Fourier Dönüşümü (`np.fft.fft2` + `fftshift`) uygulanarak yüksek frekanslı Moiré ızgara enerjisi, HSV doygunluk dağılımı ve ekran parlama/kontrast anomalileri analiz edilir. Başka bir ekrandan (screen-replay) veya kağıt çıktıdan çekilen sahte görüntülerde `is_spoofed = True` döndürülür ve denetim olasılığı doğrudan $p^* \ge 0.95$ seviyesine çıkarılır.
2. **OpenCV Ön İşleme Hattı:** Gerçek görüntüler sırasıyla `Grayscale -> Bilateral Filter -> CLAHE (Contrast Limited Adaptive Histogram Equalization) -> Adaptive Threshold` adımlarından geçirilir.
3. **OCR Strategy Pattern:** `ai/ocr.py` içinde `TesseractDigitsStrategy` (birincil) ve `DeterministicFallbackStrategy` (Tesseract binary bulunmayan test/CI ortamları için deterministik yedek) mimarisi korunmalıdır.

## 2. Kümülatif Endeks Değil, Aylık Tüketim Deltası ($\Delta$) Analizi (`ai/anomaly_detection.py`)

- Su tüketim anomalisi **asla** ham kümülatif sayaç endeksi ($C_t$) üzerinden hesaplanmaz; her zaman **aylık tüketim deltası ($\Delta_t = C_t - C_{t-1}$)** üzerinden analiz edilir.
- **Sayaç Geri Sarma ($\Delta_t < 0$):** Mevcut endeksin önceki endeksten küçük olması doğrudan fiziksel sayaç manipülasyonu/geri sarma olarak işaretlenir (`ROLLBACK_DETECTED`).
- **İstatistiksel Z-Score ve Ani Düşüş Analizi:** Hanenin geçmiş $\Delta$ serisinin ortalaması ($\mu_\Delta$) ve standart sapması ($\sigma_\Delta$) üzerinden $Z = \frac{\Delta_t - \mu_\Delta}{\sigma_\Delta}$ hesaplanır. $|Z| > 2.5$ veya geçmiş ortalamaya göre $\ge \%70$ şüpheli ani düşüşler anomali bayrağı (`I_AI = 1`) üretir.

## 3. Oyun Teorisi ve Karma Strateji Nash Dengesi Motoru (`services/game_theory_engine.py`)

Belediye Denetçisi ile Vatandaş arasındaki **2x2 Denetim Oyunu (Inspection Game)** formülleri tüm backend ve simülasyon katmanlarında tutarlı olmalıdır:

- **Dinamik Minimum Teminat ($S_{\text{req}}$):**
  $$S_{\text{req}}(R_i) = S_{\text{base}} \cdot \frac{100}{\max(R_i, 25)}, \quad S_{\text{base}} = 100\text{ USDC}$$
- **İtibar Tabanlı Ödül Çarpanı ($\mu_R$):**
  $$\mu_R(R_i) = 0.50 + 1.50 \cdot \left(\frac{R_i}{1000}\right) \in [0.50\text{x}, 2.00\text{x}]$$
- **Karma Strateji Nash Dengesi Denetim Olasılığı ($p^*$):**
  $$p^*(R_i) = \gamma(R_i) \cdot \frac{G}{G + \lambda \cdot S_{\text{req}}(R_i)}, \quad \gamma(R_i) = \max\left(0.30,\; 1 - \frac{R_i}{1500}\right)$$
- **AI Destekli Hibrit Denetim Olasılığı ($p_{\text{hybrid}}$):**
  AI Oracle anomali sinyali ($I_{\text{AI}} = 1$) ürettiğinde denetim olasılığı $\max(p^*(R_i),\, 0.88)$ (spoof tespitinde $\ge 0.95$) olarak uygulanır.

## 4. Raspberry Pi Kiosk HAL ve Offline-First Kuyruk (`kiosk-hardware/`)

- **Hardware Abstraction Layer (HAL):** `kiosk_daemon.py` içindeki `HardwareAdapter` soyutlaması korunmalıdır. Fiziksel Raspberry Pi üzerinde `RaspberryPiHardwareAdapter` (`RPi.GPIO` + `HX711` 24-bit Load-Cell ADC medyan filtreli gram ölçümü), geliştirme ve CI/CD ortamlarında ise `MockHardwareAdapter` kesintisiz çalışmalıdır.
- **Fiziksel Tartım Doğrulaması:** Beyan edilen atık ağırlığı ile Load-Cell ölçümü arasında $\pm\%15$ sapma toleransı ve maksimum $25.000\text{ g}$ ($25\text{ kg}$) kapasite sınırı uygulanır.
- **ESC/POS Termal Yazıcı ve Offline-First Kuyruk:**
  - `escpos_driver.py` 80mm/58mm binary `ESC/POS` komutlarını (native QR + Code128 barkod) standartlara uygun üretmelidir.
  - Saha interneti kesildiğinde işlemler `HMAC-SHA256` imzalı olarak `offline_queue.json` dosyasına kaydedilmeli ve bağlantı geldiğinde `/api/kiosk/sync-offline` üzerinden bütünlük doğrulamasıyla senkronize edilmelidir.
