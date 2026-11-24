import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load .env from backend/ or project root
load_dotenv(BASE_DIR / '.env')
load_dotenv(BASE_DIR.parent / '.env')

SECRET_KEY = os.getenv(
    'DJANGO_SECRET_KEY',
    os.getenv('SECRET_KEY', 'django-insecure-f7(wutn^($y(7%in-uwbzw6auh6vnuc(zr7yc@vdt70xx(a8nd')
)
PHONE_HASH_HMAC_SECRET = os.getenv(
    'PHONE_HASH_HMAC_SECRET',
    'dev-hmac-secret-at-least-32-chars-long-abcdef'
)
OTP_CODE_HMAC_SECRET = os.getenv(
    'OTP_CODE_HMAC_SECRET',
    'dev-otp-code-hmac-secret-at-least-32-chars-long-distinct'
)
AUTH_SESSION_TOKEN_SECRET = os.getenv(
    'AUTH_SESSION_TOKEN_SECRET',
    'dev-auth-session-token-secret-at-least-32-chars-distinct'
)
PHONE_ENCRYPTION_KEY = os.getenv(
    'PHONE_ENCRYPTION_KEY',
    'IcY3lXCl1k0P1NawgjDSeCYOqcNRWJStRaqbWN21nGs='
)
# Verification Image Encryption Key (AES-256-GCM, strictly distinct from PHONE_ENCRYPTION_KEY and HMAC secrets)
VERIFICATION_IMAGE_ENCRYPTION_KEY = os.getenv(
    'VERIFICATION_IMAGE_ENCRYPTION_KEY',
    'k8Vz9X2mQ5wL1nR4tY7uI0oP3aS6dF9gH2jK5lZ8xC0='
)
VERIFICATION_IMAGE_KEY_ID = os.getenv(
    'VERIFICATION_IMAGE_KEY_ID',
    'v1'
)
VERIFICATION_IMAGE_KEYRING = os.getenv(
    'VERIFICATION_IMAGE_KEYRING',
    '{}'
)
CARTO_API_KEY = os.getenv(
    'CARTO_API_KEY',
    'cb1_5490_1_395a9eafc491da9c508bf094'
)
MAP_TILE_URL_TEMPLATE = os.getenv(
    'MAP_TILE_URL_TEMPLATE',
    f'https://basemaps.cartocdn.com/rastertiles/voyager/{{z}}/{{x}}/{{y}}.png?key={CARTO_API_KEY}'
)
MAP_TILE_ATTRIBUTION = os.getenv(
    'MAP_TILE_ATTRIBUTION',
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
)
MAP_TILE_OFFLINE_ALLOWED = os.getenv('MAP_TILE_OFFLINE_ALLOWED', 'true').lower() in ('true', '1')

# External SMS / Network OTP Delivery Settings (Section 4.2)
OTP_DELIVERY_PROVIDER = os.getenv('OTP_DELIVERY_PROVIDER', 'console')
OTP_DELIVERY_ENABLED = os.getenv('OTP_DELIVERY_ENABLED', 'false').lower() in ('true', '1')
OTP_PROVIDER_BASE_URL = os.getenv('OTP_PROVIDER_BASE_URL', '')
OTP_PROVIDER_API_KEY = os.getenv('OTP_PROVIDER_API_KEY', '')
OTP_PROVIDER_API_SECRET = os.getenv('OTP_PROVIDER_API_SECRET', '')
OTP_PROVIDER_SENDER_ID = os.getenv('OTP_PROVIDER_SENDER_ID', 'VOLUNTEER')
OTP_PROVIDER_TIMEOUT_SECONDS = int(os.getenv('OTP_PROVIDER_TIMEOUT_SECONDS', '10'))
OTP_PROVIDER_DELIVERY_RECEIPTS_ENABLED = os.getenv('OTP_PROVIDER_DELIVERY_RECEIPTS_ENABLED', 'false').lower() in ('true', '1')
OTP_REQUEST_IP_THROTTLE_RATE = os.getenv('OTP_REQUEST_IP_THROTTLE_RATE', '30/minute')

# Dedicated feature flag to gate dev_code exposure in auth responses (local/test only)
ALLOW_DEV_CODE_IN_AUTH_RESPONSE = os.getenv(
    'ALLOW_DEV_CODE_IN_AUTH_RESPONSE',
    'true' if os.getenv('DEBUG', 'false').lower() == 'true' else 'false'
).lower() in ('true', '1')

# AI Assistant Settings (Section 8)
AI_ENABLED = os.getenv('AI_ENABLED', 'true').lower() in ('true', '1')
AI_PROVIDER = os.getenv('AI_PROVIDER', 'mock' if not os.getenv('AI_API_KEY') and not os.getenv('GEMINI_API_KEY') else 'gemini')
AI_MODEL = os.getenv('AI_MODEL', 'gemini-1.5-flash')
AI_API_KEY = os.getenv('AI_API_KEY', os.getenv('GEMINI_API_KEY', ''))
AI_TIMEOUT_SECONDS = int(os.getenv('AI_TIMEOUT_SECONDS', '15'))
AI_MAX_OUTPUT_TOKENS = int(os.getenv('AI_MAX_OUTPUT_TOKENS', '800'))
AI_MAX_HISTORY_MESSAGES = int(os.getenv('AI_MAX_HISTORY_MESSAGES', '4'))
AI_RATE_LIMIT_PER_MINUTE = int(os.getenv('AI_RATE_LIMIT_PER_MINUTE', '20'))

DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

ALLOWED_HOSTS = [host.strip() for host in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if host.strip()]

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
]

LOCAL_APPS = [
    'apps.accounts',
    'apps.events',
    'apps.coordination',
    'apps.attendance',
    'apps.audit',
    'admin_portal',
    'bff',
    'ai',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'common.db_context.DbContextMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'admin_portal' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'volunteer_coordination_db'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
        'HOST': os.getenv('DB_HOST', '127.0.0.1'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'ATOMIC_REQUESTS': True,
    }
}

AUTH_USER_MODEL = 'accounts.Users'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'common.authentication.BlockedAwareTokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/min',
        'user': '300/min',
    },
    'EXCEPTION_HANDLER': 'common.exceptions.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'common.schema.CleanAutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Volunteer Coordination System API',
    'VERSION': '0.6.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'PREPROCESSING_HOOKS': ['common.schema.clean_endpoints_hook'],
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'admin_portal' / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
VERIFICATION_MEDIA_ROOT = BASE_DIR / 'private_media' / 'verification_images'
VERIFICATION_MAX_UPLOAD_BYTES = 5 * 1024 * 1024   # 5 MB
VERIFICATION_MIN_DIMENSION = 200                  # px
VERIFICATION_MAX_DIMENSION = 6000                 # px

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'True' if DEBUG else 'False').lower() in ('true', '1')
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]

TEST_RUNNER = 'config.test_runner.SqlFileTestRunner'
