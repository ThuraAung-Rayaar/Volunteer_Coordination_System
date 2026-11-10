# Phase 6 Implementation Review: Recruitment Applications & Smart Assignment Engine

**Review Date:** 2026-11-05  
**Reviewer:** Senior Django & PostgreSQL Code Reviewer  
**Feature / Service:** Phase 6: Recruitment Applications & Smart Assignment Engine (`backend/services/application_service.py`, `backend/services/assignment_service.py`, `backend/bff/volunteer/`, `backend/bff/coordinator/`)  
**Status:** **REVIEWED — CORRECTIONS RECOMMENDED**

---

## 1. Overall Assessment

Phase 6 implements the recruitment applications and smart assignment engine spanning Domain 8 (Recruitment Applications) and Domain 9 (Smart Assignment Engine), covering Business Rules `W64`–`W95`.

The core architecture correctly adheres to the "Database-First" design philosophy:
- Heavy algorithmic matching logic (`run_auto_assignment`, `assign_manually`, `create_assignment_from_application`) lives entirely inside PostgreSQL stored procedures. Python services do not reimplement matching algorithms, capacity math, or scheduling checks.
- Hard data constraints (`uq_event_application_active`, `uq_assignment_active`, `uq_assignment_application`, `ex_assignments_no_overlap`) are strictly enforced by the PostgreSQL schema and triggers.
- Privacy tiers (`BR-PRIV-T1`, `BR-PRIV-T2`) are properly respected: `get_event_applications()` conceals private volunteer data for pending/rejected applicants (T1 minimal), while disclosing operational capability data (`skills`, `physical_ok`, `can_lift_heavy`, etc.) strictly to event coordinators for accepted applicants (T2).
- Masked 404 access control (`ResourceMaskedNotFound`) prevents enumeration of applications and event rosters by unauthorized volunteers.

However, several architectural and reliability issues require correction before Gate P6 sign-off:
1. **Missing Transaction Boundaries (`HIGH`)**: Mutating domain functions in `application_service.py` and `assignment_service.py` lack `@transaction.atomic` decorators.
2. **Missing Coordinator Invite Flow (`HIGH`)**: `invite_volunteer_to_event()` specified in Step P6.1 is not implemented, and `apply_to_event(..., source="invite")` mistakenly sets the manager as the applicant instead of the invited volunteer.
3. **Spec Route Aliases (`MEDIUM`)**: The implementation plan specifies alternate routes (`/assignments/auto-run/`, `/assignments/manual/`) that should be provided alongside current routes for seamless spec compliance.
4. **Test Sequence Collisions & Missing Test Layers (`MEDIUM`)**: `test_phase6.py` uses a static sequence offset (`_phone_seq`) prone to collision on repeated test runs. In addition, the phase lacks dedicated unit, service, trigger, and BFF test modules comparable to Phases 3–5.

---

## 2. Findings by Severity

### CRITICAL (0 Findings)
*No critical security vulnerabilities or schema violations found.*

---

### HIGH (2 Findings)

#### [H-01] Missing Transaction Boundaries (`@transaction.atomic`) on Mutating Service Functions
* **Affected Files:**
  * [`backend/services/application_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/application_service.py)
  * [`backend/services/assignment_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/assignment_service.py)
* **Details:**
  None of the mutating functions in `application_service.py` (`apply_to_event`, `withdraw_application`, `_decide_application`) or `assignment_service.py` (`run_event_auto_assignment`, `assign_volunteer_manually`, `create_assignment_from_accepted`, `confirm_assignment`, `cancel_assignment`) are wrapped in `@transaction.atomic`.
* **Impact:**
  PostgreSQL triggers execute complex cascading operations upon INSERT and UPDATE (e.g. `trg_50_applications_after` automatically triggers `create_assignment_from_application`; `withdraw_application` cascades cancellation to active assignments and attendance). In `run_event_auto_assignment()`, the service executes the SQL procedure and then queries statistics across multiple tables. Without explicit `@transaction.atomic`, exceptions raised midway can leave the database connection uncommitted or in inconsistent savepoint states outside an atomic block.
* **Recommended Correction:**
  Wrap all mutating service functions with `@transaction.atomic`.

---

