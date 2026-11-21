import os
from django.core.exceptions import ImproperlyConfigured
from .base import *

DEBUG = False

# Security & Cookie Configuration
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'True').lower() in ('true', '1')
CSRF_COOKIE_SECURE = os.environ.get('CSRF_COOKIE_SECURE', 'True').lower() in ('true', '1')

# Fail-fast validation of critical secrets against insecure base.py fallbacks
_INSECURE_SECRET_KEY = 'django-insecure-f7(wutn^($y(7%in-uwbzw6auh6vnuc(zr7yc@vdt70xx(a8nd'
_INSECURE_PHONE_HASH_HMAC = 'dev-hmac-secret-at-least-32-chars-long-abcdef'
_INSECURE_OTP_CODE_HMAC = 'dev-otp-code-hmac-secret-at-least-32-chars-long-distinct'
_INSECURE_AUTH_SESSION_SECRET = 'dev-auth-session-token-secret-at-least-32-chars-distinct'
_INSECURE_PHONE_ENCRYPTION = 'IcY3lXCl1k0P1NawgjDSeCYOqcNRWJStRaqbWN21nGs='
_INSECURE_VERIFICATION_IMAGE_KEY = 'k8Vz9X2mQ5wL1nR4tY7uI0oP3aS6dF9gH2jK5lZ8xC0='

if not SECRET_KEY or SECRET_KEY == _INSECURE_SECRET_KEY:
    raise ImproperlyConfigured(
        "Production SECRET_KEY must be set to a secure value and cannot use the development fallback."
    )

if not PHONE_HASH_HMAC_SECRET or PHONE_HASH_HMAC_SECRET == _INSECURE_PHONE_HASH_HMAC:
    raise ImproperlyConfigured(
        "Production PHONE_HASH_HMAC_SECRET must be set to a secure value and cannot use the development fallback."
    )

if not OTP_CODE_HMAC_SECRET or OTP_CODE_HMAC_SECRET == _INSECURE_OTP_CODE_HMAC:
    raise ImproperlyConfigured(
        "Production OTP_CODE_HMAC_SECRET must be set to a secure value and cannot use the development fallback."
    )

if not AUTH_SESSION_TOKEN_SECRET or AUTH_SESSION_TOKEN_SECRET == _INSECURE_AUTH_SESSION_SECRET:
    raise ImproperlyConfigured(
        "Production AUTH_SESSION_TOKEN_SECRET must be set to a secure value and cannot use the development fallback."
    )

if not PHONE_ENCRYPTION_KEY or PHONE_ENCRYPTION_KEY == _INSECURE_PHONE_ENCRYPTION:
    raise ImproperlyConfigured(
        "Production PHONE_ENCRYPTION_KEY must be set to a secure value and cannot use the development fallback."
    )

if not VERIFICATION_IMAGE_ENCRYPTION_KEY or VERIFICATION_IMAGE_ENCRYPTION_KEY == _INSECURE_VERIFICATION_IMAGE_KEY:
    raise ImproperlyConfigured(
        "Production VERIFICATION_IMAGE_ENCRYPTION_KEY must be set to a secure value and cannot use the development fallback."
    )

# Enforce cryptographic key separation: secrets must be pairwise distinct
if len({PHONE_HASH_HMAC_SECRET, OTP_CODE_HMAC_SECRET, AUTH_SESSION_TOKEN_SECRET}) < 3:
    raise ImproperlyConfigured(
        "PHONE_HASH_HMAC_SECRET, OTP_CODE_HMAC_SECRET, and AUTH_SESSION_TOKEN_SECRET must all be pairwise distinct."
    )

if VERIFICATION_IMAGE_ENCRYPTION_KEY in {PHONE_ENCRYPTION_KEY, SECRET_KEY, PHONE_HASH_HMAC_SECRET, OTP_CODE_HMAC_SECRET, AUTH_SESSION_TOKEN_SECRET}:
    raise ImproperlyConfigured(
        "VERIFICATION_IMAGE_ENCRYPTION_KEY must be distinct from PHONE_ENCRYPTION_KEY, SECRET_KEY, and all HMAC secrets."
    )

# Strictly forbid dev_code exposure in production
ALLOW_DEV_CODE_IN_AUTH_RESPONSE = False
DEV_FIXED_OTP = None
