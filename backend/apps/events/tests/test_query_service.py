"""
Tests for Phase 2: Public Browsing and Read Services.

Covers:
1. Public event listing (v_public_events)
2. Pagination
3. Event detail retrieval
4. Event post retrieval
5. Capacity view integration (v_event_post_capacity)
6. Summary view integration (v_event_summary)
7. Search and filtering (exact, boolean, dates, charity fields)
8. Invalid UUID / ID handling
9. Non-public event access (draft, cancelled, deleted return 404)
10. Privacy restrictions (internal IDs excluded, summary restricted to managers)
11. Empty results
12. Database query efficiency (no N+1)
"""

import secrets
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles
from apps.events.models import CharityFields, EventCharityFields, EventPosts, Events
from common.exceptions import DomainError, ResourceMaskedNotFound
from services import query_service


def _phone_hash():
    return secrets.token_hex(32)


def _make_user(name, is_admin=False, verified=False):
    return Users.objects.create_user(
        phone_hash=_phone_hash(),
        phone_enc="encrypted_test",
        display_name=name,
        is_admin=is_admin,
        is_staff=is_admin,
        account_status="active",
        verification_status="verified" if verified else "none",
    )


def _make_approved_coordinator(admin, name="Coordinator"):
    coord = _make_user(name, verified=True)
    profile = CoordinatorProfiles(user=coord, status="pending")
    profile.save()
    profile.status = "approved"
    profile.approved_by = admin
    profile.approved_at = timezone.now()
    profile.save()
    return coord


def _make_event(coord, title="Event", start_in_hours=24, duration_hours=4, meals=False, charity_field_codes=None):
    start = timezone.now() + timedelta(hours=start_in_hours)
    end = start + timedelta(hours=duration_hours)
    event = Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title=title,
        description=f"Description for {title}",
        location_name="Yangon City Hall",
        start_at=start,
        end_at=end,
        meals_provided=meals,
    )
    if charity_field_codes:
        for code in charity_field_codes:
            cf, _ = CharityFields.objects.get_or_create(code=code, defaults={"label": code.title()})
            EventCharityFields.objects.create(event=event, field_code=cf)
    return event


def _make_post(event, title="Helper", headcount=5):
    return EventPosts.objects.create(
        event=event,
        title=title,
        required_headcount=headcount,
        required_skills=["communication"],
    )


def _set_status(event, status):
    Events.objects.filter(id=event.id).update(status=status)
    event.refresh_from_db()
    return event


class PublicEventReadBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        Events.objects.exclude(title__in=["Yangon Tree Planting", "Flood Relief Distribution"]).filter(status__in=["published", "active"]).update(status="cancelled")
        cls.admin = _make_user("Admin", is_admin=True, verified=True)
        cls.coord = _make_approved_coordinator(cls.admin, "Coordinator 1")
        cls.other_user = _make_user("Regular Volunteer", verified=False)

        # 1. Published event
        cls.published_event = _make_event(
            cls.coord,
            title="Yangon Tree Planting",
            start_in_hours=48,
            meals=True,
            charity_field_codes=["environment"],
        )
        _make_post(cls.published_event, title="Sapling Planter", headcount=10)
        _set_status(cls.published_event, "published")

        # 2. Active event
        cls.active_event = _make_event(
            cls.coord,
            title="Flood Relief Distribution",
            start_in_hours=2,
            meals=False,
            charity_field_codes=["disaster_relief"],
        )
        _make_post(cls.active_event, title="Packager", headcount=5)
        _set_status(cls.active_event, "published")
        _set_status(cls.active_event, "active")

        # 3. Draft event (should never appear publicly)
        cls.draft_event = _make_event(cls.coord, title="Secret Draft Planning")

        # 4. Cancelled event (should never appear publicly)
        cls.cancelled_event = _make_event(cls.coord, title="Cancelled Concert")
        _set_status(cls.cancelled_event, "cancelled")

        # 5. Deleted event (should never appear publicly)
        cls.deleted_event = _make_event(cls.coord, title="Obsolete Deleted Event")
        _make_post(cls.deleted_event, title="Helper", headcount=2)
        _set_status(cls.deleted_event, "published")
        Events.objects.filter(id=cls.deleted_event.id).update(
            deleted_at=timezone.now(),
            deleted_by_id=cls.admin.id,
        )


