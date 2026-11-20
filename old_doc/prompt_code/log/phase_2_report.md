# Phase 2 Summary Log: Backend Service & Serializer Payload Completeness

**Date:** 2026-11-17  
**Version:** v0.11.0  
**Phase:** Phase 2 (Backend Service & Serializer Payload Completeness)  
**Main Reference Document:** `reference/v0_11_0_volunteer_coordinator_capability_parity_plan.md`

---

## 1. Executive Summary
In Phase 2, the Django service return dictionaries and BFF response serializers in `backend/services/` and `backend/bff/` were systematically updated to return complete, truthful database values. This eliminates the need for mobile clients to fabricate default values, guess event locations, or substitute IDs.

All T0–T4 data privacy boundaries were strictly enforced:
- T2 volunteer capability profiles are only exposed for accepted applicants and authorized event managers.
- T3 contact details (`emergency_contact_phone`, `phone`, `blood_type`) and T4 identifiers (`phone_hash`, raw GPS fixes) are never leaked in coordinator application, roster, or self-service attendance payloads.

Zero SQL migrations or modifications were made to `postgres_sql/updated_volunteer_coordination_system_Database.sql` (100% immutable). Zero modifications were made to `mobile/` code.

All 674 tests across the backend test suite pass cleanly (`Ran 674 tests in 37.268s. OK`).

---

## 2. Capabilities Implemented & Payloads Completed

### 2.1. C-19 / C-27 / P0-05: Complete T2 Volunteer Profile in Coordinator Applications & Unassigned Lists
- **Application Service (`backend/services/application_service.py`):**
  - In `get_event_applications(actor, event_id, status_filter=None)`, expanded the `"accepted"` applicant block to project the complete T2 profile from `app.user`:
    - `uuid`: `str(u.uuid) if u.uuid else None`
    - `skills`: `list(u.skills or [])`
    - `physical_ok`: `u.physical_ok`
    - `good_eyesight`: `u.good_eyesight`
    - `needs_glasses`: `u.needs_glasses`
    - `can_lift_heavy`: `u.can_lift_heavy`
    - `can_work_outdoor`: `u.can_work_outdoor`
    - `has_leader_experience`: `u.has_leader_experience`
    - `new_to_volunteer`: `u.new_to_volunteer`
    - `preferred_language`: `u.preferred_language`
    - `home_area`: `u.home_area`
    - `needs_meal_support`: `u.needs_meal_support`
    - `needs_travel_support`: `u.needs_travel_support`
    - `accepts_unpaid`: `u.accepts_unpaid`
    - `verification_status`: `u.verification_status`
  - Added `"note": app.note` on all application items.
  - T1 applications (pending, rejected, waitlisted) strictly omit T2 fields.
- **Unassigned Accepted Service (`backend/services/assignment_service.py`):**
  - Updated `get_unassigned_accepted(actor, event_id)` to join `users` with `v_accepted_unassigned`, enriching the unassigned pool with complete T2 volunteer profile capabilities for manual assignment decisions.
- **Serializer (`backend/bff/coordinator/serializers.py`):**
  - Updated `CoordinatorApplicationListSerializer` declaring all optional T2 capability fields and `note`.

### 2.2. C-25 / C-26 / V-28 / P0-03 / P0-04: Truthful Assignment Payloads
- **Assignment Service (`backend/services/assignment_service.py`):**
  - In `get_event_assignments(actor, event_id)` (coordinator view), added:
    - `"application_id": a.application_id`
    - `"event_id": a.event_id`
    - `"event_title": event.title`
    - `"assigned_at": getattr(a, "assigned_at", getattr(a, "created_at", None))`
  - In `get_own_assignments(user, event_id=None)` (volunteer view), added:
    - `"application_id": a.application_id`
    - `"location_name": a.event.location_name`
    - `"assigned_at": getattr(a, "assigned_at", getattr(a, "created_at", None))`
    - Batched prefetch for user attendance rows to include truthful `"attendance_id"` and `"attendance_status"`.
- **Serializers:**
  - `CoordinatorAssignmentListSerializer` in `coordinator/serializers.py`: updated with `application_id`, `event_id`, `event_title`, and `assigned_at`.
  - `VolunteerAssignmentListSerializer` in `volunteer/serializers.py`: updated with `application_id`, `location_name`, `assigned_at`, `attendance_id`, and `attendance_status`.

