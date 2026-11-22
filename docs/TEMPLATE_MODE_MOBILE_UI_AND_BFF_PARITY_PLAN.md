# Template-First Mobile UI & BFF Parity Blueprint

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Baseline branch:** `main`  
**Baseline commit:** `2f63e5509d5d8a681f614cfe29c7aa40957550cd`  
**Working branch:** `feature/template-first-mobile-ui`  
**Scope:** React Native template/mock UI completeness and Django BFF/database-contract parity before enabling live mobile data mode.

---

## 1. Objective and implementation order

The next implementation stage is **template-first**, not live integration. The mobile screens should first expose the complete set of user-editable fields, selectable states, display-only values, empty/loading/error states, and preview interactions that the existing BFF and frozen PostgreSQL contract support. The user should be able to examine and edit the mobile presentation while it runs on local demo fixtures, without the app contacting Django or PostgreSQL.

The intended progression is:

1. **Template mode:** screens use local mock repositories and editable in-memory fixtures only.
2. **Contract parity:** form values, DTO fields, allowed choices, validation and display states match the current BFF serializers and service behaviour.
3. **HTTP-ready UI:** every screen can accept the corresponding repository result and render success, empty, pending, validation, permission, conflict and network-failure states.
4. **Controlled HTTP integration:** enable HTTP mode only after local non-destructive preflight and BFF smoke tests. A separate approval is required before any operation that could write to the frozen database.

Template mode is the existing `mock` data mode presented with a clearer product-facing name. It must continue to select the existing mock repositories. It must not be a third data source, a test database, or a hidden HTTP mode.

## 2. Non-negotiable constraints

- **Database freeze:** do not run migrations, DDL, seed scripts, fixture writes, schema tests or destructive tests against `volunteer_coordination_db`. Ordinary local app reads/writes are a separate, explicitly controlled demonstration activity and are not part of template mode.
- All database-owned IDs, states, timestamps, counts, decisions, permissions and computed values are authoritative server values in HTTP mode. The UI may use labelled demo values in template mode but must never pass those as real server state.
- Keep the existing architecture: React Native screens → use cases/repositories → endpoint wrappers/DTOs/mappers → Django BFF/services → PostgreSQL.
- The mobile client must not contain PostgreSQL drivers or database connection strings.
- Do not change database schema, SQL functions, triggers, constraints, views or canonical SQL files.
- Do not reintroduce YAML/CI workflows. Use local verification commands when implementation work is completed.
- Do not inspect, modify or refer to contents of `old_doc/` or any subdirectory.
- Preserve the separate Django admin web portal. Administrator-only moderation, audit, user management and operational controls are not volunteer/coordinator mobile screens.
- Native GPS/geofence execution and interactive native mapping remain deferred for this feasibility prototype. The location fields and a visibly-labelled map/location placeholder may be edited in template mode; do not present decorative coordinates as a verified device location.
- Friends remains a deferred/Coming Soon capability.
- A verification-image attachment placeholder can be designed in template mode, but a real native image-picker integration requires an explicit native dependency and device testing.

## 3. Current mobile application structure

### 3.1 Data mode and repository selection

Current source:
- `mobile/src/app/configuration/dataMode.ts`
- `mobile/src/app/RepositoryProvider.tsx`
- `mobile/src/data/mock/`
- `mobile/src/data/http/`
- `mobile/src/features/settings/screens/SettingsScreen.tsx`

The application currently has `DataMode = 'mock' | 'http'`, with `mock` as the default. `RepositoryProvider` selects mock repositories in mock mode and HTTP repositories in HTTP mode. The settings screen exposes a development-only mode switch and an API connectivity check.

**Template mode rule:** display the first option as **Template Mode** (internally mapped to existing `mock`). The screen must clearly say that template mode uses local demo fixtures and makes no live BFF calls. The separate **HTTP Mode** option remains a developer diagnostic only; it must not be silently enabled after startup or a failed mock call.

### 3.2 Existing screens and required template coverage

