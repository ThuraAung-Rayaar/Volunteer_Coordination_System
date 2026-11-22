# Template Mode — Mobile UI, BFF and Database Coverage Matrix

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Working branch:** `feature/template-first-mobile-ui`  
**Baseline main commit:** `2f63e5509d5d8a681f614cfe29c7aa40957550cd`  
**Phase:** Template-first UI and contract parity  
**Database policy:** `volunteer_coordination_db` remains strictly frozen  
**Excluded:** `old_doc/` and every subdirectory beneath it (not inspected)

This document is the implementation matrix for the first mobile/BFF integration stage. It separates local template preview, the existing mobile HTTP path, server-backed capabilities, and work that is intentionally deferred. It is not a claim that the local server, SMS provider, or physical device has been tested.

---

## 1. Target architecture and operating modes

```text
React Native mobile UI
  ├─ Template Mode (default)
  │    ├─ UserContext local demo OTP
  │    └─ Mock repositories and editable in-memory fixtures
  │
  └─ HTTP Mode (explicit developer switch, later test phase)
       ├─ ApiClient / DTOs / mappers
       └─ Django BFF
            ├─ auth
            ├─ volunteer
            ├─ coordinator
            └─ checkin
                 |
                 v
             Services / permissions / validation
                 |
                 v
          PostgreSQL database-first schema
```

The mobile app must never open PostgreSQL itself. It has no database driver or SQL connection string. In HTTP Mode, every request passes through `ApiClient` and a BFF endpoint. The BFF/service layer owns validation, authorization, business rules, and database writes.

### Mode semantics

| Visible mode | Internal mode | Data source | Network behaviour | Persistence |
|---|---|---|---|---|
| **Template Mode** | `mock` | Mock repositories, local fixture state and local UserContext demo OTP | No Django/BFF request is needed for screen preview, mock CRUD or demo authentication | In-memory for the current app/repository session; not PostgreSQL |
| **HTTP Mode** | `http` | Django BFF through HTTP repositories and endpoint wrappers | Requests the real local BFF using the configured base URL | BFF reads/writes PostgreSQL according to the endpoint |

Template Mode is not a second backend and not a test database. It is a local UI and interaction sandbox. It must remain the default. Switching to HTTP Mode is an explicit developer action; an HTTP error must never silently fall back to mock records.

### Current source anchors

| Concern | Source |
|---|---|
| Mode type/state | `mobile/src/app/configuration/dataMode.ts` |
| Repository switching | `mobile/src/app/RepositoryProvider.tsx` |
| Local demo identity/OTP | `mobile/src/app/UserContext.tsx` |
| API URL selection | `mobile/src/core/api/apiConfig.ts` |
| API transport, auth header, timeout/error handling | `mobile/src/core/api/apiClient.ts` |
| HTTP repositories | `mobile/src/data/http/` |
| Mock repositories and fixtures | `mobile/src/data/mock/` |
| Endpoint contracts | `mobile/src/data/endpoints/` |
| DTOs and mapping | `mobile/src/data/dto/`, `mobile/src/data/mappers/` |

---

## 2. Mobile screen-by-screen UI field matrix

Status labels:
- **Present:** the main screen/form and its normal data contract already exist.
- **Improved in this branch:** template fields or contract alignment added in this phase.
- **Partial:** the screen exists but one or more BFF capabilities/fields remain absent from the UI.
- **Deferred:** intentionally represented as a preview/placeholder or excluded from this prototype.

