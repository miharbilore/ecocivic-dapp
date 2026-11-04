# 🌿 EcoCivic: Akıllı Şehirlerde Hibrit Güven Modeli (Oyun Teorisi ve Yapay Zeka Destekli Otonom Denetim)

[![TÜBİTAK 2209-B](https://img.shields.io/badge/T%C3%9CB%C4%B0TAK-2209--B%20Sanayi%20Odakl%C4%B1-red.svg)](#)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20%20%7C%20EIP--712-363636.svg)](./smart-contracts)
[![Python AI Oracle](https://img.shields.io/badge/Python-3.10%2B%20%7C%20OpenCV%202D--FFT-3776AB.svg)](./backend-ai)
[![React + Vite](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Ethers%20v6-61DAFB.svg)](./frontend)
[![Edge Hardware](https://img.shields.io/badge/Edge%20Kiosk-Raspberry%20Pi%20%7C%20HX711%20%7C%20ESC%2FPOS-C51A4A.svg)](./kiosk-hardware)

**EcoCivic**, belediyelerin her haneye milyonlarca dolarlık IoT sensörü kurma zorunluluğunu (CAPEX) ve pahalı manuel zabıta/okuyucu denetimi maliyetlerini (OPEX) ortadan kaldıran **B2G (Business-to-Government) SaaS ve Web3/AI Otonom Denetim Platformudur**.

Vatandaş beyanlarını **2D FFT Spektral Anti-Spoofing + OpenCV OCR**, **Mahremiyet Odaklı Sivil İtibar Skoru ($R_i$)**, **Karma Strateji Nash Dengesi ($p^*$)** ve **EIP-712 Kriptografik Oracle İmzaları** ile birleştirerek belediye denetim maliyetlerinde **%75'in üzerinde tasarruf** ve **%97.5 hile caydırıcılığı** sağlar.

---

## 🏆 Temel İnovasyonlar ve Mimari Öne Çıkanlar

1. **Oyun Teorisi ve Soulbound Sivil İtibar Skoru ($R_i \in [0, 1000]$):**
   - Her vatandaş `100` başlangıç itibar puanı ile başlar (`CitizenReputation.sol`).
   - Dürüst beyanlar ödül çarpanını ($\mu_R \in [0.5\text{x}, 2.0\text{x}]$) artırırken yatırması gereken minimum teminatı ($S_{\text{req}} = S_{\text{base}} \cdot \frac{100}{\max(R_i, 25)}$) düşürür.
   - Hile yakalandığında (`SlashingManager.sol`) teminatın **%50'si** ve itibar puanının **%50'si** otomatik kesilir.
2. **5 Aşamalı AI Oracle ve 2D FFT Anti-Spoofing Hattı (`backend-ai/`):**
   - Su sayacı fotoğraflarında başka bir ekrandan veya kağıt çıktıdan çekilen sahte görüntüleri **2D Fast Fourier Transform (FFT) Moiré frekans analizi** ile yakalar.
   - OpenCV (`Grayscale -> Bilateral Filter -> CLAHE -> Adaptive Threshold`) ve kümülatif endeks yerine **Tüketim Deltası ($\Delta = C_t - C_{t-1}$) Z-Score analizi** ile sayaç geri sarma ($\Delta < 0$) ve manipülasyonları tespit eder.
3. **EIP-712 Kriptografik Oracle Güvenliği & RBAC Akıllı Kontratlar (`smart-contracts/`):**
   - `Ownable` darboğazı yerine OpenZeppelin `AccessControl` (`MINTER_ROLE`, `BURNER_ROLE`, `SLASHING_ROLE`) kullanır.
   - `WaterBilling.sol` ve `RecyclingRewards.sol` kontratları yalnızca `ECDSA.recover` ile doğrulanmış **EIP-712 TypedData** (`WaterBillVoucher`, `RecyclingVoucher`) imzalarını ve tek kullanımlık `nonce` değerlerini kabul eder.
4. **Fiziksel Raspberry Pi Kiosk Donanım Katmanı (`kiosk-hardware/` - İP4):**
   - **Hardware Abstraction Layer (HAL):** Fiziksel Raspberry Pi GPIO (`HX711` Load-Cell ağırlık sensörü), USB QR okuyucu ve 80mm/58mm `ESC/POS` termal yazıcı sürücüsünü çalıştırır; donanım bağlı olmadığında otomatik `MockHardwareAdapter` moduna geçer.
   - **Offline-First Signed Queue:** Belediye saha interneti kesildiğinde işlemleri `HMAC-SHA256` imzalı olarak `offline_queue.json` içinde saklar ve bağlantı geldiğinde senkronize eder.
5. **Q1/Q2 Akademik Monte Carlo Simülasyon Motoru (`backend-ai/simulations/academic_paper_sim.py`):**
   - 10.000 haneli sanal belediyede 12 aylık periyotta **Tam IoT (%93.50 tasarruf)** ve **Manuel Denetim (%75.70 toplam / %77.74 OPEX tasarrufu)** senaryolarını karşılaştırır; makaleye hazır `.tex` (LaTeX), `.csv` ve Markdown raporlarını otomatik üretir.

---

## 📂 Dizin Yapısı (Ponytail Architecture)

```text
ecocivic-dapp/
├── smart-contracts/                # Faz 1: Solidity 0.8.20 Akıllı Kontratlar (Hardhat)
│   ├── contracts/
│   │   ├── BELTToken.sol           # AccessControl RBAC (MINTER, BURNER, SLASHING)
│   │   ├── CitizenReputation.sol   # Soulbound Sivil İtibar (R_i), S_req & Ödül Çarpanı
│   │   ├── EcoCivicDeposit.sol     # ReentrancyGuard USDC Escrow & Aave V3 Adaptörü
│   │   ├── RecyclingRewards.sol    # EIP-712 RecyclingVoucher & Nonce Koruması
│   │   ├── WaterBilling.sol        # EIP-712 WaterBillVoucher & Tüketim Deltası
│   │   └── SlashingManager.sol     # %30 Hazine / %20 Denetçi / %50 Havuz Slashing
│   ├── scripts/                    # deploy.js (Otomatik RBAC kurulumu) & seed.js
│   └── test/                       # 13 kapsamlı birim ve entegrasyon testi
│
├── backend-ai/                     # Faz 2: AI Oracle, Oyun Teorisi & EIP-712 Signer
│   ├── ai/
│   │   ├── model_utils.py          # 2D FFT Moiré Anti-Spoofing & CLAHE Ön İşleme
│   │   ├── ocr.py                  # Strategy Pattern OCR (Tesseract + Fallback)
│   │   └── anomaly_detection.py    # Tüketim Deltası (Δ) & Z-Score Anomali Motoru
│   ├── services/
│   │   ├── game_theory_engine.py   # 2x2 Denetim Oyunu, Nash p*, R_i & S_req Motoru
│   │   ├── eip712_signer.py        # EIP-712 TypedData Kriptografik İmzalayıcı
│   │   ├── water_validation.py     # Uçtan uca Su Beyanı Pipeline Servisi
│   │   └── recycling_validation.py # Uçtan uca Atık & Kiosk Doğrulama Servisi
│   ├── simulations/
│   │   └── academic_paper_sim.py   # 10.000 Haneli Q1/Q2 Makale Monte Carlo Motoru
│   └── tests/                      # Pytest birim ve entegrasyon testleri
│
├── frontend/                       # Faz 3: Vatandaş Süper-Uygulaması & B2G Portalı
│   └── src/
│       ├── context/WalletContext.jsx       # MetaMask + 4 Profilli Demo Fallback Modu
│       ├── components/                     # DepositPanel, WaterMeterUpload, RecyclingQR...
│       └── pages/                          # Home, Dashboard, Water, Recycling, AdminPortal
│
├── kiosk-hardware/                 # Faz 4: Fiziksel Raspberry Pi Kiosk Edge Katmanı (İP4)
│   ├── kiosk_daemon.py             # HAL (RPi GPIO HX711 / Mock) + HMAC Offline Queue
│   ├── escpos_driver.py            # Binary 80mm/58mm ESC/POS Termal Yazıcı Sürücüsü
│   └── test_kiosk_hardware.py      # Kiosk donanım ve offline sync pytest paketi
│
└── docs/                           # Teknik ve Akademik Dokümantasyon
    ├── architecture.md             # Ponytail Mimari & Mermaid Diyagramları
    ├── tokenomics.md               # Oyun Teorisi Matematiksel Formülasyonu
    ├── api-spec.md                 # REST API & EIP-712 TypedData Spesifikasyonu
    └── academic-simulation-results.md # 10.000 Haneli Monte Carlo Deney Sonuçları
```

---

## 🚀 Hızlı Başlangıç ve Doğrulama Komutları

### 1. Akıllı Kontratlar (Faz 1)
```bash
cd smart-contracts
npm install
npx hardhat test
npx hardhat run scripts/seed.js
```

### 2. Backend AI Oracle & Akademik Simülasyon (Faz 2 & Faz 4)
```bash
cd backend-ai
pip install -r requirements.txt
python -m pytest tests/test_backend_ai.py -v
python simulations/academic_paper_sim.py
python app.py
```

### 3. Frontend Süper-Uygulaması & B2G Admin Portalı (Faz 3)
```bash
cd frontend
npm install
npm run build
npm run dev
```

### 4. Fiziksel Raspberry Pi Kiosk Edge Servisi (Faz 4)
```bash
cd kiosk-hardware
python -m pytest test_kiosk_hardware.py -v
```

---

## 📊 Akademik Deney Özeti (10.000 Hane / 12 Ay Monte Carlo)

| Mimari Paradigma | 12 Aylık Toplam Maliyet | Hile Yakalama (Recall) | Maliyet Tasarrufu |
| :--- | :---: | :---: | :---: |
| **Senaryo 1: Geleneksel Tam IoT (AMI + RFID)** | `$2,138,000` | `%94.5` | Referans (IoT) |
| **Senaryo 2: Geleneksel Manuel Zabıta Denetimi** | `$571,800` | `%31.8` | Referans (Manuel) |
| **Senaryo 3: Önerilen EcoCivic Hibrit Model** | **`$138,948`** *(Net: `$0`)* | **`%91.8`** | **`-%93.50` (IoT) / `-%75.70` (Manuel)** |

Detaylı tablolar ve LaTeX çıktıları için:
- [docs/academic-simulation-results.md](./docs/academic-simulation-results.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/tokenomics.md](./docs/tokenomics.md)
- [docs/api-spec.md](./docs/api-spec.md)
