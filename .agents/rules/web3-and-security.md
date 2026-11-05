---
trigger: always_on
description: EcoCivic Web3 Akıllı Kontrat Güvenliği (AccessControl RBAC, EIP-712 ECDSA, ReentrancyGuard, Soulbound R_i) ve On-Chain/Off-Chain KVKK kuralları.
---

# Web3, Smart Contract & Privacy (KVKK) Security Rules

## 1. OpenZeppelin `AccessControl` RBAC Zorunluluğu

Tekil `Ownable` sahiplik darboğazı (Ownership Deadlock) yasaktır. `ecocivic-dapp/smart-contracts/contracts/` altındaki tüm kontratlarda rol tabanlı yetkilendirme matrisi korunmalıdır:

- **`BELTToken.sol`:**
  - `MINTER_ROLE`: Yalnızca `WaterBilling.sol` ve `RecyclingRewards.sol` kontratlarına verilir.
  - `BURNER_ROLE` ve `SLASHING_ROLE`: Yalnızca `SlashingManager.sol` kontratına verilir. Keyfi `burnFrom` açığı kesinlikle yasaktır.
- **`CitizenReputation.sol`:**
  - `REPUTATION_UPDATER_ROLE`: Yalnızca `WaterBilling.sol` ve `RecyclingRewards.sol` kontratlarına verilir.
  - `SLASHER_ROLE`: Yalnızca `SlashingManager.sol` kontratına verilir.
- **`EcoCivicDeposit.sol`:**
  - `SLASHER_ROLE`: Yalnızca `SlashingManager.sol` kontratına tanımlıdır.

## 2. EIP-712 Kriptografik Oracle İmzası ve Replay Koruması

- `WaterBilling.sol` ve `RecyclingRewards.sol` kontratları, dışarıdan gelen beyanları yalnızca `EIP712("EcoCivicOracle", "1")` alan adıyla imzalanmış `WaterBillVoucher` veya `RecyclingVoucher` yapıları üzerinden kabul etmelidir.
- Kontrat içinde `ECDSA.recover(_hashTypedDataV4(structHash), signature) == oracleSigner` doğrulaması, `block.timestamp <= voucher.deadline` kontrolü ve `usedNonces[voucher.nonce]` tek kullanımlık nonce (replay koruması) kontrolü zorunludur.
- `backend-ai/services/eip712_signer.py` içindeki domain ve tip tanımları (`types`), Solidity kontratlarındaki `TYPEHASH` tanımlarıyla birebir aynı kalmalıdır.

## 3. Teminat (Escrow), ReentrancyGuard ve Slashing Muhasebesi

- `EcoCivicDeposit.sol` ve `SlashingManager.sol` içindeki tüm fon transferlerinde OpenZeppelin `ReentrancyGuard` (`nonReentrant`), `SafeERC20` ve **Checks-Effects-Interactions (CEI)** deseni zorunludur.
- `underInvestigation[citizen] == true` olarak işaretlenen bir cüzdanın teminat çekmesi (`withdraw`) kontrat seviyesinde engellenmelidir.
- Hile kesinleştiğinde (`SlashingManager.sol`), vatandaşın USDC teminatının **%50'si ($\lambda = 0.50$)** kesilir ve şu sabit oranlarla dağıtılır:
  - **%30** Belediye Hazinesi (`municipalTreasury`)
  - **%20** Anomaliyi Doğrulayan Denetçi (`inspector`)
  - **%50** Dürüst Vatandaş Ödül Havuzu (`rewardPool`)

## 4. Soulbound Sivil İtibar ($R_i$) Değişmezliği

- `CitizenReputation.sol` üzerindeki Sivil İtibar Skoru ($R_i \in [0, 1000]$, başlangıç $R_0 = 100$) **Soulbound** (devredilemez) niteliktedir; cüzdanlar arası transfer veya alım-satım fonksiyonu eklenemez.
- Dürüst su beyanı $+5$, dürüst geri dönüşüm beyanı $+10$ puan kazandırır; Slashing durumunda mevcut itibar puanı **%50** oranında düşürülür ($R_i^{(t+1)} = \lfloor 0.5 \cdot R_i^{(t)} \rfloor$).

## 5. On-Chain / Off-Chain KVKK ve Gizli Anahtar Güvenliği

- **Zincir Üstü (On-Chain) Veri Yasağı:** Blokzincir kayıtlarının değiştirilemez (immutable) doğası gereği, kontratlara veya event loglarına **asla** T.C. Kimlik No, ad-soyad, açık ev adresi, telefon numarası veya ham sayaç fotoğrafı yazılamaz. Zincir üstünde yalnızca cüzdan adresi (`address`), kriptografik hash/nonce, tüketim deltası ($\Delta$) ve anonim $R_i$ skoru yer alır.
- **Off-Chain ve Secret Güvenliği:** Yüklenen sayaç görselleri güvenli dosya adlarıyla (`UUID`) izole tutulur, gerçek vatandaş verisi test/seed scriptlerinde kullanılmaz. `ORACLE_PRIVATE_KEY`, `KIOSK_HMAC_SECRET`, JWT anahtarları ve `.env` dosyaları asla kaynak koda veya Git deposuna eklenmez.
