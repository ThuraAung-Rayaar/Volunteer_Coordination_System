import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from config_di import get_config_container

CONFIG_CONTAINER = get_config_container()

SECRET_KEY = CONFIG_CONTAINER.security.django_secret_key
PHONE_HASH_HMAC_SECRET = CONFIG_CONTAINER.security.phone_hash_hmac_secret
OTP_CODE_HMAC_SECRET = CONFIG_CONTAINER.security.otp_code_hmac_secret
AUTH_SESSION_TOKEN_SECRET = CONFIG_CONTAINER.security.auth_session_token_secret
PHONE_ENCRYPTION_KEY = CONFIG_CONTAINER.security.phone_encryption_key

# Verification Image Encryption Key (AES-256-GCM, strictly distinct from PHONE_ENCRYPTION_KEY and HMAC secrets)
VERIFICATION_IMAGE_ENCRYPTION_KEY = CONFIG_CONTAINER.security.verification_image_encryption_key
VERIFICATION_IMAGE_KEY_ID = CONFIG_CONTAINER.security.verification_image_key_id
VERIFICATION_IMAGE_KEYRING = CONFIG_CONTAINER.security.verification_image_keyring

CARTO_API_KEY = CONFIG_CONTAINER.maps.carto_api_key
MAP_TILE_URL_TEMPLATE = CONFIG_CONTAINER.maps.tile_url_template
MAP_TILE_ATTRIBUTION = CONFIG_CONTAINER.maps.attribution
MAP_TILE_OFFLINE_ALLOWED = os.getenv('MAP_TILE_OFFLINE_ALLOWED', 'true').lower() in ('true', '1')

# External SMS / Network OTP Delivery Settings (Section 4.2)
OTP_DELIVERY_PROVIDER = CONFIG_CONTAINER.auth.otp_delivery_provider
OTP_DELIVERY_ENABLED = CONFIG_CONTAINER.auth.otp_delivery_enabled
OTP_PROVIDER_BASE_URL = os.getenv('OTP_PROVIDER_BASE_URL', '')
OTP_PROVIDER_API_KEY = os.getenv('OTP_PROVIDER_API_KEY', '')
OTP_PROVIDER_API_SECRET = os.getenv('OTP_PROVIDER_API_SECRET', '')
OTP_PROVIDER_SENDER_ID = os.getenv('OTP_PROVIDER_SENDER_ID', 'VOLUNTEER')
OTP_PROVIDER_TIMEOUT_SECONDS = int(os.getenv('OTP_PROVIDER_TIMEOUT_SECONDS', '10'))
OTP_PROVIDER_DELIVERY_RECEIPTS_ENABLED = os.getenv('OTP_PROVIDER_DELIVERY_RECEIPTS_ENABLED', 'false').lower() in ('true', '1')
OTP_REQUEST_IP_THROTTLE_RATE = os.getenv('OTP_REQUEST_IP_THROTTLE_RATE', '30/minute')
OTP_CODE_LENGTH = CONFIG_CONTAINER.auth.otp_code_length

# Consumer-Only / Developer Options Mode Toggle
ENVIRONMENT = CONFIG_CONTAINER.runtime.environment
DEV_OPTIONS_ENABLED = CONFIG_CONTAINER.consumer_ui.dev_options_enabled
RUNTIME_FLAGS_PATH = CONFIG_CONTAINER.consumer_ui.runtime_flags_path
ADMIN_BOOTSTRAP_PASSWORD = CONFIG_CONTAINER.auth.admin_bootstrap_password

# Dedicated feature flag to gate dev_code exposure in auth responses (local/test only)
ALLOW_DEV_CODE_IN_AUTH_RESPONSE = CONFIG_CONTAINER.auth.allow_dev_code_in_auth_response
DEV_FIXED_OTP = CONFIG_CONTAINER.auth.dev_fixed_otp

# AI Assistant Settings (Section 8)
AI_ENABLED = CONFIG_CONTAINER.ai.enabled
AI_PROVIDER = CONFIG_CONTAINER.ai.provider
AI_MODEL = CONFIG_CONTAINER.ai.model
AI_API_KEY = CONFIG_CONTAINER.ai.api_key
AI_TIMEOUT_SECONDS = CONFIG_CONTAINER.ai.timeout_seconds
AI_OLLAMA_BASE_URL = CONFIG_CONTAINER.ai.ollama_base_url
AI_OLLAMA_KEEP_ALIVE = CONFIG_CONTAINER.ai.ollama_keep_alive
AI_MAX_OUTPUT_TOKENS = CONFIG_CONTAINER.ai.max_output_tokens
AI_RATE_LIMIT_PER_MINUTE = CONFIG_CONTAINER.ai.rate_limit_per_minute

DEBUG = CONFIG_CONTAINER.runtime.debug

ALLOWED_HOSTS = list(CONFIG_CONTAINER.runtime.allowed_hosts)

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
        'ENGINE': CONFIG_CONTAINER.database.engine,
        'NAME': CONFIG_CONTAINER.database.name,
        'USER': CONFIG_CONTAINER.database.user,
        'PASSWORD': CONFIG_CONTAINER.database.password,
        'HOST': CONFIG_CONTAINER.database.host,
        'PORT': CONFIG_CONTAINER.database.port,
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
        'assistant': f'{AI_RATE_LIMIT_PER_MINUTE}/min',
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

CORS_ALLOW_ALL_ORIGINS = CONFIG_CONTAINER.runtime.cors_allow_all_origins
CORS_ALLOWED_ORIGINS = list(CONFIG_CONTAINER.runtime.cors_allowed_origins)

TEST_RUNNER = 'config.test_runner.SqlFileTestRunner'
