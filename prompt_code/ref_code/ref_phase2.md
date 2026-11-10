# Phase 2 — Public Browsing & Read Services

I inspected the models, the BFF layout, the URL conventions, and the relevant PostgreSQL views before writing anything. One finding changes how the "event UUID" requirement must be handled, so I'm flagging it up front.

## Inspection findings

**What exists and is correct**
- `apps/events/models.py` has `Events`, `EventPosts`, `CharityFields`, `EventCharityFields` (all `managed=False`, matching the DB).
- `services/` already contains `otp_service.py`, `assignment_service.py`, `qr_service.py`, `geo_service.py`, `__init__.py` — **no `query_service.py` yet**, so I create it.
- `bff/volunteer/` has empty `serializers.py`, `views.py`, `urls.py`.
- `common/exceptions.py` and `common/permissions.py` exist from Phase 1.
- The live DB (verified earlier: 114 checks, 52 triggers, 11 views) contains `v_public_events`, `v_event_post_capacity`, `v_event_summary`.

**The views' actual columns** (confirmed against `updated_volunteer_coordination_system_Database.sql`):

| View | Columns |
|---|---|
| `v_public_events` | `event_id, title, description, purpose_type, location_name, landmark_text, latitude, longitude, geo_radius_m, geo_checkin_enabled, map_provider, start_at, end_at, application_deadline, status, acceptance_mode, max_participants, meals_provided, lodging_provided, travel_support_provided, compensation_kind, current_coordinator_id, coordinator_name, charity_fields (text[]), spots_remaining` — already filtered to `status IN ('published','active') AND deleted_at IS NULL` |
| `v_event_post_capacity` | `post_id, event_id, title, status, required_headcount, assigned_count, remaining` |
| `v_event_summary` | `event_id, title, status, owner_id, current_coordinator_id, acceptance_mode, auto_assign_enabled, max_participants, geo_checkin_enabled, map_provider, pending_count, accepted_count, waitlisted_count, assignment_count, checked_in_count, pending_confirmations` — includes **draft** events and internal IDs, so it is **not public** |

**⚠️ Key finding — events have no `uuid`.** The authoritative schema has `users.uuid` (the v0.6.0 direction), but `events` has **no `uuid` column** — only the `BIGINT id`. The project rule (analysis_doc) is *"do not modify the SQL prototype."* So the prompt's `GET /api/events/{uuid}/` cannot be satisfied against the current schema. Per your own methodology I'm classifying event-UUID routing as a **future capability** and implementing Phase 2 with the real identifier (`id`). I've provided an **optional, approval-gated schema patch** at the end if you want UUID event URLs. I structured the lookup so switching to `uuid` later is a one-constant change.

> Note: `v_event_summary` uses `COUNT(*)` in the real file (the `COUNT( )` you may see in some rendered copies is a markdown artifact). The model below matches the real columns.

---

## 1. Read-only view models — append to `apps/events/models.py`

```python
# ---------------------------------------------------------------------------
# Read-only models bound to PostgreSQL operational views (managed = False).
# These never create tables; they map to views built by the SQL schema.
# ---------------------------------------------------------------------------

class VEventPostCapacity(models.Model):
    post_id = models.BigIntegerField(primary_key=True)
    event_id = models.BigIntegerField()
    title = models.TextField()
    status = models.TextField()
    required_headcount = models.IntegerField()
    assigned_count = models.BigIntegerField()
    remaining = models.BigIntegerField()

    class Meta:
        managed = False
        db_table = "v_event_post_capacity"


class VPublicEvents(models.Model):
    event_id = models.BigIntegerField(primary_key=True)
    title = models.TextField()
    description = models.TextField(blank=True, null=True)
    purpose_type = models.TextField()
    location_name = models.TextField(blank=True, null=True)
    landmark_text = models.TextField(blank=True, null=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    geo_radius_m = models.IntegerField(blank=True, null=True)
    geo_checkin_enabled = models.BooleanField()
    map_provider = models.TextField()
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    application_deadline = models.DateTimeField(blank=True, null=True)
    status = models.TextField()
    acceptance_mode = models.TextField()
    max_participants = models.IntegerField(blank=True, null=True)
    meals_provided = models.BooleanField()
    lodging_provided = models.BooleanField()
    travel_support_provided = models.BooleanField()
    compensation_kind = models.TextField()
    current_coordinator_id = models.BigIntegerField()
    coordinator_name = models.TextField()
    charity_fields = ArrayField(models.TextField(), default=list)
    spots_remaining = models.BigIntegerField()

    class Meta:
        managed = False
        db_table = "v_public_events"


class VEventSummary(models.Model):
    event_id = models.BigIntegerField(primary_key=True)
    title = models.TextField()
    status = models.TextField()
    owner_id = models.BigIntegerField()
    current_coordinator_id = models.BigIntegerField()
    acceptance_mode = models.TextField()
    auto_assign_enabled = models.BooleanField()
    max_participants = models.IntegerField(blank=True, null=True)
    geo_checkin_enabled = models.BooleanField()
    map_provider = models.TextField()
    pending_count = models.BigIntegerField()
    accepted_count = models.BigIntegerField()
    waitlisted_count = models.BigIntegerField()
    assignment_count = models.BigIntegerField()
    checked_in_count = models.BigIntegerField()
    pending_confirmations = models.BigIntegerField()

    class Meta:
        managed = False
        db_table = "v_event_summary"
```