class QueryServiceTests(PublicEventReadBase):
    def test_list_returns_only_published_and_active(self):
        """Public list view only contains published and active events."""
        qs = query_service.list_public_events({})
        ids = set(qs.values_list("event_id", flat=True))
        self.assertIn(self.published_event.id, ids)
        self.assertIn(self.active_event.id, ids)
        self.assertNotIn(self.draft_event.id, ids)
        self.assertNotIn(self.cancelled_event.id, ids)
        self.assertNotIn(self.deleted_event.id, ids)

    def test_search_filters_by_title_and_description(self):
        """Search matches title, description, or location."""
        qs = query_service.list_public_events({"search": "Tree Planting"})
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().title, "Yangon Tree Planting")

    def test_filter_by_boolean_attribute(self):
        """Boolean filter meals_provided works correctly."""
        qs = query_service.list_public_events({"meals_provided": "true"})
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().id, self.published_event.id)

    def test_filter_by_charity_field(self):
        """Filtering by charity_field matches array elements."""
        qs = query_service.list_public_events({"charity_field": "environment"})
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().id, self.published_event.id)

    def test_filter_by_multi_charity_fields_comma_separated(self):
        """Filtering by comma-separated charity_field matches events containing any of the fields."""
        qs = query_service.list_public_events({"charity_field": "environment,disaster_relief"})
        self.assertEqual(qs.count(), 2)

    def test_list_active_charity_fields_service(self):
        """list_active_charity_fields returns active taxonomy ordered by sort_order, code."""
        fields = list(query_service.list_active_charity_fields())
        self.assertGreater(len(fields), 0)
        codes = [f.code for f in fields]
        self.assertIn("environment", codes)

    def test_get_event_posts_verified_visible_bypasses_check(self):
        """get_event_posts with verified_visible=True returns posts directly."""
        posts = query_service.get_event_posts(self.published_event.id, verified_visible=True)
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["title"], "Sapling Planter")

    def test_filter_by_date_starts_after(self):
        """starts_after date filter functions correctly."""
        future_cutoff = (timezone.now() + timedelta(hours=24)).isoformat()
        qs = query_service.list_public_events({"starts_after": future_cutoff})
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().id, self.published_event.id)

    def test_filter_by_upcoming(self):
        """upcoming=true filters events starting in the future."""
        qs = query_service.list_public_events({"upcoming": "true"})
        self.assertGreaterEqual(qs.count(), 1)

    def test_sort_order(self):
        """Sorting by start_at ascending and descending."""
        qs_asc = list(query_service.list_public_events({"sort": "start_at"}))
        qs_desc = list(query_service.list_public_events({"sort": "-start_at"}))
        self.assertEqual(qs_asc[0].id, self.active_event.id)
        self.assertEqual(qs_desc[0].id, self.published_event.id)

    def test_unknown_filter_rejected(self):
        """Unknown filter parameter raises DomainError with 400."""
        with self.assertRaises(DomainError) as ctx:
            query_service.list_public_events({"invalid_col": "malicious"})
        self.assertEqual(ctx.exception.code, "invalid_filter")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_unknown_sort_rejected(self):
        """Unsupported sort field raises DomainError with 400."""
        with self.assertRaises(DomainError) as ctx:
            query_service.list_public_events({"sort": "owner_id"})
        self.assertEqual(ctx.exception.code, "invalid_filter")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_empty_result(self):
        """Search with no matches returns empty queryset."""
        qs = query_service.list_public_events({"search": "NonExistentEventName123"})
        self.assertEqual(qs.count(), 0)

    def test_get_public_event_success(self):
        """Public event detail retrieved successfully."""
        event = query_service.get_public_event(self.published_event.id)
        self.assertEqual(event.event_id, self.published_event.id)
        self.assertEqual(event.coordinator_name, self.coord.display_name)
        self.assertEqual(event.spots_remaining, 10)

    def test_get_public_event_draft_raises_masked_404(self):
        """Draft event raises ResourceMaskedNotFound."""
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event(self.draft_event.id)

    def test_get_public_event_cancelled_raises_masked_404(self):
        """Cancelled event raises ResourceMaskedNotFound."""
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event(self.cancelled_event.id)

    def test_get_public_event_deleted_raises_masked_404(self):
        """Deleted event raises ResourceMaskedNotFound."""
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event(self.deleted_event.id)

    def test_get_public_event_invalid_id_raises_masked_404(self):
        """Non-numeric or non-existent event ID raises ResourceMaskedNotFound."""
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event("not-a-number")
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event(999999)

    def test_get_event_posts_capacity_from_view(self):
        """Event posts capacity comes directly from v_event_post_capacity view."""
        posts = query_service.get_event_posts(self.published_event.id)
        self.assertEqual(len(posts), 1)
        post = posts[0]
        self.assertEqual(post["title"], "Sapling Planter")
        self.assertEqual(post["required_headcount"], 10)
        self.assertEqual(post["assigned_count"], 0)
        self.assertEqual(post["remaining"], 10)
        self.assertEqual(post["status"], "open")

    def test_get_event_posts_for_draft_event_raises_masked_404(self):
        """Posts for draft event raise ResourceMaskedNotFound."""
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_event_posts(self.draft_event.id)

    def test_get_event_summary_from_view(self):
        """v_event_summary provides aggregate counters."""
        summary = query_service.get_event_summary(self.published_event.id)
        self.assertEqual(summary.event_id, self.published_event.id)
        self.assertEqual(summary.pending_count, 0)
        self.assertEqual(summary.accepted_count, 0)
        self.assertEqual(summary.assignment_count, 0)

    def test_list_query_count_is_bounded(self):
        """Listing query is efficient and doesn't suffer from N+1 query loops."""
        with self.assertNumQueries(1):
            list(query_service.list_public_events({}))


