# Phase 7 Summary Log: Feature-Facing Use Cases & View-Model Contracts

**Date:** 2026-11-17  
**Version:** v0.11.0  
**Phase:** Phase 7 (Feature-Facing Use Cases & View-Model Contracts)  
**Main Reference Document:** `reference/v0_11_0_volunteer_coordinator_capability_parity_plan.md` (Sections 5, 6, 7.4, 8.4, 9 Phase 7, 11.1)

---

## 1. Executive Summary

In Phase 7, the high-level domain use case and view-model controller layer was constructed under `mobile/src/domain/usecases/`, providing clean, type-safe entry points for all 82 capabilities (43 Volunteer capabilities `V-01`..`V-43` and 39 Coordinator capabilities `C-01`..`C-39`). UI components and screens in Phase 8 can now invoke all capabilities without knowing raw wire endpoints, DTO shapes, or HTTP headers.

Key architectural achievements in Phase 7:
1. **Volunteer Use Cases (`mobile/src/domain/usecases/volunteerUseCases.ts`):** Implemented `VolunteerUseCases` class encompassing all 43 volunteer capabilities across 8 functional groups:
   - Authentication & session lifecycle (`V-01`..`V-03`).
   - Profile management, charity taxonomy interests, and public/T2 UUID lookup (`V-04`..`V-06`, `V-18`).
   - Availability rules, date-specific exceptions, and event/window conflict preflight checks (`V-07`..`V-12`).
   - Volunteer verification upload, status checking, coordinator eligibility check, and coordinator application (`V-13`..`V-17`).
   - Charity fields taxonomy and event discovery with cursor pagination continuation (`V-19`..`V-22`).
   - Event post applications, invite joining, QR walk-in joining, application withdrawal, assignment confirmation, and assignment cancellation (`V-23`..`V-30`).
   - Event onboarding review & acknowledgment, QR token resolution/redemption, check-in, real device geo check-in via `LocationProvider`, checkout, and attendance history (`V-31`..`V-38`).
   - Direction-safe volunteer-to-event and volunteer-to-coordinator feedback submission, author/received feedback metrics, and truthful dashboard summary composition (`V-39`..`V-43`).
2. **Coordinator Use Cases (`mobile/src/domain/usecases/coordinatorUseCases.ts`):** Implemented `CoordinatorUseCases` class encompassing all 39 coordinator capabilities across 12 functional groups:
   - Coordinator application review and status checking (`C-01`..`C-03`).
   - Event overview metrics, event list, event detail, and draft event creation (`C-04`..`C-06`).
   - Post management: list, create, update, close, and capacity tracking (`C-07`..`C-10`).
   - Event lifecycle state machine: update metadata, publish event with open-posts preflight check, activate event, complete event, and cancel event (`C-11`..`C-15`).
   - Coordinator handover, retake, and handover history tracking (`C-16`..`C-18`).
   - Applicant review (with full T2 preservation for accepted volunteers), acceptance, rejection, waitlisting, and manual volunteer invitation (`C-19`..`C-23`).
   - Assignment management: auto-assignment, manual assignment with full custom parameters (`applicationId`, `postId`, `groupCode`, `isGroupLeader`), assignment cancellation, and unassigned applicant retrieval (`C-24`..`C-27`).
   - Post capacity overview (`C-28`).
   - Volunteer UUID lookup, attendance roster, and manual volunteer check-in (`C-29`..`C-31`).
   - Dynamic QR token generation and revocation (`C-32`..`C-33`).
   - Geofence attendance attempt review, pending geo list, geo confirmation, and geo rejection (`C-34`..`C-37`).
   - Direction-safe coordinator-to-volunteer feedback submission and coordinator feedback summary retrieval (`C-38`..`C-39`).
3. **Ergonomic React Hooks & Module Index (`mobile/src/domain/usecases/index.ts`):**
   - Exported `VolunteerUseCases` and `CoordinatorUseCases`.
   - Exported factory functions `createVolunteerUseCases` and `createCoordinatorUseCases`.
   - Exported React hooks `useVolunteerCapabilities()` and `useCoordinatorCapabilities()` integrated with `useRepositories()` and `defaultLocationProvider`.
