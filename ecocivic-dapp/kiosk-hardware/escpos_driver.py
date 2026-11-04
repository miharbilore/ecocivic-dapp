# -*- coding: utf-8 -*-
"""
ESC/POS Thermal Label & Receipt Printer Driver (80mm / 58mm)
============================================================
TÜBİTAK 2209-B İP4 — Fiziksel Raspberry Pi Kiosk Donanım Katmanı.
Standart Epson ESC/POS ikili (binary) protokol komut dizilerini üretir:
- INIT (ESC @)
- ALIGN_LEFT / ALIGN_CENTER / ALIGN_RIGHT (ESC a n)
- BOLD / DOUBLE HEIGHT (ESC E, ESC !)
- NATIVE QR CODE (GS ( k — Function 165, 167, 169, 180, 181)
- BARCODE CODE128 (GS k)
- CUT_PAPER (GS V)
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional


class EscPosCommands:
    """Raw binary ESC/POS control sequences."""

    ESC = b"\x1b"
    GS = b"\x1d"
    LF = b"\x0a"

    # Printer Initialization
    INIT = b"\x1b\x40"

    # Text Alignment
    ALIGN_LEFT = b"\x1b\x61\x00"
    ALIGN_CENTER = b"\x1b\x61\x01"
    ALIGN_RIGHT = b"\x1b\x61\x02"

    # Font Styling
    BOLD_ON = b"\x1b\x45\x01"
    BOLD_OFF = b"\x1b\x45\x00"
    DOUBLE_HEIGHT_ON = b"\x1b\x21\x10"
    DOUBLE_WIDTH_HEIGHT_ON = b"\x1b\x21\x30"
    NORMAL_TEXT = b"\x1b\x21\x00"

    # Codepage (PC857 Turkish / UTF-8 fallback)
    CODEPAGE_TURKISH = b"\x1b\x74\x0d"

    # Paper Feed & Cutter
    FEED_3_LINES = b"\x1b\x64\x03"
    FEED_5_LINES = b"\x1b\x64\x05"
    CUT_FULL = b"\x1d\x56\x00"
    CUT_PARTIAL = b"\x1d\x56\x42\x00"


class EscPosDriver:
    """
    80mm (48 kolon) ve 58mm (32 kolon) termal yazıcılar için
    binary ESC/POS komut akışı ve metin önizlemesi üreten sürücü.
    """

    def __init__(self, paper_width_mm: int = 80, device_path: Optional[str] = None):
        if paper_width_mm not in (58, 80):
            raise ValueError("Desteklenen termal kağıt genişlikleri: 58mm veya 80mm")
        self.paper_width_mm = paper_width_mm
        self.columns = 48 if paper_width_mm == 80 else 32
        self.device_path = device_path

    @staticmethod
    def _sanitize_ascii(text: str) -> str:
        """Termal yazıcı karakter tablosu uyumluluğu için güvenli dönüşüm."""
        tr_map = str.maketrans("ğĞıİöÖüÜşŞçÇ", "gGiIoOuUsScC")
        return text.translate(tr_map)

    @staticmethod
    def build_qr_commands(qr_data: str, module_size: int = 6) -> bytes:
        """
        GS ( k protokolü ile donanımsal 2D QR kod basım dizisi üretir.
        """
        payload = qr_data.encode("utf-8")
        store_len = len(payload) + 3
        pL = store_len & 0xFF
        pH = (store_len >> 8) & 0xFF

        # 1. Select QR Model 2: GS ( k 4 0 49 65 50 0
        cmd_model = b"\x1d\x28\x6b\x04\x00\x31\x41\x32\x00"
        # 2. Set module size: GS ( k 3 0 49 67 n
        size_byte = max(3, min(16, int(module_size))).to_bytes(1, "little")
        cmd_size = b"\x1d\x28\x6b\x03\x00\x31\x43" + size_byte
        # 3. Set Error Correction Level M (49): GS ( k 3 0 49 69 49
        cmd_ec = b"\x1d\x28\x6b\x03\x00\x31\x45\x31"
        # 4. Store QR data in symbol storage area: GS ( k pL pH 49 80 48 <data>
        cmd_store = b"\x1d\x28\x6b" + bytes([pL, pH]) + b"\x31\x50\x30" + payload
        # 5. Print QR symbol: GS ( k 3 0 49 81 48
        cmd_print = b"\x1d\x28\x6b\x03\x00\x31\x51\x30"

        return cmd_model + cmd_size + cmd_ec + cmd_store + cmd_print + EscPosCommands.LF

    @staticmethod
    def build_barcode_code128(code_text: str) -> bytes:
        """
        GS k 73 (Code128) barkod basım dizisi üretir.
        """
        clean_code = code_text[:24].encode("ascii", errors="ignore")
        # Set barcode height (GS h 64) & width (GS w 2)
        cmd_height = b"\x1d\x68\x40"
        cmd_width = b"\x1d\x77\x02"
        # Select Code128 subset B ({B)
        payload = b"{B" + clean_code
        cmd_barcode = b"\x1d\x6b\x49" + bytes([len(payload)]) + payload
        return cmd_height + cmd_width + cmd_barcode + EscPosCommands.LF

    def build_recycling_receipt(self, receipt_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Geri dönüşüm beyanı için hem binary ESC/POS byte dizisini hem de
        insan tarafından okunabilir fiş metnini üretir.
        """
        kiosk_id = str(receipt_data.get("kiosk_id", "KIOSK-kadikoy-01"))
        wallet = str(receipt_data.get("wallet_address", "0x0000...0000"))
        short_wallet = f"{wallet[:8]}...{wallet[-6:]}" if len(wallet) > 14 else wallet
        material = str(receipt_data.get("material_type", "plastic")).upper()
        declared_g = float(receipt_data.get("declared_amount", 0))
        measured_g = float(receipt_data.get("measured_weight_g", declared_g))
        reward_belt = float(receipt_data.get("reward_belt", 0.0))
        reputation_score = int(receipt_data.get("reputation_score", 100))
        voucher_nonce = str(receipt_data.get("nonce", "0x00"))
        signature = str(receipt_data.get("signature", "0x00"))
        timestamp_str = str(
            receipt_data.get(
                "timestamp",
                datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            )
        )

        divider = "=" * self.columns
        sub_divider = "-" * self.columns

        text_lines = [
            divider,
            "ECOCIVIC AKILLI SEHIR GERI DONUSUM KIOSKU".center(self.columns),
            f"Terminal: {kiosk_id} ({self.paper_width_mm}mm ESC/POS)".center(self.columns),
            divider,
            f"TARIH       : {timestamp_str}",
            f"VATANDAS    : {short_wallet}",
            f"ITIBAR (Ri) : {reputation_score} / 1000",
            sub_divider,
            f"ATIK TURU   : {material}",
            f"BEYAN       : {declared_g:.0f} g",
            f"LOAD-CELL   : {measured_g:.0f} g (DOGRULANDI)",
            f"ODUL        : +{reward_belt:.2f} BELT TOKEN",
            sub_divider,
            f"NONCE       : {voucher_nonce[:18]}...",
            f"EIP-712 SIG : {signature[:18]}...",
            divider,
            "EIP-712 ORACLE TARAFINDAN IMZALANMISTIR".center(self.columns),
            divider,
        ]
        human_readable = "\n".join(text_lines)

        # Build Binary ESC/POS Stream
        buf = bytearray()
        buf.extend(EscPosCommands.INIT)
        buf.extend(EscPosCommands.CODEPAGE_TURKISH)

        # Header Centered + Bold
        buf.extend(EscPosCommands.ALIGN_CENTER)
        buf.extend(EscPosCommands.BOLD_ON)
        buf.extend(self._sanitize_ascii("ECOCIVIC AKILLI SEHIR KIOSKU\n").encode("ascii"))
        buf.extend(EscPosCommands.BOLD_OFF)
        buf.extend(self._sanitize_ascii(f"Terminal: {kiosk_id}\n").encode("ascii"))
        buf.extend((divider + "\n").encode("ascii"))

        # Body Left Aligned
        buf.extend(EscPosCommands.ALIGN_LEFT)
        body_lines = [
            f"TARIH       : {timestamp_str}",
            f"VATANDAS    : {short_wallet}",
            f"ITIBAR (Ri) : {reputation_score} / 1000",
            sub_divider,
            f"ATIK TURU   : {material}",
            f"BEYAN       : {declared_g:.0f} g",
            f"LOAD-CELL   : {measured_g:.0f} g",
        ]
        for line in body_lines:
            buf.extend(self._sanitize_ascii(line + "\n").encode("ascii"))

        # Reward Highlight
        buf.extend(EscPosCommands.ALIGN_CENTER)
        buf.extend(EscPosCommands.BOLD_ON)
        buf.extend(EscPosCommands.DOUBLE_HEIGHT_ON)
        buf.extend(self._sanitize_ascii(f"\nODUL: +{reward_belt:.2f} BELT\n").encode("ascii"))
        buf.extend(EscPosCommands.NORMAL_TEXT)
        buf.extend(EscPosCommands.BOLD_OFF)

        # QR Code with EIP-712 Voucher verification payload
        qr_payload = f"ECOCIVIC|{kiosk_id}|{short_wallet}|{material}|{measured_g:.0f}g|{voucher_nonce[:14]}"
        buf.extend(self.build_qr_commands(qr_payload, module_size=5))

        # Barcode of Nonce suffix
        barcode_token = voucher_nonce.replace("0x", "")[:12].upper() or "ECOCIVIC001"
        buf.extend(self.build_barcode_code128(barcode_token))

        # Footer & Cut
        buf.extend(self._sanitize_ascii("EIP-712 ONAYLI BELGE\n").encode("ascii"))
        buf.extend(EscPosCommands.FEED_5_LINES)
        buf.extend(EscPosCommands.CUT_PARTIAL)

        raw_bytes = bytes(buf)

        # Optional direct hardware write if device_path exists
        printed_to_device = False
        if self.device_path:
            try:
                with open(self.device_path, "wb") as dev:
                    dev.write(raw_bytes)
                printed_to_device = True
            except OSError:
                printed_to_device = False

        return {
            "paper_width_mm": self.paper_width_mm,
            "columns": self.columns,
            "raw_bytes": raw_bytes,
            "raw_hex": raw_bytes.hex(),
            "byte_length": len(raw_bytes),
            "receipt_text": human_readable,
            "printed_to_device": printed_to_device,
            "commands_included": [
                "INIT (0x1b40)",
                "ALIGN_CENTER (0x1b6101)",
                "BOLD_ON (0x1b4501)",
                "QR_CODE_GS_K (0x1d286b)",
                "BARCODE_CODE128 (0x1d6b49)",
                "CUT_PARTIAL (0x1d564200)",
            ],
        }
