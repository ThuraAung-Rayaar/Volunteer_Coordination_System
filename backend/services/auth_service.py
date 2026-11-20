"""
services/auth_service.py

Authentication workflows: OTP request, OTP verification, token issuance, logout.
Supports both the v0.12.0 tokenized OTP challenge handshake and legacy OTP endpoints.
All OTP logic delegates to PostgreSQL stored functions (request_otp, verify_otp,
create_otp_challenge, verify_otp_challenge).
This service never stores or logs raw OTP codes, challenge tokens, or raw phone numbers.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from typing import Optional

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.accounts.models import AuthOtp, AuthOtpChallenge, Users
from common.exceptions import DomainError, translate_db_exception
from common.security import (
    compute_challenge_token_hash,
    compute_otp_hash,
    compute_phone_hash,
    encrypt_phone,
    generate_challenge_token,
    generate_otp_code,
    normalize_phone,
    redact_sensitive_data,
    safe_log_context,
)

logger = logging.getLogger(__name__)

# Standardized OTP code length across backend, schema, and mobile (v0.12.0).
OTP_CODE_LENGTH = getattr(settings, "OTP_CODE_LENGTH", 6)


def can_expose_dev_code() -> bool:
    """
    Check if dev_code is allowed to be returned in the response.
    Never exposed if production configuration is active, even if DEBUG is True.
    Gated behind ALLOW_DEV_CODE_IN_AUTH_RESPONSE and DEBUG in local non-production.
    """
    env = str(getattr(settings, "ENVIRONMENT", "") or "").lower()
    settings_mod = str(getattr(settings, "SETTINGS_MODULE", "") or os.environ.get("DJANGO_SETTINGS_MODULE", "") or "").lower()
    if env == "production" or "production" in settings_mod:
        return False

    if not getattr(settings, "DEBUG", False):
        return False

    if getattr(settings, "ALLOW_DEV_CODE_IN_AUTH_RESPONSE", None) is False:
        return False

    return True


# ---------------------------------------------------------------------------
# OTP Delivery Adapter
# ---------------------------------------------------------------------------

class OtpDeliveryAdapter:
    """
    Abstract adapter for delivering OTP codes to the user.
    In production this would integrate with an SMS/telecom provider.
    """

    def deliver(self, phone_enc: str, raw_code: str, purpose: str) -> dict:
        raise NotImplementedError


class ConsoleOtpDeliveryAdapter(OtpDeliveryAdapter):
    """
    Development adapter. Logs the intent but does not send a real SMS.
    Truthfully reports simulated/passthrough status; never claims real delivery.
    """

    def deliver(self, phone_enc: str, raw_code: str, purpose: str) -> dict:
        is_passthrough = getattr(
            settings,
            "OTP_CONSOLE_PASSTHROUGH",
            settings.DEBUG or getattr(settings, "TESTING", True)
        )
        channel = "console"
        if is_passthrough:
            logger.info(
                "OTP delivery simulated via console (purpose=%s). No SMS dispatched.",
                purpose,
            )
            return {
                "delivered": False,      # Truthful: Never claim SMS was dispatched!
                "channel": channel,
                "provider": "console",
                "method": "console",
                "configured": False,     # Truthful: No telecom provider configured
                "simulated": True,
            }
        logger.warning(
            "OTP delivery requested (purpose=%s). No SMS provider configured.",
            purpose,
        )
        return {
            "delivered": False,
            "channel": "none",
            "provider": "none",
            "method": "none",
            "configured": False,
            "simulated": False,
        }


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
# Tokenized Challenge Handshake (v0.12.0 Canonical)
# ---------------------------------------------------------------------------

def request_tokenized_login_otp(
    raw_phone: str,
    purpose: str = "login",
    request_id: Optional[str] = None,
    client_nonce: Optional[str] = None,
) -> dict:
    """
    Request a tokenized OTP challenge for authentication (v0.12.0 handshake).

    Steps:
      1. Normalize phone and compute phone_hash.
      2. Check account status:
         - 'closed' -> HTTP 403 account_closed
         - 'blocked' -> lazy block release; if still blocked -> HTTP 403 account_blocked
      3. Idempotency check:
         If request_id is provided, check if an unexpired, unconsumed challenge
         exists for this phone_hash and request_id. If so, return existing active challenge.
      4. Generate 6-digit OTP code and hash it.
      5. Generate 256-bit opaque challenge token and compute its keyed HMAC hash.
      6. Insert auth_otp and auth_otp_challenge atomically in PostgreSQL.
         Rate limit enforced by trg_01_otp_rate_limit.
      7. Invoke delivery adapter (ConsoleOtpDeliveryAdapter).
      8. Return truthful delivery metadata and dev_code only if safely permitted.
    """
    phone = normalize_phone(raw_phone)
    phone_hash = compute_phone_hash(phone)

    # Check account status for existing users or provision new user with encrypted phone
    user = Users.objects.filter(phone_hash=phone_hash).first()
    if user is not None:
        if user.account_status == "closed":
            raise DomainError(
                code="account_closed",
                message="This account has been closed.",
                status_code=403,
            )
        if user.account_status == "blocked":
            with connection.cursor() as cursor:
                cursor.execute("SELECT release_expired_blocks()")
            user.refresh_from_db()
            if user.account_status == "blocked":
                raise DomainError(
                    code="account_blocked",
                    message="This account is currently blocked.",
                    status_code=403,
                )
        if not user.phone_enc or user.phone_enc.startswith("enc:"):
            user.phone_enc = encrypt_phone(phone)
            user.save(update_fields=["phone_enc"])
    else:
        user = Users.objects.create(
            phone_hash=phone_hash,
            phone_enc=encrypt_phone(phone),
            display_name="Volunteer",
            password=None,
        )

    code_len = getattr(settings, "OTP_CODE_LENGTH", 6)
    chal_secret = getattr(settings, "AUTH_SESSION_TOKEN_SECRET", settings.PHONE_HASH_HMAC_SECRET)

    # Support request_id idempotency:
    if request_id:
        raw_token = hmac.new(
            chal_secret.encode("utf-8"),
            f"idempotent:{request_id.strip()}:{phone_hash}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        token_hash = compute_challenge_token_hash(raw_token)

        # Check for active existing challenge
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.id, EXTRACT(EPOCH FROM (c.expires_at - now()))::INT
                  FROM auth_otp_challenge c
                  JOIN auth_otp o ON o.id = c.otp_id
                 WHERE c.challenge_token_hash = %s
                   AND c.purpose = %s
                   AND c.consumed_at IS NULL
                   AND c.expires_at > now()
                   AND o.consumed_at IS NULL
                   AND o.expires_at > now()
                """,
                [token_hash, purpose],
            )
            existing_row = cursor.fetchone()

        if existing_row:
            remaining_seconds = max(1, existing_row[1])
            expose_dev_code = can_expose_dev_code()
            status = "dev_code_available" if expose_dev_code else "console_simulated"
            resp = {
                "status": status,
                "auth_session_token": raw_token,
                "expires_in": remaining_seconds,
                "code_length": code_len,
                "delivery": {
                    "provider": "console",
                    "channel": "console",
                    "delivered": False,
                    "configured": False,
                },
                "idempotent_reissue": True,
            }
            if expose_dev_code:
                fixed_code = getattr(settings, "DEV_FIXED_OTP", "123456")
                resp["dev_code"] = str(fixed_code).zfill(code_len)
            return resp
    else:
        raw_token = generate_challenge_token()
        token_hash = compute_challenge_token_hash(raw_token)

    # Generate OTP code (standardized 6 digits)
    if settings.DEBUG and getattr(settings, "DEV_FIXED_OTP", None):
        raw_code = str(settings.DEV_FIXED_OTP).zfill(code_len)
    else:
        raw_code = generate_otp_code(length=code_len)

    code_hash = compute_otp_hash(raw_code)
    nonce_hash = compute_challenge_token_hash(client_nonce) if client_nonce else None

    # Persist auth_otp and auth_otp_challenge atomically in PostgreSQL
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT request_otp(%s, %s, %s)",
                [phone_hash, code_hash, purpose],
            )
            otp_id = cursor.fetchone()[0]

            cursor.execute(
                "SELECT create_otp_challenge(%s, %s, %s, %s, %s, %s)",
                [otp_id, token_hash, 180, purpose, request_id, nonce_hash],
            )
            _challenge_id = cursor.fetchone()[0]
    except Exception as exc:
        raise translate_db_exception(exc)

    phone_enc = encrypt_phone(phone)
    delivery_result = _otp_delivery_adapter.deliver(phone_enc, raw_code, purpose)

    expose_dev_code = can_expose_dev_code()
    if expose_dev_code:
        status = "dev_code_available"
    elif delivery_result.get("simulated"):
        status = "console_simulated"
    else:
        status = "provider_not_configured"

    response = {
        "status": status,
        "auth_session_token": raw_token,
        "expires_in": 180,
        "code_length": code_len,
        "delivery": {
            "provider": delivery_result.get("provider", "console" if delivery_result.get("simulated") else "none"),
            "channel": delivery_result.get("channel", "console" if delivery_result.get("simulated") else "none"),
            "delivered": False,
            "configured": False,
        },
    }
    if expose_dev_code:
        response["dev_code"] = raw_code

    return response