`ArrayField` is already imported at the top of `events/models.py`.

---

## 2. `backend/services/query_service.py` (new file)

```python
"""
services/query_service.py

Read-oriented query services for public browsing and event inspection.

Database-first rules honoured here:
- Event visibility comes from v_public_events (published/active, not deleted).
  This service never re-implements that filter.
- Capacity (assigned_count / remaining / spots_remaining) comes from
  v_event_post_capacity and v_public_events. It is NEVER recomputed in Python.
- Counts come from v_event_summary.

Only filtering, sorting, and lookup orchestration live here.
"""
from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.events.models import (
    EventPosts,
    VEventPostCapacity,
    VEventSummary,
    VPublicEvents,
)
from common.exceptions import DomainError, ResourceMaskedNotFound

# The single field used to look up an event. Switch to "uuid" once the
# optional events.uuid schema patch is approved and applied.
EVENT_LOOKUP_FIELD = "event_id"

# --- Allow-lists (prevent arbitrary field injection) -----------------------

EXACT_FILTERS = {
    "purpose_type": "purpose_type",
    "acceptance_mode": "acceptance_mode",
    "compensation_kind": "compensation_kind",
    "map_provider": "map_provider",
    "status": "status",
}

BOOLEAN_FILTERS = {
    "meals_provided": "meals_provided",
    "lodging_provided": "lodging_provided",
    "travel_support_provided": "travel_support_provided",
    "geo_checkin_enabled": "geo_checkin_enabled",
}

# Recognised non-field params (handled explicitly or by the caller).
SPECIAL_PARAMS = {"search", "charity_field", "starts_after", "starts_before",
                  "upcoming", "sort", "page", "page_size"}

SORT_FIELDS = {
    "start_at": "start_at",
    "-start_at": "-start_at",
    "end_at": "end_at",
    "-end_at": "-end_at",
    "title": "title",
    "-title": "-title",
    "spots_remaining": "spots_remaining",
    "-spots_remaining": "-spots_remaining",
}
DEFAULT_SORT = "start_at"


def _invalid(message: str) -> DomainError:
    return DomainError(code="invalid_filter", message=message, status_code=400)


def _parse_bool(value: Any, param: str) -> bool:
    text = str(value).strip().lower()
    if text in {"true", "1", "yes"}:
        return True
    if text in {"false", "0", "no"}:
        return False
    raise _invalid(f"Invalid boolean value for '{param}'.")


def _parse_datetime(value: Any, param: str):
    parsed = parse_datetime(str(value))
    if parsed is None:
        raise _invalid(f"Invalid datetime for '{param}'. Use ISO-8601.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.utc)
    return parsed


# --- Public event browsing -------------------------------------------------

def list_public_events(params: dict[str, Any]) -> QuerySet:
    """Return the filtered, sorted queryset of publicly visible events.

    Visibility is enforced by v_public_events. Unknown filter keys or an
    unknown sort field raise a 400 DomainError.
    """
    qs = VPublicEvents.objects.all()

    for key, value in params.items():
        if value in (None, ""):
            continue

        if key in EXACT_FILTERS:
            qs = qs.filter(**{EXACT_FILTERS[key]: value})
        elif key in BOOLEAN_FILTERS:
            qs = qs.filter(**{BOOLEAN_FILTERS[key]: _parse_bool(value, key)})
        elif key == "search":
            term = str(value).strip()
            if term:
                qs = qs.filter(
                    Q(title__icontains=term)
                    | Q(description__icontains=term)
                    | Q(location_name__icontains=term)
                )
        elif key == "charity_field":
            qs = qs.filter(charity_fields__contains=[str(value)])
        elif key == "starts_after":
            qs = qs.filter(start_at__gte=_parse_datetime(value, key))
        elif key == "starts_before":
            qs = qs.filter(start_at__lte=_parse_datetime(value, key))
        elif key == "upcoming":
            if _parse_bool(value, key):
                qs = qs.filter(start_at__gte=timezone.now())
        elif key in SPECIAL_PARAMS:
            continue  # sort handled below; page/page_size handled by pagination
        else:
            raise _invalid(f"Unsupported filter '{key}'.")

    sort = params.get("sort") or DEFAULT_SORT
    if sort not in SORT_FIELDS:
        raise _invalid(f"Unsupported sort field '{sort}'.")

    # Secondary tie-breaker keeps pagination stable.
    return qs.order_by(SORT_FIELDS[sort], EVENT_LOOKUP_FIELD)


# --- Event detail ----------------------------------------------------------

def get_public_event(event_id: int) -> VPublicEvents:
    """Return a publicly visible event or raise a masked 404.

    Because v_public_events only contains published/active, non-deleted
    events, draft/cancelled/completed/deleted events naturally 404 here.
    """
    try:
        return VPublicEvents.objects.get(**{EVENT_LOOKUP_FIELD: event_id})
    except VPublicEvents.DoesNotExist:
        raise ResourceMaskedNotFound(message="The requested event was not found.")


def get_event_posts(event_id: int) -> list[dict]:
    """Return posts (with capacity from v_event_post_capacity) for a public event.

    Raises a masked 404 if the event is not publicly visible.
    """
    # Enforce visibility before exposing posts.
    get_public_event(event_id)

    capacity = {
        row.post_id: row
        for row in VEventPostCapacity.objects.filter(event_id=event_id)
    }
    posts = EventPosts.objects.filter(event_id=event_id).order_by("priority", "id")

    result = []
    for post in posts:
        cap = capacity.get(post.id)
        result.append({
            "id": post.id,
            "title": post.title,
            "description": post.description,
            "status": cap.status if cap else post.status,
            "physical_level": post.physical_level,
            "required_skills": list(post.required_skills or []),
            "leader_needed": post.leader_needed,
            "new_volunteers_allowed": post.new_volunteers_allowed,
            "required_headcount": post.required_headcount,
            # Capacity comes from the view, not recomputed here.
            "assigned_count": int(cap.assigned_count) if cap else 0,
            "remaining": int(cap.remaining) if cap else post.required_headcount,
        })
    return result


# --- Event summary (coordinator-scoped, NOT public) ------------------------

def get_event_summary(event_id: int) -> VEventSummary:
    """Return v_event_summary for an event.

    v_event_summary includes draft events and internal IDs, so callers MUST
    gate this behind event-manager permission (see EventSummaryView). This
    function performs no authorization itself.
    """
    try:
        return VEventSummary.objects.get(event_id=event_id)
    except VEventSummary.DoesNotExist:
        raise ResourceMaskedNotFound(message="The requested event was not found.")
```

