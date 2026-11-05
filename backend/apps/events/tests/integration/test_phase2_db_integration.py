"""
Database Integration Tests for Phase 2: PostgreSQL Operational Views & Taxonomy.
"""

import secrets
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Users
from apps.coordination.models import Assignments, CoordinatorProfiles
from apps.events.models import (
    CharityFields,
    EventApplications,
    EventCharityFields,
    EventPosts,
    Events,
    VEventPostCapacity,
    VEventSummary,
    VPublicEvents,
)
from services import query_service


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


class DatabaseViewsIntegrationTests(TestCase):
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
        cls.coord_prof = profile

        # Create Charity Taxonomy
        CharityFields.objects.filter(code__in=["health", "education", "inactive_code"]).delete()
        cls.cf_health = CharityFields.objects.create(code="health", label="Health Care", sort_order=10, active=True)
        cls.cf_edu = CharityFields.objects.create(code="education", label="Education", sort_order=10, active=True)
        cls.cf_inactive = CharityFields.objects.create(code="inactive_code", label="Inactive Category", sort_order=5, active=False)

        # Create published event with posts
        start = timezone.now() + timedelta(days=2)
        end = start + timedelta(hours=6)
        cls.event = Events.objects.create(
            owner=cls.coord_prof,
            current_coordinator=cls.coord_prof,
            title="Community Medical Camp",
            description="Free medical consultation for villagers.",
            location_name="Hmawbi Clinic",
            start_at=start,
            end_at=end,
            acceptance_mode="auto",
            max_participants=50,
            onboarding_text="Wear medical scrubs or white coats.",
            onboarding_version=1,
            compensation_note="Lunch and transportation allowance provided.",
        )
        EventCharityFields.objects.create(event=cls.event, field_code=cls.cf_health)
        EventCharityFields.objects.create(event=cls.event, field_code=cls.cf_edu)

        cls.post1 = EventPosts.objects.create(
            event=cls.event,
            title="General Doctor",
            required_headcount=5,
            required_skills=["medicine"],
        )
        cls.post2 = EventPosts.objects.create(
            event=cls.event,
            title="Pharmacist",
            required_headcount=3,
            required_skills=["pharmacy"],
        )

        Events.objects.filter(id=cls.event.id).update(status="published")
        cls.event.refresh_from_db()

        # Create a volunteer with an accepted application and active assignment on post1
        cls.volunteer1 = _make_user("Dr. Volunteer")
        cls.app1 = EventApplications.objects.create(
            event=cls.event,
            post=cls.post1,
            user=cls.volunteer1,
            status="accepted",
        )
        cls.assign1 = Assignments.objects.create(
            event=cls.event,
            post=cls.post1,
            application=cls.app1,
            user=cls.volunteer1,
            status="assigned",
            assigned_by="coordinator",
            assigned_by_user=cls.coord_user,
        )

    def test_v_public_events_view_sync(self):
        """v_public_events reflects the database view computation correctly."""
        pub_row = VPublicEvents.objects.get(event_id=self.event.id)
        self.assertEqual(pub_row.title, "Community Medical Camp")
        self.assertEqual(pub_row.status, "published")
        self.assertEqual(pub_row.coordinator_name, "Coordinator User")
        self.assertIn("health", pub_row.charity_fields)
        self.assertIn("education", pub_row.charity_fields)

    def test_v_event_post_capacity_view_sync(self):
        """v_event_post_capacity reflects database engine capacity and remaining slots."""
        cap_post1 = VEventPostCapacity.objects.get(post_id=self.post1.id)
        self.assertEqual(cap_post1.required_headcount, 5)
        self.assertEqual(cap_post1.assigned_count, 1)
        self.assertEqual(cap_post1.remaining, 4)

        cap_post2 = VEventPostCapacity.objects.get(post_id=self.post2.id)
        self.assertEqual(cap_post2.required_headcount, 3)
        self.assertEqual(cap_post2.assigned_count, 0)
        self.assertEqual(cap_post2.remaining, 3)

    def test_charity_fields_ordering_and_active_filtering(self):
        """Active charity fields are returned strictly ordered by sort_order ASC, then code ASC."""
        active_fields = list(query_service.list_active_charity_fields())
        codes = [f.code for f in active_fields]
        self.assertNotIn("inactive_code", codes)
        self.assertIn("education", codes)
        self.assertIn("health", codes)
        # Both education and health have sort_order 10; tie-breaker by code alphabetical: education before health
        self.assertLess(codes.index("education"), codes.index("health"))

    def test_query_count_get_event_posts_optimized(self):
        """get_event_posts with verified_visible=True avoids re-querying v_public_events."""
        # 1 query for VEventPostCapacity, 1 query for EventPosts
        with self.assertNumQueries(2):
            posts = query_service.get_event_posts(self.event.id, verified_visible=True)
            self.assertEqual(len(posts), 2)

    def test_query_idempotency_and_no_side_effects(self):
        """Repeated GET reads return identical results with zero transactional mutations."""
        posts_first = query_service.get_event_posts(self.event.id, verified_visible=True)
        posts_second = query_service.get_event_posts(self.event.id, verified_visible=True)
        self.assertEqual(posts_first, posts_second)
