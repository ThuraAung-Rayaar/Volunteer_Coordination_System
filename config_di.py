"""
Root Dependency Injection Container for Volunteer Coordination System (VCS).

Centralizes all runtime configuration, cryptographic keys, database credentials,
external service keys (Maps / AI / OTP), and Consumer-Only / Developer-Options
flags outside source code.

Resolution precedence (highest to lowest):
1. Explicit programmatic DI overrides via `configure_container(...)`.
2. External JSON configuration file (`VCS_DI_CONFIG_PATH` or `<root>/di_config.local.json`).
3. Environment variables / `.env` files (`<root>/.env`, `<root>/backend/.env`).
4. Safe operational defaults for non-secret fields (and ephemeral in-memory keys
   ONLY when running under an automated test runner).
"""
from __future__ import annotations

import base64
import json
import os
import secrets
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Mapping

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional in pure-stdlib scripts
    def load_dotenv(*_args: Any, **_kwargs: Any) -> bool:
        return False


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
DEFAULT_DI_CONFIG_PATH = ROOT_DIR / "di_config.local.json"

_PLACEHOLDER_PREFIXES = (
    "django-insecure",
    "your-",
    "replace_with_",
    "replace-with-",
    "change-me",
    "<generate-",
    "example-",
)


def _is_test_runner_active() -> bool:
    """Return True only when invoked inside an automated unit test process."""
    if os.getenv("VCS_TEST_MODE", "").lower() in ("1", "true", "yes"):
        return True
    if "pytest" in sys.modules:
        return True
    return len(sys.argv) > 1 and "test" in sys.argv[1:]


def _parse_bool(raw: Any, default: bool = False) -> bool:
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    val = str(raw).strip().lower()
    if val in ("1", "true", "yes", "on"):
        return True
    if val in ("0", "false", "no", "off"):
        return False
    return default


def _parse_int(raw: Any, default: int) -> int:
    try:
        return int(raw) if raw is not None and str(raw).strip() != "" else default
    except (TypeError, ValueError):
        return default


def _parse_list(raw: Any, default: list[str] | None = None) -> list[str]:
    if raw is None:
        return list(default or [])
    if isinstance(raw, (list, tuple)):
        return [str(x).strip() for x in raw if str(x).strip()]
    return [item.strip() for item in str(raw).split(",") if item.strip()]


def is_placeholder_secret(value: str | None) -> bool:
    """Detect empty or unconfigured template placeholder secrets."""
    text = (value or "").strip()
    if not text:
        return True
    lowered = text.lower()
    return any(lowered.startswith(prefix) for prefix in _PLACEHOLDER_PREFIXES)


@dataclass(frozen=True)
class SecuritySettings:
    django_secret_key: str = ""
    phone_hash_hmac_secret: str = ""
    otp_code_hmac_secret: str = ""
    auth_session_token_secret: str = ""
    phone_encryption_key: str = ""
    verification_image_encryption_key: str = ""
    verification_image_key_id: str = "v1"
    verification_image_keyring: str = "{}"


@dataclass(frozen=True)
class DatabaseSettings:
    engine: str = "django.db.backends.postgresql"
    name: str = "volunteer_coordination_db"
    user: str = ""
    password: str = ""
    host: str = "127.0.0.1"
    port: str = "5432"


