# apps/common/security.py
import base64
import hashlib
import hmac
import re
import secrets

from cryptography.fernet import Fernet
from django.conf import settings


def _secret() -> bytes:
    secret = getattr(settings, "PHONE_HASH_HMAC_SECRET", None)
    if not secret:
        raise RuntimeError("PHONE_HASH_HMAC_SECRET is not configured.")
    return str(secret).encode("utf-8")


def normalize_phone(raw_phone: str) -> str:
    """
    Minimal phone normalization.
    Keep leading + if present, otherwise digits only.
    """
    raw_phone = (raw_phone or "").strip()
    if raw_phone.startswith("+"):
        digits = re.sub(r"[^\d]", "", raw_phone[1:])
        return f"+{digits}"
    digits = re.sub(r"[^\d]", "", raw_phone)
    return digits


def compute_phone_hash(raw_phone: str) -> str:
    normalized = normalize_phone(raw_phone)
    return hmac.new(
        _secret(),
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _fernet() -> Fernet:
    key_material = hashlib.sha256(_secret()).digest()
    key = base64.urlsafe_b64encode(key_material)
    return Fernet(key)


def encrypt_phone(raw_phone: str) -> str:
    normalized = normalize_phone(raw_phone)
    return _fernet().encrypt(normalized.encode("utf-8")).decode("utf-8")


def decrypt_phone(encrypted_phone: str) -> str:
    return _fernet().decrypt(encrypted_phone.encode("utf-8")).decode("utf-8")


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(raw_code: str) -> str:
    return hmac.new(
        _secret(),
        str(raw_code).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_raw_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

