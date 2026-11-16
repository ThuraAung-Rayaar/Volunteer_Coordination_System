# v0.9.0 — Backend → Mobile Integration Map
**Purpose:** Pre-connection analysis. Documents every implemented BFF endpoint, the database models/views that back it, the existing mobile domain model it corresponds to, the DTO fields that need mapping, and integration gaps that must be resolved before the first live call.

**Source of truth priority:** DB models → BFF views/serializers → Mobile domain contracts.  
**Mobile UI analysis:** excluded (UI will adapt to what the API delivers).

---

## 0. Architecture Overview

```
PostgreSQL DB
  └─ Tables / Views (managed=False Django models)
       └─ Service Layer (services/*.py)
            └─ BFF Layer (bff/{auth,volunteer,coordinator,checkin})
                 └─ REST JSON API (base: /api/v1/ or /api/bff/mobile/)
                      └─ Mobile (React Native — currently on mock repos)
```

> IMPORTANT: The mobile app is **fully on mock repositories** (`src/data/mock/`). Every `IEventRepository`, `IProfileRepository`, etc. will need a **live HTTP implementation** (`src/data/http/`) with the DTO ↔ domain-model mapping described below.

---

## 1. API Route Manifest (All Implemented BFF Endpoints)

Base prefix: `/api/v1/`

### 1.1 Auth — `bff/auth/`

| Method | Path | View | Auth |
|--------|------|------|------|
| POST | `auth/otp/request/` | `OtpRequestView` | Public |
| POST | `auth/otp/verify/` | `OtpVerifyView` | Public |
| POST | `auth/logout/` | `LogoutView` | Required |

### 1.2 Volunteer — `bff/volunteer/`

| Method | Path | View | Auth |
|--------|------|------|------|
| GET | `charity-fields/` | `CharityFieldsListView` | Public |
| GET | `events/` | `PublicEventListView` | Public |
| GET | `events/{event_id}/` | `PublicEventDetailView` | Public |
| GET | `events/{event_id}/posts/` | `PublicEventPostsView` | Public |
| GET/PATCH | `me/` | `MeProfileView` | Required |
| GET/PUT | `me/charity-interests/` | `MeCharityInterestsView` | Required |
| GET/PUT | `me/availability/` | `MeAvailabilityView` | Required |
| POST | `me/availability/rules/` | `MeAvailabilityRulesView` | Required |
| POST | `me/availability/exceptions/` | `MeAvailabilityExceptionsView` | Required |
| DELETE | `me/availability/exceptions/{id}/` | `MeAvailabilityExceptionDetailView` | Required |
| GET/POST | `me/availability/check/` | `EventCheckAvailabilityView` | Required |
| GET/POST | `me/verification-images/` | `MeVerificationImagesView` | Required |
| GET/POST/PATCH | `me/coordinator/` | `MeCoordinatorView` | Required |
| GET | `users/by-uuid/{uuid}/` | `UserByUuidView` | Required |
| POST | `events/{event_id}/apply/` | `EventApplyView` | Required |
| GET | `me/applications/` | `MyApplicationsView` | Required |
| POST | `applications/{id}/withdraw/` | `ApplicationWithdrawView` | Required |
| GET | `me/assignments/` | `MyAssignmentsView` | Required |
| POST | `assignments/{id}/confirm/` | `AssignmentConfirmView` | Required |
| POST | `assignments/{id}/cancel/` | `AssignmentCancelView` | Required |
| GET | `me/feedback/` | `MyFeedbackView` | Required |
| GET | `me/attendance/` | `UserAttendanceHistoryView` | Required |

### 1.3 Coordinator — `bff/coordinator/`

| Method | Path | View | Auth |
|--------|------|------|------|
| GET/POST | `coordinator/events/` | `CoordinatorEventListCreateView` | Required + IsApprovedCoordinator |
| PATCH | `coordinator/events/{event_id}/` | `CoordinatorEventDetailView` | Required |
| GET | `coordinator/events/{event_id}/summary/` | `EventSummaryView` | Required |
| POST | `events/{event_id}/publish/` | `EventPublishView` | Required |
| POST | `events/{event_id}/activate/` | `EventActivateView` | Required |
| POST | `events/{event_id}/complete/` | `EventCompleteView` | Required |
| POST | `events/{event_id}/cancel/` | `EventCancelView` | Required |
| POST | `events/{event_id}/handover/` | `EventHandoverView` | Required |
| POST | `events/{event_id}/retake/` | `EventRetakeView` | Required |
| GET/POST | `coordinator/events/{event_id}/posts/` | `CoordinatorEventPostsView` | Required |
| PATCH | `posts/{post_id}/` | `EventPostDetailView` | Required |
| POST | `posts/{post_id}/close/` | `EventPostCloseView` | Required |
| GET | `coordinator/events/{event_id}/applications/` | `CoordinatorEventApplicationsView` | Required |
| POST | `applications/{id}/{action}/` | `ApplicationDecisionView` | Required |
| POST | `applications/{id}/accept/` | `CoordinatorApplicationAcceptView` | Required |
| POST | `applications/{id}/reject/` | `CoordinatorApplicationRejectView` | Required |
| POST | `applications/{id}/waitlist/` | `CoordinatorApplicationWaitlistView` | Required |
| POST | `coordinator/events/{event_id}/auto-assign/` | `EventAutoAssignView` | Required |
| POST | `coordinator/events/{event_id}/manual-assign/` | `EventManualAssignView` | Required |
| GET | `coordinator/events/{event_id}/assignments/` | `EventAssignmentsView` | Required |
| GET | `coordinator/events/{event_id}/unassigned/` | `EventUnassignedView` | Required |
| GET | `coordinator/events/{event_id}/post-capacity/` | `EventPostCapacityView` | Required |
| GET | `coordinator/feedback/` | `CoordinatorFeedbackView` | Required |