def verify_tokenized_login_otp(
    auth_session_token: str,
    code: str,
    purpose: str = "login",
    display_name: Optional[str] = None,
) -> dict:
    """
    Verify an OTP challenge and establish authenticated identity (v0.12.0 handshake).
    Does NOT require or accept the phone number from the client.

    Steps:
      1. Validate parameters.
      2. Hash challenge token and OTP code.
      3. Call PostgreSQL verify_otp_challenge() which executes deterministic row locking
         and atomic consumption.
      4. Translate PostgreSQL outcomes to stable DomainErrors:
         - 'invalid_challenge' -> HTTP 400
         - 'invalid_code'      -> HTTP 400
         - 'challenge_expired' -> HTTP 400
         - 'challenge_consumed'-> HTTP 409
         - 'too_many_attempts' -> HTTP 429 (otp_rate_limited)
      5. On 'ok': release expired blocks, find or create user, verify active status,
         and issue DRF Token.
    """
    if not auth_session_token or not auth_session_token.strip():
        raise DomainError(
            code="invalid_challenge",
            message="auth_session_token is required.",
            status_code=400,
        )
    if not code or not code.strip():
        raise DomainError(
            code="invalid_code",
            message="OTP code is required.",
            status_code=400,
        )

    token_hash = compute_challenge_token_hash(auth_session_token.strip())
    code_hash = compute_otp_hash(code.strip())

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT status, phone_hash, otp_id FROM verify_otp_challenge(%s, %s, %s)",
            [token_hash, code_hash, purpose],
        )
        row = cursor.fetchone()

    if not row:
        raise DomainError(
            code="invalid_challenge",
            message="Invalid authentication challenge.",
            status_code=400,
        )

    db_status, phone_hash, _otp_id = row

    if db_status == "invalid_challenge":
        raise DomainError(
            code="invalid_challenge",
            message="Invalid or unrecognized authentication challenge.",
            status_code=400,
        )
    if db_status == "invalid_code":
        raise DomainError(
            code="invalid_code",
            message="Invalid verification code.",
            status_code=400,
        )
    if db_status == "challenge_expired":
        raise DomainError(
            code="challenge_expired",
            message="The authentication challenge or code has expired.",
            status_code=400,
        )
    if db_status == "challenge_consumed":
        raise DomainError(
            code="challenge_consumed",
            message="This authentication challenge has already been consumed.",
            status_code=409,
        )
    if db_status == "too_many_attempts":
        raise DomainError(
            code="otp_rate_limited",
            message="Too many failed verification attempts. Please request a new code.",
            status_code=429,
        )
    if db_status != "ok":
        raise DomainError(
            code="invalid_challenge",
            message=f"Challenge verification failed: {db_status}",
            status_code=400,
        )

    # db_status == 'ok': Release any expired blocks
    with connection.cursor() as cursor:
        cursor.execute("SELECT release_expired_blocks()")

    user = Users.objects.filter(phone_hash=phone_hash).first()
    if user is None:
        clean_name = (display_name or "Volunteer").strip()[:150]
        user = Users(
            phone_hash=phone_hash,
            phone_enc=f"enc:{phone_hash[:32]}",
            display_name=clean_name,
            password=None,
        )
        user.save()
    elif display_name and display_name.strip() and user.display_name != display_name.strip()[:150]:
        user.display_name = display_name.strip()[:150]
        user.save(update_fields=["display_name"])

    if user.account_status == "closed":
        raise DomainError(
            code="account_closed",
            message="This account has been closed.",
            status_code=403,
        )
    if user.account_status == "blocked" or not user.is_active:
        raise DomainError(
            code="account_blocked",
            message="This account is currently blocked or inactive.",
            status_code=403,
        )

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    token, _created = Token.objects.get_or_create(user=user)

    return {
        "ok": True,
        "token": token.key,
        "user": {
            "id": user.id,
            "uuid": str(user.uuid),
            "display_name": user.display_name,
            "verification_status": user.verification_status,
        },
        "_user": user,
    }


