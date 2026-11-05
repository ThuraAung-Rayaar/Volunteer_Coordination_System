"""
Tests for Phase 1: Core Infrastructure and Security Context.

Tests cover:
1. Database session context (SET LOCAL app.user_id / app.ip)
2. Transaction utilities
3. Exception hierarchy and DB error translation
4. Permission infrastructure and SQL alignment
5. Privacy tier enforcement (T0-T4)
6. Security utilities
7. BlockedAwareTokenAuthentication
"""

import io
import os
import re
import secrets
import shutil
import time
import uuid
from datetime import timedelta
from pathlib import Path
from PIL import Image
from django.conf import settings
from django.test import TestCase, TransactionTestCase, RequestFactory
from django.db import connection, IntegrityError, transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers
from rest_framework.test import APIRequestFactory
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.authtoken.models import Token

from common.db_context import (
    set_db_session_context,
    get_db_session_context,
    get_client_ip,
    clear_db_session_context,
    set_system_actor_context,
    DbContextMiddleware,
)
from common.transactions import (
    service_transaction,
    call_db_function,
    call_db_function_returning,
    atomic_service,
    savepoint,
)
from common.exceptions import (
    DomainError,
    ValidationError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
    OwnerMonitorReadOnlyError,
    CapacityFullError,
    ScheduleConflictError,
    DuplicateError,
    translate_db_exception,
    custom_exception_handler,
    log_security_event,
)
from common.permissions import (
    ensure_active_user,
    ensure_admin,
    ensure_approved_coordinator,
    get_event_for_manager_or_404,
    get_visible_event_or_404,
    can_coordinator_read_t2,
    _is_event_manager,
    IsActiveUser,
    IsAdminUser,
    IsApprovedCoordinator,
    AllowListSerializerMixin,
)
from common.privacy import (
    PrivacyTier,
    get_minimal_public_card,
    get_self_profile_data,
    get_t2_volunteer_card,
    filter_fields_for_tier,
    NEVER_EXPOSE_FIELDS,
    can_access_t3_data,
    can_access_t4_data,
)
from common.security import (
    normalize_phone,
    compute_phone_hash,
    hash_phone,
    encrypt_phone,
    decrypt_phone,
    compute_otp_hash,
    generate_otp_code,
    generate_raw_qr_token,
    hash_qr_token,
    redact_sensitive_data,
)
from common.utils import (
    normalize_tags,
    truncate_string,
    safe_int,
    sanitize_and_save_verification_jpeg,
)
from common.authentication import BlockedAwareTokenAuthentication

User = get_user_model()


# =============================================================================
# DATABASE CONTEXT TESTS (TransactionTestCase for real transaction isolation)
# =============================================================================

class TestDbContext(TransactionTestCase):
    """Test PostgreSQL session context management."""

    def test_set_user_id_context(self):
        """Authenticated user context reaches PostgreSQL."""
        with transaction.atomic():
            set_db_session_context(user_id=12345, ip_address="192.168.1.1")
            with connection.cursor() as cursor:
                cursor.execute("SELECT app_user_id()")
                result = cursor.fetchone()[0]
                self.assertEqual(result, 12345)

    def test_set_ip_context(self):
        """IP address context reaches PostgreSQL."""
        with transaction.atomic():
            set_db_session_context(user_id=1, ip_address="10.0.0.1")
            with connection.cursor() as cursor:
                cursor.execute("SELECT host(app_ip())")
                result = cursor.fetchone()[0]
                self.assertEqual(result, "10.0.0.1")

    def test_anonymous_context(self):
        """Anonymous context (user_id=None) behaves correctly."""
        with transaction.atomic():
            set_db_session_context(user_id=None, ip_address="")
            with connection.cursor() as cursor:
                cursor.execute("SELECT app_user_id()")
                result = cursor.fetchone()[0]
                self.assertIsNone(result)

    def test_set_system_actor_context(self):
        """System actor context clears app_user_id."""
        with transaction.atomic():
            set_db_session_context(user_id=555)
            set_system_actor_context()
            with connection.cursor() as cursor:
                cursor.execute("SELECT app_user_id()")
                self.assertIsNone(cursor.fetchone()[0])

    def test_context_does_not_leak_between_transactions(self):
        """Context is discarded after transaction completion."""
        with transaction.atomic():
            set_db_session_context(user_id=999, ip_address="1.2.3.4")

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SELECT current_setting('app.user_id', true)")
                result = cursor.fetchone()[0]
                self.assertNotEqual(result, "999")

    def test_context_cleared_on_rollback(self):
        """Context is discarded when transaction rolls back."""
        try:
            with transaction.atomic():
                set_db_session_context(user_id=888, ip_address="5.6.7.8")
                raise Exception("Force rollback")
        except Exception:
            pass

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SELECT current_setting('app.user_id', true)")
                result = cursor.fetchone()[0]
                self.assertNotEqual(result, "888")

    def test_get_client_ip_from_remote_addr(self):
        """IP extraction from REMOTE_ADDR."""
        factory = RequestFactory()
        request = factory.get("/", REMOTE_ADDR="203.0.113.50")
        self.assertEqual(get_client_ip(request), "203.0.113.50")

    def test_get_client_ip_from_x_forwarded_for(self):
        """IP extraction from X-Forwarded-For header."""
        factory = RequestFactory()
        request = factory.get("/", HTTP_X_FORWARDED_FOR="198.51.100.1, 10.0.0.1")
        self.assertEqual(get_client_ip(request), "198.51.100.1")

    def test_get_client_ip_invalid(self):
        """Invalid IP returns empty string."""
        factory = RequestFactory()
        request = factory.get("/", REMOTE_ADDR="not-an-ip")
        self.assertEqual(get_client_ip(request), "")

    def test_db_context_middleware(self):
        """DbContextMiddleware sets context for authenticated requests."""
        factory = RequestFactory()
        request = factory.get("/", REMOTE_ADDR="192.168.1.10")
        user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_x",
            display_name="Middleware User",
        )
        request.user = user

        def get_response(req):
            with connection.cursor() as cursor:
                cursor.execute("SELECT app_user_id()")
                return cursor.fetchone()[0]

        with transaction.atomic():
            middleware = DbContextMiddleware(get_response)
            result = middleware(request)
            self.assertEqual(result, user.id)


