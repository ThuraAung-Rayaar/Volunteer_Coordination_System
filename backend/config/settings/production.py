from django.core.exceptions import ImproperlyConfigured

from config_di import is_placeholder_secret
from .base import *

DEBUG = False
ENVIRONMENT = 'production'

# Security & Cookie Configuration
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = CONFIG_CONTAINER.runtime.session_cookie_secure
CSRF_COOKIE_SECURE = CONFIG_CONTAINER.runtime.csrf_cookie_secure


def _require_configured_secret(name: str, value: str, min_length: int = 32) -> None:
    if not value or is_placeholder_secret(value) or len(value.strip()) < min_length:
        raise ImproperlyConfigured(
            f"Production {name} must be injected via root DI/environment and cannot be empty or a placeholder."
        )


# Fail-fast validation of critical injected secrets
_require_configured_secret("SECRET_KEY", SECRET_KEY, min_length=32)
_require_configured_secret("PHONE_HASH_HMAC_SECRET", PHONE_HASH_HMAC_SECRET, min_length=32)
_require_configured_secret("OTP_CODE_HMAC_SECRET", OTP_CODE_HMAC_SECRET, min_length=32)
_require_configured_secret("AUTH_SESSION_TOKEN_SECRET", AUTH_SESSION_TOKEN_SECRET, min_length=32)
_require_configured_secret("PHONE_ENCRYPTION_KEY", PHONE_ENCRYPTION_KEY, min_length=32)
_require_configured_secret("VERIFICATION_IMAGE_ENCRYPTION_KEY", VERIFICATION_IMAGE_ENCRYPTION_KEY, min_length=32)

# Enforce cryptographic key separation: secrets must be pairwise distinct
if len({PHONE_HASH_HMAC_SECRET, OTP_CODE_HMAC_SECRET, AUTH_SESSION_TOKEN_SECRET}) < 3:
    raise ImproperlyConfigured(
        "PHONE_HASH_HMAC_SECRET, OTP_CODE_HMAC_SECRET, and AUTH_SESSION_TOKEN_SECRET must all be pairwise distinct."
    )

if VERIFICATION_IMAGE_ENCRYPTION_KEY in {
    PHONE_ENCRYPTION_KEY,
    SECRET_KEY,
    PHONE_HASH_HMAC_SECRET,
    OTP_CODE_HMAC_SECRET,
    AUTH_SESSION_TOKEN_SECRET,
}:
    raise ImproperlyConfigured(
        "VERIFICATION_IMAGE_ENCRYPTION_KEY must be distinct from PHONE_ENCRYPTION_KEY, SECRET_KEY, and all HMAC secrets."
    )

# Strictly enforce Consumer-Only Mode and forbid dev_code exposure in production
DEV_OPTIONS_ENABLED = False
ALLOW_DEV_CODE_IN_AUTH_RESPONSE = False
DEV_FIXED_OTP = None
