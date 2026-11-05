---
trigger: always_on
description: EcoCivic doğrulama kapıları (Hardhat, Pytest, Vite Build) ve çelişkisiz tek tip teslimat raporu standardı.
---

# Testing, Verification & Delivery Rules

## 1. Zorunlu Doğrulama Kapıları (Quality Gates)

Bir kod değişikliği tamamlandı sayılmadan önce etkilenen katmana ait doğrulama komutları bizzat çalıştırılmalı ve sonuçları doğrulanmalıdır:

1. **Akıllı Kontratlar (`ecocivic-dapp/smart-contracts`):**
   ```bash
   npx hardhat test
   ```
   - RBAC yetki matrisi, EIP-712 voucher doğrulaması, nonce replay koruması, `EcoCivicDeposit` Aave V3 escrow ve `SlashingManager` (`%30/%20/%50`) testleri eksiksiz geçmelidir.
2. **Backend AI Oracle & Oyun Teorisi (`ecocivic-dapp/backend-ai`):**
   ```bash
   python -m pytest tests/test_backend_ai.py -v
   ```
   - 2D FFT anti-spoofing, CLAHE + OCR, tüketim deltası ($\Delta$) anomali tespiti, Nash $p^*$ hesabı ve EIP-712 imzalama testleri eksiksiz geçmelidir.
   - Simülasyon motorunda değişiklik yapıldıysa `python simulations/academic_paper_sim.py` çalıştırılarak çıktıların tutarlılığı doğrulanmalıdır.
3. **Fiziksel Kiosk Edge HAL (`ecocivic-dapp/kiosk-hardware`):**
   ```bash
   python -m pytest test_kiosk_hardware.py -v
   ```
   - `MockHardwareAdapter`, $\pm\%15$ ağırlık toleransı, binary `ESC/POS` fiş üretimi ve `HMAC-SHA256` imzalı çevrimdışı kuyruk senkronizasyon testleri geçmelidir.
4. **Frontend Süper-Uygulaması & B2G Portalı (`ecocivic-dapp/frontend`):**
   ```bash
   npm run build
   ```
   - Vite üretim derlemesi sıfır hata ve sıfır kırık import ile tamamlanmalıdır. Vatandaş arayüzünde ham LaTeX formülü (`$$...$$`, `\frac` vb.) bulunmamalıdır.

## 2. Test ve Kalite İlkeleri

- Testleri geçirmek amacıyla güvenlik kontrollerini (`ECDSA.recover`, `onlyRole`, `nonReentrant`, `HMAC` doğrulaması) devre dışı bırakmak veya zayıflatmak kesinlikle yasaktır.
- Çalıştırılmayan hiçbir test veya build komutu "başarılı geçti" olarak raporlanamaz; çalıştırılamayan bir adım varsa nedeni açıkça belirtilir.
- Hata düzeltmelerinde kök nedeni doğrulayan regresyon testi eklenir.

## 3. Tek Tip Teslimat Raporu Standardı

Her geliştirme veya inceleme görevi sonunda karmaşık ve çelişkili şablonlar yerine aşağıdaki **4 maddelik net özet rapor** kullanılır:

### 1. Yapılan Değişiklikler ve Etkilenen Dosyalar
- Ponytail mimarisinin hangi katmanında (`smart-contracts`, `backend-ai`, `frontend`, `kiosk-hardware`) hangi dosyaların ne amaçla değiştirildiği.

### 2. Çalıştırılan Doğrulama Komutları ve Sonuçları
- Çalıştırılan `npx hardhat test`, `pytest`, `npm run build` komutları ve gerçek test çıktıları.

### 3. Güvenlik, KVKK ve Oyun Teorisi Etkisi
- EIP-712, RBAC, On-Chain/Off-Chain KVKK ayrımı ve oyun teorisi parametreleri ($R_i$, $S_{\text{req}}$, $p^*$) üzerindeki etkiler ve varsa kalan riskler.

### 4. İnsan Onayı Gerektiren İşlemler
- Yalnızca canlı ağ (mainnet/testnet) kontrat dağıtımı, yıkıcı veri/dosya silme veya gizli anahtar (secret) rotasyonu gerekiyorsa belirtilir.
