# 📐 Kripto-Ekonomik Model ve Oyun Teorisi Formülasyonu (`Tokenomics & Game Theory`)

**Proje:** Akıllı Şehirlerde Hibrit Güven Modeli: Oyun Teorisi ve Yapay Zeka Destekli Otonom Denetim (TÜBİTAK 2209-B)

---

## 1. Mahremiyet Odaklı Sivil İtibar Skoru ($R_i$)

EcoCivic sisteminde her vatandaş cüzdanı, devredilemez (*Soulbound*) nitelikte bir **Sivil İtibar Skoru ($R_i \in [0, 1000]$)** ile başlar:

- **Başlangıç Skoru ($R_0$):** $100$ puan
- **Dürüst Su Beyanı Ödülü:** $+5$ puan ($\text{maks. } 1000$)
- **Dürüst Geri Dönüşüm Beyanı Ödülü:** $+10$ puan ($\text{maks. } 1000$)
- **Hile / Anomali Cezası (Slashing):** Mevcut itibarın **%50 kesintisi** ($R_i^{(t+1)} = \lfloor 0.5 \cdot R_i^{(t)} \rfloor$)

---

## 2. Dinamik Teminat ($S_{\text{req}}$) ve Ödül Çarpanı ($\mu_R$) Fonksiyonları

### 2.1. Dinamik Minimum Teminat Fonksiyonu
Dürüst vatandaşın sermaye maliyetini düşürmek, hileye eğilimli düşük itibarlı cüzdanların ise sistemde kalma maliyetini (caydırıcılığı) artırmak için gerekli teminat miktarı $R_i$ ile ters orantılıdır:

$$S_{\text{req}}(R_i) = S_{\text{base}} \cdot \frac{100}{\max(R_i, 25)}$$

Burada $S_{\text{base}} = 100\text{ USDC}$ baz teminattır:
- Yeni vatandaş ($R_i = 100$): $S_{\text{req}} = 100\text{ USDC}$
- Yüksek itibarlı vatandaş ($R_i = 250$): $S_{\text{req}} = 40\text{ USDC}$ (%60 daha düşük teminat yükü)
- Hile nedeniyle cezalandırılmış vatandaş ($R_i = 25$): $S_{\text{req}} = 400\text{ USDC}$ (4 kat yüksek teminat şartı)

### 2.2. İtibar Tabanlı Ödül Çarpanı
Vatandaşın geri dönüşüm ve su tasarrufundan kazanacağı `BELT` token ödülü, itibar skoruna bağlı doğrusal bir çarpanla ($\mu_R \in [0.50\text{x}, 2.00\text{x}]$) ölçeklenir:

$$\mu_R(R_i) = 0.50 + 1.50 \cdot \left(\frac{R_i}{1000}\right)$$

---

## 3. 2x2 Denetim Oyunu (Inspection Game) ve Karma Strateji Nash Dengesi

Belediye Denetçisi (**Auditor**) ile Vatandaş (**Citizen**) arasındaki stratejik etkileşim iki oyunculu, sıfır toplamlı olmayan bir **Denetim Oyunu (Inspection Game)** olarak modellenmiştir:

### 3.1. Parametre Tanımları
- $V$: Dürüst beyanın sağladığı temel sivil fayda ve `BELT` ödül değeri
- $G$: Hileli beyandan (sayaç geri sarma, sahte fotoğraf, eksik atık ağırlığı) elde edilecek haksız kazanç ($G > 0$)
- $C_a$: Belediyenin fiziksel saha denetimi maliyeti ($C_a > 0$)
- $\lambda \in (0, 1]$: Slashing ceza oranı ($\lambda = 0.50$)
- $F(R_i) = \lambda \cdot S_{\text{req}}(R_i) + \Phi_{\text{rep}}(R_i)$: Yakalanma durumunda kesilen toplam parasal teminat ve itibar kaybı cezası

