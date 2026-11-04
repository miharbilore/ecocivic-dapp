"""
AI Model & Image Processing Utilities (OpenCV Pipeline & Anti-Spoofing)
TÜBİTAK 2209-B: Görüntü Canlılık/Sahtecilik (Moiré & FFT) Analizi ve Ön İşleme Hattı
"""
import os
import logging
from typing import Dict, Any, Optional

import cv2
import numpy as np
from PIL import Image, ExifTags, UnidentifiedImageError

logger = logging.getLogger("ecocivic-ai-utils")


def load_image_unicode_safe(image_path: str) -> np.ndarray:
    """
     Türkçe/Unicode karakter içeren dosya yollarında OpenCV (cv2.imread) hatasını
    önlemek için numpy.fromfile + cv2.imdecode ile güvenli okuma yapar.
    """
    if not image_path or not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")

    raw_bytes = np.fromfile(image_path, dtype=np.uint8)
    img = cv2.imdecode(raw_bytes, cv2.IMREAD_COLOR)
    if img is None:
        # Fallback to Pillow
        with Image.open(image_path) as pil_img:
            rgb = pil_img.convert("RGB")
            img = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    return img


def check_image_authenticity(image_path: str) -> Dict[str, Any]:
    """
    1. Adım: Anti-Spoofing / Canlılık ve Sahtecilik Kontrolü
    - 2D Fast Fourier Transform (FFT) ile yüksek frekanslı Moiré (ekrandan fotoğraf çekme)
      periyodik ızgara/piksel tepelerini analiz eder.
    - Aşırı düşük veya aşırı doygun kontrast varyansını (siyah ekran / boş kağıt) denetler.
    - EXIF / Yazılım (Screenshot / Manipülasyon) etiketlerini kontrol eder.
    """
    if not image_path or not os.path.exists(image_path):
        return {
            "is_authentic": False,
            "spoof_detected": True,
            "authenticity_score": 0.0,
            "moire_score": 1.0,
            "contrast_std": 0.0,
            "reason": "Image file not found",
        }

    try:
        # EXIF ve Metadata kontrolü
        software_tag = ""
        with Image.open(image_path) as pil_img:
            exif_data = pil_img.getexif()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                    if tag_name == "Software" and isinstance(value, str):
                        software_tag = value.lower()
            info_software = str(pil_img.info.get("Software", "")).lower()
            software_tag = f"{software_tag} {info_software}".strip()

        if any(s in software_tag for s in ["screenshot", "snipping", "gimp", "photoshop", "spoof"]):
            return {
                "is_authentic": False,
                "spoof_detected": True,
                "authenticity_score": 0.10,
                "moire_score": 0.85,
                "contrast_std": 0.0,
                "reason": "Screen capture or image manipulation metadata detected",
            }

        img_bgr = load_image_unicode_safe(image_path)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # 1. Kontrast ve Parlaklık Varyansı Kontrolü
        contrast_std = float(np.std(gray))
        if contrast_std < 8.0:
            return {
                "is_authentic": False,
                "spoof_detected": True,
                "authenticity_score": 0.05,
                "moire_score": 0.0,
                "contrast_std": round(contrast_std, 2),
                "reason": "Abnormal low contrast variance (blank, covered, or uniform frame)",
            }

        # 2. Yüksek Frekanslı 2D FFT Moiré Pattern & Ekran Izgarası Analizi
        resized = cv2.resize(gray, (256, 256))
        f_transform = np.fft.fft2(resized.astype(np.float32))
        f_shift = np.fft.fftshift(f_transform)
        magnitude_spectrum = np.log1p(np.abs(f_shift))

        # Merkez (DC bileşen) maskelenerek orta-yüksek frekans halkasındaki ani pikler ölçülür
        h, w = magnitude_spectrum.shape
        cy, cx = h // 2, w // 2
        y_grid, x_grid = np.ogrid[:h, :w]
        dist_from_center = np.sqrt((x_grid - cx) ** 2 + (y_grid - cy) ** 2)

        high_freq_ring = (dist_from_center >= 28) & (dist_from_center <= 115)
        ring_values = magnitude_spectrum[high_freq_ring]

        mean_energy = float(np.mean(ring_values)) + 1e-6
        std_energy = float(np.std(ring_values)) + 1e-6
        max_peak = float(np.max(ring_values))

        # Periyodik ızgara (Moiré / dijital piksel matrisi) keskin tepe (peak-to-mean Z-score) üretir
        peak_z = (max_peak - mean_energy) / std_energy

        # Piksel komşuluk farklarında periyodik testere dişi (checkerboard/screen grid) kontrolü
        diff_x = np.abs(np.diff(resized.astype(np.float32), axis=1))
        diff_y = np.abs(np.diff(resized.astype(np.float32), axis=0))
        grid_periodicity = float(np.std(np.mean(diff_x, axis=0)) + np.std(np.mean(diff_y, axis=1)))

        moire_score = float(np.clip((peak_z - 3.2) / 4.5 + (grid_periodicity / 90.0), 0.0, 1.0))

        # Ekran tekrarı (Recapture) / Moiré eşik kontrolü
        if grid_periodicity > 38.0 or moire_score > 0.78:
            return {
                "is_authentic": False,
                "spoof_detected": True,
                "authenticity_score": round(max(0.05, 1.0 - moire_score), 3),
                "moire_score": round(moire_score, 3),
                "contrast_std": round(contrast_std, 2),
                "reason": "Moiré pattern or digital screen recapture artifact detected",
            }

        authenticity_score = float(np.clip(1.0 - (moire_score * 0.5), 0.5, 0.99))
        return {
            "is_authentic": True,
            "spoof_detected": False,
            "authenticity_score": round(authenticity_score, 3),
            "moire_score": round(moire_score, 3),
            "contrast_std": round(contrast_std, 2),
            "reason": None,
        }

    except (FileNotFoundError, UnidentifiedImageError, ValueError) as exc:
        return {
            "is_authentic": False,
            "spoof_detected": True,
            "authenticity_score": 0.0,
            "moire_score": 1.0,
            "contrast_std": 0.0,
            "reason": f"Invalid or corrupted image file: {str(exc)}",
        }