#### [H-02] Incomplete Coordinator Invite Workflow (`invite_volunteer_to_event`)
* **Affected File:** [`backend/services/application_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/application_service.py)
* **Details:**
  The implementation plan specifies `invite_volunteer_to_event(actor, event_id, volunteer_user_id, post_id=None, note="")`. In the current `apply_to_event()` implementation:
  ```python
  if source == "invite":
      get_event_for_manager_or_404(user, event_id, require_write=True)
  app = EventApplications(..., user=user, source=source)
  ```
  Here, `user` is both the actor verified as manager and the applicant created in `EventApplications`. As a result, the coordinator invites *themselves* rather than the target volunteer.
* **Impact:**
  Coordinators cannot invite volunteers to events (`W64`).
* **Recommended Correction:**
  Implement `invite_volunteer_to_event(actor, event_id, volunteer_user_id, post_id=None, note="")`:
  1. Validate `actor` has manager write permissions (`get_event_for_manager_or_404(actor, event_id, require_write=True)`).
  2. Resolve target volunteer from `volunteer_user_id`.
  3. Create `EventApplications(event_id=event_id, user=volunteer, post_id=post_id, source="invite", note=note)`.

---

### MEDIUM (2 Findings)

#### [M-01] Missing Specification Endpoint Aliases in Coordinator BFF
* **Affected Files:**
  * [`backend/bff/coordinator/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/coordinator/urls.py)
  * [`backend/bff/coordinator/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/coordinator/views.py)
* **Details:**
  The step-by-step specification indicates endpoints:
  - `POST /api/v1/events/{id}/assignments/auto-run/`
  - `POST /api/v1/events/{id}/assignments/manual/`
  - `POST /api/v1/applications/{id}/accept/`, `POST /api/v1/applications/{id}/reject/`, `POST /api/v1/applications/{id}/waitlist/`
  Currently, the coordinator BFF mounts `/auto-assign/` and `/manual-assign/`, and decision actions use a regex parameter `<str:action>`.
* **Recommended Correction:**
  Add URL path aliases in `bff/coordinator/urls.py` and `bff/coordinator/views.py` so both URL variants resolve cleanly.

---

#### [M-02] Static Phone Number Sequences in Test Suite
* **Affected File:** [`backend/apps/events/tests/test_phase6.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase6.py)
* **Details:**
  `test_phase6.py` generates phones via `_phone_seq = 0`. Repeated executions with `--keepdb` or alongside other test suites can trigger `uq_users_phone_hash` unique constraint collisions.
* **Recommended Correction:**
  Update telephone generation to `secrets.randbelow(900000000) + 100000000`.

---

### LOW (1 Finding)

#### [L-01] Export Definitions & Polish
* **Affected Files:**
  - [`backend/services/application_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/application_service.py)
  - [`backend/services/assignment_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/assignment_service.py)
* **Details:**
  Define explicit `__all__` symbols in `application_service.py` and `assignment_service.py` to clarify the public domain boundary.

---

## 3. Exact Affected Files