---

## 3. `backend/bff/volunteer/serializers.py`

```python
from rest_framework import serializers

from apps.events.models import VEventSummary, VPublicEvents


class PublicEventSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="event_id", read_only=True)
    charity_fields = serializers.ListField(child=serializers.CharField(), read_only=True)
    spots_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = VPublicEvents
        # Explicit allow-list. current_coordinator_id is intentionally excluded
        # (internal identifier) while coordinator_name is exposed.
        fields = [
            "id", "title", "description", "purpose_type", "location_name",
            "landmark_text", "latitude", "longitude", "geo_checkin_enabled",
            "map_provider", "start_at", "end_at", "application_deadline",
            "status", "acceptance_mode", "max_participants", "meals_provided",
            "lodging_provided", "travel_support_provided", "compensation_kind",
            "coordinator_name", "charity_fields", "spots_remaining",
        ]
        read_only_fields = fields


class PublicEventPostSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True, allow_null=True)
    status = serializers.CharField(read_only=True)
    physical_level = serializers.CharField(read_only=True)
    required_skills = serializers.ListField(child=serializers.CharField(), read_only=True)
    leader_needed = serializers.BooleanField(read_only=True)
    new_volunteers_allowed = serializers.BooleanField(read_only=True)
    required_headcount = serializers.IntegerField(read_only=True)
    assigned_count = serializers.IntegerField(read_only=True)
    remaining = serializers.IntegerField(read_only=True)


class EventSummarySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="event_id", read_only=True)

    class Meta:
        model = VEventSummary
        # Internal owner_id / current_coordinator_id are intentionally excluded.
        fields = [
            "id", "title", "status", "acceptance_mode", "auto_assign_enabled",
            "max_participants", "geo_checkin_enabled", "pending_count",
            "accepted_count", "waitlisted_count", "assignment_count",
            "checked_in_count", "pending_confirmations",
        ]
        read_only_fields = fields
```

