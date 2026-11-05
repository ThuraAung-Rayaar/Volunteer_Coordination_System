"""
Service integration tests for Phase 7:
- onboarding_service.py
- qr_service.py
- attendance_service.py
- geo_service.py
- Multi-step transaction rollback verification
"""
from datetime import timedelta
from unittest.mock import patch

from django.db import connection, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import OnboardingAcknowledgments, Users
from apps.attendance.models import Attendance, AttendanceGeoAttempts, QrTokens
from apps.coordination.models import Assignments
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import DomainError, InvalidStateError, ResourceMaskedNotFound
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    attendance_service,
    coordinator_service,
    geo_service,
    onboarding_service,
    qr_service,
)

_phone_idx = 7000


def _new_phone():
    global _phone_idx
    _phone_idx += 1
    return f"+959{_phone_idx:08d}"


def _make_usr(name, is_admin=False, verified=False):
    ph = normalize_phone(_new_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(ph),
        phone_enc=encrypt_phone(ph),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
    )


def _setup_coordinator(admin, name="Lead Coordinator"):
    user = _make_usr(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization vetting")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


class Phase7ServicesIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_usr("Admin User", is_admin=True)
        cls.coord = _setup_coordinator(cls.admin, "Lead Coord")
        cls.vol = _make_usr("Volunteer A")
        cls.vol_b = _make_usr("Volunteer B")

    def setUp(self):
        start = timezone.now() + timedelta(hours=2)
        end = start + timedelta(hours=4)
        self.event = Events.objects.create(
            owner_id=self.coord.id,
            current_coordinator_id=self.coord.id,
            title="Service Test Event",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=True,
            onboarding_text="Please wear closed-toe shoes and bring hydration.",
            latitude=1.3521,
            longitude=103.8198,
            geo_radius_m=500,
            geo_checkin_enabled=True,
            require_checkin_confirmation=False,
        )
        self.post = EventPosts.objects.create(
            event=self.event,
            title="Greeter",
            required_headcount=10,
        )
        Events.objects.filter(id=self.event.id).update(status="published")
        Events.objects.filter(id=self.event.id).update(status="active")
        start_active = timezone.now() - timedelta(minutes=10)
        Events.objects.filter(id=self.event.id).update(start_at=start_active)
        self.event.refresh_from_db()

        # Apply to event -> auto-accepted and assigned
        self.app = EventApplications.objects.create(
            event=self.event,
            user=self.vol,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    # --- Onboarding Service Tests ---

    def test_onboarding_service_lifecycle_and_status(self):
        # Initial status before acknowledgment
        status = onboarding_service.get_event_onboarding_status(self.vol, self.event.id)
        self.assertEqual(status["event_id"], self.event.id)
        self.assertTrue(status["require_onboarding_ack"])
        self.assertFalse(status["acknowledged"])

        # Acknowledge
        ack = onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        self.assertEqual(ack.event_id, self.event.id)
        self.assertEqual(ack.user_id, self.vol.id)

        # Re-fetch status
        status_after = onboarding_service.get_event_onboarding_status(self.vol, self.event.id)
        self.assertTrue(status_after["acknowledged"])

        # Idempotency
        ack2 = onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        self.assertEqual(ack.id, ack2.id)

    # --- QR Service Tests ---

    def test_qr_service_create_preview_redeem_and_revoke(self):
        # Create token
        token_data = qr_service.create_event_qr_token(
            self.coord,
            self.event.id,
            purpose="checkin",
            max_uses=2,
            ttl_minutes=60,
        )
        raw_token = token_data["raw_token"]
        self.assertIsNotNone(raw_token)
        qr_id = token_data["id"]

        # Preview token (consumes nothing)
        preview = qr_service.preview_qr_token(raw_token)
        self.assertTrue(preview["is_valid"])
        self.assertEqual(preview["event_id"], self.event.id)
        self.assertEqual(preview["purpose"], "checkin")

        # First volunteer acknowledges onboarding
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Redeem token for checkin
        redeem_result = qr_service.redeem_qr_token(self.vol, raw_token)
        self.assertEqual(redeem_result["result"], "checked_in")
        self.assertEqual(redeem_result["event_id"], self.event.id)

        # Check used count in DB
        qr_obj = QrTokens.objects.get(id=qr_id)
        self.assertEqual(qr_obj.used_count, 1)

        # Revoke token
        revoked = qr_service.revoke_event_qr_token(self.coord, qr_id)
        self.assertIsNotNone(revoked.revoked_at)

        # Preview after revocation
        preview_revoked = qr_service.preview_qr_token(raw_token)
        self.assertFalse(preview_revoked["is_valid"])
        self.assertEqual(preview_revoked["reason"], "revoked")

    def test_qr_service_rollback_on_multi_step_join(self):
        # Create join_event token
        token_data = qr_service.create_event_qr_token(
            self.coord,
            self.event.id,
            purpose="join_event",
            max_uses=1,
            ttl_minutes=60,
        )
        raw_token = token_data["raw_token"]
        qr_id = token_data["id"]

        # Simulate exception during EventApplications.objects.create
        with patch("services.qr_service.EventApplications.objects.create", side_effect=RuntimeError("Simulated DB Crash")):
            with self.assertRaises(RuntimeError):
                qr_service.redeem_qr_token(self.vol_b, raw_token)

        # Verify transaction rolled back completely: used_count is still 0!
        qr_obj = QrTokens.objects.get(id=qr_id)
        self.assertEqual(qr_obj.used_count, 0)
        self.assertFalse(EventApplications.objects.filter(user=self.vol_b, event=self.event).exists())

    # --- Attendance Service Tests ---

    def test_manual_checkin_and_checkout_lifecycle(self):
        # Onboarding acknowledged first
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        # Manual check in by coordinator
        att = attendance_service.manual_check_in(
            self.coord, self.event.id, self.vol.id, note="Checked in by coordinator desk"
        )
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "coordinator_manual")
        self.assertEqual(att.recorded_by_user_id, self.coord.id)
        self.assertIsNotNone(att.checkin_at)

        # Check out by volunteer
        att_out = attendance_service.check_out(self.vol, att.id)
        self.assertIsNotNone(att_out.checkout_at)
        self.assertGreaterEqual(att_out.checkout_at, att.checkin_at)

        # Self-service history conceals T4 coordinates
        history = attendance_service.get_user_attendance_history(self.vol)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["status"], "checked_in")
        self.assertNotIn("checkin_latitude", history[0])
        self.assertNotIn("checkin_longitude", history[0])

    def test_manual_checkin_transaction_rollback(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)
        att = Attendance.objects.get(event=self.event, user=self.vol)

        # Simulate an exception after select_for_update() inside save()
        with patch.object(Attendance, "save", side_effect=RuntimeError("Lock failure simulation")):
            with self.assertRaises(RuntimeError):
                attendance_service.manual_check_in(self.coord, self.event.id, self.vol.id)

        # Status must still be 'expected'
        att.refresh_from_db()
        self.assertEqual(att.status, "expected")

    # --- Geo Service Tests ---

    def test_geo_checkin_accepted_and_attempt_logged(self):
        onboarding_service.acknowledge_event_onboarding(self.vol, self.event.id)

        res = geo_service.process_geo_check_in(
            user=self.vol,
            event_id=self.event.id,
            latitude=1.3521,
            longitude=103.8198,
            accuracy_m=10.0,
            is_mocked=False,
        )
        self.assertTrue(res["success"])
        self.assertEqual(res["result"], "accepted")

        # Telemetry logged to attendance_geo_attempts
        attempt = AttendanceGeoAttempts.objects.filter(event=self.event, user=self.vol).last()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt.result, "accepted")
        self.assertFalse(attempt.device_mocked)
