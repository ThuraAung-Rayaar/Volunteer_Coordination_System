# Phase 0 Discovery & Baseline Freeze Report
## v0.10.0 Mobile Backend & Django BFF Integration Plan

**Document Version:** 1.0.0  
**Status:** Baseline Frozen & Verified  
**Date:** 2026-11-15  
**Author:** Antigravity AI Assistant  
**Repository Branch:** `mobile`  
**Git Commit Baseline:** `de074af` (`initial mobile state`)  
**Workspace Root:** `c:\Users\USER\Documents\INTERN\Project\Volunteer_HR_Management\python_stack`  
**Mobile Subproject:** `mobile/`  
**Backend Subproject:** `backend/` (`bff/`, `services/`, `common/`, `config/`)  
**Database Authority:** PostgreSQL v0.6.0 (`postgres_sql/`) — Strictly Unmodified  

---

## 1. Executive Summary & Baseline Freeze Declaration

This report fulfills **Phase 0 (Discovery & Baseline Freeze)** of the *v0.10.0 Mobile Backend & Django BFF Integration Plan*. 

### Strict Non-Invasive Enforcement
1. **Zero Database Modifications:** No PostgreSQL SQL definitions, migrations, triggers, stored procedures, table constraints, or seed files were altered or invoked.
2. **Zero Backend Modifications:** No Django files under `backend/bff/`, `backend/services/`, `backend/common/`, `backend/admin_portal/`, `backend/apps/`, or `backend/config/` were altered.
3. **Zero Mobile Code/Test Alterations:** All application source code (`mobile/src/`), mocks (`mobile/src/data/mock/`), theme tokens (`mobile/src/theme/`), and test suites (`mobile/__tests__/`) remain byte-for-byte identical to commit `de074af`.
4. **Zero Dependency Changes:** No npm packages were added (`package.json` retains its exact dependencies; native `fetch` and pluggable storage pattern are preserved).

---

## 2. Baseline Test & Typecheck Verification Results

All verification commands were executed within the `mobile/` project directory:

### 2.1 Jest Test Suite
- **Command:** `cd mobile; npm test -- --watchAll=false`
- **Result:** **100% PASS**
  - **Test Suites:** 13 passed, 13 total
  - **Tests:** 192 passed, 192 total
  - **Snapshots:** 0 total
  - **Execution Duration:** ~10.3 seconds
  - **Summary of Passing Suites:**
    - `__tests__/theme.test.tsx` (PASS)
    - `__tests__/friends.test.tsx` (PASS)
    - `__tests__/sharedComponents.test.tsx` (PASS)
    - `__tests__/settings.test.tsx` (PASS)
    - `__tests__/coordinatorOperations.test.tsx` (PASS)
    - `__tests__/mockIdentityAndState.test.tsx` (PASS)
    - `__tests__/profile.test.tsx` (PASS)
    - `__tests__/coordinator.test.tsx` (PASS)
    - `__tests__/dashboard.test.tsx` (PASS)
    - `__tests__/scheduleTimezone.test.tsx` (PASS)
    - `__tests__/events.test.tsx` (PASS)
    - `__tests__/navigation.test.tsx` (PASS)
    - `__tests__/App.test.tsx` (PASS)

### 2.2 TypeScript Typecheck
- **Command:** `cd mobile; npx tsc --noEmit`
- **Result:** **Exit code 1** (Identified exactly **2 pre-existing baseline type errors**):
  1. `__tests__/theme.test.tsx(268,11): error TS2740`: Missing properties from `Record<IconName, string>` (`clock`, `cal`, `pin`, `home`, and 10 others) in the mock theme fixture. New icons were added to `IconName` in `src/shared/components/AppIcon.tsx` without updating this mock test dictionary.
  2. `src/features/dashboard/components/UpcomingCommitmentCard.tsx(168,33): error TS2367`: `commitment.status !== 'completed'` triggers a type comparison error because `DashboardCommitment.status` is strictly union typed as `'assigned' | 'confirmed'`.
- **Freeze Recommendation:** These 2 pre-existing errors are documented here and will be safely resolved during Phase 1 foundation so that subsequent phases enforce a strict zero-error gate.

### 2.3 Linter Baseline
- **Command:** `cd mobile; npm run lint` (`eslint .`)
- **Result:** **Exit code 1** (58 problems: 7 unused-variable errors, 51 inline style warnings in pre-existing UI files). No structural or runtime defects.

---

## 3. Screen Coupling & Repository Typing Audit

Per Task Instruction 2, the mobile codebase was audited to locate direct concrete mock couplings and non-contract repository typings that must be decoupled in Phase 3.

