"""
Unit and Integration Tests for Tokenized Auth Service & Safe Dev-Code Guard (Phase 2A)
File: backend/apps/accounts/tests/test_tokenized_auth_service.py

Covers Phase 2 Tickets AUTH-02 and AUTH-03:
- 6-digit OTP generation and tokenized challenge issuance
- Truthful ConsoleOtpDeliveryAdapter reporting (never claims SMS delivered)
- dev_code gating: strictly suppressed in production even if DEBUG=True
- Full verification lifecycle using only auth_session_token + code
- Request-ID idempotency (reissuing active challenge without rate-limit burn)
- Stable DomainError translations (invalid_challenge, invalid_code, challenge_expired,
  challenge_consumed, otp_rate_limited, account_blocked, account_closed)
- Failed attempt persistence on wrong code
- Sensitive-field redaction for phone, OTP, challenge token, and DRF token
- Legacy request_login_otp and verify_login_otp backward compatibility
"""

import secrets
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token

from apps.accounts.models import AuthOtp, AuthOtpChallenge, Users
from common.exceptions import DomainError
from common.security import (
    compute_challenge_token_hash,
    compute_otp_hash,
    compute_phone_hash,
    encrypt_phone,
    normalize_phone,
    redact_sensitive_data,
    safe_log_context,
)
from services import auth_service


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(100000000):08d}"


