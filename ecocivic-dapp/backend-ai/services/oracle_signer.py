"""
EIP-712 Cryptographic Voucher Signer Service
Faz 1 Akıllı Kontratları (WaterBilling.sol & RecyclingRewards.sol) ile birebir uyumlu
EIP-712 Typed Data imzalama ve doğrulama servisi.
"""
import time
from typing import Any, Dict, Optional

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from config import (
    CHAIN_ID,
    ORACLE_PRIVATE_KEY,
    RECYCLING_REWARDS_ADDRESS,
    VOUCHER_DEADLINE_SECONDS,
    WATER_BILLING_ADDRESS,
)


MATERIAL_ENUM_MAP = {
    "glass": 0,
    "paper": 1,
    "metal": 2,
}


def get_oracle_signer_address(private_key: Optional[str] = None) -> str:
    """Yetkili AI Oracle imzalayıcı cüzdan adresini döner."""
    key = private_key or ORACLE_PRIVATE_KEY
    account = Account.from_key(key)
    return account.address


def sign_water_reading_voucher(
    citizen_address: str,
    current_reading: int,
    meter_id: str,
    nonce: int,
    deadline: Optional[int] = None,
    chain_id: Optional[int] = None,
    verifying_contract: Optional[str] = None,
    private_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    WaterBilling.sol kontratındaki WATER_VOUCHER_TYPEHASH ile birebir uyumlu
    EIP-712 WaterVoucher imzası üretir:
    WaterVoucher(address citizen,uint256 currentReading,string meterId,uint256 nonce,uint256 deadline)
    """
    key = private_key or ORACLE_PRIVATE_KEY
    cid = int(chain_id if chain_id is not None else CHAIN_ID)
    contract_addr = Web3.to_checksum_address(verifying_contract or WATER_BILLING_ADDRESS)
    citizen_checksum = Web3.to_checksum_address(citizen_address)
    exp_deadline = int(deadline if deadline is not None else int(time.time()) + VOUCHER_DEADLINE_SECONDS)

    domain_data = {
        "name": "EcoCivicWaterBilling",
        "version": "1",
        "chainId": cid,
        "verifyingContract": contract_addr,
    }

    message_types = {
        "WaterVoucher": [
            {"name": "citizen", "type": "address"},
            {"name": "currentReading", "type": "uint256"},
            {"name": "meterId", "type": "string"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ]
    }

    message_data = {
        "citizen": citizen_checksum,
        "currentReading": int(current_reading),
        "meterId": str(meter_id),
        "nonce": int(nonce),
        "deadline": exp_deadline,
    }

    signable = encode_typed_data(
        domain_data=domain_data,
        message_types=message_types,
        message_data=message_data,
    )
    signed = Account.sign_message(signable, private_key=key)
    sig_hex = signed.signature.hex()
    if not sig_hex.startswith("0x"):
        sig_hex = f"0x{sig_hex}"

    return {
        "voucher_type": "WaterReadingVoucher",
        "domain": domain_data,
        "voucher": message_data,
        "nonce": int(nonce),
        "deadline": exp_deadline,
        "signature": sig_hex,
        "signer_address": Account.from_key(key).address,
    }


def verify_water_reading_voucher(
    voucher_payload: Dict[str, Any],
    signature: str,
    chain_id: Optional[int] = None,
    verifying_contract: Optional[str] = None,
) -> str:
    """EIP-712 WaterVoucher imzasından imzalayan adresi (ECDSA recover) kurtarır."""
    cid = int(chain_id if chain_id is not None else CHAIN_ID)
    contract_addr = Web3.to_checksum_address(verifying_contract or WATER_BILLING_ADDRESS)

    domain_data = {
        "name": "EcoCivicWaterBilling",
        "version": "1",
        "chainId": cid,
        "verifyingContract": contract_addr,
    }
    message_types = {
        "WaterVoucher": [
            {"name": "citizen", "type": "address"},
            {"name": "currentReading", "type": "uint256"},
            {"name": "meterId", "type": "string"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ]
    }
    signable = encode_typed_data(
        domain_data=domain_data,
        message_types=message_types,
        message_data=voucher_payload,
    )
    return Account.recover_message(signable, signature=signature)


def sign_recycling_voucher(
    citizen_address: str,
    material_type: str | int,
    amount_wei: int,
    qr_hash: str,
    nonce: int,
    deadline: Optional[int] = None,
    chain_id: Optional[int] = None,
    verifying_contract: Optional[str] = None,
    private_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    RecyclingRewards.sol kontratındaki RECYCLING_VOUCHER_TYPEHASH ile birebir uyumlu
    EIP-712 RecyclingVoucher imzası üretir:
    RecyclingVoucher(address citizen,uint8 material,uint256 amount,string qrHash,uint256 nonce,uint256 deadline)
    """
    key = private_key or ORACLE_PRIVATE_KEY
    cid = int(chain_id if chain_id is not None else CHAIN_ID)
    contract_addr = Web3.to_checksum_address(verifying_contract or RECYCLING_REWARDS_ADDRESS)
    citizen_checksum = Web3.to_checksum_address(citizen_address)
    exp_deadline = int(deadline if deadline is not None else int(time.time()) + VOUCHER_DEADLINE_SECONDS)

    if isinstance(material_type, str):
        mat_key = material_type.strip().lower()
        if mat_key not in MATERIAL_ENUM_MAP:
            raise ValueError(f"Unsupported material type: {material_type}")
        material_enum = MATERIAL_ENUM_MAP[mat_key]
    else:
        material_enum = int(material_type)
        if material_enum not in (0, 1, 2):
            raise ValueError(f"Invalid material enum value: {material_enum}")

    domain_data = {
        "name": "EcoCivicRecyclingRewards",
        "version": "1",
        "chainId": cid,
        "verifyingContract": contract_addr,
    }

    message_types = {
        "RecyclingVoucher": [
            {"name": "citizen", "type": "address"},
            {"name": "material", "type": "uint8"},
            {"name": "amount", "type": "uint256"},
            {"name": "qrHash", "type": "string"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ]
    }

    message_data = {
        "citizen": citizen_checksum,
        "material": material_enum,
        "amount": int(amount_wei),
        "qrHash": str(qr_hash),
        "nonce": int(nonce),
        "deadline": exp_deadline,
    }

    signable = encode_typed_data(
        domain_data=domain_data,
        message_types=message_types,
        message_data=message_data,
    )
    signed = Account.sign_message(signable, private_key=key)
    sig_hex = signed.signature.hex()
    if not sig_hex.startswith("0x"):
        sig_hex = f"0x{sig_hex}"

    return {
        "voucher_type": "RecyclingVoucher",
        "domain": domain_data,
        "voucher": message_data,
        "nonce": int(nonce),
        "deadline": exp_deadline,
        "signature": sig_hex,
        "signer_address": Account.from_key(key).address,
    }


def verify_recycling_voucher(
    voucher_payload: Dict[str, Any],
    signature: str,
    chain_id: Optional[int] = None,
    verifying_contract: Optional[str] = None,
) -> str:
    """EIP-712 RecyclingVoucher imzasından imzalayan adresi (ECDSA recover) kurtarır."""
    cid = int(chain_id if chain_id is not None else CHAIN_ID)
    contract_addr = Web3.to_checksum_address(verifying_contract or RECYCLING_REWARDS_ADDRESS)

    domain_data = {
        "name": "EcoCivicRecyclingRewards",
        "version": "1",
        "chainId": cid,
        "verifyingContract": contract_addr,
    }
    message_types = {
        "RecyclingVoucher": [
            {"name": "citizen", "type": "address"},
            {"name": "material", "type": "uint8"},
            {"name": "amount", "type": "uint256"},
            {"name": "qrHash", "type": "string"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
        ]
    }
    signable = encode_typed_data(
        domain_data=domain_data,
        message_types=message_types,
        message_data=voucher_payload,
    )
    return Account.recover_message(signable, signature=signature)
