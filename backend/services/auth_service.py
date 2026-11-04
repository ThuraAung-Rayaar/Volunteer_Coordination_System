"""
services/auth_service.py

Authentication workflows: OTP request, OTP verification, token issuance, logout.
All OTP logic delegates to PostgreSQL stored functions (request_otp, verify_otp).
This service never stores or logs raw OTP codes beyond the delivery adapter.
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.accounts.models import Users
from common.exceptions import DomainError, translate_db_exception
from common.utils import (
    compute_otp_hash,
    compute_phone_hash,
    encrypt_phone,
    normalize_phone,
)

logger = logging.getLogger(__name__)

# OTP code length for the prototype (4 digits per business rules).
OTP_CODE_LENGTH = 4


# ---------------------------------------------------------------------------
# OTP Delivery Adapter
# ---------------------------------------------------------------------------

class OtpDeliveryAdapter:
    """
    Abstract adapter for delivering OTP codes to the user.

    In production this would integrate with an SMS/email provider.
    For the prototype, the ConsoleOtpDeliveryAdapter is used, which
    does NOT actually send anything — it only records that delivery
    was attempted. The caller decides whether to include the code
    in the API response (DEBUG mode only).
    """

    def deliver(self, phone_enc: str, raw_code: str, purpose: str) -> dict:
        raise NotImplementedError


class ConsoleOtpDeliveryAdapter(OtpDeliveryAdapter):
    """
    Development adapter. Logs the intent but does not send a real SMS.
    Returns a dict indicating delivery was NOT actually performed.
    """

    def deliver(self, phone_enc: str, raw_code: str, purpose: str) -> dict:
        # Do NOT log the raw code in production. For dev visibility,
        # the code is returned in the API response when DEBUG=True.
        logger.info("OTP delivery requested (purpose=%s). No SMS provider configured.", purpose)
        return {"delivered": False, "method": "console", "provider_configured": False}


# The active delivery adapter. Replace with a real SMS adapter in production.
_otp_delivery_adapter: OtpDeliveryAdapter = ConsoleOtpDeliveryAdapter()


def set_otp_delivery_adapter(adapter: OtpDeliveryAdapter) -> None:
    """Allow tests or production config to swap the delivery adapter."""
    global _otp_delivery_adapter
    _otp_delivery_adapter = adapter


def get_otp_delivery_adapter() -> OtpDeliveryAdapter:
    """Return the active OTP delivery adapter."""
    return _otp_delivery_adapter


# ---------------------------------------------------------------------------
# OTP Request
# ---------------------------------------------------------------------------

def request_login_otp(raw_phone: str, purpose: str = "login") -> dict:
    """
    Request a login OTP for the given phone number.

    Steps:
      1. Normalize phone and compute phone_hash.
      2. Check existing account status (closed -> reject, blocked -> maybe release).
      3. Generate a 4-digit code and hash it.
      4. Call PostgreSQL request_otp() which enforces rate limits via trigger.
      5. Attempt delivery via the configured adapter.
      6. Return a safe response. Never expose the code unless DEBUG.

    Returns:
        {"status": "sent", "delivery": {...}, "dev_code": "..."} when settings.DEBUG
        {"status": "sent", "delivery": {...}} otherwise
    """
    phone = normalize_phone(raw_phone)
    phone_hash = compute_phone_hash(phone)

    # Check account status for existing users
    user = Users.objects.filter(phone_hash=phone_hash).first()
    if user is not None:
        if user.account_status == "closed":
            raise DomainError(
                code="account_closed",
                message="This account has been closed.",
                status_code=403,
            )
        if user.account_status == "blocked":
            # Attempt lazy block release
            with connection.cursor() as cursor:
                cursor.execute("SELECT release_expired_blocks()")
            user.refresh_from_db()
            if user.account_status == "blocked":
                raise DomainError(
                    code="account_blocked",
                    message="This account is currently blocked.",
                    status_code=403,
                )

    # Generate OTP code
    if settings.DEBUG and getattr(settings, "DEV_FIXED_OTP", None):
        raw_code = str(settings.DEV_FIXED_OTP)
    else:
        raw_code = f"{secrets.randbelow(10 ** OTP_CODE_LENGTH):0{OTP_CODE_LENGTH}d}"

    code_hash = compute_otp_hash(raw_code)

    # Call the database function. Rate limiting is enforced by trg_01_otp_rate_limit.
    # If rate limit is exceeded, PostgreSQL raises 'otp_rate_limited' which is
    # translated by translate_db_exception into OtpRateLimitError (HTTP 429).
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT request_otp(%s, %s, %s)",
                [phone_hash, code_hash, purpose],
            )
            _otp_id = cursor.fetchone()[0]
    except Exception as exc:
        raise translate_db_exception(exc)

    # Attempt delivery (does not actually send in prototype)
    phone_enc = encrypt_phone(phone)
    delivery_result = _otp_delivery_adapter.deliver(phone_enc, raw_code, purpose)

    response = {"status": "sent", "delivery": delivery_result}
    if settings.DEBUG:
        response["dev_code"] = raw_code

    return response


# ---------------------------------------------------------------------------
# OTP Verification
# ---------------------------------------------------------------------------

def verify_login_otp(
    raw_phone: str,
    raw_code: str,
    purpose: str = "login",
    display_name: Optional[str] = None,
) -> dict:
    """
    Verify an OTP and establish authenticated identity.

    Steps:
      1. Normalize phone and hash code.
      2. Call PostgreSQL verify_otp() which returns a result code.
      3. If 'ok': find or create user, check account status, issue token.
      4. If not 'ok': return the result code for the caller to translate.

    The caller (BFF view) is responsible for committing the transaction
    so that attempt_count increments persist even on failure.

    Returns:
        {"ok": True, "result": "ok", "token": "...", "user": Users}
        {"ok": False, "result": "<code>"}
    """
    phone = normalize_phone(raw_phone)
    phone_hash = compute_phone_hash(phone)
    code_hash = compute_otp_hash(raw_code.strip())

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT verify_otp(%s, %s, %s)",
            [phone_hash, code_hash, purpose],
        )
        result = cursor.fetchone()[0]

    if result != "ok":
        # Return the failure code. The transaction must still commit
        # so that attempt_count increments are persisted.
        return {"ok": False, "result": result}

    # OTP verified successfully. Release any expired blocks, then find/create user.
    with connection.cursor() as cursor:
        cursor.execute("SELECT release_expired_blocks()")

    user = Users.objects.filter(phone_hash=phone_hash).first()

    if user is None:
        # First-time registration
        clean_name = (display_name or "Volunteer").strip()[:150]
        user = Users(
            phone_hash=phone_hash,
            phone_enc=encrypt_phone(phone),
            display_name=clean_name,
            password=None,  # OTP-only user; DB allows NULL password
        )
        user.save()

    # Check account status after potential block release
    if user.account_status != "active" or not user.is_active:
        raise DomainError(
            code="account_blocked",
            message="This account is blocked or closed.",
            status_code=403,
        )

    # Update last_login
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    # Issue DRF token (existing token mechanism, not a second auth system)
    token, _created = Token.objects.get_or_create(user=user)

    return {"ok": True, "result": "ok", "token": token.key, "user": user}


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

def logout_user(user: Users, auth_token=None) -> None:
    """
    Invalidate the user's authentication token.

    Args:
        user: The authenticated user.
        auth_token: The DRF Token instance from request.auth.
    """
    if auth_token is not None:
        auth_token.delete()
    else:
        Token.objects.filter(user=user).delete()

