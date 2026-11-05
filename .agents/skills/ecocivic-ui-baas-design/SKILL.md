---
name: ecocivic-ui-baas-design
description: >-
  EcoCivic React 18 + Vite + Ethers v6 önyüzünde Apple Wallet / Revolut sadeliğinde Vatandaş
  Süper-Uygulaması, Sanal Kart (BaaS) deneyimi, 4 profilli Demo Fallback modu ve B2G Belediye
  Denetim Portalı geliştirirken kullanılır.
---

# EcoCivic UI, BaaS Virtual Card & B2G Portal Design Skill

## Ne Zaman Kullanılır?
- `ecocivic-dapp/frontend/src/` altındaki sayfalarda (`Home`, `Dashboard`, `Water`, `Recycling`, `AdminPortal`), bileşenlerde (`DepositPanel`, `WaterMeterUpload`, `RecyclingQR`) veya `WalletContext.jsx` üzerinde geliştirme yapılacağında.

## 1. BaaS (Banking-as-a-Service) & Vatandaş Deneyimi Kuralları

1. **Sıfır Kripto / Sıfır Ham LaTeX Karmaşası:**
   - Vatandaş ekranlarında (`Home`, `Dashboard`, `Water`, `Recycling`) ham LaTeX kodları (`$$...$$`, `\frac`, `\mu_R`, `S_{req}`) veya kafa karıştırıcı blokzincir jargonu **kesinlikle gösterilmez**.
   - Bunun yerine **Apple Wallet / Revolut** sadeliğinde **"EcoCivic Akıllı Şehir Kartı"** (Sanal Kart UI), **"Sivil Güven Puanı"**, **"Teminat Güvencesi (USDC + %4.2 Aave Getirisi)"** ve **"Ödül Çarpanı (1.15x - 2.00x)"** gibi sade finansal göstergeler kullanılır.
2. **4 Profilli Canlı Simülasyon / Demo Modu (`WalletContext.jsx`):**
   - MetaMask kurulu olmasa dahi jüri ve kullanıcıların tüm oyun teorisi senaryolarını tek tıkla test edebilmesi için `WalletContext.jsx` içindeki 4 hazır demo profili (*Örnek Vatandaş $R_i=250$*, *Yeni Abone $R_i=100$*, *Riskli Abone $R_i=40$*, *Belediye Müfettişi*) her zaman çalışır durumda tutulmalıdır.
3. **B2G Belediye Denetçi Portalı (`AdminPortal.jsx`):**
   - Müfettiş ekranında Nash denetim kuyruğu ($p^*$), 2D FFT Moiré anti-spoofing durumu, $\Delta$ tüketim anomalileri ve tek tıkla `%30 Hazine / %20 Denetçi / %50 Ödül Havuzu` Slashing infaz paneli net veri kartlarıyla sunulmalıdır.

## 2. Doğrulama Komutu

Her arayüz değişikliğinden sonra üretim derlemesini doğrula:
```bash
cd ecocivic-dapp/frontend
npm run build
```
