# v0.10.0 Implementation Feasibility & Baseline Audit Report

**Document Status:** Complete & Verified  
**Audit Target:** `reference/v0_10_0_phase_by_phase_execution_prompts.md`  
**Companion Architecture Plan:** `reference/v0_10_0_mobile_bff_integration_plan.md`  
**Target Codebases:**  
- **Mobile Frontend:** React Native Workshift Mobile (`mobile/src/`)  
- **Backend BFF:** Django REST Framework BFF (`backend/bff/`, `backend/services/`, `backend/common/`)  
- **Database Baseline:** PostgreSQL v0.6.0 (`postgres_sql/`)  
**Auditor:** Antigravity AI  
**Audit Date:** 2026-11-15  

---

## 1. Executive Summary & Feasibility Verdict

### Overall Verdict: **100% FEASIBLE (WITH 4 CRITICAL TECHNICAL PRECAUTIONS)**

All 10 phases (Phase 0 through Phase 9) specified in `reference/v0_10_0_phase_by_phase_execution_prompts.md` **can be successfully implemented** against the current codebase without altering any PostgreSQL schema, triggers, functions, views, or existing Django backend services.

The prompts reflect an exceptionally deep and accurate understanding of the actual codebase, including precise line numbers, function signatures, serializer mixins, and view behaviors.

However, during this baseline freeze and audit, **4 critical technical nuances and pre-existing conditions** were discovered that any agent or engineer executing these prompts must be aware of to prevent false-negative test failures or HTTP 400 rejection errors.

---

## 2. Key Findings & Critical Technical Precautions

### Finding 1: Query Parameter Name Discrepancy on `GET /api/v1/events/` (Phase 5)
- **Prompt Reference (Phase 5, line 352):** States that `query_service.list_public_events` allows `SPECIAL_PARAMS` including `start_after`, `end_before`, `available_only`.
- **Actual Backend Implementation (`backend/services/query_service.py` lines 53–62 & 109–143):**
  ```python
  SPECIAL_PARAMS = {
      "search",
      "charity_field",
      "starts_after",   # Notice 'starts_' (plural) NOT 'start_after'
      "starts_before",  # Notice 'starts_before' NOT 'end_before'
      "upcoming",       # Notice 'upcoming' NOT 'available_only'
      "sort",
      "page",
      "page_size",
  }
  ```
- **Risk:** Because `query_service.list_public_events` raises `DomainError(code="invalid_filter", message="Unsupported filter '<key>'", status_code=400)` for any unlisted key, sending `start_after`, `end_before`, or `available_only` will cause the backend to **reject the request with HTTP 400**.
- **Action Required:** In `HttpEventRepository.getEvents(filters)`, map client filter properties strictly to:
  - `filters.startDate` -> `starts_after`
  - `filters.endDate` -> `starts_before`
  - `filters.upcomingOnly` -> `upcoming` (`"true"`)
  - `filters.charityFieldCodes` -> `charity_field` (comma-separated string)
  - `filters.query` -> `search`
  - Single status -> `status` (or omit if both published/active)

---

### Finding 2: Pre-Existing Baseline TypeScript Type Errors in Mobile (Phase 0)
- **Baseline Discovery:** Running `npx tsc --noEmit` in `mobile/` currently exits with `code 1` due to **two pre-existing type errors** in the mobile baseline:
  1. `__tests__/theme.test.tsx(268,11): error TS2740`: Missing icon properties in mock theme object (`Record<IconName, string>`). When newer icons were added to `IconName` in `src/shared/components/AppIcon.tsx`, the mock icon map in `theme.test.tsx` was not updated.
  2. `src/features/dashboard/components/UpcomingCommitmentCard.tsx(168,33): error TS2367`: `commitment.status !== 'completed'` comparison triggers an unintentional type overlap error because `DashboardCommitment.status` is strictly typed as `'assigned' | 'confirmed'`.
- **Jest Test Suite Baseline:** Running `npm test -- --watchAll=false` inside `mobile/` passes completely:
  - **13 Test Suites Passed**, **192 Tests Passed**, 0 Failures.
- **Action Required:** In Phase 0, document these two pre-existing type errors in the Phase 0 Baseline Report. In Phase 1 (or baseline freeze), these two trivial TypeScript definition mismatches can be addressed so that subsequent phases maintain a clean zero-error typecheck.

---