| Mobile screen | Main fields, controls and display states | BFF/database connection | Status and remaining work |
|---|---|---|---|
| `OtpLoginScreen` | Phone, optional display name, OTP input, resend/change number, expiry, validation/errors, provider delivery state | HTTP: `POST /api/v1/auth/tokenized/request-otp/`, `POST /api/v1/auth/tokenized/verify-otp/`; database writes to OTP/challenge and user/token services | **Improved in this branch.** Template uses a local six-digit demo code `123456`, ephemeral challenge and no BFF request. HTTP path remains network-backed. Real SMS dispatch is not implemented by the current backend adapter; do not describe a console/template code as an SMS sent to a device. |
| `DashboardScreen` | Account greeting, personal activity totals, upcoming commitments, completed activities, empty/loading/error states | BFF self/bootstrap, event and assignment summaries; `users`, `events`, `event_applications`, `assignments`, `attendance`/summary views | **Present.** Validate that every metric is sourced from BFF response fields in HTTP Mode; fixtures remain labelled demo values in Template Mode. |
| `EventDiscoveryScreen` | Search, event/category filters, event cards, date/time, place, summary, category, availability/capacity, loading/empty/error | `GET /api/v1/events/`, `GET /api/v1/charity-fields/`; `v_public_events`, `events`, `charity_fields`, `event_charity_fields` | **Present.** Public list data must remain public-safe. Coordinates should remain unknown/null when absent, not silently become a real-looking location. |
| `EventDetailScreen` | Event description/purpose, start/end/deadline, location/landmark, categories, support, post/role cards, apply action and validation | `GET /api/v1/events/{id}/`, `GET /api/v1/events/{id}/posts/`, `POST /api/v1/events/{id}/apply/`; `events`, `event_posts`, `event_charity_fields`, `event_applications` | **Present.** Keep operational coordinator configuration out of this public response. Manager-only settings are fetched separately by coordinator UI. |
| `MyApplicationsScreen` | Application ID/status/source/time, event/post, note, filter, withdraw confirmation and error state | `GET /api/v1/me/applications/`, `POST /api/v1/applications/{id}/withdraw/`; `event_applications`, `events`, `event_posts` | **Present.** The BFF is authoritative for application state and decision timestamps. |
| `MyAssignmentsScreen` | Assignment/event/post, schedule, location, status, confirmation, cancellation and check-in/onboarding entry points | `GET /api/v1/me/assignments/`, assignment confirm/cancel endpoints; `assignments`, `event_applications`, `events`, `event_posts` | **Partial.** Basic assigned-work UI exists. QR scan, live native map/GPS UX and a complete volunteer attendance-history presentation are separate work items. |
| `ProfileScreen` | Read-only identity, phone/account/verification/coordinator status, summary fields, feedback/rating presentation | `GET /api/v1/me/bootstrap/`, `GET /api/v1/me/`; `users`, coordinator/feedback read models | **Present.** Raw secrets, OTPs, tokens, image paths and non-authorized T2 data must never appear. |
| `ProfileEditScreen` | Display name, preferred language, home area, emergency contact name/phone, skills, charity interests, physical capability flags, meal/travel/unpaid support, blood type, blood/item donation preferences | `PATCH /api/v1/me/`, `PATCH /api/v1/me/charity-interests/`; `users`, `user_charity_interests`, `charity_fields` | **Present.** The master `is_willing_to_donate` value is derived from blood/items sub-preferences in the current mobile update payload. Preserve that server rule rather than inventing a conflicting independent switch. System IDs, phone/account status, verification status, coordinator status, roles and ratings are read-only. |
| `AvailabilityScreen` | Weekly weekday/time windows, valid-from/to dates, date exceptions, full-day blackout/partial slot, note, delete and conflict feedback | `GET/PUT /api/v1/me/availability/`, rules, exceptions and check-availability endpoints; `volunteer_availability_rules`, `volunteer_availability_exceptions` | **Present.** Confirm exact weekday numbering (1 Monday through 7 Sunday), 24-hour time and date validation remain consistent with the serializer. |
| `VerificationCoordinatorStatusScreen` | Verification status, selfie/license/driver-license slots, per-slot status and coordinator application note/status | `GET/POST /api/v1/me/verification-images/`, `GET/PATCH /api/v1/me/coordinator/`; `user_verification_images`, `users`, `coordinator_profiles` | **Partial / native upload deferred.** Three visual upload placeholders exist. A real image picker, file-size/type validation UX, multipart upload and per-file retry need a later device-tested native implementation. |
| `CoordinatorOverviewScreen` | Total/draft/active events, applications, accepted roster, checked-in today/all-time semantics, managed event links | `GET /api/v1/coordinator/events/`, event summary endpoints; `events`, `event_applications`, `assignments`, `attendance`, `v_event_summary` and related views | **Present.** Today count and all-time count must not be conflated; use server-returned metrics. |
| `CoordinatorEventsScreen` | Managed event list, status, owner/current coordinator, read-only monitor state, schedule and location | `GET /api/v1/coordinator/events/`; `events`, `coordinator_profiles`, summary views | **Present.** A separate full event editor is not yet linked from this list/detail UI. |
| `CoordinatorEventDetailScreen` | Lifecycle status, owner/coordinator, summary metrics, location/geofence config, schedule, applications/assignments/attendance links, event posts | Manager GET/PATCH `/api/v1/coordinator/events/{id}/`, summary, post list/create/update/close; `events`, `event_posts`, `event_applications`, `assignments`, `attendance`, `event_charity_fields` | **Improved in this branch.** Event-post view and create/edit/close form added. Manager-only config now comes from a protected BFF GET. **Remaining:** full event edit form and explicit screens for history/post capacity. |
| `CreateEventWizardScreen` | Basics/purpose/charity categories, location/coordinates/radius, geo enable/buffer/confirmation/provider, schedule/deadline MMT, acceptance/auto-assign/group/leader/capacity, support/compensation, onboarding/QR, review | `POST /api/v1/coordinator/events/`; `events`, `event_charity_fields` | **Improved in this branch.** Wizard fields now match the current BFF allow-list choices; geo buffer and map provider are editable. The UI is a preview/template for map/GPS, not a native rendered map. |
| `CoordinatorApplicationsScreen` | Application list/status/source/post/volunteer fields, decisions, waitlist and invitation form | Coordinator application list, decisions and invite endpoints; `event_applications`, `users`, `event_posts` | **Improved in this branch.** Invite UI supports exactly one of user ID or UUID, optional post ID and note. Accepted T2 fields are visible only when returned under the backend's accepted-applicant permission rules. |
| `CoordinatorAssignmentsScreen` | Assigned/unassigned applicants, selected post, manual group code and group-leader flag, auto/manual assignment result | Auto/manual assignment, assignments/unassigned endpoints; `assignments`, `event_applications`, `event_posts`, `events` | **Improved in this branch.** Removed hard-coded group code/leader values; added optional target post ID, group code and leader toggle. A post picker sourced from event posts is preferable to free-text ID for final UX. |
| `CoordinatorAttendanceScreen` | Attendance board/roster, method/status/time, manual note, pending geo confirmations, geo review actions, coordinator QR purpose/max-use/lifetime/create/revoke controls | Check-in BFF attendance and QR endpoints; `attendance`, `attendance_geo_attempts`, `qr_tokens`, `onboarding_acknowledgments`, attendance views | **Improved in this branch.** Manual note editable; QR create/revoke controls added with local mock token lifecycle. Real GPS capture/review and native QR scanning remain deferred or separately device-tested. |
| `SettingsScreen` | Theme, Template/HTTP selector, host/API diagnostics, session/logout and status messages | Local mode state; optional BFF ping only in HTTP Mode | **Improved in this branch.** Visible mock label changed to Template Mode. Template Mode does not require an API ping. |
| `FriendsScreen` / `FriendsPlaceholderScreen` | Navigation placeholder | No current BFF/database capability mapped | **Deferred / Coming Soon.** Do not create false contact or messaging data. |
| `EventsScreen`, `CoordinatorWorkspaceScreen` | Navigation/container/shortcut surfaces | Delegate to detailed feature screens | **Container/navigation.** Not separate business forms. |