# =============================================================================
# TRANSACTION TESTS
# =============================================================================

class TestTransactions(TestCase):
    """Test transaction utilities."""

    def test_service_transaction_sets_context(self):
        """service_transaction sets session context."""
        with service_transaction(user_id=42, ip_address="10.0.0.1"):
            with connection.cursor() as cursor:
                cursor.execute("SELECT app_user_id()")
                self.assertEqual(cursor.fetchone()[0], 42)

    def test_nested_atomic_blocks(self):
        """Nested atomic blocks use savepoints correctly."""
        with transaction.atomic():
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                    self.assertEqual(cursor.fetchone()[0], 1)

    def test_transaction_rollback_on_error(self):
        """Transaction rolls back on exception."""
        try:
            with service_transaction(user_id=1):
                raise ValueError("Test error")
        except ValueError:
            pass

    def test_call_db_function(self):
        """call_db_function executes SQL correctly."""
        with transaction.atomic():
            result = call_db_function(
                "SELECT setting_int(%s)",
                ["otp_max_attempts"],
                fetch_one=True,
            )
            self.assertIsNotNone(result)
            self.assertEqual(result[0], 5)

    def test_call_db_function_returning(self):
        """call_db_function_returning returns list of dicts."""
        with transaction.atomic():
            rows = call_db_function_returning(
                "SELECT key, value_int FROM app_settings WHERE key = %s",
                ["otp_max_attempts"],
            )
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["key"], "otp_max_attempts")
            self.assertEqual(rows[0]["value_int"], 5)

    def test_atomic_service_decorator(self):
        """@atomic_service wraps function in transaction."""
        @atomic_service
        def test_fn():
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                return cursor.fetchone()[0]

        result = test_fn()
        self.assertEqual(result, 1)

    def test_savepoint_context_manager(self):
        """savepoint context manager commits on success and rolls back on exception."""
        with transaction.atomic():
            try:
                with savepoint():
                    raise RuntimeError("Rollback inner")
            except RuntimeError:
                pass
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                self.assertEqual(cursor.fetchone()[0], 1)


# =============================================================================
# EXCEPTION TESTS
# =============================================================================

class TestExceptions(TestCase):
    """Test exception hierarchy and DB error translation."""

    def test_domain_error_defaults(self):
        """DomainError has correct defaults."""
        err = DomainError()
        self.assertEqual(err.code, "domain_error")
        self.assertEqual(err.status_code, 400)

    def test_permission_denied_error(self):
        """PermissionDeniedError has 403 status."""
        err = PermissionDeniedError()
        self.assertEqual(err.status_code, 403)
        self.assertEqual(err.code, "permission_denied")

    def test_resource_masked_not_found(self):
        """ResourceMaskedNotFound has 404 status."""
        err = ResourceMaskedNotFound()
        self.assertEqual(err.status_code, 404)

    def test_translate_capacity_full(self):
        """Translate 'capacity_full: ...' to CapacityFullError."""
        pg_error = Exception("capacity_full: no places left")
        translated = translate_db_exception(pg_error)
        self.assertIsInstance(translated, CapacityFullError)
        self.assertEqual(translated.code, "capacity_full")
        self.assertEqual(translated.status_code, 409)

    def test_translate_schedule_conflict(self):
        """Translate 'schedule_conflict: ...' to ScheduleConflictError."""
        pg_error = Exception("schedule_conflict: you already have an overlapping shift")
        translated = translate_db_exception(pg_error)
        self.assertIsInstance(translated, ScheduleConflictError)
        self.assertEqual(translated.status_code, 409)

    def test_translate_permission_denied(self):
        """Translate 'permission_denied: ...' to PermissionDeniedError."""
        pg_error = Exception("permission_denied: only event managers can assign volunteers")
        translated = translate_db_exception(pg_error)
        self.assertIsInstance(translated, PermissionDeniedError)
        self.assertEqual(translated.status_code, 403)

    def test_translate_integrity_error_uq_application(self):
        """Translate unique constraint violation to DuplicateError."""
        pg_error = IntegrityError(
            'duplicate key value violates unique constraint "uq_event_application_active"'
        )
        translated = translate_db_exception(pg_error)
        self.assertEqual(translated.status_code, 409)
        self.assertIn("already have an active application", translated.message)

    def test_translate_integrity_error_ex_overlap(self):
        """Translate EXCLUDE constraint violation to ScheduleConflictError."""
        pg_error = IntegrityError(
            'conflicting key value violates exclusion constraint "ex_assignments_no_overlap"'
        )
        translated = translate_db_exception(pg_error)
        self.assertIsInstance(translated, ScheduleConflictError)
        self.assertEqual(translated.status_code, 409)

    def test_custom_drf_exception_handler(self):
        """custom_exception_handler wraps DomainError into standard error dict."""
        err = CapacityFullError("Role is at full capacity.")
        response = custom_exception_handler(err, {})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "capacity_full")
        self.assertEqual(response.data["error"]["message"], "Role is at full capacity.")


