"""
Integration and Unit Tests for Phase 1: Backend BFF Route Stabilization & Missing Endpoint Exposure.

Validates:
1. Coordinator Invite Volunteer (C-23 / V-24):
   - POST /api/v1/coordinator/events/{event_id}/invite/
   - POST /api/v1/events/{event_id}/invite/
   - AllowListSerializerMixin validation (rejects unknown keys with 400)
   - Resolves by volunteer_user_id (int) or volunteer_uuid (UUID string)
   - 201 Created response contract
   - Gated to event manager with write permissions
2. Coordinator Event Handover History (C-18):
   - GET /api/v1/coordinator/events/{event_id}/history/
   - GET /api/v1/events/{event_id}/history/
   - Returns 200 with {"results": [...]}
   - Masked 404 for non-managing coordinator
3. Mounted Feedback Views (V-41, V-42, C-39):
   - GET /api/v1/coordinator/feedback/
   - GET /api/v1/me/feedback/summary/
   - GET /api/v1/feedback/
4. Attendance Checkout Signature Fix (V-37):
   - POST /api/v1/checkin/attendance/{attendance_id}/checkout/
   - POST /api/v1/checkin/events/{event_id}/checkout/ (resolves active checkin)
   - Clean 404 when no active checkin exists for the event
"""
import secrets
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    attendance_service,
    coordinator_service,
    event_post_service,
    event_service,
)


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Coordinator application statement")
    coordinator_service.approve_coordinator(admin, user.id, "Approved by admin")
    user.refresh_from_db()
    return user


