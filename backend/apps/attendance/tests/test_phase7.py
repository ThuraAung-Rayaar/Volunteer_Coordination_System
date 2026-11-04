import hashlib
import secrets
from datetime import timedelta

from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import OnboardingAcknowledgments, Users
from apps.attendance.models import Attendance, AttendanceGeoAttempts, QrTokens
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.exceptions import DomainError, ResourceMaskedNotFound
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    attendance_service,
    coordinator_service,
    geo_service,
    onboarding_service,
    qr_service,
)

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name, is_admin=False, verified=False, **kwargs):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        **kwargs,
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Organization notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_event(coord, **overrides):
    start = timezone.now() + timedelta(hours=2)
    end = start + timedelta(hours=4)
    defaults = dict(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title="Check-in Event",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=False,
    )
    defaults.update(overrides)
    return Events.objects.create(**defaults)


def _publish_activate(event):
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    event.refresh_from_db()
    return event


def _enable_geo(event, require_confirmation=False, radius=300):
    start = timezone.now() - timedelta(minutes=10)
    end = start + timedelta(hours=4)
    Events.objects.filter(id=event.id).update(
        start_at=start,
        end_at=end,
        latitude=1.3521,
        longitude=103.8198,
        geo_radius_m=radius,
        geo_checkin_enabled=True,
        require_checkin_confirmation=require_confirmation,
    )
    event.refresh_from_db()
    return event


def _apply_and_assign(vol, event):
    """Apply to an auto-accept event; returns the created application."""
    return EventApplications.objects.create(
        event=event,
        user=vol,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )


class Phase7Base(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord = _make_approved_coordinator(cls.admin, "Coordinator")
        cls.vol1 = _make_user("Volunteer One")
        cls.vol2 = _make_user("Volunteer Two")


class OnboardingTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(
            self.coord,
            require_onboarding_ack=True,
            onboarding_text="Be kind",
            acceptance_mode="manual",
        )
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        EventApplications.objects.create(
            event=self.event,
            user=self.vol1,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )

    def test_acknowledge_onboarding(self):
        ack = onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.assertEqual(ack.onboarding_version, self.event.onboarding_version)
        self.assertEqual(ack.method, "app_tick")

    def test_acknowledgment_idempotent_no_overwrite(self):
        first = onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        second = onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.assertEqual(first.id, second.id)
        self.assertEqual(
            OnboardingAcknowledgments.objects.filter(user=self.vol1, event=self.event).count(),
            1,
        )

    def test_version_bump_requires_reacknowledgment(self):
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        # Change onboarding text -> trigger bumps version to 2
        Events.objects.filter(id=self.event.id).update(onboarding_text="Updated briefing")
        self.event.refresh_from_db()
        self.assertEqual(self.event.onboarding_version, 2)
        status = onboarding_service.get_event_onboarding(self.vol1, self.event.id)
        self.assertFalse(status["acknowledged"])
        # Re-acknowledge creates a new row for version 2
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.assertEqual(
            OnboardingAcknowledgments.objects.filter(user=self.vol1, event=self.event).count(),
            2,
        )

    def test_non_applicant_cannot_acknowledge(self):
        with self.assertRaises(DomainError):
            onboarding_service.acknowledge_event_onboarding(self.vol2, self.event.id)


class QrTokenTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _apply_and_assign(self.vol1, self.event)

    def test_generate_token_returns_raw_and_stores_hash(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        self.assertIn("raw_token", result)
        qr = QrTokens.objects.get(id=result["id"])
        expected_hash = hashlib.sha256(result["raw_token"].encode()).hexdigest()
        self.assertEqual(qr.token_hash, expected_hash)
        self.assertNotEqual(qr.token_hash, result["raw_token"])

    def test_expired_token_is_invalid(self):
        raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        past_created = timezone.now() - timedelta(hours=2)
        past_expires = timezone.now() - timedelta(hours=1)
        qr = QrTokens.objects.create(
            event=self.event,
            created_by=self.coord,
            purpose="checkin",
            token_hash=token_hash,
            created_at=past_created,
            expires_at=past_expires,
        )
        status = qr_service.preview_qr_token(raw)
        self.assertFalse(status["is_valid"])
        self.assertEqual(status["reason"], "expired")

    def test_max_usage_enforced(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin", max_uses=1)
        raw = result["raw_token"]
        # vol1 checks in, consuming the single use
        qr_service.qr_check_in(self.vol1, raw)
        qr = QrTokens.objects.get(id=result["id"])
        self.assertEqual(qr.used_count, 1)
        # vol2 has an assignment but the token is exhausted
        _apply_and_assign(self.vol2, self.event)
        with self.assertRaises(DomainError):
            qr_service.qr_check_in(self.vol2, raw)

    def test_revocation(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        qr_service.revoke_event_qr_token(self.coord, result["id"])
        status = qr_service.preview_qr_token(result["raw_token"])
        self.assertFalse(status["is_valid"])
        self.assertEqual(status["reason"], "revoked")

    def test_duplicate_redemption_idempotent(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        raw = result["raw_token"]
        first = qr_service.qr_check_in(self.vol1, raw)
        second = qr_service.qr_check_in(self.vol1, raw)
        self.assertEqual(first["attendance_id"], second["attendance_id"])
        qr = QrTokens.objects.get(id=result["id"])
        self.assertEqual(qr.used_count, 1)

    def test_qr_checkin_sets_attendance(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "checkin")
        qr_service.qr_check_in(self.vol1, result["raw_token"])
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "qr_scan")
        self.assertIsNotNone(att.checkin_at)

    def test_walkin_application(self):
        result = qr_service.create_event_qr_token(self.coord, self.event.id, "walkin_registration")
        outcome = qr_service.redeem_qr_token(self.vol2, result["raw_token"])
        self.assertEqual(outcome["result"], "walkin_applied")
        app = EventApplications.objects.get(id=outcome["application_id"])
        self.assertEqual(app.source, "qr_walkin")
        self.assertEqual(app.status, "pending")


class AttendanceTransitionTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _apply_and_assign(self.vol1, self.event)

    def test_manual_checkin_by_coordinator(self):
        att = attendance_service.manual_check_in(self.coord, self.event.id, self.vol1.id)
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "coordinator_manual")
        self.assertEqual(att.recorded_by_user_id, self.coord.id)

    def test_manual_checkin_by_non_manager_rejected(self):
        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.manual_check_in(self.vol2, self.event.id, self.vol1.id)

    def test_checkout_requires_checked_in(self):
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        with self.assertRaises(DomainError):
            attendance_service.check_out(self.vol1, att.id)

    def test_checkout_after_checkin(self):
        attendance_service.manual_check_in(self.coord, self.event.id, self.vol1.id)
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        result = attendance_service.check_out(self.vol1, att.id)
        self.assertIsNotNone(result.checkout_at)

    def test_confirm_non_pending_rejected(self):
        # No geo check-in done, so no pending confirmation.
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        with self.assertRaises(DomainError):
            attendance_service.confirm_attendance(self.coord, att.id)


class GeoCheckinTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord, require_checkin_confirmation=False)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _enable_geo(self.event, require_confirmation=False)
        _apply_and_assign(self.vol1, self.event)

    def test_geo_checkin_success(self):
        result = geo_service.submit_geo_check_in(
            self.vol1,
            self.event.id,
            1.3521,
            103.8198,
            accuracy_m=10,
            captured_at=timezone.now(),
        )
        self.assertEqual(result["result"], "accepted")
        self.assertTrue(result["success"])
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        self.assertEqual(att.status, "checked_in")
        self.assertEqual(att.method, "geo")
        self.assertTrue(att.geo_verified)

    def test_geo_outside_geofence(self):
        result = geo_service.submit_geo_check_in(
            self.vol1,
            self.event.id,
            1.4500,
            103.9000,
            accuracy_m=10,
            captured_at=timezone.now(),
        )
        self.assertEqual(result["result"], "outside_geofence")
        self.assertFalse(result["success"])
        self.assertTrue(
            AttendanceGeoAttempts.objects.filter(
                event=self.event, user=self.vol1, result="outside_geofence"
            ).exists()
        )

    def test_geo_low_accuracy(self):
        result = geo_service.submit_geo_check_in(
            self.vol1,
            self.event.id,
            1.3521,
            103.8198,
            accuracy_m=500,
            captured_at=timezone.now(),
        )
        self.assertEqual(result["result"], "low_accuracy")
        self.assertFalse(result["success"])

    def test_geo_stale_fix(self):
        result = geo_service.submit_geo_check_in(
            self.vol1,
            self.event.id,
            1.3521,
            103.8198,
            accuracy_m=10,
            captured_at=timezone.now() - timedelta(minutes=10),
        )
        self.assertEqual(result["result"], "stale_fix")
        self.assertFalse(result["success"])

    def test_geo_attempt_logged_for_all_outcomes(self):
        geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.3521, 103.8198, accuracy_m=10, captured_at=timezone.now()
        )
        geo_service.submit_geo_check_in(
            self.vol1, self.event.id, 1.9999, 103.9999, accuracy_m=10, captured_at=timezone.now()
        )
        self.assertGreaterEqual(
            AttendanceGeoAttempts.objects.filter(event=self.event, user=self.vol1).count(),
            2,
        )


class GeoConfirmationTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord, require_checkin_confirmation=True)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _enable_geo(self.event, require_confirmation=True)
        _apply_and_assign(self.vol1, self.event)

    def _geo_checkin(self):
        return geo_service.submit_geo_check_in(
            self.vol1,
            self.event.id,
            1.3521,
            103.8198,
            accuracy_m=10,
            captured_at=timezone.now(),
        )

    def test_confirmation_flow(self):
        result = self._geo_checkin()
        self.assertEqual(result["confirmation_status"], "pending")
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        attendance_service.confirm_attendance(self.coord, att.id, "seen")
        att.refresh_from_db()
        self.assertEqual(att.confirmation_status, "confirmed")
        self.assertEqual(att.confirmed_by_user_id, self.coord.id)

    def test_rejection_flow(self):
        self._geo_checkin()
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        attendance_service.reject_attendance(self.coord, att.id, "not at gate")
        att.refresh_from_db()
        self.assertEqual(att.status, "expected")
        self.assertEqual(att.confirmation_status, "rejected")
        self.assertIsNone(att.checkin_latitude)
        self.assertFalse(att.geo_verified)

    def test_volunteer_cannot_confirm_own(self):
        self._geo_checkin()
        att = Attendance.objects.get(event=self.event, user=self.vol1)
        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.confirm_attendance(self.vol1, att.id)