### 1.4 Check-in — `bff/checkin/`

| Method | Path | View | Auth |
|--------|------|------|------|
| GET | `events/{event_id}/onboarding/` | `EventOnboardingView` | Required |
| POST | `events/{event_id}/onboarding/acknowledge/` | `EventOnboardingAcknowledgeView` | Required |
| POST | `qr/resolve/` | `QrResolveView` | Public |
| POST | `qr/redeem/` | `QrRedeemView` | Required |
| POST | `coordinator/events/{event_id}/qr-tokens/` | `QrTokenCreateView` | Required |
| POST | `coordinator/qr-tokens/{qr_id}/revoke/` | `QrTokenRevokeView` | Required |
| POST | `attendance/qr-checkin/` | `AttendanceQrCheckinView` | Required |
| POST | `attendance/manual-checkin/` | `AttendanceManualCheckinView` | Required |
| POST | `attendance/geo-checkin/` | `AttendanceGeoCheckinView` | Required |
| POST | `attendance/{attendance_id}/checkout/` | `AttendanceCheckoutView` | Required |
| GET | `me/attendance/` | `UserAttendanceHistoryView` | Required |
| GET | `coordinator/events/{event_id}/attendance/` | `CoordinatorAttendanceBoardView` | Required |
| GET | `coordinator/events/{event_id}/attendance/pending/` | `CoordinatorPendingConfirmationsView` | Required |
| GET | `coordinator/events/{event_id}/geo-attempts/` | `CoordinatorGeoAttemptsView` | Required |
| POST | `coordinator/attendance/{attendance_id}/confirm/` | `CoordinatorConfirmAttendanceView` | Required |
| POST | `coordinator/attendance/{attendance_id}/reject/` | `CoordinatorRejectAttendanceView` | Required |
| POST | `events/{event_id}/feedback/` | `EventFeedbackSubmitView` | Required |
| GET | `events/{event_id}/feedback/list/` | `EventFeedbackListView` | Required |
| GET | `me/feedback/` | `MyFeedbackView` | Required |

### 1.5 Map Engine (tile display for geo check-in map)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `maps/catalog/` | Offline map region list |
| GET | `maps/tiles/{z}/{x}/{y}.png` | Tile proxy/stream |
| GET | `maps/regions/{region_code}/download/` | Offline tile download |

---

## 2. Database Models & Views → Feature Mapping

### 2.1 Core Database Tables (all `managed=False`)

| DB Table | Django Model | Mobile Feature Area |
|---|---|---|
| `users` | `accounts.Users` | Auth, Profile, all features |
| `auth_otp` | `accounts.AuthOtp` | Auth — OTP login |
| `user_verification_images` | `accounts.UserVerificationImages` | Profile — Verification |
| `onboarding_acknowledgments` | `accounts.OnboardingAcknowledgments` | Check-in — Onboarding |
| `user_charity_interests` | `accounts.UserCharityInterests` | Profile — Charity Interests |
| `volunteer_availability_rules` | `accounts.VolunteerAvailabilityRules` | Profile — Availability |
| `volunteer_availability_exceptions` | `accounts.VolunteerAvailabilityExceptions` | Profile — Availability |
| `charity_fields` | `events.CharityFields` | Events — Filter taxonomy |
| `events` | `events.Events` | Events + Coordinator |
| `event_posts` | `events.EventPosts` | Events — Posts/Slots |
| `event_applications` | `events.EventApplications` | Events — Applications |
| `event_charity_fields` | `events.EventCharityFields` | Events — Categories |
| `coordinator_profiles` | `coordination.CoordinatorProfiles` | Profile — Coordinator role |
| `event_coordinator_history` | `coordination.EventCoordinatorHistory` | Coordinator — History |
| `assignments` | `coordination.Assignments` | Coordinator + Volunteer |
| `attendance` | `attendance.Attendance` | Check-in |
| `attendance_geo_attempts` | `attendance.AttendanceGeoAttempts` | Check-in — Geo |
| `qr_tokens` | `attendance.QrTokens` | Check-in — QR |
| `feedback` | `audit.Feedback` | Feedback |
| `audit_logs` | `audit.AuditLogs` | Admin only |
| `moderation_actions` | `audit.ModerationActions` | Admin only |
| `app_settings` | `audit.AppSettings` | Admin only |