| Feature area | Current screen(s) | Template data and editable/display fields required |
|---|---|---|
| Authentication | `OtpLoginScreen` | Mobile number, optional display name, six-digit OTP input, resend/change-number states, local demo-code state, challenge expiry, provider/configuration/rejection/timeout messages. Template mode must label the code as demo-only. |
| Volunteer dashboard | `DashboardScreen` | Account greeting, activity totals, upcoming commitments, completed activities, empty/loading/error/cancel-confirmation states. Demo metrics must be visibly mock data. |
| Public event discovery | `EventDiscoveryScreen` / `EventDetailScreen` | Search, category/status filters, event title/description/purpose, categories, date/time, location/landmark, support/perks, remaining capacity, post/role cards, application state, optional volunteer note. Unknown coordinates remain unknown. |
| Applications | `MyApplicationsScreen` | Event/post reference, application ID/status/source, submission time, note, filters, withdraw confirmation and failure states. |
| Assignments | `MyAssignmentsScreen` | Event/post, assignment state, schedule, location, assignment time, attendance state, confirmation, onboarding acknowledgement, QR token input, check-in/check-out and feedback states. GPS check-in remains dormant/deferred. |
| Volunteer profile | `ProfileScreen` / `ProfileEditScreen` | Display name, preferred language, home area, emergency contact, skills, charity interests, physical capabilities, meal/travel/unpaid preferences, blood type, donation sub-preferences, and read-only account/identity/coordinator/rating attributes. |
| Availability | `AvailabilityScreen` | Weekly weekday/time rules, validity dates, full-day blackout or partial-day exception, exception note, conflict-check result, add/edit/delete confirmations and errors. |
| Identity/coordinator | `VerificationCoordinatorStatusScreen` | Verification status, the three supported image slot types, per-slot status/file metadata, coordinator application status/note/eligibility. Image upload needs a visibly-labelled placeholder until a native picker is approved. |
| Coordinator overview | `CoordinatorOverviewScreen` | Total/active/draft events, pending applications, accepted roster, checked-in metric with correct time semantics, managed-event cards and empty/error states. |
| Coordinator event list/detail | `CoordinatorEventsScreen` / `CoordinatorEventDetailScreen` | Event lifecycle, ownership/current coordinator, owner-as-monitor read-only state, location, schedule, categories, support, geofence configuration (display/config only), operational counts and lifecycle confirmation. Add an edit-event path for the BFF PATCH capability. |
| Event creation | `CreateEventWizardScreen` | All fields accepted by `EventCreateSerializer`, with exact allowed choices, nullable/optional handling, validation and full review summary. |
| Applications review | `CoordinatorApplicationsScreen` | Volunteer/post/source/status/decision metadata, accepted-applicant capability fields where authorized, search/filter, accept/reject/waitlist, and an invite-volunteer form. |
| Assignments | `CoordinatorAssignmentsScreen` | Accepted/unassigned applicants, event post selection, optional group code, group-leader flag, auto-assignment result, assignment status and cancellation. No hard-coded assignment parameters. |
| Attendance | `CoordinatorAttendanceScreen` | Roster IDs/status/method/timestamp, editable manual-check-in note, pending geo confirmation status, confirm/reject reason/note, QR create/revoke fields and generated token display. Geo review remains dormant in the mobile flow unless specifically enabled later. |
| Settings | `SettingsScreen` | Theme, local template-mode label, developer-only HTTP host preset, explicit BFF ping, session/logout and accurate connection status. |

`CoordinatorWorkspaceScreen`, `EventsScreen` and `FriendsScreen` are very small navigation/placeholder components, not independent data-entry forms. The detailed/functional screens listed above remain the intended sources for their respective capabilities.

## 4. Backend/BFF capability boundary

The BFF is organised into four business packages plus a separate admin portal.

### 4.1 Volunteer BFF

Mounted through `backend/bff/volunteer/urls.py`:
- Public charity taxonomy and event browse/detail/post data.
- Own profile/bootstrap/charity interests.
- Volunteer UUID lookup.
- Availability, weekly rules, date exceptions and schedule conflict checks.
- Verification-image metadata and upload.
- Coordinator application/read/update.
- Event application, own applications, invite response and withdrawal.
- Own assignments, confirm and cancel.
- Feedback summary/items.

### 4.2 Coordinator BFF

Mounted through `backend/bff/coordinator/urls.py`:
- Coordinator application.
- Managed event list/detail/create/update and lifecycle transitions.
- Event summary and coordinator handover/retake/history.
- Event posts create/update/close and capacity summary.
- Volunteer invitation and application decisions.
- Auto/manual assignments, assignments and unassigned applicants.

