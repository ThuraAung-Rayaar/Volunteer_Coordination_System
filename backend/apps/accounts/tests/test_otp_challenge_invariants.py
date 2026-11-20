"""
PostgreSQL Database Invariant & Concurrency Tests for OTP Challenge (v0.12.0)
File: backend/apps/accounts/tests/test_otp_challenge_invariants.py

Covers Phase 1 Tickets AUTH-01 and AUTH-04:
- Unique challenge hash constraint
- Exact otp_id foreign key binding
- Challenge expiry cap (<= auth_otp.expires_at)
- Single-use consumption & second-use rejection
- Failed-attempt counter increments on exact bound auth_otp row
- Attempt limit exhaustion ('too_many_attempts')
- Concurrent / parallel verify race safety (strictly one succeeds)
- Independence: newer OTP requests cannot satisfy older challenges
- Purpose mismatch rejection
- Dual expiry clock enforcement (challenge clock & OTP clock)
- Preservation of existing phone-based OTP request rate limit trigger
- Key separation validation & token helpers
"""

import threading
from datetime import timedelta
import secrets

from django.db import connection, connections, IntegrityError, DatabaseError
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.models import AuthOtp, AuthOtpChallenge, Users
from common.security import (
    compute_challenge_token_hash,
    compute_otp_hash,
    compute_phone_hash,
    generate_challenge_token,
    generate_otp_code,
    normalize_phone,
    validate_key_separation,
)


def _unique_phone() -> str:
    return f"+959{secrets.randbelow(100000000):08d}"


