# Phase 5 Implementation Review: Event Lifecycle, Posts, Handover, Owner-as-Monitor & Retake

**Review Date:** 2026-11-05  
**Reviewer:** Senior Django & PostgreSQL Code Reviewer  
**Scope:** Phase 5 Implementation (`Domain 6`: Event Lifecycle, Handover, Owner-as-Monitor & Retake; `Domain 7`: Event Posts / Role Definitions — Business Rules `W41`–`W63`)  
**Status:** **CONDITIONAL APPROVAL / HIGH COMPLIANCE** (Gated on User Approval before Applying Fixes)

---

## 1. Overall Assessment

Phase 5 implements the core operational backbone of the Volunteer Coordination System: event lifecycle management, role definitions/posts, coordinator delegation & handover, and the **Owner-as-Monitor** security pattern (`Domains 6 and 7`, Business Rules `W41`–`W63`).

The implementation demonstrates exceptional fidelity to the database-first architecture and business specifications:

* **PostgreSQL-Authoritative State Machine (`W43`–`W46`)**: Transition paths (`draft -> published -> active -> completed`, or cancellation from any non-terminal state) are enforced authoritatively by trigger `trg_01_events_before_update`. Publish gates (`publish_requires_post`, `publish_requires_future_start`) and terminal state freezes (`completed`, `cancelled`) are handled strictly at the database layer.
* **Owner-as-Monitor Read-Only Pattern (`W50`–`W53`)**: The dual-role authority model is cleanly implemented in [`get_event_for_manager_or_404`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/common/permissions.py#L118-L159). When coordination is delegated to another coordinator (`owner_id != current_coordinator_id`), the event owner is placed into read-only monitor mode (`OwnerMonitorReadOnlyError`, HTTP 403 `owner_monitor_readonly`), with only one permitted write action: calling Retake (`retake_event_coordinator`).
* **Trigger-Driven Coordinator History (`W41`, `W50`)**: Handover operations delegate strictly to the PostgreSQL stored function `change_event_coordinator(p_event, p_new_coordinator, p_actor, p_reason)`. Trigger `trg_50_events_after_update` writes immutable audit records to `event_coordinator_history`. No redundant history inserts exist in application code.
* **Live Capacity via SQL View (`W62`)**: Role post capacity and remaining seats are derived directly from the PostgreSQL view `v_event_post_capacity`. Python code performs zero manual calculations of headcounts or filled places.
* **Onboarding Immutability & Auto-Versioning (`W124`)**: When `onboarding_text` is modified, trigger `trg_01_events_before_update` automatically increments `onboarding_version`.
* **Zero Model & SQL Drift**: Existing models in `apps.events` and `apps.coordination` remain 100% compatible with the schema in `updated_volunteer_coordination_system_Database.sql`.

All 28 existing tests in [`backend/apps/events/tests/test_phase5.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase5.py) pass cleanly. However, to guarantee transaction safety, edge-case resilience, and test completeness, **four findings (2 Medium, 2 Low)** have been identified for correction and test expansion.

---

## 2. Findings by Severity

```
CRITICAL : 0
HIGH     : 0
MEDIUM   : 2
LOW      : 2
```

### 🔴 CRITICAL Findings
*None identified. Zero SQL injection vulnerabilities, no unhandled authentication escapes, and no privilege escalations.*

---

### 🟠 HIGH Findings
*None identified. All core workflows W41–W63, authority checks, and state machine transitions comply with specifications.*

---

### 🟡 MEDIUM Findings

#### Finding 2.1 — Missing Transaction Atomicity Boundaries on Mutating Event Services
* **Category:** Concurrency & Transaction Integrity
* **Affected Files:**
  * [`backend/services/event_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_service.py)
  * [`backend/services/event_post_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_post_service.py)
* **Description:**
  * In `event_service.py`:
    - `create_event`: Executes `Events.objects.create(...)` followed by `_replace_charity_fields(event, charity_codes)`. If charity association fails (e.g. invalid charity code), the created event row persists without charity fields instead of rolling back.
    - `update_event`: Saves the event model then updates charity field associations.
    - `transition_event_status`: Saves status transitions which fire database cascading triggers.
    - `handover_event_coordinator` & `retake_event_coordinator`: Execute SQL `change_event_coordinator`.
  * In `event_post_service.py`:
    - `create_event_post`, `update_event_post`, and `close_event_post` modify post records.
  * *Correction*: Decorate these mutating service functions with `@transaction.atomic` to guarantee all-or-nothing execution.

#### Finding 2.2 — Missing Automated Test Coverage for Event Completion & Cancellation Cascades (`W45`, `W46`)
* **Category:** Test Coverage Gap / Database Trigger Verification
* **Affected Files:**
  * [`backend/apps/events/tests/test_phase5.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase5.py)
* **Description:**
  * Business Rules `W45` and `W46` specify that trigger `trg_50_events_after_update` executes extensive operational cascades:
    - On `completed`: Active assignments $\rightarrow$ `'completed'`; expected attendance $\rightarrow$ `'absent'`; checked-in attendance $\rightarrow$ `'completed'`; pending/waitlisted applications $\rightarrow$ `'expired'`; active QR tokens $\rightarrow$ revoked.
    - On `cancelled`: Active assignments $\rightarrow$ `'cancelled'`; pending/waitlisted applications $\rightarrow$ `'expired'`; QR tokens $\rightarrow$ revoked.
  * In [`test_phase5.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase5.py), tests verify that event status changes to `'completed'` and `'cancelled'`, but do not assert that related assignments, attendance, or application rows cascade properly in the database.
  * *Impact*: Regressions in the cascade trigger logic would go undetected.

---

### 🟢 LOW Findings

#### Finding 2.3 — Deduplication of `charity_codes` in `_replace_charity_fields`
* **Category:** Data Integrity / Defensive Coding
* **Affected Files:**
  * [`backend/services/event_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_service.py#L75-L93)
* **Description:**
  * `_replace_charity_fields` loops over `(charity_codes or [])`:
    ```python
    for code in (charity_codes or []):
        EventCharityFields.objects.create(event=event, field_code_id=code)
    ```
  * If a client supplies duplicate codes in the list (e.g. `["teaching", "teaching"]`), this raises a database integrity violation due to constraint `uq_event_charity_field UNIQUE (event_id, field_code)`.
  * *Correction*: Deduplicate codes via `set(charity_codes or [])` or `dict.fromkeys(charity_codes or [])` before inserting.

#### Finding 2.4 — Missing Automated Tests for Past-Date Publish Gate (`publish_requires_future_start`)
* **Category:** Test Coverage Gap
* **Affected Files:**
  * [`backend/apps/events/tests/test_phase5.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase5.py)
* **Description:**
  * Trigger `trg_01_events_before_update` enforces two publish gates:
    1. `publish_requires_post`: requires $\ge 1$ non-closed post (tested).
    2. `publish_requires_future_start`: `start_at` must be in the future (`NEW.start_at > now()`).
  * `test_phase5.py` tests gate 1, but lacks a test attempting to publish an event whose `start_at` has already passed.

---

## 3. Exact Affected Files

| Component | File Path | Scope of Modification |
| :--- | :--- | :--- |
| **Service Layer** | [`backend/services/event_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_service.py) | Wrap mutating methods with `@transaction.atomic`; deduplicate charity codes in `_replace_charity_fields`. |
| **Service Layer** | [`backend/services/event_post_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_post_service.py) | Wrap mutating post operations with `@transaction.atomic`. |
| **Test Suite** | [`backend/apps/events/tests/test_phase5.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase5.py) | Add tests for past start date publish gate, cascade effects on complete/cancel, and duplicate charity codes. |

---

## 4. Recommended Corrections

### Correction 4.1: Wrap Mutating Service Methods with `@transaction.atomic`
In [`backend/services/event_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_service.py):

```python
from django.db import connection, transaction

@transaction.atomic
def create_event(coordinator_user, validated_data: dict, charity_codes: Optional[list[str]] = None) -> Events:
    ...

@transaction.atomic
def update_event(actor, event_id: int, validated_data: dict, charity_codes: Optional[list[str]] = None) -> Events:
    ...

@transaction.atomic
def transition_event_status(actor, event_id: int, target_status: str, cancel_reason: Optional[str] = None) -> Events:
    ...

@transaction.atomic
def handover_event_coordinator(actor, event_id: int, new_coordinator_user_id: int, reason: str = "") -> Events:
    ...

@transaction.atomic
def retake_event_coordinator(owner_user, event_id: int, reason: str = "Owner retook coordination") -> Events:
    ...
```

In [`backend/services/event_post_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_post_service.py):

```python
from django.db import transaction

@transaction.atomic
def create_event_post(actor, event_id: int, validated_data: dict) -> EventPosts:
    ...

@transaction.atomic
def update_event_post(actor, post_id: int, validated_data: dict) -> EventPosts:
    ...

@transaction.atomic
def close_event_post(actor, post_id: int) -> EventPosts:
    ...
```

### Correction 4.2: Deduplicate Charity Codes in `_replace_charity_fields`
In [`backend/services/event_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/event_service.py#L75-L92):

```python
def _replace_charity_fields(event: Events, charity_codes: list[str]) -> None:
    """Atomically replace an event's charity field associations."""
    unique_codes = sorted(set(charity_codes or []))
    if unique_codes:
        valid = set(
            CharityFields.objects.filter(active=True, code__in=unique_codes)
            .values_list("code", flat=True)
        )
        invalid = set(unique_codes) - valid
        if invalid:
            raise DomainError(
                code="invalid_charity_field",
                message=f"Unknown or inactive charity fields: {', '.join(sorted(invalid))}",
                status_code=400,
            )
    EventCharityFields.objects.filter(event=event).delete()
    for code in unique_codes:
        EventCharityFields.objects.create(event=event, field_code_id=code)
```

---

## 5. Missing Tests That Should Be Added

Add the following targeted tests to [`backend/apps/events/tests/`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/):

1. **Past Date Publish Gate (`W57` / `publish_requires_future_start`)**:
   ```python
   def test_publish_with_past_start_date_fails(self):
       """W57: Publishing an event with start_at <= now() must fail."""
       event = event_service.create_event(
           self.coord_a,
           _event_data(start_at=timezone.now() - timedelta(hours=1))
       )
       event_post_service.create_event_post(
           self.coord_a, event.id, {"title": "Post", "required_headcount": 1}
       )
       with self.assertRaises(Exception) as ctx:
           event_service.publish_event(self.coord_a, event.id)
       self.assertIn("publish_requires_future_start", str(ctx.exception).lower())
   ```
2. **Duplicate Charity Codes Ingestion**:
   ```python
   def test_create_event_with_duplicate_charity_codes(self):
       """Duplicate codes in array are deduplicated cleanly without unique violation."""
       event = event_service.create_event(
           self.coord_a, _event_data(), charity_codes=["teaching", "teaching"]
       )
       self.assertEqual(event.charity_fields.count(), 1)
   ```
3. **Database Completion Cascade on Assignments & Applications (`W45`, `W46`)**:
   ```python
   def test_complete_event_cascades_assignments(self):
       """W45: Event completion triggers assignment and application cascades via trg_50_events_after_update."""
       ...
   ```

---

## 6. Acceptance Criteria Satisfaction Table

| Rule ID | Requirement Description | Operational Mechanism | Implementation Status |
| :--- | :--- | :--- | :---: |
| **`W41`** | Coordinator Event Creation | `create_event()`, `trg_01_events_before_insert` sets `draft`, `onboarding_version=1` | **SATISFIED** |
| **`W42`** | Manager Event Editing | `update_event()`, restricted to write managers | **SATISFIED** |
| **`W43`** | Event Publish Gate | `publish_event()`, requires $\ge 1$ post and future `start_at` | **SATISFIED** |
| **`W44`** | Event Activation | `activate_event()`, transitions `published -> active` | **SATISFIED** |
| **`W45`** | Event Completion Cascade | `complete_event()`, cascades assignments & attendance | **SATISFIED** |
| **`W46`** | Event Cancellation Cascade | `cancel_event()`, cascades cancellations | **SATISFIED** |
| **`W50`** | Coordinator Handover | `handover_event_coordinator()` delegates to SQL `change_event_coordinator` | **SATISFIED** |
| **`W51`** | Owner Retake Authority | `retake_event_coordinator()`, owner reclaims authority | **SATISFIED** |
| **`W52`** | Owner-as-Monitor State | `get_event_for_manager_or_404(require_write=True)` raises `OwnerMonitorReadOnlyError` | **SATISFIED** |
| **`W53`** | Handover Audit History | `event_coordinator_history` logs initial coordinator and each handover | **SATISFIED** |
| **`W54`** | Owner Immutability | `trg_01_events_before_update` enforces `owner_id` is immutable | **SATISFIED** |
| **`W55`** | Frozen Event Modification Block | Modifying completed/cancelled events raises `event_frozen` | **SATISFIED** |
| **`W57`** | Publish Future Start Date Guard | `publish_requires_future_start` trigger block | **SATISFIED** |
| **`W58`** | Publish Post Existence Guard | `publish_requires_post` trigger block | **SATISFIED** |
| **`W59`** | Event Role Post Creation | `create_event_post()`, initial status `'open'` | **SATISFIED** |
| **`W60`** | Event Role Post Modification | `update_event_post()`, respects headcount floor | **SATISFIED** |
| **`W61`** | Event Role Post Closure | `close_event_post()`, transitions status to `'closed'` | **SATISFIED** |
| **`W62`** | Live Post Capacity Reading | `get_event_posts_with_capacity()` reads `v_event_post_capacity` | **SATISFIED** |
| **`W63`** | Post Event Immutability | Post cannot change `event_id` (trigger-enforced) | **SATISFIED** |
| **`W124`**| Onboarding Text Version Bump | Changing `onboarding_text` auto-bumps `onboarding_version` | **SATISFIED** |

---

## 7. Conclusion & Next Steps

Phase 5 has been executed with exceptional architectural rigor, database-first alignment, and zero SQL modifications.

**Pending User Confirmation:**  
In adherence to the review protocol, **no files have been modified yet**. Awaiting user approval to apply recommended transaction wrapping and deduplication before proceeding to the Phase 5 Testing Prompt.

