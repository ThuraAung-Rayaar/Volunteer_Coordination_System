# Volunteer Coordination System
# Volunteer & Coordinator Capability Parity — Database-First API and Mobile Data Contract Plan

**Document ID:** V0.11-CAPABILITY-PARITY  
**Plan version:** `v0.11.0`  
**Prepared:** 17 November 2026  
**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch baseline:** `main`  
**Audited HEAD:** `65ed6d34f8c7a365a63dd616973bffeb61d165b0`  
**Prior comparison HEAD:** `7ef92853ea3fc8725a6c40d611ecf62b70e9e690`  
**Database artifact:** `postgres_sql/updated_volunteer_coordination_system_Database.sql`  
**Backend:** Django 5.1 / Django REST Framework 3.15 (as identified by project documentation)  
**Mobile:** React Native 0.88.1 / TypeScript 6.0 (as identified by project documentation)  
**Document purpose:** Extract all volunteer and coordinator capabilities supported by the checked-in PostgreSQL design, make the BFF expose those capabilities through stable contracts, and connect every operation to mobile endpoint clients, DTOs, mappers, domain models, repository contracts, and feature-facing view models.  
**Explicit non-goal:** UI redesign, navigation reconstruction, visual refactoring, and screen layout are deferred until capability parity is demonstrated.

---

# 1. Executive direction

The next development milestone is **capability parity**, not UI work.

The current database already supports a broad volunteer and event-coordination workflow. The mobile client has a real data architecture on `main`, including template/mock and HTTP repository modes, API clients, DTOs, mappers, repositories, domain models, feature folders, and tests. The remaining problem is that those layers do not yet cover every capability and do not always agree about the data being sent or received.

The required result is a traceable, testable chain for every capability:

```text
Database object / rule
        |
        v
Django service operation
        |
        v
BFF route + permissions + serializer
        |
        v
OpenAPI operation + request/response schema
        |
        v
Mobile endpoint client
        |
        v
Request / response DTO
        |
        v
Explicit mapper
        |
        v
Domain model
        |
        v
Repository contract
        |
        +------------------------+
        |                        |
        v                        v
HTTP repository            Mock/template repository
        |
        v
Feature use case / view model
        |
        v
Existing or future UI consumer
```

A capability is not complete merely because a database function exists, a BFF view class exists, an API wrapper exists, or a screen can display sample data. It is complete only when the entire chain exists and its behavior has been demonstrated against PostgreSQL.

## 1.1 Delivery rule

The project must be developed in this order:

1. Extract and freeze the database-supported volunteer and coordinator capability inventory.
2. Correct/complete Django service and BFF operations to expose that inventory.
3. Stabilize route names, methods, request serializers, response serializers, permissions, privacy, and error contracts.
4. Complete mobile endpoint clients and DTOs.
5. Correct domain models and mappers so no data is invented or misidentified.
6. Complete repository contracts and both HTTP/mock implementations.
7. Define feature-facing view models/use cases that compose the domain data.
8. Run database-backed integration and repository-contract tests.
9. Declare capability parity.
10. Only then defragment and rebuild the UI.

Existing screens may remain during this phase as test consumers. Their appearance does not define the scope of the capability layer.

## 1.2 What this plan does not authorize

- No direct PostgreSQL connection from React Native.
- No duplicate business-rule or state-machine implementation in TypeScript.
- No unapproved SQL changes, migrations, schema repairs, or bootstrap execution.
- No broad rewrite of the Django service layer just to make folder names uniform.
- No redesign of screens, navigation, theme, or visual components in this phase.
- No invented API fields, fake user data, fake status values, or default values that conceal missing backend data.
- No claim that a capability is operational merely because a source file or test fixture exists.

---

# 2. Fresh Git baseline and source-of-truth decision

## 2.1 Refreshed Git state

The repository was re-read from GitHub on 17 November 2026. This supersedes the earlier review that treated `main` as a React Native starter-only branch.

| Item | Refreshed result |
|---|---|
| Repository | `ThuraAung-Rayaar/Volunteer_Coordination_System` |
| Default branch | `main` |
| Current HEAD | `65ed6d34f8c7a365a63dd616973bffeb61d165b0` |
| HEAD commit | `Merge branch 'mobile'` |
| Commit date | 17 November 2026 |
| Previous inspected HEAD | `7ef92853ea3fc8725a6c40d611ecf62b70e9e690` |
| Compare result | `main` is 4 commits ahead, 0 behind the previous inspected HEAD |
| Older branch | `fix/bknd_stablize` |
| Older branch HEAD | `de074afe148a80b1558369a69b1ebce8734dad50` |
| GitHub commit status checks | No status entries were returned for the refreshed HEAD |
| Current Actions evidence | No successful current Actions run was available in the reviewed repository query |

The four commits after the prior baseline include the mobile merge, mobile source tree, data-layer files, tests, and mobile/backend analysis documents. The current `main` branch—not the old `fix/bknd_stablize` branch—is the working source baseline for this capability plan.

## 2.2 Current mobile source exists on `main`

The latest `main` branch contains:

```text
mobile/src/
  app/
    AppProviders.tsx
    AppRoot.tsx
    RepositoryProvider.tsx
    UserContext.tsx
    configuration/dataMode.ts

  core/
    api/
      apiClient.ts
      apiConfig.ts
      apiError.ts
      apiResult.ts
    auth/
      sessionManager.ts
      tokenStore.ts

  data/
    contracts/
      coordinatorRepository.ts
      dashboardRepository.ts
      eventRepository.ts
      profileRepository.ts
    dto/
      authDto.ts
      checkinDto.ts
      commonDto.ts
      coordinatorDto.ts
      eventDto.ts
      profileDto.ts
    endpoints/
      authApi.ts
      checkinApi.ts
      coordinatorApi.ts
      eventApi.ts
      profileApi.ts
    http/
      HttpCoordinatorRepository.ts
      HttpDashboardRepository.ts
      HttpEventRepository.ts
      HttpProfileRepository.ts
    mappers/
      coordinatorMapper.ts
      dashboardMapper.ts
      eventMapper.ts
      profileMapper.ts
    mock/
      MockCoordinatorRepository.ts
      MockDashboardRepository.ts
      MockEventRepository.ts
      MockProfileRepository.ts

  domain/
    models/

  features/
    auth/
    coordinator/
    dashboard/
    events/
    profile/
    settings/
```

The current mobile implementation is not absent. It is a meaningful starting data architecture. This plan is about completing and correcting it.

## 2.3 Database version discrepancy — must be resolved before claiming schema parity

The checked-in SQL file itself declares:

```text
Unified PostgreSQL Schema v0.5.2
Target Engine: PostgreSQL 14+ with btree_gist
```

The checked-in `docs/database_deep_dive.md` also identifies schema version v0.5.2 and PostgreSQL 14+ with `btree_gist`. The newer mobile and backend documentation describes the database/backend as v0.6.0 in places. The repository’s top-level README also contains object counts that do not agree with the currently checked-in SQL inventory.

The source of truth for this plan is therefore:

1. The exact checked-in SQL file and its actual object definitions.
2. The actual target database catalog, once a read-only comparison is performed.
3. Django models, services, BFF views, serializers and generated OpenAPI.
4. Mobile DTOs, mappers and repository contracts.
5. Documentation, only where it agrees with the executable source.

**Do not assume that a document’s v0.6.0 label means the checked-in SQL file has been upgraded to v0.6.0.** The database-baseline conflict must be closed in Phase 0/1. This plan does not authorize a schema migration.

## 2.4 Actual checked-in SQL inventory

A source scan of the checked-in SQL file found:

- 22 `CREATE TABLE` declarations.
- 11 `CREATE VIEW` declarations.
- Core functions for OTP, authorization helpers, availability, schedule conflicts, capacity, QR, verification, assignment, handover, geo check-in and attendance confirmation/rejection.
- Trigger functions and triggers enforcing state changes, immutability, audit evidence and workflow guards.
- A `self_test()` function at the end of the SQL file.

The checked-in view names are:

1. `v_event_post_capacity`
2. `v_public_events`
3. `v_event_summary`
4. `v_accepted_unassigned`
5. `v_event_checkin_board`
6. `v_event_checkin_status`
7. `v_pending_confirmations`
8. `v_geo_attempts_review`
9. `v_event_coordinator_history`
10. `v_user_moderation_summary`
11. `v_admin_dashboard`

The README’s stated view count differs from this SQL file. Use the object definitions above until a newer, explicitly versioned SQL artifact is committed and verified.

## 2.5 Verification limits

This is a source-level review of the refreshed GitHub `main` tree and the uploaded `mobile_bff_database_connectivity_audit(1).md`. It did not execute PostgreSQL, Django, Jest, TypeScript, Gradle, Xcode, device GPS, camera, or SMS delivery. The project documentation reports 28 Jest suites and 365 tests, but there was no current commit status result available in the GitHub status query. The reported test count must be rerun against the exact current commit before it is accepted as evidence.

---

# 3. Database capability foundation

The database, not the current mobile screen set, defines the capabilities this phase must expose.

## 3.1 Tables and their role-facing capabilities