class Phase1BFFRouteStabilizationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord1 = _make_approved_coordinator(cls.admin, "Lead Coordinator")
        cls.coord2 = _make_approved_coordinator(cls.admin, "Other Coordinator")
        cls.volunteer1 = _make_user("Volunteer One", verified=True)
        cls.volunteer2 = _make_user("Volunteer Two", verified=True)

        now = timezone.now()
        cls.event = event_service.create_event(
            cls.coord1,
            {
                "title": "Phase 1 Parity Charity Drive",
                "start_at": now + timedelta(days=2),
                "end_at": now + timedelta(days=2, hours=4),
                "purpose_type": "charity_event",
                "acceptance_mode": "manual",
            },
        )
        cls.post1 = event_post_service.create_event_post(
            cls.coord1,
            cls.event.id,
            {"title": "Logistics Helper", "required_headcount": 10},
        )
        event_service.publish_event(cls.coord1, cls.event.id)
        cls.event.refresh_from_db()

    def setUp(self):
        self.client = APIClient()

    # -------------------------------------------------------------------------
    # 1. Coordinator Invite Volunteer (C-23 / V-24)
    # -------------------------------------------------------------------------

    def test_invite_volunteer_by_user_id_success(self):
        self.client.force_authenticate(user=self.coord1)
        url = f"/api/v1/coordinator/events/{self.event.id}/invite/"
        payload = {
            "volunteer_user_id": self.volunteer1.id,
            "post_id": self.post1.id,
            "note": "We would love your help on logistics!",
        }
        resp = self.client.post(url, data=payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["event_id"], self.event.id)
        self.assertEqual(resp.data["user_id"], self.volunteer1.id)
        self.assertEqual(resp.data["post_id"], self.post1.id)
        self.assertEqual(resp.data["source"], "invite")
        self.assertEqual(resp.data["note"], "We would love your help on logistics!")
        self.assertIn("applied_at", resp.data)

    def test_invite_volunteer_by_uuid_success(self):
        self.client.force_authenticate(user=self.coord1)
        url = f"/api/v1/events/{self.event.id}/invite/"  # test mounted alias
        payload = {
            "volunteer_uuid": str(self.volunteer2.uuid),
            "note": "Invite by UUID",
        }
        resp = self.client.post(url, data=payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["user_id"], self.volunteer2.id)
        self.assertEqual(resp.data["source"], "invite")

    def test_invite_volunteer_missing_target_fails_validation(self):
        self.client.force_authenticate(user=self.coord1)
        url = f"/api/v1/coordinator/events/{self.event.id}/invite/"
        payload = {"note": "No user ID or UUID provided"}
        resp = self.client.post(url, data=payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invite_volunteer_rejects_unknown_fields_allowlist(self):
        self.client.force_authenticate(user=self.coord1)
        url = f"/api/v1/coordinator/events/{self.event.id}/invite/"
        payload = {
            "volunteer_user_id": self.volunteer1.id,
            "unexpected_injected_key": "malicious_payload",
        }
        resp = self.client.post(url, data=payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("unexpected_injected_key", str(resp.data))

    def test_invite_volunteer_unauthorized_for_non_manager(self):
        self.client.force_authenticate(user=self.coord2)
        url = f"/api/v1/coordinator/events/{self.event.id}/invite/"
        payload = {"volunteer_user_id": self.volunteer1.id}
        resp = self.client.post(url, data=payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_invite_volunteer_forbidden_for_regular_volunteer(self):
        self.client.force_authenticate(user=self.volunteer1)
        url = f"/api/v1/coordinator/events/{self.event.id}/invite/"
        payload = {"volunteer_user_id": self.volunteer2.id}
        resp = self.client.post(url, data=payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 2. Coordinator Event Handover History (C-18)
    # -------------------------------------------------------------------------

    def test_coordinator_history_route_returns_history_rows(self):
        event_service.handover_event_coordinator(
            actor=self.coord1,
            event_id=self.event.id,
            new_coordinator_user_id=self.coord2.id,
            reason="Passing lead to assistant coordinator",
        )
        self.client.force_authenticate(user=self.coord2)
        url = f"/api/v1/coordinator/events/{self.event.id}/history/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        rows = resp.data["results"]
        self.assertGreaterEqual(len(rows), 1)
        handover_row = next((r for r in rows if r["change_type"] == "handover"), None)
        self.assertIsNotNone(handover_row)
        self.assertEqual(handover_row["event_id"], self.event.id)
        self.assertEqual(handover_row["new_coordinator_id"], self.coord2.id)
        self.assertEqual(handover_row["previous_coordinator_id"], self.coord1.id)
        self.assertEqual(handover_row["reason"], "Passing lead to assistant coordinator")

    def test_coordinator_history_alias_route_accessible(self):
        self.client.force_authenticate(user=self.coord1)
        url = f"/api/v1/events/{self.event.id}/history/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)

    def test_coordinator_history_masked_404_for_unrelated_coordinator(self):
        unrelated_coord = _make_approved_coordinator(self.admin, "Unrelated Coord")
        self.client.force_authenticate(user=unrelated_coord)
        url = f"/api/v1/coordinator/events/{self.event.id}/history/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # -------------------------------------------------------------------------
    # 3. Mounted Feedback Views (V-41, V-42, C-39)
    # -------------------------------------------------------------------------

    def test_coordinator_feedback_view_accessible(self):
        self.client.force_authenticate(user=self.coord1)
        url = "/api/v1/coordinator/feedback/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertIn("summary", resp.data)

    def test_volunteer_feedback_summary_view_accessible(self):
        self.client.force_authenticate(user=self.volunteer1)
        url = "/api/v1/me/feedback/summary/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertIn("summary", resp.data)

    def test_volunteer_feedback_list_view_accessible(self):
        self.client.force_authenticate(user=self.volunteer1)
        url = "/api/v1/feedback/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("results", resp.data)
        self.assertIn("summary", resp.data)

    # -------------------------------------------------------------------------
    # 4. Attendance Checkout Signature & Alias Resolution (V-37)
    # -------------------------------------------------------------------------

    def _setup_active_attendance_for_user(self, user):
        start = timezone.now() + timedelta(days=1)
        end = start + timedelta(hours=4)
        event = Events.objects.create(
            owner_id=self.coord1.id,
            current_coordinator_id=self.coord1.id,
            title="Checkout Auto-Assign Event",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            auto_assign_enabled=True,
            require_onboarding_ack=False,
        )
        EventPosts.objects.create(
            event=event,
            title="Helper",
            required_headcount=10,
        )
        Events.objects.filter(id=event.id).update(status="published")
        Events.objects.filter(id=event.id).update(status="active")
        event.refresh_from_db()
        EventApplications.objects.create(
            event=event,
            user=user,
            source="browse",
            conditions_acknowledged_at=timezone.now(),
        )
        att = attendance_service.manual_check_in(self.coord1, event.id, user.id)
        return event, att

    def test_attendance_checkout_by_event_id_resolves_active_checkin(self):
        event, attendance = self._setup_active_attendance_for_user(self.volunteer1)

        self.client.force_authenticate(user=self.volunteer1)
        url = f"/api/v1/checkin/events/{event.id}/checkout/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], attendance.id)
        self.assertIn("checkout_at", resp.data)
        attendance.refresh_from_db()
        self.assertIsNotNone(attendance.checkout_at)

    def test_attendance_checkout_by_attendance_id_direct(self):
        _event, attendance = self._setup_active_attendance_for_user(self.volunteer2)

        self.client.force_authenticate(user=self.volunteer2)
        url = f"/api/v1/checkin/attendance/{attendance.id}/checkout/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], attendance.id)
        self.assertIsNotNone(resp.data["checkout_at"])

    def test_attendance_checkout_by_event_id_when_not_checked_in_returns_404(self):
        self.client.force_authenticate(user=self.volunteer1)
        url = f"/api/v1/checkin/events/{self.event.id}/checkout/"
        resp = self.client.post(url, data={}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