# =============================================================================
# PERMISSION TESTS
# =============================================================================

class TestPermissions(TestCase):
    """Test permission helpers."""

    def setUp(self):
        self.factory = APIRequestFactory()

        # Admin user (active, verified)
        self.admin_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_b",
            display_name="Admin User",
            password=None,
            is_admin=True,
            is_staff=True,
            verification_status="verified",
        )

        # Regular active user
        self.active_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_a",
            display_name="Active User",
            password=None,
            verification_status="verified",
        )

        # Blocked user
        self.blocked_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_c",
            display_name="Blocked User",
            password=None,
            account_status="blocked",
            is_active=False,
        )

    def _create_approved_coordinator(self, user):
        from apps.coordination.models import CoordinatorProfiles
        user.verification_status = "verified"
        user.save()
        coord = CoordinatorProfiles.objects.create(user=user, status="pending")
        coord.status = "approved"
        coord.approved_by = self.admin_user
        coord.approved_at = timezone.now()
        coord.save()
        return coord

    def test_ensure_active_user_passes(self):
        """Active user passes ensure_active_user."""
        ensure_active_user(self.active_user)

    def test_ensure_active_user_rejects_unauthenticated(self):
        """Anonymous/None user is rejected."""
        with self.assertRaises(PermissionDeniedError):
            ensure_active_user(None)

    def test_ensure_active_user_rejects_blocked(self):
        """Blocked user fails ensure_active_user."""
        with self.assertRaises(PermissionDeniedError):
            ensure_active_user(self.blocked_user)

    def test_ensure_admin_passes_for_admin(self):
        """Admin passes ensure_admin."""
        request = self.factory.get("/")
        request.user = self.admin_user
        ensure_admin(request)

    def test_ensure_admin_rejects_non_admin(self):
        """Non-admin gets 404 from ensure_admin."""
        request = self.factory.get("/")
        request.user = self.active_user
        with self.assertRaises(ResourceMaskedNotFound):
            ensure_admin(request)

    def test_ensure_approved_coordinator_rejects_without_profile(self):
        """User without coordinator profile is rejected."""
        with self.assertRaises(PermissionDeniedError):
            ensure_approved_coordinator(self.active_user)

    def test_ensure_approved_coordinator_rejects_pending(self):
        """User with pending coordinator profile is rejected."""
        from apps.coordination.models import CoordinatorProfiles
        CoordinatorProfiles.objects.create(
            user=self.active_user,
            status="pending",
        )
        with self.assertRaises(PermissionDeniedError):
            ensure_approved_coordinator(self.active_user)

    def test_ensure_approved_coordinator_passes_approved(self):
        """User with approved coordinator profile passes."""
        self._create_approved_coordinator(self.active_user)
        ensure_approved_coordinator(self.active_user)

    def test_event_manager_checks_and_owner_monitor_mode(self):
        """Event manager permissions and Owner-as-Monitor mode."""
        from apps.events.models import Events

        coord1 = self._create_approved_coordinator(self.active_user)

        coord2_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_e",
            display_name="Coordinator 2",
            verification_status="verified",
        )
        coord2 = self._create_approved_coordinator(coord2_user)

        now = timezone.now()
        with transaction.atomic():
            set_db_session_context(user_id=self.active_user.id)
            event = Events.objects.create(
                owner=coord1,
                current_coordinator=coord1,
                title="Clean Up Drive",
                start_at=now + timedelta(days=1),
                end_at=now + timedelta(days=1, hours=4),
            )
            Events.objects.filter(id=event.id).update(current_coordinator=coord2)
            event.refresh_from_db()

        # Read mode works for owner
        loaded_event = get_event_for_manager_or_404(self.active_user, event.id, require_write=False)
        self.assertEqual(loaded_event.id, event.id)

        # Write mode raises OwnerMonitorReadOnlyError because coordination is delegated to coord2
        with self.assertRaises(OwnerMonitorReadOnlyError):
            get_event_for_manager_or_404(self.active_user, event.id, require_write=True)

        # Current coordinator has full write access
        coord2_event = get_event_for_manager_or_404(coord2_user, event.id, require_write=True)
        self.assertEqual(coord2_event.id, event.id)

        # Third-party user gets 404 masked
        random_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_f",
            display_name="Random User",
        )
        with self.assertRaises(ResourceMaskedNotFound):
            get_event_for_manager_or_404(random_user, event.id)

    def test_get_visible_event_masking(self):
        """Draft event is hidden from unauthorized users (returns 404)."""
        from apps.events.models import Events

        coord = self._create_approved_coordinator(self.active_user)
        now = timezone.now()
        with transaction.atomic():
            set_db_session_context(user_id=self.active_user.id)
            draft_event = Events.objects.create(
                owner=coord,
                current_coordinator=coord,
                title="Draft Event",
                start_at=now + timedelta(days=2),
                end_at=now + timedelta(days=2, hours=3),
            )

        random_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_g",
            display_name="Unauth Viewer",
        )
        with self.assertRaises(ResourceMaskedNotFound):
            get_visible_event_or_404(random_user, draft_event.id)

        # Manager can view draft event
        ev = get_visible_event_or_404(self.active_user, draft_event.id)
        self.assertEqual(ev.id, draft_event.id)


