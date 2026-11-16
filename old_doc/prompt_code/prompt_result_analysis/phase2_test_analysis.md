# Phase 2 Test Coverage & Analysis Report: Public Browsing, Open Shifts Discovery & Read BFF Services

**Evaluation Date:** 2026-11-04  
**Evaluator:** Senior Django & PostgreSQL Test Automation Engineer  
**Feature / Service:** Phase 2: Public Browsing, Open Shifts Discovery & Read BFF Services (`backend/services/query_service.py`, `backend/bff/volunteer/`)  
**Status:** **100% VERIFIED & PASSING (Gate P2 Cleared)**

---

## 1. Executive Summary

A comprehensive test suite and implementation review was conducted for Phase 2 (`Domain 18`: Tab 1 Open Shifts Discovery, Taxonomy, and Operational Views). All gaps identified during the implementation review were resolved:

1. **`GET /api/v1/charity-fields/` (`W161`)**: Implemented `list_active_charity_fields()`, `CharityFieldSerializer`, `CharityFieldsListView`, and mounted the route in `backend/bff/volunteer/urls.py`.
2. **`GET /api/v1/events/{id}/` T2 Field Gating (`W159`)**: Removed `authentication_classes = []` across all public read views, allowing DRF's default token authentication to identify callers while keeping `permission_classes = [AllowAny]`. Implemented `can_access_event_t2` and `PublicEventDetailSerializer` which includes `onboarding_text`, `onboarding_version`, and `compensation_note` strictly for authenticated accepted volunteers, active assignees, event managers, and administrators.
3. **Draft Event Preview & 404 Masking (`W159`, `W160`, `BR-SEC-MASK`)**: Verified that coordinators and admins can preview their draft events and draft posts via `/events/{id}/` and `/events/{id}/posts/`, while anonymous callers and unrelated volunteers receive HTTP 404 masked responses without leaking draft existence.
4. **Duplicate Query Elimination**: Enhanced `get_event_posts(event_id, verified_visible=True)` to bypass redundant `v_public_events` fetches when caller has already performed visibility validation.
5. **Multi-Tag Array Filtering**: Updated `query_service.list_public_events` to support comma-separated tags (`?charity_field=disaster,environment`) via PostgreSQL array containment/overlap (`__overlap`).

All **60 Phase 2 unit, integration, and API tests** pass cleanly with zero failures and zero errors. The full backend test suite of **328 tests** across all apps passes with 100% success.

---

## 2. Business Rules & Compliance Traceability

| Business Rule ID | Description | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **`W158`** | Public Event Browsing (`GET /api/v1/events/`) with pagination, sorting, allow-listed query filters, and empty-result handling. | API & Service Tests | ✅ Verified |
| **`W159`** | Public Event Detail (`GET /api/v1/events/{id}/`) with post capacity and conditional T2 semi-private field gating. | API, Unit & Permission Tests | ✅ Verified |
| **`W160`** | Public Event Posts Capacity Discovery (`GET /api/v1/events/{id}/posts/`) backed by PostgreSQL view `v_event_post_capacity`. | API & Database View Tests | ✅ Verified |
| **`W161`** | Charity Taxonomy Discovery (`GET /api/v1/charity-fields/`) returning active categories ordered by `sort_order, code`. | API & Database View Tests | ✅ Verified |
| **`BR-PRIV-T0`** | Public visibility tier allowing anonymous access to published/active events, active post capacities, and taxonomy metadata. | API Unauthenticated Tests | ✅ Verified |
| **`BR-PRIV-T2`** | Semi-private field protection restricting event onboarding guides and compensation terms strictly to authenticated accepted volunteers, active assignees, event managers, or administrators. | API & Serializer Gating Tests | ✅ Verified |
| **`BR-SEC-MASK`** | 404 resource masking ensuring non-public events (draft, completed, cancelled, deleted) return HTTP 404 to anonymous users or non-managing volunteers, while remaining inspectable by verified event managers. | API Permission Tests | ✅ Verified |
| **`BR-QUERY-01`** | Query parameter allow-listing, SQL injection defense, and strict rejection of unauthorized filter parameters. | Unit & Service Parser Tests | ✅ Verified |
| **`BR-DATA-VIEW`** | Strict reliance on database engine views (`v_public_events`, `v_event_post_capacity`, `v_event_summary`) with zero Python-side recalculation of capacities or remaining spots. | Database Integration Tests | ✅ Verified |

---

## 3. Database Objects & Trigger Interactions

The integration test suite was verified against PostgreSQL operational views and database triggers in `updated_volunteer_coordination_system_Database.sql`:

