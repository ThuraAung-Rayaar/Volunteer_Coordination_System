"""
API Integration Tests for Phase 2: Public Browsing, Read BFF & Privacy Gating (W158-W161).
"""

import secrets
from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import (
    CharityFields,
    EventApplications,
    EventCharityFields,
    EventPosts,
    Events,
)


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


class PublicReadBffApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("System Admin", is_admin=True)
        cls.coordinator_user = _make_user("Event Coordinator")
        profile = CoordinatorProfiles.objects.create(
            user=cls.coordinator_user,
            status="pending",
        )
        profile.status = "approved"
        profile.approved_by = cls.admin
        profile.approved_at = timezone.now()
        profile.save()
        cls.coordinator_prof = profile

        cls.volunteer_accepted = _make_user("Accepted Volunteer")
        cls.volunteer_unaccepted = _make_user("Unaccepted Volunteer")
        cls.volunteer_unrelated = _make_user("Unrelated Volunteer")

        # Create Charity Taxonomy
        CharityFields.objects.filter(code__in=["environment", "disaster_relief", "archived"]).delete()
        cls.cf_env = CharityFields.objects.create(code="environment", label="Environment", sort_order=10, active=True)
        cls.cf_dis = CharityFields.objects.create(code="disaster_relief", label="Disaster Relief", sort_order=10, active=True)
        cls.cf_arc = CharityFields.objects.create(code="archived", label="Archived", sort_order=50, active=False)

        # 1. Published Event
        start = timezone.now() + timedelta(days=3)
        end = start + timedelta(hours=5)
        cls.pub_event = Events.objects.create(
            owner=cls.coordinator_prof,
            current_coordinator=cls.coordinator_prof,
            title="Mangrove Tree Planting",
            description="Restoring coastal mangroves in Ayeyarwady.",
            location_name="Bogale Township",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            max_participants=30,
            onboarding_text="Bring waterproof boots and insect repellent.",
            onboarding_version=3,
            compensation_note="Transportation boat provided from Bogale jetty.",
        )
        EventCharityFields.objects.create(event=cls.pub_event, field_code=cls.cf_env)
        EventCharityFields.objects.create(event=cls.pub_event, field_code=cls.cf_dis)

        cls.post = EventPosts.objects.create(
            event=cls.pub_event,
            title="Tree Planter",
            required_headcount=15,
            required_skills=["planting"],
        )

        Events.objects.filter(id=cls.pub_event.id).update(status="published")
        cls.pub_event.refresh_from_db()

        # Set up accepted application for volunteer_accepted
        cls.app_accepted = EventApplications.objects.create(
            event=cls.pub_event,
            post=cls.post,
            user=cls.volunteer_accepted,
        )

        # Set up non-accepted (withdrawn) application for volunteer_unaccepted
        cls.app_submitted = EventApplications.objects.create(
            event=cls.pub_event,
            post=cls.post,
            user=cls.volunteer_unaccepted,
        )
        EventApplications.objects.filter(id=cls.app_submitted.id).update(status="withdrawn")

        # 2. Draft Event
        cls.draft_event = Events.objects.create(
            owner=cls.coordinator_prof,
            current_coordinator=cls.coordinator_prof,
            title="Internal Strategy Workshop",
            description="Planning session for upcoming campaigns.",
            location_name="Yangon Office",
            start_at=start,
            end_at=end,
            status="draft",
            onboarding_text="Draft confidential internal agenda.",
            onboarding_version=1,
            compensation_note="Internal staff only.",
        )
        cls.draft_post = EventPosts.objects.create(
            event=cls.draft_event,
            title="Facilitator",
            required_headcount=2,
        )

    def setUp(self):
        self.client = APIClient()

    # --- W161: Charity Taxonomy Discovery ---

    def test_charity_fields_discovery_success(self):
        """GET /api/v1/charity-fields/ returns active taxonomy sorted by sort_order, code."""
        resp = self.client.get(reverse("charity-fields-list"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        codes = [item["code"] for item in data]
        self.assertIn("environment", codes)
        self.assertIn("disaster_relief", codes)
        self.assertNotIn("archived", codes)
        # disaster_relief comes before environment (alphabetical tie-break with same sort_order)
        self.assertLess(codes.index("disaster_relief"), codes.index("environment"))

    # --- W158: Public Event Listing & Filtering ---

    def test_public_event_listing_published_only(self):
        """GET /api/v1/events/ returns only published/active events."""
        resp = self.client.get(reverse("public-event-list"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("results", data)
        titles = [e["title"] for e in data["results"]]
        self.assertIn("Mangrove Tree Planting", titles)
        self.assertNotIn("Internal Strategy Workshop", titles)

    def test_public_event_filtering_multi_charity_tag(self):
        """GET /api/v1/events/?charity_field=disaster_relief,environment matches array overlap."""
        resp = self.client.get(reverse("public-event-list"), {"charity_field": "disaster_relief,environment"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        titles = [e["title"] for e in data["results"]]
        self.assertIn("Mangrove Tree Planting", titles)

    def test_public_event_empty_state_returns_200(self):
        """Filter yielding zero matches returns 200 OK with empty results array."""
        resp = self.client.get(reverse("public-event-list"), {"search": "NonExistentSearchTerm123"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["results"], [])

    def test_public_event_disallowed_filter_rejected(self):
        """Arbitrary or disallowed query parameters are rejected with HTTP 400."""
        resp = self.client.get(reverse("public-event-list"), {"unsupported_field": "injected_val"})
        self.assertEqual(resp.status_code, 400)
        data = resp.json()
        self.assertEqual(data["error"]["code"], "invalid_filter")

    def test_public_event_status_draft_returns_empty_array(self):
        """Querying ?status=draft does not leak draft events; returns empty results array."""
        resp = self.client.get(reverse("public-event-list"), {"status": "draft"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["results"], [])

    # --- W159: Event Detail & T2 Semi-Private Gating ---

    def test_event_detail_anonymous_masks_t2_fields(self):
        """Unauthenticated caller receives T0 public fields with T2 fields strictly omitted."""
        resp = self.client.get(reverse("public-event-detail", args=[self.pub_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], self.pub_event.id)
        self.assertEqual(data["title"], "Mangrove Tree Planting")
        self.assertIn("posts", data)
        # Assert T2 fields are completely absent from representation
        self.assertNotIn("onboarding_text", data)
        self.assertNotIn("onboarding_version", data)
        self.assertNotIn("compensation_note", data)

    def test_event_detail_unaccepted_volunteer_masks_t2_fields(self):
        """Volunteer with unaccepted application receives T0 fields with T2 fields strictly omitted."""
        self.client.force_authenticate(user=self.volunteer_unaccepted)
        resp = self.client.get(reverse("public-event-detail", args=[self.pub_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertNotIn("onboarding_text", data)
        self.assertNotIn("onboarding_version", data)
        self.assertNotIn("compensation_note", data)

    def test_event_detail_accepted_volunteer_includes_t2_fields(self):
        """Volunteer with accepted application receives full T2 semi-private details."""
        self.client.force_authenticate(user=self.volunteer_accepted)
        resp = self.client.get(reverse("public-event-detail", args=[self.pub_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("onboarding_text", data)
        self.assertEqual(data["onboarding_text"], "Bring waterproof boots and insect repellent.")
        self.assertEqual(data["onboarding_version"], 1)
        self.assertEqual(data["compensation_note"], "Transportation boat provided from Bogale jetty.")

    def test_event_detail_coordinator_includes_t2_fields(self):
        """Event coordinator receives full T2 semi-private details."""
        self.client.force_authenticate(user=self.coordinator_user)
        resp = self.client.get(reverse("public-event-detail", args=[self.pub_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("onboarding_text", data)
        self.assertEqual(data["onboarding_text"], "Bring waterproof boots and insect repellent.")

    def test_event_detail_admin_includes_t2_fields(self):
        """System administrator receives full T2 semi-private details."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("public-event-detail", args=[self.pub_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("onboarding_text", data)

    # --- Draft Preview vs Masking ---

    def test_draft_event_detail_anonymous_returns_masked_404(self):
        """Anonymous caller requesting draft event receives masked 404."""
        resp = self.client.get(reverse("public-event-detail", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertEqual(data["error"]["code"], "not_found")

    def test_draft_event_detail_unrelated_volunteer_returns_masked_404(self):
        """Regular volunteer requesting draft event receives masked 404 (never leaking 403)."""
        self.client.force_authenticate(user=self.volunteer_unrelated)
        resp = self.client.get(reverse("public-event-detail", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertEqual(data["error"]["code"], "not_found")

    def test_draft_event_detail_coordinator_returns_200(self):
        """Event coordinator requesting their own draft event receives 200 OK preview."""
        self.client.force_authenticate(user=self.coordinator_user)
        resp = self.client.get(reverse("public-event-detail", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], self.draft_event.id)
        self.assertEqual(data["title"], "Internal Strategy Workshop")
        self.assertEqual(data["status"], "draft")
        self.assertIn("posts", data)
        self.assertEqual(len(data["posts"]), 1)

    def test_draft_event_detail_admin_returns_200(self):
        """Admin requesting draft event receives 200 OK preview."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(reverse("public-event-detail", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], self.draft_event.id)

    # --- W160: Posts Capacity ---

    def test_posts_endpoint_anonymous_draft_returns_404(self):
        """Anonymous caller requesting posts for draft event receives 404."""
        resp = self.client.get(reverse("public-event-posts", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 404)

    def test_posts_endpoint_coordinator_draft_returns_200(self):
        """Coordinator requesting posts for their draft event receives 200 with posts."""
        self.client.force_authenticate(user=self.coordinator_user)
        resp = self.client.get(reverse("public-event-posts", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["title"], "Facilitator")
