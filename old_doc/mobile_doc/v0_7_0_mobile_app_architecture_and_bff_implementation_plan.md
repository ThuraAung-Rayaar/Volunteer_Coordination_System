# Volunteer Coordination System v0.7.0
# Android-First Mobile UI, Frontend Architecture & BFF Integration Plan

**Status:** Proposed implementation blueprint  
**Planning basis:** `updated_volunteer_coordination_system_Database.sql` (database-first source of truth), `BUSINESS_RULES_AND_PERMISSIONS.md` (current permission and application behavior reference), and the v0.6.0 Mobile BFF Integration Guide.  
**Client assumption:** React Native, Android-first. Keep the architecture portable to iOS; do not make iOS-specific design decisions part of the domain layer.  
**Scope:** Volunteer experience as the primary account experience; approved Coordinator capability as an add-on; mobile UI first, BFF integration afterwards.  
**SQL policy:** This plan does not authorize changing the current SQL prototype. Any proposed new data model is recorded as a future gap requiring explicit approval.

---

## 1. Executive Direction

Build one mobile application around one primary identity: **Volunteer**. A user remains a volunteer by default. A user who has a `coordinator_profiles` record with `status = 'approved'` gains access to Coordinator tools. Coordinator must not be implemented as a separate account type or a role switch that removes the volunteer experience.

The mobile application should be organized into three main volunteer destinations accessed through a **side drawer**:

1. **Dashboard** — volunteer activity, finished assignments/events, rating summary, next shift, and an approved-coordinator dashboard card when applicable.
2. **Events** — discover published/live events, search and filter, inspect event posts and capacity, apply, and follow application/assignment status.
3. **Friends** — designed as a UI destination, but real friend relationships cannot be connected to the current SQL schema because no friendship/relationship table or friend BFF endpoints are defined. Keep it as a clearly marked UI-only placeholder until the relationship rules and storage are approved.

The Coordinator experience is an **add-on workspace**. When the account is an approved coordinator, show a Coordinator dashboard card on the volunteer Dashboard and expose a Coordinator Workspace entry. When the user is only a volunteer, hide that card and the workspace entry. A pending coordinator application can be shown in Profile, but it does not grant coordinator actions.

The UI is not the business-rule engine. The Android app presents allowed actions and state; the BFF and existing service/SQL layers remain authoritative for permissions, state transitions, capacity, schedule conflicts, geofencing, attendance, and feedback.

### 1.1 Non-negotiable implementation principles

- PostgreSQL constraints, triggers, functions, and views remain authoritative for persisted business state.
- The BFF is the only network boundary used by the mobile app. The app must never connect directly to PostgreSQL or duplicate database logic.
- Frontend permissions are for hiding/disabling UI affordances only. Every BFF mutation must still enforce the backend permission and event scope.
- Do not send or display fields outside the applicable privacy tier (T0–T4).
- Do not infer a user's Coordinator access from a locally stored flag. Resolve it from the authenticated user's coordinator profile/status.
- Do not invent event tags, friendship data, ratings, notifications, or dashboard metrics that the current schema/API does not supply.
- The initial UI-only development phase must use mock repositories that match the intended BFF DTO contracts. Do not hard-code fake business behavior in screens.

---

## 2. Source-of-Truth and Evidence Boundaries

### 2.1 Authority order

| Priority | Source | What it controls |
|---|---|---|
| 1 | `updated_volunteer_coordination_system_Database.sql` | Persisted entities, foreign keys, checks, state guards, uniqueness, capacity, assignment rules, attendance, feedback constraints, database views and SQL functions. |
| 2 | `BUSINESS_RULES_AND_PERMISSIONS.md` | Current Django service/API permission behavior, privacy tiers, role derivation, field allow-lists, route groups and documented client-facing rules. |
| 3 | v0.6.0 Mobile BFF Integration Guide | Existing mobile-oriented request/response examples and integration guidance. Treat examples as a contract draft, not as a replacement for the SQL or current OpenAPI schema. |
| 4 | This plan | UI structure, component boundaries, proposed BFF aggregation and delivery order. Proposed additions are explicitly marked. |

### 2.2 Important route-document mismatch to resolve before live integration

The Business Rules document describes BFF groups under `/api/v1/volunteer/`, `/api/v1/coordinator/`, and `/api/v1/checkin/`. The Mobile BFF Integration Guide also documents flatter aliases such as `/api/v1/events/`, `/api/v1/me/`, and `/api/v1/attendance/`. The project also mounts the same BFF router under `/api/v1/`, `/api/bff/mobile/`, and `/api/`.

**Decision:** Build the app against a single route manifest generated/verified from the current backend `bff/urls.py` and OpenAPI schema. Select one configured mobile base path (prefer the explicit `/api/bff/mobile/` mount if it is confirmed in the current deployment), and keep endpoint paths in one API module. Do not scatter path strings throughout screens. The route mismatch must be closed before switching from mock to live repositories.

### 2.3 What is supported by current sources

- Volunteer profile, coordinator application/status, availability, charity interests, verification status, public event discovery, event applications, assignments, attendance, onboarding acknowledgments, QR/geo/manual check-in, feedback and Coordinator event management are represented in the current model/rules/API reference.
- There is a coordinator profile status model: `pending`, `approved`, `suspended`, `revoked`.
- Event and application state changes are guarded by both the application/service layer and SQL triggers in the documented flows.
- Current privacy model is T0–T4. In particular, T2 volunteer capability data is event-scoped and not a general people-search permission.

### 2.4 Missing or not yet supported

| Desired product capability | Current source support | Plan |
|---|---|---|
| Friend requests / accepted friends / unfriend | No friendship table in SQL and no friend endpoints listed | UI skeleton only in UI-first phase. Do not show fabricated friends or infer friendship from a shared event. Requires approved relationship rules, schema and BFF work. |
| General event tags | `events` has charity-field relationships; `event_posts` has `required_skills`; there is no general event `tags` field | Use charity-field chips as event categories and required-skill chips within posts. A global free-form event tag filter requires a schema/API decision. |
| Volunteer dashboard aggregate endpoint | Assignments, feedback summary, attendance and coordinator event summary are present, but the documented endpoint list does not define one unified volunteer dashboard response | Propose a BFF aggregation endpoint. Do not add a new SQL table for dashboard totals. |
| Push notifications/inbox | No notification entity or mobile notification endpoint appears in the supplied SQL/business rules | Exclude from MVP. Add only after notification rules, delivery provider, persistence and endpoint contracts are approved. |
| Current/past people list | Assignment and coordinator-history data exist, but no friend relationship or general past-colleague visibility rule is defined | Do not expose an unrestricted collaborator directory. Any “worked with” feature needs a separate privacy decision and scoped BFF endpoint. |

---

## 3. Identity, Capability and Navigation Model

### 3.1 Role derivation

There is no `role` field on `users`. For the mobile app, derive capabilities from the authenticated profile and coordinator profile:

| Account state | Volunteer experience | Coordinator experience |
|---|---|---|
| Active ordinary user; no coordinator profile | Available | Hidden; may apply for Coordinator after verification prerequisite is met. |
| Coordinator application `pending` | Available | No management access. Show application status in Profile. |
| Coordinator `approved` | Available | Enabled. Show Coordinator dashboard card and Coordinator Workspace. |
| Coordinator `suspended` | Available only to the extent permitted by active account state and endpoints | Management actions unavailable. Show status in Profile; do not treat as approved. |
| Coordinator `revoked` | Available only to the extent permitted by active account state and endpoints | Management actions unavailable. Show status in Profile; do not treat as approved. |
| User account `blocked` or `closed` | Lock authenticated functions according to backend response | Lock Coordinator functions too. Show account status handling; never rely on cached role state. |