### 3.1 Three Coordinator Screens Importing `defaultCoordinatorRepository` Directly
These 3 screens bypass prop injection and import the singleton `defaultCoordinatorRepository` directly from `src/data/mock/MockCoordinatorRepository`:

| Screen File | Import Line | Current Direct Call Usage | Required Adaptation (Phase 3/7) |
|---|---|---|---|
| `src/features/coordinator/screens/CoordinatorApplicationsScreen.tsx` | Line 13: `import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';` | `defaultCoordinatorRepository.getMyEvents()`, `defaultCoordinatorRepository.getApplications(selectedEventId)` | Introduce `repository?: CoordinatorRepository` in screen props with fallback to `useRepositories().coordinatorRepository`. |
| `src/features/coordinator/screens/CoordinatorAssignmentsScreen.tsx` | Line 13: `import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';` | `defaultCoordinatorRepository.getMyEvents()`, `getAssignments(...)`, `getUnassignedApplications(...)`, `runAutoAssignment(...)`, `assignVolunteerManually(...)` | Introduce `repository?: CoordinatorRepository` in screen props with fallback to DI provider. |
| `src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx` | Line 13: `import { defaultCoordinatorRepository } from '../../../data/mock/MockCoordinatorRepository';` | `defaultCoordinatorRepository.getMyEvents()`, `getAttendanceRoster(...)`, `getPendingGeoConfirmations(...)`, `confirmGeoAttendance(...)`, `rejectGeoAttendance(...)`, `manualCheckIn(...)` | Introduce `repository?: CoordinatorRepository` in screen props with fallback to DI provider. |

### 3.2 Four Event Screens Typing `repository?: MockEventRepository`
These 4 screens define a prop for dependency injection, but specify the concrete mock class rather than the abstract repository contract `EventRepository`:

| Screen File | Lines | Current Prop Signature | Required Contract Interface (Phase 3/5) |
|---|---|---|---|
| `src/features/events/screens/EventDiscoveryScreen.tsx` | Lines 70–73 | `export interface EventDiscoveryScreenProps extends Partial<MainDrawerScreenProps<'Events'>> { repository?: MockEventRepository; }` | Change to `repository?: EventRepository;` |
| `src/features/events/screens/EventDetailScreen.tsx` | Lines 39–43 | `export interface EventDetailScreenProps extends Partial<MainDrawerScreenProps<'EventDetail'>> { eventId?: string; repository?: MockEventRepository; }` | Change to `repository?: EventRepository;` |
| `src/features/events/screens/MyApplicationsScreen.tsx` | Lines 61–64 | `export interface MyApplicationsScreenProps extends Partial<MainDrawerScreenProps<'MyApplications'>> { repository?: MockEventRepository; }` | Change to `repository?: EventRepository;` |
| `src/features/events/screens/MyAssignmentsScreen.tsx` | Lines 63–66 | `export interface MyAssignmentsScreenProps extends Partial<MainDrawerScreenProps<'MyAssignments'>> { repository?: MockEventRepository; }` | Change to `repository?: EventRepository;` |

### 3.3 Additional Discovered Repository Typings
- `src/features/profile/screens/ProfileScreen.tsx` (Line 33): Types `repository?: typeof defaultProfileRepository;` instead of `ProfileRepository`.
- `src/features/profile/screens/AvailabilityScreen.tsx` (Line 38): Types `repository?: typeof defaultProfileRepository;` instead of `ProfileRepository`.
- `src/features/dashboard/screens/DashboardScreen.tsx` (Line 36): Properly uses `repository?: IDashboardRepository;` (matches target architecture).

---

## 4. Existing Path Inventory & Responsibility Matrix

The table below catalogs every existing module across `mobile/src/`, detailing its current responsibility, planned integration category (**Retained**, **Extended**, **Adapted**, or **Untouched**), and risk profile:

| Path | Current Responsibility | Action Category | Proposed Integration Point | Risk Level |
|---|---|---|---|---|
| **App Shell (`src/app/`)** | | | | |
| `src/app/AppRoot.tsx` | Top-level mounting of providers & `NavigationContainer` | **Extended** | Wrap with `<RepositoryProvider>` and conditional auth gate in Phase 4 | Low |
| `src/app/AppProviders.tsx` | Wraps `SafeAreaProvider`, `ThemeProvider`, `UserProvider` | **Extended** | Mount `<RepositoryProvider>` beneath `UserProvider` in Phase 3 | Low |
| `src/app/UserContext.tsx` | Manages active user snapshot & preset switching | **Extended** | Integrate session bootstrapping via `GET /me/` + token store in Phase 4 | Low |
| `src/app/TemporaryRootScreen.tsx` | Preview harness for component gallery | **Untouched** | Preserved for component development | None |
| **Navigation (`src/navigation/`)** | | | | |
| `src/navigation/routeNames.ts` | Centralized route name constants | **Extended** | Add `OtpLogin` route name in Phase 4 | Low |
| `src/navigation/navigationTypes.ts` | Drawer navigation param list & prop types | **Extended** | Add `OtpLogin` parameter typing in Phase 4 | Low |
| `src/navigation/MainDrawerNavigator.tsx` | Drawer screen registrations | **Extended** | Add `OtpLogin` screen entry (or unauthenticated stack) | Low |
| `src/navigation/MainDrawerContent.tsx` | Custom drawer side-menu, user card, demo user switcher | **Adapted** | Hide demo QA user preset switcher when in `http` mode (Phase 4/9) | Low |
| `src/navigation/index.ts` | Navigation barrel exports | **Retained** | Re-export new navigation types | None |
| **Domain Models (`src/domain/models/`)** | | | | |
| `src/domain/models/dashboard.ts` | CompletedActivity, UpcomingCommitment, DashboardSummary | **Retained** | Consumed by `HttpDashboardRepository` | None |
| `src/domain/models/event.ts` | EventSummary, EventDetail, EventPost, Application/Assignment types | **Retained** | Consumed by `HttpEventRepository` | None |
| `src/domain/models/profile.ts` | VolunteerProfile, Capabilities, Support/Donation preferences | **Retained** | Consumed by `HttpProfileRepository` | None |
| `src/domain/models/availability.ts` | WeeklyAvailabilityRule, AvailabilityException, VolunteerAvailability | **Retained** | Consumed by availability adapters | None |
| `src/domain/models/verification.ts` | VerificationStatus, VerificationImageSlot, CoordinatorEligibilityData | **Retained** | Consumed by verification adapters | None |
| `src/domain/models/coordinator.ts` | CoordinatorEventSummary, Detail, WizardDraft, Application/Assignment/Attendance items | **Retained** | Consumed by `HttpCoordinatorRepository` | None |
| `src/domain/models/index.ts` | UserProfileSnapshot, CoordinatorStatus, hasCoordinatorAccess | **Retained** | Core auth & capability gates | None |
| **Repository Contracts (`src/data/contracts/`)** | | | | |
| `src/data/contracts/dashboardRepository.ts` | `IDashboardRepository` interface | **Retained** | Implemented by both mock & HTTP repositories | None |
| `src/data/contracts/eventRepository.ts` | `EventRepository` interface | **Extended** | Add optional `confirmAssignment?` method | Low |
| `src/data/contracts/profileRepository.ts` | `ProfileRepository` interface | **Retained** | Implemented by both mock & HTTP repositories | None |
| `src/data/contracts/coordinatorRepository.ts` | `CoordinatorRepository` interface | **Retained** | Implemented by both mock & HTTP repositories | None |
| `src/data/contracts/index.ts` | Contract barrel exports | **Retained** | Re-export all repository interfaces | None |
| **Mock Implementations (`src/data/mock/`)** | | | | |
| `src/data/mock/MockDashboardRepository.ts` | In-memory dashboard mock implementation | **Untouched** | Preserved for mock fallback / offline demo | None |
| `src/data/mock/MockEventRepository.ts` | In-memory event mock implementation | **Untouched** | Preserved for mock fallback / offline demo | None |
| `src/data/mock/MockProfileRepository.ts` | In-memory profile mock implementation | **Untouched** | Preserved for mock fallback / offline demo | None |
| `src/data/mock/MockCoordinatorRepository.ts` | In-memory coordinator mock implementation | **Untouched** | Preserved for mock fallback / offline demo | None |
| `src/data/mock/mockUtils.ts` | Mock delay, ID generators, clone utilities | **Untouched** | Internal mock utility | None |
| `src/data/mock/fixtures/*` | Demo users, event, profile, coordinator, dashboard mock fixtures | **Untouched** | Deterministic mock data | None |
| `src/data/mock/index.ts` | Mock barrel exports | **Retained** | Re-export mock repositories | None |
| **Dashboard Feature (`src/features/dashboard/`)** | | | | |
| `src/features/dashboard/screens/DashboardScreen.tsx` | Volunteer dashboard screen | **Adapted** | Replace hardcoded hour formula (line 137) with real verified hours | Low |
| `src/features/dashboard/hooks/useDashboard.ts` | Dashboard state hook | **Retained** | Consumes injected repository | None |
| `src/features/dashboard/components/UpcomingCommitmentCard.tsx` | Upcoming shift card | **Adapted** | Fix line 168 TS2367 status comparison | Low |
| `src/features/dashboard/components/*` | ActivityStatCard, CompletedEventCard, CoordinatorDashboardCard | **Untouched** | Visual components preserved | None |
| **Events Feature (`src/features/events/`)** | | | | |
| `src/features/events/screens/EventDiscoveryScreen.tsx` | Event feed and filter UI | **Adapted** | Change `repository` prop type to `EventRepository` | Low |
| `src/features/events/screens/EventDetailScreen.tsx` | Event detail, posts, application modal | **Adapted** | Change `repository` prop type to `EventRepository` | Low |
| `src/features/events/screens/MyApplicationsScreen.tsx` | User applications list & withdraw action | **Adapted** | Change `repository` prop type to `EventRepository`; enable withdrawal for accepted | Low |
| `src/features/events/screens/MyAssignmentsScreen.tsx` | User shifts list & cancel action | **Adapted** | Change `repository` prop type to `EventRepository`; support confirm action | Low |
| `src/features/events/screens/EventsScreen.tsx` | Tab/container screen for events | **Untouched** | Renders `EventDiscoveryScreen` | None |
| `src/features/events/components/*` | EventCard, EventPostCard, EventFilterSheet, CharityCategoryChips | **Untouched** | Presentation UI preserved | None |
| **Profile Feature (`src/features/profile/`)** | | | | |
| `src/features/profile/screens/ProfileScreen.tsx` | Profile view & edit trigger | **Adapted** | Change `repository` prop type to `ProfileRepository` | Low |
| `src/features/profile/screens/ProfileEditScreen.tsx` | Profile edit form | **Untouched** | Dispatches to ProfileScreen repository | None |
| `src/features/profile/screens/AvailabilityScreen.tsx` | Availability schedule & blackout dates | **Adapted** | Change `repository` prop type to `ProfileRepository` | Low |
| `src/features/profile/screens/VerificationCoordinatorStatusScreen.tsx` | Verification status & coordinator apply | **Untouched** | Consumes profile repository | None |
| **Coordinator Feature (`src/features/coordinator/`)** | | | | |
| `src/features/coordinator/screens/CoordinatorOverviewScreen.tsx` | Coordinator metrics overview | **Retained** | Uses prop repository | Low |
| `src/features/coordinator/screens/CoordinatorWorkspaceScreen.tsx` | Coordinator hub navigator | **Retained** | Uses prop repository | Low |
| `src/features/coordinator/screens/CoordinatorEventsScreen.tsx` | Managed events list | **Retained** | Uses prop repository | Low |
| `src/features/coordinator/screens/CreateEventWizardScreen.tsx` | Multi-step event creation wizard | **Retained** | Uses prop repository | Low |
| `src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx` | Single event management & lifecycle | **Retained** | Uses prop repository | Low |
| `src/features/coordinator/screens/CoordinatorApplicationsScreen.tsx` | Application review screen | **Adapted** | Inject `CoordinatorRepository` prop; remove direct mock import | Low |
| `src/features/coordinator/screens/CoordinatorAssignmentsScreen.tsx` | Assignment & auto-assign console | **Adapted** | Inject `CoordinatorRepository` prop; remove direct mock import | Low |
| `src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx` | Live attendance roster & geo review | **Adapted** | Inject `CoordinatorRepository` prop; remove direct mock import | Low |
| `src/features/coordinator/components/*` | Review cards, rows, guards, headers | **Untouched** | Presentation UI preserved | None |
| **Friends Feature (`src/features/friends/`)** | | | | |
| `src/features/friends/screens/FriendsScreen.tsx` | Social placeholder screen | **Untouched** | Independent of BFF integration | None |
| `src/features/friends/screens/FriendsPlaceholderScreen.tsx` | Visual placeholder | **Untouched** | Independent of BFF integration | None |
| **Settings Feature (`src/features/settings/`)** | | | | |
| `src/features/settings/screens/SettingsScreen.tsx` | App settings, theme toggle, cache stats | **Extended** | Add API connectivity diagnostics panel & token logout button | Low |
| **Shared & Theme (`src/shared/`, `src/theme/`)** | | | | |
| `src/shared/components/*` | AppButton, AppCard, AppIcon, AppInput, AppText, EmptyState, etc. | **Untouched** | Presentation components preserved byte-for-byte | None |
| `src/shared/layout/*` | AppHeader, ScreenContainer | **Untouched** | Layout containers preserved | None |
| `src/shared/utils/*` | dateTimeUtils.ts, profileValidation.ts | **Retained** | Utility functions reused by mappers | None |
| `src/theme/*` | tokens.ts, lightTheme.ts, darkTheme.ts, ThemeProvider.tsx, themeStorage.ts | **Retained** | `themeStorage.ts` serves as direct architecture model for `tokenStore.ts` | None |

