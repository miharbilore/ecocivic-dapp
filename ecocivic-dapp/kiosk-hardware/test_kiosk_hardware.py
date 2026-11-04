# -*- coding: utf-8 -*-
"""
Unit & Integration Tests for Raspberry Pi Edge Kiosk Hardware Layer (İP4)
=========================================================================
Kapsam:
1. HAL / Adapter Pattern otomatik MockHardwareAdapter geçişi
2. ESC/POS 80mm ve 58mm ikili (binary) komut dizisi üretimi (INIT, ALIGN_CENTER, QR, BARCODE, CUT)
3. QR okuma + Load-Cell ağırlık doğrulaması (Dürüst beyan)
4. Sahte / Aşırı ağırlık / Sapma reddi (Anti-Fraud Load-Cell kontrolleri)
5. Çevrimdışı dayanıklılık (Offline-First Queue), HMAC-SHA256 bütünlük doğrulaması ve senkronizasyon
"""
import json
from pathlib import Path

import pytest

from escpos_driver import EscPosCommands, EscPosDriver
from kiosk_daemon import (
    KioskEdgeDaemon,
    MockHardwareAdapter,
    create_hardware_adapter,
)


def test_hal_auto_fallback_to_mock_adapter():
    """Fiziksel Raspberry Pi GPIO olmadığında otomatik MockHardwareAdapter seçilmeli."""
    adapter = create_hardware_adapter(prefer_real=True, paper_width_mm=80)
    assert isinstance(adapter, MockHardwareAdapter)
    assert adapter.adapter_mode == "MOCK_SIMULATION"


def test_escpos_driver_80mm_and_58mm_binary_commands():
    """ESC/POS sürücüsü 80mm ve 58mm için geçerli binary kontrol kodları üretmeli."""
    driver_80 = EscPosDriver(paper_width_mm=80)
    receipt_80 = driver_80.build_recycling_receipt(
        {
            "kiosk_id": "KIOSK-KADIKOY-01",
            "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            "material_type": "plastic",
            "declared_amount": 1200,
            "measured_weight_g": 1185,
            "reward_belt": 14.22,
            "reputation_score": 250,
            "nonce": "0xabc1234567890def",
            "signature": "0x99887766554433221100",
        }
    )

    raw_bytes = receipt_80["raw_bytes"]
    assert raw_bytes.startswith(EscPosCommands.INIT)
    assert EscPosCommands.ALIGN_CENTER in raw_bytes
    assert EscPosCommands.BOLD_ON in raw_bytes
    assert b"\x1d\x28\x6b" in raw_bytes  # GS ( k Native QR
    assert b"\x1d\x6b\x49" in raw_bytes  # GS k Code128 Barcode
    assert raw_bytes.endswith(EscPosCommands.CUT_PARTIAL)
    assert "ECOCIVIC AKILLI SEHIR GERI DONUSUM KIOSKU" in receipt_80["receipt_text"]
    assert "+14.22 BELT TOKEN" in receipt_80["receipt_text"]

    driver_58 = EscPosDriver(paper_width_mm=58)
    receipt_58 = driver_58.build_recycling_receipt({"declared_amount": 500, "measured_weight_g": 500})
    assert receipt_58["columns"] == 32
    assert len(receipt_58["raw_bytes"]) > 100


def test_kiosk_honest_qr_and_load_cell_verification(tmp_path: Path):
    """Dürüst QR beyanı ve %15 tolerans içindeki Load-Cell ölçümü onaylanmalı ve fiş basılmalı."""
    queue_file = tmp_path / "offline_queue.json"
    daemon = KioskEdgeDaemon(
        kiosk_id="KIOSK-BESIKTAS-02",
        queue_file=queue_file,
        tolerance_ratio=0.15,
    )

    qr_payload = {
        "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "material_type": "metal",
        "declared_amount": 1000,
        "kiosk_id": "KIOSK-BESIKTAS-02",
        "qr_hash": "0x" + "1" * 64,
    }

    def mock_backend_sender(payload):
        return {
            "valid": True,
            "reward_belt": 22.8,
            "reputation_score": 255,
            "voucher": {
                "user": payload["wallet_address"],
                "nonce": payload["qr_hash"],
                "signature": "0x" + "f" * 130,
            },
        }

    result = daemon.process_kiosk_submission(
        qr_payload=qr_payload,
        simulated_weight_grams=960.0,  # %4 sapma (<= %15 tolerans)
        backend_sender=mock_backend_sender,
    )

    assert result["status"] == "VERIFIED_ONLINE"
    assert result["reward_belt"] == 22.8
    assert result["receipt"]["byte_length"] > 150
    assert "LOAD-CELL   : 960 g (DOGRULANDI)" in result["receipt"]["receipt_text"]