A coordinator applicant must be verified before applying for the Coordinator capability. This does **not** mean that ordinary volunteer event applications should be blocked by the mobile UI unless the actual event-application backend rule requires it; the documented application rule requires an active account, event eligibility, deadline/capacity/schedule checks, etc.

### 3.2 Drawer navigation

The side drawer is the primary destination navigation. Do not add a bottom tab bar for the three home destinations unless the product direction changes.

```text
Authenticated App
├── Side Drawer
│   ├── Dashboard
│   ├── Events
│   ├── Friends                 (UI placeholder until relationship API exists)
│   ├── Coordinator Workspace  (approved coordinator only)
│   ├── My Profile
│   ├── Availability
│   ├── Verification & Coordinator Status
│   ├── Settings
│   ├── Theme: Light / Dark
│   └── Log out
└── Nested feature stacks
    ├── Dashboard Stack
    ├── Events Stack
    ├── Friends Stack
    ├── Coordinator Stack
    └── Profile / Settings Stack
```

The first three destinations are the volunteer's main home module. Coordinator Workspace is an additional destination, not a replacement for the volunteer Dashboard or Events screen.

### 3.3 Drawer visibility rules

- Always show Dashboard, Events and Friends (Friends may display a “Coming later” state until supported).
- Show Coordinator Workspace only when `coordinator.status == approved` and the account is active.
- The Dashboard Coordinator card follows the same rule. Hide it for ordinary volunteers and pending applicants.
- For an approved coordinator who is an event owner but has handed over the event, keep the event visible in the coordinator list as read-only if the API says `is_read_only_monitor=true`. Show a read-only banner and only show “Retake coordination” when the backend confirms the caller is the owner and the retake action is allowed.
- Admin and Super Admin tools are outside this mobile scope. Do not surface admin flags or admin routes in the Volunteer/Coordinator app.

---

## 4. Screen and Module Plan

## 4.1 Dashboard — Volunteer Home

**Purpose:** Answer three questions at a glance: What am I doing next? What have I completed? How am I rated?

### Recommended layout

1. App header: drawer icon, greeting/display name, profile avatar.
2. Volunteer summary row: completed shifts/events attended count; upcoming/active assignment count; volunteer rating summary.
3. “Next shift” card: nearest active assignment with event title, post title, start/end, location and status; action opens event/shift detail.
4. “In progress” section: assignments with `assigned` or `confirmed` status and relevant upcoming/active event information.
5. “Recently completed” list: completed attendance rows joined to assignments, posts and events, grouped by event with post/task title and date. Do not treat an assignment marked completed by the event-completion trigger as proof the volunteer attended; do not infer completion merely because an event is past its scheduled end.
6. “Your feedback” card: volunteer aggregate rating and count; optionally a separate coordinator rating in Coordinator context. Show no raw feedback rows or comments from other people.
7. Coordinator dashboard card, conditionally visible only to approved Coordinators: active/upcoming managed events, pending application count, pending geo-confirmation count, and entry to Coordinator Workspace.
8. Contextual action: “Rate your experience” only when the event is completed, participation is confirmed/eligible, and a corresponding feedback row has not already been submitted.

### Dashboard metrics and their source

| UI data | Authoritative source | Implementation note |
|---|---|---|
| Completed volunteer shifts/tasks | The user's `attendance.status = completed`, joined to the corresponding assignment and event post | **Do not count `assignments.status = completed` alone.** When an event is completed, SQL moves all remaining `assigned`/`confirmed` assignments to `completed`, including volunteers whose attendance was marked `absent`. The attendance row distinguishes checked-in participation from absence. The current schema has no separate task-quality/completion approval record, so label this “Completed shifts” or “Completed attendance,” not verified task output. |
| Completed events attended | Unique events for which the user's attendance row is `completed` | Do not count every completed event in the system, or every completed assignment; count only the authenticated user's completed attendance. |
| Upcoming/active work | Own assignments with `assigned` / `confirmed` states plus event timing/status | BFF should return event/post labels and the next relevant assignment. |
| Volunteer rating | Active feedback aggregate for the user, particularly `coordinator_to_volunteer` | Return average and count only. Do not expose individual comments or rater identity. |
| Coordinator rating | Active `volunteer_to_coordinator` aggregate | Keep separate from volunteer rating. Do not blend two role scores unless a product rule explicitly defines a combined score. |
| Coordinator activity | Coordinator event summary view / coordinator event summary endpoint | Only for an approved Coordinator; scope to events the caller manages. |

### Dashboard API recommendation

**Important counting rule from the SQL triggers:** event completion changes any still-active assignment to `completed`, while attendance rows still in `expected` become `absent`; attendance rows in `checked_in` become `completed`. Therefore an assignment's `completed` state alone does not prove that the volunteer attended. The Dashboard should count completed attendance rows joined to the volunteer's assignment and event post. The database does not currently record a separate “task deliverable approved” event, so the UI should call these completed shifts/attendance rather than verified task results.

The current endpoint reference has the underlying reads, but not one documented mobile dashboard aggregator. Add a BFF aggregation endpoint (proposal):

`GET /me/dashboard/`

Proposed response (illustrative DTO, not an existing guaranteed response):

```json
{
  "volunteer": {
    "completed_shift_count": 8,
    "completed_event_count": 5,
    "upcoming_assignment_count": 2,
    "next_assignment": {
      "assignment_id": 41,
      "event_id": 17,
      "event_title": "Community Cleanup",
      "post_title": "Registration Desk",
      "status": "confirmed",
      "schedule_start": "2026-12-01T02:00:00Z",
      "schedule_end": "2026-12-01T06:00:00Z"
    },
    "rating": { "average": 4.8, "count": 6 }
  },
  "coordinator": null
}
```

When the caller is an approved coordinator, `coordinator` may include only their permitted summary (for example, managed event counts and pending application/confirmation counts). For a normal volunteer, return `coordinator: null` and hide the Coordinator card. Do not return T2/T3 profile detail in this dashboard aggregation.

The aggregator can compose existing service/query/view results. It must not create a second source of truth or calculate business transitions in Python/mobile. The exact definition of `completed_event_count` and which date/time zone is used must be agreed and tested before implementation.

## 4.2 Events — Discovery, Live Events and My Activity

**Purpose:** Find published opportunities, inspect event details, apply, and follow the application/assignment journey.

### Recommended screen structure

- Search input at the top.
- Filter button opens a bottom sheet / modal.
- Quick category chips under the search field.
- Internal segments: `Discover`, `My Applications`, `My Shifts`.
- `Discover` shows published and active events. Active events are visually identified as live/current.
- `My Applications` shows `pending`, `accepted`, `waitlisted`, `rejected`, `withdrawn`, and `expired` states as returned by the backend.
- `My Shifts` shows `assigned`, `confirmed`, `completed`, and `cancelled` assignments, with active/upcoming items prioritized.

### Search and filter design

| UI filter | Current data support | Filter behavior |
|---|---|---|
| Text search | BFF guide documents `search` | Search event title/description/location fields supported by the backend. |
| Charity category | `event_charity_fields` + `charity_fields` | Use active charity-field codes as category chips. |
| Purpose | `purpose_type` (`charity_event`, `help_wanted_event`) | Dropdown/chips. |
| Event status | Public view exposes `published` and `active` | Use `All`, `Live`, `Upcoming`; do not expose draft/cancelled events in public discovery unless the user is an authorized participant/manager. |
| Date range | `start_at`, `end_at`, `application_deadline` | Upcoming/date filters. |
| Availability/capacity | `spots_remaining`, post capacity | Show remaining places from server values. Do not calculate authoritative remaining capacity in the UI. |
| Benefits | meals, lodging, travel support, compensation fields | Boolean/category filters where exposed by the BFF. |
| Geo-check-in | `geo_checkin_enabled` | Optional filter. |
| Post required skills | `event_posts.required_skills` | Show/filter within the event's posts, not as a global event tag unless BFF explicitly implements a join/filter. |
| General tags | No event-level `tags` column | Do not render a free-form tag filter in the integrated product without a schema/API change. |

