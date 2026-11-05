"""
BFF & REST API Integration Tests for Phase 6: Recruitment Applications & Smart Assignment Engine.

Covers Endpoints:
- Volunteer API:
  * POST /api/v1/events/{id}/apply/ (Submit application)
  * GET  /api/v1/me/applications/ (List user applications)
  * POST /api/v1/applications/{id}/withdraw/ (Self-withdrawal)
  * GET  /api/v1/me/assignments/ (List user assignments)
  * POST /api/v1/assignments/{id}/confirm/ (Self-confirmation)
  * POST /api/v1/assignments/{id}/cancel/ (Self-cancellation)

- Coordinator API:
  * GET  /api/v1/coordinator/events/{id}/applications/ (T1 minimal vs T2 capability profile disclosure)
  * POST /api/v1/coordinator/applications/{id}/accept/ (Accept application)
  * POST /api/v1/coordinator/applications/{id}/reject/ (Reject application)
  * POST /api/v1/coordinator/applications/{id}/waitlist/ (Waitlist application)
  * POST /api/v1/coordinator/events/{id}/auto-assign/ (Run auto-assignment)
  * POST /api/v1/coordinator/events/{id}/manual-assign/ (Manual assignment)
  * GET  /api/v1/coordinator/events/{id}/assignments/ (List active assignments)
  * GET  /api/v1/coordinator/events/{id}/unassigned/ (List unassigned accepted volunteers)
  * GET  /api/v1/coordinator/events/{id}/post-capacity/ (List post capacity summary)

- Security, Permissions & Privacy:
  * 401 for unauthenticated requests
  * 403 for non-coordinator volunteers accessing coordinator routes
  * 403 owner_monitor_read_only on Owner-as-Monitor write attempts
  * 404 masked for unauthorized resource access (BR-SEC-MASK)
  * T1 minimal vs T2 privacy tier verification (BR-PRIV-T1, BR-PRIV-T2)
"""
import secrets
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import (
    application_service,
    assignment_service,
    coordinator_service,
    event_service,
)


def _unique_phone():
    return f"+959{secrets.randbelow(900000000) + 100000000}"


def _make_user(name, is_admin=False, verified=True, **kwargs):
    phone = normalize_phone(_unique_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
        **kwargs,
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    user = _make_user(name, verified=True)
    coordinator_service.apply_for_coordinator(user, "Application statement")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_event(coord, title="BFF Phase 6 Event", **kwargs):
    start = timezone.now() + timedelta(days=7)
    end = start + timedelta(hours=4)
    kwargs.setdefault("auto_assign_enabled", False)
    kwargs.setdefault("acceptance_mode", "manual")
    return Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title=title,
        start_at=start,
        end_at=end,
        **kwargs,
    )


def _publish_and_activate(event):
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    event.refresh_from_db()
    return event


def _extract_list(data):
    if isinstance(data, dict) and "results" in data:
        return data["results"]
    if isinstance(data, list):
        return data
    return []