class OtpChallengeDatabaseInvariantTests(TransactionTestCase):
    """
    Direct database tests against PostgreSQL enforcing database-first invariants.
    Uses TransactionTestCase to enable true concurrent thread execution and row locking.
    """

    def setUp(self):
        super().setUp()
        self.phone = _unique_phone()
        self.phone_hash = compute_phone_hash(normalize_phone(self.phone))
        self.code = "123456"
        self.code_hash = compute_otp_hash(self.code)

    def _create_otp(self, code: str = None, purpose: str = "login", ttl_minutes: int = 5) -> int:
        c_hash = compute_otp_hash(code) if code else self.code_hash
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO auth_otp (phone_hash, code_hash, purpose, expires_at)
                VALUES (%s, %s, %s, now() + make_interval(mins => %s))
                RETURNING id
                """,
                [self.phone_hash, c_hash, purpose, ttl_minutes],
            )
            return cursor.fetchone()[0]

    def _create_challenge(
        self,
        otp_id: int,
        token: str = None,
        ttl_seconds: int = 180,
        purpose: str = "login",
        request_id: str = None,
        nonce_hash: str = None,
    ) -> tuple[int, str, str]:
        raw_token = token or generate_challenge_token()
        token_hash = compute_challenge_token_hash(raw_token)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT create_otp_challenge(%s, %s, %s, %s, %s, %s)
                """,
                [otp_id, token_hash, ttl_seconds, purpose, request_id, nonce_hash],
            )
            challenge_id = cursor.fetchone()[0]
        return challenge_id, raw_token, token_hash

    # -------------------------------------------------------------------------
    # 1. Unique Challenge Hash Constraint
    # -------------------------------------------------------------------------
    def test_unique_challenge_hash_enforced(self):
        """Inserting two challenge rows with identical token hashes must violate uniqueness."""
        otp_id = self._create_otp()
        raw_token = generate_challenge_token()
        token_hash = compute_challenge_token_hash(raw_token)

        # First insert succeeds
        self._create_challenge(otp_id, token=raw_token)

        # Second insert with identical token_hash must fail
        with self.assertRaises((IntegrityError, DatabaseError)):
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_otp_challenge (otp_id, challenge_token_hash, purpose, expires_at)
                    VALUES (%s, %s, 'login', now() + INTERVAL '180 seconds')
                    """,
                    [otp_id, token_hash],
                )

    # -------------------------------------------------------------------------
    # 2. Exact otp_id Foreign Key Binding
    # -------------------------------------------------------------------------
    def test_exact_otp_id_foreign_key_binding(self):
        """Challenge row referencing a non-existent auth_otp.id must be rejected."""
        fake_otp_id = 999999999
        raw_token = generate_challenge_token()
        token_hash = compute_challenge_token_hash(raw_token)

        with self.assertRaises((IntegrityError, DatabaseError)):
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT create_otp_challenge(%s, %s, 180, 'login', NULL, NULL)
                    """,
                    [fake_otp_id, token_hash],
                )

    # -------------------------------------------------------------------------
    # 3. Expiry Cap (challenge.expires_at <= otp.expires_at)
    # -------------------------------------------------------------------------
    def test_expiry_cap_cannot_exceed_parent_otp_expiry(self):
        """Database trigger trg_01_auth_otp_challenge_guard blocks challenge outliving parent OTP."""
        # Create OTP expiring in 60 seconds
        otp_id = self._create_otp(ttl_minutes=1)
        raw_token = generate_challenge_token()
        token_hash = compute_challenge_token_hash(raw_token)

        # Attempt to insert challenge expiring in 120 seconds directly
        with self.assertRaises(DatabaseError) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_otp_challenge (otp_id, challenge_token_hash, purpose, expires_at)
                    VALUES (%s, %s, 'login', now() + INTERVAL '120 seconds')
                    """,
                    [otp_id, token_hash],
                )
        self.assertIn("challenge_expiry_exceeds_otp", str(ctx.exception))

    def test_create_otp_challenge_helper_caps_ttl_at_180s(self):
        """create_otp_challenge caps requested TTL to 180 seconds and parent OTP expiry."""
        otp_id = self._create_otp(ttl_minutes=10)
        # Request 600s TTL; helper must cap at 180s
        chal_id, _, _ = self._create_challenge(otp_id, ttl_seconds=600)

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT expires_at - created_at FROM auth_otp_challenge WHERE id = %s
                """,
                [chal_id],
            )
            diff = cursor.fetchone()[0]
            # Difference should be exactly 180 seconds (+/- 1s execution jitter)
            self.assertLessEqual(diff.total_seconds(), 181)
            self.assertGreaterEqual(diff.total_seconds(), 179)

    # -------------------------------------------------------------------------
    # 4. Single-Use Consumption & Second-Use Rejection
    # -------------------------------------------------------------------------
    def test_single_use_consumption_and_second_use_rejection(self):
        """verify_otp_challenge succeeds once, consumes both rows, and rejects a second verify."""
        otp_id = self._create_otp(code="654321")
        _, _, token_hash = self._create_challenge(otp_id)
        valid_code_hash = compute_otp_hash("654321")

        with connection.cursor() as cursor:
            # First verification -> 'ok'
            cursor.execute(
                "SELECT status, phone_hash, otp_id FROM verify_otp_challenge(%s, %s, 'login')",
                [token_hash, valid_code_hash],
            )
            row1 = cursor.fetchone()
            self.assertEqual(row1[0], "ok")
            self.assertEqual(row1[1], self.phone_hash)
            self.assertEqual(row1[2], otp_id)

            # Confirm rows are marked consumed in DB
            cursor.execute("SELECT consumed_at FROM auth_otp_challenge WHERE challenge_token_hash = %s", [token_hash])
            chal_consumed = cursor.fetchone()[0]
            self.assertIsNotNone(chal_consumed)

            cursor.execute("SELECT consumed_at FROM auth_otp WHERE id = %s", [otp_id])
            otp_consumed = cursor.fetchone()[0]
            self.assertIsNotNone(otp_consumed)

            # Second verification -> 'challenge_consumed'
            cursor.execute(
                "SELECT status, phone_hash, otp_id FROM verify_otp_challenge(%s, %s, 'login')",
                [token_hash, valid_code_hash],
            )
            row2 = cursor.fetchone()
            self.assertEqual(row2[0], "challenge_consumed")

    # -------------------------------------------------------------------------
    # 5. Failed Attempt Counter Increments on Exact Bound auth_otp Row
    # -------------------------------------------------------------------------
    def test_wrong_code_increments_failed_attempts_on_exact_otp_row(self):
        """Calling verify_otp_challenge with wrong code increments attempt_count and does NOT consume."""
        otp_id = self._create_otp(code="111111")
        _, _, token_hash = self._create_challenge(otp_id)
        wrong_code_hash = compute_otp_hash("999999")

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT status, phone_hash, otp_id FROM verify_otp_challenge(%s, %s, 'login')",
                [token_hash, wrong_code_hash],
            )
            row = cursor.fetchone()
            self.assertEqual(row[0], "invalid_code")

            # Check auth_otp attempt count incremented to 1
            cursor.execute("SELECT attempt_count, consumed_at FROM auth_otp WHERE id = %s", [otp_id])
            otp_attempts, otp_consumed = cursor.fetchone()
            self.assertEqual(otp_attempts, 1)
            self.assertIsNone(otp_consumed)

            # Check challenge is still unconsumed
            cursor.execute("SELECT consumed_at FROM auth_otp_challenge WHERE challenge_token_hash = %s", [token_hash])
            chal_consumed = cursor.fetchone()[0]
            self.assertIsNone(chal_consumed)

    # -------------------------------------------------------------------------
    # 6. Max Attempt Limit Exhaustion ('too_many_attempts')
    # -------------------------------------------------------------------------
    def test_max_attempts_exceeded_rejects_subsequent_verifications(self):
        """After reaching setting_int('otp_max_attempts') (5), verify_otp_challenge returns 'too_many_attempts'."""
        otp_id = self._create_otp(code="222222")
        _, _, token_hash = self._create_challenge(otp_id)
        wrong_hash = compute_otp_hash("000000")
        correct_hash = compute_otp_hash("222222")

        with connection.cursor() as cursor:
            # 5 failed attempts
            for _ in range(5):
                cursor.execute(
                    "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                    [token_hash, wrong_hash],
                )
                self.assertEqual(cursor.fetchone()[0], "invalid_code")

            # 6th attempt (even with correct code) must fail with 'too_many_attempts'
            cursor.execute(
                "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                [token_hash, correct_hash],
            )
            self.assertEqual(cursor.fetchone()[0], "too_many_attempts")

    # -------------------------------------------------------------------------
    # 7. Concurrent Parallel Verify Race Safety
    # -------------------------------------------------------------------------
    def test_concurrent_parallel_verify_race_safety(self):
        """
        Two parallel threads executing verify_otp_challenge for the same challenge.
        Deterministic FOR UPDATE locking ensures strictly ONE succeeds with 'ok'
        and the other receives 'challenge_consumed'.
        """
        otp_id = self._create_otp(code="333333")
        _, _, token_hash = self._create_challenge(otp_id)
        valid_code_hash = compute_otp_hash("333333")

        results = []
        barrier = threading.Barrier(2)

        def worker(thread_idx: int):
            # Close existing connection to ensure worker gets an independent DB connection
            connections.close_all()
            barrier.wait()
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                    [token_hash, valid_code_hash],
                )
                status = cursor.fetchone()[0]
                results.append((thread_idx, status))

        t1 = threading.Thread(target=worker, args=(1,))
        t2 = threading.Thread(target=worker, args=(2,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Consolidate statuses
        statuses = [r[1] for r in results]
        self.assertEqual(len(statuses), 2)
        self.assertEqual(statuses.count("ok"), 1, f"Expected exactly one 'ok', got {statuses}")
        self.assertEqual(statuses.count("challenge_consumed"), 1, f"Expected one 'challenge_consumed', got {statuses}")

    # -------------------------------------------------------------------------
    # 8. Independence: Newer OTP Requests Cannot Satisfy Older Challenges
    # -------------------------------------------------------------------------
    def test_newer_otp_request_cannot_satisfy_older_challenge(self):
        """Code from OTP-2 cannot be used to verify Challenge-1 (bound to OTP-1)."""
        otp_1 = self._create_otp(code="111111")
        _, _, token_hash_1 = self._create_challenge(otp_1)

        otp_2 = self._create_otp(code="222222")
        _, _, token_hash_2 = self._create_challenge(otp_2)

        code_2_hash = compute_otp_hash("222222")

        with connection.cursor() as cursor:
            # Using OTP-2's code against Challenge-1 must fail
            cursor.execute(
                "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                [token_hash_1, code_2_hash],
            )
            self.assertEqual(cursor.fetchone()[0], "invalid_code")

            # Using OTP-2's code against Challenge-2 succeeds
            cursor.execute(
                "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                [token_hash_2, code_2_hash],
            )
            self.assertEqual(cursor.fetchone()[0], "ok")

    # -------------------------------------------------------------------------
    # 9. Purpose Mismatch Rejection
    # -------------------------------------------------------------------------
    def test_purpose_mismatch_rejection(self):
        """Trigger prevents mismatched purpose insert, and verify rejects mismatched purpose query."""
        otp_id = self._create_otp(code="444444", purpose="login")
        chal_id, _, token_hash = self._create_challenge(otp_id, purpose="login")
        valid_code_hash = compute_otp_hash("444444")

        # 1. Calling verify_otp_challenge with wrong purpose ('qr_registration')
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT status FROM verify_otp_challenge(%s, %s, 'qr_registration')",
                [token_hash, valid_code_hash],
            )
            self.assertEqual(cursor.fetchone()[0], "invalid_challenge")

        # 2. Trigger blocks creating challenge with purpose mismatched from parent OTP
        raw_token2 = generate_challenge_token()
        token_hash2 = compute_challenge_token_hash(raw_token2)
        with self.assertRaises(DatabaseError) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_otp_challenge (otp_id, challenge_token_hash, purpose, expires_at)
                    VALUES (%s, %s, 'qr_registration', now() + INTERVAL '180 seconds')
                    """,
                    [otp_id, token_hash2],
                )
        self.assertIn("purpose_mismatch", str(ctx.exception))

    # -------------------------------------------------------------------------
    # 10. Dual Expiry Clock Enforcement
    # -------------------------------------------------------------------------
    def test_both_expiry_clocks_enforced(self):
        """If either the challenge expires OR the parent OTP expires, challenge_expired is returned."""
        # Case A: Challenge expired, but OTP still valid
        otp_id = self._create_otp(code="555555", ttl_minutes=10)
        _, _, chal_hash = self._create_challenge(otp_id)
        code_hash = compute_otp_hash("555555")

        with connection.cursor() as cursor:
            # Shift created_at back so expires_at > created_at check constraint is satisfied
            cursor.execute(
                """
                UPDATE auth_otp_challenge
                   SET created_at = now() - INTERVAL '200 seconds',
                       expires_at = now() - INTERVAL '10 seconds'
                 WHERE challenge_token_hash = %s
                """,
                [chal_hash],
            )
            cursor.execute(
                "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                [chal_hash, code_hash],
            )
            self.assertEqual(cursor.fetchone()[0], "challenge_expired")

        # Case B: Parent OTP expired in the past
        phone2 = _unique_phone()
        p_hash2 = compute_phone_hash(normalize_phone(phone2))
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO auth_otp (phone_hash, code_hash, purpose, created_at, expires_at)
                VALUES (%s, %s, 'login', now() - INTERVAL '120 seconds', now() - INTERVAL '10 seconds')
                RETURNING id, expires_at
                """,
                [p_hash2, code_hash],
            )
            otp_id2, otp_expires_at = cursor.fetchone()

            raw_token3 = generate_challenge_token()
            chal_hash3 = compute_challenge_token_hash(raw_token3)
            cursor.execute(
                """
                INSERT INTO auth_otp_challenge (otp_id, challenge_token_hash, purpose, created_at, expires_at)
                VALUES (%s, %s, 'login', now() - INTERVAL '120 seconds', %s)
                """,
                [otp_id2, chal_hash3, otp_expires_at],
            )

            cursor.execute(
                "SELECT status FROM verify_otp_challenge(%s, %s, 'login')",
                [chal_hash3, code_hash],
            )
            self.assertEqual(cursor.fetchone()[0], "challenge_expired")

    # -------------------------------------------------------------------------
    # 11. Existing Phone Rate-Limit Trigger Preserved
    # -------------------------------------------------------------------------
    def test_existing_phone_rate_limit_trigger_preserved(self):
        """Database trigger trg_01_otp_rate_limit on auth_otp continues to cap requests at 5/hour."""
        phone = _unique_phone()
        p_hash = compute_phone_hash(normalize_phone(phone))
        c_hash = compute_otp_hash("999999")

        with connection.cursor() as cursor:
            # 5 inserts allowed
            for _ in range(5):
                cursor.execute(
                    "INSERT INTO auth_otp (phone_hash, code_hash, purpose, expires_at) VALUES (%s, %s, 'login', now() + INTERVAL '5 minutes')",
                    [p_hash, c_hash],
                )

            # 6th insert triggers trg_01_otp_rate_limit exception
            with self.assertRaises(DatabaseError) as ctx:
                cursor.execute(
                    "INSERT INTO auth_otp (phone_hash, code_hash, purpose, expires_at) VALUES (%s, %s, 'login', now() + INTERVAL '5 minutes')",
                    [p_hash, c_hash],
                )
            self.assertIn("otp_rate_limited", str(ctx.exception))

    # -------------------------------------------------------------------------
    # 12. Key Separation & Token Helpers
    # -------------------------------------------------------------------------
    def test_key_separation_and_token_helpers(self):
        """Verify token generation entropy, HMAC hashing, and key separation validation."""
        validate_key_separation()  # Must not raise under configured settings

        token1 = generate_challenge_token()
        token2 = generate_challenge_token()
        self.assertNotEqual(token1, token2)
        self.assertGreaterEqual(len(token1), 40)

        hash1 = compute_challenge_token_hash(token1)
        hash2 = compute_challenge_token_hash(token1)
        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)

        code_hash = compute_otp_hash("123456")
        self.assertEqual(len(code_hash), 64)
        # Verify code hash using OTP_CODE_HMAC_SECRET differs from challenge hash using AUTH_SESSION_TOKEN_SECRET
        self.assertNotEqual(hash1, code_hash)