### Event card

Show title, event status (`Published` / `Live`), date/time, location name, charity categories, coordinator display name, event support information and server-supplied `spots_remaining`. Avoid personal data beyond T0.

### Event detail

- Event overview, purpose, date/time, location and map preview.
- Charity categories and support/compensation information.
- List of event posts with required skills, physical level, leader requirement, new-volunteer eligibility, total headcount and remaining capacity.
- Apply action at event or post level according to the BFF contract.
- Application status and assignment status for the current user.
- Onboarding text/version only after T2 eligibility, and acknowledgment screen when required.
- QR join/walk-in flow only when enabled and supported by the event/token purpose.
- For accepted applicants/assigned volunteers, show only event-scoped T2 fields that the backend returns.

### Apply UX

- Before submit, show post choice, optional note, schedule/availability warning if the backend check is available, and a clear confirmation.
- The backend remains responsible for event state, deadline, account state, open post, duplicate application, schedule conflicts, QR token consumption and capacity.
- On a `409` conflict, preserve the user's draft and explain the returned machine-readable reason. Refresh event/post capacity before offering another attempt.
- Do not promise application acceptance. A submission may become `pending`, `accepted` or `waitlisted` depending on event settings and the backend.

## 4.3 Friends — UI Destination with an Explicit Backend Blocker

The requested Friends screen can be designed in the UI-first phase, but cannot be genuinely populated using the current SQL rules.

The SQL includes `assignments`, `event_coordinator_history` and `feedback`, but **does not include a friendship/connection relation**. The current privacy rules also do not establish that every volunteer may browse a list of everyone who participated in a past event. T1 permits a minimal `{uuid, display_name}` card when a specific UUID is known; T2 capability data is event-scoped and requires the manager/accepted-participant conditions. It is not a general directory permission.

### UI-first design proposal

- Screen title: `Friends`.
- Sections: `My Friends`, `Requests`, `People I've Worked With` (the last two can be design placeholders).
- Friend card visual: avatar/initials, display name, relationship status and action menu.
- Empty state explaining that connections will become available when the relationship feature is enabled.
- Use mock-only fixture data during UI design and visibly isolate it from live repositories. Never mix mock names into live data.

### Required future backend decision

Before enabling the screen, define:

- Whether friendships are one-way follows or two-way accepted connections.
- Who may send/receive requests and whether requests can be declined, cancelled, blocked or removed.
- Whether a shared event creates a suggestion only (not a friendship).
- Who can discover a user and what identity fields are visible.
- Whether a user can hide their profile from suggestions.
- Retention, moderation and account-close behavior.

Then add the approved relationship model (for example, a user-to-user relationship table with a normalized pair, state, requester, timestamps and uniqueness rules) plus scoped BFF endpoints. **Do not add that table or assume its semantics as part of this plan.**

## 4.4 Coordinator Workspace — Add-On Module

**Access:** approved Coordinator only. The owner-as-monitor case is a special read-only mode, not a separate role.

### Coordinator overview

- Managed events list grouped by `Draft`, `Published`, `Active`, `Completed`, `Cancelled`.
- Event summary cards: pending applications, accepted, waitlisted, assignments, checked-in and pending geo confirmations.
- “Create Event” primary action.
- Read-only monitor banner where applicable.

### Event creation wizard

Use a multi-step form. Create a draft first; do not pretend the event is published when the first save succeeds.

| Step | UI fields | Backend/database rule |
|---|---|---|
| 1. Basic information | Title, description, purpose type, charity categories | Title and purpose constraints; 1–3 active charity fields are required by current business rules. |
| 2. Date and place | Start/end, application deadline, location name, landmark, map point | End must be after start; deadline must not exceed start; latitude/longitude must be a pair. |
| 3. Volunteer requirements | Max participants, acceptance mode, auto-assign, group size/leader strategy | These are event configuration fields. Capacity and assignment are server-controlled. |
| 4. Support | Meals, lodging, travel support, compensation type/note | Compensation is informational; the database does not implement payroll. |
| 5. Check-in | Geo check-in enable, radius, open-before minutes, confirmation requirement, QR registration | Geo requires a valid map point; radius 20–5000m; geo window 0–240 minutes. |
| 6. Onboarding | Briefing text, acknowledgment required | Editing onboarding text bumps the version. Existing acknowledgments remain append-only for each version. |
| 7. Review | Summary and `Save Draft` | Initial status is forced to `draft` by the database. |
| 8. Posts | Create one or more volunteer posts | Event publishing requires at least one open post; publish also checks the future start time in the documented BFF guide. Posts have their own headcount, physical level, skill tags and leader settings. |

Keep event fields and event post fields as separate frontend form models. The `events` table does not contain post-specific requirements.

### Event management detail

Use a nested event workspace with these sections:

- Overview / summary.
- Event details (editable only where allowed).
- Posts and capacity.
- Applications.
- Assignments / unassigned queue.
- Attendance / check-in.
- QR tokens.
- Feedback summary (when the event is completed and the endpoint permits it).
- Coordinator handover history (read-only where exposed).

### Event lifecycle actions

Present only actions available for the current state and permission:

```text
draft -> publish -> published -> activate -> active -> complete -> completed
  \---------------- cancel -------------------------------> cancelled
```

The UI should ask for confirmation before publish, activate, complete, cancel, handover or retake. The backend/SQL state machine decides whether the transition succeeds. Completed and cancelled are terminal in the documented event lifecycle.

### Applications and privacy

- Pending/waitlisted/rejected applicant rows are T1 minimal identity only.
- T2 capabilities (skills, physical capability hints, support needs, verification status) are available only under the documented accepted-applicant + event-manager conditions.
- Do not display emergency contact details, blood type, phone or private health/safety attributes in general applicant lists.
- Accept/reject/waitlist actions are event-manager writes. Accepting may create an assignment automatically when `auto_assign_enabled` is true.
- Capacity and schedule overlap remain server-side checks.

### Assignment management

- Show accepted-but-unassigned applications and current assignments.
- Support auto-assignment and manual assignment where BFF exposes them.
- Manual assignment must choose a compatible post and may set group code / group leader.
- Show server-provided capacity; never optimistically overbook.
- Confirm that assignment confirmation is performed by the assigned volunteer, not by the Coordinator.
- Cancellation rules differ by caller: volunteer cancels own assignment; manager may cancel an assignment on a managed event; completed assignments cannot be cancelled.

### Attendance and check-in

- Roster states: expected, checked in, completed, absent/cancelled where returned.
- Coordinator manual check-in for an already assigned volunteer.
- QR token generation for the appropriate purpose; display the raw token only at creation because it is returned once. Do not log it or persist it in analytics.
- Geo check-in uses the volunteer device's current fix, captured timestamp, accuracy and mocked-location indicator. The SQL function is authoritative for distance/geofence validation. Never compute or trust distance on the client.
- A pending geo confirmation queue may be confirmed/rejected by an authorized event manager.
- Do not display raw GPS evidence to volunteers in self-history; coordinator/admin scope is separately guarded.
- Onboarding acknowledgment must be completed when required before the relevant attendance flow is accepted.

### Handover and owner-as-monitor

When an event owner hands coordination to another approved coordinator, the owner becomes read-only for that event. The frontend must not leave edit/transition/assignment controls active and rely on a failed request. It should display a banner and expose the owner-only retake action only when the BFF reports it is allowed.