class PublicEventApiTests(PublicEventReadBase):
    def setUp(self):
        self.client = APIClient()

    def test_list_endpoint(self):
        """GET /api/v1/events/ returns paginated public events."""
        resp = self.client.get(reverse("public-event-list"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("results", data)
        titles = {e["title"] for e in data["results"]}
        self.assertIn("Yangon Tree Planting", titles)
        self.assertIn("Flood Relief Distribution", titles)
        self.assertNotIn("Secret Draft Planning", titles)
        self.assertNotIn("Cancelled Concert", titles)
        self.assertNotIn("Obsolete Deleted Event", titles)

    def test_pagination(self):
        """Pagination controls page size and next link."""
        resp = self.client.get(reverse("public-event-list"), {"page_size": 1})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertIsNotNone(data.get("next"))
        self.assertEqual(data.get("count"), 2)

    def test_detail_endpoint_success(self):
        """GET /api/v1/events/{id}/ returns event detail and embedded posts."""
        resp = self.client.get(reverse("public-event-detail", args=[self.published_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["id"], self.published_event.id)
        self.assertEqual(data["title"], "Yangon Tree Planting")
        self.assertIn("posts", data)
        self.assertEqual(len(data["posts"]), 1)
        self.assertEqual(data["posts"][0]["title"], "Sapling Planter")

    def test_detail_endpoint_excludes_internal_ids(self):
        """Privacy: internal user IDs and hash columns are excluded from serialization."""
        resp = self.client.get(reverse("public-event-detail", args=[self.published_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertNotIn("current_coordinator_id", data)
        self.assertNotIn("owner_id", data)
        self.assertNotIn("phone_hash", data)
        self.assertIn("coordinator_name", data)

    def test_detail_endpoint_draft_returns_404(self):
        """GET /api/v1/events/{id}/ on draft event returns masked 404."""
        resp = self.client.get(reverse("public-event-detail", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 404)
        data = resp.json()
        self.assertEqual(data["error"]["code"], "not_found")

    def test_detail_endpoint_invalid_id_returns_404(self):
        """Invalid ID in URL returns 404."""
        base = reverse("public-event-list")
        resp = self.client.get(base + "not-a-number/")
        self.assertEqual(resp.status_code, 404)

    def test_posts_endpoint_success(self):
        """GET /api/v1/events/{id}/posts/ returns post capacity list."""
        resp = self.client.get(reverse("public-event-posts", args=[self.published_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["title"], "Sapling Planter")
        self.assertEqual(data[0]["remaining"], 10)
        self.assertEqual(data[0]["assigned_count"], 0)

    def test_posts_endpoint_draft_returns_404(self):
        """GET /api/v1/events/{id}/posts/ on draft event returns 404."""
        resp = self.client.get(reverse("public-event-posts", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 404)

    def test_coordinator_summary_endpoint_gated_to_managers(self):
        """GET /api/v1/coordinator/events/{id}/summary/ requires manager authorization."""
        # Non-manager regular user receives 404
        self.client.force_authenticate(user=self.other_user)
        resp_unauth = self.client.get(reverse("event-summary", args=[self.published_event.id]))
        self.assertEqual(resp_unauth.status_code, 404)

        # Manager user receives 200 with summary counters
        self.client.force_authenticate(user=self.coord)
        resp_auth = self.client.get(reverse("event-summary", args=[self.published_event.id]))
        self.assertEqual(resp_auth.status_code, 200)
        summary_data = resp_auth.json()
        self.assertEqual(summary_data["id"], self.published_event.id)
        self.assertEqual(summary_data["pending_count"], 0)
        self.assertEqual(summary_data["status"], "published")
        self.assertNotIn("owner_id", summary_data)
        self.assertNotIn("current_coordinator_id", summary_data)
