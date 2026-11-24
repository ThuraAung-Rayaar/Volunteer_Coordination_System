import secrets
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Users, UserCharityInterests
from apps.coordination.models import CoordinatorProfiles, Assignments
from apps.events.models import (
    CharityFields,
    EventApplications,
    EventCharityFields,
    EventPosts,
    Events,
)


def _phone_hash():
    return secrets.token_hex(32)


def _make_user(name, is_admin=False, skills=None):
    user = Users.objects.create_user(
        phone_hash=_phone_hash(),
        phone_enc="enc_phone_test",
        display_name=name,
        is_admin=is_admin,
        is_staff=is_admin,
        account_status="active",
        verification_status="verified",
    )
    if skills:
        user.skills = skills
        user.save()
    return user


class VolunteerRecommendationsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin User", is_admin=True)
        cls.coord_user = _make_user("Coordinator User")
        profile = CoordinatorProfiles.objects.create(
            user=cls.coord_user,
            status="pending",
        )
        profile.status = "approved"
        profile.approved_by = cls.admin
        profile.approved_at = timezone.now()
        profile.save()
        cls.coord_profile = profile

        # Charity taxonomies
        CharityFields.objects.filter(code__in=["rec_env", "rec_edu", "rec_health"]).delete()
        cls.cf_env = CharityFields.objects.create(code="rec_env", label="Environment", sort_order=1, active=True)
        cls.cf_edu = CharityFields.objects.create(code="rec_edu", label="Education", sort_order=2, active=True)
        cls.cf_health = CharityFields.objects.create(code="rec_health", label="Health", sort_order=3, active=True)

        cls.volunteer = _make_user("Active Volunteer", skills=["first_aid", "teaching"])
        UserCharityInterests.objects.create(user=cls.volunteer, field_code=cls.cf_edu)

        # 1. Matching Event (Education, Future)
        future_start = timezone.now() + timedelta(days=5)
        future_end = future_start + timedelta(hours=4)
        cls.matching_event = Events.objects.create(
            owner=cls.coord_profile,
            current_coordinator=cls.coord_profile,
            title="Children Reading Mentorship",
            description="Teach kids to read and write.",
            location_name="Community Center",
            start_at=future_start,
            end_at=future_end,
            application_deadline=future_start - timedelta(days=1),
            max_participants=20,
        )
        EventCharityFields.objects.create(event=cls.matching_event, field_code=cls.cf_edu)
        cls.post_edu = EventPosts.objects.create(
            event=cls.matching_event,
            title="Reading Mentor",
            required_headcount=10,
            required_skills=["teaching"],
            status="open",
        )

        # 2. Non-matching Event (Environment, no matching skills/interest)
        cls.env_event = Events.objects.create(
            owner=cls.coord_profile,
            current_coordinator=cls.coord_profile,
            title="Wetland Tree Planting",
            description="Planting trees in wetlands.",
            location_name="Coastal Park",
            start_at=future_start,
            end_at=future_end,
            application_deadline=future_start - timedelta(days=1),
            max_participants=20,
        )
        EventCharityFields.objects.create(event=cls.env_event, field_code=cls.cf_env)
        cls.post_env = EventPosts.objects.create(
            event=cls.env_event,
            title="Planter",
            required_headcount=10,
            required_skills=["forestry"],
            status="open",
        )

        # 3. Excluded Event: Draft
        cls.draft_event = Events.objects.create(
            owner=cls.coord_profile,
            current_coordinator=cls.coord_profile,
            title="Draft Secret Event",
            description="Draft",
            location_name="Secret",
            start_at=future_start,
            end_at=future_end,
        )
        EventCharityFields.objects.create(event=cls.draft_event, field_code=cls.cf_edu)
        EventPosts.objects.create(
            event=cls.draft_event,
            title="Staff",
            required_headcount=5,
            status="open",
        )

        # 4. Excluded Event: Already Applied
        cls.applied_event = Events.objects.create(
            owner=cls.coord_profile,
            current_coordinator=cls.coord_profile,
            title="Applied Health Clinic",
            description="Clinic support",
            location_name="Health Center",
            start_at=future_start,
            end_at=future_end,
            application_deadline=future_start - timedelta(days=1),
            max_participants=20,
        )
        EventCharityFields.objects.create(event=cls.applied_event, field_code=cls.cf_health)
        cls.post_health = EventPosts.objects.create(
            event=cls.applied_event,
            title="First Aider",
            required_headcount=5,
            required_skills=["first_aid"],
            status="open",
        )

        # Publish matching, env, and applied events
        Events.objects.filter(id__in=[cls.matching_event.id, cls.env_event.id, cls.applied_event.id]).update(status="published")
        cls.matching_event.refresh_from_db()
        cls.env_event.refresh_from_db()
        cls.applied_event.refresh_from_db()

        EventApplications.objects.create(
            event=cls.applied_event,
            post=cls.post_health,
            user=cls.volunteer,
            status="pending",
        )

    def setUp(self):
        self.client = APIClient()

    def test_unauthenticated_request_denied(self):
        res = self.client.get("/api/v1/me/recommendations/events/")
        self.assertEqual(res.status_code, 401)

    def test_authenticated_volunteer_receives_recommendations(self):
        self.client.force_authenticate(user=self.volunteer)
        res = self.client.get("/api/v1/me/recommendations/events/")
        self.assertEqual(res.status_code, 200)

        data = res.json()
        self.assertIn("policy_version", data)
        self.assertIn("results", data)
        self.assertEqual(data["policy_version"], "recommendation-v1")
        self.assertIsInstance(data["results"], list)

    def test_hard_filters_exclude_draft_and_applied_events(self):
        self.client.force_authenticate(user=self.volunteer)
        res = self.client.get("/api/v1/me/recommendations/events/")
        self.assertEqual(res.status_code, 200)

        returned_event_ids = [
            r["event"].get("id") or r["event"].get("event_id")
            for r in res.json()["results"]
        ]

        # Draft event must not be returned
        self.assertNotIn(self.draft_event.id, returned_event_ids)
        # Event user already applied to must not be returned
        self.assertNotIn(self.applied_event.id, returned_event_ids)

    def test_ranking_and_explainable_reasons(self):
        self.client.force_authenticate(user=self.volunteer)
        res = self.client.get("/api/v1/me/recommendations/events/")
        self.assertEqual(res.status_code, 200)

        results = res.json()["results"]
        self.assertTrue(len(results) > 0)

        top_match = results[0]
        # The matching education event should rank first
        top_id = top_match["event"].get("id") or top_match["event"].get("event_id")
        self.assertEqual(top_id, self.matching_event.id)
        self.assertGreaterEqual(top_match["match_score"], 50)
        self.assertIn("reasons", top_match)
        self.assertIsInstance(top_match["reasons"], list)
        self.assertTrue(len(top_match["reasons"]) > 0)
        # Verify explainable reason references the matched interest
        reasons_text = " ".join(top_match["reasons"])
        self.assertIn("rec_edu", reasons_text)