@dataclass(frozen=True)
class MapSettings:
    carto_api_key: str = ""
    tile_url_template: str = ""
    attribution: str = (
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
        'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    )


@dataclass(frozen=True)
class AiSettings:
    enabled: bool = True
    provider: str = "mock"
    model: str = "gemini-3.5-flash-lite"
    api_key: str = ""
    timeout_seconds: int = 45
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_keep_alive: str = "5m"
    max_output_tokens: int = 800
    rate_limit_per_minute: int = 20


@dataclass(frozen=True)
class AuthOtpSettings:
    allow_dev_code_in_auth_response: bool = False
    dev_fixed_otp: str | None = None
    otp_delivery_enabled: bool = False
    otp_delivery_provider: str = "console"
    otp_code_length: int = 6
    admin_bootstrap_password: str = ""


@dataclass(frozen=True)
class ConsumerModeSettings:
    dev_options_enabled: bool = False
    runtime_flags_path: str = str(ROOT_DIR / ".local" / "runtime_flags.json")

    @property
    def consumer_only(self) -> bool:
        return not self.dev_options_enabled


@dataclass(frozen=True)
class RuntimeSettings:
    environment: str = "development"
    debug: bool = False
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1")
    cors_allow_all_origins: bool = False
    cors_allowed_origins: tuple[str, ...] = ()
    session_cookie_secure: bool = True
    csrf_cookie_secure: bool = True


@dataclass(frozen=True)
class AppConfigContainer:
    """Root Dependency Injection container holding all VCS service configurations."""

    security: SecuritySettings = field(default_factory=SecuritySettings)
    database: DatabaseSettings = field(default_factory=DatabaseSettings)
    maps: MapSettings = field(default_factory=MapSettings)
    ai: AiSettings = field(default_factory=AiSettings)
    auth: AuthOtpSettings = field(default_factory=AuthOtpSettings)
    consumer_ui: ConsumerModeSettings = field(default_factory=ConsumerModeSettings)
    runtime: RuntimeSettings = field(default_factory=RuntimeSettings)


_EPHEMERAL_TEST_SECRETS: dict[str, str] = {}
_CONTAINER_INSTANCE: AppConfigContainer | None = None
_LOCAL_DEV_KEYS_PATH = ROOT_DIR / ".local" / "dev_keys.json"


def _generate_random_secret(kind: str = "token") -> str:
    if kind in ("fernet", "aes256"):
        return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
    return secrets.token_urlsafe(48)


def _get_ephemeral_test_secret(name: str, kind: str = "token") -> str:
    """Generate a process-local random secret for automated test runs only."""
    if name not in _EPHEMERAL_TEST_SECRETS:
        _EPHEMERAL_TEST_SECRETS[name] = _generate_random_secret(kind=kind)
    return _EPHEMERAL_TEST_SECRETS[name]


def _get_or_create_local_dev_secret(name: str, kind: str = "token") -> str:
    """
    Persist random per-workstation development keys inside gitignored `.local/dev_keys.json`
    so omitted non-production keys still stay distinct and stable across runserver reloads.
    Never used in production.
    """
    data: dict[str, str] = {}
    if _LOCAL_DEV_KEYS_PATH.exists():
        try:
            loaded = json.loads(_LOCAL_DEV_KEYS_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = {str(k): str(v) for k, v in loaded.items() if v}
        except (OSError, ValueError):
            data = {}
    if name not in data or not data[name]:
        data[name] = _generate_random_secret(kind=kind)
        try:
            _LOCAL_DEV_KEYS_PATH.parent.mkdir(parents=True, exist_ok=True)
            _LOCAL_DEV_KEYS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except OSError:
            pass
    return data[name]


def _load_json_config(config_path: Path | None = None) -> dict[str, Any]:
    target = config_path
    if target is None:
        env_path = os.getenv("VCS_DI_CONFIG_PATH", "").strip()
        target = Path(env_path) if env_path else DEFAULT_DI_CONFIG_PATH
    if not target.exists() or not target.is_file():
        return {}
    try:
        loaded = json.loads(target.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, dict) else {}
    except (OSError, ValueError):
        return {}


def _pick(
    overrides: Mapping[str, Any],
    json_section: Mapping[str, Any],
    key: str,
    env_keys: tuple[str, ...],
    default: Any = None,
) -> Any:
    if key in overrides and overrides[key] is not None:
        return overrides[key]
    if key in json_section and json_section[key] is not None:
        return json_section[key]
    for env_key in env_keys:
        val = os.getenv(env_key)
        if val is not None and val != "":
            return val
    return default


def build_config_container(
    overrides: Mapping[str, Mapping[str, Any]] | None = None,
    config_path: Path | None = None,
    load_env_files: bool = True,
) -> AppConfigContainer:
    """Construct a fresh AppConfigContainer from DI overrides, JSON config, and env."""
    if load_env_files:
        load_dotenv(BACKEND_DIR / ".env")
        load_dotenv(ROOT_DIR / ".env")

    json_cfg = _load_json_config(config_path)
    ov = overrides or {}
    is_test = _is_test_runner_active()

    rt_ov = ov.get("runtime", {})
    rt_json = json_cfg.get("runtime", {}) if isinstance(json_cfg.get("runtime"), dict) else {}
    environment = str(_pick(rt_ov, rt_json, "environment", ("ENVIRONMENT",), "development") or "development")
    is_prod_env = environment.strip().lower() == "production"

    def _sec_val(
        ov_sec: Mapping[str, Any],
        json_sec: Mapping[str, Any],
        key: str,
        env_keys: tuple[str, ...],
        test_kind: str | None = None,
        default: str = "",
    ) -> str:
        raw = str(_pick(ov_sec, json_sec, key, env_keys, default) or "").strip()
        if raw:
            if not is_prod_env or not is_placeholder_secret(raw):
                return raw
            return default
        if is_test and test_kind:
            return _get_ephemeral_test_secret(key, kind=test_kind)
        if not is_prod_env and test_kind:
            return _get_or_create_local_dev_secret(key, kind=test_kind)
        return default

    sec_ov = ov.get("security", {})
    sec_json = json_cfg.get("security", {}) if isinstance(json_cfg.get("security"), dict) else {}
    image_key = _sec_val(
        sec_ov,
        sec_json,
        "verification_image_encryption_key",
        ("VERIFICATION_IMAGE_ENCRYPTION_KEY",),
        test_kind="aes256",
    )
    image_key_id = str(
        _pick(sec_ov, sec_json, "verification_image_key_id", ("VERIFICATION_IMAGE_KEY_ID",), "v1")
        or "v1"
    )
    raw_keyring = _pick(
        sec_ov,
        sec_json,
        "verification_image_keyring",
        ("VERIFICATION_IMAGE_KEYRING",),
        None,
    )
    if raw_keyring and not is_placeholder_secret(str(raw_keyring)):
        keyring_str = raw_keyring if isinstance(raw_keyring, str) else json.dumps(raw_keyring)
    elif not is_prod_env and image_key:
        keyring_str = json.dumps({image_key_id: image_key})
    else:
        keyring_str = "{}"

    security = SecuritySettings(
        django_secret_key=_sec_val(
            sec_ov,
            sec_json,
            "django_secret_key",
            ("DJANGO_SECRET_KEY", "SECRET_KEY"),
            test_kind="token",
        ),
        phone_hash_hmac_secret=_sec_val(
            sec_ov,
            sec_json,
            "phone_hash_hmac_secret",
            ("PHONE_HASH_HMAC_SECRET",),
            test_kind="token",
        ),
        otp_code_hmac_secret=_sec_val(
            sec_ov,
            sec_json,
            "otp_code_hmac_secret",
            ("OTP_CODE_HMAC_SECRET",),
            test_kind="token",
        ),
        auth_session_token_secret=_sec_val(
            sec_ov,
            sec_json,
            "auth_session_token_secret",
            ("AUTH_SESSION_TOKEN_SECRET",),
            test_kind="token",
        ),
        phone_encryption_key=_sec_val(
            sec_ov,
            sec_json,
            "phone_encryption_key",
            ("PHONE_ENCRYPTION_KEY",),
            test_kind="fernet",
        ),
        verification_image_encryption_key=image_key,
        verification_image_key_id=image_key_id,
        verification_image_keyring=keyring_str,
    )

    db_ov = ov.get("database", {})
    db_json = json_cfg.get("database", {}) if isinstance(json_cfg.get("database"), dict) else {}
    database = DatabaseSettings(
        engine=str(_pick(db_ov, db_json, "engine", ("DB_ENGINE",), "django.db.backends.postgresql")),
        name=str(_pick(db_ov, db_json, "name", ("DB_NAME",), "volunteer_coordination_db")),
        user=str(_pick(db_ov, db_json, "user", ("DB_USER",), "postgres")),
        password=str(_pick(db_ov, db_json, "password", ("DB_PASSWORD",), "")),
        host=str(_pick(db_ov, db_json, "host", ("DB_HOST",), "127.0.0.1")),
        port=str(_pick(db_ov, db_json, "port", ("DB_PORT",), "5432")),
    )

    map_ov = ov.get("maps", {})
    map_json = json_cfg.get("maps", {}) if isinstance(json_cfg.get("maps"), dict) else {}
    carto_key = _sec_val(map_ov, map_json, "carto_api_key", ("CARTO_API_KEY",), default="")
    has_di_tile_tpl = bool(
        (map_ov.get("tile_url_template") or map_json.get("tile_url_template") or "").strip()
    )
    has_di_carto_key = bool(
        (map_ov.get("carto_api_key") or map_json.get("carto_api_key") or "").strip()
    )
    if has_di_tile_tpl:
        explicit_tile_tpl = str(map_ov.get("tile_url_template") or map_json.get("tile_url_template")).strip()
    elif has_di_carto_key:
        base_tile_url = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        explicit_tile_tpl = f"{base_tile_url}?key={carto_key}"
    else:
        explicit_tile_tpl = str(
            _pick(map_ov, map_json, "tile_url_template", ("MAP_TILE_URL_TEMPLATE",), "") or ""
        ).strip()
        if not explicit_tile_tpl:
            base_tile_url = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
            explicit_tile_tpl = f"{base_tile_url}?key={carto_key}" if carto_key else base_tile_url
    maps = MapSettings(
        carto_api_key=carto_key,
        tile_url_template=explicit_tile_tpl,
        attribution=str(
            _pick(
                map_ov,
                map_json,
                "attribution",
                ("MAP_TILE_ATTRIBUTION",),
                MapSettings.attribution,
            )
        ),
    )

    ai_ov = ov.get("ai", {})
    ai_json = json_cfg.get("ai", {}) if isinstance(json_cfg.get("ai"), dict) else {}
    ai_api_key = _sec_val(ai_ov, ai_json, "api_key", ("AI_API_KEY", "GEMINI_API_KEY"), default="")
    default_ai_provider = "gemini" if ai_api_key else "mock"
    ai_provider = str(
        _pick(ai_ov, ai_json, "provider", ("AI_PROVIDER",), default_ai_provider) or default_ai_provider
    ).lower()
    default_ai_model = "qwen3.5:4b" if ai_provider == "ollama" else "gemini-3.5-flash-lite"
    ai = AiSettings(
        enabled=_parse_bool(_pick(ai_ov, ai_json, "enabled", ("AI_ENABLED",), True), True),
        provider=ai_provider,
        model=str(_pick(ai_ov, ai_json, "model", ("AI_MODEL",), default_ai_model)),
        api_key=ai_api_key,
        timeout_seconds=_parse_int(_pick(ai_ov, ai_json, "timeout_seconds", ("AI_TIMEOUT_SECONDS",), 45), 45),
        ollama_base_url=str(
            _pick(ai_ov, ai_json, "ollama_base_url", ("AI_OLLAMA_BASE_URL",), "http://127.0.0.1:11434")
        ),
        ollama_keep_alive=str(_pick(ai_ov, ai_json, "ollama_keep_alive", ("AI_OLLAMA_KEEP_ALIVE",), "5m")),
        max_output_tokens=_parse_int(
            _pick(ai_ov, ai_json, "max_output_tokens", ("AI_MAX_OUTPUT_TOKENS",), 800), 800
        ),
        rate_limit_per_minute=_parse_int(
            _pick(ai_ov, ai_json, "rate_limit_per_minute", ("AI_RATE_LIMIT_PER_MINUTE",), 20), 20
        ),
    )

    debug = _parse_bool(_pick(rt_ov, rt_json, "debug", ("DEBUG",), False), False)
    allowed_hosts = tuple(
        _parse_list(_pick(rt_ov, rt_json, "allowed_hosts", ("ALLOWED_HOSTS",), "localhost,127.0.0.1"))
    )
    cors_all = _parse_bool(
        _pick(rt_ov, rt_json, "cors_allow_all_origins", ("CORS_ALLOW_ALL_ORIGINS",), debug),
        debug,
    )
    cors_origins = tuple(
        _parse_list(_pick(rt_ov, rt_json, "cors_allowed_origins", ("CORS_ALLOWED_ORIGINS",), ""))
    )
    runtime = RuntimeSettings(
        environment=environment,
        debug=debug,
        allowed_hosts=allowed_hosts,
        cors_allow_all_origins=cors_all,
        cors_allowed_origins=cors_origins,
        session_cookie_secure=_parse_bool(
            _pick(rt_ov, rt_json, "session_cookie_secure", ("SESSION_COOKIE_SECURE",), True), True
        ),
        csrf_cookie_secure=_parse_bool(
            _pick(rt_ov, rt_json, "csrf_cookie_secure", ("CSRF_COOKIE_SECURE",), True), True
        ),
    )

    cui_ov = ov.get("consumer_ui", {})
    cui_json = json_cfg.get("consumer_ui", {}) if isinstance(json_cfg.get("consumer_ui"), dict) else {}
    # Consumer-Only by default outside explicit test runners unless enabled via DI/env.
    default_dev_options = is_test
    dev_options_enabled = _parse_bool(
        _pick(
            cui_ov,
            cui_json,
            "dev_options_enabled",
            ("VCS_DEV_OPTIONS_ENABLED", "DEV_OPTIONS_ENABLED"),
            default_dev_options,
        ),
        default_dev_options,
    )
    if environment.lower() == "production":
        dev_options_enabled = False
    consumer_ui = ConsumerModeSettings(
        dev_options_enabled=dev_options_enabled,
        runtime_flags_path=str(
            _pick(
                cui_ov,
                cui_json,
                "runtime_flags_path",
                ("VCS_RUNTIME_FLAGS_PATH",),
                str(ROOT_DIR / ".local" / "runtime_flags.json"),
            )
        ),
    )

    auth_ov = ov.get("auth", {})
    auth_json = json_cfg.get("auth", {}) if isinstance(json_cfg.get("auth"), dict) else {}
    allow_dev_code = _parse_bool(
        _pick(
            auth_ov,
            auth_json,
            "allow_dev_code_in_auth_response",
            ("ALLOW_DEV_CODE_IN_AUTH_RESPONSE",),
            debug and dev_options_enabled,
        ),
        debug and dev_options_enabled,
    )
    fixed_otp_raw = _pick(auth_ov, auth_json, "dev_fixed_otp", ("DEV_FIXED_OTP",), None)
    auth = AuthOtpSettings(
        allow_dev_code_in_auth_response=allow_dev_code,
        dev_fixed_otp=str(fixed_otp_raw).strip() if fixed_otp_raw else None,
        otp_delivery_enabled=_parse_bool(
            _pick(auth_ov, auth_json, "otp_delivery_enabled", ("OTP_DELIVERY_ENABLED",), False), False
        ),
        otp_delivery_provider=str(
            _pick(auth_ov, auth_json, "otp_delivery_provider", ("OTP_DELIVERY_PROVIDER",), "console")
        ),
        otp_code_length=_parse_int(
            _pick(auth_ov, auth_json, "otp_code_length", ("OTP_CODE_LENGTH",), 6), 6
        ),
        admin_bootstrap_password=_sec_val(
            auth_ov,
            auth_json,
            "admin_bootstrap_password",
            ("ADMIN_BOOTSTRAP_PASSWORD", "VCS_ADMIN_BOOTSTRAP_PASSWORD"),
            default="",
        ),
    )

    return AppConfigContainer(
        security=security,
        database=database,
        maps=maps,
        ai=ai,
        auth=auth,
        consumer_ui=consumer_ui,
        runtime=runtime,
    )


def get_config_container(force_reload: bool = False) -> AppConfigContainer:
    """Return the active singleton AppConfigContainer instance."""
    global _CONTAINER_INSTANCE
    if _CONTAINER_INSTANCE is None or force_reload:
        _CONTAINER_INSTANCE = build_config_container()
    return _CONTAINER_INSTANCE


def configure_container(
    overrides: Mapping[str, Mapping[str, Any]] | None = None,
    config_path: Path | None = None,
    *,
    load_env_files: bool = True,
) -> AppConfigContainer:
    """Inject explicit configuration overrides or external DI file into the container."""
    global _CONTAINER_INSTANCE
    _CONTAINER_INSTANCE = build_config_container(
        overrides=overrides,
        config_path=config_path,
        load_env_files=load_env_files,
    )
    return _CONTAINER_INSTANCE


def with_consumer_mode(container: AppConfigContainer, dev_options_enabled: bool) -> AppConfigContainer:
    """Return a copy of the container with Consumer-Only / Dev-Options updated."""
    return replace(
        container,
        consumer_ui=replace(container.consumer_ui, dev_options_enabled=dev_options_enabled),
    )


def reset_container() -> None:
    """Reset the singleton DI container (used by tests)."""
    global _CONTAINER_INSTANCE
    _CONTAINER_INSTANCE = None