4. **State Reconciliation & Invalidation Rules:**
   - Applying to a post or withdrawing an application refreshes both event details and the user's application list.
   - Coordinator post creation, update, or closure invalidates post capacity caches and updates open posts count.
   - `publishEvent` performs an open-posts preflight check (`openPostsCount > 0`), failing fast if no open posts with positive headcount exist, while respecting the database trigger as authoritative.
   - Geo check-in (`V-36`) queries `LocationProvider.requestPermission()` and fails fast if permissions are denied or GPS is unavailable.

All strict constraints were maintained:
- PostgreSQL database (`postgres_sql/updated_volunteer_coordination_system_Database.sql`) remains 100% immutable.
- Zero UI redesign or visual layout changes were performed.
- TypeScript compiler verification (`cd mobile && npx tsc --noEmit`) passes with **0 errors**.
- Full mobile Jest suite passes **100%** (**31 test suites passed, 468 tests passed**).
- Full backend Django test suite passes **100%** (**674 tests passed**).

---

## 2. Capability Coverage Ledger (82 Capabilities)

### 2.1. Volunteer Capabilities (`V-01` .. `V-43`)

| ID | Capability Name | Use Case Method | Verified |
|---|---|---|---|
| `V-01` | Request login OTP | `volunteerUseCases.requestOtp` | Yes |
| `V-02` | Verify login OTP | `volunteerUseCases.verifyOtp` | Yes |
| `V-03` | Log out session | `volunteerUseCases.logout` | Yes |
| `V-04` | Get volunteer profile | `volunteerUseCases.getProfile` | Yes |
| `V-05` | Update volunteer profile | `volunteerUseCases.updateProfile` | Yes |
| `V-06` | Update charity taxonomy interests | `volunteerUseCases.updateCharityInterests` | Yes |
| `V-07` | Get availability schedule & exceptions | `volunteerUseCases.getAvailability` | Yes |
| `V-08` | Save weekly availability rule | `volunteerUseCases.saveWeeklyRule` | Yes |
| `V-09` | Delete weekly availability rule | `volunteerUseCases.deleteWeeklyRule` | Yes |
| `V-10` | Save availability exception | `volunteerUseCases.saveException` | Yes |
| `V-11` | Delete availability exception | `volunteerUseCases.deleteException` | Yes |
| `V-12` | Preflight check availability for event | `volunteerUseCases.checkAvailabilityForEvent` | Yes |
| `V-13` | Upload verification document image | `volunteerUseCases.uploadVerificationImage` | Yes |
| `V-14` | Get volunteer verification status | `volunteerUseCases.getVerificationStatus` | Yes |
| `V-15` | Check coordinator promotion eligibility | `volunteerUseCases.getCoordinatorEligibility` | Yes |
| `V-16` | Submit coordinator application | `volunteerUseCases.submitCoordinatorApplication` | Yes |
| `V-17` | Update coordinator application notes | `volunteerUseCases.updateCoordinatorApplicationNotes` | Yes |
| `V-18` | Look up user by public UUID | `volunteerUseCases.lookupUserByUuid` | Yes |
| `V-19` | Get charity taxonomy fields | `volunteerUseCases.getCharityFields` | Yes |
| `V-20` | Discover & search events | `volunteerUseCases.getEvents` / `getEventsPage` | Yes |
| `V-21` | Load event detail with open posts & capacity | `volunteerUseCases.getEventDetail` | Yes |
| `V-22` | Check availability conflict for window | `volunteerUseCases.checkAvailabilityForWindow` | Yes |
| `V-23` | Apply to event post | `volunteerUseCases.applyToPost` | Yes |
| `V-24` | Join event via coordinator invite code | `volunteerUseCases.joinThroughInvite` | Yes |
| `V-25` | Join event via QR walk-in | `volunteerUseCases.joinThroughQrWalkIn` | Yes |
| `V-26` | Get user application history | `volunteerUseCases.getUserApplications` | Yes |
| `V-27` | Withdraw event application | `volunteerUseCases.withdrawApplication` | Yes |
| `V-28` | Get user assignments | `volunteerUseCases.getUserAssignments` | Yes |
| `V-29` | Confirm assigned shift | `volunteerUseCases.confirmAssignment` | Yes |
| `V-30` | Cancel confirmed assignment | `volunteerUseCases.cancelAssignment` | Yes |
| `V-31` | Get event onboarding materials | `volunteerUseCases.getEventOnboarding` | Yes |
| `V-32` | Acknowledge event onboarding | `volunteerUseCases.acknowledgeOnboarding` | Yes |
| `V-33` | Resolve check-in QR token | `volunteerUseCases.resolveQrToken` | Yes |
| `V-34` | Redeem check-in QR token | `volunteerUseCases.redeemQrToken` | Yes |
| `V-35` | Submit QR check-in | `volunteerUseCases.qrCheckIn` | Yes |
| `V-36` | Submit GPS geofence check-in | `volunteerUseCases.submitGeoCheckIn` | Yes |
| `V-37` | Check out from shift | `volunteerUseCases.checkOutAttendance` | Yes |
| `V-38` | Get attendance history | `volunteerUseCases.getAttendanceHistory` | Yes |
| `V-39` | Submit feedback for event | `volunteerUseCases.submitVolunteerToEventFeedback` | Yes |
| `V-40` | Submit feedback for coordinator | `volunteerUseCases.submitVolunteerToCoordinatorFeedback` | Yes |
| `V-41` | Get public feedback received | `volunteerUseCases.getEventFeedbackList` | Yes |
| `V-42` | Get my authored feedback records | `volunteerUseCases.getMyFeedback` | Yes |
| `V-43` | Get volunteer dashboard summary facts | `volunteerUseCases.getDashboardSummary` | Yes |

