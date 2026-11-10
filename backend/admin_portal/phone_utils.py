"""
Phone number normalization and identity resolution utilities for Myanmar numbers
and SHA-256 HMAC phone hashes in the Admin Control Center.
"""

from __future__ import annotations

import re
from typing import Optional

from apps.accounts.models import Users
from common.security import compute_phone_hash, decrypt_phone, encrypt_phone


class PhoneResolutionResult(tuple):
    """
    Result tuple of (user, phone_hash, canonical_phone).
    Supports 3-element unpacking: user, p_hash, canonical = res
    Supports attribute access: res.user, res.phone_hash, res.canonical
    """

    def __new__(cls, user: Optional[Users], phone_hash: str, canonical: str = ""):
        return super().__new__(cls, (user, phone_hash, canonical))

    @property
    def user(self) -> Optional[Users]:
        return self[0]

    @property
    def phone_hash(self) -> str:
        return self[1]

    @property
    def canonical(self) -> str:
        return self[2]


def normalize_myanmar_phone(raw_input: str) -> str:
    """
    Normalize any Myanmar phone input (+959, +9509, 09, 9, 959, 9509) into canonical '+959<digits>'.

    Strips whitespace, hyphens, parentheses, and dots.
    Raises ValueError with a clear message if invalid.
    """
    if not raw_input:
        raise ValueError("Phone number is required.")

    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(raw_input).strip())
    if not cleaned:
        raise ValueError("Phone number is required.")

    digits = cleaned.lstrip("+")
    if not digits.isdigit():
        raise ValueError("Phone number must contain only digits and optional leading '+'.")

    if digits.startswith("9509"):
        subscriber = digits[4:]
    elif digits.startswith("959"):
        subscriber = digits[3:]
    elif digits.startswith("09"):
        subscriber = digits[2:]
    elif digits.startswith("9"):
        subscriber = digits[1:]
    else:
        raise ValueError("Myanmar phone number must start with +959, +9509, 09, or 9.")

    if not (7 <= len(subscriber) <= 10):
        raise ValueError("Myanmar subscriber number must be between 7 and 10 digits after prefix.")

    return f"+959{subscriber}"


def resolve_user_by_phone_or_hash(raw_identifier: str) -> PhoneResolutionResult:
    """
    Resolve a Users row from either:
      1. A 64-char hex phone_hash directly
      2. A Myanmar phone number (+959, +9509, 09, 9, 959, 9509) via HMAC compute_phone_hash
      3. Fallback scan of phone_enc (for rows seeded via raw SQL psql scripts)

    Returns (user, p_hash, canonical) (with canonical as "" if raw hash was entered).
    """
    ident = (raw_identifier or "").strip()
    if not ident:
        raise ValueError("Phone number or hash is required.")

    if re.fullmatch(r"[0-9a-fA-F]{64}", ident):
        p_hash = ident.lower()
        user = Users.objects.filter(phone_hash=p_hash).first()
        return PhoneResolutionResult(user, p_hash, "")

    canonical = normalize_myanmar_phone(ident)
    p_hash = compute_phone_hash(canonical)
    user = Users.objects.filter(phone_hash=p_hash).first()
    if user:
        return PhoneResolutionResult(user, p_hash, canonical)

    # Fallback for externally SQL-seeded users whose phone_enc or phone_hash used a different format
    alt_local = "09" + canonical[4:]  # e.g. 09100000001
    for candidate in Users.objects.all():
        dec = decrypt_phone(candidate.phone_enc) or candidate.phone_enc or ""
        dec_clean = re.sub(r"[\s\-\(\)\.]", "", str(dec))
        if dec_clean in (canonical, alt_local, canonical.lstrip("+")):
            return PhoneResolutionResult(candidate, candidate.phone_hash, canonical)

    return PhoneResolutionResult(None, p_hash, canonical)