| Domain | Database objects | Capability represented |
|---|---|---|
| Configuration | `app_settings` | OTP limits, geo accuracy/radius/fix age and other operational thresholds |
| Taxonomy | `charity_fields` | Controlled activity/charity categories used by profiles and events |
| Identity | `users` | Account identity, public UUID, phone data, profile, capability flags, support/donation preferences, verification and account status |
| User interests | `user_charity_interests` | Volunteer interest categories |
| Availability | `volunteer_availability_rules`, `volunteer_availability_exceptions` | Weekly availability and date-specific overrides |
| Coordinator eligibility | `coordinator_profiles` | Coordinator application and status lifecycle |
| Verification | `user_verification_images` | Volunteer verification image submission and derived verification status |
| Authentication | `auth_otp` | OTP lifecycle, expiry, attempts and rate limiting |
| Event management | `events`, `event_charity_fields` | Event declaration, owner/current coordinator, schedule, location, capacity, support, onboarding and lifecycle |
| Coordinator delegation | `event_coordinator_history` | Append-only record of owner/coordinator changes and handovers |
| Role/post management | `event_posts` | Event roles, headcount, physical level, required skills, priority, leader and new-volunteer requirements |
| QR operations | `qr_tokens` | Purpose-specific, hashed, expiring, revocable and limited-use tokens |
| Recruitment | `event_applications` | Browse, QR walk-in and invitation applications, including decision states |
| Assignment | `assignments` | Accepted application allocation to event/post/group/leader and assignment status |
| Attendance | `attendance` | Expected/check-in/checkout/completion state and attendance method |
| Geo evidence | `attendance_geo_attempts` | Attempt history and anti-fraud evidence |
| Onboarding | `onboarding_acknowledgments` | Versioned, append-only volunteer acknowledgments |
| Feedback | `feedback` | Event, coordinator and volunteer feedback directions |
| Governance | `moderation_actions`, `audit_logs` | Administrative moderation and immutable audit history |

The two governance tables are part of system integrity but do not create volunteer or coordinator administrative powers. Their management remains in the Admin Portal/governance scope.

## 3.2 Core database functions relevant to volunteer/coordinator operations

| Function | Role-facing capability |
|---|---|
| `request_otp(...)` | Request OTP under database rate limiting |
| `verify_otp(...)` | Verify code, attempts, expiry and consumption |
| `is_admin_user(...)` | Determine administrative identity; not a mobile role selector |
| `is_approved_coordinator(...)` | Validate coordinator approval |
| `is_event_manager(...)` | Validate event-scoped management authority |
| `user_has_schedule_conflict(...)` | Prevent overlapping volunteer shifts |
| `is_user_available(...)` | Evaluate weekly rules and date exceptions |
| `application_remaining_capacity(...)` | Determine available event/post capacity |
| `consume_qr_token(...)` | Consume a valid purpose-specific token |
| `qr_token_status(...)` | Read-only token status/preview |
| `recompute_user_verification(...)` | Recompute verification state from submitted images |
| `create_assignment_from_application(...)` | Create assignment following an accepted application |
| `run_auto_assignment(...)` | Run database-owned auto-allocation |
| `assign_manually(...)` | Perform guarded manual allocation |
| `change_event_coordinator(...)` | Handover/retake current coordinator while preserving history |
| `qr_check_in(...)` | QR attendance check-in |
| `qr_walkin_apply(...)` | QR walk-in application |
| `geo_check_in(...)` | Server-side geofence check and geo-attempt recording |
| `confirm_attendance(...)` | Coordinator confirms eligible pending attendance |
| `reject_attendance(...)` | Coordinator rejects eligible pending attendance |
| `release_expired_blocks()` | Maintenance release of expired account blocks |
| `expire_stale_applications()` | Maintenance expiration of stale applications |
| `purge_expired_otps()` | Maintenance OTP cleanup |
| `purge_geo_evidence(...)` | Retention-controlled purge of old location evidence |

The database also defines helper functions for actor context, normalized tags, Haversine distance and runtime settings. Those helpers are not necessarily standalone mobile capabilities.

## 3.3 Trigger-owned business rules

The mobile app and BFF must not reimplement these rules:

| Area | Database-owned invariant |
|---|---|
| User identity | Immutable IDs/UUID; phone-hash uniqueness; account-status consistency |
| Coordinator profile | Allowed status transitions, approval requirements and no self-approval |
| Verification image | New image is pending; current-image replacement; verification recomputation |
| OTP | Rate limit, attempts, expiry and lockout |
| Event insert | New event starts as draft; owner/current coordinator initialization |
| Event update | Lifecycle transition validation, publication preconditions and terminal freeze |
| Event publish | At least one open event post must exist |
| Event post | Capacity and open/full status are trigger-maintained; headcount cannot fall below assigned count |
| QR | Token purpose, expiry, revocation and usage constraints |
| Application | Open-event/deadline/account/post checks; duplicate prevention; availability; schedule overlap; capacity; decision-state transitions |
| Auto-accept/waitlist | Database applies event acceptance mode and capacity behavior |
| Assignment | Accepted-application requirement, post capacity, overlap prevention and group/leader constraints |
| Attendance | Assignment/event eligibility and valid check-in/check-out state |
| Geo attempt | Evidence is guarded and append-only |
| Onboarding | Applicant/participant eligibility, current version and append-only acknowledgment |
| Feedback | Completed event, participation, direction, target, score and no-self-rating rules |
| Audit/history | Append-only audit and coordinator history |

## 3.4 State vocabularies that must be preserved in DTOs

Do not make the DTO use UI-only values as if they were database values.

| Entity | Database state vocabulary to preserve |
|---|---|
| User account | `active`, `blocked`, `closed` |
| Verification | `none`, `pending`, `verified`, `rejected` |
| Coordinator profile | `pending`, `approved`, `suspended`, `revoked` |
| Event | `draft`, `published`, `active`, `completed`, `cancelled` |
| Event post | `open`, `full`, `closed` |
| Application | `pending`, `accepted`, `rejected`, `waitlisted`, `withdrawn`, `expired` |
| Assignment | Preserve the exact assignment status values constrained by the checked-in SQL; do not substitute attendance values |
| Attendance | Preserve the exact values constrained by the checked-in SQL, including expected/check-in/absent/completed/cancelled states where declared |
| Attendance method | Database values include `qr_scan`, `coordinator_manual`, `geo`, and `system` |
| Geo confirmation | Separate from attendance status: pending/confirmed/rejected/not-required semantics |
| QR purpose | `walkin_registration`, `checkin`, `join_event` |
| Feedback direction | `volunteer_to_event`, `volunteer_to_coordinator`, `coordinator_to_volunteer` |

The raw DTO union must match the actual SQL/BFF values. The domain layer may expose friendlier names, but only through an explicit, exhaustive mapper.

---

# 4. Roles, permissions and privacy

## 4.1 Volunteer and coordinator are additive capabilities

A coordinator is still a volunteer. Coordinator approval adds event-management powers; it does not replace ordinary self-service capabilities.

The client must not use a local `role` flag as authorization. The server derives identity from the authenticated token and determines coordinator/event authority from database state.

| Actor condition | Capability boundary |
|---|---|
| Anonymous visitor | Public taxonomy and public published/active event discovery/detail |
| Active volunteer | Own profile, interests, availability, verification submission, coordinator application, event applications, assignments, onboarding, own attendance and permitted feedback |
| Approved coordinator | All volunteer capabilities plus event-scoped management where the caller is the owner/current coordinator and is not read-only monitor |
| Original owner after handover | Read-only event monitor until the owner retakes coordination |
| Current coordinator | Event-specific write authority for the assigned event |
| Admin/Super Admin | Verification review, approval, moderation, audit and governance; excluded from the volunteer/coordinator mobile capability contract |
| System | Trigger/function/maintenance authority; never a user-selectable mobile persona |

## 4.2 Privacy tiers

| Tier | Intended data | Mobile contract rule |
|---|---|---|
| T0 | Public events, public posts and taxonomy | Available only through explicitly public endpoints |
| T1 | Minimal identity and the caller’s own profile | Self profile can expose its permitted private fields; UUID lookup returns only the minimal public card unless event-scoped permission applies |
| T2 | Event-scoped volunteer capability data | Only for a caller with the event-specific access declared by the backend; no general profile dump |
| T3 | Strictly private personal/safety information | Self/admin and explicitly declared active-shift safety exceptions only |
| T4 | Admin/governance/audit/fraud data | Admin-only except specific coordinator review fields explicitly allowed by the privacy policy |

Never expose `phone_hash`, `code_hash`, `token_hash`, password material, encrypted database fields, raw OTP values outside development, or raw QR tokens beyond their one-time creation response.

A coordinator application/roster response must not include T3 data simply because the mobile screen could use it.

## 4.3 Admin-only capability exclusion

The following must not be folded into the coordinator API:

- Approve/reject/suspend/revoke coordinator applications.
- Review or approve verification images.
- Block, unblock, close or reinstate accounts.
- Admin event deletion/restoration.
- Feedback hiding/moderation.
- Unrestricted geo-fraud telemetry.
- Raw audit log access and system dashboard administration.

The volunteer may submit their verification image and coordinator application. The coordinator may manage an authorized event. Governance approval and moderation remain administrative functions.

---

# 5. Volunteer capability inventory

The following is the full volunteer role-facing capability inventory derived from the checked-in database and current BFF design. Each item must be represented in the mobile data layer even if no current screen consumes it.

Legend:

- **DB:** database supports the operation/rule.
- **BFF:** endpoint is present in current BFF routes/views.
- **Mobile:** current `main` endpoint/DTO/repository coverage.
- **Parity:** whether the entire data contract is complete; not a statement about UI.