## 4.5 Other Essential Modules

### My Profile

- Display name, preferred language, home area, skills, capability declarations, volunteer support preferences and charity interests.
- Emergency contact name and phone must be edited as a pair; clearing one must clear the other.
- Do not expose privileged fields as editable controls (`is_admin`, `is_staff`, `is_superuser`, `is_active`, account status, verification status, UUID, etc.).
- Profile form fields must follow the existing backend allow-list. Unknown/privileged field submissions are rejected.

### Verification & Coordinator application

- Show verification status (`none`, `pending`, `verified`, `rejected`) and current image metadata.
- Upload only supported verification image types through authenticated multipart upload. The actual image bytes are sent to the server; do not expose storage paths.
- Show the Coordinator application status separately. Applying requires verified status. Pending applicants may edit notes only while pending; only admins approve/suspend/revoke.
- The encrypted image storage implementation is outside this planning scope as requested; mobile should only use the approved private upload/status endpoints and never try to read a file path.

### Availability

- Weekly rules and date exceptions editor.
- User can manage only their own availability.
- The server/SQL evaluates availability and schedule conflict. The app may show the returned result but must not duplicate the evaluation algorithm.

### Attendance history

- Show own attendance status, method, check-in/check-out timestamps, confirmation status and walk-in flag.
- Do not show raw coordinates, GPS accuracy or device telemetry in volunteer history.

### Settings and theme

- Light / Dark / System (recommended third option) theme selector; user explicitly requested Light/Dark, so both must be supported even if System is also offered.
- Theme is a local presentation preference. It does not require a database/API field.
- Persist theme locally on the device; apply it globally through a Theme Provider/design tokens.
- Include language, privacy/help links if provided, logout and account status handling.

### Maps

- Event detail and check-in can use the documented map endpoints.
- Keep map rendering behind a `MapRepository`/`MapService` abstraction so the tile source can change without changing event screens.
- Offline regional download should be scheduled after map pack behavior is validated. The existing security/gap review already identified map-region packaging and initialization concerns; do not make offline maps a release blocker for the first volunteer MVP.

---

## 5. Frontend Architecture — Build UI First, Integrate Through Repositories

### 5.1 Component connection model

```text
React Native Screen
       |
       v
Feature Hook / ViewModel
       |
       v
Feature Repository Interface
       |                         \
       | UI-first                 \ after integration
       v                           v
Mock Repository                BFF Repository
       |                           |
       |                           v
       |                       Mobile API Client
       |                           |
       |                           v
       |                   Django REST BFF endpoints
       |                           |
       |                           v
       |                    Domain service layer
       |                           |
       |                           v
       |              ORM / SQL functions / SQL views
       |                           |
       +---------------------------+
                                   v
                              PostgreSQL
```

The Screen renders data and sends user intent. Feature hooks own loading/error/mutation states. A repository translates app operations to the BFF contract. The mock and live repositories implement the same interfaces. Switching to the API must not require rewriting screen components.

### 5.2 Suggested source tree

```text
src/
├── app/
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── AuthStack.tsx
│   │   ├── MainDrawer.tsx
│   │   ├── VolunteerStacks.tsx
│   │   └── CoordinatorStack.tsx
│   ├── providers/
│   │   ├── ThemeProvider.tsx
│   │   ├── QueryProvider.tsx
│   │   └── SessionProvider.tsx
│   └── config/
│       ├── environment.ts
│       └── featureFlags.ts
├── shared/
│   ├── api/                 # ApiClient, error parser, route manifest
│   ├── components/          # buttons, cards, form fields, banners, states
│   ├── design/              # colors, spacing, typography, radius, elevation
│   ├── hooks/
│   ├── storage/              # secure token store, theme preference store
│   ├── types/
│   └── utils/                # date/time, formatting; no domain-rule engine
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── events/
│   ├── applications/
│   ├── assignments/
│   ├── friends/              # mock-only until backend support exists
│   ├── coordinator/
│   │   ├── dashboard/
│   │   ├── events/
│   │   ├── posts/
│   │   ├── applications/
│   │   ├── assignments/
│   │   ├── attendance/
│   │   └── qr/
│   ├── profile/
│   ├── verification/
│   ├── availability/
│   ├── feedback/
│   ├── maps/
│   └── settings/
└── data/
    ├── repositories/         # interfaces + mock implementations + BFF implementations
    ├── dto/                  # network DTOs
    └── mappers/              # DTO -> app view model mapping
```

This is a proposed organization; preserve the existing repository conventions if the current mobile project already has a stable structure. Do not create a second API client or separate auth/session implementation per feature.

### 5.3 Component inventory and responsibility

| Component | Responsibility | Data source |
|---|---|---|
| `AppDrawer` | Primary destinations and capability-aware Coordinator entry | Session capability context |
| `VolunteerDashboardScreen` | Compose summary widgets | `useVolunteerDashboard()` |
| `VolunteerStatsCard` | Counts only | Dashboard DTO |
| `NextShiftCard` | Next assignment and event link | Dashboard DTO / assignments repository |
| `CompletedWorkList` | Finished assignment/event history | Own assignments/history query |
| `RatingSummaryCard` | Aggregate average/count only | Feedback summary DTO |
| `CoordinatorDashboardCard` | Approved coordinator summary and entry point | `coordinator.status` + coordinator summary |
| `EventSearchBar` | Search text and submit/debounce | Local filter state |
| `EventFilterSheet` | Category/date/benefit/purpose filters | Charity taxonomy + filter state |
| `CharityCategoryChips` | Current event categories | `charity-fields/` taxonomy |
| `EventCard` | T0 event preview | Public event feed DTO |
| `EventDetailHeader` | Event summary/status | Public event detail DTO |
| `PostCapacityCard` | Post requirements/capacity | Event posts DTO |
| `ApplyButton` | Submit application intent and display result | Application mutation |
| `ApplicationStatusChip` | State label | Application DTO |
| `CoordinatorEventCard` | Event state and summary counts | Coordinator events/summary |
| `EventFormStepper` | Draft event form UI | Local form model then create/update mutation |
| `EventPostEditor` | Create/edit/close volunteer post | Post BFF operations |
| `ApplicationQueue` | Applications grouped by state | Coordinator application list |
| `VolunteerIdentityCardT1` | UUID/name only | T1 API payload |
| `VolunteerCapabilityPanelT2` | Permitted capability fields after accepted status | T2 API payload only |
| `AssignmentRoster` | Assigned volunteers and posts | Coordinator assignment endpoint |
| `AttendanceBoard` | Check-in status and roster actions | Coordinator attendance endpoint |
| `GeoConfirmationQueue` | Confirm/reject pending geo check-ins | Pending confirmation endpoint |
| `QrTokenDisplay` | One-time raw token / QR rendering | QR creation response held in memory only |
| `OnboardingAcknowledgmentCard` | Read briefing and acknowledge version | Onboarding endpoints |
| `ProfileEditor` | Self allow-listed fields | Profile repository |
| `VerificationStatusPanel` | Status and image metadata | Verification endpoints |
| `AvailabilityEditor` | Weekly windows/date exceptions | Availability endpoints |
| `ThemeSelector` | Light/dark local preference | Local settings store |
| `FriendsScreen` | Placeholder visual structure only until API is supported | Mock repository only |
| `ReadOnlyMonitorBanner` | Explain read-only event ownership state | Event detail DTO |
| `LoadingState`, `EmptyState`, `ErrorState`, `OfflineState` | Consistent async UX | Shared UI state |

Components should not import the API client directly. Screen-level hooks call repositories; presentation components receive typed props and callbacks.