### 2.3. C-04 / P2-05: Coordinator Managed Events List Metadata Enrichment
- **Event Service (`backend/services/event_service.py`):**
  - In `list_coordinator_events(user)`, added `.select_related("current_coordinator__user")` and `.prefetch_related("charity_fields")`.
  - Enriched event dictionaries with:
    - `description`: `event.description`
    - `purpose_type`: `event.purpose_type`
    - `location_name`: `event.location_name`
    - `landmark_text`: `event.landmark_text`
    - `coordinator_name`: resolved display name from current coordinator
    - `charity_fields`: list of assigned charity field codes
- **Serializer (`backend/bff/coordinator/serializers.py`):**
  - Updated `EventListSerializer` to include `description`, `purpose_type`, `location_name`, `landmark_text`, `coordinator_name`, and `charity_fields`.

### 2.4. V-38 / P1-14: Enriched and Privacy-Sanitized Volunteer Attendance History
- **Attendance Service (`backend/services/attendance_service.py`):**
  - Updated `get_user_attendance_history(user)` with `.select_related("event", "assignment", "assignment__post")`.
  - Enriched returned dictionaries with:
    - `"assignment_id": att.assignment_id`
    - `"event_title": att.event.title if att.event else None`
    - `"location_name": att.event.location_name if att.event else None`
    - `"post_id": att.assignment.post_id if att.assignment else None`
    - `"post_title": att.assignment.post.title if (att.assignment and att.assignment.post) else None`
    - `"schedule_start": att.event.start_at if att.event else None`
    - `"schedule_end": att.event.end_at if att.event else None`
  - Strictly verified that raw GPS fixes (`latitude`, `longitude`, `accuracy_m`) remain completely excluded per `BR-PRIV-T4`.

### 2.5. V-03 / W159: PublicEventDetailView Draft Preview Fallback
- **View (`backend/bff/volunteer/views.py`):**
  - In `PublicEventDetailView.get()`, fixed coordinator display name fallback resolution for managers previewing draft/cancelled events.
  - Included `require_onboarding_ack` and `qr_registration_enabled` in `base_data` and serializer response payload.
- **Serializer (`backend/bff/volunteer/serializers.py`):**
  - Updated `PublicEventDetailSerializer` to declare `require_onboarding_ack` and `qr_registration_enabled`.

---

## 3. Test & Verification Summary

### 3.1. Phase 2 Targeted Test Suite (`backend/apps/events/tests/test_bff_phase2_parity.py`)
- Created 7 dedicated tests:
  1. `test_coordinator_application_list_contains_complete_t2_for_accepted`: verifies all 15 T2 profile fields, `note`, and absence of T3/T4 leaks.
  2. `test_coordinator_application_list_conceals_t2_for_pending_applications`: verifies T2 fields are omitted for pending applicants.
  3. `test_unassigned_accepted_service_enriches_t2_profile`: verifies unassigned accepted volunteer pool has complete T2 data.
  4. `test_coordinator_and_volunteer_assignments_include_truthful_fields`: verifies assignment payloads in both coordinator and volunteer BFF endpoints (`application_id`, `assigned_at`, `location_name`, `attendance_id`, `attendance_status`).
  5. `test_coordinator_events_list_metadata_enrichment`: verifies metadata fields on managed events (`description`, `purpose_type`, `location_name`, `landmark_text`, `coordinator_name`, `charity_fields`).
  6. `test_volunteer_attendance_history_enrichment_and_privacy`: verifies enriched attendance history and strict omission of raw coordinates.
  7. `test_public_event_detail_preview_draft_fallback`: verifies draft preview with `coordinator_name`, `require_onboarding_ack`, and `qr_registration_enabled`.
- **Result:** `Ran 7 tests in 0.326s. OK`

### 3.2. Phase 1 Verification Suite (`backend/apps/events/tests/test_bff_phase1_parity.py`)
- **Result:** `Ran 15 tests in 0.356s. OK`

### 3.3. Full Backend Test Suite
- Executed `python manage.py test --keepdb` across the entire backend.
- **Result:** `Ran 674 tests in 37.268s. OK` (0 failures, 0 errors).

### 3.4. OpenAPI Schema Sync
- Regenerated OpenAPI schema via `manage.py spectacular --file schema.yml`.
- All enriched fields verified in `backend/schema.yml`.

---

## 4. Cumulative Affected File Tracking
Tracked and de-duplicated in `reference/effected_path_v0_11_0.txt`:
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\apps\events\tests\test_bff_phase1_parity.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\apps\events\tests\test_bff_phase2_parity.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\checkin\views.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\coordinator\serializers.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\coordinator\urls.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\coordinator\views.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\volunteer\serializers.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\volunteer\urls.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\bff\volunteer\views.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\config\test_runner.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\schema.yml`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\services\application_service.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\services\assignment_service.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\services\attendance_service.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\services\audit_service.py`
- `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack\backend\services\event_service.py`