### Field coverage conclusions

**Already broad in current forms:** profile editing, availability, event creation, coordinator application review, base assignment management, attendance board and status display. The existing form surfaces are not empty shells; they already have most of their primary fields.

**Newly improved in this branch:** Template Mode authentication, BFF-aligned event options, editable geo opening buffer/provider, event-post form and full post payload, manager-only event configuration read, invitation by ID/UUID, configurable manual assignment fields, attendance note and QR controls.

**Still needed for complete mobile workflow parity:** full event edit, event coordinator history, post capacity detail, volunteer attendance history, feedback/history screens, coordinator event handover/retake UI, image-picker integration, and native QR/GPS/map presentation. The BFF already has a number of these endpoints; their absence from the UI does not automatically imply a missing backend endpoint.

---

## 3. BFF route capability matrix

All route templates below are under `/api/v1/`, unless explicitly stated. The project includes some compatibility aliases; the canonical paths below are the currently used business route families. The BFF package is mounted through `backend/bff/urls.py`.

### 3.1 Authentication

| Capability | BFF route | Behaviour and database responsibility | Mobile state |
|---|---|---|---|
| Tokenized OTP request | `POST /auth/tokenized/request-otp/` | Normalizes phone, creates OTP/challenge through SQL routines, post-commit delivery adapter | HTTP Mode uses this. Template Mode now stays local. |
| Tokenized OTP verify | `POST /auth/tokenized/verify-otp/` | Verifies challenge token/code, consumes challenge and issues DRF token | HTTP Mode uses this. Template Mode verifies local code only. |
| Legacy OTP request/verify | `POST /auth/otp/request/`, `POST /auth/otp/verify/` | Backward-compatibility paths | Keep out of new mobile UI flow; legacy fallback exists in HTTP UserContext and should be retired after migration testing. |
| Logout | `POST /auth/logout/` | Revokes server token/session | HTTP Mode. Template mode clears local auth state. |

