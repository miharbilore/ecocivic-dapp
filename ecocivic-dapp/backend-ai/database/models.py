"""
Database Models (SQLAlchemy 2.0 ORM)
TÜBİTAK 2209-B: İtibar Skoru (R_i), Oyun Teorisi Denetim Kararı (audit_required),
Güven Skoru (confidence_score) ve EIP-712 Nonce/Signature Alanları Entegre Edilmiştir.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func
from database.db import Base


class CitizenProfile(Base):
    """Mahremiyet Odaklı Vatandaş Sivil İtibar (R_i) ve Nonce Profili"""
    __tablename__ = "citizen_profiles"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), nullable=False, unique=True, index=True)
    reputation_score = Column(Integer, nullable=False, default=100)
    honest_declarations_count = Column(Integer, nullable=False, default=0)
    slashing_count = Column(Integer, nullable=False, default=0)
    eip712_nonce = Column(Integer, nullable=False, default=0)
    deposit_amount_usdc = Column(Float, nullable=False, default=1000.0)
    card_balance_try = Column(Float, nullable=False, default=225.0)
    total_burned_belt = Column(Float, nullable=False, default=0.0)
    under_investigation = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class WaterMeterReading(Base):
    """Su sayacı okuma, AI doğrulama, Oyun Teorisi denetim ve EIP-712 Voucher kayıtları"""
    __tablename__ = "water_meter_readings"

    id = Column(Integer, primary_key=True, index=True)
    meter_no = Column(String(50), nullable=False, index=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    reading_index = Column(Integer, nullable=False)
    previous_index = Column(Integer, nullable=True)
    consumption_m3 = Column(Float, nullable=False)
    saved_m3 = Column(Float, nullable=False, default=0.0)
    bill_amount = Column(Float, nullable=False, default=0.0)
    reward_amount = Column(Float, nullable=False, default=0.0)
    reputation_score = Column(Integer, nullable=False, default=100)
    confidence_score = Column(Float, nullable=False, default=0.90)
    anomaly_score = Column(Float, nullable=False, default=0.0)
    spoof_detected = Column(Boolean, default=False)
    is_valid = Column(Boolean, default=True)
    anomaly_detected = Column(Boolean, default=False)
    audit_required = Column(Boolean, default=False, index=True)
    audit_status = Column(String(30), nullable=False, default="AUTO_APPROVED")  # AUTO_APPROVED, AUDIT_REQUIRED, APPROVED, SLASHED
    audit_reason = Column(Text, nullable=True)
    eip712_nonce = Column(Integer, nullable=True)
    voucher_signature = Column(String(140), nullable=True)
    image_path = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_meter_wallet", "meter_no", "wallet_address"),
        Index("idx_water_audit_req", "audit_required", "audit_status"),
    )


class RecyclingSubmission(Base):
    """Geri dönüşüm Kiosk beyanı, Load-cell ağırlık, Termal Fiş ve EIP-712 Voucher kayıtları"""
    __tablename__ = "recycling_submissions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    material_type = Column(String(20), nullable=False)  # glass, paper, metal
    amount_kg = Column(Float, nullable=False)
    qr_token_id = Column(String(100), nullable=False, unique=True, index=True)
    qr_hash = Column(String(64), nullable=False, unique=True, index=True)
    reward_amount = Column(Float, nullable=False)
    reputation_score = Column(Integer, nullable=False, default=100)
    confidence_score = Column(Float, nullable=False, default=0.95)
    audit_required = Column(Boolean, default=False)
    eip712_nonce = Column(Integer, nullable=True)
    voucher_signature = Column(String(140), nullable=True)
    kiosk_id = Column(String(50), nullable=True, default="KIOSK-RPI-01")
    thermal_receipt_payload = Column(Text, nullable=True)
    transaction_hash = Column(String(66), nullable=True, unique=True, index=True)
    is_processed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_wallet_created", "wallet_address", "created_at"),
    )


class UserDeposit(Base):
    """Kullanıcı teminat (Stake) kayıtları"""
    __tablename__ = "user_deposits"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), nullable=False, unique=True, index=True)
    deposit_amount = Column(Float, nullable=False)
    deposit_token = Column(String(42), nullable=False)
    transaction_hash = Column(String(66), nullable=True, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class PenaltyRecord(Base):
    """Slashing (Ceza), İtibar Kesintisi ve Fon Dağıtım Kayıtları"""
    __tablename__ = "penalty_records"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    penalty_type = Column(String(50), nullable=False)
    penalty_amount = Column(Float, nullable=False)
    reputation_before = Column(Integer, nullable=False, default=100)
    reputation_after = Column(Integer, nullable=False, default=50)
    inspector_address = Column(String(42), nullable=True)
    inspector_reward = Column(Float, nullable=False, default=0.0)
    treasury_share = Column(Float, nullable=False, default=0.0)
    description = Column(Text, nullable=True)
    transaction_hash = Column(String(66), nullable=True, unique=True, index=True)
    is_paid = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)


class VirtualCardTransaction(Base):
    """EcoCivic Ön Ödemeli Sanal Kart (BaaS) Dönüşüm ve MCC Harcama Kayıtları"""
    __tablename__ = "virtual_card_transactions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    tx_type = Column(String(20), nullable=False)  # CONVERT_LOAD veya MCC_SPEND
    belt_burned = Column(Float, nullable=False, default=0.0)
    amount_try = Column(Float, nullable=False)
    balance_after_try = Column(Float, nullable=False)
    mcc_code = Column(String(10), nullable=True)
    merchant_name = Column(String(120), nullable=True)
    auth_code = Column(String(32), nullable=False)
    blockchain_tx_hash = Column(String(66), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
