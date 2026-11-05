"""
Database Integration Tests for Phase 7:
- PostgreSQL Stored Procedure geo_check_in() return codes
- Triggers:
    * trg_01_onboarding_append_only
    * trg_01_onboarding_before_insert
    * trg_01_attendance_before_insert
    * trg_01_attendance_guard
    * trg_01_geo_attempts_no_delete
- Constraints:
    * ck_attendance_timestamps
    * uq_attendance_event_user
    * ex_assignments_no_overlap
"""
from datetime import timedelta
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import OnboardingAcknowledgments, Users
from apps.attendance.models import Attendance, AttendanceGeoAttempts, QrTokens
from apps.coordination.models import Assignments
from apps.events.models import EventApplications, EventPosts, Events
from common.db_context import set_db_session_context
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, onboarding_service

_db_phone_idx = 8000


def _db_phone():
    global _db_phone_idx
    _db_phone_idx += 1
    return f"+959{_db_phone_idx:08d}"


def _make_db_user(name, is_admin=False, verified=False):
    ph = normalize_phone(_db_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(ph),
        phone_enc=encrypt_phone(ph),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
    )


class DatabaseTriggersAndConstraintsPhase7Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_db_user("Admin User", is_admin=True)
        cls.coord = _make_db_user("Coordinator User", verified=True)
        coordinator_service.apply_for_coordinator(cls.coord, "Vetting notes")
        coordinator_service.approve_coordinator(cls.admin, cls.coord.id, "Approved")
        cls.coord.refresh_from_db()

        cls.vol = _make_db_user("Volunteer Worker")
        cls.vol_unassigned = _make_db_user("Unassigned Volunteer")

    def setUp(self):
        start = timezone.now() + timedelta(hours=2)
        end = start + timedelta(hours=4)
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Postgres DB Verification Event",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=True,
            onboarding_text="Safety gear required.",
            latitude=1.3521,
            longitude=103.8198,
            geo_radius_m=300,
            geo_checkin_enabled=True,
            require_checkin_confirmation=False,
        )
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Logistics",
            required_headcount=5,
        )
        Events.objects.filter(id=self.event.id).update(status="published")
        Events.objects.filter(id=self.event.id).update(status="active")
        start_active = timezone.now() - timedelta(minutes=15)
        Events.objects.filter(id=self.event.id).update(start_at=start_active)
        self.event.refresh_from_db()

        # Apply -> auto-assigned & expected attendance row created
        self.app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    # --- Stored Procedure geo_check_in() Direct DB Tests ---

    def test_geo_checkin_direct_mock_detected(self):
        # Acknowledge onboarding first
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT out_result FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol.id, 1.3521, 103.8198, 10.0, timezone.now(), True],
            )
            res = cursor.fetchone()[0]
        self.assertEqual(res, "mock_location")

    def test_geo_checkin_direct_outside_geofence(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Coordinate in London while event is in Singapore
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT out_result FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol.id, 51.5074, -0.1278, 10.0, timezone.now(), False],
            )
            res = cursor.fetchone()[0]
        self.assertEqual(res, "outside_geofence")

    def test_geo_checkin_direct_low_accuracy(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Accuracy of 600m exceeds radius (300m)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT out_result FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol.id, 1.3521, 103.8198, 600.0, timezone.now(), False],
            )
            res = cursor.fetchone()[0]
        self.assertEqual(res, "low_accuracy")

    def test_geo_checkin_direct_event_not_active(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        Events.objects.filter(id=self.event.id).update(status="cancelled")
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT out_result FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol.id, 1.3521, 103.8198, 10.0, timezone.now(), False],
            )
            res = cursor.fetchone()[0]
        self.assertEqual(res, "event_not_active")

    def test_geo_checkin_direct_not_assigned(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT out_result FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol_unassigned.id, 1.3521, 103.8198, 10.0, timezone.now(), False],
            )
            res = cursor.fetchone()[0]
        self.assertEqual(res, "not_assigned")

    def test_geo_checkin_direct_onboarding_required(self):
        # vol has an assignment, but has NOT acknowledged onboarding
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT out_result FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol.id, 1.3521, 103.8198, 10.0, timezone.now(), False],
            )
            res = cursor.fetchone()[0]
        self.assertEqual(res, "onboarding_required")

    # --- Trigger Tests ---

    def test_trigger_onboarding_append_only_blocks_update_and_delete(self):
        ack = onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Attempt UPDATE -> trigger raises append_only
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE onboarding_acknowledgments SET method = 'coordinator_tick' WHERE id = %s",
                        [ack.id],
                    )
        self.assertIn("append_only", str(ctx.exception).lower())

        # Attempt DELETE -> trigger raises append_only
        with self.assertRaises(Exception) as ctx_del:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM onboarding_acknowledgments WHERE id = %s",
                        [ack.id],
                    )
        self.assertIn("append_only", str(ctx_del.exception).lower())

    def test_trigger_onboarding_before_insert_blocks_acknowledging_for_others(self):
        # Set session user to vol, but insert for vol_unassigned
        set_db_session_context(self.vol.id)
        try:
            with self.assertRaises(Exception) as ctx:
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute(
                            """
                            INSERT INTO onboarding_acknowledgments (user_id, event_id, onboarding_version, method)
                            VALUES (%s, %s, 1, 'app_tick')
                            """,
                            [self.vol_unassigned.id, self.event.id],
                        )
            self.assertIn("permission_denied", str(ctx.exception).lower())
        finally:
            set_db_session_context(None)

    def test_trigger_attendance_before_insert_enforces_expected_status(self):
        assignment = Assignments.objects.filter(event=self.event, user=self.vol).first()

        # Cannot create attendance row with status != 'expected'
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO attendance (event_id, user_id, assignment_id, status)
                        VALUES (%s, %s, %s, 'checked_in')
                        """,
                        [self.event.id, self.vol_unassigned.id, assignment.id],
                    )
        self.assertIn("invalid_state", str(ctx.exception).lower())

    def test_trigger_attendance_guard_blocks_illegal_status_transition(self):
        att = Attendance.objects.get(event=self.event, user=self.vol)

        # Transition expected -> completed is illegal (must be checked_in first)
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE attendance SET status = 'completed' WHERE id = %s",
                        [att.id],
                    )
        self.assertIn("invalid_transition", str(ctx.exception).lower())

    def test_trigger_geo_attempts_no_delete(self):
        # Create an attempt directly or via procedure
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)",
                [self.event.id, self.vol.id, 1.3521, 103.8198, 10.0, timezone.now(), False],
            )
        attempt = AttendanceGeoAttempts.objects.filter(event=self.event, user=self.vol).last()
        self.assertIsNotNone(attempt)

        # Attempt DELETE on attendance_geo_attempts
        with self.assertRaises(Exception) as ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM attendance_geo_attempts WHERE id = %s", [attempt.id])
        self.assertIn("append_only", str(ctx.exception).lower())

    # --- Constraint Tests ---

    def test_constraint_ck_attendance_timestamps(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        att = Attendance.objects.get(event=self.event, user=self.vol)
        now = timezone.now()
        past = now - timedelta(hours=1)

        # checkout_at < checkin_at violates ck_attendance_checkout
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        UPDATE attendance 
                        SET status = 'checked_in', method = 'coordinator_manual',
                            recorded_by_user_id = %s, checkin_at = %s, checkout_at = %s
                        WHERE id = %s
                        """,
                        [self.coord.id, now, past, att.id],
                    )