---

## 5. Verified Backend BFF Endpoint Contract Table

The authoritative backend was audited directly against `backend/config/urls.py`, `backend/bff/urls.py`, sub-app route modules, DRF views, and `backend/schema.yml`.

### 5.1 Global Network Contract Baseline
- **Global API Path Prefix:** `/api/v1/` (configured in `backend/config/urls.py` line 12: `path('api/v1/', include('bff.urls'))`).
- **DRF Authentication Class:** `common.authentication.BlockedAwareTokenAuthentication` (configured in `backend/config/settings/base.py` line 121, subclassing DRF `TokenAuthentication`).
- **Required HTTP Header:** `Authorization: Token <token_key>` (verified in `backend/schema.yml` lines 6991–6995).
- **Standard Error Response Shape:** Handled by `common.exceptions.custom_exception_handler` (`backend/common/exceptions.py` lines 377–430):
  ```json
  {
    "error": {
      "code": "capacity_full",
      "message": "No places remaining for this role or event."
    }
  }
  ```
- **Geo-Checkin Error Envelope:**
  ```json
  {
    "success": false,
    "result": "outside_geofence",
    "distance_m": 142.5
  }
  ```
- **DRF Validation Error Envelope:** Standard DRF dictionary formatted into `{"error": {"code": "validation_error", "message": "<field>: <details>"}}`.