class CoordinatorBoardTests(Phase7Base):
    def setUp(self):
        self.event = _make_event(self.coord)
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _apply_and_assign(self.vol1, self.event)

    def test_attendance_board_for_manager(self):
        rows = attendance_service.get_event_attendance_board(self.coord, self.event.id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["user_id"], self.vol1.id)
        self.assertEqual(rows[0]["attendance_status"], "expected")

    def test_attendance_board_denied_for_non_manager(self):
        with self.assertRaises(ResourceMaskedNotFound):
            attendance_service.get_event_attendance_board(self.vol2, self.event.id)


class CheckinBFFTests(Phase7Base):
    def setUp(self):
        self.client = APIClient()
        self.event = _make_event(
            self.coord,
            require_onboarding_ack=True,
            onboarding_text="Briefing text",
        )
        EventPosts.objects.create(event=self.event, title="Helper", required_headcount=5)
        _publish_activate(self.event)
        _enable_geo(self.event, require_confirmation=True)
        _apply_and_assign(self.vol1, self.event)

    def test_onboarding_get_and_acknowledge_api(self):
        self.client.force_authenticate(user=self.vol1)
        # GET status
        res = self.client.get(f"/api/v1/events/{self.event.id}/onboarding/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["acknowledged"])

        # POST acknowledge
        res_ack = self.client.post(f"/api/v1/events/{self.event.id}/onboarding/acknowledge/")
        self.assertEqual(res_ack.status_code, 200)
        self.assertTrue(res_ack.data["acknowledged"])

    def test_qr_create_resolve_and_redeem_api(self):
        # Coordinator creates QR token
        self.client.force_authenticate(user=self.coord)
        res_create = self.client.post(
            f"/api/v1/coordinator/events/{self.event.id}/qr-tokens/",
            {"purpose": "checkin", "ttl_minutes": 120},
        )
        self.assertEqual(res_create.status_code, 201)
        raw_token = res_create.data["raw_token"]
        qr_id = res_create.data["id"]

        # Public resolve (unauthenticated)
        self.client.force_authenticate(user=None)
        res_res = self.client.post("/api/v1/qr/resolve/", {"token": raw_token})
        self.assertEqual(res_res.status_code, 200)
        self.assertTrue(res_res.data["is_valid"])
        self.assertEqual(res_res.data["purpose"], "checkin")

        # Volunteer acknowledges onboarding and redeems QR
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)
        self.client.force_authenticate(user=self.vol1)
        res_redeem = self.client.post("/api/v1/qr/redeem/", {"token": raw_token})
        self.assertEqual(res_redeem.status_code, 200)
        self.assertEqual(res_redeem.data["result"], "checked_in")

        # Coordinator revokes QR
        self.client.force_authenticate(user=self.coord)
        res_revoke = self.client.post(f"/api/v1/coordinator/qr-tokens/{qr_id}/revoke/")
        self.assertEqual(res_revoke.status_code, 200)
        self.assertIsNotNone(res_revoke.data["revoked_at"])

    def test_manual_checkin_checkout_api(self):
        # Acknowledge onboarding before checkin
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)

        self.client.force_authenticate(user=self.coord)
        res = self.client.post(
            "/api/v1/attendance/manual-checkin/",
            {"event_id": self.event.id, "user_id": self.vol1.id, "note": "Checked in by coordinator"},
        )
        self.assertEqual(res.status_code, 200)
        att_id = res.data["id"]

        # Volunteer checks out
        self.client.force_authenticate(user=self.vol1)
        res_co = self.client.post(f"/api/v1/attendance/{att_id}/checkout/")
        self.assertEqual(res_co.status_code, 200)
        self.assertEqual(res_co.data["status"], "checked_in")
        self.assertIsNotNone(res_co.data["checkout_at"])

    def test_geo_checkin_and_coordinator_decision_api(self):
        # Acknowledge onboarding first to allow geo checkin
        onboarding_service.acknowledge_event_onboarding(self.vol1, self.event.id)

        self.client.force_authenticate(user=self.vol1)
        res_geo = self.client.post(
            "/api/v1/attendance/geo-checkin/",
            {"event_id": self.event.id, "latitude": 1.3521, "longitude": 103.8198, "accuracy_m": 10},
        )
        self.assertEqual(res_geo.status_code, 200)
        att_id = res_geo.data["attendance_id"]

        # Coordinator views pending confirmations
        self.client.force_authenticate(user=self.coord)
        res_pending = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/attendance/pending/")
        self.assertEqual(res_pending.status_code, 200)
        self.assertEqual(len(res_pending.data["results"]), 1)

        # Coordinator confirms attendance
        res_conf = self.client.post(
            f"/api/v1/coordinator/attendance/{att_id}/confirm/",
            {"note": "Confirmed by coordinator"},
        )
        self.assertEqual(res_conf.status_code, 200)
        self.assertEqual(res_conf.data["confirmation_status"], "confirmed")