### 2.2 Database Views (read-only query optimizations)

| DB View | Django Model | Used By |
|---|---|---|
| `v_public_events` | `events.VPublicEvents` | `PublicEventListView`, `PublicEventDetailView` |
| `v_event_summary` | `events.VEventSummary` | `EventSummaryView` (coordinator) |
| `v_event_post_capacity` | `events.VEventPostCapacity` | `EventPostCapacityView` |
| `v_event_checkin_board` | `attendance.VEventCheckinBoard` | `CoordinatorAttendanceBoardView` |
| `v_event_checkin_status` | `attendance.VEventCheckinStatus` | Checkin status queries |
| `v_pending_confirmations` | `attendance.VPendingConfirmations` | `CoordinatorPendingConfirmationsView` |
| `v_geo_attempts_review` | `attendance.VGeoAttemptsReview` | `CoordinatorGeoAttemptsView` |
| `v_event_coordinator_history` | `coordination.VEventCoordinatorHistory` | Coordinator history |
| `v_user_moderation_summary` | `audit.VUserModerationSummary` | Admin only |
| `v_admin_dashboard` | `audit.VAdminDashboard` | Admin only |

---

## 3. Feature-by-Feature DTO Analysis

### 3.1 Authentication

**BFF Endpoints:** `POST auth/otp/request/`, `POST auth/otp/verify/`, `POST auth/logout/`  
**DB Source:** `auth_otp`, `users`

**Response DTO (OTP Verify success):**
```json
{
  "token": "<knox_token>",
  "user": {
    "id": 1,
    "uuid": "uuid-v7",
    "display_name": "John Doe",
    "verification_status": "none|pending|verified|rejected"
  }
}
```

**Mobile Domain Model needed:**
```typescript
interface AuthUser {
  id: number;
  uuid: string;
  displayName: string;
  verificationStatus: 'none' | 'pending' | 'verified' | 'rejected';
  token: string;
}
```

**Gap [G1, G15]:** Mobile `UserContext` uses `email` — backend has phone-only auth. No email field on `users`. Auth token is Knox `Token <value>` header.

---

### 3.2 Volunteer Profile (`me/`)

**BFF Endpoint:** `GET/PATCH me/`  
**DB Source:** `users` table  
**Serializer:** `UserProfileSerializer` (read), `ProfileUpdateSerializer` (write)

**Response DTO fields (GET):**
```
id, uuid, display_name, phone, preferred_language, home_area,
emergency_contact_name, emergency_contact_phone,
blood_type, is_willing_to_donate, is_willing_to_donate_blood, is_willing_to_donate_items,
physical_ok, good_eyesight, needs_glasses, can_lift_heavy, can_work_outdoor,
has_leader_experience, new_to_volunteer, skills,
needs_meal_support, needs_travel_support, accepts_unpaid,
verification_status, account_status, charity_interests, created_at
```

**DTO → Domain field mapping:**

| API field (snake_case) | Mobile field (camelCase) | Note |
|---|---|---|
| `id` | `id` | `number` → `string` normalize |
| `uuid` | *(missing — add)* | needed for QR scan |
| `display_name` | `displayName` | ✅ |
| `phone` | *(not in model — add)* | read-only, decrypted |
| `preferred_language` | `preferredLanguage` | ✅ |
| `home_area` | `homeArea` | ✅ |
| `emergency_contact_name` | `emergencyContactName` | ✅ |
| `emergency_contact_phone` | `emergencyContactPhone` | ✅ |
| `blood_type` | `donationPreferences.bloodType` | nested |
| `is_willing_to_donate_blood` | `donationPreferences.isWillingToDonateBlood` | nested |
| `is_willing_to_donate_items` | `donationPreferences.isWillingToDonateItems` | nested |
| `physical_ok` | `capabilities.physicalOk` | nested |
| `good_eyesight` | `capabilities.goodEyesight` | nested |
| `needs_glasses` | `capabilities.needsGlasses` | nested |
| `can_lift_heavy` | `capabilities.canLiftHeavy` | nested |
| `can_work_outdoor` | `capabilities.canWorkOutdoor` | nested |
| `has_leader_experience` | `capabilities.hasLeaderExperience` | nested |
| `new_to_volunteer` | `capabilities.newToVolunteer` | nested |
| `skills` | `skills` | ✅ |
| `needs_meal_support` | `supportPreferences.needsMealSupport` | nested |
| `needs_travel_support` | `supportPreferences.needsTravelSupport` | nested |
| `accepts_unpaid` | `supportPreferences.acceptsUnpaid` | nested |
| `verification_status` | `verificationStatus` | ✅ |
| `account_status` | `accountStatus` | ✅ |
| `charity_interests` | `charityInterests` | ✅ |

**PATCH body** must be flat snake_case per `ProfileUpdateSerializer` allow-list. Mobile must flatten nested model before sending.

**[Gap G13]** `ratingAverage` / `ratingCount` not in profile DTO — fetch from `GET me/feedback/` summary separately.

