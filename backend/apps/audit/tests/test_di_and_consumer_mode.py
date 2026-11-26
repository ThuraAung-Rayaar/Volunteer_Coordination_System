"""
Tests for Root Dependency Injection (`config_di.py`), credential scrubbing,
and the backend Consumer-Only / Developer-Options toggle.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

import config_di
from apps.accounts.models import Users
from apps.audit.models import AuditLogs
from common.exceptions import custom_exception_handler
from common.runtime_config import (
    get_client_runtime_config,
    is_consumer_only_mode,
    is_dev_options_enabled,
    reset_runtime_flags,
    set_dev_options_enabled,
)
from common.security import compute_phone_hash, encrypt_phone
from services import auth_service


class TestRootDependencyInjectionAndCredentialScrubbing(SimpleTestCase):
    """Verify root config_di container injection and zero hardcoded credentials."""

    def test_di_container_loads_external_json_and_overrides(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            cfg_path = Path(tmpdir) / "di_test.json"
            cfg_path.write_text(
                json.dumps({
                    "consumer_ui": {"dev_options_enabled": False},
                    "maps": {"carto_api_key": "injected-map-key"},
                    "ai": {"provider": "ollama", "model": "qwen3.5:4b"},
                    "database": {"name": "custom_db", "user": "custom_user", "password": "injected-db-password"},
                }),
                encoding="utf-8",
            )

            container = config_di.build_config_container(
                overrides={"maps": {"attribution": "Custom Map Attr"}},
                config_path=cfg_path,
                load_env_files=False,
            )

            self.assertFalse(container.consumer_ui.dev_options_enabled)
            self.assertTrue(container.consumer_ui.consumer_only)
            self.assertEqual(container.maps.carto_api_key, "injected-map-key")
            self.assertIn("key=injected-map-key", container.maps.tile_url_template)
            self.assertEqual(container.maps.attribution, "Custom Map Attr")
            self.assertEqual(container.database.name, "custom_db")
            self.assertEqual(container.database.password, "injected-db-password")

    def test_placeholder_secret_detection_rejects_template_values(self):
        for bad in ("", "django-insecure-abc", "your-hmac-secret", "REPLACE_WITH_KEY", "<generate-secret>"):
            self.assertTrue(config_di.is_placeholder_secret(bad), f"Expected placeholder: {bad}")
        self.assertFalse(config_di.is_placeholder_secret("a" * 48))

    def test_production_helper_rejects_empty_or_placeholder_secrets(self):
        import base64
        import os

        with patch.multiple(
            "config.settings.base",
            SECRET_KEY="prod-test-" + "a" * 40,
            PHONE_HASH_HMAC_SECRET="prod-test-" + "b" * 40,
            OTP_CODE_HMAC_SECRET="prod-test-" + "c" * 40,
            AUTH_SESSION_TOKEN_SECRET="prod-test-" + "d" * 40,
            PHONE_ENCRYPTION_KEY=base64.urlsafe_b64encode(os.urandom(32)).decode("ascii"),
            VERIFICATION_IMAGE_ENCRYPTION_KEY=base64.urlsafe_b64encode(os.urandom(32)).decode("ascii"),
        ):
            from config.settings.production import _require_configured_secret

            with self.assertRaises(ImproperlyConfigured):
                _require_configured_secret("SECRET_KEY", "django-insecure-placeholder")
            with self.assertRaises(ImproperlyConfigured):
                _require_configured_secret("SECRET_KEY", "short")
            _require_configured_secret("SECRET_KEY", "x" * 40)

        # In production environment, placeholder env secrets are also rejected by config_di
        prod_container = config_di.build_config_container(
            overrides={
                "runtime": {"environment": "production"},
                "security": {"django_secret_key": "django-insecure-test"},
            },
            load_env_files=False,
        )
        self.assertEqual(prod_container.security.django_secret_key, "")

    def test_source_files_contain_no_hardcoded_secrets_or_demo_passwords(self):
        root = config_di.ROOT_DIR
        targets = [
            root / "config_di.py",
            root / "di_config.example.json",
            root / ".env.example",
            root / "backend" / "config" / "settings" / "base.py",
            root / "backend" / "config" / "settings" / "production.py",
            root / "backend" / "admin_portal" / "views.py",
            root / "backend" / "admin_portal" / "templates" / "admin_portal" / "login.html",
            root / "backend" / "admin_portal" / "templates" / "admin_portal" / "user_create.html",
        ]
        forbidden_literals = (
            "AdminDemo123!",
            "django-insecure-f7(wutn",
            "dev-hmac-secret-at-least-32",
            "dev-otp-code-hmac-secret",
            "dev-auth-session-token-secret",
            "IcY3lXCl1k0P1NawgjDSeCYOqcNRWJStRaqbWN21nGs=",
            "k8Vz9X2mQ5wL1nR4tY7uI0oP3aS6dF9gH2jK5lZ8xC0=",
            "cb1_5490_1_395a9eafc491da9c508bf094",
        )
        for path in targets:
            content = path.read_text(encoding="utf-8")
            for literal in forbidden_literals:
                self.assertNotIn(literal, content, f"Hardcoded credential literal found in {path}")


class TestConsumerOnlyToggleAndErrorMasking(TestCase):
    """Verify Admin toggle, /api/v1/client-config/, OTP dev_code suppression, and error masking."""

    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(self._tempdir.cleanup)
        self.flags_path = str(Path(self._tempdir.name) / "runtime_flags.json")
        self._override = override_settings(RUNTIME_FLAGS_PATH=self.flags_path, DEV_OPTIONS_ENABLED=True)
        self._override.enable()
        self.addCleanup(self._override.disable)
        reset_runtime_flags(clear_file=True)
        self.addCleanup(lambda: reset_runtime_flags(clear_file=True))

        self.client = APIClient()
        admin_phone = "+959771112223"
        self.super_admin = Users.objects.create(
            phone_hash=compute_phone_hash(admin_phone),
            phone_enc=encrypt_phone(admin_phone),
            display_name="Toggle Super Admin",
            is_admin=True,
            is_staff=True,
            is_superuser=True,
            is_active=True,
            account_status="active",
        )

    def test_client_config_endpoint_and_admin_toggle_round_trip(self):
        # Initially dev options enabled in test override
        res_initial = self.client.get("/api/v1/client-config/")
        self.assertEqual(res_initial.status_code, status.HTTP_200_OK)
        self.assertTrue(res_initial.json()["dev_options_enabled"])
        self.assertFalse(res_initial.json()["consumer_only"])

        # Admin toggles Consumer-Only Mode ON (dev_options_enabled=0)
        self.client.force_authenticate(user=self.super_admin)
        res_off = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={"form_action": "toggle_dev_options", "dev_options_enabled": "0"},
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(res_off.status_code, status.HTTP_200_OK)
        self.assertFalse(res_off.json()["client_config"]["dev_options_enabled"])
        self.assertTrue(res_off.json()["client_config"]["consumer_only"])

        # Public endpoint immediately reflects Consumer-Only Mode
        anon = APIClient()
        res_public = anon.get("/api/v1/client-config/")
        self.assertEqual(res_public.status_code, status.HTTP_200_OK)
        self.assertFalse(res_public.json()["dev_options_enabled"])
        self.assertTrue(res_public.json()["consumer_only"])
        self.assertFalse(res_public.json()["expose_debug_errors"])
        self.assertFalse(res_public.json()["show_dev_tools"])

        # Audit log created
        self.assertTrue(
            AuditLogs.objects.filter(
                actor_user=self.super_admin,
                action="admin.dev_options_toggled",
            ).exists()
        )

        # Toggle back ON
        res_on = self.client.post(
            "/api/v1/admin/ui/settings/",
            data={"form_action": "toggle_dev_options", "dev_options_enabled": "1"},
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(res_on.status_code, status.HTTP_200_OK)
        self.assertTrue(is_dev_options_enabled())
        self.assertFalse(is_consumer_only_mode())

    def test_consumer_only_mode_suppresses_dev_code_and_masks_technical_errors(self):
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            set_dev_options_enabled(False)
            self.assertFalse(auth_service.can_expose_dev_code())

            with patch("services.auth_service.secrets.randbelow", return_value=246810):
                otp_res = self.client.post(
                    "/api/v1/auth/tokenized/request-otp/",
                    data={"phone": "+959779998881", "purpose": "login"},
                    format="json",
                )
            self.assertEqual(otp_res.status_code, status.HTTP_200_OK)
            self.assertNotIn("dev_code", otp_res.json())

            # Exception handler masks verbose validation dumps & unexpected 500s
            resp_val = custom_exception_handler(ValidationError({"raw_sql_field": ["Internal DB constraint info"]}), {})
            self.assertIsNotNone(resp_val)
            self.assertNotIn("raw_sql_field", resp_val.data["error"]["message"])

            resp_500 = custom_exception_handler(RuntimeError("psycopg2 traceback secret"), {"view": "TestView"})
            self.assertEqual(resp_500.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            self.assertNotIn("psycopg2", resp_500.data["error"]["message"])
            self.assertNotIn("traceback", resp_500.data["error"]["message"])
            self.assertEqual(get_client_runtime_config()["consumer_only"], True)

    def test_map_tile_proxy_does_not_throttle_burst_with_429(self):
        anon = APIClient()
        for _ in range(70):
            res = anon.get("/api/v1/maps/tiles/11/1570/895.png?offline=1&placeholder=1")
            self.assertNotEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
            self.assertEqual(res.status_code, status.HTTP_200_OK)
