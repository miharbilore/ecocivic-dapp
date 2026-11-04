# EcoCivic DApp (Municipality Application)

EcoCivic is a municipality application, with reward systems and AI-support, designed to encourage citizens for recycling.

## Project Structure

```
ecocivic-dapp/
├── backend-ai/                  # Python/Flask Backend & AI Modulesi
│   ├── ai/                      # AI logic
│   │   ├── anomaly_detection.py # Anomaly detection
│   │   ├── model_utils.py       # Model yardımcıları
│   │   └── ocr.py               # Water meter reading (OCR)
│   ├── database/                # Database connections
│   ├── services/                # Business logic services
│   ├── app.py                   # Main application entry point
│   ├── config.py                # Configuration
│   └── requirements.txt         # Python bağımlılıkları
│
├── docs/                        # Project Documentation
│   ├── api-spec.md              # API Spesifikasyonu
│   ├── architecture.md          # Mimari Tasarım
│   └── tokenomics.md            # Token Ekonomisi
│
├── frontend/                    # React Frontend Uygulaması
│   ├── public/                  # Statik dosyalar
│   ├── src/                     # Source code
│   │   ├── abi/                 # Kontrat ABI'leri
│   │   ├── components/          # UI Bileşenleri
│   │   ├── context/             # React Context (State)
│   │   ├── pages/               # Page Views
│   │   ├── services/            # API Servisleri
│   │   ├── App.jsx              # Ana Bileşen
│   │   └── main.jsx             # Giriş Noktası
│   └── package.json             # Frontend dependencies
│
├── smart-contracts/             # Solidity Akıllı Kontratlar
│   ├── contracts/               # Kontrat Dosyaları
│   │   ├── interfaces/          # Arayüzler (Interfaces)
│   │   ├── BELTToken.sol        # Reward Token
│   │   ├── EcoCivicDeposit.sol  # Depozito Sistemi
│   │   ├── RecyclingRewards.sol # Geri Dönüşüm Ödül Mantığı
│   │   ├── SlashingManager.sol  # Ceza Yönetimi
│   │   └── WaterBilling.sol     # Su Faturalandırma
│   ├── scripts/                 # Deploy scripts
│   ├── test/                    # Test files
│   ├── hardhat.config.js        # Hardhat Configuration
│   └── package.json             # Kontrat bağımlılıkları
│
├── .gitignore                   # Git yoksayma dosyası
└── README.md                    # Proje Özeti (Bu dosya)
```

## Modules

1.  **Smart Contracts**: Contracts deployed on Polygon network: BELT token and deposit management.
2.  **Backend AI**: Image processing service for reading water meters and anomaly detection.
3.  **Frontend**: Web interface for user interaction.