### 5.4 State ownership

| State | Owner | Persistence |
|---|---|---|
| Auth token/session | Session/auth provider | Android secure storage; never plain AsyncStorage for credentials |
| Account/coordinator capability | Session/profile query cache | Server-derived; clear on logout/account status changes |
| Event feed/detail, assignments, applications, coordinator summaries | Server query cache | Cache with freshness policy; refresh after mutations |
| Search/filter sheet values | Screen/feature state | Optional local persistence; not a business record |
| Theme | Theme provider | Local device preference |
| Event draft form before server save | Form state | Local draft only if deliberately implemented; server remains source after save |
| QR raw token | Ephemeral screen memory | Do not persist or log; server stores hash only |
| Friend mock data | Mock repository only | Never migrate mock state to live API |

### 5.5 UI-first API contract strategy

Before drawing screens, define TypeScript DTOs that reflect the current backend fields and states. Every mock response must be valid against those DTOs. Use a repository interface per feature, for example:

```ts
export interface VolunteerRepository {
  getProfile(): Promise<VolunteerProfile>;
  getDashboard(): Promise<VolunteerDashboard>;
  getEvents(filters: EventFilters, page?: number): Promise<Page<PublicEvent>>;
  getEventDetail(eventId: number): Promise<PublicEventDetail>;
  getMyApplications(): Promise<Application[]>;
  getMyAssignments(): Promise<Assignment[]>;
  applyToEvent(eventId: number, input: ApplyToEventInput): Promise<Application>;
  getFeedbackSummary(): Promise<FeedbackSummary>;
}

export interface CoordinatorRepository {
  getCoordinatorProfile(): Promise<CoordinatorProfile | null>;
  getManagedEvents(): Promise<ManagedEvent[]>;
  getEventSummary(eventId: number): Promise<CoordinatorEventSummary>;
  createEvent(input: EventCreateInput): Promise<CreatedEvent>;
  updateEvent(eventId: number, input: EventUpdateInput): Promise<UpdatedEvent>;
  getApplications(eventId: number, status?: ApplicationStatus): Promise<Application[]>;
  decideApplication(applicationId: number, decision: ApplicationDecision): Promise<Application>;
  getAssignments(eventId: number): Promise<CoordinatorAssignment[]>;
  getAttendance(eventId: number): Promise<AttendanceRow[]>;
}
```

These are proposed frontend interfaces, not existing backend code. Keep request DTOs separate from display/view models. The mapper layer handles field names and optional values. Avoid using `any` for API responses.

---

## 6. BFF Architecture and Screen-to-API Pairing

### 6.1 BFF responsibilities

The mobile BFF should:

- Authenticate the token and resolve the current user on every protected request.
- Derive volunteer/coordinator capability from server records; never trust a client-supplied role.
- Apply the existing T0–T4 privacy policy and event-scoped access checks.
- Delegate business operations to existing service functions and SQL functions/triggers.
- Return small screen-oriented DTOs (for example, event cards and dashboard aggregates) without leaking raw ORM/database rows.
- Translate domain/SQL errors into the standard `{ error: { code, message } }` envelope.
- Paginate feeds and rosters; support server-side filtering where the schema allows it.
- Keep the same business result whether the request comes from Android, future iOS, or web.

The BFF should **not**:

- Reimplement SQL capacity, assignment matching, availability, schedule conflict, event transition, geofence, QR consumption or feedback eligibility rules.
- Accept a `role`, `is_admin`, `is_superuser`, `user_id` or `actor_id` as proof of caller authority.
- Return phone hashes, OTP/code hashes, token hashes, password, storage paths, raw geo telemetry to volunteer self-history, or raw feedback comments from other users.
- Expose a generic search endpoint that bypasses T1/T2/T3/T4 scopes.

### 6.2 Screen-to-BFF mapping

The following mapping uses the logical operation names from the supplied Business Rules and Mobile BFF guides. Resolve exact path prefixes/aliases against the current `bff/urls.py` and OpenAPI schema before implementing `BffRepository`.

| Mobile screen/action | Existing documented operation | Status / notes |
|---|---|---|
| OTP request | `POST auth/otp/request/` | Exists in BFF reference. Console OTP delivery is currently development-only; real SMS is a later integration. |
| OTP verify/session | `POST auth/otp/verify/` | Returns DRF token + limited user identity. Store token securely. |
| Logout | `POST auth/logout/` | Deletes current token; clear local session/cache on success. |
| Dashboard profile identity | `GET volunteer/me/` (or documented `/me/` alias) | Existing. Use to hydrate self profile and verification status. |
| Volunteer dashboard aggregate | `GET volunteer/me/dashboard/` (proposed) | Not present in supplied endpoint tables. Add as BFF composition over existing permitted queries. |
| Own assignments | `GET volunteer/me/assignments/` | Existing; use `completed` for history and `assigned/confirmed` for upcoming work. Confirm pagination and filters in OpenAPI. |
| Own applications | `GET volunteer/me/applications/` | Existing; show current state machine. |
| Public event search/feed | `GET volunteer/events/` (Business Rules path) or documented `GET events/` alias | Existing read surface; exact canonical route mismatch must be resolved. |
| Public event detail/posts | `GET volunteer/events/{id}/`, `GET volunteer/events/{id}/posts/` | T0 fields; T2 detail only when eligible. Verify exact route alias. |
| Submit application | `POST volunteer/events/{id}/apply/` | Existing; backend validates all eligibility/capacity/schedule/duplicate constraints. |
| Withdraw application | `POST volunteer/applications/{id}/withdraw/` | Existing. DB cascade cancels active assignment when applicable. |
| Confirm/cancel own assignment | `POST volunteer/assignments/{id}/confirm/`, `/cancel/` | Existing. Confirm is self-only; completed cannot be cancelled. |
| Charity category filters | `GET volunteer/charity-fields/` | Existing. Use active values only. |
| Profile edit | `PATCH volunteer/me/` | Existing; follow editable field allow-list and emergency contact pair rule. |
| Availability | `GET/POST volunteer/me/availability/` and rules/exceptions routes | Existing; server owns evaluation. |
| Verification upload/status | `GET/POST volunteer/me/verification-images/` | Existing; multipart upload; do not expose private file path. |
| Coordinator application/status | `GET/POST/PATCH volunteer/me/coordinator/` | Existing; only approved status unlocks Coordinator tools. |
| Managed event list/create | `GET/POST coordinator/events/` | Existing; approved coordinator required. New events begin as draft. |
| Event update/transition | `GET/PUT coordinator/events/{id}/`, publish/activate/complete/cancel actions | Existing; backend/DB validates lifecycle. |
| Event summary | `GET coordinator/events/{id}/summary/` | Existing. |
| Posts | `GET/POST coordinator/events/{id}/posts/`, `GET/PUT coordinator/posts/{id}/`, close | Existing; close is irreversible through the documented API. |
| Application queue/decisions | `GET coordinator/events/{id}/applications/`; accept/reject/waitlist | Existing; T2 capability data only for accepted applicants. |
| Assignment management | auto-assign, manual-assign, assignments, unassigned, post-capacity | Existing; SQL owns assignment/capacity/schedule logic. |
| Onboarding | `GET checkin/events/{id}/onboarding/`, `POST .../acknowledge/` | Existing; acknowledgment is per event/version and append-only. |
| QR creation/revocation/resolve/redeem | Coordinator QR endpoints + check-in QR endpoints | Existing; raw QR token returned once. |
| Geo/manual check-in | `POST checkin/attendance/geo-checkin/`, manual-checkin | Existing; server computes geofence result. |
| Attendance history/board | `GET checkin/me/attendance/`, coordinator event attendance | Existing; volunteer history is sanitized. |
| Geo confirmation | coordinator confirm/reject attendance endpoints | Existing; event manager only. |
| Feedback submit/list/summary | `POST checkin/events/{id}/feedback/`, `GET .../feedback/list/`, `GET checkin/me/feedback/` | Existing documented; only own authored rows plus allowed aggregate summary for non-admins. |
| Friends | `GET/POST friends/...` | Not supported. Requires approved relationship model and privacy rules. |
| Push notification inbox | `GET notifications/...` | Not supported by supplied SQL/API reference. Out of MVP. |
| Map catalog/tiles/download | `GET maps/catalog/`, tiles and region download | Documented; offline pack integration should follow map defect validation. |