1. **`v_public_events`**: Automatically filters `WHERE status IN ('published', 'active') AND deleted_at IS NULL`. Tested that inserting draft or deleted events never surfaces in `list_public_events`.
2. **`v_event_post_capacity`**: Computes `assigned_count` and `remaining` spots directly in PostgreSQL. Tests assert that Python performs zero recalculation.
3. **`v_event_summary`**: Provides coordinator aggregate metrics (`pending_count`, `accepted_count`, `waitlisted_count`, etc.). Verified manager-only access via `/events/{id}/summary/`.
4. **Trigger `trg_coordinator_guard()`**: Enforced that new coordinator profiles start as `pending` before being approved by an admin.
5. **Trigger `trg_events_before_insert()` & `trg_events_before_update()`**:
   - Enforced that all created events start as `draft`.
   - Enforced rule `publish_requires_post`: an event must have at least one open post before transitioning to `published`.
6. **Trigger `trg_applications_before_insert()` & `trg_assignments_before_insert()`**:
   - Enforced that an event must be open (`published` or `active`) to receive applications.
   - Enforced that only accepted applications can receive assignments (`ck_assignment_assigned_by` and trigger guards).

---

## 4. Test Suite Categorization & Architecture

The test suite is structured into four distinct layers:

### Layer 1: Unit Tests (`backend/apps/events/tests/unit/test_phase2_unit.py`)
* `CharityFieldSerializerTests`: Validates serialization of taxonomy items (`code`, `label`, `sort_order`) and exclusion of `active` flag.
* `PublicEventDetailSerializerTests`:
  * Validates complete masking/omission of `onboarding_text`, `onboarding_version`, and `compensation_note` when `can_access_t2=False`.
  * Validates inclusion of T2 fields when `can_access_t2=True`.
* `QueryServiceParserUnitTests`: Validates boolean and ISO-8601 parsing, timezone awareness coercion, and rejection of invalid inputs with `DomainError("invalid_filter")`.

### Layer 2: Service Integration Tests (`backend/apps/events/tests/test_query_service.py`)
* Validates `list_public_events()`:
  * Only returns `published` and `active` events.
  * Search across title, description, and location.
  * Multi-tag filtering with comma-separated charity tags (`charity_fields__overlap`).
  * Ordering by start date ascending/descending.
  * Strict allow-list rejection of unauthorized filters and sort fields.
* Validates `get_public_event()`: 404 resource masking on draft, cancelled, deleted, or invalid IDs.
* Validates `get_event_posts()`: View-backed capacity synchronization and `verified_visible=True` performance optimization.
* Validates `list_active_charity_fields()`: Returns active taxonomy records ordered by `sort_order ASC`, then `code ASC`.
* Validates `assertNumQueries(1)` for public event listing (zero N+1 queries).

### Layer 3: Database Integration Tests (`backend/apps/events/tests/integration/test_phase2_db_integration.py`)
* `test_v_public_events_view_sync`: Verifies ORM mapping against real PostgreSQL view outputs.
* `test_v_event_post_capacity_view_sync`: Verifies capacity deductions (`required_headcount - assigned_count`) derived from assignments.
* `test_charity_fields_ordering_and_active_filtering`: Verifies exclusion of `active=False` and alphabetical tie-breaking on identical `sort_order`.
* `test_query_count_get_event_posts_optimized`: Verifies that `get_event_posts(verified_visible=True)` executes exactly 2 queries (zero duplicate calls to `v_public_events`).
* `test_query_idempotency_and_no_side_effects`: Verifies that repeated reads produce deterministic, identical outputs without persistent audit locks.

### Layer 4: API Integration Tests (`backend/bff/volunteer/tests/test_phase2_api.py`)
* **Charity Fields Discovery (`W161`)**: `GET /api/v1/charity-fields/` returns 200 OK with active items ordered by `sort_order, code`.
* **Public Event Listing (`W158`)**:
  * `GET /api/v1/events/` returns paginated public records.
  * Multi-tag filtering via `?charity_field=disaster_relief,environment`.
  * Empty filter matches return `200 OK` with `{"count": 0, "results": []}`.
  * Unsupported query parameters rejected with `400 Bad Request` (`invalid_filter`).
  * Querying `?status=draft` safely returns empty array `[]` without leaking non-public records.
* **Event Detail & T2 Privacy Gating (`W159`)**:
  * Anonymous caller: receives T0 public data only (`onboarding_text`, `onboarding_version`, `compensation_note` are absent).
  * Unaccepted volunteer (withdrawn/pending): receives T0 data only.
  * Accepted volunteer: receives T0 data + full T2 fields (`onboarding_text`, `onboarding_version`, `compensation_note`).
  * Event coordinator: receives full T2 fields.
  * System administrator: receives full T2 fields.
