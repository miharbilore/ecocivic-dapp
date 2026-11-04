# 📡 EcoCivic REST API, EIP-712 TypedData ve Kiosk Protokol Spesifikasyonu

**Temel URL (Backend-AI):** `http://localhost:5000`  
**Veri Formatı:** `application/json` ve `multipart/form-data`  
**Kriptografik İmza Standardı:** EIP-712 (`EcoCivicOracle`, version `"1"`)

---

## 1. Genel Sağlık ve Sistem Durumu

### `GET /api/health`
Backend AI Oracle, veritabanı ve EIP-712 imzalayıcı cüzdan durumunu döndürür.

**Örnek Yanıt (`200 OK`):**
```json
{
  "status": "ok",
  "service": "ecocivic-backend-ai-oracle",
  "oracle_signer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "chain_id": 31337
}
```

---

## 2. Su Sayacı AI Doğrulama ve EIP-712 Fatura Pipeline'ı

### `POST /api/water/validate`
Su sayacı fotoğrafını 2D FFT Moiré Anti-Spoofing, OpenCV CLAHE + OCR, Tüketim Deltası ($\Delta$) ve Oyun Teorisi denetim motorundan geçirir.

**İstek (`multipart/form-data` veya `application/json`):**
| Alan | Tip | Zorunlu | Açıklama |
| :--- | :--- | :---: | :--- |
| `image` | `File` | Hayır* | Sayaç fotoğrafı (`.jpg`, `.png`, maks 10MB). *Simülasyon modunda `scenario` ile çalışabilir. |
| `wallet_address` | `string` | Evet | Vatandaşın EVM cüzdan adresi (`0x...`) |
| `meter_id` | `string` | Hayır | Sayaç seri numarası (Varsayılan: `"MTR-1001"`) |
| `previous_reading` | `integer` | Hayır | Önceki ay sayaç endeksi ($m^3$) |
| `simulated_reading` | `integer` | Hayır | Test/Demo için simüle edilen güncel endeks ($m^3$) |
| `scenario` | `string` | Hayır | `"honest"`, `"spoof"` (2D FFT Moiré), `"rollback"` ($\Delta < 0$) |

**Başarılı Yanıt (`200 OK`):**
```json
{
  "valid": true,
  "status": "VERIFIED",
  "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "authenticity": {
    "is_authentic": true,
    "high_freq_ratio": 0.142,
    "contrast_std": 48.6,
    "reason": "AUTHENTIC_CAMERA_CAPTURE"
  },
  "ocr": {
    "current_reading": 158,
    "previous_reading": 145,
    "consumption_delta": 13,
    "strategy_used": "DeterministicFallbackStrategy"
  },
  "anomaly_analysis": {
    "is_anomaly": false,
    "z_score": 0.35,
    "historical_mean_delta": 12.4,
    "reason": "NORMAL_CONSUMPTION_DELTA"
  },
  "game_theory": {
    "reputation_score": 255,
    "reward_multiplier": 0.8825,
    "required_deposit_usdc": 39.22,
    "nash_audit_probability": 0.142,
    "audit_triggered": false
  },
  "billing": {
    "bill_amount_wei": "13000000000000000",
    "estimated_reward_belt": 11.47
  },
  "voucher": {
    "user": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "currentReading": 158,
    "previousReading": 145,
    "billAmount": "13000000000000000",
    "nonce": "0x8f4e...c912",
    "deadline": 1793850000,
    "signature": "0x4b71...1b"
  }
}
```

---

## 3. Atık Beyanı ve Fiziksel Raspberry Pi Kiosk Uç Noktaları

### `POST /api/recycling/validate`
Vatandaşın geri dönüşüm beyanını doğrular ve EIP-712 `RecyclingVoucher` üretir.

### `POST /api/kiosk/verify-and-print`
Fiziksel Raspberry Pi Kiosk (`kiosk_daemon.py`) tarafından gönderilen QR beyanı ile HX711 Load-Cell ağırlık sensörü ölçümünü karşılaştırır, ±%15 tolerans içinde ise EIP-712 imzası ve 80mm ESC/POS termal fiş verisi döner.

**İstek (`application/json`):**
```json
{
  "kiosk_id": "KIOSK-KADIKOY-01",
  "wallet_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "material_type": "plastic",
  "declared_amount": 1000,
  "measured_weight_g": 985,
  "qr_hash": "0x4a8b...e901"
}
```

---

## 4. Oyun Teorisi ve B2G Belediye Denetim Uç Noktaları

### `GET /api/gametheory/profile/<wallet_address>`
Vatandaşın güncel Sivil İtibar Skorunu ($R_i$), Dinamik Minimum Teminatını ($S_{\text{req}}$), Ödül Çarpanını ($\mu_R$) ve Nash Denetim Olasılığını ($p^*$) döner.

### `POST /api/gametheory/simulate`
Akademik 2x2 Denetim Oyunu parametrelerini ($C_a, \lambda, G, R_i$) simüle ederek Nash dengesini ve kazanç matrisini hesaplar.

### `GET /api/admin/anomalies`
AI Oracle veya Kiosk Load-Cell tarafından yakalanan şüpheli beyanların denetim kuyruğunu listeler.

### `POST /api/admin/inspect`
Belediye müfettişinin denetim kararını (`APPROVE` veya `SLASH`) işler; `SLASH` durumunda `SlashingManager` için ceza parametrelerini ve `%50` $R_i$ kesintisini uygular.

---

## 5. EIP-712 TypedData Şemaları

### 5.1. EIP-712 Domain Separator
```json
{
  "name": "EcoCivicOracle",
  "version": "1",
  "chainId": 31337,
  "verifyingContract": "0x..."
}
```

### 5.2. `WaterBillVoucher` Tipi (`WaterBilling.sol`)
```solidity
 bytes32 public constant WATER_VOUCHER_TYPEHASH = keccak256(
     "WaterBillVoucher(address user,uint256 currentReading,uint256 previousReading,uint256 billAmount,bytes32 nonce,uint256 deadline)"
 );
```

### 5.3. `RecyclingVoucher` Tipi (`RecyclingRewards.sol`)
```solidity
 bytes32 public constant RECYCLING_VOUCHER_TYPEHASH = keccak256(
     "RecyclingVoucher(address user,string materialType,uint256 amount,bytes32 qrHash,bytes32 nonce,uint256 deadline)"
 );
```