---

### 5.2 Complete Verified Endpoint Registry

| HTTP Method | Exact Endpoint Route | Django View Class | Auth Required | Request Payload / Query Params | Expected Success Response | Privacy Tier | Notes / Constraints |
|---|---|---|---|---|---|---|---|
| **Authentication (`bff.auth`)** | | | | | | | |
| `POST` | `/api/v1/auth/otp/request/` | `OtpRequestView` | No (`AllowAny`) | `{"phone": str, "purpose"?: "login"}` | `{"status": "queued", "dev_code"?: "123456"}` (200) | T0 | Dev mode returns `dev_code` |
| `POST` | `/api/v1/auth/otp/verify/` | `OtpVerifyView` | No (`AllowAny`) | `{"phone": str, "code": str, "display_name"?: str}` | `{"token": str, "user": {"id": int, "uuid": str, "display_name": str}}` (200) | T1 | Returns 40-char DRF token |
| `POST` | `/api/v1/auth/logout/` | `LogoutView` | Yes (`IsAuthenticated`) | None | HTTP 204 No Content | T1 | Deletes DRF auth token in DB |
| **Volunteer Public Events & Taxonomy (`bff.volunteer`)** | | | | | | | |
| `GET` | `/api/v1/charity-fields/` | `CharityFieldsListView` | No (`AllowAny`) | None | `{"results": [{"code": str, "label": str, "sort_order": int}]}` (200) | T0 | Standard 13 categories |
| `GET` | `/api/v1/events/` | `PublicEventListView` | No (`AllowAny`) | Query: `search`, `charity_field`, `starts_after`, `starts_before`, `upcoming`, `status` | Paginated: `{"count": int, "next": str\|null, "previous": str\|null, "results": [...]}` (200) | T0 | **Must use `starts_after`/`starts_before`/`upcoming` (not `start_after`)** |
| `GET` | `/api/v1/events/{id}/` | `PublicEventDetailView` | No (`AllowAny`) | None | Composite event detail JSON (200) | T0 | Includes posts and location |
| `GET` | `/api/v1/events/{id}/posts/` | `PublicEventPostsView` | No (`AllowAny`) | None | `{"results": [EventPostDto]}` (200) | T0 | Headcount and physical level |
| **Volunteer Profile & Availability (`bff.volunteer`)** | | | | | | | |
| `GET` | `/api/v1/me/` | `MeProfileView` | Yes (`IsAuthenticated`) | None | Full `UserProfileDto` (200) | T1/T3 | System status + allow-list |
| `PATCH` | `/api/v1/me/` | `MeProfileView` | Yes (`IsAuthenticated`) | Exactly 20 allow-listed fields (`display_name`, `home_area`, etc.) | Updated `UserProfileDto` (200) | T1/T3 | Unapproved fields rejected |
| `GET` | `/api/v1/me/charity-interests/` | `MeCharityInterestsView` | Yes (`IsAuthenticated`) | None | `{"field_codes": string[]}` (200) | T1 | User's charity interests |
| `PUT` | `/api/v1/me/charity-interests/` | `MeCharityInterestsView` | Yes (`IsAuthenticated`) | `{"field_codes": string[]}` | `{"field_codes": string[]}` (200) | T1 | Atomic replacement |
| `GET` | `/api/v1/me/availability/` | `MeAvailabilityView` | Yes (`IsAuthenticated`) | None | `{"rules": [...], "exceptions": [...]}` (200) | T1 | Weekly rules & blackouts |
| `PUT` | `/api/v1/me/availability/rules/` | `MeAvailabilityRulesView` | Yes (`IsAuthenticated`) | `{"rules": [{"weekday": int, "start_time": str, "end_time": str}]}` | `{"rules": [...]}` (200) | T1 | Atomic rule list replacement |
| `POST` | `/api/v1/me/availability/exceptions/` | `MeAvailabilityExceptionsView` | Yes (`IsAuthenticated`) | `{"date": str, "is_available": bool, "start_time"?: str, "end_time"?: str, "note"?: str}` | Created exception (201) | T1 | Blackout/special slot |
| `DELETE`| `/api/v1/me/availability/exceptions/{id}/` | `MeAvailabilityExceptionDetailView` | Yes (`IsAuthenticated`) | None | HTTP 204 No Content | T1 | Deletes single exception |
| `GET` | `/api/v1/me/verification-images/` | `MeVerificationImagesView` | Yes (`IsAuthenticated`) | None | `{"verification_status": str, "images": [...]}` (200) | T3 | Verification audit slots |
| `GET` | `/api/v1/me/coordinator/` | `MeCoordinatorView` | Yes (`IsAuthenticated`) | None | `{"coordinator": {...} \| null}` (200) | T1 | Application status & reason |
| `POST` | `/api/v1/me/coordinator/` | `MeCoordinatorView` | Yes (`IsAuthenticated`) | `{"notes": str}` | `{"coordinator": {...}}` (201) | T1 | Apply for coordinator (W34) |
| **Volunteer Applications & Assignments (`bff.volunteer`)** | | | | | | | |
| `POST` | `/api/v1/events/{id}/apply/` | `EventApplyView` | Yes (`IsAuthenticated`) | `{"post_id"?: int, "source"?: str, "note"?: str}` | `ApplicationStatusDto` (201) | T2 | Rule W33/W34 enforcement |
| `GET` | `/api/v1/me/applications/` | `MyApplicationsView` | Yes (`IsAuthenticated`) | Query: `event_id` (optional) | `{"results": [VolunteerApplicationDto]}` (200) | T1/T2 | User's applications |
| `POST` | `/api/v1/applications/{id}/withdraw/` | `ApplicationWithdrawView` | Yes (`IsAuthenticated`) | None | Updated application (200) | T2 | Allows pending & accepted |
| `GET` | `/api/v1/me/assignments/` | `MyAssignmentsView` | Yes (`IsAuthenticated`) | None | `{"results": [VolunteerAssignmentDto]}` (200) | T1/T2 | User's confirmed shifts |
| `POST` | `/api/v1/assignments/{id}/confirm/` | `AssignmentConfirmView` | Yes (`IsAuthenticated`) | None | Updated assignment (200) | T2 | Confirms assignment |
| `POST` | `/api/v1/assignments/{id}/cancel/` | `AssignmentCancelView` | Yes (`IsAuthenticated`) | `{"reason": str}` | Updated assignment (200) | T2 | Cancels participation |
| **Coordinator Management (`bff.coordinator`)** | | | | | | | |
| `GET` | `/api/v1/coordinator/events/` | `CoordinatorEventListCreateView` | Yes (Coordinator) | None | `{"results": [CoordinatorEventListItemDto]}` (200) | T2 | Events managed by user |
| `POST` | `/api/v1/coordinator/events/` | `CoordinatorEventListCreateView` | Yes (Coordinator) | Allow-listed `EventCreateSerializer` fields | Created event (201) | T2 | Creates draft event |
| `GET` | `/api/v1/coordinator/events/{id}/summary/` | `EventSummaryView` | Yes (Coordinator) | None | Full summary composite (200) | T2 | Metrics & monitor flags |
| `POST` | `/api/v1/events/{id}/publish/` | `EventPublishView` | Yes (Coordinator) | None | Updated event (200) | T2 | Draft -> Published |
| `POST` | `/api/v1/events/{id}/activate/` | `EventActivateView` | Yes (Coordinator) | None | Updated event (200) | T2 | Published -> Active |
| `POST` | `/api/v1/events/{id}/complete/` | `EventCompleteView` | Yes (Coordinator) | None | Updated event (200) | T2 | Active -> Completed |
| `POST` | `/api/v1/events/{id}/cancel/` | `EventCancelView` | Yes (Coordinator) | `{"reason": str}` | Updated event (200) | T2 | Cancels entire event |
| `POST` | `/api/v1/events/{id}/handover/` | `EventHandoverView` | Yes (Coordinator) | `{"new_coordinator_user_id": int, "reason": str}` | Updated event (200) | T2 | Transfers event ownership |
| `POST` | `/api/v1/events/{id}/retake/` | `EventRetakeView` | Yes (Coordinator) | None | Updated event (200) | T2 | Reclaims event from monitor |
| `GET` | `/api/v1/coordinator/events/{id}/applications/` | `CoordinatorEventApplicationsView` | Yes (Coordinator) | Query: `status` (optional) | `{"results": [CoordinatorApplicationDto]}` (200) | T2 | Applicant review list |
| `POST` | `/api/v1/applications/{id}/{action}/` | `ApplicationDecisionView` | Yes (Coordinator) | Action in URL (`accept`, `reject`, `waitlist`) | Updated application (200) | T2 | Decision workflow |
| `POST` | `/api/v1/coordinator/events/{id}/auto-assign/` | `EventAutoAssignView` | Yes (Coordinator) | None | `{"event_id": int, "newly_assigned": int}` (200) | T2 | Runs rule-based assigner |
| `POST` | `/api/v1/coordinator/events/{id}/manual-assign/` | `EventManualAssignView` | Yes (Coordinator) | `{"application_id": int, "post_id"?: int, "group_code"?: str, "is_group_leader"?: bool}` | Created assignment (200) | T2 | Manual post assignment |
| `GET` | `/api/v1/coordinator/events/{id}/unassigned/` | `EventUnassignedView` | Yes (Coordinator) | None | `{"results": [CoordinatorApplicationDto]}` (200) | T2 | Accepted without shift |
| `GET` | `/api/v1/coordinator/events/{id}/assignments/` | `EventAssignmentsView` | Yes (Coordinator) | None | `{"results": [CoordinatorAssignmentDto]}` (200) | T2 | Active assignments |
| `GET` | `/api/v1/coordinator/events/{id}/attendance/` | `CoordinatorAttendanceBoardView` | Yes (Coordinator) | None | `{"results": [AttendanceRosterDto]}` (200) | T2 | Full event attendance |
| `GET` | `/api/v1/coordinator/events/{id}/attendance/pending/` | `CoordinatorPendingConfirmationsView` | Yes (Coordinator) | None | `{"results": [AttendancePendingDto]}` (200) | T2 | Geo-checkin approvals |
| `POST` | `/api/v1/coordinator/attendance/{id}/confirm/` | `CoordinatorConfirmAttendanceView` | Yes (Coordinator) | None | Updated attendance (200) | T2 | Approves pending checkin |
| `POST` | `/api/v1/coordinator/attendance/{id}/reject/` | `CoordinatorRejectAttendanceView` | Yes (Coordinator) | `{"reason"?: str}` | Updated attendance (200) | T2 | Rejects checkin attempt |
| `POST` | `/api/v1/attendance/manual-checkin/` | `AttendanceManualCheckinView` | Yes (Coordinator) | `{"event_id": int, "user_id": int, "note"?: str}` | Created attendance (200) | T2 | On-site manual checkin |
| **Attendance, QR & Onboarding (`bff.checkin`)** | | | | | | | |
| `GET` | `/api/v1/events/{id}/onboarding/` | `EventOnboardingView` | Yes (`IsAuthenticated`) | None | `{"content": str, "acknowledged": bool, ...}` (200) | T2 | Briefing and safety notes |
| `POST` | `/api/v1/events/{id}/onboarding/acknowledge/` | `EventOnboardingAcknowledgeView` | Yes (`IsAuthenticated`) | None | `{"acknowledged": true, "acknowledged_at": str}` (200) | T2 | Safety sign-off |
| `POST` | `/api/v1/qr/resolve/` | `QrResolveView` | No (`AllowAny`) | `{"token": str}` | `{"event_id": int, "event_title": str, ...}` (200) | T0 | Preview token before redeem |
| `POST` | `/api/v1/qr/redeem/` | `QrRedeemView` | Yes (`IsAuthenticated`) | `{"token": str}` | Redemption result (200) | T2 | Mark token consumed |
| `POST` | `/api/v1/attendance/qr-checkin/` | `AttendanceQrCheckinView` | Yes (`IsAuthenticated`) | `{"token": str}` | Check-in status (200) | T2 | Token attendance record |
| `POST` | `/api/v1/attendance/geo-checkin/` | `AttendanceGeoCheckinView` | Yes (`IsAuthenticated`) | `{"event_id": int, "latitude": float, "longitude": float, "accuracy_m"?: float, "is_mocked"?: bool}` | `{success: true}` (200) or `{success: false, result: "outside_geofence"}` (400) | T2 | Coordinates validated vs event radius |
| `POST` | `/api/v1/attendance/{attendance_id}/checkout/` | `AttendanceCheckoutView` | Yes (`IsAuthenticated`) | None | `{"id": int, "status": "completed", "checkout_at": str}` (200) | T2 | **Strict: Attendance ID in path** |
| `GET` | `/api/v1/me/attendance/` | `UserAttendanceHistoryView` | Yes (`IsAuthenticated`) | None | `{"results": [AttendanceHistoryItemDto]}` (200) | T1 | Personal check-in log |
| `POST` | `/api/v1/events/{id}/feedback/` | `EventFeedbackSubmitView` | Yes (`IsAuthenticated`) | `{"direction": str, "score": int, "tags": str[], "comment": str, "target_user_id"?: int}` | Created feedback (201) | T2 | Post-shift feedback |
| `GET` | `/api/v1/me/feedback/` | `MyFeedbackView` | Yes (`IsAuthenticated`) | None | `{"results": [...], "summary": {...}}` (200) | T1 | Personal received reviews |