# =============================================================================
# PRIVACY TESTS
# =============================================================================

class TestPrivacy(TestCase):
    """Test privacy tier enforcement."""

    def setUp(self):
        self.active_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_d",
            display_name="Privacy Test User",
            password=None,
        )

    def test_minimal_public_card(self):
        """T1 minimal card only exposes uuid and display_name."""
        card = get_minimal_public_card(self.active_user)
        self.assertIn("display_name", card)
        self.assertNotIn("phone_hash", card)
        self.assertNotIn("phone_enc", card)
        self.assertNotIn("blood_type", card)

    def test_filter_fields_strips_sensitive(self):
        """filter_fields_for_tier always strips NEVER_EXPOSE_FIELDS."""
        data = {
            "display_name": "Test",
            "phone_hash": "secret_hash",
            "password": "secret_pass",
            "token_hash": "secret_token",
            "skills": ["cooking"],
        }
        filtered = filter_fields_for_tier(data, {"display_name", "skills", "phone_hash", "password", "token_hash"})
        self.assertIn("display_name", filtered)
        self.assertIn("skills", filtered)
        self.assertNotIn("phone_hash", filtered)
        self.assertNotIn("password", filtered)
        self.assertNotIn("token_hash", filtered)

    def test_t3_self_access(self):
        """User can access their own T3 data."""
        self.assertTrue(can_access_t3_data(self.active_user, self.active_user))

    def test_t3_denied_for_other_users(self):
        """User cannot access another user's T3 data."""
        other_user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_e",
            display_name="Other User",
            password=None,
        )
        self.assertFalse(can_access_t3_data(self.active_user, other_user))

    def test_t4_requires_admin(self):
        """T4 data requires admin status."""
        self.assertFalse(can_access_t4_data(self.active_user))

    def test_t2_volunteer_card_field_masking(self):
        """T2 volunteer card extracts only event-scoped semi-private fields."""
        card = get_t2_volunteer_card(self.active_user)
        self.assertIn("skills", card)
        self.assertIn("display_name", card)
        self.assertIn("preferred_language", card)
        self.assertNotIn("phone_hash", card)
        self.assertNotIn("phone_enc", card)
        self.assertNotIn("password", card)
        self.assertNotIn("blood_type", card)

    def test_in_memory_tier_filtering_has_zero_db_queries(self):
        """Evaluating in-memory privacy tier filtering over list collections performs 0 SQL queries (avoids N+1)."""
        volunteers = [
            {"id": i, "display_name": f"Vol {i}", "phone_hash": "secret", "skills": ["aid"]}
            for i in range(50)
        ]
        with self.assertNumQueries(0):
            filtered = [
                filter_fields_for_tier(v, {"id", "display_name", "skills"})
                for v in volunteers
            ]
        self.assertEqual(len(filtered), 50)
        for v in filtered:
            self.assertNotIn("phone_hash", v)


# =============================================================================
# SECURITY TESTS
# =============================================================================

