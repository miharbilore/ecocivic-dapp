# 🏛️ EcoCivic Ponytail Sistem Mimarisi (Clean Architecture & Web3/AI Hibrit Tasarım)

**Proje:** Akıllı Şehirlerde Hibrit Güven Modeli: Oyun Teorisi ve Yapay Zeka Destekli Otonom Denetim (TÜBİTAK 2209-B)  
**Mimari Desen:** *Ponytail Architecture (At Kuyruğu Mimarisi)* + *Clean Architecture* + *Strategy & Pipeline Pattern* + *Hardware Abstraction Layer (HAL)*

---

## 1. Ponytail (At Kuyruğu) Mimari Felsefesi

Geleneksel akıllı şehir projeleri her haneye pahalı IoT sensörleri yerleştirmeye çalışırken yüksek **CAPEX/OPEX** darboğazına girer. **EcoCivic Ponytail Mimarisi**, binlerce dağınık sivil beyan ve kenar (edge) donanım girdisini (**Saç Telleri / Dağınık Girdi Katmanı**), merkezi olmayan kriptografik **AI Oracle + Oyun Teorisi Denetim Düğümünde (Toka / Yakınsama Noktası)** süzgeçten geçirerek, yalnızca doğrulanmış ve **EIP-712** ile imzalanmış kanıtları **Akıllı Kontratlara (At Kuyruğu / On-Chain Mutabakat Katmanı)** iletir.

```mermaid
flowchart LR
    subgraph INPUTS["1. Dağınık Beyan & Edge Katmanı (Ponytail Strands)"]
        C1["📱 Vatandaş Süper-Uygulaması\n(Su Sayacı Fotoğraf Beyanı)"]
        C2["♻️ Raspberry Pi Fiziksel Kiosk\n(HX711 Load-Cell + QR + ESC/POS)"]
        C3["🏛️ B2G Belediye Denetçi Portalı\n(Anomali & Slashing Yönetimi)"]
    end

    subgraph KNOT["2. Yakınsama Düğümü (The Ponytail Clasp - Backend AI & Game Theory)"]
        FFT["🔍 2D FFT Moiré Anti-Spoofing\n& CLAHE + OCR Pipeline"]
        ZSCORE["📈 Tüketim Deltası (Δ = C_t - C_{t-1})\n& Z-Score Anomali Motoru"]
        GT["🎲 Oyun Teorisi Motoru\n(Sivil İtibar R_i & Nash p*)"]
        EIP712["🔐 EIP-712 Kriptografik\nOracle İmzalayıcı (secp256k1)"]
        FFT --> ZSCORE --> GT --> EIP712
    end

    subgraph TAIL["3. On-Chain Mutabakat Katmanı (Smart Contracts Tail)"]
        WB["💧 WaterBilling.sol\n(EIP-712 Verify & Mint)"]
        RR["♻️ RecyclingRewards.sol\n(EIP-712 Verify & Mint)"]
        CR["🛡️ CitizenReputation.sol\n(Soulbound R_i & S_req)"]
        ED["🏦 EcoCivicDeposit.sol\n(USDC Escrow & Aave V3)"]
        SM["⚖️ SlashingManager.sol\n(%30 Hazine / %20 Denetçi / %50 Havuz)"]
        BT["🪙 BELTToken.sol\n(AccessControl RBAC)"]
    end

    C1 --> FFT
    C2 --> GT
    C3 --> SM
    EIP712 --> WB
    EIP712 --> RR
    WB --> CR
    WB --> BT
    RR --> CR
    RR --> BT
    SM --> ED
    SM --> CR
```

---

## 2. 5 Aşamalı Görüntü İşleme, Anti-Spoofing ve OCR Pipeline (`backend-ai/ai/`)

Su sayacı beyanlarında ekran fotoğrafı (screen-replay) veya kağıt çıktı sahteciliğini engellemek için `ai/model_utils.py` ve `ai/ocr.py` içinde **Pipeline + Strategy Pattern** uygulanmıştır:

```mermaid
flowchart TD
    IMG["📸 Yüklenen Sayaç Görseli"] --> STEP1["1. 2D FFT Spektral Moiré Analizi\n(Yüksek Frekans Enerji Oranı & HSV/Kontrast Kontrolü)"]
    STEP1 -- "Spoof Tespit Edildi" --> REJECT_SPOOF["🚨 HİLE / SPOOF BAYRAĞI\n(p* >= 0.95 Denetim Kuyruğu & Slashing Adayı)"]
    STEP1 -- "Gerçek Görsel" --> STEP2["2. OpenCV Ön İşleme\n(Grayscale -> Bilateral Filter -> CLAHE -> Adaptive Threshold)"]
    STEP2 --> STEP3["3. OCR Strategy Pattern\n(TesseractDigitsStrategy / DeterministicFallbackStrategy)"]
    STEP3 --> STEP4["4. Tüketim Deltası Analizi\n(Δ = Current - Previous, Z-Score & Geri Sarma Δ < 0 Kontrolü)"]
    STEP4 -- "Δ < 0 veya |Z| > 2.5" --> REJECT_ANOMALY["⚠️ ANOMALİ BAYRAĞI\n(Müfettiş Denetim Kuyruğuna Sevk)"]
    STEP4 -- "Normal Tüketim" --> STEP5["5. Oyun Teorisi R_i Güncelleme\n& EIP-712 WaterBillVoucher İmzası"]
```

---