def preprocess_meter_image(image_path: str) -> Dict[str, np.ndarray]:
    """
    2. Adım: OpenCV Görüntü Ön İşleme Pipeline'ı
    Sırasıyla:
      1) Grayscale Dönüşümü
      2) Bilateral Filter & Gaussian Gürültü Azaltma
      3) CLAHE (Contrast Limited Adaptive Histogram Equalization)
      4) Adaptive Gaussian Thresholding
    """
    img_bgr = load_image_unicode_safe(image_path)

    # 1. Grayscale dönüşümü
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # 2. Bilateral gürültü azaltma (rakam kenarlarını koruyarak)
    denoised = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)
    blurred = cv2.GaussianBlur(denoised, (3, 3), 0)

    # 3. CLAHE (Kontrast Sınırlı Adaptif Histogram Eşitleme)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)

    # 4. Adaptive Thresholding
    adaptive_thresh = cv2.adaptiveThreshold(
        enhanced,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2,
    )

    return {
        "gray": gray,
        "denoised": denoised,
        "clahe": enhanced,
        "thresholded": adaptive_thresh,
    }


def safe_cleanup_file(filepath: Optional[str]) -> bool:
    """
    İşlenen geçici görselleri diskten güvenli şekilde temizler (Disk DoS önleme).
    """
    if not filepath:
        return False
    try:
        if os.path.exists(filepath) and os.path.isfile(filepath):
            os.remove(filepath)
            return True
    except OSError as exc:
        logger.warning("Failed to cleanup temporary file %s: %s", filepath, exc)
    return False