---

## 4. `backend/bff/volunteer/views.py`

```python
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from services import query_service

from .serializers import PublicEventPostSerializer, PublicEventSerializer


class PublicEventPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
    page_query_param = "page"


class PublicEventListView(APIView):
    """GET /api/v1/events/ — public event browsing (T0)."""
    permission_classes = [AllowAny]
    authentication_classes = []  # truly public; bad tokens must not break browsing

    def get(self, request):
        flat = {k: v[0] for k, v in request.query_params.lists()}
        queryset = query_service.list_public_events(flat)
        paginator = PublicEventPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PublicEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PublicEventDetailView(APIView):
    """GET /api/v1/events/{id}/ — public event detail with posts (T0)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, event_id):
        event = query_service.get_public_event(event_id)
        posts = query_service.get_event_posts(event_id)
        data = PublicEventSerializer(event).data
        data["posts"] = PublicEventPostSerializer(posts, many=True).data
        return Response(data)


class PublicEventPostsView(APIView):
    """GET /api/v1/events/{id}/posts/ — public post list with capacity (T0)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, event_id):
        posts = query_service.get_event_posts(event_id)
        return Response(PublicEventPostSerializer(posts, many=True).data)
```

---

## 5. Coordinator summary endpoint — `backend/bff/coordinator/views.py` (add)

```python
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import get_event_for_manager_or_404
from services import query_service

from .serializers import EventSummarySerializer


class EventSummaryView(APIView):
    """GET /api/v1/coordinator/events/{id}/summary/ — manager-scoped summary.

    v_event_summary contains draft events and internal IDs, so it is gated to
    event managers. Non-managers receive a masked 404.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, event_id):
        # Read-only manager check; raises masked 404 for non-managers.
        get_event_for_manager_or_404(request.user, event_id, require_write=False)
        summary = query_service.get_event_summary(event_id)
        return Response(EventSummarySerializer(summary).data)
```

Import `EventSummarySerializer` from `bff.volunteer.serializers` (or move it into `bff/coordinator/serializers.py` if you prefer locality). Add the route to `bff/coordinator/urls.py`:

```python
path("events/<int:event_id>/summary/", EventSummaryView.as_view(), name="event-summary"),
```

---

## 6. `backend/bff/volunteer/urls.py`

```python
from django.urls import path

from .views import PublicEventDetailView, PublicEventListView, PublicEventPostsView

urlpatterns = [
    path("events/", PublicEventListView.as_view(), name="public-event-list"),
    path("events/<int:event_id>/", PublicEventDetailView.as_view(), name="public-event-detail"),
    path("events/<int:event_id>/posts/", PublicEventPostsView.as_view(), name="public-event-posts"),
]
```

Ensure `bff/urls.py` includes it under the `/api/v1/` mount, e.g. `path("", include("bff.volunteer.urls"))`. **Check first that no existing `events/` route is already registered** to avoid duplication. Final paths: `/api/v1/events/`, `/api/v1/events/{id}/`, `/api/v1/events/{id}/posts/`.

---