### 6.3 Proposed mobile dashboard DTO

Keep the dashboard response presentation-oriented and privacy-minimal. The BFF should only aggregate data already visible to the current user.

```ts
export interface VolunteerDashboard {
  volunteer: {
    completedShiftCount: number;
    completedEventCount: number;
    upcomingAssignmentCount: number;
    nextAssignment: AssignmentCard | null;
    rating: RatingAggregate | null;
  };
  coordinator: CoordinatorDashboardSummary | null;
}

export interface RatingAggregate {
  average: number | null;
  count: number;
  distribution?: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface CoordinatorDashboardSummary {
  managedEventCount: number;
  activeEventCount: number;
  pendingApplicationCount: number;
  pendingGeoConfirmationCount: number;
}
```

`coordinator` is null unless the authenticated account is currently approved as Coordinator. Do not return admin data. If the caller has no rating rows, return `average: null`, `count: 0` rather than `0.0` stars.

### 6.4 Proposed dashboard composition if a new endpoint is deferred

For a small UI prototype, the mock repository can compose profile, assignments and feedback fixtures. For live integration, prefer one BFF dashboard aggregation call. If that is deferred, compose the existing reads in a repository/facade, but:

- Respect page boundaries and pagination.
- Do not assume the first page contains all completed assignments.
- Do not make multiple calls per list item (avoid N+1 client requests).
- Do not calculate user feedback from raw individual feedback rows if the endpoint already provides a privacy-filtered summary.
- Do not query Coordinator summaries for a non-approved user.

---

## 7. Permission and Privacy Matrix for Mobile UI

| Feature/data | Anonymous | Active volunteer (self) | Pending Coordinator | Approved Coordinator | Owner-as-monitor |
|---|---|---|---|---|---|
| Browse published/active event T0 fields | Yes | Yes | Yes | Yes | Yes |
| View own profile full self data | No | Yes | Yes | Yes | Yes |
| Edit own allow-listed profile fields | No | Yes | Yes | Yes | Yes |
| Manage own availability | No | Yes | Yes | Yes | Yes |
| Apply to event | No | Subject to backend event/account rules | Same as volunteer | Same as volunteer | Same as volunteer |
| View own applications/assignments/attendance | No | Yes | Yes | Yes | Yes |
| Apply for Coordinator capability | No | If verified and eligible | Pending; edit notes only if allowed | Already approved; do not show application as a new privilege | Same coordinator status, event-specific read-only may apply |
| Create/manage events | No | No | No | Yes, for events where manager/write permission is true | No write on handed-over event |
| Read T2 accepted-applicant capabilities | No | No | No | Only if manager of the event and applicant is accepted | Read-only only if the manager permission permits the scoped read |
| Read T3 emergency/safety data | No | Self only | Self only | Only documented active-shift safety exception | Only if same current-coordinator/active-shift exception is met; do not assume owner-monitor can read it |
| Read T4 governance/audit data | No | No | No | No | No |
| View aggregate rating about a user | Public aggregate rule as exposed by BFF | Aggregate only | Aggregate only | Aggregate only | Aggregate only |
| View raw feedback written by others | No | No | No | No (unless admin; admin app is out of scope) | No |
| View friend list | No | Not currently supported | Not currently supported | Not currently supported | Not currently supported |

Important privacy rules:

- T1 is only a minimal identity card (`uuid`, `display_name`) for an authenticated lookup.
- T2 capability data is not available merely because a user is a Coordinator. It is event-scoped and depends on manager status plus accepted application/active assignment conditions documented by the backend.
- T3 emergency contact and sensitive personal data are self/admin only, with a narrow active-shift safety exception for the current Coordinator of an active event and a volunteer assigned/confirmed on that event.
- T4 is admin/governance data; exclude from this app.
- Do not add profile browsing to the Friends screen by reusing UUID lookup as an unrestricted directory.

---

## 8. Backend State Machines the UI Must Represent

The frontend displays states and submits intents. It must not invent new transitions.

| Domain | States/transitions to represent | Frontend behavior |
|---|---|---|
| Account | `active`, `blocked`, `closed` | Account status response can lock session features. Do not permit local unblock/reinstate. |
| Verification | `none -> pending -> verified/rejected` | Show current status; status is database-derived from image review. |
| Coordinator | `pending -> approved -> suspended/revoked` (and approved/suspended to revoked per rules) | Only `approved` unlocks Coordinator tools. |
| Event | `draft -> published -> active -> completed`; cancellation from non-terminal states | Show only allowed next action; re-fetch after each transition. |
| Event post | `open <-> full`; manual `closed` | `open/full` is capacity-maintained; `closed` is an irreversible user action in API. |
| Application | `pending -> accepted/waitlisted/rejected/withdrawn`; accepted/waitlisted may be withdrawn; stale pending/waitlisted may expire | Show backend result; do not model accepted as assignment unless assignment response exists. |
| Assignment | `assigned -> confirmed -> completed`; assigned/confirmed may cancel under rules | Only assigned volunteer confirms; completed assignments cannot be cancelled. |
| Attendance | `expected -> checked_in -> completed`; geo confirmation `pending/confirmed/rejected` | Display check-in result code and server-provided status. |
| Onboarding | Acknowledgment per event and onboarding version; append-only | If text version changes, request the current version and require a new acknowledgment when required. |
| Feedback | One submission per rater/event/direction; immutable; event must be completed and rater participated | Form becomes submitted/locked after successful response; do not allow editing. |
| QR token | purpose-bound, expires/revokes/usage-limited, raw token returned once | Treat QR payload as sensitive, ephemeral data; show validity result without consuming on resolve. |

### 8.1 Error handling UX

Centralize the documented response envelope and map error codes to actions:

| HTTP / code | UX response |
|---|---|
| `401` authentication/token invalid | Clear session and navigate to Login. Preserve only safe, non-sensitive form drafts if supported. |
| `403 account_blocked` / `account_closed` | Show account status screen. |
| `403 coordinator_not_approved` | Explain that Coordinator access is not approved; route to Coordinator status/Profile. |
| `403 owner_monitor_read_only` | Show read-only banner; suppress write controls; offer retake only if caller is event owner and endpoint allows it. |
| `404 not_found` | Generic not-found message; remember 404 may intentionally mask permission/resource existence. |
| `409 duplicate_application`, `capacity_full`, `schedule_conflict`, `duplicate_feedback`, `already_acknowledged` | Keep context, refresh relevant server state, display exact safe message; do not blindly retry. |
| `429 otp_rate_limited`, `too_many_attempts` | Show retry timing only if server returns it; prevent rapid resend. |
| Network/offline | Show cached read-only data where safe; never claim a write succeeded without server confirmation. |

---

## 9. Android-First BFF Integration Design

### 9.1 API client

One shared `MobileApiClient` should own:

- Base URL and one route manifest.
- `Authorization: Token <key>` injection for authenticated operations.
- JSON content type and multipart upload handling.
- Request timeout and network error classification.
- Standard error-envelope parsing.
- Global unauthorized/session-expiry handling.
- Safe request logging that excludes tokens, OTP codes, raw QR tokens, private profile values and image bytes.
- Request cancellation for search and screen navigation.

