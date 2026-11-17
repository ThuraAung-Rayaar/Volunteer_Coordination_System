# Phase 0 Baseline Freeze, SQL v0.5.2 Verification & 82-Capability Ledger
**Document ID:** `DOC-BL-v0.11.0-PHASE-0`  
**Milestone Version:** `v0.11.0`  
**Status:** COMPLETE / FROZEN  
**Audit Date:** 17 November 2026  
**Reference Document:** `reference/v0_11_0_volunteer_coordinator_capability_parity_plan.md`  
**Sole Database Authority:** `postgres_sql/updated_volunteer_coordination_system_Database.sql` (Unified PostgreSQL Schema v0.5.2)  

---

## 1. Git & SQL v0.5.2 Baseline Verification

### 1.1 Git Baseline State
- **Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`
- **Current Checked-Out Branch:** `mobile`
- **Audited Commit HEAD:** `442b82220f3baf961fa52d6a14b58f43e40530da` (`Updates 17/11/26`)
- **Main Branch Target Reference:** `65ed6d34f8c7a365a63dd616973bffeb61d165b0` (`Merge branch 'mobile'`)
- **Working Tree Integrity:** Zero application code, Django backend code, mobile TypeScript files, or SQL database definitions have been modified in Phase 0.

### 1.2 Database Version Discrepancy Resolution & Schema Immutability
- **Sole Source of Truth:** `postgres_sql/updated_volunteer_coordination_system_Database.sql`
- **Declared Schema Version:** `Unified PostgreSQL Schema v0.5.2 (Database-First)`
- **Target Engine:** `PostgreSQL 14+ (with btree_gist)`
- **Architecture Model:** `Option A (Coordinator FKs -> coordinator_profiles.user_id)`
- **Version Discrepancy Resolution:** Various backend documentation and DRF spectacular settings refer to `v0.6.0`, and top-level README documents cite legacy object counts. This Phase 0 baseline officially resolves and confirms that the checked-in SQL file `postgres_sql/updated_volunteer_coordination_system_Database.sql` is the **sole authoritative schema source of truth** and represents **Schema v0.5.2**.
- **Immutability Guarantee:** The PostgreSQL schema file is **100% IMMUTABLE**. No SQL edits, migrations, or database alterations are authorized or performed.

### 1.3 Verified Database Schema Inventory (22 Tables, 11 Views)

#### Tables (22 Total)
1. `app_settings` — Operational parameters (OTP rates, geofence radius/accuracy, fix age thresholds).
2. `charity_fields` — Controlled taxonomy of charity and volunteer activity categories.
3. `users` — Core account identity, public UUID, phone hashes, capability flags, and support preferences.
4. `user_charity_interests` — Volunteer interest associations to charity taxonomy.
5. `volunteer_availability_rules` — Weekly recurring volunteer availability schedules.
6. `volunteer_availability_exceptions` — Date-specific blackout or special availability slots.
7. `coordinator_profiles` — Coordinator application lifecycle, status, and approval tracking.
8. `user_verification_images` — Identity verification photo submissions and review status.
9. `auth_otp` — OTP token generation, attempts, expiry, and rate limiting.
10. `events` — Event declarations, schedules, geofences, ownership, and coordination state.
11. `event_coordinator_history` — Append-only audit record of coordinator handovers and retakes.
12. `event_charity_fields` — Many-to-many relationship linking events to charity fields.
13. `event_posts` — Event roles, required headcount, priority, and physical/skill requirements.
14. `qr_tokens` — Purpose-specific, hashed, expiring, and usage-limited QR tokens.
15. `event_applications` — Volunteer applications across browse, walk-in, and invitation channels.
16. `assignments` — Allocation of accepted applications to event roles, groups, and shifts.
17. `attendance` — Check-in, checkout, and attendance confirmation records.
18. `attendance_geo_attempts` — Tamper-resistant append-only GPS telemetry and fraud audit trail.
19. `onboarding_acknowledgments` — Versioned, append-only volunteer safety and briefing sign-offs.
20. `feedback` — Multi-directional rating and review records (volunteer-to-event, volunteer-to-coordinator, coordinator-to-volunteer).
21. `moderation_actions` — Administrative moderation actions, flags, and account status updates.
22. `audit_logs` — Immutable system audit log records.

#### Views (11 Total)
1. `v_event_post_capacity` — Post-level capacity metrics (`headcount_needed`, `assigned_count`, `remaining_capacity`).
2. `v_public_events` — Sanitized public event discovery view with open post counts and status filters.
3. `v_event_summary` — Aggregated event KPIs (application counts, accepted counts, assigned counts, checked-in counts).
4. `v_accepted_unassigned` — Accepted applicants pending role/shift assignment.
5. `v_event_checkin_board` — Real-time event check-in and attendance monitoring board.
6. `v_event_checkin_status` — Live summary counts of checked-in vs total expected volunteers.
7. `v_pending_confirmations` — Queue of geo check-in attempts awaiting coordinator confirmation.
8. `v_geo_attempts_review` — Geofence evaluation telemetry and review audit for coordinators.
9. `v_event_coordinator_history` — Chronological history of event coordinators and delegation.
10. `v_user_moderation_summary` — User moderation summary, active strikes, and block states.
11. `v_admin_dashboard` — High-level administrative metrics across users, events, and verifications.

---

### 1.4 Test Suite & Quality Verification Results

| Verification Suite | Target Directory | Command Executed | Result | Notes |
|---|---|---|---|---|
| **Mobile TypeScript** | `mobile/` | `cd mobile && npx tsc --noEmit` | **PASS (0 Errors)** | TypeScript 5.0+ compilation clean across all screens, mappers, DTOs, and endpoints. |
| **Mobile Jest Tests** | `mobile/` | `cd mobile && npm test -- --watchAll=false` | **PASS (28 Suites, 367 Tests)** | 28/28 suites passed, 367/367 tests passed, 0 failures, 0 snapshots, duration: 37.53s. |
| **Backend Apps Tests** | `backend/` | `manage.py test apps --testrunner=...DiscoverRunner --keepdb` | **PASS (553 Tests)** | All 553 domain, service, trigger, and API tests passed without regression (duration: 26.55s). |
| **Backend Common Tests**| `backend/` | `manage.py test common.tests --testrunner=...DiscoverRunner --keepdb` | **PASS (81 Tests)** | Infrastructure, middleware, and authentication tests passed (duration: 7.61s). |
| **Backend E2E & BFF** | `backend/` | `manage.py test tests_e2e bff.volunteer.tests --testrunner=...DiscoverRunner --keepdb` | **PASS (18 Tests)** | End-to-end lifecycle and volunteer BFF tests passed (duration: 2.82s). |
| **Total Backend Tests** | `backend/` | Aggregated Python Test Execution | **PASS (652 Tests Total)** | 652/652 passed cleanly against local PostgreSQL engine. |
| **OpenAPI Schema Generation** | `backend/` | `manage.py spectacular --file schema.yml` | **PASS (Exit 0)** | Live schema generator runs cleanly; confirms drf-spectacular compatibility. |

> [!NOTE]
> Backend `config/test_runner.py` currently looks for `Path(settings.BASE_DIR).parent / "postgres sql"` (with a space) rather than `"postgres_sql"`. Running `manage.py test` with `--testrunner=django.test.runner.DiscoverRunner --keepdb` successfully discovered and ran all 652 tests. The runner path string fix is documented in Section 4 as a P2 remediation item.

---

## 2. Complete 43 Volunteer Capabilities Ledger (`V-01` through `V-43`)

| ID | Capability Name | DB Object / Function | Django Service | BFF Route & Method | Mobile Endpoint Client | DTO & Mapper | Repository Contract | Current Gap & Remediation Need |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **V-01** | Request OTP | `auth_otp`, `request_otp()`, rate triggers | `auth_service.request_login_otp` | `POST /api/v1/auth/otp/request/` | `authApi.requestOtp` | `OtpRequestDto`, `OtpResponseDto` | Handled via `UserContext` / `authSession` | Console SMS adapter used in development; delivery status semantics need alignment for production SMS. |
| **V-02** | Verify OTP & create session | `verify_otp()`, `users`, `authtoken_token` | `auth_service.verify_login_otp` | `POST /api/v1/auth/otp/verify/` | `authApi.verifyOtp` | `OtpVerifyRequestDto`, `AuthTokenResponseDto` | `tokenStore.ts`, `sessionManager.ts` | Session falls back to `MemoryTokenStore` because AsyncStorage is not installed; no Keystore/Keychain backing. |
| **V-03** | Logout / revoke token | `authtoken_token` (DRF delete) | `auth_service.logout_user` | `POST /api/v1/auth/logout/` | `authApi.logout` | `LogoutResponseDto` | `tokenStore.ts` / `UserContext` | Verify server revocation and cold-start purge synchronization. |
| **V-04** | Read own profile | `users` table | `profile_service.get_user_profile` | `GET /api/v1/me/` | `profileApi.getProfile` | `UserProfileDto`, `mapUserProfile` | `ProfileRepository.getProfile()` | **Defect:** `profileMapper.ts` maps `phone` to `email`; `VolunteerProfile` lacks first-class `phone` field. |
| **V-05** | Update own profile | `users` table allow-list & update triggers | `profile_service.update_user_profile` | `PATCH /api/v1/me/` | `profileApi.updateProfile` | `ProfileUpdateRequestDto`, `mapProfileUpdateToRequest` | `ProfileRepository.updateProfile()` | `is_willing_to_donate` master flag vs sub-flags (`blood`, `items`) not modeled coherently; partial patch does not merge state. |
| **V-06** | Manage charity interests | `user_charity_interests`, `charity_fields` | `profile_service.replace_charity_interests` | `GET/PUT /api/v1/me/charity-interests/` | `profileApi.getCharityInterests`, `setCharityInterests` | `CharityInterestsResponseDto`, `CharityInterestsReplaceRequestDto` | Handled in profile repository | Endpoints exist, but replacement semantics and error handling are not explicitly exposed in `ProfileRepository`. |
| **V-07** | Read weekly availability | `volunteer_availability_rules` | `availability_service.get_user_availability` | `GET /api/v1/me/availability/` | `profileApi.getAvailability` | `AvailabilityResponseDto`, `mapAvailability` | `ProfileRepository.getAvailability()` | Time string normalization ("08:00:00" vs "08:00"); ensure weekday/time nullability is mapped cleanly. |
| **V-08** | Replace weekly availability rules | `volunteer_availability_rules`, triggers | `availability_service.set_weekly_availability_rules` | `POST /api/v1/me/availability/rules/` | `profileApi.replaceAvailabilityRules` | `AvailabilityRulesReplaceDto`, `mapWeeklyRuleToDto` | `ProfileRepository.saveWeeklyRule()` | Contract saves rules individually rather than exposing atomic full-set replacement supported by backend POST. |
| **V-09** | Upsert date exception | `volunteer_availability_exceptions` | `availability_service.upsert_availability_exception` | `POST /api/v1/me/availability/exceptions/` | `profileApi.upsertAvailabilityException` | `AvailabilityExceptionDto`, `mapException` | `ProfileRepository.saveException()` | Server-generated exception ID must be preserved; mock currently uses client string IDs. |
| **V-10** | Delete date exception | `volunteer_availability_exceptions` | `availability_service.delete_availability_exception` | `DELETE /api/v1/me/availability/exceptions/{id}/` | `profileApi.deleteAvailabilityException` | Primitive `{success: boolean}` | `ProfileRepository.deleteException()` | Ensure numeric exception ID mapping and owner-scoped delete verification. |
| **V-11** | Check availability for an event | `is_user_available()`, `user_has_schedule_conflict()` | `application_service.check_user_availability_for_event` | `GET /api/v1/me/availability/check/?event_id={id}` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, mapper, or repository contract method. |
| **V-12** | Check proposed date/time window | `is_user_available()`, `user_has_schedule_conflict()` | `availability_service.check_user_availability` | `POST /api/v1/me/availability/check/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, mapper, or repository contract method. |
| **V-13** | Upload verification image | `user_verification_images`, `recompute_user_verification()` | `verification_service.upload_verification_image` | `POST /api/v1/me/verification-images/` (multipart) | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** Multipart upload route exists, but mobile has no client method, multipart DTO, or repository method. |
| **V-14** | Read verification status/history | `user_verification_images`, `recompute_user_verification()` | `verification_service.get_verification_status` | `GET /api/v1/me/verification-images/` | `profileApi.getVerificationStatus` | `VerificationStatusResponseDto`, `mapVerificationData` | `ProfileRepository.getVerificationStatus()` | DTO image list fields (`rejection_reason`, `uploaded_at`) need exact alignment with DB columns. |
| **V-15** | Submit coordinator application | `coordinator_profiles`, insert trigger | `coordinator_service.apply_for_coordinator` | `POST /api/v1/me/coordinator/` | `profileApi.applyForCoordinator` | `CoordinatorApplyRequestDto`, `CoordinatorProfileEnvelopeDto` | `ProfileRepository.submitCoordinatorApplication()` | Client must return typed profile result and not gate submission on local calculations; DB remains authoritative. |
| **V-16** | Read coordinator application status | `coordinator_profiles` | `coordinator_service.get_coordinator_profile` | `GET /api/v1/me/coordinator/` | `profileApi.getCoordinatorProfile` | `CoordinatorProfileEnvelopeDto` | Composed in `ProfileRepository.getVerificationStatus()` | Separate coordinator profile into an explicit standalone domain model instead of embedding inside `VolunteerProfile`. |
| **V-17** | Update pending coordinator application notes | `coordinator_profiles.notes` | `coordinator_service.update_coordinator_application` | `PATCH /api/v1/me/coordinator/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF PATCH endpoint exists, but mobile has no endpoint client, DTO, or repository contract method. |
| **V-18** | Lookup person by public UUID | `users.uuid`, T1/T2 privacy rules | `profile_service.lookup_user_by_uuid` | `GET /api/v1/users/by-uuid/{uuid}/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, or repository method to lookup public UUID cards. |
| **V-19** | Browse active charity taxonomy | `charity_fields` (`is_active = true`) | `query_service.list_active_charity_fields` | `GET /api/v1/charity-fields/` | `eventApi.getCharityFields` | Array of `{code, label, sort_order}` | `EventRepository.getCharityFields?()` | Make method required (non-optional) in `EventRepository`; enforce runtime server taxonomy over static lists. |
| **V-20** | Browse/search/filter public events | `v_public_events`, `query_service` | `query_service.list_public_events` | `GET /api/v1/events/` (paginated) | `eventApi.getEvents` | `PaginatedResponseDto<EventListItemDto>`, `mapEventSummary` | `EventRepository.getEvents(filters)` | `HttpEventRepository` reads only first page (`page=1`); pagination continuation (`next`/cursor) is missing. |
| **V-21** | View event detail | `events`, `v_public_events`, privacy | `query_service.get_public_event` | `GET /api/v1/events/{id}/` | `eventApi.getEventDetail` | `EventDetailDto`, `mapEventDetail` | `EventRepository.getEventById(id)` | Ensure nullable fields (compensation note, landmark, onboarding text) are preserved cleanly without fabrication. |
| **V-22** | View event posts & capacity | `event_posts`, `v_event_post_capacity` | `event_post_service.get_event_posts_with_capacity` | `GET /api/v1/events/{id}/posts/` | `eventApi.getEventPosts` | `EventPostDto[]`, `mapEventPost` | Composed in `getEventById` | Capacity must strictly be read from server; never recompute authoritative capacity on mobile client. |
| **V-23** | Apply to selected event post | `event_applications`, trigger guards | `application_service.apply_to_event` | `POST /api/v1/events/{id}/apply/` | `eventApi.applyToEvent` | `EventApplyRequestDto`, `EventApplyResponseDto` | `EventRepository.applyToPost()` | Map actual server response status (`pending`, `accepted`, `waitlisted`); do not default to UI-only `applied`. |
| **V-24** | Join through invite source | `event_applications` (`source = 'invite'`) | `application_service.invite_volunteer_to_event` | No separate invite route | Handled via applications | `VolunteerApplicationDto` | `EventRepository.getUserApplications()` | Invited applications surface in `me/applications/`; clarify if explicit volunteer accept action is needed. |
| **V-25** | Join through QR walk-in | `qr_tokens`, `qr_walkin_apply()` | `qr_service.redeem_qr_token` | `POST /api/v1/checkin/qr/redeem/` | `checkinApi.redeemQrToken` | `QrRedeemRequestDto`, `QrRedeemResponseDto` | `EventRepository.redeemQrToken?()` | Discriminate QR purpose (`walkin_registration` vs `checkin`); handle duplicate scan error gracefully. |
| **V-26** | View own applications | `event_applications` | `application_service.get_own_applications` | `GET /api/v1/me/applications/` | `eventApi.getMyApplications` | `VolunteerApplicationDto[]`, `mapVolunteerApplication` | `EventRepository.getUserApplications()` | Invalidation/refetching of application state after apply or withdraw mutations. |
| **V-27** | Withdraw own application | `event_applications`, state trigger | `application_service.withdraw_application` | `POST /api/v1/applications/{id}/withdraw/` | `eventApi.withdrawApplication` | Primitive `{id, status}` | `EventRepository.withdrawApplication()` | Invalidate cache and update list/detail state upon successful withdrawal. |
| **V-28** | View own assignments | `assignments`, `events`, `event_posts` | `assignment_service.get_own_assignments` | `GET /api/v1/me/assignments/` | `eventApi.getMyAssignments` | `VolunteerAssignmentDto[]`, `mapVolunteerAssignment` | `EventRepository.getUserAssignments()` | DTO field alignment; retain correct schedule timestamps and IDs without synthesizing event facts. |
| **V-29** | Confirm own assignment | `assignments.status = 'confirmed'` | `assignment_service.confirm_assignment` | `POST /api/v1/assignments/{id}/confirm/` | `eventApi.confirmAssignment` | Primitive `{id, status}` | `EventRepository.confirmAssignment?()` | Make method required in `EventRepository` contract; return updated state. |
| **V-30** | Cancel own assignment participation | `assignments.status = 'cancelled'` | `assignment_service.cancel_assignment` | `POST /api/v1/assignments/{id}/cancel/` | `eventApi.cancelAssignment` | Primitive `{id, status}` | `EventRepository.cancelAssignment()` | Ensure volunteer can only cancel their own assignment; invalidate assignments and commitment cache. |
| **V-31** | Read onboarding content & status | `events.onboarding_text`, `onboarding_acknowledgments` | `onboarding_service.get_event_onboarding` | `GET /api/v1/checkin/events/{id}/onboarding/` | `checkinApi.getOnboarding` | `OnboardingContentDto` | `EventRepository.getEventOnboarding?()` | Make required in contract; track `current_version` and `is_acknowledged` explicitly. |
| **V-32** | Acknowledge current onboarding version | `onboarding_acknowledgments`, trigger | `onboarding_service.acknowledge_event_onboarding` | `POST /api/v1/checkin/events/{id}/onboarding/acknowledge/` | `checkinApi.acknowledgeOnboarding` | `OnboardingAckResponseDto` | `EventRepository.acknowledgeOnboarding?()` | Make required in contract; client must never pass arbitrary version number as authority. |
| **V-33** | Preview QR token | `qr_tokens`, `qr_token_status()` | `qr_service.preview_qr_token` | `POST /api/v1/checkin/qr/resolve/` | `checkinApi.resolveQrToken` | `QrResolveRequestDto`, `QrResolveResponseDto` | `EventRepository.resolveQrToken?()` | Ensure preview remains strictly read-only and never consumes a token use. |
| **V-34** | Redeem general-purpose QR token | `consume_qr_token()`, `qr_tokens` | `qr_service.redeem_qr_token` | `POST /api/v1/checkin/qr/redeem/` | `checkinApi.redeemQrToken` | `QrRedeemRequestDto`, `QrRedeemResponseDto` | `EventRepository.redeemQrToken?()` | Use purpose-specific response contract; decouple walk-in registration from attendance check-in. |
| **V-35** | QR attendance check-in | `qr_check_in()`, `attendance` table | `qr_service.qr_check_in` | `POST /api/v1/checkin/attendance/qr-checkin/` | `checkinApi.qrCheckIn` | `AttendanceMutationResponseDto` | Repositories collapse into generic redeem | Expose explicit `qrCheckIn(token)` in repository contract returning typed attendance item. |
| **V-36** | Geo check-in | `geo_check_in()`, `attendance_geo_attempts` | `geo_service.submit_geo_check_in` | `POST /api/v1/checkin/attendance/geo-checkin/` | `checkinApi.submitGeoCheckIn` | `GeoCheckInRequestDto`, `AttendanceMutationResponseDto` | `EventRepository.submitGeoCheckIn?()` | **P0 Defect:** `MyAssignmentsScreen` submits hardcoded coordinates `(16.805, 96.155, 15)`; Android manifest has no GPS permissions; needs real native `LocationProvider`. |
| **V-37** | Checkout attendance | `attendance.checkout_at`, attendance trigger | `attendance_service.check_out` | `POST /api/v1/checkin/attendance/{id}/checkout/` | `checkinApi.checkoutAttendance` | `AttendanceMutationResponseDto` | `EventRepository.checkoutAttendance?()` | Make required in contract; return updated attendance record or trigger refetch. |
| **V-38** | View own attendance history | `attendance` table, privacy rules | `attendance_service.get_user_attendance_history` | `GET /api/v1/checkin/me/attendance/` | `profileApi.getAttendanceHistory` | `AttendanceRecordDto[]` | Implemented in HTTP repo, missing in interface | `ProfileRepository` interface lacks method; DTO expects fields (`event_title`, `verified_hours`) not returned by BFF. |
| **V-39** | Submit volunteer-to-event feedback | `feedback` (`volunteer_to_event`), trigger | `feedback_service.submit_event_feedback` | `POST /api/v1/checkin/events/{id}/feedback/` | `checkinApi.submitEventFeedback` | `EventFeedbackSubmitDto`, `FeedbackRecordDto` | `EventRepository.submitFeedback?()` | Make required in repository contract; refresh authored feedback after submission. |
| **V-40** | Submit volunteer-to-coordinator feedback | `feedback` (`volunteer_to_coordinator`) | `feedback_service.submit_event_feedback` | `POST /api/v1/checkin/events/{id}/feedback/` | `checkinApi.submitEventFeedback` | `EventFeedbackSubmitDto` | Not explicit in contract | Expose direction-safe method with `coordinatorUserId` parameter in repository contract. |
| **V-41** | Read feedback authored by self | `feedback` (`rater_user_id = user.id`) | `feedback_service.get_own_feedback` | `GET /api/v1/checkin/me/feedback/` | **MISSING** (only summary fetched) | Partially in `FeedbackSummaryResponseDto` | **MISSING** in `ProfileRepository` | **Defect:** `VolunteerFeedbackView` in `bff/volunteer/views.py` is unmounted; authored feedback list is not separated from received summary. |
| **V-42** | Read aggregate feedback about self | `get_user_feedback_summary()` | `feedback_service.get_user_feedback_summary` | `GET /api/v1/checkin/me/feedback/` | `profileApi.getFeedbackSummary` | `FeedbackSummaryResponseDto` | Bundled in `getProfile` / eligibility | Mobile DTO/eligibility logic still leans on flat keys; nested response schema (`as_volunteer.avg_overall`) needs explicit domain mapping. |
| **V-43** | Volunteer dashboard summary | Aggregated from `assignments`, `attendance`, `feedback` | Composed service queries | Composed mobile endpoints | Multiple calls via `HttpDashboardRepository` | `DashboardSummary` domain model | `IDashboardRepository.getDashboardSummary()` | Keep composition in use case/repository; do not synthesize unsupported verified hours or activity facts. |