**Important:** the current backend's configurable SMS adapter does not perform a genuine external network call. A successful response must not be presented as handset delivery until a real provider adapter and delivery evidence exist.

### 3.2 Volunteer/self-service BFF

| Capability | Route family | Database-backed entities | Mobile surface |
|---|---|---|---|
| Charity taxonomy | `GET /charity-fields/` | `charity_fields` | Discovery filters/profile interests |
| Public event browse/detail/posts | `GET /events/`, `GET /events/{id}/`, `GET /events/{id}/posts/` | `events`, `event_posts`, `event_charity_fields`, `v_public_events` | Discovery/detail |
| Own bootstrap/profile | `GET /me/bootstrap/`, `GET/PATCH /me/` (profile alias also exists) | `users`, related read views | Dashboard/profile/edit |
| Charity interests | `PATCH /me/charity-interests/` | `user_charity_interests`, `charity_fields` | Profile edit |
| Volunteer lookup | `GET /users/by-uuid/{uuid}/` | `users` | Not a primary volunteer screen; coordinator lookup use case |
| Availability | `GET/PUT /me/availability/`, rules, exceptions and conflict-check routes | `volunteer_availability_rules`, `volunteer_availability_exceptions`, `events` | Availability |
| Verification | `GET/POST /me/verification-images/` | `user_verification_images`, `users` | Status screen; native picker deferred |
| Coordinator application/status | `GET/PATCH /me/coordinator/`, `POST /coordinator/apply/` | `coordinator_profiles`, `users` | Verification/coordinator status |
| Apply/withdraw | `POST /events/{id}/apply/`, `GET /me/applications/`, `POST /applications/{id}/withdraw/` | `event_applications`, `event_posts`, `events` | Discovery/detail/my applications |
| Own assignments | `GET /me/assignments/`, confirm/cancel routes | `assignments`, `event_applications` | My assignments |
| Feedback | `GET /me/feedback/summary/`, `GET/POST /feedback/` | `feedback`, `attendance`, `events` | Partial; submit is surfaced from assignment flow, full feedback history/summary view is still needed |

### 3.3 Coordinator BFF

The coordinator URL package is included below `/api/v1/coordinator/`. The code contains both `coordinator/events/` and compatibility aliases such as `events/`.

