---
trigger: always_on
description: EcoCivic 4 katmanlı Ponytail mimarisi (Solidity 0.8.20, Python Flask AI Oracle & Oyun Teorisi, React 18 Vite BaaS UI, Raspberry Pi Kiosk HAL) kuralları.
---

# EcoCivic Architecture & Ponytail Principles

## 1. Ponytail (At Kuyruğu) Mimari Felsefesi

EcoCivic, belediyelerde pahalı ev içi IoT sensör yatırımını (CAPEX) ve manuel zabıta denetimi maliyetini (OPEX) ortadan kaldıran **Hibrit Güven Modeli (Web3 + AI Oracle + Oyun Teorisi + Edge Kiosk HAL)** platformudur.

Tüm geliştirmeler `ecocivic-dapp/` altındaki **4 katmanlı Ponytail Mimarisine** sadık kalmalıdır:

1. **Dağınık Beyan ve Kenar Katmanı (Ponytail Strands — Girdi Katmanı):**
   - `ecocivic-dapp/frontend/`: React 18 + Vite + Ethers v6 tabanlı **Vatandaş Süper-Uygulaması (Sanal Kart BaaS UI)** ve **B2G Belediye Denetçi Portalı**.
   - `ecocivic-dapp/kiosk-hardware/`: Raspberry Pi 4/5 üzerinde çalışan fiziksel **Edge Kiosk HAL** (`kiosk_daemon.py`, `escpos_driver.py`).
2. **Yakınsama Düğümü (The Ponytail Clasp — Backend AI Oracle & Game Theory):**
   - `ecocivic-dapp/backend-ai/`: Python 3.10+ / Flask servisi. Dağınık vatandaş beyanlarını ve kiosk tartımlarını **2D FFT Anti-Spoofing**, **CLAHE + OCR**, **Tüketim Deltası ($\Delta$) Z-Score**, **Sivil İtibar ($R_i$) & Karma Strateji Nash Dengesi ($p^*$)** süzgecinden geçirir ve yalnızca doğrulanmış beyanlar için **EIP-712 (`secp256k1`)** kriptografik voucher imzalar.
3. **On-Chain Mutabakat Katmanı (Smart Contracts Tail — Blokzincir Katmanı):**
   - `ecocivic-dapp/smart-contracts/`: Solidity `0.8.20` (Hardhat) akıllı kontratları (`BELTToken.sol`, `CitizenReputation.sol`, `EcoCivicDeposit.sol`, `WaterBilling.sol`, `RecyclingRewards.sol`, `SlashingManager.sol`). Yalnızca EIP-712 imzalı kanıtları doğrular, ödül basar (`mint`) veya teminat/itibar kesintisi (`slash`) uygular.
4. **Teknik ve Akademik Dokümantasyon & Simülasyon:**
   - `ecocivic-dapp/docs/` (`architecture.md`, `tokenomics.md`, `api-spec.md`, `academic-simulation-results.md`) ve `ecocivic-dapp/backend-ai/simulations/academic_paper_sim.py` (10.000 haneli Q1/Q2 Monte Carlo simülasyon motoru).

## 2. Katmanlar Arası Sınır ve Sorumluluk Kuralları

- **Toka (Clasp) Atlanamaz:** Frontend veya Kiosk katmanı, Backend AI Oracle doğrulamasından ve EIP-712 imzasından geçmeden doğrudan akıllı kontratlarda ödül veya fatura tahakkuku oluşturamaz.
- **İş Mantığı Ayrımı:**
  - Görüntü işleme, OCR, Z-Score anomali hesabı ve Nash $p^*$ olasılık hesabı `backend-ai/` katmanında yürütülür.
  - On-Chain kontratlar (`smart-contracts/`) deterministik durum makinesi (State Machine), RBAC yetki kontrolü, EIP-712 imza doğrulaması, USDC teminat saklama (Aave V3 Escrow) ve Slashing muhasebesinden sorumludur.
  - Arayüz (`frontend/`) cüzdan/demo profili yönetimi (`WalletContext.jsx`), BaaS sanal kart deneyimi ve B2G müfettiş görselleştirmesinden sorumludur; güvenlik doğrulaması asla yalnızca istemciye bırakılmaz.
- **Ponytail Uyumluluk İlkesi:**
  - Mevcut çalışan modüller, kontrat ABI sözleşmeleri ve REST API uç noktaları gerekçesiz yeniden yazılamaz.
  - Her değişiklik, problemi çözen **en küçük, güvenli ve geri alınabilir** kapsamda tutulmalıdır.
  - Yeni bir bağımlılık (npm veya pip paketi) eklemeden önce mevcut yığındaki araçlar (`OpenCV`, `NumPy`, `Ethers v6`, `OpenZeppelin v5`) kullanılmalıdır.