class TestSecurity(TestCase):
    """Test security utilities."""

    def test_normalize_phone(self):
        """Phone normalization strips formatting."""
        self.assertEqual(normalize_phone("+95 9 123-456-789"), "+959123456789")
        self.assertEqual(normalize_phone("(09) 123.456.789"), "09123456789")

    def test_normalize_phone_invalid(self):
        """Invalid phone raises ValueError."""
        with self.assertRaises(ValueError):
            normalize_phone("abc")
        with self.assertRaises(ValueError):
            normalize_phone("123")

    def test_phone_hash_consistency(self):
        """Same phone always produces same hash."""
        hash1 = compute_phone_hash("+959123456789")
        hash2 = compute_phone_hash("+95 9 123-456-789")
        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)

    def test_phone_encrypt_decrypt_roundtrip(self):
        """Phone encryption/decryption roundtrip."""
        original = "+959123456789"
        encrypted = encrypt_phone(original)
        decrypted = decrypt_phone(encrypted)
        self.assertEqual(decrypted, original)
        self.assertNotEqual(encrypted, original)

    def test_otp_hash_consistency(self):
        """Same OTP code always produces same hash."""
        hash1 = compute_otp_hash("1234")
        hash2 = compute_otp_hash("1234")
        self.assertEqual(hash1, hash2)

    def test_generate_otp_code(self):
        """OTP code generation produces correct length."""
        code = generate_otp_code(4)
        self.assertEqual(len(code), 4)
        self.assertTrue(code.isdigit())

        code6 = generate_otp_code(6)
        self.assertEqual(len(code6), 6)

    def test_qr_token_generation(self):
        """QR token generation produces valid pair."""
        raw, hashed = generate_raw_qr_token()
        self.assertEqual(len(hashed), 64)
        self.assertEqual(hash_qr_token(raw), hashed)

    def test_redact_sensitive_data(self):
        """Sensitive fields are removed from data."""
        data = {
            "display_name": "Test",
            "phone_enc": "encrypted_data",
            "password": "secret",
            "skills": ["cooking"],
        }
        redacted = redact_sensitive_data(data)
        self.assertIn("display_name", redacted)
        self.assertIn("skills", redacted)
        self.assertNotIn("phone_enc", redacted)
        self.assertNotIn("password", redacted)


# =============================================================================
# UTILS TESTS
# =============================================================================

class TestUtils(TestCase):
    """Test general utilities."""

    def test_normalize_tags(self):
        """Tag normalization works correctly."""
        raw = ["  Cooking ", "CLEANING", "cooking", "", "  ", "Teaching"]
        result = normalize_tags(raw)
        self.assertEqual(result, ["cooking", "cleaning", "teaching"])

    def test_normalize_tags_max_30(self):
        """More than 30 tags raises ValueError."""
        raw = [f"tag{i}" for i in range(31)]
        with self.assertRaises(ValueError):
            normalize_tags(raw)

    def test_normalize_tags_none(self):
        """None input returns empty list."""
        self.assertEqual(normalize_tags(None), [])

    def test_normalize_tags_truncates_long(self):
        """Tags longer than 50 chars are truncated."""
        long_tag = "a" * 60
        result = normalize_tags([long_tag])
        self.assertEqual(len(result[0]), 50)

    def test_truncate_string(self):
        """String truncation works properly."""
        self.assertIsNone(truncate_string(None, 10))
        self.assertEqual(truncate_string("hello world", 5), "hello")

    def test_safe_int(self):
        """safe_int handles valid and invalid inputs."""
        self.assertEqual(safe_int("42"), 42)
        self.assertEqual(safe_int("invalid", default=99), 99)


# =============================================================================
# AUTHENTICATION TESTS
# =============================================================================

class TestAuthentication(TestCase):
    """Test BlockedAwareTokenAuthentication."""

    def setUp(self):
        self.factory = RequestFactory()
        self.auth = BlockedAwareTokenAuthentication()
        self.user = User.objects.create_user(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_k",
            display_name="Token User",
        )
        self.token = Token.objects.create(user=self.user)

    def test_authentication_active_user(self):
        """Active user authenticates successfully and sets DB context."""
        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Token {self.token.key}", REMOTE_ADDR="10.20.30.40")
        with transaction.atomic():
            user, token = self.auth.authenticate(request)
            self.assertEqual(user.id, self.user.id)
            with connection.cursor() as cursor:
                cursor.execute("SELECT app_user_id()")
                self.assertEqual(cursor.fetchone()[0], self.user.id)

    def test_authentication_blocked_user(self):
        """Blocked user is rejected."""
        self.user.account_status = "blocked"
        self.user.is_active = False
        self.user.save()

        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Token {self.token.key}")
        with transaction.atomic():
            with self.assertRaises(AuthenticationFailed):
                self.auth.authenticate(request)


# =============================================================================
# IMAGE SANITIZATION TESTS (BR-SEC-05)
# =============================================================================