| File Path | Description of Changes Required |
| :--- | :--- |
| [`backend/services/application_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/application_service.py) | Add `@transaction.atomic` to mutating operations; add `invite_volunteer_to_event()`. |
| [`backend/services/assignment_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/assignment_service.py) | Add `@transaction.atomic` to `run_event_auto_assignment`, `assign_volunteer_manually`, `create_assignment_from_accepted`, `confirm_assignment`, `cancel_assignment`. |
| [`backend/bff/coordinator/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/coordinator/views.py) | Add view aliases for auto-run and manual assignments. |
| [`backend/bff/coordinator/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/coordinator/urls.py) | Add URL pattern aliases for `/assignments/auto-run/` and `/assignments/manual/`. |
| [`backend/apps/events/tests/test_phase6.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/events/tests/test_phase6.py) | Replace static `_phone_seq` with `secrets.randbelow()`. |

---

## 4. Recommended Corrections

1. **Decorate Services with `@transaction.atomic`:**
   In `application_service.py` and `assignment_service.py`, import `from django.db import transaction` and decorate all state-mutating functions.
2. **Implement `invite_volunteer_to_event`:**
   Add `invite_volunteer_to_event(actor, event_id: int, volunteer_user_id: int, post_id: Optional[int] = None, note: str = "") -> EventApplications` in `application_service.py`.
3. **Add BFF Route Aliases:**
   Support both `/events/{id}/auto-assign/` and `/events/{id}/assignments/auto-run/`, as well as `/events/{id}/manual-assign/` and `/events/{id}/assignments/manual/`.
4. **Develop Comprehensive Test Suite:**
   Create 4 dedicated test modules mirroring the structure of Phase 5:
   - `test_unit_applications_assignments.py`
   - `test_services_application_assignment_phase6.py`
   - `test_db_triggers_phase6.py`
   - `test_bff_recruitment_assignment_phase6.py`

---

## 5. Missing Tests

The current suite only contains 28 tests in `test_phase6.py`. The following test coverage must be added:

1. **Unit Tests (`test_unit_applications_assignments.py`):**
   - Serializer validation for `ApplicationSubmitSerializer` (valid choices, empty notes, post bounds).
   - Serializer validation for `ManualAssignSerializer` (required application ID, group code limits).
   - Serializer validation for `AssignmentCancelSerializer`.
2. **Service Tests (`test_services_application_assignment_phase6.py`):**
   - `apply_to_event` browse, QR walk-in, and invite workflows.
   - `invite_volunteer_to_event` coordinator workflow and permission verification.
   - `withdraw_application` cascade cancellation to active assignments.
   - `run_event_auto_assignment` execution and result payload counts.
   - `assign_volunteer_manually` placing and re-assigning volunteers.
   - `confirm_assignment` self-only confirmation vs third-party rejection.
   - `cancel_assignment` volunteer vs manager authorization.
   - Rollback verification under simulated failure.
3. **Database Trigger Tests (`test_db_triggers_phase6.py`):**
   - Direct execution of `run_auto_assignment`, `assign_manually`, `create_assignment_from_application`.
   - `trg_01_applications_before_insert`: event lock, deadline gate, account status gate, schedule conflict, `uq_event_application_active`.
   - `trg_01_applications_before_update`: immutability checks, status transitions, manager checks, capacity gate.
   - `trg_50_applications_after`: auto-assignment cascade, withdrawal cancellation cascade.
   - `trg_01_assignments_before_insert`: accepted application gate, open post gate.
   - `trg_01_assignments_before_update`: immutability checks, self-confirmation check.
   - PostgreSQL EXCLUDE constraint `ex_assignments_no_overlap` testing overlapping shift rejection.
   - Operational views: `v_accepted_unassigned`, `v_event_post_capacity`.
4. **BFF Integration Tests (`test_bff_recruitment_assignment_phase6.py`):**
   - Volunteer endpoints: `POST /apply/`, `GET /me/applications/`, `POST /withdraw/`, `GET /me/assignments/`, `POST /confirm/`, `POST /cancel/`.
   - Coordinator endpoints: `GET /applications/` (T1 minimal vs T2 capability privacy tiers), `POST /accept/`, `/reject/`, `/waitlist/`, `POST /auto-assign/`, `POST /manual-assign/`, `GET /assignments/`, `GET /unassigned/`.
   - Unauthenticated 401 and unauthorized 403 checks across all endpoints.

---

## 6. Acceptance Criteria Assessment

| Acceptance Requirement | Status | Notes |
| :--- | :---: | :--- |
| Volunteer browse application submission (`W64`) | ✅ Met | Verified in `test_phase6.py` |
| Coordinator invite submission (`W64`) | ⚠️ Partial | Needs dedicated `invite_volunteer_to_event()` |
| Duplicate active application guard (`W65`) | ✅ Met | Enforced by `uq_event_application_active` |
| Volunteer self-withdrawal (`W66`–`W68`) | ✅ Met | Cascades cancellation to active assignments |
| Coordinator decision engine (`W69`–`W75`) | ✅ Met | Supports accept, reject, waitlist with capacity checks |
| Privacy tiers T1/T2 for applications (`W71`) | ✅ Met | T2 data restricted strictly to accepted volunteers |
| Automatic smart assignment (`W80`–`W85`) | ✅ Met | Strictly delegates to PostgreSQL `run_auto_assignment()` |
| Manual assignment by coordinator (`W86`–`W90`) | ✅ Met | Strictly delegates to PostgreSQL `assign_manually()` |
| Volunteer shift confirmation (`W91`) | ✅ Met | Enforces self-only confirmation |
| Shift cancellation (`W92`) | ✅ Met | Volunteer and manager paths supported |
| Overlapping shift conflict rejection (`W94`–`W95`) | ✅ Met | Enforced by SQL triggers and `ex_assignments_no_overlap` |
| Transaction atomicity boundaries | ⚠️ Partial | Missing `@transaction.atomic` decorators |
| Complete test coverage | ⚠️ Incomplete | Currently 28 tests; requires expansion to ~70+ tests across all 4 layers |

**Final Verdict:** The implementation strongly reflects the database-first architecture and passes baseline tests, but requires transaction boundaries, the coordinator invite function, route aliases, and the full multi-tier test suite.

*Awaiting your approval before applying corrections and expanding tests.*