| Capability | Route family (suffix after `/api/v1/coordinator/`) | Database-backed entities | Mobile surface |
|---|---|---|---|
| Coordinator application | `apply/` | `coordinator_profiles`, `users` | Verification/coordinator status |
| Managed events | `coordinator/events/` | `events`, `coordinator_profiles`, summary views | Coordinator events/overview |
| Manager event configuration GET/PATCH | `coordinator/events/{id}/` | `events`, `event_charity_fields` | Detail reads manager-only config; full edit UI missing |
| Event summary | `coordinator/events/{id}/summary/` | `v_event_summary`, `event_applications`, `assignments`, `attendance` | Overview/detail |
| Create/update event | POST/PATCH event routes | `events`, `event_charity_fields` | Create wizard present; full edit UI missing |
| Lifecycle | `events/{id}/publish|activate|complete|cancel/` | `events`, audit/trigger logic | Detail status controls |
| Coordinator handover/retake/history | `events/{id}/handover/`, `retake/`, history GET | `events`, `event_coordinator_history`, `coordinator_profiles` | Handover/retake/history screen not yet complete |
| Event posts | `coordinator/events/{id}/posts/`, `posts/{post_id}/`, `posts/{post_id}/close/` | `event_posts`, `v_event_post_capacity` | Create/edit/close UI added; capacity detail remains to add |
| Invitations | `coordinator/events/{id}/invite/` | `event_applications`, `users`, `event_posts` | Invite form added |
| Application review | event applications and accept/reject/waitlist routes | `event_applications`, `users`, `event_posts` | Present |
| Assignment | `events/{id}/auto-assign/`, `manual-assign/`, `assignments/`, `unassigned/` | `assignments`, `event_applications`, `event_posts` | Present; manual parameters now editable |
| Post capacity | `events/{id}/post-capacity/` | `v_event_post_capacity`, `event_posts`, `assignments` | Repository/API surface; dedicated capacity detail absent |
| Coordinator feedback | `coordinator/feedback/` | `feedback`, `events` | No standalone feedback-management screen identified |

### 3.4 Check-in, QR, attendance and onboarding BFF

The check-in package is included under `/api/v1/checkin/`.

| Capability | Route family (suffix after `/api/v1/checkin/`) | Database-backed entities | Mobile surface |
|---|---|---|---|
| Onboarding content/status/ack | `events/{id}/onboarding/`, `status/`, `acknowledge/` | `events`, `onboarding_acknowledgments` | My assignment flow has acknowledgement entry; detailed status UX needs parity test |
| QR resolve/redeem | `qr/resolve/`, `qr/redeem/` | `qr_tokens`, `event_applications`, `attendance` | Manual token field or QR token entry; native scanner deferred |
| Coordinator QR create/revoke | `coordinator/events/{id}/qr-tokens/`, `coordinator/qr-tokens/{id}/revoke/` | `qr_tokens`, `events` | Create/revoke UI added to coordinator attendance |
| QR/manual/geo check-in | `attendance/qr-checkin/`, `attendance/manual-checkin/`, `attendance/geo-checkin/` and event aliases | `attendance`, `qr_tokens`, `attendance_geo_attempts` | Attendance/manual note present; native GPS and scanner deferred |
| Checkout | `attendance/{attendance_id}/checkout/` and event alias | `attendance` | My assignment/check-in flow; verify full UI field coverage |
| Own attendance history | `me/attendance/` | `attendance`, `events` | BFF exists; dedicated volunteer history presentation is missing |
| Coordinator attendance board/roster | `coordinator/events/{id}/attendance/`, `attendance/roster/` | `attendance`, `assignments`, `v_event_checkin_board`, `v_event_checkin_status` | Coordinator attendance |
| Pending confirmations and geo attempts | `attendance/pending/`, `geo-attempts/`, confirm/reject | `attendance_geo_attempts`, `attendance`, `v_pending_confirmations`, `v_geo_attempts_review` | Coordinator attendance |
| Feedback submission/list | `events/{id}/feedback/`, `feedback/list/`, `me/feedback/` | `feedback`, `events`, `attendance` | Submission UI partial; list/history screen needed |

---

## 4. Database business entity coverage

The mobile app should model user tasks and API contracts, not mirror every SQL table. This section maps the principal Django database-first models to the BFF domains.

