import os
from dotenv import load_dotenv

load_dotenv()

# ==============================
# APP & SERVER CONFIG
# ==============================
APP_NAME = "EcoCivic Hybrid Trust AI & Game Theory Oracle"
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", 5000))

# ==============================
# DATABASE CONFIG (PostgreSQL / SQLite Fallback)
# ==============================
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///ecocivic.db")

# ==============================
# AI / OCR & ANTI-SPOOFING CONFIG
# ==============================
AI_MODEL_PROVIDER = os.getenv("AI_MODEL_PROVIDER", "local-pipeline")
AI_MODEL_NAME = os.getenv("AI_MODEL_NAME", "opencv-tesseract-v2")
AI_CONFIDENCE_THRESHOLD = float(os.getenv("AI_CONFIDENCE_THRESHOLD", 0.75))

# ==============================
# BLOCKCHAIN & EIP-712 ORACLE CONFIG
# ==============================
CHAIN_ID = int(os.getenv("CHAIN_ID", 31337))
BLOCKCHAIN_RPC_URL = os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545")

BELT_TOKEN_ADDRESS = os.getenv(
    "BELT_TOKEN_ADDRESS", "0x5FbDB2315678afecb367f032d93F642f64180aa3"
)
CITIZEN_REPUTATION_ADDRESS = os.getenv(
    "CITIZEN_REPUTATION_ADDRESS", "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
)
RECYCLING_REWARDS_ADDRESS = os.getenv(
    "RECYCLING_REWARDS_ADDRESS", "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
)
WATER_BILLING_ADDRESS = os.getenv(
    "WATER_BILLING_ADDRESS", "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
)
DEPOSIT_CONTRACT_ADDRESS = os.getenv(
    "DEPOSIT_CONTRACT_ADDRESS", "0x0165878A594ca255338adfa4d48449f69242Eb8F"
)
SLASHING_MANAGER_ADDRESS = os.getenv(
    "SLASHING_MANAGER_ADDRESS", "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"
)

# Default Hardhat Account #1 (Oracle Signer Role in deploy.js) for local development
DEFAULT_DEV_ORACLE_KEY = (
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
)
ORACLE_PRIVATE_KEY = os.getenv(
    "ORACLE_PRIVATE_KEY",
    os.getenv("BACKEND_WALLET_PRIVATE_KEY", DEFAULT_DEV_ORACLE_KEY),
)

VOUCHER_DEADLINE_SECONDS = int(os.getenv("VOUCHER_DEADLINE_SECONDS", 3600))

# ==============================
# QR & KIOSK CONFIG
# ==============================
QR_TOKEN_EXPIRY_HOURS = int(os.getenv("QR_TOKEN_EXPIRY_HOURS", 3))
QR_SECRET_KEY = os.getenv(
    "QR_SECRET_KEY", "ecocivic-municipal-hmac-secret-key-2026-v1"
)

# ==============================
# SECURITY
# ==============================
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-key")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 60))

if not DEBUG and JWT_SECRET_KEY == "super-secret-key":
    raise RuntimeError(
        "In production (DEBUG=false), you MUST set a strong JWT_SECRET_KEY in the environment."
    )