---

### 3.3 Charity Fields / Interests

**BFF Endpoints:** `GET charity-fields/`, `GET/PUT me/charity-interests/`  
**DB Source:** `charity_fields`, `user_charity_interests`

**DTO (charity-fields list):**
```json
[{ "code": "teaching", "label": "Teaching", "sort_order": 10 }]
```

**Domain mapping:** `code→code ✅`, `label→label ✅`, `sort_order→sortOrder (rename)`

**[Gap]** Mobile hard-codes `CHARITY_CATEGORIES` array. With live connection, replace with API call and cache.

---

### 3.4 Public Event Browsing

**BFF Endpoints:** `GET events/`, `GET events/{id}/`, `GET events/{id}/posts/`  
**DB Source:** `v_public_events`, `event_posts`, `v_event_post_capacity`

**Event list DTO → `EventSummary` mapping:**

| API | Mobile | Note |
|---|---|---|
| `id` | `id` | `number→string` |
| `title` | `title` | ✅ |
| `description` | `description` | ✅ |
| `purpose_type` | `purposeType` | ✅ |
| `location_name` | `locationName` | ✅ |
| `landmark_text` | `landmarkText` | ✅ |
| `start_at` | `startAt` | ✅ |
| `end_at` | `endAt` | ✅ |
| `application_deadline` | `applicationDeadline` | ✅ nullable |
| `charity_fields` | `charityFields` | ✅ |
| `coordinator_name` | `coordinatorName` | ✅ |
| `spots_remaining` | `spotsRemaining` | ✅ |
| `meals_provided` | `mealsProvided` | ✅ |
| `lodging_provided` | `lodgingProvided` | ✅ |
| `travel_support_provided` | `travelSupportProvided` | ✅ |
| `compensation_kind` | `compensationKind` | ✅ |
| `status` | `status` | **[G2]** Mobile only typed `published\|active`; expand to include `draft\|completed\|cancelled` |
| `latitude`, `longitude` | `EventDetail` only | ✅ |
| `geo_checkin_enabled` | `geoCheckinEnabled` | `EventDetail` only |

**Post DTO → `EventPost` mapping:**

| API | Mobile | Note |
|---|---|---|
| `assigned_count` | `filledHeadcount` | rename |
| `remaining` | `remainingCapacity` | rename |
| `eventId` | *(derive from parent)* | not in post DTO |

**Filter query params:**
```
status=published,active   charity_field=teaching,cooking
start_after=<ISO>         end_before=<ISO>
meals_provided=true       lodging_provided=true
travel_support_provided=true   page=1&page_size=20
```

---

### 3.5 Event Applications (Volunteer)

**BFF Endpoints:** `POST events/{id}/apply/`, `GET me/applications/`, `POST applications/{id}/withdraw/`  
**DB Source:** `event_applications`

**Apply Request DTO:**
```json
{ "post_id": 5, "source": "browse", "note": "optional" }
```

**Application Status DTO → `VolunteerApplicationItem` mapping:**

| API | Mobile | Note |
|---|---|---|
| `id` | `id` | ✅ |
| `event_id` | `eventId` | ✅ |
| `event_title` | `eventTitle` | ✅ |
| `post_id` | `postId` | ✅ |
| `post_title` | `postTitle` | ✅ |
| `status` | `status` | ✅ |
| `applied_at` | `appliedAt` | ✅ |
| `note` | `volunteerNote` | rename |
| `event_status` | *(missing — add)* | add `eventStatus` |
| `decided_at` | *(missing — add)* | useful for state display |

---

### 3.6 Assignments (Volunteer)

**BFF Endpoints:** `GET me/assignments/`, `POST assignments/{id}/confirm/`, `POST assignments/{id}/cancel/`  
**DB Source:** `assignments`

**DTO → `VolunteerAssignmentItem` mapping:**

| API | Mobile | Note |
|---|---|---|
| `id` | `id` | ✅ |
| `event_id` | `eventId` | ✅ |
| `event_title` | `eventTitle` | ✅ |
| `post_id` | `postId` | ✅ |
| `post_title` | `postTitle` | ✅ |
| `status` | `status` | ✅ |
| `schedule_start` | `startAt` | rename |
| `schedule_end` | `endAt` | rename |
| `group_code` | *(missing — add)* | `groupCode?: string` |
| `is_group_leader` | *(missing — add)* | `isGroupLeader: boolean` |
| `confirmed_at` | *(missing — add)* | `confirmedAt?: string` |
| *(missing)* | `location` | **[G6]** Not in DTO — fetch from event or drop |
| *(missing)* | `assignedAt` | **[G7]** Add `created_at` as `assigned_at` in backend serializer |
| *(missing)* | `attendanceStatus` | Requires separate attendance fetch |

---

### 3.7 Availability

**BFF Endpoints:** `GET/PUT me/availability/`, rules POST, exceptions POST/DELETE, check GET/POST  
**DB Source:** `volunteer_availability_rules`, `volunteer_availability_exceptions`

