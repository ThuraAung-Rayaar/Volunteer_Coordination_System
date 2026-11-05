"""
Database integration tests for Phase 4: Identity Verification & Coordinator Lifecycle.

Focus:
- PostgreSQL function: recompute_user_verification(p_user).
- Triggers: trg_50_vimg_after, trg_01_vimg_guard, trg_01_coordinator_guard.
- Database constraints: ck_verification_no_self_review, ck_coordinator_no_self_approval,
  ck_verification_score_range, and partial unique index uq_current_verification_image.
- Concurrency and idempotency of recomputation.
"""
import secrets
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from django.db import connection, transaction
from django.test import TestCase, TransactionTestCase

from apps.accounts.models import UserVerificationImages, Users
from apps.coordination.models import CoordinatorProfiles
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone


def _next_phone() -> str:
    return f"+9597{secrets.randbelow(8999999) + 1000000}"



def _create_user(name="Vol", is_admin=False, is_active=True, verification_status="none") -> Users:
    phone = normalize_phone(_next_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        is_active=is_active,
        verification_status=verification_status,
    )


class DatabaseVerificationTriggerTests(TestCase):
    def setUp(self):
        self.user = _create_user(name="Volunteer Trigger", verification_status="none")
        self.admin = _create_user(name="Admin Trigger", is_admin=True)

    def test_recomputation_formula_branches(self):
        """W32: Test all formula branches in recompute_user_verification via trg_50_vimg_after."""
        # 1. No current images -> 'none'
        with connection.cursor() as cursor:
            cursor.execute("SELECT recompute_user_verification(%s)", [self.user.id])
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "none")

        # 2. Upload pending selfie -> 'pending'
        img_selfie = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/selfie.jpg",
            file_format="jpeg",
            file_sha256="a" * 64,
            is_current=True,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "pending")

        # 3. Approve selfie alone -> still 'pending' because ID is missing!
        UserVerificationImages.objects.filter(id=img_selfie.id).update(
            status="approved",
            reviewed_by_id=self.admin.id,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "pending")

        # 4. Upload id_license -> still 'pending'
        img_id = UserVerificationImages.objects.create(
            user=self.user,
            image_type="id_license",
            image_path=f"{self.user.uuid}/id.jpg",
            file_format="jpeg",
            file_sha256="b" * 64,
            is_current=True,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "pending")

        # 5. Approve id_license -> now both selfie + id approved -> transitions to 'verified'!
        UserVerificationImages.objects.filter(id=img_id.id).update(
            status="approved",
            reviewed_by_id=self.admin.id,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "verified")

        # 6. Upload second id_license and reject it -> transitions to 'rejected'!
        img_id_2 = UserVerificationImages.objects.create(
            user=self.user,
            image_type="id_license",
            image_path=f"{self.user.uuid}/id2.jpg",
            file_format="jpeg",
            file_sha256="c" * 64,
            is_current=True,
        )
        UserVerificationImages.objects.filter(id=img_id_2.id).update(
            status="rejected",
            reviewed_by_id=self.admin.id,
        )
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "rejected")

    def test_recomputation_with_driver_license_becomes_verified(self):
        """W32: Alternative document pairing: mock_selfie + driver_license."""
        s = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/selfie.jpg",
            file_format="jpeg",
            file_sha256="d" * 64,
            is_current=True,
        )
        dl = UserVerificationImages.objects.create(
            user=self.user,
            image_type="driver_license",
            image_path=f"{self.user.uuid}/dl.jpg",
            file_format="jpeg",
            file_sha256="e" * 64,
            is_current=True,
        )
        UserVerificationImages.objects.filter(id=s.id).update(status="approved", reviewed_by_id=self.admin.id)
        UserVerificationImages.objects.filter(id=dl.id).update(status="approved", reviewed_by_id=self.admin.id)

        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "verified")

    def test_recompute_idempotency(self):
        """W32: Repeated executions do not mutate status or fail."""
        with connection.cursor() as cursor:
            for _ in range(3):
                cursor.execute("SELECT recompute_user_verification(%s)", [self.user.id])
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "none")

    def test_vimg_guard_forces_pending_on_insert(self):
        """trg_01_vimg_guard forces status='pending' and clears review fields on insert."""
        img = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/fake.jpg",
            file_format="jpeg",
            file_sha256="f" * 64,
            status="approved",  # Caller tries to insert approved
            reviewed_by=self.admin,
            is_current=True,
        )
        img.refresh_from_db()
        self.assertEqual(img.status, "pending")
        self.assertIsNone(img.reviewed_by_id)
        self.assertIsNone(img.reviewed_at)

    def test_vimg_guard_immutability(self):
        """trg_01_vimg_guard blocks updates to immutable metadata."""
        img = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/file.jpg",
            file_format="jpeg",
            file_sha256="1" * 64,
            is_current=True,
        )
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE user_verification_images SET image_path = %s WHERE id = %s",
                    [f"{self.user.uuid}/tampered.jpg", img.id],
                )
        self.assertIn("immutable", str(ctx.exception).lower())

    def test_vimg_guard_blocks_non_admin_review(self):
        """trg_01_vimg_guard blocks review by non-admin at DB trigger level."""
        img = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/file2.jpg",
            file_format="jpeg",
            file_sha256="2" * 64,
            is_current=True,
        )
        volunteer = _create_user(name="Normal Vol", is_admin=False)
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE user_verification_images SET status = 'approved', reviewed_by_id = %s WHERE id = %s",
                    [volunteer.id, img.id],
                )
        self.assertIn("permission_denied", str(ctx.exception).lower())

    def test_constraint_ck_verification_no_self_review(self):
        """ck_verification_no_self_review blocks direct SQL update with reviewed_by_id = user_id."""
        img = UserVerificationImages.objects.create(
            user=self.admin,
            image_type="mock_selfie",
            image_path=f"{self.admin.uuid}/self.jpg",
            file_format="jpeg",
            file_sha256="3" * 64,
            is_current=True,
        )
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE user_verification_images SET status = 'approved', reviewed_by_id = %s, reviewed_at = now() WHERE id = %s",
                    [self.admin.id, img.id],
                )
        self.assertIn("ck_verification_no_self_review", str(ctx.exception).lower())

    def test_constraint_ck_verification_score_bounds(self):
        """ck_verification_score_range blocks comparison_score < 0 or > 1."""
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO user_verification_images (user_id, image_type, image_path, file_format, file_sha256, comparison_score)
                    VALUES (%s, 'mock_selfie', 'path.jpg', 'jpeg', %s, 1.5)
                    """,
                    [self.user.id, "4" * 64],
                )
        self.assertIn("ck_verification_score_range", str(ctx.exception).lower())

    def test_partial_unique_index_uq_current_verification_image(self):
        """uq_current_verification_image prevents two current images of the same type."""
        # Insert first image (is_current=True)
        first = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/first.jpg",
            file_format="jpeg",
            file_sha256="5" * 64,
            is_current=True,
        )
        # Insert second image (trigger sets first.is_current=False, second.is_current=True)
        second = UserVerificationImages.objects.create(
            user=self.user,
            image_type="mock_selfie",
            image_path=f"{self.user.uuid}/second.jpg",
            file_format="jpeg",
            file_sha256="6" * 64,
            is_current=True,
        )
        first.refresh_from_db()
        self.assertFalse(first.is_current)
        self.assertTrue(second.is_current)

        # Updating first back to is_current=True directly violates uq_current_verification_image
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE user_verification_images SET is_current = TRUE WHERE id = %s",
                    [first.id],
                )
        self.assertIn("uq_current_verification_image", str(ctx.exception).lower())



class DatabaseCoordinatorTriggerTests(TestCase):
    def setUp(self):
        self.verified_user = _create_user(name="Verified Coord", verification_status="verified")
        self.unverified_user = _create_user(name="Unverified Coord", verification_status="none")
        self.admin = _create_user(name="Admin Approver", is_admin=True)

    def test_coordinator_guard_forces_pending_on_insert(self):
        """trg_01_coordinator_guard rejects non-pending insert."""
        with self.assertRaises(Exception) as ctx:
            CoordinatorProfiles.objects.create(
                user=self.verified_user,
                status="approved",
            )
        self.assertIn("invalid_state", str(ctx.exception).lower())

    def test_coordinator_guard_enforces_valid_transitions(self):
        """trg_01_coordinator_guard blocks illegal jumps (e.g. pending -> suspended)."""
        cp = CoordinatorProfiles.objects.create(user=self.verified_user, status="pending")

        # pending -> suspended is illegal
        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE coordinator_profiles SET status = 'suspended' WHERE user_id = %s",
                    [self.verified_user.id],
                )
        self.assertIn("invalid_transition", str(ctx.exception).lower())

    def test_coordinator_guard_blocks_unverified_user_approval(self):
        """trg_01_coordinator_guard blocks approving an unverified user."""
        CoordinatorProfiles.objects.create(user=self.unverified_user, status="pending")

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE coordinator_profiles SET status = 'approved', approved_by_id = %s WHERE user_id = %s",
                    [self.admin.id, self.unverified_user.id],
                )
        self.assertIn("not_verified", str(ctx.exception).lower())

    def test_coordinator_guard_blocks_inactive_admin_approver(self):
        """trg_01_coordinator_guard requires approver to be an ACTIVE admin."""
        inactive_admin = _create_user(name="Inactive Admin", is_admin=True)
        # Block account to trigger is_active = False via trg_01_users_guard
        Users.objects.filter(id=inactive_admin.id).update(account_status="blocked")
        CoordinatorProfiles.objects.create(user=self.verified_user, status="pending")

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE coordinator_profiles SET status = 'approved', approved_by_id = %s WHERE user_id = %s",
                    [inactive_admin.id, self.verified_user.id],
                )
        self.assertIn("permission_denied", str(ctx.exception).lower())

    def test_constraint_ck_coordinator_no_self_approval(self):
        """ck_coordinator_no_self_approval blocks approved_by_id == user_id."""
        admin_verified = _create_user(name="Admin Verified", is_admin=True, verification_status="verified")
        CoordinatorProfiles.objects.create(user=admin_verified, status="pending")

        with self.assertRaises(Exception) as ctx:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE coordinator_profiles SET status = 'approved', approved_by_id = %s, approved_at = now() WHERE user_id = %s",
                    [admin_verified.id, admin_verified.id],
                )
        self.assertIn("ck_coordinator_no_self_approval", str(ctx.exception).lower())


class ConcurrencyRecomputeTests(TransactionTestCase):
    def test_concurrent_status_recomputation(self):
        """Concurrently evaluate recompute_user_verification without deadlocks."""
        user = _create_user(name="Concurrent Vol", verification_status="none")
        admin = _create_user(name="Admin Conc", is_admin=True)

        s = UserVerificationImages.objects.create(
            user=user,
            image_type="mock_selfie",
            image_path=f"{user.uuid}/s.jpg",
            file_format="jpeg",
            file_sha256="7" * 64,
            is_current=True,
        )
        dl = UserVerificationImages.objects.create(
            user=user,
            image_type="driver_license",
            image_path=f"{user.uuid}/dl.jpg",
            file_format="jpeg",
            file_sha256="8" * 64,
            is_current=True,
        )

        def approve_doc(doc_id):
            connection.close()
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE user_verification_images SET status = 'approved', reviewed_by_id = %s, reviewed_at = now() WHERE id = %s",
                    [admin.id, doc_id],
                )

        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(approve_doc, s.id)
            f2 = executor.submit(approve_doc, dl.id)
            f1.result()
            f2.result()

        with connection.cursor() as cursor:
            cursor.execute("SELECT recompute_user_verification(%s)", [user.id])
        user.refresh_from_db()
        self.assertEqual(user.verification_status, "verified")