| Database entity/table or view | Business purpose | BFF coverage | Mobile/admin destination |
|---|---|---|---|
| `users` | Volunteer identity, profile, account state, capabilities, preferences | Self profile/bootstrap, coordinator cards, admin user API | Profile, edit profile, coordinator applicant cards; admin user management remains web |
| `charity_fields` | Event/profile interest taxonomy | Public taxonomy | Event discovery and profile |
| `user_charity_interests` | Volunteer charity interests | Profile interests | Profile edit |
| `volunteer_availability_rules` | Weekly recurring availability | Availability API | Availability |
| `volunteer_availability_exceptions` | Date-level availability overrides/blackouts | Availability API | Availability |
| `coordinator_profiles` | Coordinator application/approval state | Coordinator self service, admin approval | Verification/coordinator status; admin approval web |
| `events` | Event details, dates, location, geofence, support, onboarding and lifecycle | Public event browse/detail and manager event CRUD | Discovery, detail, coordinator event wizard/detail |
| `event_charity_fields` | Event-to-category relation | Event serializers | Discovery/detail/create wizard |
| `event_posts` | Volunteer roles/headcount/requirements/priority | Public and coordinator post routes | Event detail and coordinator post editor |
| `event_applications` | Volunteer application and coordinator decisions | Volunteer application and coordinator review routes | My Applications / Coordinator Applications |
| `assignments` | Accepted volunteer assignment, group, schedule and attendance link | Volunteer assignment, coordinator assignment routes | My Assignments / Coordinator Assignments |
| `event_coordinator_history` | Owner/current coordinator changes and reasons | Coordinator history route | History screen planned; admin audit also available |
| `qr_tokens` | Walk-in/join/check-in token lifecycle | QR resolve/redeem/create/revoke | Coordinator QR controls; volunteer token redemption |
| `attendance` | Check-in/checkout status, method and timestamps | Manual/QR/geo check-in, roster, history | Volunteer assignment and coordinator attendance |
| `attendance_geo_attempts` | Geofence telemetry/review state | Geo attempt and confirmation routes | Coordinator attendance; native GPS UX deferred |
| `onboarding_acknowledgments` | Volunteer acknowledgement of event briefing/version | Onboarding routes | My Assignments |
| `user_verification_images` | Verification image metadata and review state | Volunteer upload/list and admin review/stream endpoints | Mobile status placeholders/upload future; admin review web |
| `feedback` | Volunteer and event feedback | Self/coordinator/event feedback APIs | Feedback submit/history; separate full screen incomplete |
| `audit_logs` | Audit trail for sensitive/admin/business actions | Admin audit API | Admin web portal only |
| `moderation_actions` | Moderation and event/user administrative actions | Admin moderation API/services | Admin web portal only |
| `app_settings` | System-level business configuration used by SQL functions | Admin settings/maintenance path where appropriate | Admin web portal only; do not expose arbitrary settings to mobile |
| `v_public_events`, `v_event_summary`, `v_event_post_capacity` | Read-optimized public/coordinator event data | Event browse/detail/summary/capacity routes | Event lists, coordinator overview, capacity UI to add |
| `v_event_checkin_board`, `v_event_checkin_status`, `v_pending_confirmations`, `v_geo_attempts_review` | Attendance and geo review projections | Check-in BFF | Coordinator attendance |
| `v_event_coordinator_history` | Coordinator handover/retake read projection | Coordinator history route | History screen planned |
| `v_user_moderation_summary`, `v_admin_dashboard` | Admin reporting/monitoring | Admin portal APIs | Admin web portal only |

### Database tables intentionally not exposed as mobile CRUD

- `auth_otp` and `auth_otp_challenge` are service-owned security records. Mobile calls the OTP API contract and must not read/write these tables directly.
- Django auth/session/content-type/permission/migration infrastructure tables are platform internals, not mobile feature data.
- Audit, moderation and administrative configuration entities stay behind admin authorization.
- SQL triggers/functions/views remain database-owned rules. Mobile forms must not imitate or override their decisions.

---

## 5. BFF implementation completeness assessment

### 5.1 Implemented domains

The current BFF has route and service coverage for the main volunteer and coordinator business domains:

- Authentication challenge and token issuance.
- Public event discovery, detail and event posts.
- Volunteer bootstrap/profile/interests.
- Availability weekly rules, date exceptions and schedule conflict checks.
- Identity verification metadata/upload endpoint.
- Coordinator application and coordinator authority status.
- Volunteer event applications, invitation responses, withdrawal.
- Coordinator event CRUD/lifecycle, posts, invites, application decisions, auto/manual assignment, assignment roster, handover/retake/history and post capacity.
- Volunteer assignment confirm/cancel.
- Onboarding acknowledgement.
- QR resolve/redeem and coordinator QR create/revoke.
- Manual/QR/geo check-in, checkout, attendance history, coordinator roster, pending confirmation and geo-attempt review.
- Feedback submission and read endpoints.
- Separate admin portal for user/event/feedback moderation, verification review, audit and system settings.

### 5.2 BFF work required by this template phase