* **Draft Event Access Control & 404 Masking**:
  * Anonymous caller requesting draft event: HTTP 404 masked.
  * Unrelated regular volunteer requesting draft event: HTTP 404 masked.
  * Event coordinator requesting their draft event: HTTP 200 OK preview.
  * Admin requesting draft event: HTTP 200 OK preview.
* **Posts Capacity Discovery (`W160`)**:
  * `GET /api/v1/events/{id}/posts/` returns post capacity list.
  * Draft event posts return 404 to anonymous, 200 to coordinator.

---

## 5. Execution Report

### Test Command
```powershell
.venv\Scripts\python.exe backend/manage.py test apps.events.tests.unit apps.events.tests.integration apps.events.tests.test_query_service bff.volunteer.tests.test_phase2_api -v 2 --keepdb
```

### Results Summary
* **Passed:** 60
* **Failed:** 0
* **Errors:** 0
* **Skipped:** 0
* **Not Executed:** 0
* **Pass Rate:** 100%
* **Execution Time:** 1.208 seconds

### Full Test Inventory

#### Layer 1: Unit Tests (7 tests)
1. `apps.events.tests.unit.test_phase2_unit.CharityFieldSerializerTests.test_serializer_fields` — **PASSED**
2. `apps.events.tests.unit.test_phase2_unit.PublicEventDetailSerializerTests.test_t2_fields_included_when_authorized` — **PASSED**
3. `apps.events.tests.unit.test_phase2_unit.PublicEventDetailSerializerTests.test_t2_fields_masked_when_unauthorized` — **PASSED**
4. `apps.events.tests.unit.test_phase2_unit.QueryServiceParserUnitTests.test_parse_bool_invalid_raises_domain_error` — **PASSED**
5. `apps.events.tests.unit.test_phase2_unit.QueryServiceParserUnitTests.test_parse_bool_valid` — **PASSED**
6. `apps.events.tests.unit.test_phase2_unit.QueryServiceParserUnitTests.test_parse_datetime_invalid_raises_domain_error` — **PASSED**
7. `apps.events.tests.unit.test_phase2_unit.QueryServiceParserUnitTests.test_parse_datetime_valid` — **PASSED**

#### Layer 2: Database Integration Tests (5 tests)
8. `apps.events.tests.integration.test_phase2_db_integration.DatabaseViewsIntegrationTests.test_charity_fields_ordering_and_active_filtering` — **PASSED**
9. `apps.events.tests.integration.test_phase2_db_integration.DatabaseViewsIntegrationTests.test_query_count_get_event_posts_optimized` — **PASSED**
10. `apps.events.tests.integration.test_phase2_db_integration.DatabaseViewsIntegrationTests.test_query_idempotency_and_no_side_effects` — **PASSED**
11. `apps.events.tests.integration.test_phase2_db_integration.DatabaseViewsIntegrationTests.test_v_event_post_capacity_view_sync` — **PASSED**
12. `apps.events.tests.integration.test_phase2_db_integration.DatabaseViewsIntegrationTests.test_v_public_events_view_sync` — **PASSED**