**DTO → `VolunteerAvailability` mapping:** (mostly aligned)

| API | Mobile | Note |
|---|---|---|
| `weekday` | `weekday` | ✅ 1=Mon…7=Sun |
| `start_time` | `startTime` | ✅ HH:MM |
| `end_time` | `endTime` | ✅ |
| `valid_from` | `validFrom` | ✅ |
| `valid_to` | `validTo` | ✅ |
| `date` | `date` | ✅ |
| `is_available` | `isAvailable` | ✅ |
| `note` | `note` | ✅ |
| *(missing)* | `id` | **[G5]** Exception `id` needed for DELETE; backend list must expose it |
| *(derived)* | `weekdayName` | Compute from `weekday` on mobile |

**WARNING:** `PUT me/availability/` replaces ALL rules atomically. Mobile must send complete array.

---

### 3.8 Verification Images

**BFF Endpoints:** `GET/POST me/verification-images/`  
**DB Source:** `user_verification_images`

**DTO → `VerificationImageSlot` mapping:**

| API | Mobile | Note |
|---|---|---|
| `image_type` | `imageType` | ✅ |
| `status` | `status` | Backend: `pending\|approved\|rejected` → normalize to `none\|pending\|verified\|rejected` |
| `created_at` | `uploadedAt` | rename |
| `label`, `description` | *(derived locally)* | computed from `imageType` |

**Upload:** `POST me/verification-images/` sends `multipart/form-data` with `image_type` + `image` file.

---

### 3.9 Coordinator Profile

**BFF Endpoints:** `GET/POST/PATCH me/coordinator/`  
**DB Source:** `coordinator_profiles`

**DTO → Domain mapping:**

| API | Mobile | Note |
|---|---|---|
| `status` | `coordinatorStatus` | `pending\|approved\|suspended\|revoked` ✅ |
| `notes` | `coordinatorApplicationNote` | ✅ |

Returns `{ "coordinator": null }` when no application. Mobile must map null → `coordinatorStatus: 'none'`.

---

### 3.10 Coordinator Events

**BFF Endpoints:** `GET/POST coordinator/events/`, `PATCH coordinator/events/{id}/`, `GET coordinator/events/{id}/summary/`  
**DB Source:** `events`, `v_event_summary`

**Event List DTO → `CoordinatorEventSummary` mapping:**

| API | Mobile | Note |
|---|---|---|
| `is_owner` | *(missing — add)* | `isOwner: boolean` |
| `is_current_coordinator` | *(missing — add)* | `isCurrentCoordinator: boolean` |
| `is_read_only_monitor` | `isOwnerAsMonitor` | rename |

**Event Summary DTO extras:**

| API | Mobile | Note |
|---|---|---|
| `pending_count` | `pendingApplicationCount` | rename |
| `accepted_count` | `acceptedApplicantCount` | rename |
| `assignment_count` | `assignedCount` | rename |
| `checked_in_count` | `checkedInCount` | ✅ |
| `pending_confirmations` | *(missing — add)* | `pendingConfirmations: number` |
| `waitlisted_count` | *(missing — add)* | `waitlistedCount: number` |

**Create/Update mismatches:**

| API choices | Mobile choices | Fix |
|---|---|---|
| `leader_strategy`: `none\|first_experienced\|manual` | `none\|first_assigned\|highest_rated` | **[G3]** Fix mobile types |
| `compensation_kind`: `unpaid\|arranged_outside_system` | `unpaid\|stipend\|travel_reimbursement` | **[G4]** Fix mobile types |

---

### 3.11 Coordinator Applications & Assignments

**BFF Endpoints:** `GET coordinator/events/{id}/applications/`, decision POSTs, `GET coordinator/events/{id}/assignments/`, unassigned, auto/manual assign  
**DB Source:** `event_applications`, `assignments`

**Application list DTO → `CoordinatorApplicationItem` mapping:**

| API | Mobile | Note |
|---|---|---|
| `display_name` | `applicantName` | rename |
| `skills` | `t2Capabilities.skills` | nested |
| `physical_ok` | `t2Capabilities.physicalOk` | nested |
| `can_lift_heavy` | `t2Capabilities.canLiftHeavy` | nested |
| `has_leader_experience` | `t2Capabilities.hasLeaderExperience` | nested |
| `new_to_volunteer` | `t2Capabilities.newToVolunteer` | nested |
| *(context)* | `eventTitle` | **[G14]** Not in DTO — carry from screen context |

Backend sends capability fields for all applications in coordinator view (not gated by status). Mobile mapper should include them; UI controls display.

---

### 3.12 Attendance & Check-in

**BFF Endpoints:** See §1.4  
**DB Source:** `attendance`, `attendance_geo_attempts`, `qr_tokens`

**Geo Check-in Request:**
```json
{
  "event_id": 1, "latitude": 16.8661, "longitude": 96.1951,
  "accuracy_m": 12.0, "captured_at": "2026-11-14T09:00:00Z", "is_mocked": false
}
```

**Attendance board DTO → `CoordinatorAttendanceItem` mapping:**