| ID | Capability | DB source/rule | BFF status | Current mobile status | Required work |
|---|---|---|---|---|---|
| V-01 | Request OTP | `auth_otp`, `request_otp`, OTP rate trigger | Present | `authApi.requestOtp()` | Keep DTO; correct delivery semantics and add provider/runtime proof |
| V-02 | Verify OTP and create session | `verify_otp`, DRF token issuance | Present | `authApi.verifyOtp()`, session/token manager | Complete secure token persistence and real-provider tests |
| V-03 | Logout/revoke token | DRF token deletion | Present | `authApi.logout()` | Verify server revocation and cold-start behavior |
| V-04 | Read own profile | `users`, profile service | Present | `profileApi` + `HttpProfileRepository` | Remove phone-as-email mapping; model phone separately |
| V-05 | Update own profile | `users` allow-list/update guards | Present | `PATCH` wrapper/repository | Correct complete donation-preference merge; verify every DB field mapping |
| V-06 | Manage charity interests | `user_charity_interests` | Present | profile API/repository | Verify replacement semantics and error consistency |
| V-07 | Read weekly availability | `volunteer_availability_rules` | Present | profile API/repository | Exact weekday/time/nullability mapping |
| V-08 | Replace weekly availability rules | availability service/trigger | Present as `POST me/availability/rules/` | Existing repository support | Use actual POST route/method, not a guessed PUT; test full replacement semantics |
| V-09 | Upsert date exception | `volunteer_availability_exceptions` | Present | profile API/repository | Preserve server exception ID |
| V-10 | Delete date exception | exception ownership rules | Present | profile API/repository | Verify owner-scoped delete and no client-generated ID |
| V-11 | Check availability for an event | `is_user_available`, `user_has_schedule_conflict` | GET/POST BFF view present | No endpoint client/repository method | Add request/response DTO and `checkAvailabilityForEvent()` |
| V-12 | Check a proposed date/time window | availability and conflict functions | POST BFF view present | No endpoint client/repository method | Add window request/result contract; preserve separate available/conflict booleans |
| V-13 | Upload verification image | `user_verification_images`, verification triggers | Multipart POST present | No upload method/DTO/repository method | Add multipart endpoint and `uploadVerificationImage()`; native picker is a later consumer concern |
| V-14 | Read verification status/history | verification image table and recompute function | GET present | GET wrapper/DTO/repository present | Align verification statuses and image item fields exactly |
| V-15 | Submit coordinator application | `coordinator_profiles` and eligibility rules | POST present | `applyForCoordinator()` present | Return typed profile result; do not duplicate authoritative eligibility |
| V-16 | Read coordinator application status | coordinator profile table | GET present | Present | Keep separate from ordinary profile DTO |
| V-17 | Update pending coordinator application notes | coordinator profile/service | PATCH present | No `PATCH` wrapper/repository method | Add `updateCoordinatorApplicationNotes()` |
| V-18 | Lookup a person by public UUID | `users.uuid`, T1/T2 privacy rules | GET present | No mobile endpoint/DTO/repository method | Add UUID-based lookup; event-scoped T2 must be enforced by BFF |
| V-19 | Browse active/public charity taxonomy | `charity_fields` | GET present | Event API/repository present | Use server taxonomy as runtime authority; local static list only as offline fallback |
| V-20 | Browse/search/filter public events | `v_public_events`, query service | GET with pagination present | Event API/repository present | Consume all filter parameters supported by backend and implement pagination continuation |
| V-21 | View event detail | `events`, `v_public_events`, visibility/privacy | GET present | Event API/repository present | DTO must preserve nullable fields and conditional T2 fields |
| V-22 | View event posts/roles/capacity | `event_posts`, `v_event_post_capacity` | GET present | Event detail/posts API present | Use server capacity, never calculate it as authoritative client state |
| V-23 | Apply to a selected event post | applications and trigger rules | POST present | Event API/HTTP repository present | Preserve actual `pending/accepted/waitlisted` server result; do not default to UI-only `applied` |
| V-24 | Join through invite source | application source includes `invite` | No explicit volunteer invitation-accept operation is identified | No separate invite acceptance path | Confirm whether invite is a pre-created application the volunteer can view/accept; add only the missing server action if the business rules require it |
| V-25 | Join through QR walk-in | `qr_walkin_apply`, QR purpose/consumption | QR redeem present | `redeemQrToken()` present | Map purpose/result branches separately; test one-time consumption and duplicate scan |
| V-26 | View own applications | `event_applications` | GET present | Event API/repository present | Keep status values exact and support refresh/cache invalidation |
| V-27 | Withdraw own application | application trigger/state transition | POST present | HTTP repository present | Refresh/invalidate application state after success |
| V-28 | View own assignments | `assignments`, event/post join | GET present | Event API/repository present | Assignment DTO must retain correct IDs and schedule; compose event display data rather than fabricate it |
| V-29 | Confirm own assignment | assignment state transition | POST present | Endpoint and HTTP method exist; interface method is optional | Make contract method required and return/refetch authoritative assignment state |
| V-30 | Cancel own assignment participation | assignment transition/cascade | POST present | Event repository present | Confirm only the caller’s own assignment can be cancelled |
| V-31 | Read onboarding content/version/acknowledgment | `events`, `onboarding_acknowledgments` | GET present | Check-in API/repository present | Preserve version and `acknowledged` state |
| V-32 | Acknowledge current onboarding version | append-only onboarding trigger | POST present | Check-in API/repository present | Do not permit client to submit an arbitrary version as authority |
| V-33 | Preview QR token | `qr_token_status` | POST present | `resolveQrToken()` present | Preview must not consume a use |
| V-34 | Redeem general-purpose QR token | `consume_qr_token`, `qr_walkin_apply` | POST present | `redeemQrToken()` present | Use purpose-specific response contract |
| V-35 | QR attendance check-in | `qr_check_in` | Dedicated POST present | API wrapper present; repository uses generic redeem path | Decide and document the exact endpoint per purpose; do not collapse walk-in and check-in |
| V-36 | Geo check-in | `geo_check_in`, `attendance_geo_attempts` | POST present | API/DTO/repository method present | Replace hardcoded coordinates with a real location provider and runtime permission flow |
| V-37 | Checkout attendance | `attendance.checkout_at`, attendance rules | POST present | API/repository present | Return updated attendance record or refetch authoritative state |
| V-38 | View own attendance history | attendance history service and privacy rules | GET present | API/repository present | DTO currently expects fields not returned; align or enrich BFF response |
| V-39 | Submit volunteer-to-event feedback | `feedback` direction/eligibility trigger | POST present | API/repository present | Add response contract tests and refresh own authored feedback |
| V-40 | Submit volunteer-to-coordinator feedback | `feedback` direction/target rules | Shared POST present | Generic method can express direction, but feature repository contract is not explicit | Add explicit direction-safe operation in feedback contract |
| V-41 | Read feedback authored by self | feedback rater rows | `GET me/feedback/` present | Profile API wrapper returns generic DTO | Separate authored feedback list from ratings received about self |
| V-42 | Read aggregate feedback about self | `get_user_feedback_summary` | Included in `GET me/feedback/` | DTO partly supports nested shape; eligibility logic does not consume all nested fields | Align the exact nested summary schema and add mapping tests |
| V-43 | Volunteer dashboard summary | composed assignments/attendance/feedback | No dedicated DB view required | `HttpDashboardRepository` composes multiple APIs | Keep composition in use case/view model; do not invent verified hours or activity facts |

### 5.1 Complete volunteer profile model

The mobile `VolunteerProfile` and profile DTO must explicitly cover the database fields that are returned by the self-profile serializer.

| Group | Database/API fields | Domain representation |
|---|---|---|
| Identity | `id`, `uuid`, `display_name`, `phone` | `UserId`, `UserUuid`, `displayName`, `phone` |
| Language/location | `preferred_language`, `home_area` | `preferredLanguage`, `homeArea` |
| Emergency contact | `emergency_contact_name`, self-view `emergency_contact_phone` | `EmergencyContact` value object; never include encrypted DB field names |
| Health/donation | `blood_type`, `is_willing_to_donate`, `is_willing_to_donate_blood`, `is_willing_to_donate_items` | One `DonationPreferences` object including the master and sub-flags |
| Capability | `physical_ok`, `good_eyesight`, `needs_glasses`, `can_lift_heavy`, `can_work_outdoor`, `has_leader_experience`, `new_to_volunteer` | `VolunteerCapabilities` |
| Skills | `skills` | Normalized string array |
| Support | `needs_meal_support`, `needs_travel_support`, `accepts_unpaid` | `VolunteerSupportPreferences` |
| Verification/account | `verification_status`, `account_status` | Explicit readonly enums |
| Interests | `charity_interests` / `field_codes` | Charity taxonomy code array |

**Confirmed mapping defect:** `profileMapper.ts` currently maps `phone` into a domain `email` field for backward compatibility. The database/BFF contract has phone, not email. Remove that alias and make phone a first-class property.

**Confirmed donation mapping defect:** the current mapper does not represent the aggregate `is_willing_to_donate` field coherently. Partial updates must merge the existing profile state before deriving or sending the aggregate/sub-flags. The DB remains authoritative.

---

# 6. Coordinator capability inventory

Coordinator functions are event-scoped. A user must be an approved coordinator and must satisfy the owner/current-coordinator/event-manager policy for the particular event. The original owner becomes read-only after handover until retake.