def test_kiosk_rejects_fraudulent_and_excessive_weights(tmp_path: Path):
    """Ağırlık sapması (>%15), hazne kapasitesi aşımı (>25kg) ve sıfır ağırlık reddedilmeli."""
    daemon = KioskEdgeDaemon(
        queue_file=tmp_path / "offline_queue.json",
        tolerance_ratio=0.15,
        max_capacity_grams=25000.0,
    )

    qr_payload = {
        "wallet_address": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        "material_type": "glass",
        "declared_amount": 2000,
    }

    # 1. %60 Ağırlık Sapması (2000g beyan, 800g ölçüm)
    mismatch_res = daemon.process_kiosk_submission(
        qr_payload=qr_payload,
        simulated_weight_grams=800.0,
    )
    assert mismatch_res["status"] == "REJECTED"
    assert mismatch_res["reason"] == "WEIGHT_DISCREPANCY_EXCEEDED"
    assert mismatch_res["fraud_flag"] is True

    # 2. Aşırı Ağırlık / Kapasite Aşımı (30.000g > 25.000g)
    overload_qr = {**qr_payload, "declared_amount": 30000}
    overload_res = daemon.process_kiosk_submission(
        qr_payload=overload_qr,
        simulated_weight_grams=30000.0,
    )
    assert overload_res["status"] == "REJECTED"
    assert overload_res["reason"] == "EXCEEDS_HOPPER_CAPACITY"
    assert overload_res["fraud_flag"] is True

    # 3. Sıfır / Boş Hazne
    zero_res = daemon.process_kiosk_submission(
        qr_payload=qr_payload,
        simulated_weight_grams=0.0,
    )
    assert zero_res["status"] == "REJECTED"
    assert zero_res["reason"] == "ZERO_OR_NEGATIVE_LOAD_CELL"


def test_kiosk_offline_queue_and_sync_with_hmac_verification(tmp_path: Path):
    """
    İnternet kesildiğinde veriler HMAC-SHA256 imzalı olarak yerel kuyruğa alınmalı,
    bağlantı geldiğinde senkronize edilmeli ve kurcalanan (tampered) kayıtlar reddedilmeli.
    """
    queue_file = tmp_path / "offline_queue.json"
    daemon = KioskEdgeDaemon(queue_file=queue_file)

    qr_1 = {
        "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "material_type": "plastic",
        "declared_amount": 1000,
        "qr_hash": "0x" + "a" * 64,
    }
    qr_2 = {
        "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "material_type": "glass",
        "declared_amount": 1500,
        "qr_hash": "0x" + "b" * 64,
    }

    res1 = daemon.process_kiosk_submission(
        qr_payload=qr_1, simulated_weight_grams=1010.0, force_offline=True
    )
    res2 = daemon.process_kiosk_submission(
        qr_payload=qr_2, simulated_weight_grams=1490.0, force_offline=True
    )

    assert res1["status"] == "QUEUED_OFFLINE"
    assert res2["status"] == "QUEUED_OFFLINE"
    assert len(daemon.offline_queue.list_pending()) == 2

    # Kuyruktaki 2. kaydın ağırlığını dışarıdan manipüle edelim (HMAC bütünlük testi)
    raw_items = json.loads(queue_file.read_text(encoding="utf-8"))
    raw_items[1]["payload"]["measured_weight_g"] = 9999.0
    queue_file.write_text(json.dumps(raw_items), encoding="utf-8")

    # Şimdi senkronizasyonu çalıştıralım
    sync_report = daemon.sync_offline_queue(
        backend_sender=lambda payload: {
            "valid": True,
            "voucher": {"nonce": payload["qr_hash"], "signature": "0x" + "c" * 130},
        }
    )

    assert sync_report["synced_count"] == 1
    assert sync_report["tampered_count"] == 1
    assert sync_report["failed_count"] == 0
    assert sync_report["remaining_pending"] == 0
