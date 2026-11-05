import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.audit.models import Feedback
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


def _make_coordinator(admin, name="Coordinator"):
    from services import coordinator_service
    user = _make_user(name, is_admin=True, verified=True)
    coordinator_service.apply_for_coordinator(user, "Coord notes")
    coordinator_service.approve_coordinator(admin, user.id, "Approved")
    user.refresh_from_db()
    return user


def _make_completed_event(coord, volunteer):
    """Create an event, assign the volunteer, and complete it so feedback is allowed."""
    start = timezone.now() + timedelta(hours=1)
    end = timezone.now() + timedelta(hours=4)
    event = Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title="API Portal Event",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=False,
    )
    EventPosts.objects.create(event=event, title="Helper", required_headcount=5)
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    EventApplications.objects.create(
        event=event,
        user=volunteer,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
    past_start = timezone.now() - timedelta(hours=4)
    past_end = timezone.now() - timedelta(hours=1)
    Attendance.objects.filter(event=event, user=volunteer).update(
        status="checked_in",
        checkin_at=past_start,
        method="coordinator_manual",
        recorded_by_user_id=coord.id,
    )
    Attendance.objects.filter(event=event, user=volunteer).update(
        status="completed",
        checkout_at=past_end,
    )
    Events.objects.filter(id=event.id).update(
        start_at=past_start,
        end_at=past_end,
        status="completed",
    )
    event.refresh_from_db()
    return event


class Phase8ApiAdminPortalTests(TestCase):
    """API integration tests for admin portal endpoints, routing parity, and privilege gating."""

    @classmethod
    def setUpTestData(cls):
        cls.super_admin = _make_user("SuperAdminAPI", is_admin=True, is_superuser=True)
        cls.standard_admin = _make_user("StdAdminAPI", is_admin=True, is_superuser=False)
        cls.coord = _make_coordinator(cls.super_admin, "CoordAPI")
        cls.vol = _make_user("VolunteerAPI")
        cls.event = _make_completed_event(cls.coord, cls.vol)

        # Create a feedback row
        from services import feedback_service
        cls.feedback = feedback_service.submit_event_feedback(
            cls.vol, cls.event.id, "volunteer_to_event", score=5, comment="Initial Feedback"
        )

    def setUp(self):
        self.client = APIClient()

    def test_admin_dashboard_metrics_privileges(self):
        # 1. Unauthenticated -> 401
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Regular volunteer -> 404 masked
        self.client.force_authenticate(user=self.vol)
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Standard admin -> 200
        self.client.force_authenticate(user=self.standard_admin)
        res = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("active_users", res.data)

    def test_admin_audit_logs_super_admin_restriction_and_aliases(self):
        # Standard admin blocked with 404 masked
        self.client.force_authenticate(user=self.standard_admin)
        res1 = self.client.get("/api/v1/admin/audit-logs/")
        self.assertEqual(res1.status_code, status.HTTP_404_NOT_FOUND)

        # Super Admin succeeds on canonical route
        self.client.force_authenticate(user=self.super_admin)
        res2 = self.client.get("/api/v1/admin/audit-logs/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertIn("results", res2.data)

        # Super Admin succeeds on legacy alias route
        res3 = self.client.get("/api/v1/admin/audit/")
        self.assertEqual(res3.status_code, status.HTTP_200_OK)

    def test_admin_geo_attempts_routing_and_access(self):
        self.client.force_authenticate(user=self.standard_admin)
        res = self.client.get("/api/v1/admin/geo-attempts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("results", res.data)

    def test_admin_moderation_warn_and_block(self):
        self.client.force_authenticate(user=self.standard_admin)
        # Warning
        payload_warn = {
            "action_type": "user_warning",
            "target_user_id": self.vol.id,
            "reason": "Warning via API",
        }
        res_warn = self.client.post("/api/v1/admin/moderation/", data=payload_warn, format="json")
        self.assertEqual(res_warn.status_code, status.HTTP_201_CREATED)

        # Block user via user-scoped action
        payload_block = {
            "reason": "Suspended for test",
            "expires_at": (timezone.now() + timedelta(days=1)).isoformat(),
        }
        res_block = self.client.post(
            f"/api/v1/admin/users/{self.vol.id}/block/", data=payload_block, format="json"
        )
        self.assertEqual(res_block.status_code, status.HTTP_200_OK)
        self.vol.refresh_from_db()
        self.assertEqual(self.vol.account_status, "blocked")

    def test_admin_feedback_list_and_hide(self):
        self.client.force_authenticate(user=self.standard_admin)
        # List feedback
        res_list = self.client.get("/api/v1/admin/feedback/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_list.data["results"]), 1)

        # Hide feedback
        res_hide = self.client.post(
            f"/api/v1/admin/feedback/{self.feedback.id}/hide/",
            data={"reason": "Contains defamatory text"},
            format="json",
        )
        self.assertEqual(res_hide.status_code, status.HTTP_200_OK)
        self.feedback.refresh_from_db()
        self.assertEqual(self.feedback.status, "hidden")

    def test_admin_maintenance_run_privileges(self):
        # Standard admin blocked from maintenance with 404 masked
        self.client.force_authenticate(user=self.standard_admin)
        res_std = self.client.post("/api/v1/admin/maintenance/run/")
        self.assertEqual(res_std.status_code, status.HTTP_404_NOT_FOUND)

        # Super Admin executes maintenance
        self.client.force_authenticate(user=self.super_admin)
        res_sup = self.client.post("/api/v1/admin/maintenance/run/")
        self.assertEqual(res_sup.status_code, status.HTTP_200_OK)
        self.assertIn("released_expired_blocks", res_sup.data)

    def test_admin_allow_list_rejection(self):
        self.client.force_authenticate(user=self.standard_admin)
        payload = {
            "action_type": "user_warning",
            "target_user_id": self.vol.id,
            "reason": "Valid reason",
            "injected_untrusted_field": "exploit",
        }
        res = self.client.post("/api/v1/admin/moderation/", data=payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