Use Android secure storage (for example, a platform-backed keychain/keystore wrapper) for the DRF token. Do not store credentials/tokens in ordinary unencrypted preferences. The current token is persistent until logout in the documented backend; the app must still handle revoked/invalid tokens and account status responses.

### 9.2 Query and mutation policy

- Reads use a server-state cache with explicit stale times and pull-to-refresh.
- Search queries should debounce and cancel stale requests.
- After mutations, invalidate only related query keys (for example, applying invalidates event detail, application list, dashboard activity and possibly capacity feed).
- Do not optimistically mark an application accepted, assignment confirmed, attendance checked in, event published or feedback submitted until the backend confirms the result. An optimistic button spinner is fine; authoritative state must come from response/refetch.
- Avoid client-side retries of non-idempotent writes unless the operation is explicitly idempotent or the backend provides an idempotency mechanism.

### 9.3 Mobile upload and camera/location permissions

- Ask for camera access only when the user opens QR scanning or an allowed image capture flow.
- Ask for precise location only when the user initiates geo check-in; explain why it is needed.
- Send latitude, longitude, accuracy, capture timestamp and the platform's mocked-location indicator where supported. Server determines result.
- Do not collect location in the background for the Dashboard or event browsing.
- Send verification images only to the private upload endpoint. Never request or use a server file path.

### 9.4 Offline behavior

MVP offline scope:

- Read-only cached event cards/detail and own cached upcoming assignments, clearly labelled with last-updated time.
- Local theme preference and unsubmitted form drafts where safe.
- No offline claims that an application, assignment, check-in, feedback or lifecycle mutation has succeeded.
- Geo/QR/manual check-in require a successful server response; queueing geo evidence for later without a formal backend idempotency/anti-fraud design is not part of this plan.
- Offline map packs are optional later work after backend map-pack correctness is verified.

---

## 10. UI-First Delivery Plan

The purpose of the first development cycle is to finish a complete, testable UI shell and feature flows with mock repositories, then replace the repository implementations with BFF repositories. The screens and feature hooks should not need a redesign during API integration.

### Phase 0 — Contract and project baseline

**Deliverables**
- Confirm current mobile project framework/build tooling and Android application ID.
- Confirm current backend branch/commit and generate the live OpenAPI schema.
- Resolve the flat-vs-prefixed endpoint route discrepancy.
- Publish DTO definitions and exact enums/status values.
- Confirm dashboard rating definitions (`as_volunteer` and `as_coordinator`) and completed-event counting semantics.
- Record Friends and event-tag gaps as excluded from live integration.

**Exit criteria**
- One canonical mobile API base path and route manifest.
- DTOs compile and validate against schema/examples.
- No unresolved ambiguity on what `completed` means in the Dashboard.

### Phase 1 — Design system and app shell (UI only)

**Screens/components**
- Theme tokens, typography, spacing, common cards/buttons/forms/badges.
- Light and dark themes.
- Drawer navigation and nested stacks.
- Auth screens with mock OTP flow.
- Loading, empty, error, offline and permission-denied states.

**Exit criteria**
- Android launches to mock login and authenticated drawer.
- All three volunteer destinations are navigable.
- Theme changes apply to every screen and persist after restart.

### Phase 2 — Volunteer MVP UI

**Screens**
- Dashboard.
- Event discovery/filter sheet.
- Event detail/posts/capacity.
- My Applications.
- My Shifts/Assignments.
- My Profile.
- Availability.
- Verification and Coordinator status.
- Attendance history.
- Settings and theme.
- Friends visual placeholder only.

**Exit criteria**
- Every list, state, empty/loading/error state and form works with deterministic fixtures.
- Mock DTOs use only supported backend fields/states.
- Dashboard Coordinator card appears only for an approved mock capability.
- Friends screen clearly stays mock/placeholder and cannot display fabricated live relationships.

### Phase 3 — Coordinator UI

**Screens**
- Coordinator overview.
- Managed event list and event summary.
- Event creation wizard and draft review.
- Post management.
- Application queue and decisions.
- Assignment/manual assignment/auto assignment views.
- Attendance board and geo confirmation queue.
- QR token generation/revocation.
- Onboarding/feedback flows.
- Read-only monitor banner and owner retake confirmation.

**Exit criteria**
- Coordinator routes are capability-gated in navigation and screen-level hooks.
- T1 and T2 applicant fixtures are distinct; pending applicants do not expose T2 fields.
- Read-only owner monitor state removes write actions in UI.
- Lifecycle transitions only appear in their allowed states.

### Phase 4 — Mock-to-BFF integration

Integrate in low-risk order:

1. Auth request/verify/logout and secure token storage.
2. Profile/coordinator status/charity taxonomy.
3. Event feed/detail/posts/search/filter.
4. Own applications and assignments.
5. Dashboard aggregation/rating summary.
6. Availability and verification uploads.
7. Coordinator event create/update/lifecycle and posts.
8. Applications/assignments/rosters.
9. Onboarding, QR, geo/manual attendance and confirmation.
10. Feedback.
11. Maps after map backend validation.
12. Friends only after its backend model and privacy rules exist.

**Exit criteria**
- UI components use the same hooks with `MockRepository` or `BffRepository` selected by environment.
- No feature screen contains raw endpoint strings or direct fetch calls.
- Server response is the only source of success for business mutations.

### Phase 5 — Android integration and release hardening

- Test against local/staging backend using physical Android device and emulator.
- Verify development base URL and production HTTPS base URL are separate configuration values.
- Test network switching, timeouts, expired/invalid token, 401/403/404/409/429.
- Test camera, location and multipart permissions.
- Test screen rotation/resume/background handling for QR and check-in screens.
- Verify no credentials, OTP codes, raw QR tokens, image bytes, private fields or GPS evidence appear in logs/crash reports.
- Run backend lifecycle tests and mobile end-to-end flows against a clean seeded database.

**Exit criteria**
- No critical role/privacy bypass in UI or BFF.
- Volunteer MVP can complete login -> browse -> apply -> receive decision -> confirm assignment -> onboarding -> check-in -> attendance history -> feedback.
- Approved Coordinator can create -> post -> publish -> manage applications/assignments -> operate attendance -> complete event.
- Ordinary volunteer cannot access Coordinator write APIs even if they manually call routes.

---

## 11. Test Matrix and Acceptance Criteria

### 11.1 Role/capability tests

- Active volunteer with no coordinator profile: volunteer navigation only; Coordinator card absent.
- Pending coordinator application: volunteer navigation remains; status visible in Profile; Coordinator Workspace absent.
- Approved coordinator: volunteer features remain; Coordinator card and workspace appear.
- Suspended/revoked coordinator: coordinator mutations denied; status visible; volunteer experience remains subject to account state.
- Blocked/closed account: authenticated features locked based on backend response.
- Owner-as-monitor: event reads available as permitted; event writes hidden and rejected by backend; owner retake action shown only when allowed.

### 11.2 Privacy tests

- Pending applicant response contains only T1 fields.
- Accepted applicant response includes only documented T2 fields in the event scope.
- No emergency contact, decrypted phone, blood type or other T3 fields in generic event/roster lists.
- Volunteer attendance history excludes raw GPS coordinates, accuracy and device telemetry.
- Non-admin feedback responses include only authored feedback rows plus permitted aggregate summary; no other rater identity or raw comments.
- Friend screen does not use UUID lookup as a directory.

### 11.3 State-transition tests