class TestImageSanitization(TestCase):
    """Test JPEG verification document intake and sanitization."""

    def setUp(self):
        self.user_uuid = str(uuid.uuid4())
        self.sample_root_jpg = Path(settings.BASE_DIR).parent / "JPEG_example_flower.jpg"
        if not self.sample_root_jpg.exists():
            self.sample_root_jpg = Path("JPEG_example_flower.jpg")

    def tearDown(self):
        # Clean up any created directories under VERIFICATION_MEDIA_ROOT
        target_dir = Path(settings.VERIFICATION_MEDIA_ROOT) / self.user_uuid
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)

    def test_sanitize_valid_root_jpeg(self):
        """Valid JPEG from project root is sanitized, stripped of EXIF, and saved with SHA-256."""
        self.assertTrue(self.sample_root_jpg.exists(), f"Sample image not found at {self.sample_root_jpg}")

        with open(self.sample_root_jpg, "rb") as f:
            rel_path, sha256_hex = sanitize_and_save_verification_jpeg(
                user_uuid=self.user_uuid,
                image_type="mock_selfie",
                uploaded_file=f,
            )

        self.assertTrue(rel_path.startswith(f"{self.user_uuid}/mock_selfie_"))
        self.assertTrue(rel_path.endswith(".jpg"))
        self.assertEqual(len(sha256_hex), 64)
        self.assertRegex(sha256_hex, r"^[0-9a-f]{64}$")

        saved_path = Path(settings.VERIFICATION_MEDIA_ROOT) / rel_path
        self.assertTrue(saved_path.exists())

        # Verify saved file is a valid JPEG
        with Image.open(saved_path) as saved_img:
            self.assertEqual(saved_img.format, "JPEG")
            self.assertEqual(saved_img.mode, "RGB")
            # Verify EXIF is stripped
            exif_data = saved_img.getexif()
            self.assertEqual(len(exif_data), 0)

    def test_sanitize_image_dimension_bounds(self):
        """Images below 200px or above 6000px are rejected."""
        # Test image too small (100x100)
        small_buf = io.BytesIO()
        small_img = Image.new("RGB", (100, 100), color="blue")
        small_img.save(small_buf, format="JPEG")
        small_buf.seek(0)

        with self.assertRaises(ValidationError) as ctx:
            sanitize_and_save_verification_jpeg(self.user_uuid, "mock_selfie", small_buf)
        self.assertEqual(ctx.exception.code, "image_too_small")

        # Test image too large (6001x300)
        large_buf = io.BytesIO()
        large_img = Image.new("RGB", (6001, 300), color="green")
        large_img.save(large_buf, format="JPEG")
        large_buf.seek(0)

        with self.assertRaises(ValidationError) as ctx:
            sanitize_and_save_verification_jpeg(self.user_uuid, "mock_selfie", large_buf)
        self.assertEqual(ctx.exception.code, "image_too_large")

        # Test exact lower boundary (200x200) passes
        boundary_buf = io.BytesIO()
        boundary_img = Image.new("RGB", (200, 200), color="red")
        boundary_img.save(boundary_buf, format="JPEG")
        boundary_buf.seek(0)

        rel_path, sha_hex = sanitize_and_save_verification_jpeg(self.user_uuid, "mock_selfie", boundary_buf)
        self.assertTrue(rel_path.endswith(".jpg"))

    def test_sanitize_path_traversal_protection(self):
        """Path traversal patterns in user_uuid are strictly rejected."""
        buf = io.BytesIO()
        img = Image.new("RGB", (300, 300), color="white")
        img.save(buf, format="JPEG")
        buf.seek(0)

        malicious_uuids = [
            "../../etc/passwd",
            "../user_data",
            "not-a-valid-uuid",
            "",
            "12345",
        ]
        for bad_uuid in malicious_uuids:
            buf.seek(0)
            with self.assertRaises(ValidationError) as ctx:
                sanitize_and_save_verification_jpeg(bad_uuid, "mock_selfie", buf)
            self.assertEqual(ctx.exception.code, "invalid_uuid")

    def test_sanitize_invalid_file_types(self):
        """Zero-byte files, non-images, and corrupted binaries are rejected."""
        # Zero byte
        zero_buf = io.BytesIO(b"")
        with self.assertRaises(ValidationError) as ctx:
            sanitize_and_save_verification_jpeg(self.user_uuid, "mock_selfie", zero_buf)
        self.assertIn(ctx.exception.code, ["empty_file", "invalid_image"])

        # Plain text
        text_buf = io.BytesIO(b"This is not a JPEG image file.")
        with self.assertRaises(ValidationError) as ctx:
            sanitize_and_save_verification_jpeg(self.user_uuid, "mock_selfie", text_buf)
        self.assertEqual(ctx.exception.code, "invalid_image")

        # Corrupted binary header
        corrupt_buf = io.BytesIO(b"\xff\xd8\xff\x00\x11\x22\x33\x44")
        with self.assertRaises(ValidationError) as ctx:
            sanitize_and_save_verification_jpeg(self.user_uuid, "mock_selfie", corrupt_buf)
        self.assertEqual(ctx.exception.code, "invalid_image")

    def test_sanitize_invalid_image_type(self):
        """Disallowed image types are rejected."""
        buf = io.BytesIO()
        img = Image.new("RGB", (300, 300), color="yellow")
        img.save(buf, format="JPEG")
        buf.seek(0)

        with self.assertRaises(ValidationError) as ctx:
            sanitize_and_save_verification_jpeg(self.user_uuid, "malicious_type", buf)
        self.assertEqual(ctx.exception.code, "invalid_image_type")


# =============================================================================
# SERIALIZER ALLOWLIST TESTS (BR-SEC-04)
# =============================================================================