| API | Mobile | Note |
|---|---|---|
| `attendance_id` | `id` | rename |
| `display_name` | `volunteerName` | rename |
| `attendance_status` | `status` | needs status mapping below |
| `method` | `checkInMethod` | `qr_scan→qr`, `geo→geo`, `coordinator_manual→manual` |
| `checkin_at` | `checkedInAt` | ✅ |
| `confirmation_status` | `isPendingGeoConfirmation` | derive: `pending→true` |
| `checkin_distance_m` | `geoAttempt.distanceMeters` | nested |

**Attendance status mapping (DB → Mobile):**

| DB `attendance.status` | Mobile `AttendanceRecordStatus` |
|---|---|
| `expected` | `scheduled` |
| `checked_in` | `checked_in` |
| `absent` | `no_show` |
| `completed` | `completed` |
| `cancelled` | *(hide or add to type)* |

---

### 3.13 Onboarding

**BFF Endpoints:** `GET events/{id}/onboarding/`, `POST events/{id}/onboarding/acknowledge/`  
**DB Source:** `onboarding_acknowledgments`, `events.onboarding_text`

**DTO:**
```json
{ "event_id", "onboarding_text", "onboarding_version", "require_onboarding_ack", "acknowledged" }
```

**[G10] Mobile domain model missing. Create:**
```typescript
interface EventOnboardingStatus {
  eventId: number;
  onboardingText: string | null;
  onboardingVersion: number;
  requireOnboardingAck: boolean;
  acknowledged: boolean;
}
```

---

### 3.14 QR Tokens

**BFF Endpoints:** `POST qr/resolve/`, `POST qr/redeem/`, `POST coordinator/events/{id}/qr-tokens/`, `POST coordinator/qr-tokens/{id}/revoke/`  
**DB Source:** `qr_tokens`

**[G10] Mobile models missing. Create:**
```typescript
interface QrTokenInfo {
  id: number;
  rawToken: string;
  purpose: 'walkin_registration' | 'checkin' | 'join_event';
  maxUses: number | null;
  expiresAt: string;
}
interface QrResolveResult {
  eventId: number;
  purpose: string;
  isValid: boolean;
  reason: string;
}
```

---

### 3.15 Feedback

**BFF Endpoints:** `POST events/{id}/feedback/`, `GET events/{id}/feedback/list/`, `GET me/feedback/`  
**DB Source:** `feedback`

**Submit request:**
```json
{
  "direction": "volunteer_to_event|volunteer_to_coordinator|coordinator_to_volunteer",
  "score": 5, "tags": ["reliable"], "comment": "...", "target_user_id": null
}
```

**[G10] Mobile models missing. Create:**
```typescript
interface FeedbackSubmit {
  direction: 'volunteer_to_event' | 'volunteer_to_coordinator' | 'coordinator_to_volunteer';
  score: number;
  tags?: string[];
  comment?: string;
  targetUserId?: number | null;
}
interface FeedbackSummary { averageScore: number | null; count: number; }
interface FeedbackItem { id: number; direction: string; score: number; tags: string[]; comment: string | null; createdAt: string; }
```

---

### 3.16 Dashboard (Volunteer)

**No unified backend endpoint exists.** Must be assembled from:

| Data | Endpoint |
|---|---|
| Upcoming commitments | `GET me/assignments/` → filter `status in [assigned, confirmed]` |
| Recent completed activity | `GET me/attendance/` → filter `attendance_status = completed` |
| Rating summary | `GET me/feedback/` → `summary` field |
| Coordinator status | `GET me/coordinator/` |

**[G8]** Consider proposing `GET me/dashboard/` BFF aggregation endpoint. Listed as known gap in v0.7.0 architecture doc.

---

## 4. ViewModels Required

| ViewModel | Endpoints consumed | Domain output |
|---|---|---|
| `useAuthViewModel` | auth OTP request/verify/logout | `AuthUser`, token storage |
| `useProfileViewModel` | `GET/PATCH me/` | `VolunteerProfile` |
| `useCharityFieldsViewModel` | `GET charity-fields/` | `CharityCategory[]` |
| `useCharityInterestsViewModel` | `GET/PUT me/charity-interests/` | `string[]` |
| `useAvailabilityViewModel` | `GET/PUT me/availability/`, exceptions CRUD | `VolunteerAvailability` |
| `useVerificationViewModel` | `GET/POST me/verification-images/` | `VerificationImageSlot[]` |
| `useCoordinatorStatusViewModel` | `GET/POST/PATCH me/coordinator/` | `CoordinatorStatus` |
| `useEventListViewModel` | `GET events/` with filters + pagination | `EventSummary[]` |
| `useEventDetailViewModel` | `GET events/{id}/`, posts | `EventDetail` |
| `useApplicationViewModel` | apply, `GET me/applications/`, withdraw | `VolunteerApplicationItem[]` |
| `useAssignmentViewModel` | `GET me/assignments/`, confirm/cancel | `VolunteerAssignmentItem[]` |
| `useAttendanceHistoryViewModel` | `GET me/attendance/` | attendance list |
| `useOnboardingViewModel` | `GET/POST events/{id}/onboarding/` | `EventOnboardingStatus` |
| `useCheckinViewModel` | geo/qr/manual checkin, checkout | check-in result |
| `useFeedbackViewModel` | `GET/POST me/feedback/`, event feedback | `FeedbackItem[]`, `FeedbackSummary` |
| `useDashboardViewModel` | Aggregates assignments + attendance + feedback | `DashboardSummary` |
| `useCoordinatorEventsViewModel` | `GET/POST coordinator/events/` | `CoordinatorEventSummary[]` |
| `useCoordinatorEventDetailViewModel` | `GET coordinator/events/{id}/summary/` | `CoordinatorEventDetail` |
| `useCoordinatorApplicationsViewModel` | apps list + decisions | `CoordinatorApplicationItem[]` |
| `useCoordinatorAssignmentsViewModel` | assignments, auto/manual assign | `CoordinatorAssignmentItem[]` |
| `useCoordinatorAttendanceViewModel` | board, pending, confirm/reject | `CoordinatorAttendanceItem[]` |
| `useQrTokenViewModel` | create/revoke QR tokens | `QrTokenInfo` |

