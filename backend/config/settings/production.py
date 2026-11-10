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
_INSECURE_PHONE_ENCRYPTION = 'IcY3lXCl1k0P1NawgjDSeCYOqcNRWJStRaqbWN21nGs='

if not SECRET_KEY or SECRET_KEY == _INSECURE_SECRET_KEY:
    raise ImproperlyConfigured(
        "Production SECRET_KEY must be set to a secure value and cannot use the development fallback."
    )

if not PHONE_HASH_HMAC_SECRET or PHONE_HASH_HMAC_SECRET == _INSECURE_PHONE_HASH_HMAC:
    raise ImproperlyConfigured(
        "Production PHONE_HASH_HMAC_SECRET must be set to a secure value and cannot use the development fallback."
    )

if not PHONE_ENCRYPTION_KEY or PHONE_ENCRYPTION_KEY == _INSECURE_PHONE_ENCRYPTION:
    raise ImproperlyConfigured(
        "Production PHONE_ENCRYPTION_KEY must be set to a secure value and cannot use the development fallback."
    )