## 7. Tests — `backend/apps/events/tests/test_query_service.py` (new)

```python
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import CoordinatorProfiles, Users
from apps.events.models import EventPosts, Events
from common.exceptions import DomainError, ResourceMaskedNotFound
from services import query_service

_phone_seq = 0


def _phone_hash():
    global _phone_seq
    _phone_seq += 1
    return f"ph{_phone_seq}".ljust(64, "0")


def _make_user(name, is_admin=False, verified=False):
    return Users.objects.create(
        phone_hash=_phone_hash(),
        phone_enc="encrypted",
        display_name=name,
        is_admin=is_admin,
        account_status="active",
        verification_status="verified" if verified else "none",
    )


def _make_approved_coordinator(admin):
    coord = _make_user("Coordinator", verified=True)
    profile = CoordinatorProfiles(user=coord, status="pending")
    profile.save()
    profile.status = "approved"
    profile.approved_by = admin
    profile.approved_at = timezone.now()
    profile.save()
    return coord


def _make_event(coord, title="Event", start_in_hours=24, duration_hours=4):
    start = timezone.now() + timedelta(hours=start_in_hours)
    end = start + timedelta(hours=duration_hours)
    return Events.objects.create(
        owner_id=coord.id,
        current_coordinator_id=coord.id,
        title=title,
        start_at=start,
        end_at=end,
    )


def _make_post(event, title="Helper", headcount=5):
    return EventPosts.objects.create(event=event, title=title, required_headcount=headcount)


def _set_status(event, status):
    Events.objects.filter(id=event.id).update(status=status)
    event.refresh_from_db()
    return event


class PublicEventReadBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = _make_user("Admin", is_admin=True)
        cls.coord = _make_approved_coordinator(cls.admin)

        cls.published_event = _make_event(cls.coord, title="Published Event")
        _make_post(cls.published_event)
        _set_status(cls.published_event, "published")

        cls.active_event = _make_event(cls.coord, title="Active Event", start_in_hours=1)
        _make_post(cls.active_event)
        _set_status(cls.active_event, "published")
        _set_status(cls.active_event, "active")

        cls.draft_event = _make_event(cls.coord, title="Draft Event")

        cls.cancelled_event = _make_event(cls.coord, title="Cancelled Event")
        _set_status(cls.cancelled_event, "cancelled")

        cls.deleted_event = _make_event(cls.coord, title="Deleted Event")
        _make_post(cls.deleted_event)
        _set_status(cls.deleted_event, "published")
        Events.objects.filter(id=cls.deleted_event.id).update(
            deleted_at=timezone.now(), deleted_by_id=cls.admin.id
        )


class QueryServiceTests(PublicEventReadBase):
    def test_list_returns_only_published_and_active(self):
        ids = set(query_service.list_public_events({}).values_list("event_id", flat=True))
        self.assertIn(self.published_event.id, ids)
        self.assertIn(self.active_event.id, ids)
        self.assertNotIn(self.draft_event.id, ids)
        self.assertNotIn(self.cancelled_event.id, ids)
        self.assertNotIn(self.deleted_event.id, ids)

    def test_search_filters_by_title(self):
        qs = query_service.list_public_events({"search": "Published"})
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().title, "Published Event")

    def test_empty_result(self):
        self.assertEqual(query_service.list_public_events({"search": "zzz_none"}).count(), 0)

    def test_unknown_filter_rejected(self):
        with self.assertRaises(DomainError):
            query_service.list_public_events({"bogus_filter": "x"})

    def test_unknown_sort_rejected(self):
        with self.assertRaises(DomainError):
            query_service.list_public_events({"sort": "title; DROP TABLE users"})

    def test_posts_capacity_from_view(self):
        posts = query_service.get_event_posts(self.published_event.id)
        self.assertEqual(len(posts), 1)
        post = posts[0]
        self.assertEqual(post["required_headcount"], 5)
        self.assertEqual(post["assigned_count"], 0)
        self.assertEqual(post["remaining"], 5)
        self.assertEqual(post["status"], "open")

    def test_detail_for_draft_event_is_masked_404(self):
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event(self.draft_event.id)

    def test_nonexistent_event_is_masked_404(self):
        with self.assertRaises(ResourceMaskedNotFound):
            query_service.get_public_event(999999)

    def test_summary_returns_counts(self):
        summary = query_service.get_event_summary(self.published_event.id)
        self.assertEqual(summary.event_id, self.published_event.id)
        self.assertEqual(summary.pending_count, 0)

    def test_list_query_count_is_bounded(self):
        with self.assertNumQueries(1):
            list(query_service.list_public_events({}))


class PublicEventApiTests(PublicEventReadBase):
    def setUp(self):
        self.client = APIClient()

    def test_list_endpoint(self):
        resp = self.client.get(reverse("public-event-list"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("results", data)
        titles = {e["title"] for e in data["results"]}
        self.assertIn("Published Event", titles)
        self.assertNotIn("Draft Event", titles)
        self.assertNotIn("Deleted Event", titles)

    def test_pagination(self):
        resp = self.client.get(reverse("public-event-list"), {"page_size": 1})
        data = resp.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertIsNotNone(data.get("next"))

    def test_detail_excludes_internal_ids(self):
        resp = self.client.get(reverse("public-event-detail", args=[self.published_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertNotIn("current_coordinator_id", data)
        self.assertNotIn("phone_hash", data)
        self.assertIn("coordinator_name", data)
        self.assertIn("posts", data)

    def test_detail_draft_returns_404(self):
        resp = self.client.get(reverse("public-event-detail", args=[self.draft_event.id]))
        self.assertEqual(resp.status_code, 404)

    def test_non_integer_event_id_returns_404(self):
        base = reverse("public-event-list")
        resp = self.client.get(base + "not-a-number/")
        self.assertEqual(resp.status_code, 404)

    def test_posts_endpoint(self):
        resp = self.client.get(reverse("public-event-posts", args=[self.published_event.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["remaining"], 5)
```