| ID | Capability | DB source/rule | BFF status | Current mobile status | Required work |
|---|---|---|---|---|---|
| C-01 | Read own coordinator status | `coordinator_profiles` | GET present | Profile API/repository present | Keep separate status model |
| C-02 | Submit coordinator application | coordinator profile lifecycle | POST present | Present | Eligibility remains server-owned |
| C-03 | Update pending coordinator application notes | coordinator service/profile table | PATCH present | Missing endpoint/repository method | Add typed PATCH method |
| C-04 | List managed events | `events.owner_id`, `current_coordinator_id` | GET present | Coordinator API/repository present | Preserve owner/current coordinator/read-only flags |
| C-05 | Read event summary | `v_event_summary` | GET present | Present | Summary DTO must match all response fields |
| C-06 | Create draft event | event insert trigger and event service | POST present | Present | Event starts as draft; no status/owner override from client |
| C-07 | Read event posts/roles | `event_posts`, `v_event_post_capacity` | GET present | GET wrapper/repository present | Use exact post/capacity response |
| C-08 | Create event post/role | post insert trigger/service | POST present | Missing endpoint/DTO/repository contract | Add `createEventPost()` end-to-end |
| C-09 | Update event post/role | post guard and headcount floor | PATCH present | Missing endpoint/DTO/repository contract | Add `updateEventPost()` end-to-end |
| C-10 | Close event post/role | post state/trigger | POST present | Missing endpoint/DTO/repository contract | Add `closeEventPost()` end-to-end |
| C-11 | Edit event metadata | event update allow-list and frozen states | PATCH present | API wrapper exists; repository interface/HTTP method missing | Add `updateEvent()` and typed response |
| C-12 | Publish event | event lifecycle trigger; open post required | POST present | Present | Preflight `openPostsCount > 0`; still let DB decide |
| C-13 | Activate event | event lifecycle trigger | POST present | Present | Return server state and timestamps |
| C-14 | Complete event | event lifecycle/cascade | POST present | Present | Re-fetch event, assignments and attendance after completion |
| C-15 | Cancel event | event lifecycle/cascade | POST present | Present | Display and reconcile application/assignment cascade results |
| C-16 | Hand over event coordination | `change_event_coordinator`, history table | POST present | HTTP method exists; repository contract is optional | Make required in repository contract and return updated owner/coordinator state |
| C-17 | Retake event coordination as owner | same function plus original-owner rule | POST present | HTTP method exists; repository contract is optional | Make required in repository contract and reconcile monitor state |
| C-18 | Read coordinator handover history | `v_event_coordinator_history` | No BFF route found | No mobile DTO/repository | Add manager-scoped history endpoint and response DTO |
| C-19 | Review event applications | `event_applications`, T2 policy | GET present | API/DTO/repository present | Complete permitted T2 profile field set without exposing T3 |
| C-20 | Accept application | application state/capacity triggers | POST present | API/repository present; response only `{id,status}`; repository drops `data` | Return a typed decision result and reconcile list/detail state |
| C-21 | Reject application | application decision trigger | POST present | Same as C-20 | Same |
| C-22 | Waitlist application | capacity and waitlist state rules | POST present | Same generic action path | Same |
| C-23 | Invite volunteer | `invite_volunteer_to_event()`, source `invite` | No BFF route/serializer found | No mobile method | Add manager-authorized invite endpoint and mobile contract |
| C-24 | Run auto-assignment | `run_auto_assignment()` | POST present | API/repository present | Align exact returned counts/result shape |
| C-25 | Manually assign accepted volunteer | `assign_manually()` | POST present | API/repository present but DTO shape is wrong | Return a typed minimal result or complete assignment serializer; never cast one to the other |
| C-26 | View event assignments | `assignments` | GET present | API/DTO/repository present | Add correct `application_id`; do not substitute assignment ID |
| C-27 | View accepted/unassigned applicants | `v_accepted_unassigned` | GET present | API/DTO/repository present | Ensure T2 fields are complete and truthful |
| C-28 | View post capacity | `v_event_post_capacity` | GET present | No mobile endpoint/DTO/repository method | Add capacity endpoint client and repository contract |
| C-29 | Lookup volunteer by public UUID | `users.uuid`, T1/T2 rules | GET present | No mobile endpoint/DTO/repository method | Add UUID DTO and event-scoped lookup |
| C-30 | View event attendance roster | `v_event_checkin_board` | GET present | API/DTO/repository present | Fix method/status mapping and maintain privacy boundary |
| C-31 | Manually check in volunteer | attendance service/trigger | POST present | API/repository present | Keep event-manager authorization and eligible-attendance checks |
| C-32 | Create event QR token | `qr_tokens` insert/hash/purpose/expiry | POST present | API and HTTP method present; repository method optional | Make required in coordinator contract; return raw token once only |
| C-33 | Revoke event QR token | `qr_tokens.revoked_at` | POST present | API and HTTP method present; repository method optional | Make required in coordinator contract |
| C-34 | View pending geo confirmations | `v_pending_confirmations` | GET present | API/DTO/repository present | Align with attendance/geo status contract |
| C-35 | Review geo attempt history | `v_geo_attempts_review` | GET present | No mobile endpoint/DTO/repository method | Add safe event-scoped review DTO and repository operation |
| C-36 | Confirm geo attendance | `confirm_attendance()` | POST present | API/repository present | Return/refetch updated attendance item |
| C-37 | Reject geo attendance | `reject_attendance()` | POST present | API/repository present | Return/refetch updated attendance item |
| C-38 | Submit coordinator-to-volunteer feedback | feedback direction/eligibility | Generic POST present | Event repo can pass direction; coordinator contract has no operation | Add explicit feedback repository operation with target user |
| C-39 | Read coordinator feedback summary | feedback aggregate service | No coordinator-specific BFF route found | No coordinator repository/DTO | Decide exact privacy-safe response and add route if role-facing requirement is approved |

### 6.1 Event declaration must be a complete operation

The database publication rule requires at least one open post. Event creation by itself is not a complete coordinator event workflow.

```text
Create event (draft)
      |
      v
Create one or more event posts / roles
      |
      v
Configure required headcount, physical level, skills,
priority, leader requirement and new-volunteer allowance
      |
      v
Read post capacity from v_event_post_capacity
      |
      v
Update event metadata as permitted
      |
      v
Publish (database validates open post precondition)
      |
      v
Activate
      |
      v
Recruit / review / invite / assign
      |
      v
Onboard / check in / confirm / check out
      |
      v
Complete or cancel
```

The BFF already exposes post create/update/close operations, but the mobile `CoordinatorRepository`, endpoint client and HTTP repository currently do not implement these write operations. This is a critical data capability gap even though no UI is requested in this phase.

### 6.2 Assignment workflow must expose all parameters

Manual assignment currently accepts:

- `application_id`
- optional `post_id`
- optional `group_code`
- `is_group_leader`

The mobile screen currently sends hardcoded group code `GRP-C` and `false` for the leader flag. That is not a complete capability contract. The data layer must expose all supported server parameters and return the actual created assignment identifier and state. UI selection comes later.

The DB function is authoritative for accepted-application eligibility, event-manager authority, capacity, and assignment creation.

### 6.3 Handover and Owner-as-Monitor are data capabilities

A handover is not merely a coordinator button. The data contract must include:

- Original owner ID/UUID.
- Current coordinator ID/UUID.
- `is_owner`.
- `is_current_coordinator`.
- `is_read_only_monitor`.
- Handover/retake result.
- Coordinator history rows (from/to coordinator, timestamp, actor/reason where permitted).

A stale or fabricated `is_read_only_monitor=false` value could cause the mobile client to present write affordances when the actor is not allowed to write. The backend still rejects unauthorized writes, but the mobile view model must map the real flags correctly.

---

# 7. BFF capability and route contract

## 7.1 API base

The current mobile configuration uses `/api/v1`. Keep one canonical base:

```text
{API_BASE_URL}/api/v1/
```

The root URL configuration also mounts the same BFF at `/api/bff/mobile/` and `/api/`. Those are compatibility aliases, not separate implementations. Mobile must not mix prefixes across endpoint modules.

## 7.2 Route namespace policy

The BFF URL tree includes both namespaced routes and root-level compatibility aliases. Some root aliases have identical path shapes:

- Public volunteer `GET events/{event_id}/` and coordinator `PATCH events/{event_id}/`.
- Public volunteer `GET events/{event_id}/posts/` and coordinator `GET/POST events/{event_id}/posts/`.

Django selects the first matching path. It does not try a later view simply because the earlier view does not accept the requested HTTP method. Therefore mobile must use the explicit coordinator namespace for coordinator event detail and post management.

**Canonical choices:**

- Public volunteer event routes: existing root paths under `/api/v1/`.
- Coordinator event read/write routes: `/coordinator/events/...`.
- Check-in/onboarding/QR/attendance: `/checkin/...`.
- Coordinator attendance management: `/checkin/coordinator/...`.
- Coordinator lifecycle routes that are currently only mounted at root: retain the documented root action path and add route tests; do not invent a prefixed path that is not registered.
- New routes must be added in one explicit namespace and described in OpenAPI.

## 7.3 Authentication

The BFF uses DRF token authentication:

```http
Authorization: Token <token>
```

A valid user token must be attached only to authenticated calls. The backend must derive actor ID from the authenticated user and set PostgreSQL request context inside the relevant transaction. The mobile client must never send `app.user_id`, `app.ip`, role flags or coordinator authority as proof of permission.

## 7.4 Canonical BFF route catalogue

All paths below are relative to `/api/v1/`.

### Authentication

| Method | Path | Purpose |
|---|---|---|
| POST | `auth/otp/request/` | Request OTP |
| POST | `auth/otp/verify/` | Verify OTP/create token |
| POST | `auth/logout/` | Revoke current token |

### Volunteer self-service

| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | `me/` | Read/update allow-listed self profile |
| GET/PUT | `me/charity-interests/` | Read/replace interests |
| GET | `me/availability/` | Read rules and exceptions |
| POST | `me/availability/rules/` | Replace weekly availability rules |
| POST | `me/availability/exceptions/` | Upsert date exception |
| DELETE | `me/availability/exceptions/{exception_id}/` | Delete date exception |
| GET | `me/availability/check/?event_id={id}` | Check event availability |
| POST | `me/availability/check/` | Check proposed time window |
| GET/POST | `me/verification-images/` | Read status/upload image |
| GET/POST/PATCH | `me/coordinator/` | Read/submit/update coordinator application |
| GET | `users/by-uuid/{uuid}/` | T1/T2 identity lookup with optional event context |
| GET | `me/applications/` | Own applications |
| POST | `applications/{application_id}/withdraw/` | Withdraw application |
| GET | `me/assignments/` | Own assignments |
| POST | `assignments/{assignment_id}/confirm/` | Confirm own assignment |
| POST | `assignments/{assignment_id}/cancel/` | Cancel own participation |

### Public event discovery/recruitment

| Method | Path | Purpose |
|---|---|---|
| GET | `charity-fields/` | Active taxonomy |
| GET | `events/` | Public event listing, filters and page |
| GET | `events/{event_id}/` | Public/authorized detail |
| GET | `events/{event_id}/posts/` | Public post/capacity details |
| POST | `events/{event_id}/apply/` | Apply to event/post |