#### Layer 3: Service Integration & Existing API Tests (31 tests)
13. `apps.events.tests.test_query_service.PublicEventApiTests.test_coordinator_summary_endpoint_gated_to_managers` — **PASSED**
14. `apps.events.tests.test_query_service.PublicEventApiTests.test_detail_endpoint_draft_returns_404` — **PASSED**
15. `apps.events.tests.test_query_service.PublicEventApiTests.test_detail_endpoint_excludes_internal_ids` — **PASSED**
16. `apps.events.tests.test_query_service.PublicEventApiTests.test_detail_endpoint_invalid_id_returns_404` — **PASSED**
17. `apps.events.tests.test_query_service.PublicEventApiTests.test_detail_endpoint_success` — **PASSED**
18. `apps.events.tests.test_query_service.PublicEventApiTests.test_list_endpoint` — **PASSED**
19. `apps.events.tests.test_query_service.PublicEventApiTests.test_pagination` — **PASSED**
20. `apps.events.tests.test_query_service.PublicEventApiTests.test_posts_endpoint_draft_returns_404` — **PASSED**
21. `apps.events.tests.test_query_service.PublicEventApiTests.test_posts_endpoint_success` — **PASSED**
22. `apps.events.tests.test_query_service.QueryServiceTests.test_empty_result` — **PASSED**
23. `apps.events.tests.test_query_service.QueryServiceTests.test_filter_by_boolean_attribute` — **PASSED**
24. `apps.events.tests.test_query_service.QueryServiceTests.test_filter_by_charity_field` — **PASSED**
25. `apps.events.tests.test_query_service.QueryServiceTests.test_filter_by_date_starts_after` — **PASSED**
26. `apps.events.tests.test_query_service.QueryServiceTests.test_filter_by_multi_charity_fields_comma_separated` — **PASSED**
27. `apps.events.tests.test_query_service.QueryServiceTests.test_filter_by_upcoming` — **PASSED**
28. `apps.events.tests.test_query_service.QueryServiceTests.test_get_event_posts_capacity_from_view` — **PASSED**
29. `apps.events.tests.test_query_service.QueryServiceTests.test_get_event_posts_for_draft_event_raises_masked_404` — **PASSED**
30. `apps.events.tests.test_query_service.QueryServiceTests.test_get_event_posts_verified_visible_bypasses_check` — **PASSED**
31. `apps.events.tests.test_query_service.QueryServiceTests.test_get_event_summary_from_view` — **PASSED**
32. `apps.events.tests.test_query_service.QueryServiceTests.test_get_public_event_cancelled_raises_masked_404` — **PASSED**
33. `apps.events.tests.test_query_service.QueryServiceTests.test_get_public_event_deleted_raises_masked_404` — **PASSED**
34. `apps.events.tests.test_query_service.QueryServiceTests.test_get_public_event_draft_raises_masked_404` — **PASSED**
35. `apps.events.tests.test_query_service.QueryServiceTests.test_get_public_event_invalid_id_raises_masked_404` — **PASSED**
36. `apps.events.tests.test_query_service.QueryServiceTests.test_get_public_event_success` — **PASSED**
37. `apps.events.tests.test_query_service.QueryServiceTests.test_list_active_charity_fields_service` — **PASSED**
38. `apps.events.tests.test_query_service.QueryServiceTests.test_list_query_count_is_bounded` — **PASSED**
39. `apps.events.tests.test_query_service.QueryServiceTests.test_list_returns_only_published_and_active` — **PASSED**
40. `apps.events.tests.test_query_service.QueryServiceTests.test_search_filters_by_title_and_description` — **PASSED**
41. `apps.events.tests.test_query_service.QueryServiceTests.test_sort_order` — **PASSED**
42. `apps.events.tests.test_query_service.QueryServiceTests.test_unknown_filter_rejected` — **PASSED**
43. `apps.events.tests.test_query_service.QueryServiceTests.test_unknown_sort_rejected` — **PASSED**

#### Layer 4: BFF API Integration Tests (17 tests)
44. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_charity_fields_discovery_success` — **PASSED**
45. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_draft_event_detail_admin_returns_200` — **PASSED**
46. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_draft_event_detail_anonymous_returns_masked_404` — **PASSED**
47. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_draft_event_detail_coordinator_returns_200` — **PASSED**
48. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_draft_event_detail_unrelated_volunteer_returns_masked_404` — **PASSED**
49. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_event_detail_accepted_volunteer_includes_t2_fields` — **PASSED**
50. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_event_detail_admin_includes_t2_fields` — **PASSED**
51. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_event_detail_anonymous_masks_t2_fields` — **PASSED**
52. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_event_detail_coordinator_includes_t2_fields` — **PASSED**
53. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_event_detail_unaccepted_volunteer_masks_t2_fields` — **PASSED**
54. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_posts_endpoint_anonymous_draft_returns_404` — **PASSED**
55. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_posts_endpoint_coordinator_draft_returns_200` — **PASSED**
56. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_public_event_disallowed_filter_rejected` — **PASSED**
57. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_public_event_empty_state_returns_200` — **PASSED**
58. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_public_event_filtering_multi_charity_tag` — **PASSED**
59. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_public_event_listing_published_only` — **PASSED**
60. `bff.volunteer.tests.test_phase2_api.PublicReadBffApiTests.test_public_event_status_draft_returns_empty_array` — **PASSED**

---

## 6. Full Suite Regression Verification

To verify that Phase 2 improvements introduced zero regressions across the codebase, the entire test suite was executed:
```powershell
.venv\Scripts\python.exe backend/manage.py test --keepdb
```
**Outcome:**
* **Ran 328 tests in 14.933s**
* **Result: OK (328/328 tests passed, 0 failures, 0 errors, 0 skipped)**
* **SQL Prototype Status:** `updated_volunteer_coordination_system_Database.sql` remains completely untouched.

---

## 7. Completion Decision

**Gate P2 Status:** **COMPLETE & VERIFIED**

All requirements of Phase 2 (Domain 18, `W158`–`W161`, `BR-PRIV-T0`, `BR-PRIV-T2`, `BR-SEC-MASK`, `BR-QUERY-01`, and `BR-DATA-VIEW`) are fully implemented, verified with end-to-end unit, integration, and API tests, and ready for Phase Completion reporting.