## 3. EIP-712 Kriptografik Doğrulama ve On-Chain Mutabakat Akışı

Oracle manipülasyonunu ve tekrar (replay) saldırılarını önlemek amacıyla zincir dışı AI doğrulaması ile zincir üstü kontratlar arasında **EIP-712 Structured Data Hashing & Signing** standardı kullanılır:

```mermaid
sequenceDiagram
    autonumber
    actor Citizen as Vatandaş (Cüzdan / UI)
    participant AI as Backend AI & EIP-712 Signer
    participant Contract as WaterBilling / RecyclingRewards
    participant Rep as CitizenReputation.sol
    participant Token as BELTToken.sol

    Citizen->>AI: Beyan Gönder (Sayaç Fotoğrafı veya Kiosk Tartım Verisi)
    AI->>AI: 1. 2D FFT Anti-Spoofing / Load-Cell Doğrulaması
    AI->>AI: 2. Tüketim Deltası (Δ) & Oyun Teorisi (R_i, p*) Hesabı
    AI->>AI: 3. EIP-712 Voucher İmzala (nonce, deadline, ECDSA v,r,s)
    AI-->>Citizen: İmzalı Voucher + Denetim Raporu Döndür
    Citizen->>Contract: payBill() / rewardRecycling(voucher, signature)
    Contract->>Contract: _verifyVoucher() -> ECDSA.recover(digest, sig) == oracleSigner
    Contract->>Contract: usedNonces[nonce] = true (Replay Koruması)
    Contract->>Rep: getRewardMultiplierBps(citizen) & recordHonestDeclaration(citizen)
    Contract->>Token: mint(citizen, baseReward * multiplier)
    Contract-->>Citizen: On-Chain İşlem Onayı + BELT Ödülü + Yeni R_i Skoru
```

---

## 4. Fiziksel Raspberry Pi Edge Kiosk Mimarisi (`kiosk-hardware/`)

TÜBİTAK 2209-B İP4 iş paketi kapsamında saha kioskları **Hardware Abstraction Layer (HAL)** ve **Offline-First Signed Queue** mimarisiyle tasarlanmıştır:

```mermaid
flowchart TD
    subgraph EDGE["Raspberry Pi 4/5 Edge Kiosk (kiosk_daemon.py)"]
        QR["🔍 USB HID/Serial QR Okuyucu"]
        HX["⚖️ HX711 24-Bit ADC + Load-Cell\n(Medyan Filtreli Gram Ölçümü)"]
        HAL["🔌 HardwareAdapter (HAL)\nRaspberryPiHardwareAdapter / MockHardwareAdapter"]
        VAL["🛡️ Fiziksel Ağırlık Doğrulayıcı\n(±%15 Sapma & 25kg Kapasite Kontrolü)"]
        OFF["📦 OfflineQueueManager\n(offline_queue.json + HMAC-SHA256)"]
        PRN["🧾 EscPosDriver (80mm/58mm)\nBinary ESC/POS + Native QR + Code128"]
    end

    QR --> HAL
    HX --> HAL
    HAL --> VAL
    VAL -- "İnternet Aktif" --> API["🌐 Backend-AI\nPOST /api/kiosk/verify-and-print"]
    VAL -- "İnternet Kesik" --> OFF
    OFF -. "Bağlantı Geldiğinde Sync" .-> API
    API --> PRN
    OFF --> PRN
```

---

## 5. Akıllı Kontrat Modülerliği ve RBAC Yetki Matrisi (`smart-contracts/`)

Monolitik kontrat darboğazını ve `Ownable` kilitlenmesini (Ownership Deadlock) ortadan kaldırmak için OpenZeppelin `AccessControl` tabanlı 6 modüler kontrat inşa edilmiştir:

| Kontrat Dosyası | Sorumluluk | Sahip Olduğu / Kullandığı Roller ve Güvenlik Katmanı |
| :--- | :--- | :--- |
| `BELTToken.sol` | Kapalı devre sivil teşvik token'ı (ERC-20, 1B Max Supply) | `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `BURNER_ROLE`, `SLASHING_ROLE`, `PAUSER_ROLE` |
| `CitizenReputation.sol` | Soulbound (devredilemez) Sivil İtibar Skoru ($R_i \in [0, 1000]$) | `REPUTATION_UPDATER_ROLE`, `SLASHER_ROLE`; dinamik $S_{\text{req}}$ ve $\mu_R$ hesabı |
| `EcoCivicDeposit.sol` | USDC Teminat (Escrow) ve Aave V3 Getiri Adaptörü | `SLASHER_ROLE`, `ReentrancyGuard`, `underInvestigation` çekim kilidi |
| `WaterBilling.sol` | EIP-712 Su Beyanı Doğrulama, Faturalama ve Tasarruf Ödülü | `EIP712("EcoCivicOracle", "1")`, `ECDSA`, `BELTToken.MINTER_ROLE` |
| `RecyclingRewards.sol` | EIP-712 Atık Beyanı Doğrulama ve Kiosk Ödül Dağıtımı | `EIP712("EcoCivicOracle", "1")`, `usedNonces` replay koruması, `MINTER_ROLE` |
| `SlashingManager.sol` | Hile tespiti halinde otomatik/müfettiş onaylı teminat ve itibar kesintisi | `%30` Belediye Hazinesi, `%20` Denetçi, `%50` Sivil Ödül Havuzu; `SLASHER_ROLE` |