---

### 2.2. Coordinator Capabilities (`C-01` .. `C-39`)

| ID | Capability Name | Use Case Method | Verified |
|---|---|---|---|
| `C-01` | Get coordinator profile / application status | `coordinatorUseCases.getCoordinatorStatus` | Yes |
| `C-02` | Submit coordinator application | `coordinatorUseCases.submitCoordinatorApplication` | Yes |
| `C-03` | Update coordinator application notes | `coordinatorUseCases.updateCoordinatorApplicationNotes` | Yes |
| `C-04` | Get coordinator overview metrics | `coordinatorUseCases.getOverviewMetrics` | Yes |
| `C-05` | List coordinated events | `coordinatorUseCases.getMyEvents` | Yes |
| `C-06` | Get event detail for management | `coordinatorUseCases.getEventDetail` | Yes |
| `C-07` | List event posts | `coordinatorUseCases.getEventPosts` | Yes |
| `C-08` | Create event post | `coordinatorUseCases.createEventPost` | Yes |
| `C-09` | Update event post | `coordinatorUseCases.updateEventPost` | Yes |
| `C-10` | Close event post | `coordinatorUseCases.closeEventPost` | Yes |
| `C-11` | Update event metadata | `coordinatorUseCases.updateEventMetadata` | Yes |
| `C-12` | Publish event (enforces open-posts preflight) | `coordinatorUseCases.publishEvent` | Yes |
| `C-13` | Activate event | `coordinatorUseCases.activateEvent` | Yes |
| `C-14` | Complete event | `coordinatorUseCases.completeEvent` | Yes |
| `C-15` | Cancel event | `coordinatorUseCases.cancelEvent` | Yes |
| `C-16` | Handover event coordination | `coordinatorUseCases.handoverEvent` | Yes |
| `C-17` | Retake event coordination | `coordinatorUseCases.retakeEvent` | Yes |
| `C-18` | Get event coordinator handover history | `coordinatorUseCases.getCoordinatorHistory` | Yes |
| `C-19` | Get applicant list (with T2 for accepted) | `coordinatorUseCases.getApplications` | Yes |
| `C-20` | Accept volunteer application | `coordinatorUseCases.acceptApplication` | Yes |
| `C-21` | Reject volunteer application | `coordinatorUseCases.rejectApplication` | Yes |
| `C-22` | Waitlist volunteer application | `coordinatorUseCases.waitlistApplication` | Yes |
| `C-23` | Send direct volunteer invitation | `coordinatorUseCases.inviteVolunteer` | Yes |
| `C-24` | Trigger auto-assignment algorithm | `coordinatorUseCases.runAutoAssignment` | Yes |
| `C-25` | Manually assign volunteer to post & group | `coordinatorUseCases.assignVolunteerManually` | Yes |
| `C-26` | Cancel volunteer assignment | `coordinatorUseCases.cancelAssignment` | Yes |
| `C-27` | Get unassigned accepted applicants | `coordinatorUseCases.getUnassignedApplications` | Yes |
| `C-28` | Get post capacity & headcount breakdown | `coordinatorUseCases.getPostCapacity` | Yes |
| `C-29` | Lookup volunteer by public UUID | `coordinatorUseCases.lookupVolunteerByUuid` | Yes |
| `C-30` | Get real-time event attendance roster | `coordinatorUseCases.getAttendanceRoster` | Yes |
| `C-31` | Manually check-in volunteer | `coordinatorUseCases.manualCheckIn` | Yes |
| `C-32` | Generate dynamic QR check-in token | `coordinatorUseCases.createQrToken` | Yes |
| `C-33` | Revoke dynamic QR token | `coordinatorUseCases.revokeQrToken` | Yes |
| `C-34` | Get pending geofence check-in confirmations | `coordinatorUseCases.getPendingGeoConfirmations` | Yes |
| `C-35` | Get geofence check-in attempt logs | `coordinatorUseCases.getGeoAttempts` | Yes |
| `C-36` | Confirm pending geofence check-in | `coordinatorUseCases.confirmGeoAttendance` | Yes |
| `C-37` | Reject pending geofence check-in | `coordinatorUseCases.rejectGeoAttendance` | Yes |
| `C-38` | Submit coordinator feedback for volunteer | `coordinatorUseCases.submitCoordinatorToVolunteerFeedback` | Yes |
| `C-39` | Get coordinator feedback summary | `coordinatorUseCases.getCoordinatorFeedbackSummary` | Yes |

