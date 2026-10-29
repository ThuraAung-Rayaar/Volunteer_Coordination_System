# apps/audit/tests/test_api.py
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import CoordinatorProfile, User
from apps.audit.models import ModerationAction
from apps.common.constants import COORDINATOR_APPROVED, VERIFICATION_VERIFIED
from apps.events.services import add_post, create_event, publish_event


class AuditApiTests(APITestCase):
    def setUp(self):
        # 1. Admin
        self.admin = User.objects.create(
            phone_hash="hash_admin_api",
            display_name="API Admin",
            is_admin=True,
        )

        # 2. Regular user
        self.user = User.objects.create(
            phone_hash="hash_user_api",
            display_name="API Volunteer",
            account_status="active",
        )

        # 3. Coordinator & Event
        self.coordinator = User.objects.create(
            phone_hash="hash_coord_api_mod",
            display_name="API Coordinator",
            verification_status=VERIFICATION_VERIFIED,
        )
        CoordinatorProfile.objects.create(
            user=self.coordinator,
            status=COORDINATOR_APPROVED,
            approved_at=timezone.now(),
        )

        now = timezone.now()
        self.event = create_event(
            self.coordinator,
            {
                "title": "Riverside Tree Planting",
                "start_at": now + timedelta(days=2),
                "end_at": now + timedelta(days=2, hours=4),
            },
        )
        self.post = add_post(
            self.coordinator,
            self.event,
            {"title": "Planter", "required_headcount": 5},
        )
        publish_event(self.coordinator, self.event)

    def test_dashboard_stats_endpoint_admin_only(self):
        # 1. Anonymous forbidden / unauthorized
        resp_anon = self.client.get("/api/v1/admin/dashboard/")
        self.assertIn(resp_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 2. Regular user forbidden
        self.client.force_authenticate(user=self.user)
        resp_user = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(resp_user.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin allowed
        self.client.force_authenticate(user=self.admin)
        resp_admin = self.client.get("/api/v1/admin/dashboard/")
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertIn("active_users", resp_admin.data)
        self.assertIn("events_published", resp_admin.data)

    def test_block_user_endpoint_executes_service(self):
        self.client.force_authenticate(user=self.admin)

        resp = self.client.post(
            f"/api/v1/admin/users/{self.user.id}/block/",
            {"reason": "Terms violation."},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["action_type"], "user_block")

        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "blocked")

        # Unblock user
        resp_unblock = self.client.post(
            f"/api/v1/admin/users/{self.user.id}/unblock/",
            {"reason": "Appeal accepted."},
            format="json",
        )
        self.assertEqual(resp_unblock.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "active")

    def test_event_delete_and_restore_api(self):
        self.client.force_authenticate(user=self.admin)

        # Delete event
        del_resp = self.client.post(
            f"/api/v1/admin/events/{self.event.id}/delete/",
            {"reason": "Content violation."},
            format="json",
        )
        self.assertEqual(del_resp.status_code, status.HTTP_200_OK)
        self.event.refresh_from_db()
        self.assertIsNotNone(self.event.deleted_at)

        # Restore event
        res_resp = self.client.post(
            f"/api/v1/admin/events/{self.event.id}/restore/",
            {"reason": "Resolved."},
            format="json",
        )
        self.assertEqual(res_resp.status_code, status.HTTP_200_OK)
        self.event.refresh_from_db()
        self.assertIsNone(self.event.deleted_at)

    def test_user_warn_close_reinstate_api(self):
        self.client.force_authenticate(user=self.admin)

        # 1. Warn user
        warn_resp = self.client.post(
            f"/api/v1/admin/users/{self.user.id}/warn/",
            {"reason": "Inappropriate comment warning."},
            format="json",
        )
        self.assertEqual(warn_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(warn_resp.data["action_type"], "user_warning")

        # 2. Close account
        close_resp = self.client.post(
            f"/api/v1/admin/users/{self.user.id}/close/",
            {"reason": "Severe policy violation."},
            format="json",
        )
        self.assertEqual(close_resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "closed")

        # 3. Reinstate account
        rein_resp = self.client.post(
            f"/api/v1/admin/users/{self.user.id}/reinstate/",
            {"reason": "Account reinstated after review."},
            format="json",
        )
        self.assertEqual(rein_resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, "active")

    def test_event_cancel_and_feedback_hide_api(self):
        from apps.events.services import activate_event, complete_event
        from apps.ops.models import Feedback
        from apps.ops.services import create_assignment_from_application, submit_feedback
        from apps.events.models import EventApplication

        # Create participating assignment and completed event for feedback
        app = EventApplication.objects.create(
            event=self.event,
            post=self.post,
            user=self.user,
            status="accepted",
            decided_at=timezone.now(),
        )
        create_assignment_from_application(app)
        activate_event(self.coordinator, self.event)
        complete_event(self.coordinator, self.event)

        fb = submit_feedback(
            user=self.user,
            event=self.event,
            direction="volunteer_to_event",
            score=1,
            comment="Bad language content.",
        )

        self.client.force_authenticate(user=self.admin)

        # Hide feedback
        hide_resp = self.client.post(
            f"/api/v1/admin/feedback/{fb.id}/hide/",
            {"reason": "Profanity detected."},
            format="json",
        )
        self.assertEqual(hide_resp.status_code, status.HTTP_200_OK)
        fb.refresh_from_db()
        self.assertEqual(fb.status, "hidden")

        # Create another event to test cancel
        now = timezone.now()
        event2 = create_event(
            self.coordinator,
            {"title": "Flood Event", "start_at": now + timedelta(days=2), "end_at": now + timedelta(days=2, hours=3)},
        )
        add_post(self.coordinator, event2, {"title": "Relief Post", "required_headcount": 5})
        publish_event(self.coordinator, event2)

        cancel_resp = self.client.post(
            f"/api/v1/admin/events/{event2.id}/cancel/",
            {"reason": "Cancelled due to river overflow risk."},
            format="json",
        )
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)
        event2.refresh_from_db()
        self.assertEqual(event2.status, "cancelled")