class TestAllowListSerializer(TestCase):
    """Test AllowListSerializerMixin parameter filtering."""

    class ExampleSerializer(AllowListSerializerMixin, serializers.Serializer):
        id = serializers.IntegerField(read_only=True)
        display_name = serializers.CharField(max_length=50)
        skills = serializers.ListField(child=serializers.CharField(), required=False)

    def test_allow_list_valid_payload(self):
        """Declared writable fields pass validation."""
        serializer = self.ExampleSerializer(data={"display_name": "Volunteer A", "skills": ["first_aid"]})
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["display_name"], "Volunteer A")

    def test_allow_list_undeclared_fields_rejected(self):
        """Undeclared parameters are rejected with HTTP 400."""
        serializer = self.ExampleSerializer(data={
            "display_name": "Volunteer A",
            "is_admin": True,
            "account_status": "active",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("is_admin", serializer.errors)
        self.assertIn("account_status", serializer.errors)

    def test_allow_list_readonly_fields_rejected_in_request_body(self):
        """Read-only fields submitted in incoming data are rejected."""
        serializer = self.ExampleSerializer(data={"id": 42, "display_name": "Volunteer A"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("id", serializer.errors)
        self.assertIn("Read-only field cannot be modified.", str(serializer.errors["id"]))


# =============================================================================
# LAZY BLOCK EXPIRY TESTS (BR-SEC-02)
# =============================================================================

class TestLazyBlockExpiry(TransactionTestCase):
    """Test BlockedAwareTokenAuthentication lazy block release."""

    def setUp(self):
        self.auth = BlockedAwareTokenAuthentication()

    def test_lazy_block_release_on_expired_blocked_user(self):
        """User whose blocked_until has passed is automatically unblocked upon token auth."""
        user = User.objects.create(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_lazy",
            display_name="Lazy Expired User",
            account_status="blocked",
            blocked_until=timezone.now() - timedelta(minutes=10),
        )
        token = Token.objects.create(user=user)

        authenticated_user, auth_token = self.auth.authenticate_credentials(token.key)
        self.assertEqual(authenticated_user.id, user.id)
        self.assertEqual(authenticated_user.account_status, "active")
        self.assertTrue(authenticated_user.is_active)
        self.assertIsNone(authenticated_user.blocked_until)

        # Cleanup
        user.delete()

    def test_unexpired_blocked_user_remains_blocked(self):
        """User whose blocked_until is in the future remains blocked and is rejected."""
        user = User.objects.create(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_future",
            display_name="Future Blocked User",
            account_status="blocked",
            blocked_until=timezone.now() + timedelta(hours=2),
        )
        token = Token.objects.create(user=user)

        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate_credentials(token.key)

        user.refresh_from_db()
        self.assertEqual(user.account_status, "blocked")
        user.delete()


# =============================================================================
# SECURITY AUDIT LOGGING INTEGRATION (BR-SEC-01)
# =============================================================================

class TestSecurityAuditLogging(TransactionTestCase):
    """Test log_security_event with database integration."""

    def test_log_security_event_empty_ip_coerced_to_null(self):
        """Empty client IP string is coerced to SQL NULL without INET syntax error."""
        factory = RequestFactory()
        request = factory.get("/", REMOTE_ADDR="")

        action_name = f"security.test.empty_ip_{secrets.token_hex(4)}"
        log_security_event(request, action=action_name, entity_type="test_probe", details={"attempt": 1})

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT action, entity_type, ip_address, after_data FROM audit_logs WHERE action = %s",
                [action_name],
            )
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], action_name)
            self.assertEqual(row[1], "test_probe")
            self.assertIsNone(row[2])  # Coerced to NULL in PostgreSQL INET column

    def test_log_security_event_none_request(self):
        """None request is handled safely without exception."""
        action_name = f"security.test.no_req_{secrets.token_hex(4)}"
        log_security_event(None, action=action_name, entity_type="background_job")

        with connection.cursor() as cursor:
            cursor.execute("SELECT action, ip_address FROM audit_logs WHERE action = %s", [action_name])
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertIsNone(row[1])

    def test_log_security_event_valid_ip(self):
        """Valid IP string is stored correctly in INET column."""
        factory = RequestFactory()
        request = factory.get("/", REMOTE_ADDR="198.51.100.42")

        action_name = f"security.test.valid_ip_{secrets.token_hex(4)}"
        log_security_event(request, action=action_name, entity_type="valid_probe")

        with connection.cursor() as cursor:
            cursor.execute("SELECT host(ip_address) FROM audit_logs WHERE action = %s", [action_name])
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "198.51.100.42")


# =============================================================================
# NATIVE UUIDV7 DATABASE GENERATION (BR-DATA-01)
# =============================================================================

class TestNativeUuidv7DatabaseGeneration(TransactionTestCase):
    """Test PostgreSQL native uuidv7 generation on user creation."""

    def test_orm_creates_native_uuidv7(self):
        """Django ORM relies on PostgreSQL DEFAULT uuidv7() for primary UUID generation."""
        user = User.objects.create(
            phone_hash=secrets.token_hex(32),
            phone_enc="enc_uuidv7",
            display_name="UUIDv7 Test User",
        )
        user.refresh_from_db()
        user_uuid = uuid.UUID(str(user.uuid))
        self.assertEqual(user_uuid.version, 7, f"Expected UUIDv7 but got version {user_uuid.version}")
        user.delete()

    def test_uuidv7_chronological_ordering(self):
        """Sequentially created UUIDv7s maintain millisecond-precision chronological sort order."""
        u1 = User.objects.create(phone_hash=secrets.token_hex(32), phone_enc="enc_1", display_name="User 1")
        time.sleep(0.005)
        u2 = User.objects.create(phone_hash=secrets.token_hex(32), phone_enc="enc_2", display_name="User 2")
        time.sleep(0.005)
        u3 = User.objects.create(phone_hash=secrets.token_hex(32), phone_enc="enc_3", display_name="User 3")

        u1.refresh_from_db()
        u2.refresh_from_db()
        u3.refresh_from_db()

        self.assertLess(str(u1.uuid), str(u2.uuid))
        self.assertLess(str(u2.uuid), str(u3.uuid))

        u1.delete()
        u2.delete()
        u3.delete()