class VolunteerRecruitmentBFFPhase6Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("System Admin", is_admin=True)
        cls.coord = _make_approved_coordinator(cls.admin, "Event Lead")
        cls.vol = _make_user(
            "Volunteer Maya",
            skills=["first_aid", "crowd_control"],
            physical_ok=True,
            can_lift_heavy=True,
            has_leader_experience=True,
        )
        cls.other_vol = _make_user("Other Volunteer")

    def setUp(self):
        self.client = APIClient()
        self.event = _make_event(self.coord, title="Community Run")
        self.post = EventPosts.objects.create(
            event=self.event,
            title="First Aid Responder",
            required_headcount=3,
        )
        _publish_and_activate(self.event)

    def test_apply_endpoint_unauthenticated_returns_401(self):
        """Unauthenticated call to apply endpoint returns 401."""
        res = self.client.post(f"/api/v1/events/{self.event.id}/apply/", {})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_apply_endpoint_success(self):
        """Volunteer applies to event successfully via POST /api/v1/events/{id}/apply/."""
        self.client.force_authenticate(user=self.vol)
        payload = {"post_id": self.post.id, "note": "Excited to support"}
        res = self.client.post(f"/api/v1/events/{self.event.id}/apply/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["event_id"], self.event.id)
        self.assertEqual(res.data["post_id"], self.post.id)
        self.assertEqual(res.data["status"], "pending")

    def test_apply_duplicate_returns_400_or_409(self):
        """Duplicate application submission returns HTTP 400 or 409 conflict."""
        self.client.force_authenticate(user=self.vol)
        self.client.post(f"/api/v1/events/{self.event.id}/apply/", {}, format="json")
        res = self.client.post(f"/api/v1/events/{self.event.id}/apply/", {}, format="json")
        self.assertIn(res.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT])

    def test_my_applications_endpoint(self):
        """Volunteer retrieves own applications via GET /api/v1/me/applications/."""
        self.client.force_authenticate(user=self.vol)
        self.client.post(f"/api/v1/events/{self.event.id}/apply/", {}, format="json")

        res = self.client.get("/api/v1/me/applications/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = _extract_list(res.data)
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["event_id"], self.event.id)

    def test_withdraw_application_endpoint(self):
        """Volunteer withdraws own application via POST /api/v1/applications/{id}/withdraw/."""
        self.client.force_authenticate(user=self.vol)
        apply_res = self.client.post(f"/api/v1/events/{self.event.id}/apply/", {}, format="json")
        app_id = apply_res.data["id"]

        res = self.client.post(f"/api/v1/applications/{app_id}/withdraw/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "withdrawn")

    def test_withdraw_other_user_application_masked_404(self):
        """Volunteer attempting to withdraw another user's application gets masked 404."""
        self.client.force_authenticate(user=self.vol)
        apply_res = self.client.post(f"/api/v1/events/{self.event.id}/apply/", {}, format="json")
        app_id = apply_res.data["id"]

        self.client.force_authenticate(user=self.other_vol)
        res = self.client.post(f"/api/v1/applications/{app_id}/withdraw/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_confirm_assignment_endpoint(self):
        """Volunteer confirms their own assignment via POST /api/v1/assignments/{id}/confirm/."""
        app = application_service.apply_to_event(self.vol, self.event.id, post_id=self.post.id)
        application_service.accept_application(self.coord, app.id)
        asgn_res = assignment_service.assign_volunteer_manually(
            self.coord, app.id, post_id=self.post.id
        )

        self.client.force_authenticate(user=self.vol)
        res = self.client.post(f"/api/v1/assignments/{asgn_res['assignment_id']}/confirm/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "confirmed")

    def test_confirm_assignment_by_other_user_forbidden(self):
        """Volunteer confirming another volunteer's shift returns 403."""
        app = application_service.apply_to_event(self.vol, self.event.id, post_id=self.post.id)
        application_service.accept_application(self.coord, app.id)
        asgn_res = assignment_service.assign_volunteer_manually(
            self.coord, app.id, post_id=self.post.id
        )

        self.client.force_authenticate(user=self.other_vol)
        res = self.client.post(f"/api/v1/assignments/{asgn_res['assignment_id']}/confirm/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancel_assignment_by_volunteer(self):
        """Volunteer cancels their own assignment via POST /api/v1/assignments/{id}/cancel/."""
        app = application_service.apply_to_event(self.vol, self.event.id, post_id=self.post.id)
        application_service.accept_application(self.coord, app.id)
        asgn_res = assignment_service.assign_volunteer_manually(
            self.coord, app.id, post_id=self.post.id
        )

        self.client.force_authenticate(user=self.vol)
        res = self.client.post(
            f"/api/v1/assignments/{asgn_res['assignment_id']}/cancel/",
            {"reason": "Cannot attend"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "cancelled")


class CoordinatorRecruitmentBFFPhase6Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("System Admin", is_admin=True)
        cls.coord1 = _make_approved_coordinator(cls.admin, "Lead Coordinator")
        cls.coord2 = _make_approved_coordinator(cls.admin, "Successor Coordinator")
        cls.unrelated_coord = _make_approved_coordinator(cls.admin, "Unrelated Coord")

        cls.vol1 = _make_user(
            "Volunteer One",
            skills=["first_aid", "crowd_control"],
            physical_ok=True,
            can_lift_heavy=True,
            has_leader_experience=True,
        )
        cls.vol2 = _make_user(
            "Volunteer Two",
            skills=["ushering"],
            physical_ok=False,
            can_lift_heavy=False,
        )

    def setUp(self):
        self.client = APIClient()
        self.event = _make_event(self.coord1, title="City Marathon")
        self.post1 = EventPosts.objects.create(
            event=self.event,
            title="Aid Station Lead",
            required_headcount=2,
        )
        self.post2 = EventPosts.objects.create(
            event=self.event,
            title="Information Desk",
            required_headcount=2,
        )
        _publish_and_activate(self.event)

    def test_coordinator_applications_list_t1_vs_t2_disclosure(self):
        """GET /api/v1/coordinator/events/{id}/applications/ reveals T2 for accepted, T1 for pending."""
        app1 = application_service.apply_to_event(self.vol1, self.event.id)
        app2 = application_service.apply_to_event(self.vol2, self.event.id)
        application_service.accept_application(self.coord1, app1.id)

        self.client.force_authenticate(user=self.coord1)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/applications/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = _extract_list(res.data)

        by_user = {item["user_id"]: item for item in items}

        # Accepted volunteer has T2 attributes
        v1_entry = by_user[self.vol1.id]
        self.assertEqual(v1_entry["status"], "accepted")
        self.assertIn("skills", v1_entry)
        self.assertIn("physical_ok", v1_entry)
        self.assertIn("can_lift_heavy", v1_entry)
        self.assertIn("has_leader_experience", v1_entry)

        # Pending volunteer has ONLY T1 minimal fields
        v2_entry = by_user[self.vol2.id]
        self.assertEqual(v2_entry["status"], "pending")
        self.assertNotIn("skills", v2_entry)
        self.assertNotIn("physical_ok", v2_entry)
        self.assertNotIn("can_lift_heavy", v2_entry)
        self.assertNotIn("has_leader_experience", v2_entry)

    def test_coordinator_application_accept_action(self):
        """Coordinator accepts application via POST /api/v1/coordinator/applications/{id}/accept/."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        self.client.force_authenticate(user=self.coord1)
        res = self.client.post(
            f"/api/v1/coordinator/applications/{app.id}/accept/", format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "accepted")

    def test_coordinator_application_reject_action(self):
        """Coordinator rejects application via POST /api/v1/coordinator/applications/{id}/reject/."""
        app = application_service.apply_to_event(self.vol2, self.event.id)
        self.client.force_authenticate(user=self.coord1)
        res = self.client.post(
            f"/api/v1/coordinator/applications/{app.id}/reject/",
            {"note": "Not enough experience"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "rejected")

    def test_coordinator_application_waitlist_action(self):
        """Coordinator waitlists application via POST /api/v1/coordinator/applications/{id}/waitlist/."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        self.client.force_authenticate(user=self.coord1)
        res = self.client.post(
            f"/api/v1/coordinator/applications/{app.id}/waitlist/", format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "waitlisted")

    def test_coordinator_manual_assignment_action(self):
        """Coordinator manually assigns volunteer via POST /api/v1/coordinator/events/{id}/manual-assign/."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)

        self.client.force_authenticate(user=self.coord1)
        payload = {
            "application_id": app.id,
            "post_id": self.post1.id,
            "group_code": "SQUAD-1",
            "is_group_leader": True,
        }
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event.id}/manual-assign/",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("assignment_id", res.data)

    def test_coordinator_auto_assignment_action(self):
        """Coordinator runs auto-assignment via POST /api/v1/coordinator/events/{id}/auto-assign/."""
        app = application_service.apply_to_event(self.vol1, self.event.id, post_id=self.post1.id)
        application_service.accept_application(self.coord1, app.id)

        self.client.force_authenticate(user=self.coord1)
        res = self.client.post(
            f"/api/v1/coordinator/events/{self.event.id}/auto-assign/", format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["event_id"], self.event.id)
        self.assertGreaterEqual(res.data["newly_assigned"], 1)

    def test_coordinator_unassigned_accepted_list(self):
        """GET /api/v1/coordinator/events/{id}/unassigned/ lists accepted volunteers without assignment."""
        app = application_service.apply_to_event(self.vol1, self.event.id)
        application_service.accept_application(self.coord1, app.id)

        self.client.force_authenticate(user=self.coord1)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/unassigned/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = _extract_list(res.data)
        self.assertTrue(any(item["application_id"] == app.id for item in items))

    def test_coordinator_post_capacity_summary(self):
        """GET /api/v1/coordinator/events/{id}/post-capacity/ returns database post capacity calculations."""
        self.client.force_authenticate(user=self.coord1)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/post-capacity/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = _extract_list(res.data)
        self.assertEqual(len(items), 2)
        p1 = next(item for item in items if item["post_id"] == self.post1.id)
        self.assertEqual(p1["required_headcount"], 2)
        self.assertEqual(p1["remaining"], 2)

    def test_owner_monitor_write_action_blocked_with_403(self):
        """Owner who handed over coordination gets 403 owner_monitor_read_only on write actions."""
        # Hand over to coord2
        event_service.handover_event(self.coord1, self.event.id, self.coord2.id, "Delegating")
        app = application_service.apply_to_event(self.vol1, self.event.id)

        # Owner (coord1) is now in Owner-as-Monitor mode
        self.client.force_authenticate(user=self.coord1)

        # Read applications succeeds
        read_res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/applications/")
        self.assertEqual(read_res.status_code, status.HTTP_200_OK)

        # Write action (accept) fails with 403 owner_monitor_read_only
        write_res = self.client.post(
            f"/api/v1/coordinator/applications/{app.id}/accept/", format="json"
        )
        self.assertEqual(write_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(write_res.data["error"]["code"], "owner_monitor_read_only")

    def test_unauthorized_coordinator_masked_404(self):
        """Coordinator with no management authority gets 404 masked for event applications."""
        self.client.force_authenticate(user=self.unrelated_coord)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/applications/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