---

## 6. Target Directory Architecture

The integration will introduce non-invasive files incrementally across subsequent phases without modifying existing mock contracts or UI components:

```text
mobile/src/
├── app/
│   ├── AppProviders.tsx          (Extended: mounts RepositoryProvider)
│   ├── AppRoot.tsx               (Extended: conditional auth check)
│   └── UserContext.tsx           (Extended: token bootstrapping)
├── core/                         (New in Phase 1)
│   ├── api/
│   │   ├── apiClient.ts          (Centralized fetch, headers, timeouts)
│   │   ├── apiConfig.ts          (Base URL, timeouts, headers)
│   │   ├── apiError.ts           (Normalized ApiError & error shapes)
│   │   └── apiResult.ts          (ApiResult<T> discriminated union)
│   ├── auth/
│   │   ├── tokenStore.ts         (Pluggable async/memory token storage)
│   │   └── sessionManager.ts     (Auth state, token injection, logout)
│   └── config/
│       └── dataMode.ts           (Runtime mode: 'mock' | 'http')
├── data/
│   ├── contracts/                (Retained: abstract repository interfaces)
│   ├── dto/                      (New in Phase 2: exact BFF wire types)
│   ├── mappers/                  (New in Phase 2: pure DTO -> domain functions)
│   ├── endpoints/                (New in Phase 3: pure HTTP transport functions)
│   ├── repositories/
│   │   └── http/                 (New in Phase 3: Http*Repository implementations)
│   ├── mock/                     (Retained: preserved in full)
│   └── providers/
│       └── RepositoryProvider.tsx(New in Phase 3: DI container & hook)
├── domain/models/                (Retained: existing models untouched)
├── features/                     (Adapted in Phases 4-8: DI hook injection)
└── shared/ & theme/              (Retained: untouched presentation layer)
```

---

## 7. Phase 0 Acceptance Sign-Off

- [x] All mobile directories (`app/`, `navigation/`, `domain/`, `contracts/`, `mock/`, `features/`, `shared/`, `theme/`) inspected.
- [x] 3 coordinator screens importing `defaultCoordinatorRepository` identified and documented.
- [x] 4 event screens typing `MockEventRepository` identified and documented.
- [x] Baseline Jest tests run (`13 passed, 192 passed, 0 failures`).
- [x] Baseline TypeScript typecheck run (2 pre-existing errors documented).
- [x] Backend routes, serializers, `/api/v1/` prefix, DRF token header, and query parameters verified.
- [x] Zero application source code, test, backend, or database files modified.
- [x] Discovery & baseline document saved to `docs/baseline/v0_10_0_phase_0_discovery_and_baseline_report.md`.

**GATE 0 STATUS: PASSED (FROZEN)**  
Execution halted immediately per Critical Execution Rule. Awaiting authorization to begin Phase 1.
