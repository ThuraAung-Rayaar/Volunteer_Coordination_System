import secrets
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles
from apps.events.models import EventPosts, Events


def _phone_hash():
    return secrets.token_hex(32)


def _make_user(name, is_admin=False):
    return Users.objects.create_user(
        phone_hash=_phone_hash(),
        phone_enc="enc_phone_test",
        display_name=name,
        is_admin=is_admin,
        is_staff=is_admin,
        account_status="active",
        verification_status="verified",
    )


class StaffingInsightTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("System Admin", is_admin=True)

        cls.coord_user = _make_user("Event Coordinator")
        profile = CoordinatorProfiles.objects.create(
            user=cls.coord_user,
            status="pending",
        )
        profile.status = "approved"
        profile.approved_by = cls.admin
        profile.approved_at = timezone.now()
        profile.save()
        cls.coord_profile = profile

        cls.other_coord_user = _make_user("Other Coordinator")
        profile2 = CoordinatorProfiles.objects.create(
            user=cls.other_coord_user,
            status="pending",
        )
        profile2.status = "approved"
        profile2.approved_by = cls.admin
        profile2.approved_at = timezone.now()
        profile2.save()
        cls.other_coord_profile = profile2

        cls.volunteer = _make_user("Volunteer User")

        start = timezone.now() + timedelta(days=2)
        end = start + timedelta(hours=6)
        cls.event = Events.objects.create(
            owner=cls.coord_profile,
            current_coordinator=cls.coord_profile,
            title="City Marathon Volunteer Staffing",
            description="Staffing for city marathon aid stations.",
            location_name="City Center",
            start_at=start,
            end_at=end,
            application_deadline=start - timedelta(hours=12),
            max_participants=25,
        )

        cls.post_1 = EventPosts.objects.create(
            event=cls.event,
            title="Water Station Marshall",
            required_headcount=10,
            status="open",
        )
        cls.post_2 = EventPosts.objects.create(
            event=cls.event,
            title="First Aid Responder",
            required_headcount=5,
            status="open",
        )

        Events.objects.filter(id=cls.event.id).update(status="published")
        cls.event.refresh_from_db()

    def setUp(self):
        self.client = APIClient()

    def test_unauthenticated_request_denied(self):
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 401)

    def test_volunteer_request_masked_not_found(self):
        self.client.force_authenticate(user=self.volunteer)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/staffing-insight/")
        # Security: non-managers receive a masked 404
        self.assertEqual(res.status_code, 404)

    def test_unrelated_coordinator_masked_not_found(self):
        self.client.force_authenticate(user=self.other_coord_user)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 404)

    def test_assigned_coordinator_retrieves_staffing_insight(self):
        self.client.force_authenticate(user=self.coord_user)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 200)

        data = res.json()
        self.assertEqual(data["event_id"], self.event.id)
        self.assertEqual(data["event_title"], self.event.title)
        self.assertIn("summary", data)
        self.assertIn("posts", data)
        self.assertIn("signals", data)
        self.assertIn("readiness_status", data)

        summary = data["summary"]
        self.assertEqual(summary["required_headcount"], 15)
        self.assertEqual(summary["open_slots"], 15)
        self.assertEqual(summary["assigned_count"], 0)
        self.assertEqual(summary["coverage_percent"], 0.0)

        self.assertEqual(len(data["posts"]), 2)
        post_titles = {p["title"] for p in data["posts"]}
        self.assertIn("Water Station Marshall", post_titles)
        self.assertIn("First Aid Responder", post_titles)

        # Operational signal for staffing gap should be present
        signal_codes = [s["code"] for s in data["signals"]]
        self.assertTrue(any("STAFFING_GAP" in c for c in signal_codes))

    def test_admin_api_retrieves_staffing_insight(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/admin/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["event_id"], self.event.id)
        self.assertEqual(data["summary"]["required_headcount"], 15)

    def test_admin_ui_partial_renders_html_panel(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/admin/ui/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 200)
        content = res.content.decode("utf-8")
        self.assertIn("Staffing Health & Coverage Insights", content)
        self.assertIn("Overall Coverage", content)
        self.assertIn("Open Slots", content)

    def test_completed_assignments_not_miscounted_as_accepted_unassigned(self):
        """DB-FIX-002: Completed assignments must NOT be counted as accepted-unassigned backlog."""
        from apps.events.models import EventApplications
        from apps.coordination.models import Assignments
        from services.staffing_insight_service import get_staffing_insight

        vol2 = _make_user("Volunteer Participant")
        app = EventApplications.objects.create(
            event=self.event,
            user=vol2,
        )
        EventApplications.objects.filter(id=app.id).update(status="accepted")
        # In VCS, assignments complete when the event completes (published -> active -> completed)
        Events.objects.filter(id=self.event.id).update(status="active")
        Events.objects.filter(id=self.event.id).update(status="completed")
        Assignments.objects.filter(application_id=app.id).update(status="completed")

        insight = get_staffing_insight(self.event.id)
        signals = [s["code"] for s in insight["signals"]]
        self.assertNotIn("ACCEPTED_UNASSIGNED", signals)

    def test_full_status_post_triggers_coverage_imbalance(self):
        """DB-FIX-003: When a post is full and another has open slots, trigger POST_COVERAGE_IMBALANCE."""
        from apps.events.models import EventApplications
        from services.staffing_insight_service import get_staffing_insight

        EventPosts.objects.filter(id=self.post_2.id).update(required_headcount=1)
        self.post_2.refresh_from_db()

        vol3 = _make_user("Volunteer Marshall")
        app3 = EventApplications.objects.create(
            event=self.event,
            user=vol3,
            post=self.post_2,
        )
        EventApplications.objects.filter(id=app3.id).update(status="accepted")

        insight = get_staffing_insight(self.event.id)
        signals = [s["code"] for s in insight["signals"]]
        self.assertIn("POST_COVERAGE_IMBALANCE", signals)
