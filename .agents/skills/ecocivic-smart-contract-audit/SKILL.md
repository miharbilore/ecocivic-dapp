---
name: ecocivic-smart-contract-audit
description: >-
  EcoCivic Solidity 0.8.20 akıllı kontratlarında (BELTToken, CitizenReputation, EcoCivicDeposit,
  WaterBilling, RecyclingRewards, SlashingManager) OpenZeppelin AccessControl RBAC, EIP-712 ECDSA
  voucher imzası, Aave V3 Escrow, ReentrancyGuard ve Slashing muhasebesi geliştirme ve denetimi için kullanılır.
---

# EcoCivic Smart Contract Audit & Development Skill

## Ne Zaman Kullanılır?
- `ecocivic-dapp/smart-contracts/contracts/` altındaki Solidity kontratlarında geliştirme, iyileştirme veya güvenlik denetimi yapılacağında.
- EIP-712 voucher yapılarında (`WaterBillVoucher`, `RecyclingVoucher`), rol matrislerinde veya Hardhat testlerinde (`test/*.test.js`) değişiklik gerektiğinde.

## 1. Kontrat Envanteri ve Kritik Değişmezler (Invariants)

1. **`BELTToken.sol` (ERC20 + AccessControl + Pausable):**
   - Maksimum arz (Hard Cap): `1_000_000_000 * 10**18` BELT.
   - `MINTER_ROLE`: Yalnızca `WaterBilling` ve `RecyclingRewards` kontratlarına verilir.
   - `BURNER_ROLE` & `SLASHING_ROLE`: Yalnızca `SlashingManager` kontratına verilir; yetkisiz `burnFrom` kapalıdır.
2. **`CitizenReputation.sol` (Soulbound Sivil İtibar $R_i$):**
   - Başlangıç skoru $R_0 = 100$, sınırlar $R_i \in [0, 1000]$.
   - Dürüst su beyanı $+5$, dürüst geri dönüşüm beyanı $+10$ puan; Slashing cezası mevcut $R_i$'nin `%50` kesintisidir.
   - Dinamik teminat: `getRequiredCollateral(citizen)` $\rightarrow$ $S_{\text{base}} \cdot \frac{100}{\max(R_i, 25)}$.
   - Ödül çarpanı (bps): `getRewardMultiplierBps(citizen)` $\rightarrow$ $5000 + \frac{R_i \cdot 15000}{1000} \in [5000, 20000]$ (`0.50x` – `2.00x`).
3. **`EcoCivicDeposit.sol` (USDC Escrow & Aave V3 Yield):**
   - `ReentrancyGuard` (`nonReentrant`) ve `SafeERC20` zorunludur.
   - `underInvestigation[citizen] == true` durumunda `withdraw()` çağrısı revert etmelidir.
4. **`WaterBilling.sol` & `RecyclingRewards.sol` (EIP-712 Oracle Doğrulama):**
   - Domain: `EIP712("EcoCivicOracle", "1")`.
   - `ECDSA.recover(_hashTypedDataV4(structHash), signature) == oracleSigner` kontrolü.
   - `block.timestamp <= voucher.deadline` ve `!usedNonces[voucher.nonce]` replay koruması.
5. **`SlashingManager.sol` (%30 / %20 / %50 Dağılım):**
   - Kesilen `%50` USDC teminatı kuruşu kuruşuna `%30` Belediye Hazinesi (`municipalTreasury`), `%20` Denetçi (`inspector`), `%50` Dürüst Vatandaş Ödül Havuzu (`rewardPool`) olarak bölünür.

## 2. Denetim ve Uygulama Adımları

1. Kontrat değişikliklerinde `scripts/deploy.js` ve `scripts/seed.js` içindeki RBAC rol atamalarının (`grantRole`) kırılmadığını kontrol et.
2. EIP-712 struct alanlarında değişiklik yapılırsa `backend-ai/services/eip712_signer.py` ve `frontend/src/abi/` dosyalarını eşzamanlı güncelle.
3. Doğrulama için her zaman çalıştır:
   ```bash
   cd ecocivic-dapp/smart-contracts
   npx hardhat test
   ```