### 4.3 Check-in BFF

Mounted through `backend/bff/checkin/urls.py`:
- Onboarding status and acknowledgement.
- QR resolve/redeem, coordinator token create/revoke.
- QR/manual/geo attendance requests and checkout.
- Volunteer attendance history.
- Coordinator attendance roster, pending confirmations, geo-attempt review and confirmation/rejection.
- Feedback submit/list and own feedback.

### 4.4 Admin portal and database-only/system capabilities

The separate `backend/admin_portal/` web interface/API covers administrative dashboard, user moderation, event moderation, feedback moderation, audit history, verification-image review, maintenance and map operations. These must remain in the admin web portal and must not be copied into volunteer/coordinator mobile forms.

PostgreSQL infrastructure/system tables (for example Django content types, permissions, sessions and migrations) are not mobile capabilities. Business audit/moderation/configuration features should be represented only in the admin portal where their permission boundary requires it.

**BFF conclusion:** the current backend has broad coverage for the volunteer/coordinator domain. The next task is not to blindly create new BFF endpoints for every database table. First map each user-facing capability to its existing serializer, route, service and DB model; only add a BFF operation when a real capability has no route or the current contract is incomplete. Never add DB columns/functions to close a UI gap.

## 5. Confirmed field-contract gaps to correct before HTTP mode

### 5.1 Event creation choices do not match the BFF

Current UI/domain values include:
- Leader strategies: `none`, `first_assigned`, `highest_rated`.
- Compensation: `unpaid`, `stipend`, `travel_reimbursement`.

Current `EventCreateSerializer` and `EventUpdateSerializer` accept only:
- `leader_strategy`: `none`, `first_experienced`, `manual`.
- `compensation_kind`: `unpaid`, `arranged_outside_system`.

The HTTP DTO already uses the BFF choices. The UI/domain and demo fixtures must be aligned to these exact allowed values. Do not widen the BFF using unsupported options.

### 5.2 Location fields missing editable controls

The UI sends `geo_checkin_opens_before_min` as a fixed 30-minute value and hard-codes `map_provider = openstreetmap`. The BFF accepts a 0–240 minute geo-open buffer and `map_provider` values `openstreetmap` or `google`. Add editable template controls and validation for the buffer and provider. Keep the decorative radar labelled as a preview, not a real map.

### 5.3 Event-post fields and screens

The BFF event-post serializer accepts title, description, required headcount, physical level (`none|light|medium|heavy`), required skills, leader-needed, new-volunteer-allowed and priority. The current create/update mobile DTOs do not expose `priority`, and the current coordinator screens do not provide an event-post management form. Add post create/edit/close controls in the coordinator event workflow, with fields matching the serializer exactly.

### 5.4 Assignment form is incomplete

The current coordinator assignment action uses a hard-coded group code and group-leader flag. Replace that with template controls for the selected application, target post, group code (optional) and leader flag. The current BFF manual assignment contract also accepts application ID and post ID; the UI must not fabricate either identifier.

### 5.5 Other mobile UI gaps against existing BFF routes

- Invite volunteer: add volunteer user ID or UUID, optional post, and note.
- Coordinator event edit: add an edit form for supported fields using the existing PATCH endpoint.
- Attendance: add editable manual-check-in note; show server-provided method/time/status; add QR token create/revoke form and token display.
- Verification: provide an attachment placeholder and metadata preview in template mode; actual native image selection/upload remains a later dependency/device task.
- Event/post capacity, coordinator history, UUID-based volunteer lookup, own attendance history and feedback summary have repository/API surfaces but no complete discoverable mobile screen or screen section yet. Add navigation/display sections where role and privacy allow.
- Volunteer master donation willingness is currently derived from blood/items sub-preferences. Preserve the server's documented aggregate behaviour; do not introduce a conflicting independent switch without matching service semantics.
- Demo fixture names/emails/IDs/coordinates/metrics are not real users or persisted state. In HTTP mode, display only fields actually delivered by the BFF.

## 6. Data contract and field presentation rules