1. **Manager-scoped event configuration read:** added in this feature branch. Internal geofence/assignment settings are not part of the public event-detail serializer. The new manager GET uses event-manager authorization.
2. **Event-post priority read:** added to the read projection and public post serializer because the database model already owns the priority value and the editor needs to render it.
3. **Do not create extra BFF routes just to support UI placeholders** when a suitable route exists. Add endpoints only after a route/serializer/service/table trace demonstrates a real missing backend operation.
4. **Provider integration remains incomplete:** current `ConfigurableSmsOtpDeliveryAdapter` is a provider-neutral stub and does not issue external HTTP requests or parse provider receipts. A real provider requires a selected vendor API contract and credentials.
5. **Native maps and GPS presentation:** BFF supports geolocation/tiles, but the mobile app does not have a native map component dependency in its current package. Template map preview is not proof of native map support.

### 5.3 Admin portal boundary

The Django admin portal is a separate authorized web surface. It owns:
- user moderation and provision,
- event moderation,
- feedback moderation,
- audit review,
- verification-image review/streaming,
- settings and maintenance,
- map catalog/sync and operational controls.

Do not add those privileged controls to volunteer mobile forms. Mobile coordinator authority is not equivalent to super-admin authority.

---

## 6. Contract invariants for every mobile template

Every editable field in a mobile form must have an entry in the implementation contract with:
1. Screen and section.
2. Visible label and helper text.
3. Domain field name.
4. DTO field name.
5. BFF route and serializer field.
6. Accepted type, allowed choices, min/max and nullable/optional behaviour.
7. Owning service and existing database entity (read mapping only).
8. Mock fixture default and local validation.
9. Read-only/derived/permission classification.
10. Loading, empty, validation, success, conflict, permission and network error states.

Rules:
- Unknown values remain null/unknown. Do not substitute fake coordinates, phone, counts or owner IDs.
- Every status badge, count, rating, permission result, attendance timestamp and computed capacity is server-owned in HTTP Mode.
- Show which inputs are required, optional, derived or read-only.
- Date/time request values must be offset-aware ISO timestamps. The create wizard displays and interprets Myanmar Time (UTC+06:30).
- Choice values must exactly match BFF serializers. Never translate a different user choice into a similar enum behind the scenes.
- Template Mode may create fixture IDs/timestamps and update local state, but visible copy must say the data is local/demo.
- HTTP Mode success messages appear only after a successful BFF response.
- An HTTP failure must never fall through to mock fixtures.
- T2 volunteer capabilities (health-related capability/preference fields) appear only in the coordinator-authorized context the BFF returns for accepted applicants.
- Never show raw OTP, auth session token, DRF token, private verification file path or privileged admin data.

---

## 7. Outstanding mobile implementation backlog

| Priority | Work item | Existing backend support | Required mobile work / acceptance |
|---|---|---|---|
| P0 | Full edit-event workflow | Event PATCH serializer/route and `CoordinatorRepository.updateEvent` contract exist | Add an edit mode/route using a partial mapper that sends only fields explicitly changed. Current HTTP method uses a create mapper cast on a partial draft; correct that before using it for an edit form. |
| P0 | HTTP event edit mapper | BFF `EventUpdateSerializer` | Add a dedicated partial mapping function, avoid injecting false/default values for omitted properties, test null vs omitted semantics. |
| P1 | Coordinator event history | History GET endpoint and DTO/mapper exist | Add event detail section or history screen showing change type, previous/current coordinator, actor, reason and timestamp. |
| P1 | Event-post capacity detail | Post-capacity BFF route, repository/DTO surfaces exist | Add per-post capacity/reservation display and refresh after assignments/decisions. |
| P1 | Volunteer attendance history | `GET /api/v1/checkin/me/attendance/` | Add a read-only history screen/section with event, method, status, time and checkout metadata. |
| P1 | Feedback history/summary | Self feedback endpoints and feedback model exist | Add volunteer feedback summary/history and coordinator feedback screen where the role is authorized. |
| P1 | Coordinator handover/retake | BFF endpoints and repository methods exist | Add forms for destination coordinator/UUID or ID, reason, confirmation and ownership state. |
| P1 | T2 user lookup control | UUID lookup endpoint and profile repository contract exist | Expose lookup from invite/review flow with privacy-safe user display and no raw private profile access. |
| P2 | Verification image picker/upload | `POST /api/v1/me/verification-images/` accepts multipart image and type | Add native picker/camera dependency, upload progress/retry, size/type validation and a privacy-safe preview; device-test on Android/iOS. |
| P2 | QR scanner | Resolve/redeem endpoints exist | Add camera permission, scanner component, invalid/expired/redeemed states and physical device tests. |
| P2 | Native map | Backend map tile service exists; no native map dependency in current mobile package | Choose renderer/tiles approach, implement markers/polygons and offline/cache handling; do not reuse admin Leaflet JS directly as React Native native map. |
| P2 | Native GPS/geofence check-in | Geo check-in and location provider contract exist | Wire actual GPS capture/permission, accuracy/mock flag, retry and consent UX; keep mock location labelled in template previews. |
| P2 | My feedback write UX | Event feedback endpoint exists | Add star/rating/comment and submit-state UI where assignment/attendance eligibility permits. |
| Deferred | Friends/messaging | No active mobile BFF feature mapped | Keep Coming Soon; do not simulate actual communication with local fake users. |