---

## 5. DTOs to Create in Mobile (`src/data/http/dto/`)

```typescript
// auth.dto.ts
interface OtpRequestDto { phone: string; purpose?: 'login' | 'qr_registration'; }
interface OtpVerifyDto { phone: string; code: string; purpose?: string; display_name?: string; }
interface AuthResponseDto { token: string; user: { id: number; uuid: string; display_name: string; verification_status: string; }; }

// profile.dto.ts
interface UserProfileDto {
  id: number; uuid: string; display_name: string; phone: string | null;
  preferred_language: string; home_area: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
  blood_type: string; is_willing_to_donate: boolean;
  is_willing_to_donate_blood: boolean; is_willing_to_donate_items: boolean;
  physical_ok: boolean; good_eyesight: boolean; needs_glasses: boolean;
  can_lift_heavy: boolean; can_work_outdoor: boolean;
  has_leader_experience: boolean; new_to_volunteer: boolean;
  skills: string[]; needs_meal_support: boolean; needs_travel_support: boolean;
  accepts_unpaid: boolean; verification_status: string; account_status: string;
  charity_interests: string[]; created_at: string;
}
interface ProfileUpdateDto { /* flat snake_case allow-list fields */ }

// event.dto.ts
interface PublicEventDto {
  id: number; title: string; description: string | null; purpose_type: string;
  location_name: string | null; landmark_text: string | null;
  latitude: string | null; longitude: string | null; geo_radius_m: number | null;
  geo_checkin_enabled: boolean; map_provider: string;
  start_at: string; end_at: string; application_deadline: string | null;
  status: string; acceptance_mode: string; max_participants: number | null;
  meals_provided: boolean; lodging_provided: boolean; travel_support_provided: boolean;
  compensation_kind: string; coordinator_name: string;
  charity_fields: string[]; spots_remaining: number;
}
interface EventPostDto {
  id: number; title: string; description: string | null; status: string;
  physical_level: string; required_skills: string[]; leader_needed: boolean;
  new_volunteers_allowed: boolean; required_headcount: number;
  assigned_count: number; remaining: number;
}

// application.dto.ts
interface ApplicationStatusDto {
  id: number; event_id: number; event_title: string | null; event_status: string | null;
  post_id: number | null; post_title: string | null; source: string; status: string;
  applied_at: string; decided_at: string | null; note: string | null;
}

// assignment.dto.ts
interface AssignmentDto {
  id: number; event_id: number; event_title: string; event_status: string;
  post_id: number | null; post_title: string | null;
  group_code: string | null; is_group_leader: boolean; status: string;
  schedule_start: string; schedule_end: string; confirmed_at: string | null;
}

// coordinator.dto.ts
interface CoordinatorEventListDto {
  id: number; title: string; status: string; start_at: string; end_at: string;
  owner_id: number; current_coordinator_id: number;
  is_owner: boolean; is_current_coordinator: boolean; is_read_only_monitor: boolean;
  created_at: string;
}
interface EventSummaryDto {
  id: number; title: string; status: string; start_at: string; end_at: string;
  acceptance_mode: string; auto_assign_enabled: boolean; max_participants: number | null;
  geo_checkin_enabled: boolean; map_provider: string;
  pending_count: number; accepted_count: number; waitlisted_count: number;
  assignment_count: number; checked_in_count: number; pending_confirmations: number;
}
```

---

## 6. Gaps & Required Fixes Before Live Connection

