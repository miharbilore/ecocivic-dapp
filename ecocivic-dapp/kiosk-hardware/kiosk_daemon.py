# -*- coding: utf-8 -*-
"""
EcoCivic Raspberry Pi Edge Kiosk Daemon (TÜBİTAK 2209-B İP4)
============================================================
Mimari Desenler:
1. Hardware Abstraction Layer (HAL) & Adapter Pattern:
   - `RaspberryPiHardwareAdapter`: Gerçek GPIO HX711 Load-Cell, USB HID/Serial QR
     Okuyucu ve USB/Serial ESC/POS Termal Yazıcı sürücüsü.
   - `MockHardwareAdapter`: Geliştirme/CI ortamında veya fiziksel sensör bağlı
     olmadığında otomatik devreye giren deterministik donanım adaptörü.
2. Offline-First Signed Queue (`OfflineQueueManager`):
   - Belediye saha interneti kesildiğinde okunan QR ve Load-Cell ağırlık verilerini
     HMAC-SHA256 imzalı olarak yerel `offline_queue.json` dosyasında saklar.
   - Bağlantı geri geldiğinde `/api/kiosk/verify-and-print` uç noktası ile senkronize eder.
"""
import abc
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from escpos_driver import EscPosDriver


class HardwareAdapter(abc.ABC):
    """Kiosk Donanım Soyutlama Katmanı (HAL) Arayüzü."""

    @property
    @abc.abstractmethod
    def adapter_mode(self) -> str:
        """'REAL_RPI_HARDWARE' veya 'MOCK_SIMULATION' döner."""

    @abc.abstractmethod
    def read_qr_payload(self, injected_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """USB HID/Serial QR okuyucudan geri dönüşüm beyan verisini okur."""

    @abc.abstractmethod
    def read_load_cell_grams(self, simulated_grams: Optional[float] = None) -> float:
        """HX711 Load-Cell ağırlık sensöründen gram cinsinden stabilize ölçüm alır."""

    @abc.abstractmethod
    def print_thermal_receipt(self, receipt_data: Dict[str, Any]) -> Dict[str, Any]:
        """ESC/POS termal yazıcıdan fiş basar ve binary/text çıktıyı döner."""


class RaspberryPiHardwareAdapter(HardwareAdapter):
    """
    Gerçek Raspberry Pi 4/5 GPIO (HX711 Load-Cell) + USB QR + ESC/POS Yazıcı Adaptörü.
    """

    def __init__(
        self,
        dout_pin: int = 5,
        pd_sck_pin: int = 6,
        reference_unit: float = 420.0,
        serial_port: str = "/dev/ttyACM0",
        printer_device: str = "/dev/usb/lp0",
        paper_width_mm: int = 80,
    ):
        import RPi.GPIO as GPIO  # type: ignore

        self._gpio = GPIO
        self.dout_pin = dout_pin
        self.pd_sck_pin = pd_sck_pin
        self.reference_unit = reference_unit
        self.serial_port = serial_port
        self.printer = EscPosDriver(paper_width_mm=paper_width_mm, device_path=printer_device)

        self._gpio.setwarnings(False)
        self._gpio.setmode(self._gpio.BCM)
        self._gpio.setup(self.pd_sck_pin, self._gpio.OUT)
        self._gpio.setup(self.dout_pin, self._gpio.IN)

    @property
    def adapter_mode(self) -> str:
        return "REAL_RPI_HARDWARE"

    def read_qr_payload(self, injected_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if injected_payload is not None:
            return injected_payload
        import serial  # type: ignore

        with serial.Serial(self.serial_port, baudrate=9600, timeout=5) as ser:
            raw_line = ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw_line:
                raise RuntimeError("QR okuyucudan veri alınamadı (timeout).")
            return json.loads(raw_line)

    def read_load_cell_grams(self, simulated_grams: Optional[float] = None) -> float:
        if simulated_grams is not None:
            return float(simulated_grams)
        # HX711 24-bit ADC okuma döngüsü (5 örnek medyan filtresi)
        samples: List[float] = []
        for _ in range(5):
            count = 0
            while self._gpio.input(self.dout_pin) == 1:
                time.sleep(0.001)
            for _ in range(24):
                self._gpio.output(self.pd_sck_pin, True)
                count = count << 1
                self._gpio.output(self.pd_sck_pin, False)
                if self._gpio.input(self.dout_pin):
                    count += 1
            self._gpio.output(self.pd_sck_pin, True)
            count ^= 0x800000
            self._gpio.output(self.pd_sck_pin, False)
            grams = max(0.0, float(count) / self.reference_unit)
            samples.append(grams)
        samples.sort()
        return round(samples[len(samples) // 2], 2)

    def print_thermal_receipt(self, receipt_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.printer.build_recycling_receipt(receipt_data)


class MockHardwareAdapter(HardwareAdapter):
    """
    Donanım bağlı olmadığında (PC/CI/Test ortamında) otomatik devreye giren
    deterministik Kiosk Donanım Simülasyon Adaptörü.
    """

    def __init__(self, paper_width_mm: int = 80):
        self.printer = EscPosDriver(paper_width_mm=paper_width_mm, device_path=None)

    @property
    def adapter_mode(self) -> str:
        return "MOCK_SIMULATION"

    def read_qr_payload(self, injected_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if injected_payload is not None:
            return dict(injected_payload)
        return {
            "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            "material_type": "plastic",
            "declared_amount": 1000,
            "kiosk_id": "KIOSK-KADIKOY-01",
            "qr_hash": "0x" + hashlib.sha256(b"default-demo-qr").hexdigest(),
        }

    def read_load_cell_grams(self, simulated_grams: Optional[float] = None) -> float:
        if simulated_grams is not None:
            return round(float(simulated_grams), 2)
        return 1000.0

    def print_thermal_receipt(self, receipt_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.printer.build_recycling_receipt(receipt_data)


def create_hardware_adapter(prefer_real: bool = True, paper_width_mm: int = 80) -> HardwareAdapter:
    """
    Sistemde fiziksel Raspberry Pi GPIO ve USB donanımı varsa `RaspberryPiHardwareAdapter`,
    yoksa otomatik olarak `MockHardwareAdapter` başlatır.
    """
    if prefer_real:
        try:
            return RaspberryPiHardwareAdapter(paper_width_mm=paper_width_mm)
        except Exception:
            return MockHardwareAdapter(paper_width_mm=paper_width_mm)
    return MockHardwareAdapter(paper_width_mm=paper_width_mm)


class OfflineQueueManager:
    """
    Çevrimdışı Dayanıklılık (Offline-First Queue):
    Belediye saha interneti kesildiğinde okunan QR ve Load-Cell verilerini
    HMAC-SHA256 bütünlük imzası ile yerel JSON kuyruğunda saklar.
    """

    def __init__(self, queue_file: Path, hmac_secret: str = "ecocivic-kiosk-edge-secret-2026"):
        self.queue_file = Path(queue_file)
        self.hmac_secret = hmac_secret.encode("utf-8")
        self.queue_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.queue_file.exists():
            self._write_queue([])

    def _compute_hmac(self, record_payload: Dict[str, Any]) -> str:
        canonical = json.dumps(record_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(self.hmac_secret, canonical, hashlib.sha256).hexdigest()

    def _read_queue(self) -> List[Dict[str, Any]]:
        if not self.queue_file.exists():
            return []
        try:
            with open(self.queue_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError):
            return []

    def _write_queue(self, items: List[Dict[str, Any]]) -> None:
        with open(self.queue_file, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)

    def enqueue(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        queue = self._read_queue()
        record_core = {
            "queue_id": hashlib.sha256(
                f"{payload.get('wallet_address')}:{payload.get('qr_hash')}:{time.time_ns()}".encode("utf-8")
            ).hexdigest()[:16],
            "queued_at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        signature = self._compute_hmac(record_core)
        signed_entry = {
            **record_core,
            "hmac_sha256": signature,
            "status": "PENDING_SYNC",
        }
        queue.append(signed_entry)
        self._write_queue(queue)
        return signed_entry

    def list_pending(self) -> List[Dict[str, Any]]:
        return [item for item in self._read_queue() if item.get("status") == "PENDING_SYNC"]

    def verify_entry_integrity(self, entry: Dict[str, Any]) -> bool:
        core = {
            "queue_id": entry.get("queue_id"),
            "queued_at": entry.get("queued_at"),
            "payload": entry.get("payload"),
        }
        expected = self._compute_hmac(core)
        provided = str(entry.get("hmac_sha256", ""))
        return hmac.compare_digest(expected, provided)

    def clear_all(self) -> None:
        self._write_queue([])


class KioskEdgeDaemon:
    """
    Fiziksel Atık Beyan Kiosku Uç (Edge) Servisi.
    - QR okuma ve şema doğrulama
    - HX711 Load-Cell ağırlık doğrulama (Negatif/Sıfır, Kapasite Aşımı, Beyan Sapması kontrolü)
    - Backend-AI (`/api/kiosk/verify-and-print`) senkronizasyonu veya Offline Kuyruğa alma
    - ESC/POS Termal Fiş üretimi
    """

    MATERIAL_REWARD_RATES = {
        "plastic": 0.010,  # 10 BELT / 1000g
        "glass": 0.012,    # 12 BELT / 1000g
        "metal": 0.020,    # 20 BELT / 1000g
        "paper": 0.008,    # 8 BELT / 1000g
        "electronic": 5.0, # 5 BELT / adet
    }

    def __init__(
        self,
        kiosk_id: str = "KIOSK-KADIKOY-01",
        backend_url: str = "http://localhost:5000",
        queue_file: Optional[Path] = None,
        hardware_adapter: Optional[HardwareAdapter] = None,
        tolerance_ratio: float = 0.15,
        max_capacity_grams: float = 25000.0,
    ):
        self.kiosk_id = kiosk_id
        self.backend_url = backend_url.rstrip("/")
        self.tolerance_ratio = tolerance_ratio
        self.max_capacity_grams = max_capacity_grams
        self.hardware = hardware_adapter or create_hardware_adapter(prefer_real=True)

        default_queue_path = Path(__file__).resolve().parent / "offline_queue.json"
        self.offline_queue = OfflineQueueManager(queue_file=queue_file or default_queue_path)

    def validate_weight_measurement(
        self, declared_grams: float, measured_grams: float
    ) -> Dict[str, Any]:
        """
        HX711 Load-Cell ölçümü ile vatandaşın QR beyanını karşılaştırır.
        """
        if declared_grams <= 0:
            return {
                "valid": False,
                "reason": "INVALID_DECLARED_WEIGHT",
                "message": "Beyan edilen ağırlık 0'dan büyük olmalıdır.",
                "discrepancy_ratio": 1.0,
            }

        if measured_grams <= 0:
            return {
                "valid": False,
                "reason": "ZERO_OR_NEGATIVE_LOAD_CELL",
                "message": "Kiosk haznesinde atık ağırlığı tespit edilemedi (0g veya sensör hatası).",
                "discrepancy_ratio": 1.0,
            }

        if measured_grams > self.max_capacity_grams:
            return {
                "valid": False,
                "reason": "EXCEEDS_HOPPER_CAPACITY",
                "message": (
                    f"Ölçülen ağırlık ({measured_grams:.0f}g) maksimum kiosk hazne "
                    f"kapasitesini ({self.max_capacity_grams:.0f}g) aşıyor! Sahte ağırlık / manipülasyon şüphesi."
                ),
                "discrepancy_ratio": abs(measured_grams - declared_grams) / declared_grams,
            }

        discrepancy_ratio = abs(measured_grams - declared_grams) / declared_grams
        if discrepancy_ratio > self.tolerance_ratio:
            return {
                "valid": False,
                "reason": "WEIGHT_DISCREPANCY_EXCEEDED",
                "message": (
                    f"Beyan ({declared_grams:.0f}g) ile Load-Cell ölçümü ({measured_grams:.0f}g) "
                    f"arasındaki sapma (%{discrepancy_ratio * 100:.1f}) izin verilen "
                    f"±%{self.tolerance_ratio * 100:.0f} toleransı aşıyor."
                ),
                "discrepancy_ratio": round(discrepancy_ratio, 4),
            }

        return {
            "valid": True,
            "reason": "WEIGHT_VERIFIED",
            "message": "Load-Cell ağırlık doğrulaması başarılı.",
            "discrepancy_ratio": round(discrepancy_ratio, 4),
        }

    def _post_to_backend(self, payload: Dict[str, Any], timeout_sec: float = 3.0) -> Dict[str, Any]:
        url = f"{self.backend_url}/api/kiosk/verify-and-print"
        body = json.dumps(payload).encode("utf-8")
        req = urllib_request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib_request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)

    def process_kiosk_submission(
        self,
        qr_payload: Optional[Dict[str, Any]] = None,
        simulated_weight_grams: Optional[float] = None,
        force_offline: bool = False,
        backend_sender: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Uçtan uca Kiosk işlem adımı:
        1. QR verisini oku
        2. HX711 Load-Cell sensöründen gerçek/simüle ağırlığı oku
        3. Fiziksel ağırlık doğrulamasını çalıştır (sahte/aşırı ağırlıkları reddet)
        4. Çevrimiçi ise Backend-AI `/api/kiosk/verify-and-print` ile EIP-712 imzası al;
           çevrimdışı ise yerel HMAC imzalı `offline_queue.json` kuyruğuna kaydet ve
           geçici çevrimdışı alındı fişi bas.
        """
        scanned_qr = self.hardware.read_qr_payload(qr_payload)
        declared_g = float(scanned_qr.get("declared_amount", 0))
        measured_g = self.hardware.read_load_cell_grams(simulated_weight_grams)

        weight_check = self.validate_weight_measurement(declared_g, measured_g)
        if not weight_check["valid"]:
            return {
                "status": "REJECTED",
                "adapter_mode": self.hardware.adapter_mode,
                "kiosk_id": self.kiosk_id,
                "reason": weight_check["reason"],
                "message": weight_check["message"],
                "declared_grams": declared_g,
                "measured_grams": measured_g,
                "discrepancy_ratio": weight_check["discrepancy_ratio"],
                "fraud_flag": True,
            }

        wallet_address = str(scanned_qr.get("wallet_address", "0x0000000000000000000000000000000000000000"))
        material_type = str(scanned_qr.get("material_type", "plastic")).lower()
        qr_hash = str(
            scanned_qr.get("qr_hash")
            or "0x"
            + hashlib.sha256(
                f"{wallet_address}:{material_type}:{declared_g}:{time.time_ns()}".encode("utf-8")
            ).hexdigest()
        )

        request_payload = {
            "kiosk_id": scanned_qr.get("kiosk_id", self.kiosk_id),
            "wallet_address": wallet_address,
            "material_type": material_type,
            "declared_amount": declared_g,
            "measured_weight_g": measured_g,
            "qr_hash": qr_hash,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        }

        rate = self.MATERIAL_REWARD_RATES.get(material_type, 0.01)
        estimated_reward = round(measured_g * rate, 2)

        # Online vs Offline Execution
        backend_response: Optional[Dict[str, Any]] = None
        is_offline_queued = False
        queued_entry: Optional[Dict[str, Any]] = None

        if not force_offline:
            try:
                sender_fn = backend_sender or self._post_to_backend
                backend_response = sender_fn(request_payload)
            except (urllib_error.URLError, TimeoutError, ConnectionError, OSError):
                is_offline_queued = True
        else:
            is_offline_queued = True

        if is_offline_queued:
            queued_entry = self.offline_queue.enqueue(request_payload)
            receipt_input = {
                **request_payload,
                "reward_belt": estimated_reward,
                "reputation_score": int(scanned_qr.get("reputation_score", 100)),
                "nonce": f"OFFLINE-{queued_entry['queue_id']}",
                "signature": f"HMAC-{queued_entry['hmac_sha256'][:32]}",
            }
            receipt_output = self.hardware.print_thermal_receipt(receipt_input)
            return {
                "status": "QUEUED_OFFLINE",
                "adapter_mode": self.hardware.adapter_mode,
                "kiosk_id": self.kiosk_id,
                "declared_grams": declared_g,
                "measured_grams": measured_g,
                "estimated_reward_belt": estimated_reward,
                "offline_queue_entry": queued_entry,
                "receipt": receipt_output,
            }

        voucher = (backend_response or {}).get("voucher", {})
        receipt_input = {
            **request_payload,
            "reward_belt": float((backend_response or {}).get("reward_belt", estimated_reward)),
            "reputation_score": int((backend_response or {}).get("reputation_score", 100)),
            "nonce": str(voucher.get("nonce", qr_hash)),
            "signature": str(voucher.get("signature", "0x" + "a" * 130)),
        }
        receipt_output = self.hardware.print_thermal_receipt(receipt_input)

        return {
            "status": "VERIFIED_ONLINE",
            "adapter_mode": self.hardware.adapter_mode,
            "kiosk_id": self.kiosk_id,
            "declared_grams": declared_g,
            "measured_grams": measured_g,
            "reward_belt": receipt_input["reward_belt"],
            "backend_response": backend_response,
            "receipt": receipt_output,
        }

    def sync_offline_queue(
        self,
        backend_sender: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Yerel çevrimdışı kuyrukta (`offline_queue.json`) bekleyen HMAC imzalı
        kayıtları doğrular ve Backend-AI servisine senkronize eder.
        """
        all_items = self.offline_queue._read_queue()
        synced_count = 0
        tampered_count = 0
        failed_count = 0
        synced_results: List[Dict[str, Any]] = []

        sender_fn = backend_sender or self._post_to_backend

        for item in all_items:
            if item.get("status") != "PENDING_SYNC":
                continue

            if not self.offline_queue.verify_entry_integrity(item):
                item["status"] = "REJECTED_TAMPERED_HMAC"
                tampered_count += 1
                continue

            try:
                resp = sender_fn(item["payload"])
                item["status"] = "SYNCED"
                item["synced_at"] = datetime.now(timezone.utc).isoformat()
                item["backend_voucher"] = resp.get("voucher")
                synced_count += 1
                synced_results.append(resp)
            except Exception as exc:
                item["last_error"] = str(exc)
                failed_count += 1

        # Yalnızca hala PENDING_SYNC veya REJECTED olanları dosyada tut, SYNCED olanları temizle
        remaining = [i for i in all_items if i.get("status") != "SYNCED"]
        self.offline_queue._write_queue(remaining)

        return {
            "synced_count": synced_count,
            "tampered_count": tampered_count,
            "failed_count": failed_count,
            "remaining_pending": len([i for i in remaining if i.get("status") == "PENDING_SYNC"]),
            "synced_results": synced_results,
        }