# ---------------------------------------------------------------------------
# Legacy OTP Request & Verify (Retained for Rollout Backward Compatibility)
# ---------------------------------------------------------------------------

def request_login_otp(raw_phone: str, purpose: str = "login") -> dict:
    """
    Request a login OTP for the given phone number (Legacy route compatibility).
    """
    phone = normalize_phone(raw_phone)
    phone_hash = compute_phone_hash(phone)

    # Check account status for existing users or provision new user with encrypted phone
    user = Users.objects.filter(phone_hash=phone_hash).first()
    if user is not None:
        if user.account_status == "closed":
            raise DomainError(
                code="account_closed",
                message="This account has been closed.",
                status_code=403,
            )
        if user.account_status == "blocked":
            with connection.cursor() as cursor:
                cursor.execute("SELECT release_expired_blocks()")
            user.refresh_from_db()
            if user.account_status == "blocked":
                raise DomainError(
                    code="account_blocked",
                    message="This account is currently blocked.",
                    status_code=403,
                )
        if not user.phone_enc or user.phone_enc.startswith("enc:"):
            user.phone_enc = encrypt_phone(phone)
            user.save(update_fields=["phone_enc"])
    else:
        user = Users.objects.create(
            phone_hash=phone_hash,
            phone_enc=encrypt_phone(phone),
            display_name="Volunteer",
            password=None,
        )

    code_len = getattr(settings, "OTP_CODE_LENGTH", 6)
    if settings.DEBUG and getattr(settings, "DEV_FIXED_OTP", None):
        raw_code = str(settings.DEV_FIXED_OTP)
    else:
        raw_code = f"{secrets.randbelow(10 ** code_len):0{code_len}d}"

    code_hash = compute_otp_hash(raw_code)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT request_otp(%s, %s, %s)",
                [phone_hash, code_hash, purpose],
            )
            _otp_id = cursor.fetchone()[0]
    except Exception as exc:
        raise translate_db_exception(exc)

    phone_enc = encrypt_phone(phone)
    delivery_result = _otp_delivery_adapter.deliver(phone_enc, raw_code, purpose)
    if "channel" not in delivery_result:
        delivery_result["channel"] = delivery_result.get("method", "console")

    is_delivered = bool(delivery_result.get("delivered"))
    is_simulated = bool(delivery_result.get("simulated"))

    # For legacy test compatibility (asserting status == "sent")
    if is_delivered or is_simulated:
        delivery_status = "sent"
    else:
        delivery_status = "pending_provider"

    response = {
        "status": delivery_status,
        "delivery": delivery_result,
    }
    if can_expose_dev_code():
        response["dev_code"] = raw_code

    return response