### Coordinator management

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `coordinator/events/` | List/create managed events |
| GET | `coordinator/events/{event_id}/summary/` | Event metrics |
| PATCH | `coordinator/events/{event_id}/` | Update event metadata |
| GET/POST | `coordinator/events/{event_id}/posts/` | List/create posts |
| PATCH | `posts/{post_id}/` | Update post |
| POST | `posts/{post_id}/close/` | Close post |
| POST | `events/{event_id}/publish/` | Publish |
| POST | `events/{event_id}/activate/` | Activate |
| POST | `events/{event_id}/complete/` | Complete |
| POST | `events/{event_id}/cancel/` | Cancel |
| POST | `events/{event_id}/handover/` | Handover |
| POST | `events/{event_id}/retake/` | Retake |
| GET | `coordinator/events/{event_id}/applications/` | Review applications |
| POST | `coordinator/applications/{application_id}/accept/` | Accept |
| POST | `coordinator/applications/{application_id}/reject/` | Reject |
| POST | `coordinator/applications/{application_id}/waitlist/` | Waitlist |
| POST | `coordinator/events/{event_id}/auto-assign/` | Automatic assignment |
| POST | `coordinator/events/{event_id}/manual-assign/` | Manual assignment |
| GET | `coordinator/events/{event_id}/assignments/` | Assignment list |
| GET | `coordinator/events/{event_id}/unassigned/` | Accepted-unassigned list |
| GET | `coordinator/events/{event_id}/post-capacity/` | Post capacity |

### Check-in and feedback

| Method | Path | Purpose |
|---|---|---|
| GET | `checkin/events/{event_id}/onboarding/` | Read briefing/status |
| POST | `checkin/events/{event_id}/onboarding/acknowledge/` | Acknowledge |
| POST | `checkin/qr/resolve/` | Preview QR |
| POST | `checkin/qr/redeem/` | Redeem QR by purpose |
| POST | `checkin/attendance/qr-checkin/` | Check-in only |
| POST | `checkin/attendance/geo-checkin/` | Geo check-in |
| POST | `checkin/attendance/manual-checkin/` | Coordinator manual check-in |
| POST | `checkin/attendance/{attendance_id}/checkout/` | Check out |
| POST | `checkin/coordinator/events/{event_id}/qr-tokens/` | Create QR token |
| POST | `checkin/coordinator/qr-tokens/{qr_id}/revoke/` | Revoke QR token |
| GET | `checkin/me/attendance/` | Own sanitized attendance history |
| GET | `checkin/coordinator/events/{event_id}/attendance/` | Coordinator attendance board |
| GET | `checkin/coordinator/events/{event_id}/attendance/pending/` | Pending confirmations |
| GET | `checkin/coordinator/events/{event_id}/geo-attempts/` | Geo attempt review |
| POST | `checkin/coordinator/attendance/{attendance_id}/confirm/` | Confirm |
| POST | `checkin/coordinator/attendance/{attendance_id}/reject/` | Reject |
| POST | `checkin/events/{event_id}/feedback/` | Submit feedback |
| GET | `checkin/events/{event_id}/feedback/list/` | Permitted event feedback read |
| GET | `checkin/me/feedback/` | Authored feedback plus own aggregate summary |

### 7.5 Existing BFF gaps

The current BFF is broad, but not every database operation has a reachable endpoint.

| Priority | Capability | Current state | Required BFF work |
|---|---|---|---|
| P0 | Coordinator invite volunteer | `application_service.invite_volunteer_to_event()` exists; route/view/serializer not identified | Add a manager-authorized invite endpoint that creates `source='invite'` application and returns a typed application DTO |
| P1 | Coordinator handover history | SQL view `v_event_coordinator_history` exists; no mobile-facing BFF route is registered | Add event-manager history endpoint with privacy-safe fields |
| P1 | Coordinator feedback read/summary | Current check-in URLs expose event feedback list and own feedback; no coordinator-specific route is registered | Define exact meaning/privacy, then add coordinator feedback route only if it is required for coordinator capabilities |
| P1 | Complete T2 volunteer profile in application review | Current serializer exposes a subset of capability data | Return all and only fields permitted by T2; do not invent data in mobile |
| P1 | Manual assignment response | Service/BFF returns a minimal assignment/application identifier result | Either create a complete response serializer or define a minimal mutation-result DTO and refetch full assignment |
| P1 | Application decision response | BFF returns `{id,status}` | Mobile must reconcile by merging with known item or refetching the application list; no fabricated full item |
| P2 | Public event proximity filter | Coordinates and `geo_distance_m` exist, but `query_service.list_public_events()` does not accept latitude/longitude/radius | Treat as a new query capability extension, not an already working database query |

BFF operations that are already registered and need mobile parity—not a new BFF endpoint—include event post create/update/close, verification upload, availability checks, UUID lookup, post-capacity summary and geo-attempt review.

---

# 8. Mobile data architecture: required completion

## 8.1 Preserve the current architecture

The current project already uses the correct broad shape:

- `core/api/` for transport and error handling.
- `core/auth/` for session/token abstraction.
- `data/endpoints/` for endpoint wrappers.
- `data/dto/` for wire contracts.
- `data/mappers/` for conversion.
- `data/contracts/` for repository interfaces.
- `data/http/` for BFF-backed repositories.
- `data/mock/` for deterministic template/demo behavior.
- `domain/models/` for app concepts.
- `RepositoryProvider` for dependency injection.

Do not replace this structure. Extend it with consistent contracts and add `usecases/` or feature `viewModels/` only where composition is necessary.

## 8.2 Capability completeness chain

For each capability ID in Sections 5 and 6, the evidence ledger must identify all of the following:

| Layer | Required artifact |
|---|---|
| PostgreSQL | Table/function/view/trigger/constraint supporting the operation |
| Service | Exact Python service operation |
| BFF | Registered URL and allowed method |
| Permission | Authentication, role and event-scope policy |
| Request serializer | Allow-list and validation |
| Response serializer | Exact returned field set and nullability |
| OpenAPI | Operation ID, request schema, response schema, status/error codes |
| Mobile endpoint | Typed `*Api.ts` method |
| Request DTO | Exact wire payload, when a body exists |
| Response DTO | Exact response envelope and fields |
| Mapper | Explicit conversion and tests |
| Domain model | Stable application concept |
| Repository contract | Required operation available to all consumers |
| HTTP repository | Calls endpoint, maps response and propagates errors |
| Mock repository | Same behavior/signature and valid domain result |
| Feature use case/view model | Composes domain data and operation state |
| Test evidence | Endpoint, mapper, repository and PostgreSQL-backed integration tests |

## 8.3 DTO rules

1. DTOs must describe exactly what the BFF sends and accepts.
2. Domain models must not duplicate snake_case or transport response envelopes.
3. Nullable fields remain nullable. Missing data is not an empty string, false boolean or fake label.
4. Use distinct identifier types:
   - `UserId` — internal numeric database identifier when required by a secured BFF endpoint.
   - `UserUuid` — public UUID for cross-user identification.
   - `EventId`, `PostId`, `ApplicationId`, `AssignmentId`, `AttendanceId`, `QrTokenId` — never interchangeable.
5. Do not map `assignment_id` into `application_id`.
6. Timestamps preserve timezone/offset semantics. Do not substitute `confirmed_at` for `assigned_at`.
7. Database numeric/decimal values are parsed explicitly and must not silently become `NaN`.
8. Unknown raw enum values must be preserved as unknown/unsupported or fail mapping safely. Never coerce an unknown state into a successful state.
9. Pagination DTOs must preserve `count`, `next`, `previous`, and `results`.
10. DTOs for T2/T3/T4 data must not be merged into a universal `UserProfileDto`.

## 8.4 Current confirmed DTO/mapper defects

| Area | Confirmed source issue | Required correction |
|---|---|---|
| Profile identity | `mapUserProfile()` assigns phone to domain `email` for backward compatibility | Remove fake email alias; add `phone` to domain model |
| Donation preferences | Aggregate `is_willing_to_donate` is not coherently modeled with sub-flags; partial patch may derive an incorrect master value | Model aggregate + sub-flags together; merge current state before patch |
| Coordinator application T2 | Mapper fills absent fields with defaults such as good eyesight, outdoor capability, English, empty home area, support preferences and verified status | BFF returns full permitted T2 fields; mapper copies only actual values |
| Coordinator event list | Mapper fabricates blank description, generic location, charity fields, purpose and coordinator name | Extend safe BFF list DTO or compose authorized detail; never invent event facts |
| Coordinator assignment | Mapper assigns `applicationId = dto.id` | BFF must return distinct `application_id`; mapper preserves both IDs |
| Coordinator assignment time | Mapper uses `confirmed_at` or schedule start as `assignedAt` | Add actual `assigned_at` to BFF or omit it |
| Attendance method | DB values `qr_scan`/`coordinator_manual` do not match mobile union `qr`/`manual` | Use raw DTO union plus explicit mapping |
| Attendance status | Mobile maps UI states such as `scheduled`, `pending_confirmation`, `checked_out`, `no_show` directly from raw DB status | Separate `attendanceStatus`, `confirmationStatus`, and presentation state |
| Attendance history | DTO expects event title/post title/location/verified hours not returned by current BFF history response | Keep the DTO minimal or add an explicitly enriched safe BFF response; do not invent verified hours |
| Feedback summary | BFF returns nested `as_volunteer`, `as_coordinator`, counts/averages and distribution; mobile DTO/eligibility logic still leans on legacy flat keys | Freeze exact nested response schema and update all consumers |
| Event enums | Mobile uses `first_assigned`/`highest_rated`; SQL declares `none`/`first_experienced`/`manual` | Align to DB enums; document presentation mapping if UI needs richer labels |
| Compensation enum | Mobile uses `stipend`/`travel_reimbursement`; SQL uses `unpaid`/`arranged_outside_system` | Align DTO to database value; no payment semantics may be implied |
| Application state | Mobile uses UI fallback `applied` where DB/BFF state is `pending` | Preserve raw server status |
| Manual assignment response | Mobile `manualAssign()` expects full assignment DTO while service returns minimal assignment/application IDs | Use correct result DTO or return complete serializer payload |
| Event summary/detail | Coordinator mapper hardcodes defaults for missing event information and detail settings | Extend API or compose detail; no placeholder business facts |

## 8.5 Repository contract completeness

A method existing inside an HTTP class is insufficient if the role-facing repository interface does not expose it. The interface is the capability boundary.