class TokenizedAuthServiceTests(TestCase):
    """Integration tests for tokenized auth challenge service against PostgreSQL."""

    def test_tokenized_otp_request_dev_code_available_when_flag_enabled(self):
        """When local dev/test flag is enabled, response includes dev_code and truthful delivery."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            res = auth_service.request_tokenized_login_otp(phone)

        self.assertEqual(res["status"], "dev_code_available")
        self.assertIn("auth_session_token", res)
        self.assertGreaterEqual(len(res["auth_session_token"]), 40)
        self.assertEqual(res["expires_in"], 180)
        self.assertEqual(res["code_length"], 6)

        # Delivery metadata must be truthful: never claim SMS sent
        delivery = res["delivery"]
        self.assertFalse(delivery["delivered"])
        self.assertFalse(delivery["configured"])
        self.assertEqual(delivery["channel"], "console")
        self.assertEqual(delivery["provider"], "console")

        # dev_code must be 6 numeric digits
        self.assertIn("dev_code", res)
        self.assertEqual(len(res["dev_code"]), 6)
        self.assertTrue(res["dev_code"].isdigit())

    def test_tokenized_otp_request_dev_code_suppressed_when_flag_disabled(self):
        """When ALLOW_DEV_CODE_IN_AUTH_RESPONSE is False, dev_code is omitted and status is console_simulated."""
        phone = _unique_phone()
        with override_settings(DEBUG=False, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=False, ENVIRONMENT="staging"):
            res = auth_service.request_tokenized_login_otp(phone)

        self.assertEqual(res["status"], "console_simulated")
        self.assertIn("auth_session_token", res)
        self.assertNotIn("dev_code", res)
        self.assertFalse(res["delivery"]["delivered"])

    def test_dev_code_strictly_suppressed_in_production_even_if_debug_true(self):
        """
        CRITICAL SAFETY TEST (AUTH-03):
        Assert dev_code is NEVER returned when production configuration is detected,
        even if DEBUG is misconfigured to True.
        """
        phone = _unique_phone()
        # Case A: ENVIRONMENT is set to 'production' with DEBUG=True
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="production"):
            res_tokenized = auth_service.request_tokenized_login_otp(phone)
            self.assertNotIn("dev_code", res_tokenized)
            self.assertNotEqual(res_tokenized["status"], "dev_code_available")

            res_legacy = auth_service.request_login_otp(phone)
            self.assertNotIn("dev_code", res_legacy)

        # Case B: SETTINGS_MODULE contains 'production' with DEBUG=True
        phone2 = _unique_phone()
        with override_settings(
            DEBUG=True,
            ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True,
            SETTINGS_MODULE="config.settings.production",
        ):
            res_tokenized2 = auth_service.request_tokenized_login_otp(phone2)
            self.assertNotIn("dev_code", res_tokenized2)

            res_legacy2 = auth_service.request_login_otp(phone2)
            self.assertNotIn("dev_code", res_legacy2)

    def test_tokenized_otp_successful_verification_lifecycle(self):
        """Full successful handshake: request challenge -> verify with code -> DRF token issued."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            req_res = auth_service.request_tokenized_login_otp(phone)
            auth_session_token = req_res["auth_session_token"]
            dev_code = req_res["dev_code"]

        # Client only sends auth_session_token + dev_code (NO phone number!)
        verify_res = auth_service.verify_tokenized_login_otp(
            auth_session_token=auth_session_token,
            code=dev_code,
            display_name="Handshake Volunteer",
        )

        self.assertTrue(verify_res["ok"])
        self.assertIn("token", verify_res)
        user_dto = verify_res["user"]
        self.assertEqual(user_dto["display_name"], "Handshake Volunteer")

        # Confirm token exists in database
        token_obj = Token.objects.filter(key=verify_res["token"]).first()
        self.assertIsNotNone(token_obj)
        self.assertEqual(token_obj.user_id, user_dto["id"])

    def test_request_id_idempotency_returns_active_challenge(self):
        """Retrying an in-flight request with the same request_id returns the existing challenge."""
        phone = _unique_phone()
        req_id = f"client-req-{secrets.token_hex(8)}"

        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            res1 = auth_service.request_tokenized_login_otp(phone, request_id=req_id)
            res2 = auth_service.request_tokenized_login_otp(phone, request_id=req_id)

        self.assertEqual(res1["auth_session_token"], res2["auth_session_token"])
        self.assertTrue(res2.get("idempotent_reissue"))
        self.assertLessEqual(res2["expires_in"], 180)

    def test_invalid_challenge_token_raises_domain_error(self):
        """Unknown or malformed auth_session_token raises HTTP 400 invalid_challenge."""
        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_tokenized_login_otp(
                auth_session_token="completely_unknown_token_value",
                code="123456",
            )
        self.assertEqual(ctx.exception.code, "invalid_challenge")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_invalid_code_raises_domain_error_and_increments_attempts(self):
        """Wrong code raises HTTP 400 invalid_code and increments attempt count on auth_otp row."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            req_res = auth_service.request_tokenized_login_otp(phone)
            auth_session_token = req_res["auth_session_token"]

        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_tokenized_login_otp(
                auth_session_token=auth_session_token,
                code="000000",
            )
        self.assertEqual(ctx.exception.code, "invalid_code")
        self.assertEqual(ctx.exception.status_code, 400)

        # Inspect DB: parent auth_otp attempt count must be 1
        token_hash = compute_challenge_token_hash(auth_session_token)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT o.attempt_count
                  FROM auth_otp o
                  JOIN auth_otp_challenge c ON c.otp_id = o.id
                 WHERE c.challenge_token_hash = %s
                """,
                [token_hash],
            )
            attempts = cursor.fetchone()[0]
        self.assertEqual(attempts, 1)

    def test_challenge_consumed_raises_409(self):
        """Second verification on the same challenge raises HTTP 409 challenge_consumed."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            req_res = auth_service.request_tokenized_login_otp(phone)
            auth_session_token = req_res["auth_session_token"]
            dev_code = req_res["dev_code"]

        # First verify succeeds
        res1 = auth_service.verify_tokenized_login_otp(auth_session_token, dev_code)
        self.assertTrue(res1["ok"])

        # Second verify raises 409 challenge_consumed
        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_tokenized_login_otp(auth_session_token, dev_code)
        self.assertEqual(ctx.exception.code, "challenge_consumed")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_challenge_expired_raises_domain_error(self):
        """Expired challenge raises HTTP 400 challenge_expired."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            req_res = auth_service.request_tokenized_login_otp(phone)
            auth_session_token = req_res["auth_session_token"]
            dev_code = req_res["dev_code"]

        token_hash = compute_challenge_token_hash(auth_session_token)
        # Shift created_at and expires_at into the past
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE auth_otp_challenge
                   SET created_at = now() - INTERVAL '200 seconds',
                       expires_at = now() - INTERVAL '10 seconds'
                 WHERE challenge_token_hash = %s
                """,
                [token_hash],
            )

        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_tokenized_login_otp(auth_session_token, dev_code)
        self.assertEqual(ctx.exception.code, "challenge_expired")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_too_many_attempts_exhaustion_raises_429(self):
        """After 5 failed code attempts, verify raises HTTP 429 otp_rate_limited."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            req_res = auth_service.request_tokenized_login_otp(phone)
            auth_session_token = req_res["auth_session_token"]
            dev_code = req_res["dev_code"]

        for _ in range(5):
            with self.assertRaises(DomainError) as ctx:
                auth_service.verify_tokenized_login_otp(auth_session_token, "000000")
            self.assertEqual(ctx.exception.code, "invalid_code")

        # 6th attempt (even with valid dev_code) must fail with 429 otp_rate_limited
        with self.assertRaises(DomainError) as ctx:
            auth_service.verify_tokenized_login_otp(auth_session_token, dev_code)
        self.assertEqual(ctx.exception.code, "otp_rate_limited")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_account_closed_rejection(self):
        """Users with account_status='closed' are rejected on OTP request."""
        phone = _unique_phone()
        norm = normalize_phone(phone)
        p_hash = compute_phone_hash(norm)
        Users.objects.create(
            phone_hash=p_hash,
            phone_enc=encrypt_phone(norm),
            display_name="Closed User",
            account_status="closed",
            is_active=False,
        )

        with self.assertRaises(DomainError) as ctx:
            auth_service.request_tokenized_login_otp(phone)
        self.assertEqual(ctx.exception.code, "account_closed")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_sensitive_field_redaction_keeps_secrets_out_of_logs(self):
        """redact_sensitive_data strips phone, raw OTP, challenge token, and DRF token."""
        payload = {
            "phone": "+95912345678",
            "raw_phone": "+95912345678",
            "phone_enc": "sensitive_enc",
            "phone_hash": "sensitive_hash",
            "otp": "123456",
            "code": "123456",
            "raw_code": "123456",
            "token": "drf_bearer_token_abc",
            "auth_session_token": "opaque_session_challenge_xyz",
            "safe_event_id": 42,
            "status": "ok",
        }
        redacted = redact_sensitive_data(payload)
        self.assertNotIn("phone", redacted)
        self.assertNotIn("raw_phone", redacted)
        self.assertNotIn("phone_enc", redacted)
        self.assertNotIn("otp", redacted)
        self.assertNotIn("code", redacted)
        self.assertNotIn("token", redacted)
        self.assertNotIn("auth_session_token", redacted)
        self.assertEqual(redacted["safe_event_id"], 42)
        self.assertEqual(redacted["status"], "ok")

    def test_legacy_flow_backward_compatibility(self):
        """Legacy request_login_otp and verify_login_otp continue functioning as expected."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="test"):
            req_res = auth_service.request_login_otp(phone)
            self.assertEqual(req_res["status"], "sent")
            dev_code = req_res["dev_code"]

        verify_res = auth_service.verify_login_otp(phone, dev_code, display_name="Legacy Volunteer")
        self.assertTrue(verify_res["ok"])
        self.assertIn("token", verify_res)
        self.assertEqual(verify_res["user"].display_name, "Legacy Volunteer")