### Finding 3: Execution Working Directory Context
- **Observation:** The repository root is `python_stack/`, but the mobile React Native application is housed under `python_stack/mobile/`.
- **Risk:** Running `npm test` or `npx tsc` directly from `python_stack/` results in `ENOENT: no such file or directory, open '.../python_stack/package.json'`.
- **Action Required:** All mobile build, test, and typecheck commands must execute inside `mobile/` (e.g. `cd mobile; npm test -- --watchAll=false`).

---

### Finding 4: Verification of the Checkout Route Signature Warning (Phase 8)
- **Prompt Reference (Phase 8, line 530):** Warns that checkout must call `POST /api/v1/attendance/{attendance_id}/checkout/` and NEVER `/events/{event_id}/checkout/`.
- **Actual Backend Implementation (`backend/bff/checkin/views.py` line 160):**
  ```python
  class AttendanceCheckoutView(APIView):
      def post(self, request, attendance_id):
          att = attendance_service.check_out(request.user, attendance_id)
          return Response({"id": att.id, "status": att.status, "checkout_at": att.checkout_at})
  ```
- **Audit Confirmation:** The backend view definition `def post(self, request, attendance_id)` strictly takes `attendance_id`. Calling the alias route `/events/<event_id>/checkout/` causes Django to pass `event_id` as a keyword argument, triggering `TypeError: post() got an unexpected keyword argument 'event_id'`. The prompt's warning is **100% correct and vital**.

---

## 3. Phase-by-Phase Feasibility Audit

| Phase | Title | Referencing Scope | Backend & Frontend Reality Check | Feasibility Verdict |
|---|---|---|---|---|
| **Phase 0** | **Discovery & Baseline Freeze** | Mobile files under `src/app/`, `navigation/`, `models/`, `contracts/`, `mock/`, `features/`. Checks 3 coordinator screens and 4 event screens. | Verified: All paths exist. All 3 coordinator screens (`CoordinatorApplicationsScreen`, `CoordinatorAssignmentsScreen`, `CoordinatorAttendanceScreen`) import `defaultCoordinatorRepository` directly. All 4 event screens type `MockEventRepository`. 192 tests pass. 2 pre-existing typecheck errors identified. | **FEASIBLE** (Document pre-existing type errors) |
| **Phase 1** | **Mobile API Foundation & Token/Session Core** | Pluggable `TokenStore`, `SessionManager`, `ApiClient`, `normalizeApiError` for 3 error shapes, `dataMode.ts`. | Verified: `PluggableThemeStorage` in `src/theme/themeStorage.ts` provides the exact pattern. BFF error envelopes confirmed: standard domain error `{"error": {...}}`, Geo rejection `{"result": ..., "distance_m": ...}`, and DRF field validation `{"<field>": [...]}`. No external packages needed. | **FEASIBLE** |
| **Phase 2** | **DTO & Mapper Foundation** | DTOs in `src/data/dto/`, pure mappers in `src/data/mappers/` covering auth, events, profile, coordinator, dashboard. | Verified: Matches DRF serializers in `bff/volunteer/serializers.py`, `bff/coordinator/serializers.py`, `bff/checkin/serializers.py`. `ProfileUpdateSerializer` has exactly the 20 allow-listed fields. `EventCreateSerializer` enums (`first_experienced`, `arranged_outside_system`) confirmed. Pure mapper functions prevent schema coupling. | **FEASIBLE** |
| **Phase 3** | **Endpoint Modules, HTTP Repos & DI Bridge** | `authApi`, `eventApi`, `profileApi`, `coordinatorApi`, `Http*Repository`, `RepositoryProvider`, screen decoupling. | Verified: Clean decoupling of the 7 coordinator/event screens. `AppProviders.tsx` can cleanly mount `<RepositoryProvider>`. Existing screen tests that pass mock props will continue to work without regression. | **FEASIBLE** |
| **Phase 4** | **Auth & Session Integration** | `OtpLoginScreen`, `UserContext` HTTP bootstrapping via `GET /me/` + `GET /me/coordinator/`, logout, drawer toggle. | Verified: `OtpRequestView` (`/api/v1/auth/otp/request/`), `OtpVerifyView` (`/api/v1/auth/otp/verify/`), and `LogoutView` (`/api/v1/auth/logout/`, returning 204) exist and behave exactly as expected. Profile snapshot integrates seamlessly with `UserContext`. | **FEASIBLE** |
| **Phase 5** | **Volunteer Read Experiences** | Public event feed, event detail + application status, dashboard summary, profile eligibility. | Verified: `list_public_events` supports allow-listed query params (use `starts_after`, `starts_before`, `upcoming`). Dashboard verified hours calculation replaces hardcoded formula. Rule W34 in `coordinator_service.py` confirmed (requires verified identity). | **FEASIBLE** (Apply param mapping from Finding 1) |
| **Phase 6** | **Volunteer Mutations** | Profile update (`PATCH /me/`), charity interests (`PUT /me/charity-interests/`), availability read-modify-write (`PUT /me/availability/`), application submit/withdraw, assignment confirm/cancel. | Verified: `application_service.withdraw_application` allows `accepted` applications (updating `canWithdraw` in `MyApplicationsScreen` is valid). Availability replacement serializer `AvailabilityRulesReplaceSerializer` requires the full rules array. Assignment confirm endpoint `POST /assignments/{id}/confirm/` exists. | **FEASIBLE** |
| **Phase 7** | **Coordinator Workspace Integration** | Managed events, create event wizard, event lifecycle transitions, applications review, assignments (`auto-assign`, `manual-assign`). | Verified: `CoordinatorEventListCreateView`, `EventPublishView`, `EventActivateView`, `EventCompleteView`, `EventCancelView`, `EventHandoverView`, `EventRetakeView` exist. `ManualAssignSerializer` takes `application_id`, `post_id`, `group_code`, `is_group_leader`. Roster fallback for unprovided route `eventId` is sound. | **FEASIBLE** |
| **Phase 8** | **Onboarding, QR, Attendance & Feedback** | Onboarding ack, QR resolve/redeem, Geo check-in, checkout, manual check-in, coordinator confirmations, feedback. | Verified: All 11 checkin endpoints exist in `bff/checkin/urls.py`. Manual check-in payload requires `{ event_id, user_id, note }`. Checkout must use `/attendance/{attendance_id}/checkout/`. Feedback submission matches `FeedbackSubmitSerializer`. | **FEASIBLE** (Strict adherence to checkout URL) |
| **Phase 9** | **Stabilization, Diagnostics & Release Readiness** | Diagnostic panel in `SettingsScreen`, cache clear on logout, E2E test suite, 0 backend/DB changes audit. | Verified: Cache reset helpers (`resetDiscoveryCache`, `resetApplicationsCache`, `resetAssignmentsCache`) are already exported in the respective screens. Diagnostic panel can ping `GET /api/v1/charity-fields/`. Zero backend modifications confirmed. | **FEASIBLE** |