---

## 8. Local verification plan — safe with the database freeze

The attached `v0_12_0_local_demonstration_runbook.md` is the authority for the user's local Windows/PG18.6 setup. Follow its non-migrating path.

### Template-only checks (must not contact the BFF)

- [ ] Start the React Native app with default Template Mode.
- [ ] Verify screen navigation for volunteer and coordinator personas.
- [ ] Change profile fields and confirm local fixture state updates.
- [ ] Add/edit/delete weekly availability rules and date exceptions.
- [ ] Walk every event wizard step; verify supported choices and optional fields.
- [ ] Create/edit/close event posts and confirm the coordinator event detail refreshes from mock state.
- [ ] Invite by ID and by UUID, verifying exactly-one-identifier validation.
- [ ] Manual assignment form accepts optional post/group and group-leader selection.
- [ ] Manual check-in note and local QR token create/revoke controls work in mock state.
- [ ] Use demo OTP `123456`; incorrect code errors; correct code enters the local app.
- [ ] Inspect network logs or a mocked transport assertion to prove that Template Mode sends no requests to Django.

### Local source checks before any HTTP data mode

Run with the local Python virtual environment and `PYTHONPATH=backend`, exactly as described in the runbook:
- Django non-migrating `manage.py check`.
- Start local `runserver` after check passes.
- React Native TypeScript check and Jest.
- Build an explicit route smoke list for BFF GET operations only.
- Review API errors and response DTOs against the matrix; do not seed or migrate.

### Database freeze prohibitions

Do not execute on `volunteer_coordination_db`:
- Django migrate/makemigrations.
- canonical schema SQL/bootstrap, self-test or migration SQL.
- `scripts/alter_local_db.py`.
- `scripts/seed_integration_fixtures.py`.
- tests that create, update, truncate, delete, or otherwise mutate business records.
- OTP request smoke tests (OTP issue persists challenge records).
- real image upload or conversion tests.
- coordinator write flows unless an approved test account and operator-controlled demonstration are explicitly authorized.

Read-only HTTP GET checks can be performed later after verifying the route and permission contract, but this phase does not claim any local runtime result.

---

## 9. Definition of “Template Mode complete”

Template Mode can be considered ready for a user-facing UI review when:
- Every existing mobile screen is reachable and has representative fixtures for populated, empty, loading and error states.
- Every editable field currently represented by the BFF has a form control with exact labels, defaults and validation.
- No event or post form offers values the BFF rejects.
- Every new mock mutation updates local repository state consistently across the relevant screens.
- Mock repositories enforce the same role/monitor-mode rules as the BFF wherever a corresponding write exists.
- Template OTP is local, labelled, and has no network side effect.
- Location/map/GPS/image/QR-scanner placeholders are clearly described as placeholders.
- DTOs, mappers and mock/http repository contracts remain aligned.
- No migrations, schema SQL or existing database changes are required.
- The local TypeScript/Jest and non-migrating backend checks pass.

HTTP Mode should be enabled only after these criteria and the local runbook preflight have been completed. The current phase intentionally stops before writing against the frozen PostgreSQL database.
