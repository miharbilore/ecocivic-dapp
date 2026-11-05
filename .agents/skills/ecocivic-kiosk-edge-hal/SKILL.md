---
name: ecocivic-kiosk-edge-hal
description: >-
  EcoCivic Fiziksel Raspberry Pi Kiosk Edge katmanında (kiosk-hardware/) GPIO HX711 Load-Cell
  tartım sensörü, MockHardwareAdapter, binary ESC/POS termal fiş yazıcı sürücüsü ve HMAC-SHA256
  imzalı çevrimdışı kuyruk (offline_queue.json) geliştirirken kullanılır.
---

# EcoCivic Raspberry Pi Edge Kiosk & HAL Skill

## Ne Zaman Kullanılır?
- `ecocivic-dapp/kiosk-hardware/` altındaki `kiosk_daemon.py`, `escpos_driver.py` veya `test_kiosk_hardware.py` dosyalarında geliştirme ve hata ayıklama yapılacağında.
- Backend ile Kiosk arasındaki `/api/kiosk/verify-and-print` ve `/api/kiosk/sync-offline` uç noktaları güncelleneceğinde.

## 1. Donanım Soyutlama Katmanı (HAL) ve Tartım Kuralları

1. **Çift Modlu HAL (`HardwareAdapter`):**
   - `RaspberryPiHardwareAdapter`: Fiziksel Raspberry Pi 4/5 üzerinde `RPi.GPIO` ve `HX711` 24-bit Load-Cell ADC kullanarak medyan filtreli (gürültü gidermeli) gram ölçümü yapar.
   - `MockHardwareAdapter`: Donanım kütüphaneleri bulunmayan Windows/Linux geliştirme ortamlarında ve CI testlerinde otomatik devreye girer; asla `ImportError` fırlatıp servisi çökertmez.
2. **Fiziksel Tartım Toleransı:**
   - Vatandaşın beyan ettiği atık ağırlığı ile Load-Cell sensörünün ölçtüğü gerçek ağırlık arasında en fazla **$\pm\%15$ sapma** kabul edilir.
   - Maksimum hazne kapasitesi **$25.000\text{ g}$ ($25\text{ kg}$)** ile sınırlıdır; aşım durumunda güvenlik kilidi devreye girer.

## 2. Binary ESC/POS Termal Fiş ve Offline-First Kuyruk

1. **Termal Fiş Sürücüsü (`escpos_driver.py`):**
   - 80mm ve 58mm termal yazıcılar için standart binary `ESC/POS` komut dizilerini (`ESC @`, hizalama, kalın yazı, native `GS ( k` QR kod, `GS k` Code128 barkod ve `GS V` tam/kısmi bıçak kesimi) üretir.
2. **HMAC-SHA256 Çevrimdışı Kuyruk (`OfflineQueueManager`):**
   - Saha interneti kesildiğinde işlemleri `KIOSK_HMAC_SECRET` ile `HMAC-SHA256` imzalayarak `offline_queue.json` dosyasına yazar.
   - İnternet geldiğinde imzası doğrulanmayan veya kurcalanmış (`tampered`) kayıtlar reddedilir.

## 3. Doğrulama Komutu

Değişiklik sonrası her zaman çalıştır:
```bash
cd ecocivic-dapp/kiosk-hardware
python -m pytest test_kiosk_hardware.py -v
```
