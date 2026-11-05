"""
services/otp_service.py
Authoritative shim: delegates authentication and OTP workflows to auth_service.
"""
from services.auth_service import (
    get_otp_delivery_adapter,
    logout_user,
    purge_expired_tokens,
    request_login_otp,
    request_phone_otp,
    revoke_session_token,
    set_otp_delivery_adapter,
    verify_login_otp,
    verify_phone_otp,
)

__all__ = [
    "request_login_otp",
    "request_phone_otp",
    "verify_login_otp",
    "verify_phone_otp",
    "logout_user",
    "revoke_session_token",
    "purge_expired_tokens",
    "set_otp_delivery_adapter",
    "get_otp_delivery_adapter",
]