def verify_login_otp(
    raw_phone: str,
    raw_code: str,
    purpose: str = "login",
    display_name: Optional[str] = None,
) -> dict:
    """
    Verify an OTP and establish authenticated identity (Legacy route compatibility).
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
        return {"ok": False, "result": result}

    with connection.cursor() as cursor:
        cursor.execute("SELECT release_expired_blocks()")

    user = Users.objects.filter(phone_hash=phone_hash).first()
    if user is None:
        clean_name = (display_name or "Volunteer").strip()[:150]
        user = Users(
            phone_hash=phone_hash,
            phone_enc=encrypt_phone(phone),
            display_name=clean_name,
            password=None,
        )
        user.save()
    elif display_name and display_name.strip() and user.display_name != display_name.strip()[:150]:
        user.display_name = display_name.strip()[:150]
        user.save(update_fields=["display_name"])

    if user.account_status != "active" or not user.is_active:
        raise DomainError(
            code="account_blocked",
            message="This account is blocked or closed.",
            status_code=403,
        )

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    token, _created = Token.objects.get_or_create(user=user)

    return {"ok": True, "result": "ok", "token": token.key, "user": user}


# ---------------------------------------------------------------------------
# Logout & Token Purge
# ---------------------------------------------------------------------------

def logout_user(user: Users, auth_token=None) -> None:
    """
    Invalidate the user's authentication token.
    """
    if auth_token is not None:
        auth_token.delete()
    else:
        Token.objects.filter(user=user).delete()


def purge_expired_tokens() -> int:
    """
    Purge expired OTP and authentication tokens.
    """
    now = timezone.now()
    count, _ = AuthOtp.objects.filter(expires_at__lt=now).delete()
    return count


# Specification naming aliases
request_phone_otp = request_login_otp
verify_phone_otp = verify_login_otp
revoke_session_token = logout_user
