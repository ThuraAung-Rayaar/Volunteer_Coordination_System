# Phase 2 Implementation Review: Public Browsing and Read Services

**Review Date:** 2026-11-04  
**Reviewer:** Senior Django & PostgreSQL Code Reviewer  
**Scope:** Phase 2 Implementation (`Domain 18`: Tab 1 Open Shifts Discovery, Public Read BFF, Query Service, and Event Operational Views)  
**Status:** **NEEDS REVIEW / CONDITIONAL APPROVAL** (Gated on User Approval before Applying Fixes)

---

## 1. Overall Assessment

Phase 2 implements the unauthenticated and public-facing read services for the Volunteer Coordination System (`T0` discovery domain). The implementation demonstrates strong architectural discipline, strictly adhering to the database-first design principle:

* **Zero Python Business Calculations**: Public event availability, spot counts, post capacities, and summary statistics are queried directly from database operational views (`v_public_events`, `v_event_post_capacity`, and `v_event_summary`) rather than being computed in application code.
* **Query Safety & Protection**: SQL injection risks and arbitrary database column traversal are mitigated through strict allow-lists for query filters (`EXACT_FILTERS`, `BOOLEAN_FILTERS`) and deterministic sorting keys (`SORT_FIELDS`).
* **Clean BFF & Service Decoupling**: API views in `backend/bff/` remain thin presentation controllers that delegate query orchestration to `backend/services/query_service.py`.
* **Efficient ORM Usage**: Post capacity joining avoids the classic N+1 query antipattern by performing bulk dictionary indexing in memory.
* **Schema Integrity**: The team correctly respected the project rule *"do not modify the SQL prototype"*, identifying that `events` has an integer identity (`id BIGINT`) rather than a UUID column, adapting routing without corrupting the underlying SQL schema.

However, the implementation has **three significant compliance gaps** against the master implementation specification (`volunteer_coordination_system_v0_6_0_step_by_step_backend_implementation_plan.md` Step P2.1 and Master Business Rules):
1. **Missing Core Endpoint (`W161`)**: `GET /api/v1/charity-fields/` was completely omitted.
2. **Missing T2 Field Gating (`W159`)**: `GET /api/v1/events/{id}/` does not expose or gate T2 semi-private fields (`onboarding_text`, `onboarding_version`, `compensation_note`) for authorized volunteers or event managers.
3. **Hard-Stripped Authentication Context**: Setting `authentication_classes = []` on public views completely disables DRF's authentication pass, preventing authenticated volunteers and managers from accessing draft events or receiving their authorized tier data via standard endpoints.

---

## 2. Findings by Severity

```
CRITICAL : 0
HIGH     : 3
MEDIUM   : 3
LOW      : 2
```

### 🔴 CRITICAL Findings
*None identified. There are no direct SQL injection vulnerabilities, data leaks, or privilege escalations.*

---

### 🟠 HIGH Findings

