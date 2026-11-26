import secrets
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles, Assignments
from apps.events.models import EventApplications, EventPosts, Events
from services.staffing_insight_service import get_staffing_insight


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

        cls.pending_coord_user = _make_user("Pending Coordinator")
        CoordinatorProfiles.objects.create(user=cls.pending_coord_user, status="pending")

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

    def test_volunteer_and_pending_coord_masked_not_found(self):
        self.client.force_authenticate(user=self.volunteer)
        res = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 404)

        self.client.force_authenticate(user=self.pending_coord_user)
        res2 = self.client.get(f"/api/v1/coordinator/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res2.status_code, 404)

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
        summary = data["summary"]
        self.assertEqual(summary["required_headcount"], 15)
        self.assertEqual(summary["open_slots"], 15)
        self.assertEqual(summary["assigned_count"], 0)
        self.assertEqual(summary["coverage_percent"], 0.0)
        self.assertEqual(data["readiness_status"], "critical")

        signal_codes = [s["code"] for s in data["signals"]]
        self.assertIn("STAFFING_GAP_NEAR_START", signal_codes)

    def test_admin_api_retrieves_staffing_insight(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/admin/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["summary"]["required_headcount"], 15)

    def test_admin_ui_partial_renders_html_panel(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/v1/admin/ui/events/{self.event.id}/staffing-insight/")
        self.assertEqual(res.status_code, 200)
        content = res.content.decode("utf-8")
        self.assertIn("Staffing Health & Coverage Insights", content)
        self.assertIn("Overall Coverage", content)
        self.assertIn("Open Slots", content)

    def test_completed_assignments_not_miscounted_as_accepted_unassigned(self):
        vol2 = _make_user("Volunteer Participant")
        app = EventApplications.objects.create(event=self.event, user=vol2)
        EventApplications.objects.filter(id=app.id).update(status="accepted")
        Events.objects.filter(id=self.event.id).update(status="active")
        Events.objects.filter(id=self.event.id).update(status="completed")
        Assignments.objects.filter(application_id=app.id).update(status="completed")

        insight = get_staffing_insight(self.event.id)
        signals = [s["code"] for s in insight["signals"]]
        self.assertNotIn("ACCEPTED_UNASSIGNED", signals)

    def test_full_status_post_triggers_coverage_imbalance(self):
        EventPosts.objects.filter(id=self.post_2.id).update(required_headcount=1)
        vol3 = _make_user("Volunteer Marshall")
        app3 = EventApplications.objects.create(event=self.event, user=vol3, post=self.post_2)
        EventApplications.objects.filter(id=app3.id).update(status="accepted")

        insight = get_staffing_insight(self.event.id)
        signals = [s["code"] for s in insight["signals"]]
        self.assertIn("POST_COVERAGE_IMBALANCE", signals)

    def test_zero_posts_and_full_staffing_and_pending_waitlisted_counters(self):
        far_start = timezone.now() + timedelta(days=10)
        empty_event = Events.objects.create(
            owner=self.coord_profile,
            current_coordinator=self.coord_profile,
            title="Zero Posts Event",
            start_at=far_start,
            end_at=far_start + timedelta(hours=2),
        )
        insight_zero = get_staffing_insight(empty_event.id)
        self.assertEqual(insight_zero["summary"]["required_headcount"], 0)
        self.assertEqual(insight_zero["summary"]["open_slots"], 0)
        self.assertEqual(insight_zero["summary"]["coverage_percent"], 0.0)
        self.assertEqual(insight_zero["readiness_status"], "warning")

        # Full staffing beyond 72h -> healthy
        full_event = Events.objects.create(
            owner=self.coord_profile,
            current_coordinator=self.coord_profile,
            title="Healthy Full Event",
            start_at=far_start,
            end_at=far_start + timedelta(hours=3),
            application_deadline=far_start - timedelta(days=2),
        )
        post = EventPosts.objects.create(
            event=full_event,
            title="Single Role",
            required_headcount=1,
            status="open",
        )
        Events.objects.filter(id=full_event.id).update(status="published")

        v_ok = _make_user("Assigned Vol")
        app_ok = EventApplications.objects.create(event=full_event, post=post, user=v_ok)
        EventApplications.objects.filter(id=app_ok.id).update(status="accepted")

        v_pending = _make_user("Pending Vol")
        EventApplications.objects.create(event=full_event, post=post, user=v_pending, status="pending")

        v_wait = _make_user("Waitlisted Vol")
        app_wait = EventApplications.objects.create(event=full_event, post=post, user=v_wait)
        EventApplications.objects.filter(id=app_wait.id).update(status="waitlisted")

        insight_full = get_staffing_insight(full_event.id)
        self.assertEqual(insight_full["summary"]["open_slots"], 0)
        self.assertEqual(insight_full["summary"]["assigned_count"], 1)
        self.assertEqual(insight_full["summary"]["coverage_percent"], 100.0)
        self.assertEqual(insight_full["summary"]["pending_applications"], 1)
        self.assertEqual(insight_full["summary"]["waitlisted_applications"], 1)
        self.assertEqual(insight_full["readiness_status"], "healthy")
