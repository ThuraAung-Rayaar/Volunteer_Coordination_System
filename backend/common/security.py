"""
Security utilities for the Volunteer Coordination System.

Provides:
- Phone number normalization, HMAC hashing, and Fernet encryption
- OTP code hashing
- QR token generation and hashing
- Sensitive data redaction for logging
- Secure comparison helpers

All cryptographic operations use keys from Django settings:
- PHONE_HASH_HMAC_SECRET: For HMAC-SHA256 phone hashing and OTP code hashing
- PHONE_ENCRYPTION_KEY: For Fernet encryption of phone numbers
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)


# =============================================================================
# PHONE NUMBER HANDLING
# =============================================================================

def normalize_phone(raw_phone: str) -> str:
    """
    Normalize a phone number to E.164-like format.

    Strips spaces, hyphens, parentheses, and dots.
    Validates that the result contains 7-15 digits.
    Preserves leading '+' if present.

    Args:
        raw_phone: The raw phone number string.

    Returns:
        Normalized phone string.

    Raises:
        ValidationError: If the phone number is invalid (inherits from DomainError and ValueError).
    """
    from common.exceptions import ValidationError

    if not raw_phone:
        raise ValidationError("Phone number cannot be empty", code="invalid_phone")

    cleaned = re.sub(r"[\s\-\(\)\.]", "", raw_phone.strip())

    has_plus = cleaned.startswith("+")
    digits_only = cleaned.lstrip("+")

    if not digits_only.isdigit():
        raise ValidationError("Phone number contains invalid characters", code="invalid_phone")

    if not (7 <= len(digits_only) <= 15):
        raise ValidationError("Phone number must have 7-15 digits", code="invalid_phone")

    return ("+" if has_plus else "") + digits_only


def compute_phone_hash(phone: str) -> str:
    """
    Compute HMAC-SHA256 hash of a normalized phone number.

    The result is a 64-character hex string, satisfying the database
    constraint ck_users_phone_hash_len (32-128 chars).

    Args:
        phone: Raw or normalized phone number.

    Returns:
        64-character hex HMAC-SHA256 hash.
    """
    normalized = normalize_phone(phone)
    secret = settings.PHONE_HASH_HMAC_SECRET
    return hmac.new(
        secret.encode("utf-8"),
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


# Alias for compute_phone_hash
hash_phone = compute_phone_hash


def encrypt_phone(phone: str) -> str:
    """
    Encrypt a normalized phone number using Fernet symmetric encryption.

    Args:
        phone: Raw or normalized phone number.

    Returns:
        Fernet-encrypted token string.
    """
    from cryptography.fernet import Fernet

    normalized = normalize_phone(phone)
    fernet = Fernet(settings.PHONE_ENCRYPTION_KEY.encode("utf-8"))
    return fernet.encrypt(normalized.encode("utf-8")).decode("utf-8")


def decrypt_phone(token: Optional[str]) -> Optional[str]:
    """
    Decrypt a Fernet-encrypted phone number.

    Args:
        token: Fernet-encrypted token, or None.

    Returns:
        Decrypted phone string, or None if token is None/empty.
    """
    if not token:
        return None

    from cryptography.fernet import Fernet, InvalidToken

    try:
        fernet = Fernet(settings.PHONE_ENCRYPTION_KEY.encode("utf-8"))
        return fernet.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.error("Failed to decrypt phone token (invalid key or corrupted data)")
        return None


# =============================================================================
# OTP CODE HANDLING
# =============================================================================

def compute_otp_hash(raw_code: str) -> str:
    """
    Compute HMAC-SHA256 hash of an OTP code.

    Args:
        raw_code: The raw OTP code string (e.g., "1234").

    Returns:
        64-character hex HMAC-SHA256 hash.
    """
    secret = settings.PHONE_HASH_HMAC_SECRET
    return hmac.new(
        secret.encode("utf-8"),
        raw_code.strip().encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_otp_code(length: int = 4) -> str:
    """
    Generate a cryptographically secure numeric OTP code.

    Args:
        length: Number of digits (default 4).

    Returns:
        Numeric string of the specified length.
    """
    max_val = 10 ** length
    code = secrets.randbelow(max_val)
    return str(code).zfill(length)


# =============================================================================
# QR TOKEN HANDLING
# =============================================================================

def generate_raw_qr_token() -> tuple[str, str]:
    """
    Generate a raw QR token and its SHA-256 hash.

    The raw token is returned to the client once (for QR code display).
    Only the hash is stored in the database.

    Returns:
        Tuple of (raw_token, token_hash).
        raw_token: URL-safe base64 string (43 characters).
        token_hash: 64-character hex SHA-256 hash.
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_qr_token(raw_token)
    return raw_token, token_hash


def hash_qr_token(raw_token: str) -> str:
    """
    Compute SHA-256 hash of a raw QR token.

    Args:
        raw_token: The raw token string.

    Returns:
        64-character hex SHA-256 hash.
    """
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


# =============================================================================
# DATA REDACTION
# =============================================================================

SENSITIVE_FIELDS = frozenset({
    "phone_enc",
    "phone_hash",
    "password",
    "emergency_contact_phone_enc",
    "token_hash",
    "code_hash",
    "checkin_latitude",
    "checkin_longitude",
})


def redact_sensitive_data(data: dict) -> dict:
    """
    Remove sensitive fields from a dictionary for safe logging.

    Args:
        data: Dictionary that may contain sensitive fields.

    Returns:
        New dictionary with sensitive fields removed.
    """
    return {k: v for k, v in data.items() if k not in SENSITIVE_FIELDS}


def safe_log_context(**kwargs) -> dict:
    """
    Build a safe logging context, redacting any sensitive values.

    Usage:
        logger.info("User action", extra=safe_log_context(user_id=1, action="checkin"))
    """
    return redact_sensitive_data(kwargs)

