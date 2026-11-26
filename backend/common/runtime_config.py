"""
Runtime feature flags manager for Consumer-Only vs Developer-Options Mode.

Allows administrators to toggle developer options cleanly at runtime without
modifying PostgreSQL schema, while keeping production fail-closed and respecting
Django @override_settings in tests.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from django.conf import settings
from django.test.signals import setting_changed

_MISSING = object()
_MEM_DEV_OPTIONS_OVERRIDE: Any = _MISSING


def _reset_mem_override_on_setting_change(sender: Any, setting: str, **_kwargs: Any) -> None:
    global _MEM_DEV_OPTIONS_OVERRIDE
    if setting in ("DEV_OPTIONS_ENABLED", "ENVIRONMENT", "RUNTIME_FLAGS_PATH"):
        _MEM_DEV_OPTIONS_OVERRIDE = _MISSING


setting_changed.connect(_reset_mem_override_on_setting_change)


def _get_flags_path() -> Path:
    raw = str(getattr(settings, "RUNTIME_FLAGS_PATH", "") or "").strip()
    if raw:
        return Path(raw)
    return Path(settings.BASE_DIR).parent / ".local" / "runtime_flags.json"


def _is_production_runtime() -> bool:
    env = str(getattr(settings, "ENVIRONMENT", "") or "").strip().lower()
    settings_mod = str(
        getattr(settings, "SETTINGS_MODULE", "") or os.environ.get("DJANGO_SETTINGS_MODULE", "") or ""
    ).lower()
    return env == "production" or "production" in settings_mod


def _read_runtime_file() -> dict[str, Any]:
    path = _get_flags_path()
    if not path.exists() or not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def is_dev_options_enabled() -> bool:
    """Return True when developer diagnostics/options are enabled; False in consumer-only mode."""
    if _is_production_runtime():
        return False

    if _MEM_DEV_OPTIONS_OVERRIDE is not _MISSING:
        return bool(_MEM_DEV_OPTIONS_OVERRIDE)

    flags = _read_runtime_file()
    if "dev_options_enabled" in flags and isinstance(flags["dev_options_enabled"], bool):
        return bool(flags["dev_options_enabled"])

    return bool(getattr(settings, "DEV_OPTIONS_ENABLED", False))


def is_consumer_only_mode() -> bool:
    """Return True when consumer-only mode is active (no dev options, no debug/bug UI)."""
    return not is_dev_options_enabled()


def set_dev_options_enabled(enabled: bool, updated_by: str | None = None) -> dict[str, Any]:
    """Persist runtime dev-options toggle cleanly outside code."""
    global _MEM_DEV_OPTIONS_OVERRIDE
    target_enabled = False if _is_production_runtime() else bool(enabled)
    _MEM_DEV_OPTIONS_OVERRIDE = target_enabled

    payload = {
        "dev_options_enabled": target_enabled,
        "consumer_only": not target_enabled,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": updated_by or "system",
    }

    path = _get_flags_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        # In read-only sandboxes the in-memory toggle still applies safely.
        pass

    return get_client_runtime_config()


def reset_runtime_flags(clear_file: bool = False) -> None:
    """Reset runtime in-process override (and optionally remove runtime flags file)."""
    global _MEM_DEV_OPTIONS_OVERRIDE
    _MEM_DEV_OPTIONS_OVERRIDE = _MISSING
    if clear_file:
        path = _get_flags_path()
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass


def get_client_runtime_config() -> dict[str, Any]:
    """Return public, non-secret client capability flags for mobile UI adaptation."""
    dev_enabled = is_dev_options_enabled()
    debug_flag = bool(getattr(settings, "DEBUG", False))
    return {
        "dev_options_enabled": dev_enabled,
        "consumer_only": not dev_enabled,
        "expose_debug_errors": dev_enabled and debug_flag,
        "show_dev_tools": dev_enabled,
    }