#### Finding 2.1 — Missing Public Charity Fields Discovery Endpoint `GET /api/v1/charity-fields/` (`W161`)
* **Category:** Missing Business Rule / Incomplete Feature
* **Affected Files:**
  * [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py)
  * [`backend/bff/volunteer/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/serializers.py)
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py)
  * [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py)
* **Description:**
  * The Phase 2 specification (Step P2.1, Item 1) and workflow rule `W161` explicitly require:
    > `GET /api/v1/charity-fields/` (`AllowAny` — `W161`): Returns active `CharityFields` ordered by `sort_order, code`.
  * The `CharityFields` model already exists in `backend/apps/events/models.py`. However, no query service function, serializer, view, or URL route was implemented.
  * Mobile and web clients cannot query the active charity taxonomy needed to render discovery filter chips on Tab 1.

#### Finding 2.2 — Omission of T2 Semi-Private Field Gating in `GET /api/v1/events/{id}/` (`W159`)
* **Category:** Data Privacy & Specification Compliance
* **Affected Files:**
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py#L60-L70)
  * [`backend/bff/volunteer/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/serializers.py#L323-L341)
  * [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py#L149-L160)
* **Description:**
  * Specification Step P2.1, Item 3 requires:
    > Includes T2 fields (`onboarding_text`, `onboarding_version`, `compensation_note`) **only** if `request.user` is authenticated and holds an `'accepted'` application, active assignment, or manager role on `event`.
  * Currently, `PublicEventDetailView` only serializes `VPublicEvents`. The PostgreSQL view `v_public_events` excludes `onboarding_text`, `onboarding_version`, and `compensation_note` because they belong to the T2 tier.
  * Because the view does not load the underlying `Events` model or evaluate user participation, authenticated volunteers with accepted shifts cannot view the onboarding briefing or compensation terms for their assigned event.

#### Finding 2.3 — `authentication_classes = []` Hard-Strips Authenticated Context, Breaking Privacy Tiering and Draft Inspection (`W159`, `W160`)
* **Category:** Authentication Architecture & Access Control
* **Affected Files:**
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py#L49)
* **Description:**
  * `PublicEventListView`, `PublicEventDetailView`, and `PublicEventPostsView` set `authentication_classes = []`.
  * In Django REST Framework, setting `authentication_classes = []` bypasses token evaluation entirely. Even if the request supplies a valid `Authorization: Bearer <token>`, `request.user` is left as `AnonymousUser`.
  * As a consequence:
    1. The view can never identify whether the caller is an accepted volunteer, coordinator, or admin.
    2. Any caller querying a draft event via `/events/{id}/` or `/events/{id}/posts/` hits `get_public_event()`, which hard-queries `v_public_events` and raises a 404, even if the caller is the event owner/coordinator who should be able to inspect their draft event via `get_visible_event_or_404(request.user, id)`.
  * *Correction*: Public views should maintain standard authentication (`permission_classes = [AllowAny]`, default authentication classes enabled). Unauthenticated requests gracefully default to `AnonymousUser`, while authenticated requests populate `request.user` to unlock authorized T2 fields and visible draft previews.

---

### 🟡 MEDIUM Findings

#### Finding 2.4 — Redundant Database Query to `v_public_events` in `PublicEventDetailView`
* **Category:** Performance & Query Efficiency
* **Affected Files:**
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py#L65-L70)
  * [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py#L167)
* **Description:**
  * In `PublicEventDetailView.get()`:
    ```python
    event = query_service.get_public_event(event_id)  # Query 1 to v_public_events
    posts = query_service.get_event_posts(event_id)   # Internally calls get_public_event(event_id) again!
    ```
  * `query_service.get_event_posts()` calls `get_public_event(event_id)` at its start to enforce visibility, resulting in an identical duplicate query to `v_public_events` during every event detail page load.

#### Finding 2.5 — Truncation of Repeated Query Parameters and Inflexible Array Filtering
* **Category:** Reliability & Query Robustness
* **Affected Files:**
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py#L52)
  * [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py#L125-L126)
* **Description:**
  * In `PublicEventListView`:
    ```python
    flat = {k: v[0] for k, v in request.query_params.lists()}
    ```
  * Extracting only `v[0]` silently discards repeated query parameters (e.g. `?charity_field=environment&charity_field=health`).
  * In `query_service.py`:
    ```python
    elif key == "charity_field":
        qs = qs.filter(charity_fields__contains=[str(value)])
    ```
  * If a client passes a comma-separated list (`?charity_field=environment,health`), the filter looks for the literal string `"environment,health"` rather than splitting tags.

#### Finding 2.6 — Unvalidated and Redundant `status` Filter in `EXACT_FILTERS`
* **Category:** Business Logic & Maintainability
* **Affected Files:**
  * [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py#L42)
* **Description:**
  * `EXACT_FILTERS` includes `"status": "status"`.
  * However, `VPublicEvents` is backed by `v_public_events` which is already hard-filtered by PostgreSQL: `WHERE status IN ('published', 'active') AND deleted_at IS NULL`.
  * Passing `?status=draft` or `?status=completed` yields an empty list `[]` instead of raising an invalid filter error (`invalid_filter`), misleading API callers into believing draft events exist in the public list. If `status` filtering is supported, it must only accept valid public statuses (`published`, `active`).

---

### 🟢 LOW Findings

#### Finding 2.7 — Event Primary Key Identity (`id BIGINT`) vs Specification UUID Routing Divergence
* **Category:** Architectural Alignment & Documentation
* **Affected Files:**
  * [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py#L32-L34)
* **Description:**
  * While the high-level specification mentioned `GET /api/v1/events/{uuid}/`, the actual PostgreSQL prototype schema defines `events.id BIGINT GENERATED ALWAYS AS IDENTITY` without a UUID column.
  * The Phase 2 implementation appropriately respected the foundational rule prohibiting manual schema modification and configured integer `event_id` routing with `EVENT_LOOKUP_FIELD = "event_id"`. This is technically sound and properly abstracted.

#### Finding 2.8 — Potential URL Route Overshadowing in Root BFF Inclusion
* **Category:** URL Routing Maintainability
* **Affected Files:**
  * [`backend/bff/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/urls.py#L9-L11)
* **Description:**
  * `backend/bff/urls.py` mounts both `bff.volunteer.urls` and `bff.coordinator.urls` at the empty root path `""`.
  * If route paths overlap (such as `events/`), Django resolves to the first registered pattern in `bff.volunteer.urls`. While namespaced paths (`coordinator/events/`) prevent collisions, the empty-prefix includes should be monitored as more routes are added.

---

## 3. Exact Affected Files

| File Path | Impacted Components / Functions | Nature of Issue |
| :--- | :--- | :--- |
| [`backend/services/query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/query_service.py) | `list_charity_fields`, `get_event_posts`, `list_public_events`, `EXACT_FILTERS` | Missing charity fields query; redundant query in post loading; repeated tag parsing |
| [`backend/bff/volunteer/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/serializers.py) | `CharityFieldSerializer`, `PublicEventSerializer`, `PublicEventDetailSerializer` | Missing charity field serializer; missing T2 conditional fields |
| [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py) | `CharityFieldsListView`, `PublicEventListView`, `PublicEventDetailView` | Missing endpoint; stripped auth classes (`authentication_classes = []`) |
| [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py) | `urlpatterns` | Missing route for `charity-fields/` |
| [`backend/apps/events/tests/test_query_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_query_service.py) | Test suite | Missing test coverage for `W161`, T2 fields, and draft event manager access |

---

## 4. Recommended Corrections (Awaiting User Approval)

### Proposed Correction 1: Implement `GET /api/v1/charity-fields/` (`W161`)

1. **Add query service method** in `backend/services/query_service.py`:
   ```python
   def list_active_charity_fields() -> QuerySet[CharityFields]:
       """Return active charity taxonomy fields ordered by sort_order and code."""
       return CharityFields.objects.filter(active=True).order_by("sort_order", "code")
   ```

2. **Add serializer** in `backend/bff/volunteer/serializers.py`:
   ```python
   class CharityFieldSerializer(serializers.ModelSerializer):
       class Meta:
           model = CharityFields
           fields = ["code", "label", "sort_order"]
           read_only_fields = fields
   ```

3. **Add view & route** in `backend/bff/volunteer/views.py` & `urls.py`:
   ```python
   class CharityFieldsListView(APIView):
       """GET /api/v1/charity-fields/ — active charity fields taxonomy (T0)."""
       permission_classes = [AllowAny]

       def get(self, request):
           fields = query_service.list_active_charity_fields()
           serializer = CharityFieldSerializer(fields, many=True)
           return Response(serializer.data)
   ```
   ```python
   path("charity-fields/", CharityFieldsListView.as_view(), name="charity-fields-list"),
   ```

---

### Proposed Correction 2: Restore Optional Authentication & Gated T2 Fields on Event Detail (`W159`)

1. **Remove `authentication_classes = []`** across public views in `backend/bff/volunteer/views.py`. Standard token authentication runs when `Authorization` header is present, while anonymous requests safely remain `request.user.is_authenticated == False`.
2. **Implement visibility and T2 gating in `PublicEventDetailView`**:
   ```python
   class PublicEventDetailView(APIView):
       """GET /api/v1/events/{id}/ — public event detail with posts and conditional T2 fields."""
       permission_classes = [AllowAny]

       def get(self, request, event_id):
           # Uses common visibility helper: published/active for all, draft/completed for managers/assignees
           event = get_visible_event_or_404(request.user, event_id)
           posts = query_service.get_event_posts(event_id, verified_visible=True)
           
           # Serialize base T0 fields from VPublicEvents or Events
           data = PublicEventSerializer(event).data
           data["posts"] = PublicEventPostSerializer(posts, many=True).data

           # Gating T2 fields: onboarding_text, onboarding_version, compensation_note
           if can_access_event_t2(request.user, event):
               data["onboarding_text"] = event.onboarding_text
               data["onboarding_version"] = event.onboarding_version
               data["compensation_note"] = event.compensation_note

           return Response(data)
   ```
3. **Helper `can_access_event_t2(user, event)`**:
   Returns `True` if `user.is_authenticated` AND (`user.is_admin` OR `_is_event_manager(user, event)` OR user holds an `'accepted'` application or active assignment on `event`).

---

### Proposed Correction 3: Optimize Post Querying (Eliminate Duplicate Query)

Update `get_event_posts(event_id, verified_visible=False)` in `backend/services/query_service.py` to skip `get_public_event(event_id)` if caller has already validated visibility.

---

## 5. Missing Tests

The following tests are missing and must be added to `backend/apps/events/tests/test_query_service.py`:

1. **`test_list_charity_fields_ordering_and_active_filter`**:
   - Verify `GET /api/v1/charity-fields/` returns active records sorted by `sort_order` ascending, then `code`.
   - Verify inactive charity fields (`active=False`) are excluded.
2. **`test_event_detail_t2_gating_unauthenticated`**:
   - Verify unauthenticated or regular volunteer requests to `GET /api/v1/events/{id}/` do not contain `onboarding_text`, `onboarding_version`, or `compensation_note`.
3. **`test_event_detail_t2_inclusion_for_accepted_volunteer`**:
   - Create an accepted application for a volunteer user on the published event.
   - Request event detail with that volunteer's auth token and verify T2 fields are present.
4. **`test_event_detail_draft_visible_to_manager`**:
   - Request draft event detail with the coordinator's token; verify `200 OK` is returned.
   - Request draft event detail anonymously; verify masked `404 Not Found` is returned.
5. **`test_public_event_filter_comma_separated_charity_fields`**:
   - Verify `?charity_field=environment,disaster_relief` correctly matches events with either tag.

---

## 6. Acceptance Criteria Satisfaction

| Specification Requirement | Target | Status | Assessment Notes |
| :--- | :--- | :---: | :--- |
| **`W158`: Public Event Browsing** | `GET /api/v1/events/` | ✅ **SATISFIED** | Correctly queries `v_public_events`, pagination works, allow-list filters enforced, empty list `[]` on no match. |
| **`W159`: Public Event Detail** | `GET /api/v1/events/{id}/` | ⚠️ **PARTIALLY SATISFIED** | Returns base event and post capacity data with 404 masking for draft/cancelled events; **FAILS** to include T2 fields for accepted volunteers/managers due to `authentication_classes = []`. |
| **`W160`: Public Event Posts Capacity** | `GET /api/v1/events/{id}/posts/` | ✅ **SATISFIED** | Direct query to `v_event_post_capacity`, correct remaining slot calculations without Python re-calculation. |
| **`W161`: Charity Fields Discovery** | `GET /api/v1/charity-fields/` | ❌ **NOT SATISFIED** | Endpoint was omitted completely. |
| **Database-First Integrity** | Operational Views | ✅ **SATISFIED** | Zero recalculation in Python; spots remaining and post capacity derive from PostgreSQL views. |
| **Zero SQL Schema Alterations** | Prototype SQL | ✅ **SATISFIED** | `updated_volunteer_coordination_system_Database.sql` left completely untouched. |
| **Information Masking** | Draft/Deleted Events | ✅ **SATISFIED** | Sensitive internal IDs omitted; non-public events return standard 404 masking. |

---

## 7. Next Steps & Instructions

> [!IMPORTANT]
> In accordance with instructions, **no files have been modified yet**, and the SQL prototype remains strictly unchanged.
> Please review these findings and provide approval before corrections are applied.

