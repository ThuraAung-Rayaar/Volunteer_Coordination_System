"""
scripts/setup_di_config.py

Creates or updates the true Dependency Injection configuration file
`<root>/di_config.local.json` consumed by `config_di.py`.

Supports:
- Bootstrapping from existing `.env` / `backend/.env` values (`--from-env`)
- Interactive setup for a brand-new laptop (`--interactive`)
- Non-interactive setup via CLI flags (`--db-user`, `--db-password`, etc.)
- Automatic generation of distinct, high-entropy cryptographic keys
  (`django_secret_key`, `phone_hash_hmac_secret`, `otp_code_hmac_secret`,
   `auth_session_token_secret`, `phone_encryption_key`,
   `verification_image_encryption_key`) whenever missing or placeholder.

Never prints raw secret values or API keys to stdout.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import secrets
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import config_di

DEFAULT_OUTPUT_PATH = config_di.DEFAULT_DI_CONFIG_PATH


def _gen_token_secret() -> str:
    return secrets.token_urlsafe(48)


def _gen_base64_32() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")


def _load_dotenv_dict() -> dict[str, str]:
    merged: dict[str, str] = {}
    for env_path in (REPO_ROOT / "backend" / ".env", REPO_ROOT / ".env"):
        if not env_path.exists():
            continue
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                k, v = stripped.split("=", 1)
                val = v.strip().strip('"').strip("'")
                if val:
                    merged.setdefault(k.strip(), val)
        except OSError:
            pass
    return merged


def _pick_non_placeholder(*candidates: Any, fallback: str = "") -> str:
    for cand in candidates:
        text = str(cand or "").strip()
        if text and not config_di.is_placeholder_secret(text):
            return text
    return fallback


def _ensure_distinct_secrets(sec: dict[str, Any]) -> dict[str, Any]:
    hmac_fields = (
        "django_secret_key",
        "phone_hash_hmac_secret",
        "otp_code_hmac_secret",
        "auth_session_token_secret",
    )
    used: set[str] = set()
    for field_name in hmac_fields:
        val = _pick_non_placeholder(sec.get(field_name))
        while not val or len(val) < 32 or val in used:
            val = _gen_token_secret()
        sec[field_name] = val
        used.add(val)

    for b64_field in ("phone_encryption_key", "verification_image_encryption_key"):
        val = _pick_non_placeholder(sec.get(b64_field))
        valid_len = False
        if val:
            try:
                valid_len = len(base64.urlsafe_b64decode(val.encode("ascii"))) == 32
            except Exception:
                valid_len = False
        while not valid_len or val in used:
            val = _gen_base64_32()
            valid_len = True
        sec[b64_field] = val
        used.add(val)

    key_id = str(sec.get("verification_image_key_id") or "v1").strip() or "v1"
    sec["verification_image_key_id"] = key_id
    sec["verification_image_keyring"] = {key_id: sec["verification_image_encryption_key"]}
    return sec


def build_di_payload(
    *,
    existing: dict[str, Any] | None = None,
    env_map: dict[str, str] | None = None,
    db_user: str | None = None,
    db_password: str | None = None,
    db_host: str | None = None,
    db_port: str | None = None,
    db_name: str | None = None,
    carto_api_key: str | None = None,
    tile_url_template: str | None = None,
    ai_provider: str | None = None,
    ai_model: str | None = None,
    ai_api_key: str | None = None,
    dev_options_enabled: bool | None = None,
    debug: bool | None = None,
    admin_bootstrap_password: str | None = None,
) -> dict[str, Any]:
    ex = existing or {}
    env = env_map or {}

    ex_rt = ex.get("runtime", {}) if isinstance(ex.get("runtime"), dict) else {}
    ex_cui = ex.get("consumer_ui", {}) if isinstance(ex.get("consumer_ui"), dict) else {}
    ex_sec = ex.get("security", {}) if isinstance(ex.get("security"), dict) else {}
    ex_db = ex.get("database", {}) if isinstance(ex.get("database"), dict) else {}
    ex_maps = ex.get("maps", {}) if isinstance(ex.get("maps"), dict) else {}
    ex_ai = ex.get("ai", {}) if isinstance(ex.get("ai"), dict) else {}
    ex_auth = ex.get("auth", {}) if isinstance(ex.get("auth"), dict) else {}

    environment = str(ex_rt.get("environment") or env.get("ENVIRONMENT") or "development").strip()
    if debug is None:
        raw_dbg = ex_rt.get("debug") if "debug" in ex_rt else env.get("DEBUG", "true")
        debug_val = str(raw_dbg).strip().lower() in ("1", "true", "yes", "on")
    else:
        debug_val = bool(debug)

    raw_hosts = ex_rt.get("allowed_hosts") or env.get("ALLOWED_HOSTS") or ["localhost", "127.0.0.1", "10.0.2.2", "0.0.0.0"]
    if isinstance(raw_hosts, str):
        allowed_hosts = [h.strip() for h in raw_hosts.split(",") if h.strip()]
    else:
        allowed_hosts = [str(h).strip() for h in raw_hosts if str(h).strip()]
    for required_host in ("localhost", "127.0.0.1", "10.0.2.2"):
        if required_host not in allowed_hosts and environment != "production":
            allowed_hosts.append(required_host)

    sec_seed = {
        "django_secret_key": _pick_non_placeholder(ex_sec.get("django_secret_key"), env.get("DJANGO_SECRET_KEY"), env.get("SECRET_KEY")),
        "phone_hash_hmac_secret": _pick_non_placeholder(ex_sec.get("phone_hash_hmac_secret"), env.get("PHONE_HASH_HMAC_SECRET")),
        "otp_code_hmac_secret": _pick_non_placeholder(ex_sec.get("otp_code_hmac_secret"), env.get("OTP_CODE_HMAC_SECRET")),
        "auth_session_token_secret": _pick_non_placeholder(ex_sec.get("auth_session_token_secret"), env.get("AUTH_SESSION_TOKEN_SECRET")),
        "phone_encryption_key": _pick_non_placeholder(ex_sec.get("phone_encryption_key"), env.get("PHONE_ENCRYPTION_KEY")),
        "verification_image_encryption_key": _pick_non_placeholder(ex_sec.get("verification_image_encryption_key"), env.get("VERIFICATION_IMAGE_ENCRYPTION_KEY")),
        "verification_image_key_id": str(ex_sec.get("verification_image_key_id") or env.get("VERIFICATION_IMAGE_KEY_ID") or "v1"),
    }
    sec_final = _ensure_distinct_secrets(sec_seed)

    resolved_carto = (
        carto_api_key
        if carto_api_key is not None
        else _pick_non_placeholder(ex_maps.get("carto_api_key"), env.get("CARTO_API_KEY"), fallback="")
    )
    resolved_tpl = (
        tile_url_template
        if tile_url_template is not None
        else _pick_non_placeholder(ex_maps.get("tile_url_template"), env.get("MAP_TILE_URL_TEMPLATE"), fallback="")
    )
    if not resolved_tpl and resolved_carto:
        resolved_tpl = f"https://basemaps.cartocdn.com/rastertiles/voyager/{{z}}/{{x}}/{{y}}.png?key={resolved_carto}"
    elif not resolved_tpl:
        resolved_tpl = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"

    resolved_ai_key = (
        ai_api_key
        if ai_api_key is not None
        else _pick_non_placeholder(ex_ai.get("api_key"), env.get("AI_API_KEY"), env.get("GEMINI_API_KEY"), fallback="")
    )
    resolved_ai_provider = (
        ai_provider
        if ai_provider is not None
        else str(ex_ai.get("provider") or env.get("AI_PROVIDER") or ("gemini" if resolved_ai_key else "mock")).strip().lower()
    )
    default_model = "qwen3.5:4b" if resolved_ai_provider == "ollama" else "gemini-3.5-flash-lite"
    resolved_ai_model = (
        ai_model
        if ai_model is not None
        else str(ex_ai.get("model") or env.get("AI_MODEL") or default_model).strip()
    )

    if dev_options_enabled is None:
        raw_dev = ex_cui.get("dev_options_enabled") if "dev_options_enabled" in ex_cui else env.get("VCS_DEV_OPTIONS_ENABLED", "false")
        dev_opts = str(raw_dev).strip().lower() in ("1", "true", "yes", "on")
    else:
        dev_opts = bool(dev_options_enabled)

    resolved_db_password = (
        db_password
        if db_password is not None
        else _pick_non_placeholder(ex_db.get("password"), env.get("DB_PASSWORD"), fallback="")
    )
    resolved_admin_pw = (
        admin_bootstrap_password
        if admin_bootstrap_password is not None
        else _pick_non_placeholder(ex_auth.get("admin_bootstrap_password"), env.get("ADMIN_BOOTSTRAP_PASSWORD"), fallback="")
    )

    return {
        "runtime": {
            "environment": environment,
            "debug": debug_val,
            "allowed_hosts": allowed_hosts,
            "cors_allow_all_origins": debug_val if "cors_allow_all_origins" not in ex_rt else bool(ex_rt["cors_allow_all_origins"]),
            "cors_allowed_origins": ex_rt.get("cors_allowed_origins", []),
            "session_cookie_secure": False if environment == "development" else True,
            "csrf_cookie_secure": False if environment == "development" else True,
        },
        "consumer_ui": {
            "dev_options_enabled": dev_opts,
            "runtime_flags_path": str(ex_cui.get("runtime_flags_path") or ".local/runtime_flags.json"),
        },
        "security": sec_final,
        "database": {
            "engine": str(ex_db.get("engine") or "django.db.backends.postgresql"),
            "name": str(db_name or ex_db.get("name") or env.get("DB_NAME") or "volunteer_coordination_db"),
            "user": str(db_user or ex_db.get("user") or env.get("DB_USER") or "postgres"),
            "password": resolved_db_password,
            "host": str(db_host or ex_db.get("host") or env.get("DB_HOST") or "127.0.0.1"),
            "port": str(db_port or ex_db.get("port") or env.get("DB_PORT") or "5432"),
        },
        "maps": {
            "carto_api_key": resolved_carto,
            "tile_url_template": resolved_tpl,
            "attribution": str(ex_maps.get("attribution") or env.get("MAP_TILE_ATTRIBUTION") or config_di.MapSettings.attribution),
        },
        "ai": {
            "enabled": True if "enabled" not in ex_ai else bool(ex_ai["enabled"]),
            "provider": resolved_ai_provider,
            "model": resolved_ai_model,
            "api_key": resolved_ai_key,
            "timeout_seconds": int(ex_ai.get("timeout_seconds") or env.get("AI_TIMEOUT_SECONDS") or 30),
            "ollama_base_url": str(ex_ai.get("ollama_base_url") or env.get("AI_OLLAMA_BASE_URL") or "http://127.0.0.1:11434"),
            "ollama_keep_alive": str(ex_ai.get("ollama_keep_alive") or env.get("AI_OLLAMA_KEEP_ALIVE") or "5m"),
            "max_output_tokens": int(ex_ai.get("max_output_tokens") or env.get("AI_MAX_OUTPUT_TOKENS") or 800),
            "rate_limit_per_minute": int(ex_ai.get("rate_limit_per_minute") or env.get("AI_RATE_LIMIT_PER_MINUTE") or 20),
        },
        "auth": {
            "allow_dev_code_in_auth_response": bool(dev_opts and debug_val),
            "otp_delivery_enabled": bool(ex_auth.get("otp_delivery_enabled", False)),
            "otp_delivery_provider": str(ex_auth.get("otp_delivery_provider") or "console"),
            "otp_code_length": int(ex_auth.get("otp_code_length") or 6),
            "admin_bootstrap_password": resolved_admin_pw,
        },
    }


def write_di_config(payload: dict[str, Any], output_path: Path = DEFAULT_OUTPUT_PATH) -> config_di.AppConfigContainer:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return config_di.build_config_container(config_path=output_path, load_env_files=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update true DI config file di_config.local.json.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_PATH), help="Output JSON path (default: di_config.local.json)")
    parser.add_argument("--from-env", action="store_true", help="Import non-empty values from .env / existing di_config.local.json.")
    parser.add_argument("--interactive", action="store_true", help="Prompt interactively for DB, Map, and AI settings.")
    parser.add_argument("--db-user")
    parser.add_argument("--db-password")
    parser.add_argument("--db-host")
    parser.add_argument("--db-port")
    parser.add_argument("--db-name")
    parser.add_argument("--carto-api-key")
    parser.add_argument("--tile-url-template")
    parser.add_argument("--ai-provider", choices=["mock", "gemini", "ollama"])
    parser.add_argument("--ai-model")
    parser.add_argument("--ai-api-key")
    parser.add_argument("--dev-options", choices=["true", "false"])
    args = parser.parse_args()

    out_path = Path(args.output)
    existing: dict[str, Any] = {}
    if out_path.exists():
        try:
            loaded = json.loads(out_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                existing = loaded
        except (OSError, ValueError):
            existing = {}

    env_map = _load_dotenv_dict() if (args.from_env or not out_path.exists()) else {}

    db_user = args.db_user
    db_password = args.db_password
    db_host = args.db_host
    db_port = args.db_port
    db_name = args.db_name
    carto_api_key = args.carto_api_key
    ai_provider = args.ai_provider
    ai_model = args.ai_model
    ai_api_key = args.ai_api_key
    dev_opts = None if args.dev_options is None else (args.dev_options == "true")

    if args.interactive:
        print("=" * 64)
        print("Volunteer Coordination System — DI Configuration Setup")
        print("=" * 64)
        cur_db = existing.get("database", {}) if isinstance(existing.get("database"), dict) else {}
        db_host = input(f"PostgreSQL Host [{cur_db.get('host') or env_map.get('DB_HOST') or '127.0.0.1'}]: ").strip() or None
        db_port = input(f"PostgreSQL Port [{cur_db.get('port') or env_map.get('DB_PORT') or '5432'}]: ").strip() or None
        db_name = input(f"Database Name [{cur_db.get('name') or env_map.get('DB_NAME') or 'volunteer_coordination_db'}]: ").strip() or None
        db_user = input(f"PostgreSQL User [{cur_db.get('user') or env_map.get('DB_USER') or 'postgres'}]: ").strip() or None
        pw_in = getpass.getpass("PostgreSQL Password (leave empty to keep existing): ")
        if pw_in:
            db_password = pw_in

        cur_ai = existing.get("ai", {}) if isinstance(existing.get("ai"), dict) else {}
        ai_provider_in = input(f"AI Provider (mock/gemini/ollama) [{cur_ai.get('provider') or env_map.get('AI_PROVIDER') or 'mock'}]: ").strip().lower()
        if ai_provider_in in ("mock", "gemini", "ollama"):
            ai_provider = ai_provider_in
        if (ai_provider or cur_ai.get("provider")) == "gemini":
            ai_key_in = getpass.getpass("Gemini API Key (leave empty to keep existing): ")
            if ai_key_in.strip():
                ai_api_key = ai_key_in.strip()
        carto_in = getpass.getpass("CARTO Map API Key (optional, leave empty to keep existing): ")
        if carto_in.strip():
            carto_api_key = carto_in.strip()

    payload = build_di_payload(
        existing=existing,
        env_map=env_map,
        db_user=db_user,
        db_password=db_password,
        db_host=db_host,
        db_port=db_port,
        db_name=db_name,
        carto_api_key=carto_api_key,
        tile_url_template=args.tile_url_template,
        ai_provider=ai_provider,
        ai_model=ai_model,
        ai_api_key=ai_api_key,
        dev_options_enabled=dev_opts,
    )
    container = write_di_config(payload, out_path)

    print(f"[OK] Wrote DI config file: {out_path}")
    print(f"     environment={container.runtime.environment}, debug={container.runtime.debug}")
    print(f"     database={container.database.user}@{container.database.host}:{container.database.port}/{container.database.name}")
    print(f"     maps_tile_template_configured={bool(container.maps.tile_url_template)}, carto_key_set={bool(container.maps.carto_api_key)}")
    print(f"     ai_provider={container.ai.provider}, ai_model={container.ai.model}, ai_key_set={bool(container.ai.api_key)}")
    print(f"     dev_options_enabled={container.consumer_ui.dev_options_enabled}, security_keys=6/6 valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