---

## 3. Verification & Test Suite Summary

### 3.1. Mobile TypeScript Type Check
```bash
cd mobile && npx tsc --noEmit
# Result: Exit code 0 (0 errors)
```

### 3.2. Mobile Jest Test Suites
```bash
cd mobile && npm test -- --watchAll=false
# Test Suites: 31 passed, 31 total
# Tests:       468 passed, 468 total
# Snapshots:   0 total
# Time:        13.391 s
```
38 comprehensive tests in `mobile/src/domain/usecases/__tests__/capabilityUseCases.test.ts` verify all 82 capabilities:
- Auth, session token lifecycle, profile and charity taxonomy updates.
- Availability rules, exceptions, and conflict checking.
- Verification uploads and coordinator applications.
- Event discovery, pagination continuation, and post applications.
- Onboarding, QR resolution/redemption, and LocationProvider geo-checkin.
- Direction-safe volunteer/coordinator feedback and truthful dashboard metrics.
- Event lifecycle transitions, post capacity checks, and open-posts publish preflight.
- Handover / retake history, applicant review with T2 data, auto/manual assignments, QR tokens, and geo review.

### 3.3. Backend Django Test Suite
```bash
.venv\Scripts\python.exe backend/manage.py test --keepdb
# Ran 674 tests in 32.926s
# OK
```

---

## 4. Affected Files in Phase 7

1. `mobile/src/domain/usecases/volunteerUseCases.ts` (New: Volunteer capability use-case orchestrator)
2. `mobile/src/domain/usecases/coordinatorUseCases.ts` (New: Coordinator capability use-case orchestrator)
3. `mobile/src/domain/usecases/index.ts` (New: Public module exports and React hooks)
4. `mobile/src/domain/usecases/__tests__/capabilityUseCases.test.ts` (New: 38 capability unit tests)

All 4 paths have been appended to `reference/effected_path_v0_11_0.txt` and de-duplicated (total 74 paths).