Every editable form field must be recorded in a UI contract with:
1. Mobile screen/section and visible label.
2. Domain property (camelCase).
3. Request DTO field (snake_case).
4. BFF serializer name and exact type/allowed choices/range/nullability.
5. Owning service operation and underlying DB table/view/function (read-only mapping).
6. Template fixture/default and validation.
7. Read-only/derived/permission-sensitive classification.
8. Mock and HTTP repository method.
9. Loading, empty, success, validation, permission, conflict and network-error presentation.

Use these presentation rules:
- Use `null`/unknown for absent optional values; do not coerce missing coordinates to 0 or unknown flags to true.
- Use controlled text/date/time/number/choice/toggle controls for user-editable values.
- Distinguish optional, required, read-only and derived fields visibly.
- Date/time values sent to the server must use explicit offset-aware timestamps. Template display can show Myanmar Time (MMT / UTC+06:30) while preserving the ISO value used by DTOs.
- Status chips and metrics are display-only unless a specific BFF mutation is available.
- Mock actions should exercise validation and update the mock repository/fixture state; label them as local template changes.
- HTTP actions must not show success until the BFF result returns.
- HTTP mode must never fall back from a failed BFF call to fabricated mock records.
- Do not expose raw phone, OTP, auth tokens, verification-image paths or privileged Tier-2 data to the wrong role.
- Maintain the current domain → DTO → mapper → repository boundary. Screens should not construct API payloads directly.

## 7. Implementation sequence and acceptance gates

### Stage T0 — Template mode and contract lock
- Rename the developer-facing mock selector to Template Mode while retaining internal `mock`.
- Make current event creation fields match BFF accepted choices/ranges/nullability.
- Remove invalid demo-fixture choice values.
- Document every existing screen and all user-facing BFF capabilities.

### Stage T1 — Complete existing forms
- Complete event create/edit form.
- Complete post create/edit/close form.
- Complete volunteer profile and availability form coverage.
- Complete coordinator invite and manual assignment forms.
- Complete attendance note and QR-token forms.
- Complete verification attachment placeholder and feedback/history sections.
- Make preview-only or deferred GPS/map controls explicit and non-operational.

### Stage T2 — Mock repository fidelity
- Mock repositories must implement the same interfaces, success/error results and state transitions as HTTP repositories.
- Template data changes should be consistent across screens during the same demo session.
- Include empty/loading/error and permission/monitor-mode states.
- No invented IDs/timestamps in HTTP mode.

### Stage T3 — Contract parity verification
- Complete a route matrix for every mobile operation: method/path, serializer, DTO, mapper, repository, owning screen, test.
- Generate/inspect OpenAPI locally without migrations.
- Run TypeScript and Jest locally; add contract tests for every form value/choice.
- Run backend API/unit checks only under safe test database configuration, never against the frozen local DB.

### Stage T4 — Controlled HTTP connection
- Follow the attached local demonstration runbook.
- Start with non-writing reads and explicit test BFF ping.
- Only after a manually approved safe test account is selected should any demonstration writes be attempted against the frozen DB.
- Do not run migrations, seeds, schema bootstrap, image conversion, destructive tests or DML test fixtures against the existing database.
- Record actual API response evidence and exact commit SHA.

### Completion criteria

Template mode is complete only when:
- Every currently present screen has a documented domain/field contract and editable placeholders for every supported user input.
- The coordinator event wizard has no BFF-invalid enum values and no uneditable values silently inserted into the request.
- Event post, invite, manual assignment, QR, attendance note and coordinator edit operations have UI forms for already-existing BFF operations.
- Every read-only/server-calculated field is clearly distinguished from editable input.
- All role/permission and empty/error/loading states can be previewed with fixtures.
- Mock and HTTP contracts match without mock fallback in HTTP mode.
- Template mode starts without network calls.
- No database schema or data changes are used to complete template mode.

---

## 8. Local verification boundaries

The accompanying `v0_12_0_local_demonstration_runbook.md` specifies a PostgreSQL 18.6 local environment and a strict freeze on the existing `volunteer_coordination_db`. Use its non-migrating Django system check and server startup instructions. Do not run the runbook's OTP request against an unintended number or perform any write-oriented demonstration without an explicitly approved test account and operator-controlled action.

The malformed canonical SQL bootstrap expression is a separate fresh-install issue. The runbook explicitly states that the current live database already contains the corrected function and must not be modified. Do not repair the canonical SQL in this phase.