---

## 4. Comprehensive Backend BFF Endpoint Verification Table

Every single endpoint referenced in the execution prompts was verified directly against `backend/bff/urls.py`, sub-app `urls.py`, views, and DRF serializers:

| Method | Endpoint Path | BFF View Name | Auth Required | Request Payload / Query Params | Response Shape / Code |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/otp/request/` | `OtpRequestView` | No (`AllowAny`) | `{ phone, purpose?: 'login' }` | `{ status, dev_code? }` (200) |
| `POST` | `/api/v1/auth/otp/verify/` | `OtpVerifyView` | No (`AllowAny`) | `{ phone, code, purpose?: 'login', display_name? }` | `{ token, user: { id, uuid, display_name } }` (200) |
| `POST` | `/api/v1/auth/logout/` | `LogoutView` | Yes (`IsAuthenticated`) | None | 204 No Content |
| `GET` | `/api/v1/charity-fields/` | `CharityFieldsListView` | No | None | `{ results: [{ code, label, sort_order }] }` (200) |
| `GET` | `/api/v1/events/` | `PublicEventListView` | No | `search`, `charity_field`, `starts_after`, `starts_before`, `upcoming`, `status`, `meals_provided`, etc. | Paginated `{ count, next, previous, results: [PublicEventDto] }` (200) |
| `GET` | `/api/v1/events/{id}/` | `PublicEventDetailView` | No | None | `PublicEventDetailDto` (200) |
| `GET` | `/api/v1/events/{id}/posts/` | `PublicEventPostsView` | No | None | `{ results: [PublicEventPostDto] }` (200) |
| `GET` | `/api/v1/me/` | `MeProfileView` | Yes | None | `UserProfileDto` (200) |
| `PATCH` | `/api/v1/me/` | `MeProfileView` | Yes | 20 allow-listed fields (`display_name`, `home_area`, etc.) | `UserProfileDto` (200) |
| `GET` | `/api/v1/me/charity-interests/` | `MeCharityInterestsView` | Yes | None | `{ field_codes: string[] }` (200) |
| `PUT` | `/api/v1/me/charity-interests/` | `MeCharityInterestsView` | Yes | `{"field_codes": string[]}` | `{ field_codes: string[] }` (200) |
| `GET` | `/api/v1/me/availability/` | `MeAvailabilityView` | Yes | None | `{ rules: [...], exceptions: [...] }` (200) |
| `PUT` | `/api/v1/me/availability/` | `MeAvailabilityRulesView` | Yes | `{"rules": [{ weekday, start_time, end_time }]}` | `{ rules: [...] }` (200) |
| `POST` | `/api/v1/me/availability/exceptions/` | `MeAvailabilityExceptionsView` | Yes | `{ date, is_available, start_time?, end_time?, note? }` | Created exception (201) |
| `DELETE`| `/api/v1/me/availability/exceptions/{id}/` | `MeAvailabilityExceptionDetailView` | Yes | None | 204 No Content |
| `GET` | `/api/v1/me/verification-images/` | `MeVerificationImagesView` | Yes | None | `{ verification_status, images: [...] }` (200) |
| `GET` | `/api/v1/me/coordinator/` | `MeCoordinatorView` | Yes | None | `{"coordinator": {...} \| null}` (200) |
| `POST` | `/api/v1/me/coordinator/` | `MeCoordinatorView` | Yes | `{"notes": string}` | `{"coordinator": {...}}` (201) |
| `POST` | `/api/v1/events/{id}/apply/` | `EventApplyView` | Yes | `{ post_id?, source?, note? }` | `ApplicationStatusDto` (201) |
| `GET` | `/api/v1/me/applications/` | `MyApplicationsView` | Yes | `event_id?` | `{ results: [VolunteerApplicationDto] }` (200) |
| `POST` | `/api/v1/applications/{id}/withdraw/` | `ApplicationWithdrawView` | Yes | None | Updated application (200) |
| `GET` | `/api/v1/me/assignments/` | `MyAssignmentsView` | Yes | None | `{ results: [VolunteerAssignmentDto] }` (200) |
| `POST` | `/api/v1/assignments/{id}/confirm/` | `AssignmentConfirmView` | Yes | None | Updated assignment (200) |
| `POST` | `/api/v1/assignments/{id}/cancel/` | `AssignmentCancelView` | Yes | `{"reason": string}` | Updated assignment (200) |
| `GET` | `/api/v1/me/attendance/` | `UserAttendanceHistoryView` | Yes | None | `{ results: [AttendanceHistoryItemDto] }` (200) |
| `GET` | `/api/v1/me/feedback/` | `MyFeedbackView` | Yes | None | `{ results: [...], summary: {...} }` (200) |
| `GET` | `/api/v1/coordinator/events/` | `CoordinatorEventListCreateView` | Yes (Coordinator) | None | `{ results: [CoordinatorEventListItemDto] }` (200) |
| `POST` | `/api/v1/coordinator/events/` | `CoordinatorEventListCreateView` | Yes (Coordinator) | `EventCreateSerializer` allow-list | Created event (201) |
| `GET` | `/api/v1/coordinator/events/{id}/summary/` | `EventSummaryView` | Yes (Coordinator) | None | `EventSummaryViewDto` (200) |
| `POST` | `/api/v1/events/{id}/publish\|activate\|complete\|cancel/` | `EventPublishView`, etc. | Yes (Coordinator) | `{"reason": ...}` on cancel | Updated event (200) |
| `POST` | `/api/v1/events/{id}/handover\|retake/` | `EventHandoverView`, `EventRetakeView` | Yes (Coordinator) | `{ new_coordinator_user_id, reason }` | Updated event (200) |
| `GET` | `/api/v1/coordinator/events/{id}/applications/` | `CoordinatorEventApplicationsView` | Yes (Coordinator) | `status?` | `{ results: [CoordinatorApplicationDto] }` (200) |
| `POST` | `/api/v1/applications/{id}/{action}/` | `ApplicationDecisionView` | Yes (Coordinator) | `accept`, `reject`, `waitlist` | Updated application (200) |
| `POST` | `/api/v1/coordinator/events/{id}/auto-assign/` | `EventAutoAssignView` | Yes (Coordinator) | None | `{ event_id, newly_assigned }` (200) |
| `POST` | `/api/v1/coordinator/events/{id}/manual-assign/` | `EventManualAssignView` | Yes (Coordinator) | `{ application_id, post_id?, group_code?, is_group_leader? }` | Assignment result (200) |
| `GET` | `/api/v1/coordinator/events/{id}/unassigned/` | `EventUnassignedView` | Yes (Coordinator) | None | `{ results: [...] }` (200) |
| `GET` | `/api/v1/coordinator/events/{id}/assignments/` | `EventAssignmentsView` | Yes (Coordinator) | None | `{ results: [...] }` (200) |
| `GET` | `/api/v1/coordinator/events/{id}/attendance/` | `CoordinatorAttendanceBoardView` | Yes (Coordinator) | None | `{ results: [AttendanceRosterDto] }` (200) |
| `GET` | `/api/v1/coordinator/events/{id}/attendance/pending/` | `CoordinatorPendingConfirmationsView` | Yes (Coordinator) | None | `{ results: [...] }` (200) |
| `POST` | `/api/v1/coordinator/attendance/{id}/confirm\|reject/` | `CoordinatorConfirmAttendanceView` / `Reject` | Yes (Coordinator) | `{ reason? }` on reject | Updated attendance (200) |
| `POST` | `/api/v1/attendance/manual-checkin/` | `AttendanceManualCheckinView` | Yes (Coordinator) | `{"event_id": num, "user_id": num, "note": str}` | Created attendance (200) |
| `GET` | `/api/v1/events/{id}/onboarding/` | `EventOnboardingView` | Yes | None | Onboarding content & ack status (200) |
| `POST` | `/api/v1/events/{id}/onboarding/acknowledge/` | `EventOnboardingAcknowledgeView` | Yes | None | `{"acknowledged": true, ...}` (200) |
| `POST` | `/api/v1/qr/resolve/` | `QrResolveView` | No (`AllowAny`) | `{"token": string}` | Token metadata preview (200) |
| `POST` | `/api/v1/qr/redeem/` | `QrRedeemView` | Yes | `{"token": string}` | Redemption result (200) |
| `POST` | `/api/v1/attendance/qr-checkin/` | `AttendanceQrCheckinView` | Yes | `{"token": string}` | Check-in result (200) |
| `POST` | `/api/v1/attendance/geo-checkin/` | `AttendanceGeoCheckinView` | Yes | `{ event_id, latitude, longitude, accuracy_m, is_mocked }` | `{ success: true }` (200) or `{ success: false, result: "outside_geofence", distance_m: ... }` (400) |
| `POST` | `/api/v1/attendance/{attendance_id}/checkout/` | `AttendanceCheckoutView` | Yes | None | `{"id": num, "status": "completed", "checkout_at": ...}` (200) |
| `POST` | `/api/v1/events/{id}/feedback/` | `EventFeedbackSubmitView` | Yes | `{ direction, score, tags, comment, target_user_id }` | Created feedback (201) |

---

## 5. Mobile Frontend Codebase Verification Table

| File Path | Role in Plan | Verification Status | Notes |
|---|---|---|---|
| `mobile/src/theme/themeStorage.ts` | Storage template for `tokenStore.ts` | **Confirmed** | Uses `PluggableThemeStorage` with dynamic `@react-native-async-storage/async-storage` loading and `MemoryThemeStorage` fallback. |
| `mobile/src/app/UserContext.tsx` | Auth session integration | **Confirmed** | Holds `currentUser`, `isCoordinator`, and `switchUserPreset`. Can be cleanly extended with `isAuthenticated`, `isBootstrapping`, and token lifecycle. |
| `mobile/src/app/AppProviders.tsx` | Top-level provider wrapper | **Confirmed** | Currently mounts `SafeAreaProvider`, `ThemeProvider`, `UserProvider`. Ready for `<RepositoryProvider>`. |
| `mobile/src/app/AppRoot.tsx` | Root navigator mounting | **Confirmed** | Renders `MainDrawerNavigator`. Ready for conditional `OtpLoginScreen` when unauthenticated in HTTP mode. |
| `mobile/src/navigation/MainDrawerContent.tsx` | Drawer menu & QA switcher | **Confirmed** | Bottom QA demo switcher (lines 300–377) can be hidden when `dataMode === 'http'`. |
| `mobile/src/features/dashboard/screens/DashboardScreen.tsx` | Dashboard screen | **Confirmed** | Hero text on line 137 contains the hardcoded `{summary.completedShiftCount * 3 + 4} hours` formula to be replaced. |
| `mobile/src/features/dashboard/components/UpcomingCommitmentCard.tsx` | Upcoming commitment card | **Pre-existing issue** | Line 168 comparison error TS2367 (`status !== 'completed'`) should be fixed. |
| `mobile/src/features/events/screens/EventDiscoveryScreen.tsx` | Event discovery screen | **Confirmed** | Types `repository?: MockEventRepository`. Exports `resetDiscoveryCache()`. Ready for `EventRepository` interface. |
| `mobile/src/features/events/screens/EventDetailScreen.tsx` | Event detail screen | **Confirmed** | Types `repository?: MockEventRepository`. Ready for `EventRepository` interface. |
| `mobile/src/features/events/screens/MyApplicationsScreen.tsx` | Applications screen | **Confirmed** | Line 301 restricts withdrawal to `pending \| waitlisted`. Ready to allow `accepted`. Exports `resetApplicationsCache()`. |
| `mobile/src/features/events/screens/MyAssignmentsScreen.tsx` | Assignments screen | **Confirmed** | Types `repository?: MockEventRepository`. Exports `resetAssignmentsCache()`. Ready for `confirmAssignment` support. |
| `mobile/src/features/profile/screens/ProfileScreen.tsx` | Volunteer profile screen | **Confirmed** | Types `repository?: typeof defaultProfileRepository`. Ready for `ProfileRepository`. |
| `mobile/src/features/profile/screens/AvailabilityScreen.tsx` | Weekly availability screen | **Confirmed** | Uses single-rule save/delete. Ready for read-modify-write adapter in `HttpProfileRepository`. |
| `mobile/src/features/coordinator/screens/CoordinatorApplicationsScreen.tsx` | Applications review | **Confirmed** | Hardcodes `defaultCoordinatorRepository` directly and `route.params.eventId ?? 'evt-coord-001'`. Ready for DI. |
| `mobile/src/features/coordinator/screens/CoordinatorAssignmentsScreen.tsx` | Assignments screen | **Confirmed** | Hardcodes `defaultCoordinatorRepository` and `'post-manual'`. Ready for dynamic post resolution and DI. |
| `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx` | Attendance roster screen | **Confirmed** | Hardcodes `defaultCoordinatorRepository`. Ready for DI and manual checkin with `{ event_id, user_id }`. |

---

## 6. Execution Guidelines for Antigravity Coding Agent

When implementing Phase 0 through Phase 9 sequentially:

1. **Phase 0 Execution:**
   - Execute baseline commands inside `mobile/`: `cd mobile; npm test -- --watchAll=false` and `npx tsc --noEmit`.
   - Explicitly cite the 2 pre-existing TypeScript errors in the Phase 0 Baseline Report so baseline freeze passes cleanly.
   - Do NOT edit any application files during Phase 0.

2. **Phase 1 Execution:**
   - Create `src/core/` and its subdirectories (`api/`, `auth/`).
   - Fix the 2 baseline TypeScript errors during Phase 1 so all subsequent phases enforce a strict zero-error `tsc --noEmit` gate.

3. **Phase 2 & Phase 5 Execution:**
   - When implementing `eventMapper` and `HttpEventRepository.getEvents`, use `starts_after`, `starts_before`, and `upcoming` for date and availability filtering (avoid `start_after`, `end_before`, `available_only`).
   - In `profileMapper`, map `dto.phone ?? 'Verified Phone Account'` to `email` to maintain UI compatibility without altering screen layouts.

4. **Phase 6 Execution:**
   - In `HttpProfileRepository.updateProfile`, strictly filter fields against the 20 allow-listed fields of `ProfileUpdateSerializer`. Route `charityInterests` to `PUT /api/v1/me/charity-interests/`.
   - In `HttpProfileRepository` availability methods, implement the read-modify-write wrapper over `PUT /api/v1/me/availability/`.

5. **Phase 7 & Phase 8 Execution:**
   - In `CoordinatorAssignmentsScreen.tsx`, ensure manual assignment looks up the application's actual `postId`.
   - In `CoordinatorAttendanceScreen.tsx` and `HttpCoordinatorRepository.manualCheckIn`, pass `{ event_id: Number(eventId), user_id: Number(userId) }`.
   - In `HttpEventRepository.checkOutAttendance`, call `POST /api/v1/attendance/{attendance_id}/checkout/`.

---

## 7. Conclusion

The execution prompts in `reference/v0_10_0_phase_by_phase_execution_prompts.md` represent a sound, highly disciplined, and non-invasive integration roadmap. They preserve the existing React Native UI and PostgreSQL database while establishing a production-grade Presentation/Domain/Data layer.

Following the clarifications and precautions highlighted in this report will ensure flawless sequential execution across all 10 phases.