### 3.2. Normal Form 2x2 Kazanç Matrisi (Payoff Matrix)

| Belediye \ Vatandaş | **Hile Yap (Cheat, $q$)** | **Dürüst Beyan (Honest, $1-q$)** |
| :--- | :---: | :---: |
| **Denetle (Inspect, $p$)** | $(F(R_i) - C_a,\; -F(R_i))$ | $(-C_a,\; V \cdot \mu_R(R_i))$ |
| **Denetleme (Trust, $1-p$)** | $(-G,\; V + G)$ | $(0,\; V \cdot \mu_R(R_i))$ |

### 3.3. Nash Dengesi Denetim Olasılığı ($p^*$) ve Teşvik Uyumluluk Kısıtı

Vatandaşın hile yapmaktan beklenen faydası $E[U_{\text{cheat}}]$ ile dürüst davranmaktan beklenen faydası $E[U_{\text{honest}}]$:

$$E[U_{\text{cheat}}](p, R_i) = p \cdot (-F(R_i)) + (1 - p) \cdot (V + G)$$

$$E[U_{\text{honest}}](R_i) = V \cdot \mu_R(R_i)$$

**Teşvik Uyumluluk Kısıtı (Incentive Compatibility Constraint - ICC):** Rasyonel bir vatandaşın dürüst davranışı tercih etmesi için $E[U_{\text{honest}}] \ge E[U_{\text{cheat}}]$ olmalıdır. Buradan belediyenin uygulaması gereken kritik denetim eşiği $p^*(R_i)$ türetilir:

$$p^*(R_i) = \gamma(R_i) \cdot \frac{G}{G + \lambda \cdot S_{\text{req}}(R_i)}, \quad \gamma(R_i) = \max\left(0.30,\; 1 - \frac{R_i}{1500}\right)$$

AI Oracle ön elemesi (2D FFT Moiré veya Z-Score $\Delta$) bir anomali sinyali ($I_{\text{AI}} = 1$) ürettiğinde koşullu denetim olasılığı:

$$p_{\text{hybrid}}(R_i, I_{\text{AI}}) = \begin{cases} \max(p^*(R_i),\, 0.88), & \text{eğer } I_{\text{AI}} = 1 \\ p^*(R_i), & \text{eğer } I_{\text{AI}} = 0 \end{cases}$$

---

## 4. `BELTToken` Kapalı Devre Sivil Teşvik Ekonomisi ve Slashing Dağılımı

### 4.1. Token Parametreleri (`BELTToken.sol`)
- **Sembol / Standart:** `BELT` (ERC-20, 18 Ondalık)
- **Maksimum Arz (Hard Cap):** $1,000,000,000\text{ BELT}$
- **Yetkilendirme (RBAC):**
  - `MINTER_ROLE`: Yalnızca `WaterBilling.sol` ve `RecyclingRewards.sol` kontratlarına tanımlıdır.
  - `BURNER_ROLE` & `SLASHING_ROLE`: Yalnızca `SlashingManager.sol` kontratına tanımlıdır; keyfi `burnFrom` açığı kapatılmıştır.

### 4.2. Slashing (Teminat Kesintisi) Dağılım Mekanizması (`SlashingManager.sol`)
Bir vatandaşın hilesi kesinleştiğinde `EcoCivicDeposit.sol` üzerindeki USDC teminatının `%50`'si ($\lambda = 0.50$) kesilir ve şu oranlarla dağıtılır:

1. **%30 Belediye Hazinesi (`municipalTreasury`):** Saha altyapı ve kiosk bakım giderlerini finanse eder.
2. **%20 Denetçi / Whistleblower Ödülü (`inspector`):** Anomaliyi doğrulayan saha müfettişini teşvik eder.
3. **%50 Dürüst Vatandaş Ödül Havuzu (`rewardPool`):** Dürüst vatandaşların `BELT` ve getiri havuzunu besler.