### `ProfileRepository` — add/complete

- `checkAvailabilityForEvent(eventId)`
- `checkAvailabilityForWindow(startAt, endAt)`
- `uploadVerificationImage(imageType, file)`
- `updateCoordinatorApplicationNotes(notes)`
- `lookupUserByUuid(uuid, eventId?)` where policy permits
- `getAttendanceHistory()`
- `getOwnFeedback()` / `getFeedbackSummary()` with distinct meaning

### `EventRepository` — add/complete

- Page-based or cursor-based `getEvents()` with next-page continuation.
- `confirmAssignment()` as a required method, not optional.
- Onboarding read and acknowledgment as required operations.
- QR preview and redeem with explicit purpose.
- QR check-in-only operation distinct from general QR redeem.
- Geo check-in using a location-fix object, not bare hardcoded coordinates.
- Checkout.
- Feedback submit with explicit direction/target.
- Feedback read if event feedback is intended for volunteers.
- Invalidate/refetch application and assignment caches after mutations.

### `CoordinatorRepository` — add/complete

- `updateEvent(eventId, update)`
- `createEventPost(eventId, data)`
- `updateEventPost(postId, update)`
- `closeEventPost(postId)`
- `handoverEvent(...)` — make required, not optional
- `retakeEvent(...)` — make required, not optional
- `inviteVolunteer(eventId, volunteerUuid, postId?, note?)`
- `getCoordinatorHistory(eventId)`
- `getPostCapacity(eventId)`
- `getGeoAttempts(eventId)`
- `lookupVolunteerByUuid(uuid, eventId)`
- `createQrToken(...)` — make required where coordinator QR is in-scope
- `revokeQrToken(...)` — make required where coordinator QR is in-scope
- Decision operations must return a typed mutation result and update/refetch list state.
- Auto/manual assignment results must match the BFF response shape.

### Shared check-in and feedback contracts

The capabilities are shared between volunteer and coordinator workflows. A separate `CheckInRepository` and `FeedbackRepository` is recommended if it makes the contracts clearer; otherwise extend existing interfaces without duplicating transport logic.

`CheckInRepository` should expose onboarding, QR preview/redeem/check-in, create/revoke coordinator QR, geo check-in, manual check-in, checkout, attendance history, roster, pending confirmations, geo review, confirm and reject.

`FeedbackRepository` should distinguish:
- Feedback authored by the current user.
- Aggregate feedback about the current user.
- Volunteer-to-event submission.
- Volunteer-to-coordinator submission.
- Coordinator-to-volunteer submission.
- Event feedback list where policy allows.

Do not treat an aggregate rating summary as a list of comments authored by the current user.

---

# 9. Feature-facing view-model contracts

This section declares data composition requirements, not screen layouts.

| View-model/use-case group | Required data | Required operations |
|---|---|---|
| Authentication/session | Phone state, OTP request/delivery result, verified user identity, token/session state | Request OTP, verify, restore session, logout; distinguish provider delivery failure |
| Volunteer profile | Complete profile, skills/capabilities, donation/support preferences, interests, verification/coordinator state | Read, patch, replace interests, submit image, coordinator apply/update |
| Availability | Weekly rules, date exceptions, server IDs, event/window conflict result | Replace rules, upsert/delete exception, check availability |
| Public event discovery | Taxonomy, filter state, pagination envelope, event cards | Search/filter/sort/next page/refresh |
| Event detail | Full permitted event detail, posts, capacity, current application state | Apply, availability check, read onboarding/QR options |
| Volunteer applications | Own application rows with exact state | Withdraw and reconcile state |
| Volunteer assignments | Assignment ID, application ID where available, event/post, schedule, assignment status | Confirm/cancel and reconcile |
| Volunteer attendance | Attendance status, method, check-in/out, confirmation state | QR/geo check-in, checkout, refresh |
| Volunteer history | Sanitized attendance records and safe joined display information | Read/refresh; no raw GPS evidence |
| Feedback | Authored feedback rows and received aggregate in separate properties | Direction-specific submit/read operations |
| Coordinator workspace | Managed events, owner/current coordinator, monitor flag, summary counts | Load/refresh; no fabricated event details |
| Coordinator event contract | Persisted event fields, status, owner and coordinator | Create/update/transition/hand over/retake |
| Coordinator post manager | Posts, headcount, assigned/remaining, priority, open/full/closed | Create/update/close; refetch authoritative capacity |
| Coordinator application review | Application and permitted T2 capability profile | Accept/reject/waitlist/invite; reconcile result |
| Coordinator assignment manager | Assignment rows, accepted-unassigned rows, post capacity, group/leader values | Auto/manual assign, cancel, refresh |
| Coordinator history | Handover sequence, from/to coordinator, timestamp/reason where permitted | Read event history |
| Coordinator attendance | Roster, status, method, pending confirmation | Manual check-in, confirm/reject, refresh |
| Coordinator geo review | Geo result/status, accuracy, timestamp, safe distance/review data allowed by policy | Read-only review and permitted decision |
| Coordinator QR | Token ID, purpose, expiry, usage limit, one-time raw token | Create/display once/revoke; never persist/log raw token |
| Coordinator feedback | Feedback authored by coordinator and aggregate where authorized | Submit/read direction-specific feedback |

A view model may combine several domain responses. It must not contain `fetch()`, URL construction, SQL semantics, permissions, or invented fields.

---

# 10. Cross-cutting HTTP, session and device requirements

These requirements are part of connectivity parity even though they are not role-specific business capabilities.

## 10.1 Data modes

Current `dataMode.ts` initializes and resets to `mock`.

Required behavior:

- `mock` is deliberately selected for demo and deterministic tests.
- Integration and production configurations select `http`.
- The current mode is observable in diagnostics.
- An HTTP failure never silently falls back to template fixtures.
- Both modes implement identical repository contracts and domain result types.

A failed request must remain a failed request, not a “successful” demo response.

## 10.2 Token persistence

The current `tokenStore.ts` tries to require `@react-native-async-storage/async-storage`, but that package is not in the current `mobile/package.json`. If unavailable, it falls back to `MemoryTokenStore`. Memory storage does not persist the session across app restarts.

Required work:

- Add a platform-secure token implementation backed by Android Keystore and iOS Keychain through a React Native-compatible secure-storage library.
- Keep memory storage for isolated tests only.
- Do not use ordinary preferences/AsyncStorage as the final auth-token store.
- Test cold-start restore, expired/invalid token, logout, revoked token and reinstall behavior.
- Ensure token redaction in logs and error reports.

## 10.3 OTP delivery

The backend currently activates `ConsoleOtpDeliveryAdapter`. This adapter logs the delivery intent and does not send an actual SMS. In non-passthrough mode it can return `delivered:false`, while the outer auth service response still uses `status:"sent"`.

Required work:

- Implement/configure a real SMS delivery adapter for real-user environments.
- Return truthful delivery status.
- Keep raw OTP disclosure restricted to the explicit development path.
- Test provider success/failure/timeout, rate limits, wrong code, expiry, attempts exhausted, blocked account and closed account.

Until this exists, OTP request/verification is a development integration, not a production-ready real-user login.

## 10.4 Device location

The uploaded connectivity audit identifies hardcoded coordinates `(16.805, 96.155, 15)` in `MyAssignmentsScreen` and missing Android location permissions. The refreshed `main` screen still contains that hardcoded submission, and the checked-in Android manifest contains only Internet permission.

Required data-layer work:

- Add a `LocationProvider` abstraction that returns coordinates, accuracy, capture timestamp and mock-provider indication.
- Add Android fine/coarse permissions and runtime permission handling.
- Use a tested native geolocation provider compatible with current RN.
- Pass the fix to the HTTP repository; never use fixed demo coordinates in HTTP mode.
- Preserve server authority for age, accuracy, mocked-location and geofence checks.
- If location permission is denied or no fix is available, return a local device error without calling the backend.

The user-facing location/map UI is outside this phase.

## 10.5 Manual assignment parameters

Current coordinator assignment screen hardcodes `GRP-C` and `false` for group-leader selection. The data layer must expose the database-supported inputs; the eventual UI can choose them later. For now the repository must accept validated parameters and preserve the server result.

## 10.6 Pagination and cache consistency

- Public events are page-number paginated (20 by default, configurable up to 100).
- Current `HttpEventRepository.getEvents()` reads only the first page.
- Implement pagination continuation in the repository contract.
- After apply/withdraw, invalidate or update both the event-detail and own-application state.
- After coordinator decisions, invalidate/refetch application lists.
- After auto/manual assignment, invalidate assignment, unassigned and capacity data.
- After attendance confirm/reject/checkout, invalidate the attendance board and volunteer history.
- Do not assume a successful POST implies every other cached response is synchronized.

## 10.7 Proximity search is a separate extension

The database stores event coordinates and defines `geo_distance_m()`. However, the current `query_service.list_public_events()` allow-list does not accept latitude/longitude/radius parameters. Therefore nearest-event filtering is not currently an exposed database-backed public-event capability.

If added after core parity, define it explicitly:
- Request: latitude, longitude, radius.
- Validation: coordinate ranges and maximum radius.
- SQL query: server-side distance calculation/filter/sort.
- Response: optional distance field and stable pagination.
- Tests: boundary, missing coordinates, radius, sort and public-visibility cases.

Do not claim proximity filtering merely because event coordinates exist.

---

# 11. Prioritized backend and mobile remediation register

## 11.1 P0 — capability blockers