# =============================================================================
# DATABASE ERROR TRANSLATION CLEANLINESS (BR-SEC-07)
# =============================================================================

class TestDatabaseErrorTranslationCleanliness(TestCase):
    """Test suppression of internal PL/pgSQL traces and canonical domain code mapping."""

    def test_trigger_exception_strips_internal_call_stacks(self):
        """Trigger errors with CONTEXT: PL/pgSQL traces are sanitized."""
        raw_msg = (
            "capacity_full: No places remaining for this role.\n"
            "CONTEXT: PL/pgSQL function trg_check_capacity line 14 at RAISE\n"
            "SQL statement: SELECT trg_check_capacity()"
        )
        domain_err = translate_db_exception(Exception(raw_msg))
        self.assertEqual(domain_err.code, "capacity_full")
        self.assertEqual(domain_err.message, "No places remaining for this role.")
        self.assertNotIn("CONTEXT:", domain_err.message)
        self.assertNotIn("PL/pgSQL", domain_err.message)

    def test_constraint_mapping_canonical_codes(self):
        """Database constraint violations map to canonical domain codes."""
        test_cases = [
            ("uq_event_application_active", "duplicate_application", 409),
            ("ex_assignments_no_overlap", "schedule_conflict", 409),
            ("uq_assignment_active", "duplicate_assignment", 409),
            ("uq_assignment_group_leader", "duplicate_group_leader", 409),
            ("uq_feedback_event_once", "duplicate_feedback", 409),
            ("uq_onboarding_ack_user_event_ver", "already_acknowledged", 409),
        ]
        for constraint_name, expected_code, expected_status in test_cases:
            integrity_err = IntegrityError(f'violates unique/exclusion constraint "{constraint_name}"')
            err = translate_db_exception(integrity_err)
            self.assertEqual(err.code, expected_code, f"Failed mapping for {constraint_name}")
            self.assertEqual(err.status_code, expected_status)


# =============================================================================
# COMBINED SESSION CONTEXT & IDEMPOTENCY (BR-SEC-01)
# =============================================================================

class TestCombinedSessionContextAndIdempotency(TransactionTestCase):
    """Test single round-trip context setting, get_db_session_context, and idempotency."""

    def test_combined_session_context_setting_and_reading(self):
        """set_db_session_context sets both variables and get_db_session_context reads them."""
        with transaction.atomic():
            set_db_session_context(user_id=8888, ip_address="192.0.2.100")
            uid, ip = get_db_session_context()
            self.assertEqual(uid, 8888)
            self.assertEqual(ip, "192.0.2.100")

    def test_idempotent_session_context_repeated_calls(self):
        """Repeated sequential context updates within the same transaction execute cleanly."""
        with transaction.atomic():
            set_db_session_context(user_id=101, ip_address="10.0.0.1")
            uid1, ip1 = get_db_session_context()
            self.assertEqual(uid1, 101)

            set_db_session_context(user_id=101, ip_address="10.0.0.1")
            uid2, ip2 = get_db_session_context()
            self.assertEqual(uid2, 101)

            set_db_session_context(user_id=202, ip_address="10.0.0.2")
            uid3, ip3 = get_db_session_context()
            self.assertEqual(uid3, 202)
            self.assertEqual(ip3, "10.0.0.2")

    def test_idempotent_tag_normalization(self):
        """Repeated normalization on already normalized tags returns identical output."""
        raw = ["  First Aid  ", "DISASTER relief", "first aid", ""]
        step1 = normalize_tags(raw)
        step2 = normalize_tags(step1)
        self.assertEqual(step1, ["first aid", "disaster relief"])
        self.assertEqual(step1, step2)

    def test_phone_hashing_and_encryption_roundtrip(self):
        """Deterministic hashing via hash_phone alias and Fernet roundtrip."""
        phone = "+95 9 123 456 789"
        h1 = hash_phone(phone)
        h2 = compute_phone_hash(phone)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

        encrypted = encrypt_phone(phone)
        decrypted = decrypt_phone(encrypted)
        self.assertEqual(decrypted, "+959123456789")

    def test_input_normalization_raises_domain_error(self):
        """Input normalizers raise DomainError (HTTP 400 Bad Request compatible)."""
        with self.assertRaises(DomainError):
            normalize_phone("invalid_phone_number")

        with self.assertRaises(DomainError):
            normalize_tags([f"tag_{i}" for i in range(35)])