- Event publish blocked if requirements are unmet; event begins as draft.
- Closed event posts cannot be reopened through the documented API.
- Duplicate application and schedule conflict return visible conflict handling.
- Accepting an application respects capacity and may auto-create assignment only according to event settings.
- Assignment confirmation is self-only.
- Completed assignments cannot be cancelled.
- Onboarding acknowledgment is version-specific and append-only.
- QR preview does not consume token; redemption respects purpose, expiry, revocation and usage limits.
- Geo check-in shows server result codes and never computes its own successful distance decision.
- Feedback cannot be edited after submit and is not shown as an open form after successful submission.

### 11.4 Android UI tests

- Drawer navigation and Coordinator entry visibility.
- Light/dark contrast and persistence.
- Small screen, keyboard, long text, Burmese/English text expansion and date/time formatting.
- Search debounce, filter reset, pagination, empty and error states.
- Accessibility labels and touch targets for QR/location/check-in actions.
- App killed/restarted during an in-progress form; restore only safe drafts.

---

## 12. Prioritized Scope

### P0 — Must be in the first working Android release

- Auth/session.
- Volunteer Dashboard (including completed work and privacy-safe rating summary).
- Event discovery/search/category filters/detail/posts/apply.
- My Applications and My Assignments.
- Profile, verification status, Coordinator application status.
- Availability and attendance history.
- Light/dark theme.
- Basic Coordinator create/manage event flow for approved Coordinators.
- Central API client/error handling and permission-aware navigation.

### P1 — Coordinator operational workflows

- Post capacity/roster management.
- Application decision and assignment management.
- Onboarding acknowledgment.
- QR check-in, geo check-in, manual check-in and checkout.
- Geo confirmation queue.
- Feedback forms and rating summaries.
- Handover/read-only/retake flows.

### P2 — After backend/product gaps are resolved

- Real Friends / friend requests / past collaborator connections.
- General event tags if charity fields are insufficient.
- Push notification inbox and push delivery.
- Full offline regional maps.
- Any messaging, social feed, saved events or user discovery features not represented in the current schema/API.

---

## 13. Decisions Needed Before Coding the Corresponding Feature

These are not blockers to building the volunteer shell; they are blockers to implementing the live version of the related feature.

| Decision | Why it matters | Safe default until decided |
|---|---|---|
| Exact canonical BFF paths | Two supplied references document flat and prefixed paths | Use one generated route manifest after OpenAPI verification. |
| Rating definition for Dashboard | There are distinct feedback directions for volunteer and Coordinator | Display `as_volunteer` and `as_coordinator` separately; no blended score. |
| Completed event counting | An event can include assignment and attendance states | Count only the user's completed participation, not global completed events. |
| Friends semantics | No relationship table or friendship rules exist | Placeholder only; no live friends data. |
| Event tags semantics | SQL currently has charity fields and post skill tags, not general event tags | Filter events by charity category; skills remain post-level. |
| Dashboard aggregator | Existing individual read endpoints may require multiple client requests | Add a BFF aggregate endpoint; no new SQL table. |
| Push notifications | No notification schema or delivery contract is in supplied sources | Exclude from MVP; use screen refresh and status counts. |
| Offline check-in | Server must validate geofence, token use and attendance | No offline check-in until an explicit secure protocol exists. |

---

## 14. Recommended First Implementation Ticket Breakdown

1. `MOB-001` — Confirm mobile project baseline, Android build and environment configuration.
2. `MOB-002` — Publish frontend domain DTOs and mock fixtures from the current business rules.
3. `MOB-003` — Implement design tokens and Light/Dark Theme Provider.
4. `MOB-004` — Implement Auth Stack, Main Drawer and capability-gated Coordinator navigation.
5. `MOB-005` — Implement Volunteer Dashboard with mock repository.
6. `MOB-006` — Implement Event Discovery, search/filter sheet and Event Detail.
7. `MOB-007` — Implement Applications and Assignments screens.
8. `MOB-008` — Implement Profile, Availability, Verification and Coordinator Status.
9. `MOB-009` — Implement Friends placeholder screen and document backend blocker.
10. `MOB-010` — Implement Coordinator Workspace overview and Event Creation Wizard.
11. `MOB-011` — Implement event posts, application queue and assignment views.
12. `MOB-012` — Implement attendance, QR, geo confirmation, onboarding and feedback screens.
13. `BFF-001` — Resolve canonical BFF route map and publish OpenAPI contract.
14. `BFF-002` — Implement/confirm volunteer dashboard aggregation and privacy-safe rating summary response.
15. `MOB-013` — Implement shared MobileApiClient, secure token store and error mapping.
16. `MOB-014` — Replace mock repositories with BFF repositories feature by feature.
17. `MOB-015` — Run Android role/privacy/state-machine end-to-end tests.

---

## 15. Final Recommendation

Start with the **Volunteer shell and the UI component system**, not Coordinator event creation. The volunteer journey establishes the shared identity, account state, event discovery, application, assignment and profile patterns that the Coordinator workspace will reuse.

The first integrated release should be: Login → Volunteer Dashboard → Event Discovery → Event Detail → Apply → My Applications/My Shifts → Profile/Settings, with the approved-Coordinator card and workspace added after the volunteer base is stable.

Build the Friends screen visually during UI-first work, but do not connect it to live data until relationship semantics, schema and privacy permissions are formally added. Use charity categories rather than pretending the current database has general event tags. Keep the two rating directions separate. Add a BFF dashboard aggregation endpoint if the existing individual reads do not provide a practical screen-level result.

**The central architectural rule:** design each screen against a typed repository interface first; then connect that repository to the BFF. This gives the UI-first workflow the flexibility requested without changing the database rules or embedding business logic in Android.

---

## Source Reference Index

### User-provided project sources

- `updated_volunteer_coordination_system_Database.sql`
  - Users and account fields: lines 122–210.
  - Volunteer availability: lines 224–272.
  - Coordinator profiles: lines 273–299.
  - Event model and event state constraints: lines 389–515.
  - Event posts and required skills/capacity: lines 548–589.
  - Applications: lines 630–687.
  - Assignments: lines 688–763; event-completion cascade and assignment completion behavior: lines 2168–2205; assignment transition guard: lines 2497–2554.
  - Attendance and geo evidence: lines 764–907; attendance transition guard: lines 2618–2753.
  - Onboarding acknowledgments: lines 908–927.
  - Feedback: lines 928–974.
  - Public event view and capacity: lines 3117–3165.
  - Coordinator event summary: lines 3166–3188.
  - Coordinator check-in board: lines 3207–3247.
- `BUSINESS_RULES_AND_PERMISSIONS.md`
  - Role derivation: lines 43–80.
  - Permissions: lines 139–174.
  - Privacy tiers: lines 177–248.
  - Profile allow-list: lines 252–302.
  - Coordinator lifecycle: lines 348–380.
  - Event lifecycle/manager/handover: lines 382–484.
  - Posts: lines 486–525.
  - Applications: lines 527–599.
  - Assignments: lines 600–654.
  - QR: lines 656–691.
  - Attendance: lines 693–753.
  - Onboarding: lines 755–767.
  - Feedback privacy and submission: lines 769–799.
  - Availability: lines 876–906.
  - BFF endpoint groups: lines 967–1077.
- `volunteer_coordination_system_v0_6_0_complete_session_summary_mobile_bff_integration_guide.md`
  - Global mobile BFF rules and error envelope: sections 3.1–3.4.
  - Endpoint examples and response shapes: sections 4.1–4.5.

### Review limitations

This plan is a static architecture/product mapping from the supplied SQL and documentation. It does not claim that every documented endpoint/response example was exercised against a live server during this planning task. Before live integration, verify the current repository branch, `bff/urls.py`, serializers, OpenAPI schema and backend tests. No SQL was changed by this plan.