| ID | Finding | Required outcome |
|---|---|---|
| P0-01 | Event post create/update/close exists in BFF but has no complete mobile transport/DTO/repository contract | Coordinator can declare roles/posts and satisfy publish precondition through the data layer |
| P0-02 | Application decision repository drops updated data although callers expect it | Decision operation returns a typed minimal result and updates/refetches application state |
| P0-03 | Manual assignment response is typed as a full assignment when backend returns a minimal result | DTO and BFF response are made consistent |
| P0-04 | Manual assignment domain mapping uses assignment ID as application ID | Distinct IDs are preserved |
| P0-05 | Coordinator T2 mapper fabricates profile capability data | BFF serializer and DTO deliver real permitted T2 values; no fabricated defaults |
| P0-06 | `phone` is represented as `email` in the domain profile | Correct profile identity contract |
| P0-07 | Geo check-in uses hardcoded coordinates and Android manifest has no location permissions | Real device location provider and runtime permission contract |
| P0-08 | Token store falls back to memory and secure storage is not configured | Secure persistent session storage |
| P0-09 | OTP provider does not send real SMS and delivery status can be misleading | Truthful provider-backed login in production |

## 11.2 P1 — capability parity gaps

| ID | Finding | Required outcome |
|---|---|---|
| P1-01 | Missing mobile invite capability although service supports it | Invite operation exposed through BFF and repository |
| P1-02 | No BFF coordinator history route for database view | Read authorized handover history |
| P1-03 | Coordinator feedback read/summary contract is not registered | Define role-facing feedback contract and route if required |
| P1-04 | Mobile has no post-capacity endpoint/repository | Coordinator sees DB-authoritative capacity data |
| P1-05 | Mobile has no geo-attempt review endpoint/repository | Coordinator can inspect allowed event geo-review data |
| P1-06 | Mobile has no user UUID lookup repository | UUID scan/lookup can consume T1/T2 policy response |
| P1-07 | Availability check BFF has no mobile endpoint/DTO/repository | Volunteer can query event/window availability |
| P1-08 | Verification upload has no mobile transport method/DTO/repository | Volunteer can submit image bytes through multipart endpoint |
| P1-09 | Coordinator PATCH application notes is missing mobile method | Pending application can be updated |
| P1-10 | Event update API wrapper exists but repository interface/implementation is missing | Event metadata can be updated through repository |
| P1-11 | Handover/retake/QR methods are optional in repository interface | Full capabilities are guaranteed by the contract |
| P1-12 | Feedback list endpoint has no mobile wrapper | Permitted event feedback can be read |
| P1-13 | Public event pagination truncates at first page | Full event collection can be browsed |
| P1-14 | Assignment and attendance DTO fields do not match BFF response | No field is guessed, substituted or silently omitted |

## 11.3 P2 — model and lifecycle correctness

| ID | Finding | Required outcome |
|---|---|---|
| P2-01 | Attendance method/status mappings differ from SQL values | Exhaustive raw-to-domain mapping |
| P2-02 | Feedback summary nested shape is incompletely consumed | Correct feedback and eligibility values |
| P2-03 | Event leader/compensation enums are different from database | Exact transport enum vocabulary |
| P2-04 | Donation master/sub-flags can be patched inconsistently | Coherent value object and regression tests |
| P2-05 | Coordinator event summary/detail maps fabricated values | Complete or explicitly nullable event model |
| P2-06 | Application/assignment caches become stale after mutations | Mutation result or targeted refetch/invalidation |
| P2-07 | Group code and leader parameters are fixed in caller | Repository supports all DB-approved parameters |
| P2-08 | HTTP mode currently defaults to mock | Build/environment mode is explicit; production/integration defaults to HTTP |
| P2-09 | Request/route aliases are ambiguous | Canonical OpenAPI route map and URL-resolution tests |

---

# 12. Implementation phases and acceptance gates

The phases are data/API work packages. No screen redesign is required to complete them.

## Phase 0 — Freeze baseline and inventory

**Goal:** create the authoritative current-state register.

Tasks:
1. Freeze `main` HEAD `65ed6d34f8c7a365a63dd616973bffeb61d165b0` as the planning baseline.
2. Confirm no later commit has replaced the SQL or BFF contract before implementation starts.
3. Verify the actual database artifact and resolve v0.5.2/v0.6.0 documentation mismatch.
4. Generate the live OpenAPI schema from Django.
5. Extract every route: method, path, permission, request serializer, response serializer, service method.
6. Extract every mobile endpoint method and link it to DTO, mapper, repository contract, HTTP/mock implementation and tests.
7. Build the capability evidence ledger.

**Gate:** capability inventory and discrepancy register are reviewed; no SQL changes; no UI changes.

## Phase 1 — Stabilize backend contract and route ownership

**Goal:** every existing BFF capability has one unambiguous route and stable contract.

Tasks:
- Standardize mobile base path to `/api/v1/`.
- Use explicit coordinator namespace for coordinator detail/posts/applications/assignments.
- Use explicit check-in namespace for QR/onboarding/attendance/geo.
- Keep documented root lifecycle routes where that is the only registered contract; add route-resolution tests.
- Generate OpenAPI and compare with checked-in schema.
- Verify all request serializers are allow-listed and response serializers match the actual service result.
- Add missing invite and coordinator-history routes where required.
- Decide whether a coordinator feedback-specific route is a real product capability and specify its exact privacy-safe payload.
- Ensure decision/assignment endpoints return either a complete resource or a deliberately minimal mutation result.

**Gate:** every in-scope route resolves to the intended view/method; OpenAPI and serializer contract tests pass.

## Phase 2 — Complete BFF capability gaps

**Goal:** make the complete database-supported role capability set reachable through BFF.

Recommended order:
1. Invite volunteer.
2. Coordinator handover history.
3. Coordinator feedback contract, if approved by the declared business rules.
4. Complete T2 coordinator application/roster serializer.
5. Stabilize assignment decision/manual assignment result schemas.
6. Ensure all existing capacity, geo-review, UUID lookup, availability-check and verification-upload routes have documented OpenAPI schemas.
7. Add error/status contract tests.

**Gate:** all DB-supported volunteer/coordinator operations in Sections 5 and 6 have a BFF route or a documented exclusion.

## Phase 3 — Complete mobile endpoint clients and DTOs

**Goal:** no BFF operation is unreachable from the mobile data layer.

Tasks:
- Add all missing endpoint methods.
- Add multipart upload support for verification image.
- Add availability check, UUID lookup, coordinator notes update.
- Add post create/update/close.
- Add post capacity, geo attempt review, history, invite and feedback endpoints.
- Add pagination request/response handling.
- Correct every request/response DTO to match serializer/OpenAPI output.
- Add exact mutation-result DTOs.

**Gate:** one typed method and DTO contract test per mobile-required BFF route.

## Phase 4 — Complete domain models and mappers

**Goal:** the app-facing model is truthful and independent from the wire format.

Tasks:
- Remove phone-as-email mapping.
- Add distinct identifiers.
- Correct application, assignment, attendance, QR and feedback models.
- Align enums to raw SQL/BFF values.
- Remove fabricated defaults from event/application/assignment/T2/attendance mappings.
- Model donation master/sub-flags together.
- Separate authored feedback from feedback received.
- Keep attendance status separate from geo confirmation.
- Keep T2/T3/T4 properties separated by permitted use.

**Gate:** mapper unit tests cover every response field, null case, enum value and invalid/unknown value.

## Phase 5 — Complete repository contracts and HTTP/mock parity

**Goal:** every capability is available through role-level contracts.

Tasks:
- Add missing methods to ProfileRepository, EventRepository and CoordinatorRepository.
- Make core capabilities required rather than optional where all adapters must support them.
- Add CheckInRepository and FeedbackRepository if this reduces contract coupling.
- Implement each method in both HTTP and mock repositories.
- Ensure methods return stable operation result types.
- Ensure write results contain the updated domain object or explicitly trigger a refetch.
- Add pagination and cache invalidation.
- Remove screen-level direct API client usage.

**Gate:** repository contract tests pass for both HTTP and mock adapters.

## Phase 6 — Feature use cases and view-model data contracts

**Goal:** complete capability data is ready for any UI consumer.

Tasks:
- Implement profile/availability/event/application/assignment/check-in/feedback use cases.
- Implement coordinator event/post/application/assignment/handover/attendance/QR/feedback use cases.
- Compose dashboard data without inventing unsupported metrics.
- Add loading/empty/error/pending mutation states to view models.
- Keep all endpoint calls below repository/use-case boundary.

**Gate:** each capability is callable from a view model without knowing its URL, raw DTO or HTTP transport.

## Phase 7 — PostgreSQL-backed end-to-end verification

Minimum volunteer scenarios:

1. OTP request, provider success/failure and accurate delivery result.
2. OTP verification, token restoration, logout and invalid-token handling.
3. Profile read/update with every allow-listed field.
4. Donation master/sub-flag transitions.
5. Charity interests get/replace.
6. Weekly availability read/replace.
7. Date exception upsert/delete.
8. Event/window availability and schedule conflict.
9. Verification image multipart upload and status recomputation.
10. Coordinator application submit/read/update.
11. UUID lookup with T1/T2 permission checks.
12. Public event list filters and multiple pages.
13. Event detail/posts/capacity.
14. Application submit, QR walk-in, own list and withdrawal.
15. Assignment list, confirm and cancel.
16. Onboarding read/acknowledgment with version change.
17. QR preview, check-in redemption, walk-in redemption, expiry/revocation/limit.
18. Geo check-in for acceptable, inaccurate, stale, mocked and outside-geofence fixes.
19. Checkout and sanitized attendance history.
20. Volunteer feedback directions, authored list and received summary.

Minimum coordinator scenarios:

1. Coordinator application/status.
2. Managed event list and event summary.
3. Create draft event.
4. Create/update/close post.
5. Capacity view.
6. Event update.
7. Publish failure with zero posts; publish success with open post.
8. Activate/complete/cancel and cascades.
9. Handover, owner monitor restriction, retake and history.
10. Application list with complete allowed T2 fields.
11. Accept/reject/waitlist with response/list synchronization.
12. Invite volunteer.
13. Auto-assignment.
14. Manual assignment with post/group/leader inputs and correct assignment/application IDs.
15. Assignment/unassigned/capacity reads.
16. UUID lookup T1/T2 masking.
17. Attendance board and manual check-in.
18. QR create/revoke, raw-token one-time response.
19. Geo attempts review, confirm and reject.
20. Coordinator feedback operations if retained in scope.

