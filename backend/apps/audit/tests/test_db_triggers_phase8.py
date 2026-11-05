import uuid
from datetime import timedelta

from django.db import connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.audit.models import AuditLogs, Feedback, ModerationActions, VAdminDashboard, VUserModerationSummary
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone


def _phone():
    return f"+959{uuid.uuid4().int % 900000000 + 100000000}"


def _make_user(name, is_admin=False, is_superuser=False, verified=False, **kwargs):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        is_superuser=is_superuser,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


class Phase8DbTriggersTests(TransactionTestCase):
    """Direct PostgreSQL triggers, stored procedures, constraints, and operational views tests."""

    def setUp(self):
        self.super_admin = _make_user("TrgSuperAdmin", is_admin=True, is_superuser=True)
        self.coord = _make_user("TrgCoord", verified=True)
        from services import coordinator_service
        coordinator_service.apply_for_coordinator(self.coord, "Coord notes")
        coordinator_service.approve_coordinator(self.super_admin, self.coord.id, "Approved")
        self.coord.refresh_from_db()
        self.vol = _make_user("TrgVol")

        # Set DB session context for super admin
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(self.super_admin.id)])

    def test_trg_01_audit_logs_immutability(self):
        """Direct UPDATE or DELETE on audit_logs must be aborted by database trigger."""
        # Find or trigger an audit row
        log = AuditLogs.objects.order_by("-id").first()
        if not log:
            # Update a user to generate an audit log via trigger
            self.vol.display_name = "Audited Name"
            self.vol.save()
            log = AuditLogs.objects.order_by("-id").first()

        self.assertIsNotNone(log)

        # Attempt UPDATE
        with self.assertRaises(Exception):
            with connection.cursor() as cursor:
                cursor.execute("UPDATE audit_logs SET action = 'tampered' WHERE id = %s", [log.id])

        # Attempt DELETE
        with self.assertRaises(Exception):
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM audit_logs WHERE id = %s", [log.id])

    def test_trg_01_moderation_append_only(self):
        """Direct UPDATE or DELETE on moderation_actions must be aborted by trigger."""
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(self.super_admin.id)])
            cursor.execute(
                """
                INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason)
                VALUES (%s, %s, 'user_warning', 'First warning')
                RETURNING id
                """,
                [self.super_admin.id, self.vol.id],
            )
            mod_id = cursor.fetchone()[0]

        # Attempt UPDATE
        with self.assertRaises(Exception):
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE moderation_actions SET reason = 'Modified' WHERE id = %s", [mod_id]
                )

        # Attempt DELETE
        with self.assertRaises(Exception):
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM moderation_actions WHERE id = %s", [mod_id])

    def test_trg_50_moderation_after_insert_user_block(self):
        """Inserting a user_block action must fire trigger mutating target user account_status."""
        expiry = timezone.now() + timedelta(days=2)
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(self.super_admin.id)])
            cursor.execute(
                """
                INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason, expires_at)
                VALUES (%s, %s, 'user_block', 'Rule breach', %s)
                """,
                [self.super_admin.id, self.vol.id, expiry],
            )

        self.vol.refresh_from_db()
        self.assertEqual(self.vol.account_status, "blocked")
        self.assertIsNotNone(self.vol.blocked_until)

    def test_release_expired_blocks_stored_procedure(self):
        """release_expired_blocks() must unblock users whose blocked_until is in the past."""
        past_expiry = timezone.now() - timedelta(minutes=5)
        # Block user in the past
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(self.super_admin.id)])
            cursor.execute(
                """
                INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason, expires_at)
                VALUES (%s, %s, 'user_block', 'Temporary block', %s)
                """,
                [self.super_admin.id, self.vol.id, past_expiry],
            )

        self.vol.refresh_from_db()
        self.assertEqual(self.vol.account_status, "blocked")

        # Execute maintenance stored proc
        with connection.cursor() as cursor:
            cursor.execute("SELECT release_expired_blocks()")
            released_count = cursor.fetchone()[0]

        self.assertGreaterEqual(released_count, 1)
        self.vol.refresh_from_db()
        self.assertEqual(self.vol.account_status, "active")

    def test_trg_01_feedback_guard_attendance_and_completion_prerequisites(self):
        """trg_01_feedback_guard prevents feedback if event is not completed or attendance not confirmed."""
        past_start = timezone.now() - timedelta(hours=3)
        past_end = timezone.now() - timedelta(hours=1)
        event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Incomplete Event",
            start_at=past_start,
            end_at=past_end,
            status="active",  # NOT completed
        )

        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.user_id', %s, false)", [str(self.vol.id)])
            with self.assertRaises(Exception):
                cursor.execute(
                    """
                    INSERT INTO feedback (event_id, rater_user_id, direction, score, comment)
                    VALUES (%s, %s, 'volunteer_to_event', 5, 'Great')
                    """,
                    [event.id, self.vol.id],
                )

    def test_operational_views_query(self):
        """Verify unmanaged view models query successfully against PostgreSQL views."""
        metrics = VAdminDashboard.objects.first()
        self.assertIsNotNone(metrics)
        self.assertGreaterEqual(metrics.active_users, 1)

        summary = VUserModerationSummary.objects.filter(user_id=self.vol.id).first()
        # View query returns valid record or None without SQL errors
        self.assertTrue(summary is None or summary.user_id == self.vol.id)