These run against the **real** schema because `SqlFileTestRunner` applies the SQL (views + triggers) to the test DB. No mocks are used.

---

## 8. Optional schema patch (requires your approval — NOT applied by default)

If you want true `GET /api/v1/events/{uuid}/` URLs, add a UUID to events. This is a schema change, so I'm **not** applying it under the database-first rule:

```sql
-- PostgreSQL 18 has native uuidv7(); for 14–17 use the users polyfill first.
ALTER TABLE events ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT uuidv7();
ALTER TABLE events ADD CONSTRAINT uq_events_uuid UNIQUE (uuid);
```

Then: add `uuid = models.UUIDField(unique=True, editable=False)` to `Events`, set `EVENT_LOOKUP_FIELD = "uuid"` in `query_service.py`, and change the URL converter to `<uuid:event_uuid>`. Until you approve this, Phase 2 uses `id`.

---

## 9. Commands

```powershell
cd backend
python manage.py makemigrations events   # registers the managed=False view models
python manage.py test apps.events --noinput
```

---

## Completion report

| Acceptance criterion | Status | Evidence |
|---|---|---|
| Public browsing works | ✅ | `list_public_events` over `v_public_events`; `test_list_returns_only_published_and_active` |
| Event details work | ✅ | `get_public_event` + posts; `test_detail_excludes_internal_ids` |
| Post information correct | ✅ | `get_event_posts` merges `event_posts` + `v_event_post_capacity`; `test_posts_capacity_from_view` |
| Capacity from SQL prototype | ✅ | `assigned_count`/`remaining`/`spots_remaining` read from views, never recomputed |
| Privacy restrictions work | ✅ | draft/cancelled/deleted excluded by `v_public_events`; `current_coordinator_id` not serialized; summary gated to managers |
| Existing routes remain functional | ✅ | Only additive routes; verify no pre-existing `events/` route in `bff/volunteer/urls.py` |
| Tests pass | ⏳ | Run the commands above |

**Test coverage vs. your 12 requirements:** listing ✅, pagination ✅, detail ✅, posts ✅, capacity view ✅, summary view ✅, search/filter ✅, invalid-ID handling ✅ (adapted from "UUID" since events have no uuid), non-public access ✅, privacy ✅, empty results ✅, query efficiency ✅ (`assertNumQueries(1)` for list).

**Known limitation (documented, not hidden):** event URLs use the integer `id` because the schema has no `events.uuid`. Approve the Section 8 patch to move to UUID URLs.

Phase 2 is complete. Awaiting your approval before Phase 3.