**Gate:** automated tests prove full PostgreSQL → service → BFF → DTO → mapper → repository behavior for every implemented capability.

## Phase 8 — Device/network/session verification

Tasks:
- Configure HTTP mode for integration/production builds.
- Configure template/mock mode only as an explicit demo/test choice.
- No silent mode fallback.
- Secure token persistence on Android/iOS.
- Device-specific API base URL.
- Runtime GPS permission and location provider.
- Multipart upload on actual device.
- Redacted error diagnostics.
- Emulator and physical-device smoke test.

**Gate:** authenticated HTTP session survives cold start securely; device workflows send actual data and receive authoritative server results.

## Phase 9 — Capability freeze and UI defragmentation

Only after Phases 0–8 pass:

- Freeze API, DTO, domain model, repository and view-model contracts.
- Publish the complete capability evidence ledger.
- Mark each capability `runtime_verified`, `deferred`, or `excluded`.
- Then defragment/rebuild screens against those stable contracts.
- UI must not add new business rules or bypass repository interfaces.

---

# 13. Capability evidence ledger

Use one row per capability ID. This ledger is the proof that the system is complete.

| Field | Example |
|---|---|
| Capability ID | `C-08` |
| Role | Coordinator |
| Capability name | Create event post |
| DB authority | `event_posts`, post trigger, capacity view |
| Service | `event_post_service.create_event_post()` |
| BFF route | `POST /api/v1/coordinator/events/{id}/posts/` |
| Permission | Authenticated event manager with write authority |
| Request serializer | `EventPostCreateSerializer` |
| Response serializer | Current minimal `{id,status}` or approved complete post DTO |
| OpenAPI operation | Generated operation ID |
| Mobile endpoint | `coordinatorApi.createEventPost()` |
| Request DTO | `EventPostCreateRequestDto` |
| Response DTO | `EventPostMutationResultDto` or full post DTO |
| Mapper | `mapEventPost()` |
| Domain model | `CoordinatorEventPost` |
| Repository contract | `CoordinatorRepository.createEventPost()` |
| HTTP implementation | `HttpCoordinatorRepository.createEventPost()` |
| Mock implementation | `MockCoordinatorRepository.createEventPost()` |
| View model/use case | `createEventPost` use case |
| Tests | Serializer, route, mapper, repository, PostgreSQL integration |
| Status | Missing / In progress / Source complete / Runtime verified |
| Evidence | Test file and current run/result |

## 13.1 Completion state definitions

- **Database-supported:** SQL object/rule exists.
- **Service-supported:** Django service calls the database operation correctly.
- **BFF-exposed:** registered URL/view/method/serializer exists.
- **Mobile-transported:** endpoint client and DTO exist.
- **Mobile-domain-complete:** mapper/domain model are correct.
- **Repository-complete:** HTTP and mock adapters implement the operation through the contract.
- **View-model-ready:** data and mutation state can be consumed without direct HTTP knowledge.
- **Runtime-verified:** PostgreSQL-backed integration test or device execution proves the operation.
- **Capability-complete:** all preceding states are true.

Do not label a capability “connected and operational” based only on source-file presence.

---

# 14. Explicitly deferred or excluded features

These do not block the core volunteer/coordinator database capability parity target unless a separate product decision promotes them:

- UI redesign, navigation overhaul, component replacement, and screen layout.
- Admin Portal features and admin-only mobile console.
- Admin coordinator approval, verification review, moderation and audit management.
- Payroll, payments, wages, reimbursements or verified-hours calculations.
- Social/friend/chat/messaging features not present in the current database contract.
- Proximity event search: coordinates and a distance helper exist, but the current public query service has no spatial filter contract.
- Offline map tile rendering and map interaction UI. Map proxy/catalog endpoints exist, but the mobile map UI is separate work.
- New database columns or schema redesign.
- Any new business workflow not supported by the current SQL/business-rule baseline.

For geo check-in, native location acquisition is **not** deferred: the server workflow cannot be meaningfully used from mobile with hardcoded coordinates. The actual map UI may be deferred, but the device location provider and permission path are part of data capability parity.

---

# 15. Definition of Done

The capability-parity milestone is complete only when:

1. The checked-in SQL baseline/version discrepancy is resolved and recorded.
2. Every volunteer capability in Section 5 is classified and traced.
3. Every coordinator capability in Section 6 is classified and traced.
4. Every included capability has a complete database → service → BFF → OpenAPI → DTO → mapper → domain model → repository → view-model path.
5. No required BFF view class is left without a URL route.
6. No BFF route required by a role is missing a mobile endpoint client.
7. No endpoint is usable only through a concrete HTTP repository but absent from the repository interface.
8. Mock/template and HTTP implementations satisfy the same repository contracts.
9. No mapper fabricates identity, T2 capability, event, assignment, attendance or feedback facts.
10. Database enums/identifiers/nullability are mapped correctly.
11. All privacy and event-manager/owner-as-monitor permissions have tests.
12. Event post create/update/close and capacity are complete before the event declaration workflow is considered complete.
13. Invite, history, geo-review and feedback decisions are resolved as included, excluded or explicitly deferred.
14. OTP delivery status is truthful, with a real provider for production.
15. Tokens persist using secure platform storage.
16. Geo check-in uses real device location data, never hardcoded coordinates in HTTP mode.
17. Pagination and mutation cache invalidation are implemented.
18. PostgreSQL-backed capability tests pass.
19. OpenAPI and mobile DTO schemas are synchronized.
20. The evidence ledger records runtime proof for every completed capability.

Only after this definition of done should UI defragmentation and reconstruction begin.

---

# 16. Recommended first implementation batch

Do not begin with screens. Start with the capabilities that unblock other capabilities and stabilize contracts.

1. **Freeze/verify source baseline and SQL version.**
2. **Generate OpenAPI and route-resolution tests.**
3. **Add event post create/update/close to mobile DTOs, endpoints and repository contracts.**
4. **Fix application decision result synchronization.**
5. **Fix manual assignment response DTO and ID mapping.**
6. **Correct profile phone/email and donation preference mapping.**
7. **Correct coordinator T2 DTO/mapper so no fields are fabricated.**
8. **Correct attendance method/status and feedback summary mappings.**
9. **Add verification upload, availability check, coordinator notes update, UUID lookup and post-capacity/geo-review clients.**
10. **Add invite and event coordinator history BFF routes.**
11. **Add missing feedback read/submit contract where required.**
12. **Complete both HTTP and mock repository implementations.**
13. **Run end-to-end database-backed tests.**
14. **Freeze capability contracts.**
15. **Begin UI defragmentation only after the capability ledger is complete.**

---

# 17. Repository source references

The following `main` files were used as the source baseline. Links point to the audited branch and may evolve with later commits.

## Git baseline
- [Current main HEAD — merge mobile](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/commit/65ed6d34f8c7a365a63dd616973bffeb61d165b0)
- [Compare against prior audit baseline](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/compare/7ef92853ea3fc8725a6c40d611ecf62b70e9e690...65ed6d34f8c7a365a63dd616973bffeb61d165b0)

## Database
- [Unified PostgreSQL schema](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/postgres_sql/updated_volunteer_coordination_system_Database.sql)
- [Database deep dive](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/docs/database_deep_dive.md)

## Backend/BFF
- [Root URL config](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/config/urls.py)
- [BFF root URL config](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/urls.py)
- [Volunteer routes](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/volunteer/urls.py)
- [Coordinator routes](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/coordinator/urls.py)
- [Check-in routes](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/checkin/urls.py)
- [Volunteer views](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/volunteer/views.py)
- [Coordinator views](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/coordinator/views.py)
- [Check-in views](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/checkin/views.py)
- [Volunteer serializers](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/volunteer/serializers.py)
- [Coordinator serializers](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/coordinator/serializers.py)
- [Check-in serializers](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/checkin/serializers.py)
- [Application service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/application_service.py)
- [Event post service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/event_post_service.py)
- [Assignment service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/assignment_service.py)
- [Query service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/query_service.py)
- [Authentication service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/auth_service.py)

## Mobile data layer
- [Data mode](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/app/configuration/dataMode.ts)
- [API client](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/core/api/apiClient.ts)
- [Token store](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/core/auth/tokenStore.ts)
- [Coordinator repository contract](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/contracts/coordinatorRepository.ts)
- [Event repository contract](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/contracts/eventRepository.ts)
- [Profile repository contract](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/contracts/profileRepository.ts)
- [Coordinator API endpoints](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/coordinatorApi.ts)
- [Event API endpoints](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/eventApi.ts)
- [Profile API endpoints](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/profileApi.ts)
- [Check-in API endpoints](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/checkinApi.ts)
- [HTTP coordinator repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/http/HttpCoordinatorRepository.ts)
- [HTTP event repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/http/HttpEventRepository.ts)
- [HTTP profile repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/http/HttpProfileRepository.ts)
- [Coordinator DTOs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/dto/coordinatorDto.ts)
- [Event DTOs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/dto/eventDto.ts)
- [Profile DTOs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/dto/profileDto.ts)
- [Check-in DTOs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/dto/checkinDto.ts)
- [Coordinator mapper](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/mappers/coordinatorMapper.ts)
- [Event mapper](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/mappers/eventMapper.ts)
- [Profile mapper](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/mappers/profileMapper.ts)

## Existing analysis documents
- [Mobile analysis](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/docs/mobile_analysis.md)
- [Backend analysis](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/docs/backend_analysis.md)
- [Connectivity audit](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/docs/mobile_bff_database_connectivity_audit.md)

---

## Final architectural rule

**The database defines the capabilities. The backend exposes and protects them. The mobile data layer makes every capability consumable. The UI is rebuilt only after those contracts are complete.**

The system is not capability-complete just because the current screens work in template mode or a handful of HTTP requests succeed. Capability parity means every volunteer and coordinator operation that is supported by the checked-in database has a verified, privacy-safe, typed and testable path through the BFF and the mobile data layer.