| # | Gap | Severity | Action |
|---|---|---|---|
| G1 | `VolunteerProfile.email` — does not exist in backend (phone-only) | BREAKING | Remove `email`; add `phone?: string` read-only |
| G2 | `EventStatus` mobile only typed `published\|active` | BREAKING | Add `draft\|completed\|cancelled` to type |
| G3 | `LeaderStrategy` mobile values don't match backend | BREAKING | Change `first_assigned→first_experienced`, `highest_rated→manual` |
| G4 | `CompensationKind` mobile values don't match backend | BREAKING | Change `stipend\|travel_reimbursement→arranged_outside_system` |
| G5 | Availability exception `id` not returned in list DTO | Important | Backend serializer must expose `id`; needed for DELETE |
| G6 | `VolunteerAssignmentItem.location` not in assignment DTO | Important | Drop field or fetch from event detail separately |
| G7 | `VolunteerAssignmentItem.assignedAt` not in list DTO | Important | Backend should expose `created_at` as `assigned_at` |
| G8 | No dedicated dashboard BFF endpoint | Important | Aggregate from 3 calls on mobile, or propose `GET me/dashboard/` |
| G9 | `DashboardSummary.verifiedHours` not computed by any endpoint | Low | Derive from `checkin_at` → `checkout_at` duration in attendance history |
| G10 | No mobile model for `Onboarding`, `QrToken`, `Feedback`, `AttendanceHistory` | Important | Create new domain models as specified in §3.13–3.15 |
| G11 | `CoordinatorOverviewMetrics` — no backend aggregate | Important | Compute from coordinator event list + summaries |
| G12 | `attendance.status` values don't map 1:1 to mobile types | Low | Map in HTTP repo layer as documented in §3.12 |
| G13 | Mobile `ratingAverage`/`ratingCount` on profile | Low | Fetch from `GET me/feedback/` summary field |
| G14 | `CoordinatorApplicationItem.eventTitle` not in app list DTO | Low | Carry from screen context |
| G15 | Auth token type (Knox) — mobile must attach `Authorization: Token <value>` | BREAKING | Implement `TokenStorage` and HTTP interceptor in `apiClient.ts` |

---

## 7. HTTP Repository Layer Plan (`src/data/http/`)

Recommended structure to create when switching from mock to live:

```
src/data/http/
├── apiClient.ts              # Axios instance, base URL, Auth: Token interceptor, error handler
├── dto/
│   ├── auth.dto.ts
│   ├── profile.dto.ts
│   ├── event.dto.ts
│   ├── coordinator.dto.ts
│   ├── attendance.dto.ts
│   └── checkin.dto.ts
├── mappers/
│   ├── profileMapper.ts      # flat DTO → nested VolunteerProfile
│   ├── eventMapper.ts        # DTO → EventSummary / EventDetail / EventPost
│   ├── applicationMapper.ts
│   ├── assignmentMapper.ts
│   ├── coordinatorMapper.ts
│   ├── attendanceMapper.ts
│   └── feedbackMapper.ts
├── HttpEventRepository.ts
├── HttpProfileRepository.ts
├── HttpCoordinatorRepository.ts
├── HttpCheckinRepository.ts
└── index.ts                  # swap mock → http via DI at AppProviders level
```

---

## 8. Summary Table — What is Ready vs. Needs Work

| Feature | DB | BFF | Mobile Model | DTO Mapper | Live-Connect Ready? |
|---|---|---|---|---|---|
| OTP Auth | ✅ | ✅ | ⚠️ email gap | Needed | After G1, G15 |
| Volunteer Profile | ✅ | ✅ | ⚠️ email gap | Needed | After G1 |
| Charity Fields | ✅ | ✅ | ✅ (static→live) | Simple | ✅ Ready |
| Charity Interests | ✅ | ✅ | ✅ | Trivial | ✅ Ready |
| Availability | ✅ | ✅ | ✅ | Needed | After G5 |
| Verification Images | ✅ | ✅ | ✅ | Needed | ✅ Ready |
| Coordinator Profile | ✅ | ✅ | ✅ | Simple | ✅ Ready |
| Public Event List | ✅ | ✅ | ✅ | Needed | After G2 |
| Event Detail | ✅ | ✅ | ✅ | Needed | After G2 |
| Event Apply | ✅ | ✅ | ✅ | Needed | ✅ Ready |
| My Applications | ✅ | ✅ | ✅ | Needed | ✅ Ready |
| My Assignments | ✅ | ✅ | ⚠️ missing fields | Needed | After G6, G7 |
| Dashboard | ✅ | ⚠️ no aggregate | ✅ | Aggregate | After G8 |
| Onboarding | ✅ | ✅ | ❌ no model | Needed | After G10 |
| QR Tokens | ✅ | ✅ | ❌ no model | Needed | After G10 |
| Feedback | ✅ | ✅ | ❌ no model | Needed | After G10 |
| Coordinator Events | ✅ | ✅ | ✅ | Needed | After G3, G4 |
| Coordinator Applications | ✅ | ✅ | ✅ | Needed | ✅ Ready |
| Coordinator Assignments | ✅ | ✅ | ✅ | Needed | ✅ Ready |
| Attendance Board | ✅ | ✅ | ✅ | Needed | After G12 |
| Geo Check-in | ✅ | ✅ | ❌ no model | Needed | After G10 |
| Attendance History | ✅ | ✅ | ❌ no model | Needed | After G10 |
