"""
Database Integration tests for Phase 3 — Triggers, Constraints & Stored Procedures.
File: backend/apps/accounts/tests/test_db_triggers_constraints.py
"""
from datetime import timedelta
import secrets

from django.db import connection, IntegrityError
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from common.exceptions import DomainError
from common.utils import compute_otp_hash, compute_phone_hash, encrypt_phone, normalize_phone
from services import auth_service


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(100000000):08d}"


def _make_user(phone: str = None, name: str = "DB User", **kwargs) -> Users:
    raw = phone or _unique_phone()
    norm = normalize_phone(raw)
    return Users.objects.create(
        phone_hash=compute_phone_hash(norm),
        phone_enc=encrypt_phone(norm),
        display_name=name,
        **kwargs,
    )


class DatabaseTriggersAndConstraintsTests(TestCase):
    """Test PostgreSQL triggers, constraints, and stored procedures directly."""

    def test_trg_01_otp_rate_limit_enforced_by_database(self):
        """PostgreSQL trigger trg_01_otp_rate_limit caps requests to 5 per hour."""
        phone = _unique_phone()
        # 5 allowed requests within the hour
        for _ in range(5):
            res = auth_service.request_login_otp(phone)
            self.assertEqual(res["status"], "sent")

        # 6th request triggers trg_01_otp_rate_limit -> translated to DomainError (429)
        with self.assertRaises(DomainError) as ctx:
            auth_service.request_login_otp(phone)
        self.assertEqual(ctx.exception.code, "otp_rate_limited")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_ck_users_emergency_contact_pairing_constraint(self):
        """Database constraint requires both emergency name and phone, or neither."""
        phone = _unique_phone()
        norm = normalize_phone(phone)
        p_hash = compute_phone_hash(norm)
        p_enc = encrypt_phone(norm)

        # Attempt to insert emergency_contact_name without emergency_contact_phone_enc
        with self.assertRaises(IntegrityError):
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO users (phone_hash, phone_enc, display_name, emergency_contact_name, emergency_contact_phone_enc)
                    VALUES (%s, %s, %s, %s, NULL)
                    """,
                    [p_hash, p_enc, "Broken User", "Emergency Contact Name"],
                )

    def test_release_expired_blocks_stored_procedure(self):
        """release_expired_blocks() unblocks accounts whose blocked_until <= now()."""
        past = timezone.now() - timedelta(minutes=5)
        user = _make_user(account_status="blocked", blocked_until=past)
        user.is_active = False
        user.save(update_fields=["is_active"])

        # Execute PostgreSQL release_expired_blocks
        with connection.cursor() as cursor:
            cursor.execute("SELECT release_expired_blocks()")
            rows_updated = cursor.fetchone()[0]

        self.assertGreaterEqual(rows_updated, 1)
        user.refresh_from_db()
        self.assertEqual(user.account_status, "active")
        self.assertIsNone(user.blocked_until)

    def test_native_stored_procedures_request_and_verify_otp(self):
        """Execute request_otp and verify_otp stored procedures directly."""
        phone = _unique_phone()
        p_hash = compute_phone_hash(normalize_phone(phone))
        c_hash = compute_otp_hash("5555")

        with connection.cursor() as cursor:
            cursor.execute("SELECT request_otp(%s, %s, %s)", [p_hash, c_hash, "login"])
            otp_id = cursor.fetchone()[0]
            self.assertIsNotNone(otp_id)

            # Verify with wrong code
            wrong_hash = compute_otp_hash("0000")
            cursor.execute("SELECT verify_otp(%s, %s, %s)", [p_hash, wrong_hash, "login"])
            status_code = cursor.fetchone()[0]
            self.assertEqual(status_code, "invalid_code")

            # Verify with correct code
            cursor.execute("SELECT verify_otp(%s, %s, %s)", [p_hash, c_hash, "login"])
            status_code = cursor.fetchone()[0]
            self.assertEqual(status_code, "ok")