---

## 3. Complete 39 Coordinator Capabilities Ledger (`C-01` through `C-39`)

| ID | Capability Name | DB Object / Function | Django Service | BFF Route & Method | Mobile Endpoint Client | DTO & Mapper | Repository Contract | Current Gap & Remediation Need |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **C-01** | Read own coordinator status | `coordinator_profiles` | `coordinator_service.get_coordinator_profile` | `GET /api/v1/me/coordinator/` | `profileApi.getCoordinatorProfile` | `CoordinatorProfileEnvelopeDto` | `ProfileRepository.getVerificationStatus()` | Separate coordinator status model from general volunteer profile. |
| **C-02** | Submit coordinator application | `coordinator_profiles` lifecycle | `coordinator_service.apply_for_coordinator` | `POST /api/v1/me/coordinator/` | `profileApi.applyForCoordinator` | `CoordinatorApplyRequestDto`, `CoordinatorProfileEnvelopeDto` | `ProfileRepository.submitCoordinatorApplication()` | Server owns eligibility rules; client should not gate submission on local calculations. |
| **C-03** | Update pending application notes | `coordinator_profiles.notes` | `coordinator_service.update_coordinator_application` | `PATCH /api/v1/me/coordinator/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, or repository method to patch application notes. |
| **C-04** | List managed events | `events.owner_id`, `current_coordinator_id` | `event_service.list_coordinator_events` | `GET /api/v1/coordinator/events/` | `coordinatorApi.getMyEvents` | `CoordinatorEventListItemDto[]`, `mapCoordinatorEventSummary` | `CoordinatorRepository.getMyEvents()` | Preserve `owner_id`, `current_coordinator_id`, and `is_read_only_monitor` flags; do not fabricate blank descriptions or generic locations. |
| **C-05** | Read event summary metrics | `v_event_summary` | `query_service.get_event_summary` | `GET /api/v1/coordinator/events/{id}/summary/` | `coordinatorApi.getEventSummary` | `EventSummaryViewDto` | `CoordinatorRepository.getEventSummaryMetrics()` | Ensure summary DTO matches all returned count fields (`assignment_count`, `accepted_count`, `pending_count`, `checked_in_count`). |
| **C-06** | Create draft event | `events`, insert trigger, starts `draft` | `event_service.create_event` | `POST /api/v1/coordinator/events/` | `coordinatorApi.createEvent` | `EventCreateRequestDto`, `mapCreateEventDraftToRequest` | `CoordinatorRepository.createDraftEvent()` | Event declaration is incomplete without post creation (open post required by DB to publish). |
| **C-07** | Read event posts/roles | `event_posts`, `v_event_post_capacity` | `event_post_service.get_event_posts_with_capacity` | `GET /api/v1/coordinator/events/{id}/posts/` | `coordinatorApi.getEventPosts` | `EventPostDto[]`, `mapEventPost` | Composed in `getEventDetail` | Post and capacity response must be typed and read authoritatively from server. |
| **C-08** | Create event post/role | `event_posts`, post trigger | `event_post_service.create_event_post` | `POST /api/v1/coordinator/events/{id}/posts/` | **MISSING** | **MISSING** | **MISSING** | **P0 Blocker:** BFF route exists, but mobile has no endpoint client, DTO, or repository method. Blocks event publication workflow. |
| **C-09** | Update event post/role | `event_posts`, headcount floor trigger | `event_post_service.update_event_post` | `PATCH /api/v1/posts/{post_id}/` | **MISSING** | **MISSING** | **MISSING** | **P0 Blocker:** BFF route exists, but mobile has no endpoint client, DTO, or repository method to edit posts. |
| **C-10** | Close event post/role | `event_posts.status = 'closed'` | `event_post_service.close_event_post` | `POST /api/v1/posts/{post_id}/close/` | **MISSING** | **MISSING** | **MISSING** | **P0 Blocker:** BFF route exists, but mobile has no endpoint client, DTO, or repository method to close posts. |
| **C-11** | Edit event metadata | `events` update allow-list, frozen states | `event_service.update_event` | `PATCH /api/v1/coordinator/events/{id}/` | `coordinatorApi.updateEvent` | `EventUpdateRequestDto` | **MISSING** in `CoordinatorRepository` | Endpoint wrapper exists, but `CoordinatorRepository` interface and HTTP implementation omit `updateEvent()`. |
| **C-12** | Publish event | `events.status = 'published'`, trigger check | `event_service.publish_event` | `POST /api/v1/events/{id}/publish/` | `coordinatorApi.publishEvent` | Operation result | `CoordinatorRepository.transitionEventStatus(id, 'published')` | Preflight check for open posts before publish; handle trigger rejection cleanly. |
| **C-13** | Activate event | `events.status = 'active'`, lifecycle trigger | `event_service.activate_event` | `POST /api/v1/events/{id}/activate/` | `coordinatorApi.activateEvent` | Operation result | `CoordinatorRepository.transitionEventStatus(id, 'active')` | Return updated server state and timestamps. |
| **C-14** | Complete event | `events.status = 'completed'`, cascade triggers | `event_service.complete_event` | `POST /api/v1/events/{id}/complete/` | `coordinatorApi.completeEvent` | Operation result | `CoordinatorRepository.transitionEventStatus(id, 'completed')` | Refetch event, assignments, and attendance after completion. |
| **C-15** | Cancel event | `events.status = 'cancelled'`, cascade triggers | `event_service.cancel_event` | `POST /api/v1/events/{id}/cancel/` | `coordinatorApi.cancelEvent` | Operation result | `CoordinatorRepository.transitionEventStatus(id, 'cancelled')` | Invalidate application/assignment caches upon cancellation. |
| **C-16** | Hand over event coordination | `change_event_coordinator()`, history table | `event_service.handover_event_coordinator` | `POST /api/v1/events/{id}/handover/` | `coordinatorApi.handoverEvent` | `EventHandoverRequestDto` | `CoordinatorRepository.handoverEvent?()` | Make method required in contract; return updated owner/coordinator and read-only monitor state. |
| **C-17** | Retake coordination as owner | `change_event_coordinator()`, owner rule | `event_service.retake_event_coordinator` | `POST /api/v1/events/{id}/retake/` | `coordinatorApi.retakeEvent` | `EventRetakeRequestDto` | `CoordinatorRepository.retakeEvent?()` | Make method required in contract; reconcile `is_read_only_monitor` to false upon success. |
| **C-18** | Read coordinator handover history | `v_event_coordinator_history` | `audit_service.get_event_coordinator_history` | **NO BFF ROUTE** | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** DB view and service exist, but no coordinator/manager-scoped BFF route or mobile contract exists. |
| **C-19** | Review event applications | `event_applications`, T2 policy | `application_service.get_event_applications` | `GET /api/v1/coordinator/events/{id}/applications/` | `coordinatorApi.getApplications` | `CoordinatorApplicationDto[]`, `mapCoordinatorApplication` | `CoordinatorRepository.getApplications()` | **P0 Defect:** Backend service omits several T2 fields; mobile mapper fabricates defaults (eyesight, language, outdoor, etc.). |
| **C-20** | Accept application | `event_applications.status = 'accepted'` | `application_service.accept_application` | `POST /api/v1/coordinator/applications/{id}/accept/` | `coordinatorApi.decideApplication` | BFF returns `{id, status}` | `CoordinatorRepository.updateApplicationStatus()` | Mobile repository drops response data; caller cannot reconcile state without refetching. |
| **C-21** | Reject application | `event_applications.status = 'rejected'` | `application_service.reject_application` | `POST /api/v1/coordinator/applications/{id}/reject/` | `coordinatorApi.decideApplication` | BFF returns `{id, status}` | `CoordinatorRepository.updateApplicationStatus()` | Return typed minimal result and update/refetch application list. |
| **C-22** | Waitlist application | `event_applications.status = 'waitlisted'` | `application_service.waitlist_application` | `POST /api/v1/coordinator/applications/{id}/waitlist/` | `coordinatorApi.decideApplication` | BFF returns `{id, status}` | `CoordinatorRepository.updateApplicationStatus()` | Return typed minimal result and reconcile list state. |
| **C-23** | Invite volunteer | `invite_volunteer_to_event()`, `source='invite'` | `application_service.invite_volunteer_to_event` | **NO BFF ROUTE** | **MISSING** | **MISSING** | **MISSING** | **P0 Blocker:** Service exists, but no BFF route, view, serializer, mobile endpoint, DTO, or repository contract exists. |
| **C-24** | Run auto-assignment | `run_auto_assignment()` | `assignment_service.run_event_auto_assignment` | `POST /api/v1/coordinator/events/{id}/auto-assign/` | `coordinatorApi.runAutoAssignment` | DTO shape mismatch | `CoordinatorRepository.runAutoAssignment()` | Service returns `{assigned_count, unassigned_count}`, but mobile contract expects full assignment items. |
| **C-25** | Manually assign volunteer | `assign_manually()`, `assignments` | `assignment_service.assign_volunteer_manually` | `POST /api/v1/coordinator/events/{id}/manual-assign/` | `coordinatorApi.manualAssign` | Response type mismatch | `CoordinatorRepository.assignVolunteerManually()` | **P0 Blocker:** Backend returns `{assignment_id, application_id}`, but mobile casts to full assignment DTO; groupCode/leader hardcoded (`GRP-C`, `false`). |
| **C-26** | View event assignments | `assignments`, `users`, `event_posts` | `assignment_service.get_event_assignments` | `GET /api/v1/coordinator/events/{id}/assignments/` | `coordinatorApi.getAssignments` | `CoordinatorAssignmentDto[]`, `mapCoordinatorAssignment` | `CoordinatorRepository.getAssignments()` | **P0 Defect:** Backend service omits `application_id` and `assigned_at`; mapper assigns `applicationId = dto.id` and guesses `assignedAt`. |
| **C-27** | View accepted/unassigned applicants | `v_accepted_unassigned` | `assignment_service.get_unassigned_accepted` | `GET /api/v1/coordinator/events/{id}/unassigned/` | `coordinatorApi.getUnassignedApplications` | `CoordinatorApplicationDto[]`, `mapCoordinatorApplication` | `CoordinatorRepository.getUnassignedApplications()` | T2 capability fields should be complete and truthful without fabricated defaults. |
| **C-28** | View post capacity summary | `v_event_post_capacity` | `assignment_service.get_post_capacity_summary` | `GET /api/v1/coordinator/events/{id}/post-capacity/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, mapper, or repository contract method. |
| **C-29** | Lookup volunteer by public UUID | `users.uuid`, T1/T2 masking | `profile_service.lookup_user_by_uuid` | `GET /api/v1/users/by-uuid/{uuid}/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, or repository method for coordinator UUID lookup. |
| **C-30** | View event attendance roster | `v_event_checkin_board` | `attendance_service.get_event_attendance_board` | `GET /api/v1/checkin/coordinator/events/{id}/attendance/` | `coordinatorApi.getAttendanceRoster` | `AttendanceRosterDto[]`, `mapAttendanceRosterItem` | `CoordinatorRepository.getAttendanceRoster()` | Attendance method mapping (`qr_scan` -> `qr`, `coordinator_manual` -> `manual`); separate attendance status from geo confirmation. |
| **C-31** | Manually check in volunteer | `attendance` table, trigger validations | `attendance_service.manual_check_in` | `POST /api/v1/checkin/attendance/manual-checkin/` | `coordinatorApi.manualCheckIn` | `AttendanceMutationResponseDto` | `CoordinatorRepository.manualCheckIn()` | Signature mismatch: coordinator contract takes `attendanceId` while backend expects `event_id` and `volunteer_user_id`. |
| **C-32** | Create event QR token | `qr_tokens`, purpose, expiry, hash | `qr_service.create_event_qr_token` | `POST /api/v1/checkin/coordinator/events/{id}/qr-tokens/` | `checkinApi.createCoordinatorQrToken` | `CoordinatorQrCreateRequestDto`, `CoordinatorQrCreateResponseDto` | `CoordinatorRepository.createQrToken?()` | Make method required in contract; raw token returned once only. |
| **C-33** | Revoke event QR token | `qr_tokens.revoked_at` | `qr_service.revoke_event_qr_token` | `POST /api/v1/checkin/coordinator/qr-tokens/{id}/revoke/` | `checkinApi.revokeCoordinatorQrToken` | Primitive `{id, status}` | `CoordinatorRepository.revokeQrToken?()` | Make method required in contract. |
| **C-34** | View pending geo confirmations | `v_pending_confirmations` | `attendance_service.get_pending_confirmations` | `GET /api/v1/checkin/coordinator/events/{id}/attendance/pending/` | `coordinatorApi.getPendingGeoConfirmations` | `AttendanceRosterDto[]`, `mapAttendanceRosterItem` | `CoordinatorRepository.getPendingGeoConfirmations()` | Reconcile status mapping and ensure refreshed state upon confirm/reject. |
| **C-35** | Review geo attempt history | `v_geo_attempts_review`, telemetry | `attendance_service.get_geo_attempts_review` | `GET /api/v1/checkin/coordinator/events/{id}/geo-attempts/` | **MISSING** | **MISSING** | **MISSING** | **P1 Gap:** BFF route exists, but mobile has no endpoint client, DTO, mapper, or repository contract method. |
| **C-36** | Confirm geo attendance | `confirm_attendance()`, `attendance` | `attendance_service.confirm_attendance` | `POST /api/v1/checkin/coordinator/attendance/{id}/confirm/` | `coordinatorApi.confirmAttendance` | Primitive `{id, confirmation_status: 'confirmed'}` | `CoordinatorRepository.confirmGeoAttendance()` | Reconcile and update/refetch attendance board and pending confirmations. |
| **C-37** | Reject geo attendance | `reject_attendance()`, `attendance` | `attendance_service.reject_attendance` | `POST /api/v1/checkin/coordinator/attendance/{id}/reject/` | `coordinatorApi.rejectAttendance` | Primitive `{id, confirmation_status: 'rejected'}` | `CoordinatorRepository.rejectGeoAttendance()` | Reconcile and update/refetch attendance board and pending confirmations. |
| **C-38** | Submit coordinator feedback | `feedback` (`coordinator_to_volunteer`) | `feedback_service.submit_event_feedback` | `POST /api/v1/checkin/events/{id}/feedback/` | Handled via generic checkin API | `EventFeedbackSubmitDto` | **MISSING** in `CoordinatorRepository` | `CoordinatorRepository` has no explicit method to submit coordinator-to-volunteer feedback with `target_user_id`. |
| **C-39** | Read coordinator feedback summary | `get_user_feedback_summary()` | `feedback_service.get_user_feedback_summary` | **NO MOUNTED BFF ROUTE** | **MISSING** | **MISSING** | **MISSING** | **Defect:** `CoordinatorFeedbackView` exists in `backend/bff/coordinator/views.py` but is NOT mounted in `coordinator/urls.py`; mobile has no contract. |

---

## 4. Confirmed P0 / P1 / P2 Discrepancy Register

### 4.1 Priority P0: Capability Blockers & Data Corruption Defects

1. **P0-01 (Missing Mobile Post CRUD — `C-08`, `C-09`, `C-10`):**
   - *Impact:* The database publication invariant (`tr_events_check_publish`) requires at least one open post before an event can transition from `draft` to `published`.
   - *Finding:* BFF exposes `POST /coordinator/events/{id}/posts/` and `PATCH /posts/{id}/`, but mobile has no endpoint client, DTO, or repository method in `coordinatorApi.ts` and `CoordinatorRepository`.
   - *Required Action:* Implement `createEventPost()`, `updateEventPost()`, and `closeEventPost()` across endpoint, DTO, mapper, and repository contracts.

2. **P0-02 (Missing BFF Route for Volunteer Invite — `C-23`):**
   - *Impact:* Coordinators cannot invite specific volunteers to events through the API.
   - *Finding:* `application_service.invite_volunteer_to_event()` exists, but there is no BFF route, view, or serializer registered.
   - *Required Action:* Register manager-scoped route `POST /api/v1/coordinator/events/{event_id}/invite/`, create `InviteVolunteerSerializer`, and expose in mobile.

3. **P0-03 (Incomplete T2 Fields in `get_event_applications` & Fabricated Defaults — `C-19`, `C-27`):**
   - *Impact:* Violation of privacy policy and contract truthfulness.
   - *Finding:* `application_service.get_event_applications()` only returns a subset of T2 fields (`skills`, `physical_ok`, `can_lift_heavy`, `has_leader_experience`, `new_to_volunteer`, `needs_meal_support`, `needs_travel_support`). In `mobile/src/data/mappers/coordinatorMapper.ts` (lines 143–155), missing fields are fabricated (`goodEyesight: true`, `needsGlasses: false`, `canWorkOutdoor: true`, `preferredLanguage: 'en'`, `homeArea: ''`, `acceptsUnpaid: true`, `verificationStatus: 'verified'`).
   - *Required Action:* Update service/serializer to include all permitted T2 fields (`good_eyesight`, `needs_glasses`, `can_work_outdoor`, `preferred_language`, `home_area`, `accepts_unpaid`, `verification_status`); eliminate fabricated defaults in mapper.

4. **P0-04 (Missing `application_id` and `assigned_at` in `get_event_assignments` — `C-26`):**
   - *Impact:* Identity corruption across domain models.
   - *Finding:* `assignment_service.get_event_assignments()` omits `application_id` and `assigned_at`. In `mobile/src/data/mappers/coordinatorMapper.ts` (lines 185, 193), mapper sets `applicationId = String(dto.id)` (substituting assignment ID!) and `assignedAt = dto.confirmed_at ?? dto.schedule_start`.
   - *Required Action:* Add `application_id` and `assigned_at` to service query result and BFF serializer; update mapper to preserve distinct IDs and true timestamps.

5. **P0-05 (Manual Assignment Response DTO Mismatch — `C-25`):**
   - *Impact:* Contract failure or unhandled exception during manual assignment.
   - *Finding:* Backend returns minimal mutation result `{"assignment_id": int, "application_id": int}`, but mobile `coordinatorApi.manualAssign()` types and casts the response as a full `CoordinatorAssignmentDto`.
   - *Required Action:* Define explicit `ManualAssignResponseDto` (`{assignment_id, application_id}`) and refetch assignment list or return minimal domain result.

6. **P0-06 (Profile Identity Defect: `phone` Mapped as `email` — `V-04`, `V-05`):**
   - *Impact:* Distorts user identity domain model; hides phone authentication truth.
   - *Finding:* In `mobile/src/data/mappers/profileMapper.ts` (line 98), `mapUserProfile` assigns `email: userDto.phone ? userDto.phone : 'Verified Phone Account'`.
   - *Required Action:* Introduce first-class `phone` property on domain `VolunteerProfile`; remove fake `email` assignment.

7. **P0-07 (Geo Check-In Hardcoded Coordinates & Missing Android Permissions — `V-36`):**
   - *Impact:* Mobile client cannot perform legitimate GPS geofence check-in in HTTP mode.
   - *Finding:* `mobile/src/features/events/screens/MyAssignmentsScreen.tsx` submits hardcoded coordinates `(16.805, 96.155, 15)`. Android manifest lacks `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`.
   - *Required Action:* Implement native `LocationProvider` abstraction with runtime permission checks; inject real GPS fix into HTTP repository.

8. **P0-08 (Token Store Memory Fallback Without Secure Storage — `V-02`):**
   - *Impact:* User authentication sessions do not survive app restarts.
   - *Finding:* `tokenStore.ts` attempts to load `@react-native-async-storage/async-storage`, which is not installed in `package.json`, silently falling back to `MemoryTokenStore`.
   - *Required Action:* Integrate secure storage backed by Android Keystore and iOS Keychain; retain memory storage for unit tests only.

9. **P0-09 (Console OTP Delivery in Development — `V-01`):**
   - *Impact:* Cannot authenticate real users in production environments.
   - *Finding:* Backend defaults to `ConsoleOtpDeliveryAdapter` which logs OTP to stdout and does not dispatch SMS.
   - *Required Action:* Implement SMS gateway adapter for production while retaining console adapter for local testing; align `delivered` boolean semantics.

---

### 4.2 Priority P1: Capability Parity Gaps

1. **P1-01 (Missing BFF Route for Handover History — `C-18`):**
   - View `v_event_coordinator_history` and `audit_service.get_event_coordinator_history()` exist, but no manager-accessible BFF route is registered under `/api/v1/coordinator/events/{id}/history/`.

2. **P1-02 (Unmounted Feedback Views in BFF — `V-41`, `C-39`):**
   - `VolunteerFeedbackView` is defined in `backend/bff/volunteer/views.py` but is **not registered** in `backend/bff/volunteer/urls.py`.
   - `CoordinatorFeedbackView` is defined in `backend/bff/coordinator/views.py` but is **not registered** in `backend/bff/coordinator/urls.py`.
   - Authored feedback list and aggregate feedback summary are currently conflated in `checkin/me/feedback/`.

3. **P1-03 (Missing Mobile UUID Lookup — `V-18`, `C-29`):**
   - BFF route `GET /api/v1/users/by-uuid/{uuid}/` exists, but mobile data layer has no endpoint client, DTO, or repository method in `profileApi` or `coordinatorApi`.

4. **P1-04 (Missing Mobile Availability Check Endpoints — `V-11`, `V-12`):**
   - BFF routes `GET /api/v1/me/availability/check/?event_id={id}` and `POST /api/v1/me/availability/check/` exist, but mobile has no endpoint client, DTO, or repository method in `profileApi` / `ProfileRepository`.

5. **P1-05 (Missing Multipart Verification Upload — `V-13`):**
   - BFF route `POST /api/v1/me/verification-images/` exists, but mobile lacks multipart file upload client, request DTO, and repository method in `profileApi` / `ProfileRepository`.

6. **P1-06 (Missing Mobile Post Capacity Endpoint — `C-28`):**
   - BFF route `GET /api/v1/coordinator/events/{id}/post-capacity/` exists, but mobile has no endpoint client or repository method in `coordinatorApi` / `CoordinatorRepository`.

7. **P1-07 (Missing Mobile Geo Attempt Review — `C-35`):**
   - BFF route `GET /api/v1/checkin/coordinator/events/{id}/geo-attempts/` exists, but mobile has no endpoint client or repository method in `coordinatorApi` / `CoordinatorRepository`.

8. **P1-08 (Missing Mobile Update Application Notes — `V-17`, `C-03`):**
   - BFF route `PATCH /api/v1/me/coordinator/` exists, but mobile has no endpoint wrapper or repository method to update pending application notes.

9. **P1-09 (Missing `updateEvent` in `CoordinatorRepository` Contract — `C-11`):**
   - `coordinatorApi.updateEvent()` exists, but `CoordinatorRepository` interface and `HttpCoordinatorRepository` do not expose `updateEvent()`.

10. **P1-10 (Optional Contract Methods in Repository Interfaces):**
    - Methods such as `handoverEvent`, `retakeEvent`, `createQrToken`, `revokeQrToken` in `CoordinatorRepository` and `confirmAssignment` in `EventRepository` are marked as optional (`?`). They must be required for capability completeness.

11. **P1-11 (Public Event Pagination Truncation — `V-20`):**
    - `HttpEventRepository.getEvents()` requests only `page=1` without cursor or next-page continuation.

12. **P1-12 (Attendance & Assignment DTO Field Mismatches — `V-38`, `C-30`):**
    - `AttendanceRecordDto` expects joined event and post titles not returned by the raw BFF history endpoint.

---

### 4.3 Priority P2: Model, Lifecycle & Configuration Correctness

1. **P2-01 (Attendance Method & Status Mapping Discrepancy — `C-30`):**
   - Raw database values (`qr_scan`, `coordinator_manual`) differ from mobile domain union (`qr`, `manual`). Mapper must explicitly handle exhaustive mappings without coercing unknown states.

2. **P2-02 (Feedback Summary Nested Schema Handling — `V-42`, `C-39`):**
   - Backend returns nested summary shape (`as_volunteer`, `as_coordinator`, distributions), while mobile code contains fallback reads on legacy flat keys.

3. **P2-03 (Leader Strategy & Compensation Enums Discrepancy — `C-06`):**
   - Mobile wizard uses `first_assigned` / `highest_rated` and `stipend` / `travel_reimbursement`; SQL schema accepts `none` / `first_experienced` / `manual` and `unpaid` / `arranged_outside_system`. Mappers currently translate, but DTOs should align with server enums.

4. **P2-04 (Donation Master vs Sub-Flags State Merging — `V-05`):**
   - Partial updates must merge existing profile state before computing or patching master `is_willing_to_donate` flag.

5. **P2-05 (Coordinator Event Summary/Detail Placeholder Defaults — `C-04`):**
   - `mapCoordinatorEventSummary` hardcodes placeholder strings (`locationName: 'Event Location'`, `description: ''`). Detail composition should replace placeholders.

6. **P2-06 (Mutation Cache Invalidation):**
   - Successful mutations (application withdraw, assignment cancel, post close, geo confirm/reject) must invalidate and refetch affected caches.

7. **P2-07 (Hardcoded Manual Assignment Parameters — `C-25`):**
   - UI hardcodes `group_code="GRP-C"` and `is_group_leader=false`. Repository contract must accept validated parameters.

8. **P2-08 (Backend Test Runner Path String Typo):**
   - `backend/config/test_runner.py` specifies `"postgres sql"` with a space instead of `"postgres_sql"`, causing `manage.py test` without `--testrunner` to fail finding the schema file.

---

## 5. Phase 0 Acceptance Declaration

- [x] **PostgreSQL schema immutability confirmed:** zero SQL files, migrations, or database definitions modified.
- [x] **Documentation version discrepancy resolved:** `postgres_sql/updated_volunteer_coordination_system_Database.sql` is confirmed as Unified Schema v0.5.2 (22 tables, 11 views) and the sole source of truth.
- [x] **Baseline test suites executed:**
  - Mobile TypeScript: **0 Errors**
  - Mobile Jest: **28 Suites / 367 Tests PASS**
  - Backend Test Runner: **652 Tests PASS**
  - OpenAPI Spectacular: **PASS**
- [x] **Complete 43 Volunteer Capabilities Ledger created (`V-01` to `V-43`)**
- [x] **Complete 39 Coordinator Capabilities Ledger created (`C-01` to `C-39`)**
- [x] **Complete P0/P1/P2 Discrepancy Register documented**
- [x] **Zero backend or mobile source code modified in Phase 0**

**PHASE 0 EXECUTION IS COMPLETE. READY FOR PHASE 1 CONTRACT STABILIZATION.**
