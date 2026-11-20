"""
DRF BFF Tests for Tokenized Authentication, Legacy Compatibility & Compact Bootstrap
File: backend/apps/accounts/tests/test_bff_auth_tokenized.py

Covers Phase 3 Tickets AUTH-02, AUTH-03, ATT-01, API-01:
- POST /api/v1/auth/tokenized/request-otp/ (public, returns challenge token & delivery metadata)
- POST /api/v1/auth/tokenized/verify-otp/ (public, accepts token + code only, returns DRF token)
- Error mapping to stable HTTP statuses & machine-readable codes
- Legacy auth deprecation Warning header (299)
- GET /api/v1/me/bootstrap/ (minimal query count, email is explicit null, decrypted phone, capabilities)
"""

import secrets
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles
from common.security import (
    compute_phone_hash,
    encrypt_phone,
    normalize_phone,
)
from services import auth_service, coordinator_service


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(100000000):08d}"


class BffAuthTokenizedTests(TestCase):
    """Integration tests for tokenized auth BFF endpoints and /me/bootstrap/."""

    def setUp(self):
        self.client = APIClient()

    # --- Tokenized OTP Request Endpoint ---

    def test_tokenized_otp_request_endpoint_success(self):
        """POST /api/v1/auth/tokenized/request-otp/ issues auth_session_token and truthful delivery metadata."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            res = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone, "purpose": "login"},
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "dev_code_available")
        self.assertIn("auth_session_token", res.data)
        self.assertEqual(res.data["expires_in"], 180)
        self.assertEqual(res.data["code_length"], 6)
        self.assertIn("dev_code", res.data)
        self.assertEqual(len(res.data["dev_code"]), 6)

        delivery = res.data["delivery"]
        self.assertFalse(delivery["delivered"])
        self.assertFalse(delivery["configured"])

    def test_tokenized_otp_request_suppresses_dev_code_in_production(self):
        """dev_code is strictly excluded when ALLOW_DEV_CODE_IN_AUTH_RESPONSE is False."""
        phone = _unique_phone()
        with override_settings(DEBUG=False, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=False, ENVIRONMENT="production"):
            res = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone},
                format="json",
            )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("dev_code", res.data)
        self.assertIn("auth_session_token", res.data)

    def test_tokenized_otp_request_idempotency_with_request_id(self):
        """Repeating request with identical request_id returns the same active challenge."""
        phone = _unique_phone()
        req_id = "req-test-uuid-12345"
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            res1 = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone, "request_id": req_id},
                format="json",
            )
            res2 = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone, "request_id": req_id},
                format="json",
            )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data["auth_session_token"], res2.data["auth_session_token"])

    # --- Tokenized OTP Verify Endpoint ---

    def test_tokenized_otp_verify_success_without_phone(self):
        """POST /api/v1/auth/tokenized/verify-otp/ accepts token + code only (NO phone) and returns DRF Token."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            req_res = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone},
                format="json",
            )
            session_token = req_res.data["auth_session_token"]
            dev_code = req_res.data["dev_code"]

            verify_res = self.client.post(
                "/api/v1/auth/tokenized/verify-otp/",
                {
                    "auth_session_token": session_token,
                    "code": dev_code,
                    "display_name": "Test Verified User",
                },
                format="json",
            )

        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertIn("token", verify_res.data)
        self.assertIn("user", verify_res.data)
        user_data = verify_res.data["user"]
        self.assertEqual(user_data["display_name"], "Test Verified User")
        self.assertIn("id", user_data)
        self.assertIn("uuid", user_data)
        self.assertEqual(user_data["verification_status"], "none")

    def test_tokenized_otp_verify_invalid_code_error_mapping(self):
        """Wrong code returns HTTP 400 with machine-readable error code 'invalid_code'."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            req_res = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone},
                format="json",
            )
            session_token = req_res.data["auth_session_token"]

            verify_res = self.client.post(
                "/api/v1/auth/tokenized/verify-otp/",
                {
                    "auth_session_token": session_token,
                    "code": "000000",
                },
                format="json",
            )
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(verify_res.data.get("error", {}).get("code"), "invalid_code")

    def test_tokenized_otp_verify_invalid_challenge_error_mapping(self):
        """Bogus challenge token returns HTTP 400 with code 'invalid_challenge' (Section 4.3)."""
        verify_res = self.client.post(
            "/api/v1/auth/tokenized/verify-otp/",
            {
                "auth_session_token": "nonexistent-challenge-token-that-cannot-exist-12345678",
                "code": "123456",
            },
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(verify_res.data.get("error", {}).get("code"), "invalid_challenge")

    def test_tokenized_otp_verify_replay_fails_with_challenge_consumed(self):
        """Replaying a verified challenge token returns HTTP 409 'challenge_consumed'."""
        phone = _unique_phone()
        with override_settings(DEBUG=True, ALLOW_DEV_CODE_IN_AUTH_RESPONSE=True, ENVIRONMENT="development"):
            req_res = self.client.post(
                "/api/v1/auth/tokenized/request-otp/",
                {"phone": phone},
                format="json",
            )
            session_token = req_res.data["auth_session_token"]
            dev_code = req_res.data["dev_code"]

            v1 = self.client.post(
                "/api/v1/auth/tokenized/verify-otp/",
                {"auth_session_token": session_token, "code": dev_code},
                format="json",
            )
            self.assertEqual(v1.status_code, status.HTTP_200_OK)

            # Replay
            v2 = self.client.post(
                "/api/v1/auth/tokenized/verify-otp/",
                {"auth_session_token": session_token, "code": dev_code},
                format="json",
            )
        self.assertEqual(v2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(v2.data.get("error", {}).get("code"), "challenge_consumed")

    # --- Legacy Deprecation Headers ---

    def test_legacy_auth_routes_emit_deprecation_warning(self):
        """Legacy /api/v1/auth/otp/request/ and /api/v1/auth/otp/verify/ include HTTP Warning header."""
        phone = _unique_phone()
        req_res = self.client.post(
            "/api/v1/auth/otp/request/",
            {"phone": phone},
            format="json",
        )
        self.assertEqual(req_res.status_code, status.HTTP_200_OK)
        self.assertIn("Warning", req_res.headers)
        self.assertIn("299", req_res.headers["Warning"])
        self.assertIn("Deprecated", req_res.headers["Warning"])

        code = req_res.data.get("dev_code")
        if code:
            verify_res = self.client.post(
                "/api/v1/auth/otp/verify/",
                {"phone": phone, "code": code},
                format="json",
            )
            self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
            self.assertIn("Warning", verify_res.headers)
            self.assertIn("299", verify_res.headers["Warning"])

    # --- Compact Session Bootstrap (/api/v1/me/bootstrap/) ---

    def test_me_bootstrap_unauthenticated_returns_401(self):
        """Unauthenticated call to /api/v1/me/bootstrap/ returns 401."""
        res = self.client.get("/api/v1/me/bootstrap/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_bootstrap_returns_compact_identity_and_null_email(self):
        """
        Authenticated volunteer user bootstrap returns:
        - user: id, uuid, display_name, phone (decrypted), email: null (never phone fallback)
        - coordinator: status: 'none', can_access_workspace: False
        - capabilities: volunteer: True, coordinator: False
        """
        raw_phone = _unique_phone()
        ph = normalize_phone(raw_phone)
        user = Users.objects.create(
            phone_hash=compute_phone_hash(ph),
            phone_enc=encrypt_phone(ph),
            display_name="Bootstrap Volunteer",
            account_status="active",
            verification_status="none",
        )
        token, _ = Token.objects.get_or_create(user=user)

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        res = self.client.get("/api/v1/me/bootstrap/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        user_data = res.data["user"]
        self.assertEqual(user_data["id"], user.id)
        self.assertEqual(user_data["display_name"], "Bootstrap Volunteer")
        self.assertEqual(user_data["phone"], ph)
        self.assertIsNone(user_data["email"], "email MUST be explicitly None, never phone fallback")
        self.assertEqual(user_data["account_status"], "active")
        self.assertEqual(user_data["verification_status"], "none")

        coord_data = res.data["coordinator"]
        self.assertEqual(coord_data["status"], "none")
        self.assertFalse(coord_data["can_access_workspace"])

        cap_data = res.data["capabilities"]
        self.assertTrue(cap_data["volunteer"])
        self.assertFalse(cap_data["coordinator"])

    def test_me_bootstrap_coordinator_user_access_flags(self):
        """Approved coordinator user has can_access_workspace=True and coordinator capability=True."""
        admin = Users.objects.create(
            phone_hash=compute_phone_hash(_unique_phone()),
            phone_enc=encrypt_phone(_unique_phone()),
            display_name="Bootstrap Admin",
            is_admin=True,
            verification_status="verified",
        )
        coord_user = Users.objects.create(
            phone_hash=compute_phone_hash(_unique_phone()),
            phone_enc=encrypt_phone(_unique_phone()),
            display_name="Bootstrap Coordinator",
            account_status="active",
            verification_status="verified",
        )
        coordinator_service.apply_for_coordinator(coord_user, "Vetting notes")
        coordinator_service.approve_coordinator(admin, coord_user.id, "Approved")
        coord_user.refresh_from_db()

        token, _ = Token.objects.get_or_create(user=coord_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        res = self.client.get("/api/v1/me/bootstrap/")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["coordinator"]["status"], "approved")
        self.assertTrue(res.data["coordinator"]["can_access_workspace"])
        self.assertTrue(res.data["capabilities"]["coordinator"])
        self.assertTrue(res.data["capabilities"]["volunteer"])

    def test_me_bootstrap_query_count_is_minimal(self):
        """
        Verify that /api/v1/me/bootstrap/ executes minimal queries:
        1 for token authentication (Token + User) and 1 for coordinator profile status.
        Excluding audit middleware session set_config and transaction savepoints,
        at most 2 application domain queries occur.
        """
        raw_phone = _unique_phone()
        ph = normalize_phone(raw_phone)
        user = Users.objects.create(
            phone_hash=compute_phone_hash(ph),
            phone_enc=encrypt_phone(ph),
            display_name="Query Count User",
            account_status="active",
        )
        token, _ = Token.objects.get_or_create(user=user)

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

        with CaptureQueriesContext(connection) as ctx:
            res = self.client.get("/api/v1/me/bootstrap/")
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Filter out set_config (audit context middleware) and savepoints (test runner)
        domain_queries = [
            q for q in ctx.captured_queries
            if not ("set_config" in q["sql"] or "SAVEPOINT" in q["sql"])
        ]
        self.assertEqual(
            len(domain_queries),
            2,
            f"Expected exactly 2 domain queries (1 auth + 1 coord status), got {len(domain_queries)}: {domain_queries}",
        )
