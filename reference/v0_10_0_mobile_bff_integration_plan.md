# v0.10.0 — Mobile Backend & Django BFF Integration Plan
## A presentation-oriented mobile data layer over the existing authoritative backend

**Document type:** Implementation plan  
**Target:** Volunteer Coordination System — React Native Workshift mobile application  
**Backend contract baseline:** Django BFF / PostgreSQL v0.6.0  
**Plan version:** v0.10.0  
**Scope:** Mobile-side backend, API integration, data adaptation, and UI-facing state delivery  
**Database policy:** Strictly non-invasive — no schema or data-model changes

---

# 1. Purpose and architectural decision

The purpose of v0.10.0 is to establish a reliable mobile-side backend layer that connects the existing React Native UI to the existing Django BFF.

The immediate problem is not that the PostgreSQL database needs to be redesigned. The problem is that the mobile UI has inconsistent data requirements, presentation models, screen workflows, and mock data assumptions. The mobile application therefore needs a deliberate integration layer that can receive BFF responses, normalize them into consistent mobile domain models, compose screen-ready data, and expose predictable repository contracts to the UI.

**The mobile side must not replicate the PostgreSQL database.** It owns a mobile application model and presentation-facing data orchestration layer, not a second persistent business database.

The existing Django BFF, backend services, PostgreSQL schema, database functions, triggers, constraints, permissions, and operational workflows remain authoritative and unchanged by this plan.

## 1.1 Target architecture

```text
┌───────────────────────────────────────────────────────────┐
│                    React Native UI                         │
│ Screens · Components · Navigation · Forms · View State     │
└──────────────────────────────┬────────────────────────────┘
                               │ consumes UI-facing models
                               ▼
┌───────────────────────────────────────────────────────────┐
│              Mobile Application / Presentation Layer       │
│ Feature Controllers / Hooks / View Models                  │
│ Screen State · Loading · Empty · Error · Refresh           │
└──────────────────────────────┬────────────────────────────┘
                               │ feature repository contracts
                               ▼
┌───────────────────────────────────────────────────────────┐
│                 Mobile Data / Application Layer            │
│ Use Cases · Repository Implementations · Screen Queries    │
│ Mock Repositories              HTTP Repositories            │
└──────────────────────────────┬────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────┐
│                  Mobile API Integration Layer              │
│ API Client · Endpoint Modules · Request/Response DTOs      │
│ DTO Validation · Mappers · Error Normalization             │
│ Secure Token Store · Pagination · Request Policies         │
└──────────────────────────────┬────────────────────────────┘
                               │ HTTPS / JSON
                               ▼
┌───────────────────────────────────────────────────────────┐
│                    Django BFF (Existing)                   │
│ Authentication · Authorization · T0–T4 Filtering           │
│ Composite Screen Responses · Validation · Service Routing  │
└──────────────────────────────┬────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────┐
│              Existing Backend Services / Common           │
│ Workflow Orchestration · Permissions · DB Context          │
└──────────────────────────────┬────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────┐
│             Existing PostgreSQL Database (v0.6.0)          │
│ Tables · Views · Functions · Triggers · Constraints        │
└───────────────────────────────────────────────────────────┘
```

## 1.2 Responsibility boundaries

| Layer | Responsibility | Must not do |
|---|---|---|
| React Native UI | Render screens, collect input, display state | Call endpoints directly or know database structures |
| Feature View Model / Controller | Coordinate screen loading, refresh, user actions and UI state | Contain SQL rules or raw HTTP logic |
| Use Cases / Application Services | Coordinate one mobile user intention across repositories | Reimplement backend workflow decisions |
| Repository Contract | Define feature-facing operations | Expose URL paths, headers or wire DTOs |
| HTTP Repository | Call BFF and map responses into mobile domain models | Change backend business meaning |
| Mock Repository | Supply deterministic data for development and tests | Become an alternative production authority |
| API Client | Transport, auth headers, timeout, parsing, cancellation and error handling | Decide feature workflow outcomes |
| DTO Layer | Describe exact BFF request/response JSON | Become UI models or database entities |
| Mapper Layer | Convert BFF DTOs to stable mobile domain models | Invent missing values or hide contract drift |
| Django BFF | API contract, authentication, permissions, privacy filtering and response composition | Become a mobile UI implementation |
| Existing services / PostgreSQL | Authoritative workflows and persistence | Be modified as part of this mobile integration plan |

---

# 2. Scope, exclusions and safety constraints

## 2.1 In scope

1. Inspect and preserve the existing React Native project structure.
2. Define a consistent mobile domain model independent of database tables.
3. Define BFF request and response DTOs based on the actual API contract.
4. Implement one shared API client and endpoint modules.
5. Implement authentication token storage and request lifecycle.
6. Implement explicit DTO-to-domain mappers.
7. Retain existing repository contracts and mock implementations where practical.
8. Add HTTP-backed repository implementations.
9. Add screen-oriented query/use-case orchestration where the UI needs combined data.
10. Normalize API errors and screen loading/empty/error states.
11. Integrate existing screens incrementally without redesigning their UI.
12. Verify that the existing backend and database remain unchanged.

## 2.2 Explicitly out of scope

- Creating, altering, dropping, renaming or migrating PostgreSQL tables, columns, indexes, constraints, triggers, functions or views.
- Running the database bootstrap or seed scripts.
- Changing the v0.6.0 database schema or existing database records for mobile convenience.
- Rewriting existing backend business workflows.
- Replacing the Django BFF with a second mobile server.
- Direct mobile-to-PostgreSQL connections.
- Duplicating PostgreSQL table relationships in TypeScript.
- Moving authoritative business rules into React Native.
- Rewriting the UI, navigation, theme, or visual design as part of API integration.
- Introducing offline write synchronization or a local replicated database in this version.
- Changing existing endpoint semantics without a separately approved BFF contract change.

## 2.3 Database and backend protection policy

This is a mobile integration project, not a database evolution project.

**Allowed without database changes:**
- New TypeScript interfaces and domain models.
- New DTOs, mappers, repository adapters, API client modules and UI query services.
- Mobile-only derived/computed display values.
- Mobile-side caching of safe, already-authorized read responses where explicitly approved.
- Mock fixtures and test fixtures.
- BFF response composition changes only when separately approved, backward-compatible, and not changing database behavior.

**Not allowed in this plan:**
- Editing SQL files or Django models to make mobile mapping easier.
- Adding a database column because a screen expects a field.
- Changing a trigger/function to fit mobile UI behavior.
- Treating a mobile domain model as a required database structure.
- Sending client-calculated status or role values as authoritative input.

If a required UI field is not present in the existing BFF response, record it as an API contract gap. First determine whether it can be derived safely from already-returned data. If it cannot, raise a separate BFF contract proposal. That proposal must prove backward compatibility and must not assume a database change. If the field truly requires a database change, it is outside v0.10.0 and needs a separate versioned decision.

## 2.4 Non-negotiable invariants

1. Existing screens and navigation continue to work.
2. Mock mode remains runnable throughout integration.
3. HTTP mode is enabled by dependency injection/configuration, not by rewriting feature screens.
4. No UI component imports the shared HTTP client or endpoint modules directly.
5. No mobile code imports or mirrors PostgreSQL schema definitions.
6. The BFF is the sole mobile data source for persisted system information.
7. The server derives actor identity and authorization from the authenticated token.
8. The client never decides that a protected operation is permitted.
9. The client never treats an optimistic write as confirmed persisted state.
10. No automatic retry of non-idempotent actions after an ambiguous timeout.
11. No secrets, tokens, phone numbers, emergency contacts or sensitive payloads in logs.
12. Every integrated feature can be switched back to its mock repository.

---

# 3. Existing-system discovery before implementation

The implementation agent must inspect the actual repository before creating a target folder structure.

## 3.1 Mobile inspection

Inspect:

- `mobile/package.json` and lockfile.
- TypeScript configuration and path aliases.
- Current `src/` directory tree.
- Navigation and route definitions.
- Existing screens and feature modules.
- Current domain/model/type definitions.
- Existing repository interfaces and mock repositories.
- Existing API utilities, fetch/Axios usage, token handling and environment configuration.
- State management approach already used by the project.
- Existing tests, lint and build scripts.
- Android manifest, network security configuration and build variants.

Produce a mapping report with:
- Existing path.
- Current responsibility.
- Whether it is retained, extended, adapted or left untouched.
- Proposed integration point.
- Risk of breaking imports or current behavior.

Do not create a parallel architecture if an equivalent abstraction already exists. Adapt the existing structure.

## 3.2 Backend/BFF inspection

Read the actual registered Django routes, serializers, permissions, service calls and OpenAPI schema. Do not rely only on planning documents.

For each endpoint record:
- HTTP method and exact path.
- Authentication requirement.
- Request JSON/query parameters.
- Success response JSON.
- Error response JSON and status codes.
- Pagination format.
- Privacy tier and field visibility.
- Whether the operation is read-only or mutating.
- Whether the endpoint is currently implemented and tested.
- Whether the response is a single resource or a composite screen payload.

The v0.6.0 architecture document is the intended contract reference; the running code and generated schema establish implementation reality. Any mismatch must be recorded before mobile DTOs are written.

## 3.3 Baseline freeze

Before code changes:
- Record current Git branch and commit.
- Record working-tree status.
- Run current mobile tests, TypeScript check, lint and Android debug build.
- Run relevant backend tests without modifying the database.
- Record existing screen behavior in mock mode.
- Record the database identity/version and confirm no schema operation is planned.

**Gate 0:** A discovery report exists, current app runs in its existing mode, and no database/backend behavior has been changed.

---

# 4. Mobile-side target structure

The following is a logical target. Merge it into the actual project structure rather than blindly creating duplicate folders.

```text
mobile/src/
├── app/
│   ├── providers/
│   │   ├── AppProviders.tsx
│   │   └── RepositoryProvider.tsx
│   ├── navigation/
│   └── configuration/
│       ├── appConfig.ts
│       └── dataMode.ts
│
├── core/
│   ├── api/
│   │   ├── apiClient.ts
│   │   ├── apiConfig.ts
│   │   ├── apiError.ts
│   │   ├── apiResult.ts
│   │   ├── requestPolicy.ts
│   │   └── interceptors/
│   ├── auth/
│   │   ├── tokenStore.ts
│   │   └── sessionManager.ts
│   ├── errors/
│   ├── logging/
│   └── utilities/
│
├── data/
│   ├── dto/
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── availability/
│   │   ├── events/
│   │   ├── applications/
│   │   ├── assignments/
│   │   ├── coordinator/
│   │   ├── onboarding/
│   │   ├── qr/
│   │   └── attendance/
│   ├── mappers/
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── events/
│   │   ├── applications/
│   │   ├── assignments/
│   │   └── attendance/
│   ├── endpoints/
│   │   ├── authApi.ts
│   │   ├── profileApi.ts
│   │   ├── availabilityApi.ts
│   │   ├── eventApi.ts
│   │   ├── applicationApi.ts
│   │   ├── coordinatorApi.ts
│   │   ├── onboardingApi.ts
│   │   ├── qrApi.ts
│   │   └── attendanceApi.ts
│   └── repositories/
│       ├── contracts/
│       ├── mock/
│       └── http/
│
├── domain/
│   ├── models/
│   ├── repositories/
│   ├── usecases/
│   └── valueObjects/
│
├── features/
│   ├── auth/
│   ├── home/
│   ├── events/
│   ├── myRoster/
│   ├── profile/
│   ├── availability/
│   ├── coordinator/
│   ├── onboarding/
│   ├── qr/
│   └── attendance/
│
└── shared/
    ├── components/
    ├── hooks/
    └── types/
```

## 4.1 Naming and import rules

- `dto/` contains API wire types only.
- `domain/models/` contains mobile application concepts only.
- `mappers/` is the only place that translates wire representations into domain representations.
- `endpoints/` contains endpoint-specific transport functions and DTO typing.
- `repositories/http/` implements feature-facing repository contracts using endpoint modules and mappers.
- `repositories/mock/` implements the same contracts with deterministic fixtures.
- `features/` contains screen-facing orchestration and UI.
- `core/api/` is the only shared transport implementation.

Avoid duplicate concepts such as `EventDTO` being imported directly by screens. Screens consume domain models or explicit view data.

---

# 5. Data contract strategy: three separate models

The system intentionally has three different data representations.

| Representation | Purpose | Example |
|---|---|---|
| PostgreSQL schema | Persistent storage and integrity | `events`, `event_posts`, `event_applications` |
| BFF DTO | Network contract | JSON returned by `GET /api/v1/events/` |
| Mobile domain model | Application meaning needed by mobile | `EventSummary`, `EventDetail`, `ShiftCard` |

They are not expected to be identical.

## 5.1 DTO rules

- Match actual JSON field names and types.
- Mark optional and nullable fields accurately.
- Preserve server status strings without silently coercing unknown values.
- Include pagination metadata if the BFF returns it.
- Do not add properties because a screen would like to have them.
- Keep request DTOs separate from response DTOs.
- Never include protected fields in a client request unless the BFF explicitly accepts them.
- Validate external JSON at the API boundary when practical (for example, with the validation library already used by the project).

## 5.2 Domain model rules

Mobile domain models should describe meaningful mobile concepts, not database rows.

Example:

```ts
export interface EventSummary {
  id: string;
  title: string;
  purpose: EventPurpose;
  location: EventLocationSummary;
  schedule: EventSchedule;
  capacity: EventCapacitySummary;
  status: EventStatus;
  support: EventSupportSummary;
}

export interface EventDetail extends EventSummary {
  description: string;
  posts: EventPostSummary[];
  applicationDeadline: string | null;
  onboarding: OnboardingSummary | null;
}

export interface EventCapacitySummary {
  maximum: number | null;
  assigned: number;
  remaining: number | null;
}
```

This is illustrative. Final fields must be derived from the actual BFF response, not assumed to exist.

## 5.3 Mapper rules

Each mapper must:
- Convert API identifiers consistently.
- Parse date/time values without losing timezone information.
- Preserve decimal precision where relevant.
- Normalize null/optional values explicitly.
- Map known server statuses to mobile domain unions.
- Handle unknown future status values safely without pretending they are a known state.
- Convert nested DTOs into nested domain objects.
- Avoid hidden fallback values that make invalid API responses look valid.
- Be unit tested independently.

Example:

```ts
export function mapEventSummary(dto: EventSummaryDto): EventSummary {
  return {
    id: String(dto.event_id),
    title: dto.title,
    purpose: mapEventPurpose(dto.purpose_type),
    location: {
      name: dto.location_name,
      landmark: dto.landmark_text ?? null,
    },
    schedule: {
      startsAt: dto.start_at,
      endsAt: dto.end_at,
    },
    capacity: mapEventCapacity(dto),
    status: mapEventStatus(dto.status),
    support: mapEventSupport(dto),
  };
}
```

Do not copy this example as a final mapper until the real serializer fields have been confirmed.

---

# 6. API client and transport design

## 6.1 One shared API client

Create one configured client with:
- Base URL from environment configuration.
- `/api/v1/` prefix applied exactly once.
- JSON request/response handling.
- `Authorization: Token <key>` for authenticated requests.
- Request timeout.
- Abort/cancellation support where supported by the current networking library.
- Consistent error parsing.
- Safe request identifiers for diagnostics.
- No sensitive request/response body logging.

Do not create one Axios/fetch instance per feature.

## 6.2 Environment configuration

Support at least:
- Local Android emulator.
- Physical Android device on the same LAN.
- Local iOS simulator if supported by the existing project.
- Staging HTTPS environment.

The Android emulator normally reaches a host development server through `10.0.2.2`; a physical device uses a reachable development-machine LAN address or a configured tunnel. These are environment values, never hard-coded feature constants.

Do not commit secrets or production tokens. Cleartext HTTP, if needed for local development, must be debug-only and narrowly scoped.

## 6.3 Authentication lifecycle

The existing BFF contract uses DRF token authentication:

```http
Authorization: Token <key>
```

Mobile requirements:
1. OTP request and verification use the existing BFF endpoints.
2. Store the returned token using the secure storage mechanism already supported by the app/platform.
3. Attach the token through the shared client.
4. Keep token access behind `TokenStore`; features must not read storage directly.
5. On confirmed logout, clear the token and session state.
6. On definitive authentication failure, invalidate local session and route through the existing auth flow.
7. Do not clear the token for ordinary `403`, `404`, `409`, offline or timeout responses.
8. Never print the token or include it in crash reports.
9. Do not assume OTP delivery is real SMS unless the backend deployment is configured for it.

## 6.4 Error normalization

Normalize transport and BFF errors into one mobile error contract:

```ts
export type AppError =
  | { kind: "network"; retryable: boolean }
  | { kind: "timeout"; retryable: boolean }
  | { kind: "unauthorized" }
  | { kind: "forbidden"; code: string; message: string }
  | { kind: "notFound"; code: string; message: string }
  | { kind: "validation"; code: string; message: string; fields?: Record<string, string[]> }
  | { kind: "conflict"; code: string; message: string }
  | { kind: "rateLimited"; code: string; message: string }
  | { kind: "server"; code?: string; message: string }
  | { kind: "unknown"; message: string };
```

Preserve backend machine-readable error codes such as `capacity_full`, `schedule_conflict`, `owner_monitor_read_only`, `onboarding_required`, `qr_token_invalid`, and `otp_rate_limited`.

The UI may translate these into friendly text, but must not reinterpret them as successful operations.

## 6.5 Retry and mutation policy

- GET requests may be retried selectively for transient network failures.
- Do not automatically retry POST/PATCH/PUT/DELETE after a timeout unless the endpoint has a proven idempotency contract.
- After an ambiguous mutation timeout, refresh the relevant resource or query its current state before offering another attempt.
- Do not optimistically mark an application accepted, assignment confirmed, attendance checked in, or event published before the server confirms it.
- A successful `204 No Content` is success even though there is no JSON response body.

---

# 7. Screen-oriented data orchestration

A major purpose of the mobile-side backend is to make inconsistent screen data consumption consistent.

The UI should not independently fetch five endpoints, merge them differently on each screen, and invent fallback behavior. Introduce screen-oriented use cases/query services that compose existing repository operations into stable view data.

These are mobile-side read orchestration functions. They do not become a second business-rule engine.

## 7.1 Example screen query contracts

| Screen / feature | Mobile query or use case | Existing BFF source |
|---|---|---|
| Open Shifts | `getOpenShiftFeed(filters, page)` | `GET /events/` |
| Event Detail | `getEventDetail(eventId)` | `GET /events/{id}/` + `/posts/` if not already composed |
| My Roster | `getMyRoster()` | `GET /me/roster/` |
| Profile | `getMyProfile()` | `GET /me/` |
| Availability | `getMyAvailability()` | `GET /me/availability/` |
| Coordinator Home | `getCoordinatorEvents()` | `GET /coordinator/events/` |
| Shift Console | `getShiftConsole(eventId)` | `GET /events/{id}/shift-console/` |
| Pending Check-ins | `getPendingCheckIns(eventId)` | `GET /events/{id}/attendance/pending/` |
| QR Preview | `resolveQrToken(rawToken)` | `POST /qr/resolve/` |
| Attendance | `submitGeoCheckIn(...)` | `POST /events/{id}/geo-check-in/` |

Where the BFF already provides a composite response, prefer it. Do not split a composite endpoint into multiple calls merely to mimic database tables.

## 7.2 View data versus domain data

A screen may need a `ShiftCardViewData` containing:
- Display title.
- Date label.
- Location label.
- Status label.
- Capacity summary.
- Allowed action indicators returned by the backend or safely derived from explicit permission/state fields.

This can be composed from domain models in a presentation mapper. It must not be persisted as a database-shaped entity.

Do not infer authorization from `showButton`, local role flags, or hidden UI state. A button can be hidden for usability, but the BFF still enforces every permission.

## 7.3 Screen state contract

Every screen query should expose a consistent state model:

```ts
type ResourceState<T> =
  | { status: "idle" }
  | { status: "loading"; previous?: T }
  | { status: "success"; data: T; refreshedAt: number }
  | { status: "empty" }
  | { status: "error"; error: AppError; previous?: T };
```

Use the state-management library already present in the project. Do not introduce a second global state library solely for this plan.

---

# 8. Repository and dependency-injection design

## 8.1 Repository contract

A feature depends on an interface, not on mock or HTTP implementation details.

```ts
export interface EventRepository {
  getFeed(query: EventFeedQuery): Promise<PagedResult<EventSummary>>;
  getById(eventId: string): Promise<EventDetail>;
  getPosts(eventId: string): Promise<EventPostSummary[]>;
  apply(eventId: string, input: ApplyToEventInput): Promise<ApplicationResult>;
}
```

The interface is illustrative and must be reconciled with current screens and actual BFF endpoints.

## 8.2 Implementations

```text
EventRepository
   ├── MockEventRepository
   └── HttpEventRepository
```

Both implementations must satisfy the same contract and return the same domain types.

## 8.3 Runtime selection

Use an explicit application configuration:

```ts
type DataMode = "mock" | "http";
```

Rules:
- Default to the current working mode until HTTP integration is verified.
- Mock mode must not accidentally send real mutations.
- HTTP mode must not fall back silently to mock data after a server error.
- Show a clear development configuration error if HTTP mode lacks a base URL.
- Do not expose a production user-facing switch that can impersonate roles.
- Keep test dependency injection deterministic.

---

# 9. BFF integration contract map

The following is the v0.6.0 intended endpoint family map. Before implementation, verify exact route registration, methods, serializer fields and response shapes against the live BFF/OpenAPI contract.

## 9.1 Authentication

| Mobile capability | BFF endpoint |
|---|---|
| Request OTP | `POST /api/v1/auth/otp/request/` |
| Verify OTP and receive token | `POST /api/v1/auth/otp/verify/` |
| Logout | `POST /api/v1/auth/logout/` |

## 9.2 Profile and volunteer self-service

| Mobile capability | BFF endpoint |
|---|---|
| Read own profile | `GET /api/v1/me/` |
| Update allow-listed profile fields | `PATCH /api/v1/me/` |
| Read/replace charity interests | `GET/PUT /api/v1/me/charity-interests/` |
| Read availability | `GET /api/v1/me/availability/` |
| Create weekly availability rules | `POST /api/v1/me/availability/rules/` |
| Create availability exception | `POST /api/v1/me/availability/exceptions/` |
| Delete availability exception | `DELETE /api/v1/me/availability/exceptions/{id}/` |
| Read coordinator application status | `GET /api/v1/me/coordinator/` |
| Apply for coordinator | `POST /api/v1/me/coordinator/` |
| Upload/read verification image metadata | `POST/GET /api/v1/me/verification-images/` |

## 9.3 Public discovery and applications

| Mobile capability | BFF endpoint |
|---|---|
| Charity field lookup | `GET /api/v1/charity-fields/` |
| Event feed | `GET /api/v1/events/` |
| Event detail | `GET /api/v1/events/{id}/` |
| Event role posts | `GET /api/v1/events/{id}/posts/` |
| Apply to event | `POST /api/v1/events/{id}/apply/` |
| Withdraw application | `POST /api/v1/applications/{id}/withdraw/` |
| My applications | `GET /api/v1/me/applications/` |
| My roster | `GET /api/v1/me/roster/` |
| Confirm/cancel assignment | `POST /api/v1/assignments/{id}/confirm/` and `/cancel/` |

## 9.4 Coordinator workspace

| Mobile capability | BFF endpoint |
|---|---|
| List/create coordinator events | `GET/POST /api/v1/coordinator/events/` |
| Update event | `PATCH /api/v1/coordinator/events/{id}/` |
| Event lifecycle actions | `POST /api/v1/events/{id}/publish/`, `/activate/`, `/complete/`, `/cancel/` |
| Handover/retake | `POST /api/v1/events/{id}/handover/`, `/retake/` |
| Manage event posts | Existing event-post create/update/close routes |
| Read applications | `GET /api/v1/events/{id}/applications/` |
| Accept/reject/waitlist | Existing application decision routes |
| Auto/manual assignment | Existing event assignment routes |
| Shift Console | `GET /api/v1/events/{id}/shift-console/` |

## 9.5 Onboarding, QR and attendance

| Mobile capability | BFF endpoint |
|---|---|
| Acknowledge onboarding | `POST /api/v1/events/{id}/onboarding/acknowledge/` |
| Create/revoke QR token | `POST /api/v1/events/{id}/qr/`, `POST /api/v1/qr/{id}/revoke/` |
| Resolve/redeem QR | `POST /api/v1/qr/resolve/`, `POST /api/v1/qr/redeem/` |
| GPS check-in | `POST /api/v1/events/{id}/geo-check-in/` |
| Pending attendance | `GET /api/v1/events/{id}/attendance/pending/` |
| Confirm/reject attendance | `POST /api/v1/attendance/{id}/confirm/`, `/reject/` |
| Manual check-in/out/absent | Existing coordinator attendance action routes |
| Feedback | `POST /api/v1/events/{id}/feedback/` |

**Important:** The mobile plan must not invent endpoints where the architecture document only names an endpoint family. Resolve the exact path from registered Django routes and OpenAPI before coding.

---

# 10. Privacy and data handling

The BFF enforces T0–T4 privacy. Mobile mapping and caching must preserve that boundary.

| Tier | Mobile handling |
|---|---|
| T0 Public | May be cached briefly if freshness requirements allow |
| T1 Self/minimal identity | Store only what is needed for the active session; clear session-bound data on logout |
| T2 Event-scoped | Keep scoped to the relevant event and active authorization; refresh when event context changes |
| T3 Strict personal | Do not persist broadly; avoid analytics, crash logs and shared caches |
| T4 Governance | Do not implement in ordinary volunteer mobile features; separately gated admin capability only if explicitly approved |

Rules:
- Do not assume that data returned once remains authorized indefinitely.
- Clear authenticated caches on logout/account invalidation.
- Do not place sensitive fields in navigation params.
- Do not log full API responses.
- Do not store verification image paths or private media metadata as public URLs.
- Do not treat a local cached payload as proof of current authorization.
- Avoid persisting raw QR tokens beyond the workflow that requires them.
- Request camera and location permissions only when the user invokes the relevant feature.

---

# 11. Feature integration sequence

Implement vertical slices. Each slice includes endpoint contract, DTO, mapper, repository, use case, screen connection and tests. Do not build every DTO in advance from assumptions.

## Phase 0 — Discovery and baseline freeze

**Deliverables**
- Mobile architecture inventory.
- Existing screen-to-mock-data map.
- Existing repository and model inventory.
- BFF endpoint contract inventory.
- Current test/build baseline.
- Explicit list of files that must remain untouched.

**Acceptance gate**
- Existing app builds and runs in current mode.
- No UI redesign.
- No database or backend workflow modifications.

## Phase 1 — Mobile API foundation

**Implement**
- Environment-aware base URL.
- Shared API client.
- Request timeout and cancellation policy.
- Standard API result/error handling.
- Secure token store abstraction.
- Session manager.
- Test transport adapter.

**Acceptance gate**
- Public GET works against a development BFF.
- Authenticated request sends the exact DRF Token header.
- 204, JSON, validation error, 401, 403, 404, 409, 429, 5xx, offline and timeout are handled.
- No token or personal data appears in logs.

## Phase 2 — DTO and mapper foundation

**Implement**
- DTOs only for the first vertical slice.
- Runtime response validation if supported by existing dependencies.
- Domain models.
- Explicit mapper functions.
- Mapper unit tests and unknown-status behavior.

**Acceptance gate**
- DTOs match actual serializer/OpenAPI output.
- UI imports no DTOs.
- No fabricated fields or silent defaults.
- No database table replica is introduced.

## Phase 3 — Repository and DI bridge

**Implement**
- Preserve/normalize current repository interfaces.
- Add HTTP repository implementations.
- Keep mock implementations.
- Add runtime repository provider.
- Add repository contract tests shared by mock and HTTP implementations.

**Acceptance gate**
- Switching mock/HTTP does not require screen code changes.
- Both implementations return identical domain types.
- HTTP failures never silently fall back to mock data.

## Phase 4 — Authentication and session

**Integrate**
- OTP request.
- OTP verify.
- Token persistence.
- Session bootstrap.
- Logout.
- Authenticated profile fetch.

**Acceptance gate**
- Cold start restores only a valid local token/session attempt.
- 401 invalidates session correctly.
- 403 does not automatically log the user out.
- Logout clears session-bound cache.
- Existing login UI remains visually unchanged.

## Phase 5 — Volunteer read experiences

**Integrate**
- Charity fields.
- Open event feed and filters.
- Event detail and posts.
- My profile.
- Availability.
- My roster.

**Acceptance gate**
- Existing UI displays server data through domain models.
- Loading, empty, refresh, offline and error states are consistent.
- T0/T1/T2/T3 fields are displayed only where returned and authorized.
- Mock mode remains functional.

## Phase 6 — Volunteer mutations

**Integrate**
- Profile update.
- Charity interest replacement.
- Availability rule/exception changes.
- Event application and withdrawal.
- Assignment confirm/cancel.

**Acceptance gate**
- Request bodies contain only BFF-allow-listed fields.
- UI updates from server-confirmed results.
- Conflict and validation errors are displayed without changing local authoritative state.
- Ambiguous timeouts do not trigger duplicate POST requests.

## Phase 7 — Coordinator workspace

**Integrate**
- Coordinator status.
- Coordinator event list and creation.
- Event editing and lifecycle actions.
- Posts.
- Applications and decisions.
- Assignment actions.
- Shift Console.
- Handover and retake.

**Acceptance gate**
- Coordinator UI consumes composite and domain data consistently.
- Owner-as-Monitor is displayed as read-only based on server response.
- UI does not infer or grant write permission locally.
- Retake and handover results are reloaded from the server.

## Phase 8 — Onboarding, QR and attendance

**Integrate**
- Onboarding content and acknowledgement.
- QR create/resolve/redeem.
- GPS check-in.
- Pending confirmation.
- Manual attendance actions.
- Checkout/absent and feedback where included in the mobile scope.

**Acceptance gate**
- Camera/location permission flow works on physical device.
- Server result codes are preserved.
- Attendance state changes only after server confirmation.
- Raw QR token and sensitive location evidence are not logged.

## Phase 9 — Stabilization and release readiness

**Complete**
- Full screen regression.
- API contract regression.
- Mock/HTTP parity.
- Android emulator and physical-device testing.
- Error and empty-state review.
- Performance and safe caching review.
- Developer setup documentation.

**Acceptance gate**
- All integrated slices pass.
- Existing UI and navigation remain intact.
- Backend and database baselines are unchanged.
- HTTP mode is configured explicitly.
- Rollback to mock mode is possible without reverting screen changes.

---

# 12. Testing strategy

## 12.1 Unit tests

- DTO validation.
- Mapper nullability and unknown statuses.
- Date/time conversion.
- Error normalization.
- Query parameter serialization.
- Request body allow-listing.
- Screen query composition.
- Session manager behavior.

## 12.2 API client tests

- Base URL and path joining.
- Token header injection.
- Public request without token.
- Token refresh/clear behavior where applicable.
- Timeout and cancellation.
- JSON and empty 204 response.
- Standard BFF error payload.
- Malformed/unexpected response.
- No unsafe automatic retries.

## 12.3 Repository contract tests

Run the same contract suite against:
- Mock repository.
- HTTP repository using a deterministic fake transport.

Verify identical domain-level behavior for success, empty, validation, not-found and conflict scenarios.

## 12.4 Feature integration tests

- OTP → session → profile.
- Event feed → event detail → apply.
- My roster → assignment confirmation.
- Coordinator event list → Shift Console.
- Onboarding → QR/GPS check-in.
- Attendance pending → confirm/reject.

## 12.5 Regression tests

After every phase:
- Existing Jest/unit tests.
- TypeScript typecheck.
- Lint.
- Android debug build.
- Relevant backend API contract tests (read-only execution).
- Manual UI smoke test for affected screens.

No test may use a production database or mutate the live database as part of mobile integration.

---

# 13. Observability and diagnostics

Mobile diagnostics should help identify integration failures without exposing private information.

Permitted diagnostic fields:
- Request correlation ID.
- Endpoint template (not sensitive path parameters).
- HTTP status.
- Duration.
- App version/build.
- Network category.
- BFF error code.

Do not log:
- Authorization header or token.
- OTP code.
- Phone number or phone hash.
- Emergency contact details.
- Verification image content/path.
- Raw QR token.
- Full GPS coordinates unless a separately approved operational requirement exists.
- Full private response bodies.

Provide a development-only connection diagnostic showing environment name, API host and reachability. It must not display credentials.

---

# 14. Change-control and compatibility rules

Any required BFF adjustment must be raised as a separate contract change with:
1. Current endpoint and response evidence.
2. The screen requirement that cannot be met.
3. Explanation why mobile mapping/composition cannot solve it.
4. Proposed additive response field or endpoint.
5. Privacy-tier classification.
6. Backward-compatibility analysis.
7. BFF tests and OpenAPI update.
8. Explicit confirmation that no database change is required.

If a database change appears unavoidable, stop and create a separate database-change proposal. It must not be bundled into v0.10.0.

The mobile integration must tolerate additive optional fields and unknown server status values safely. Breaking changes require a coordinated API version/contract decision.

---

# 15. Definition of Done

v0.10.0 is complete when:

1. The actual mobile project structure has been inspected and preserved.
2. Existing UI, navigation and theme remain unchanged unless separately requested.
3. One shared API client is used for BFF communication.
4. Authentication token storage is secure and centralized.
5. DTOs accurately describe actual BFF contracts.
6. Mobile domain models are independent of PostgreSQL schema.
7. All DTO-to-domain conversions occur in explicit tested mappers.
8. Screens consume repositories/use cases, not HTTP endpoints.
9. Mock and HTTP repositories implement the same contracts.
10. Screen data composition is consistent and does not duplicate backend business rules.
11. T0–T4 privacy behavior is preserved.
12. Server-confirmed state is used for all mutations.
13. Errors, loading, empty, offline and timeout states are consistent.
14. No direct database access exists in mobile.
15. No PostgreSQL schema, trigger, function, constraint, view or persisted data has been changed by this plan.
16. No existing backend workflow has been rewritten to accommodate UI inconsistencies.
17. Android emulator and physical-device integration tests pass.
18. Mock mode remains available as a safe rollback path.

---

# 16. Coding-agent execution instructions

The coding agent must work in small, reviewable vertical slices.

For every task, provide:
- Task ID and phase.
- Objective.
- Existing files to inspect.
- Files allowed to create/change.
- Files explicitly prohibited from changing.
- Exact BFF endpoint contract and source of truth.
- UI behavior to preserve.
- Required DTO/domain/repository/mapping changes.
- Unit and integration tests.
- Acceptance criteria.
- Final change report.

**The coding agent must not:**
- Run SQL scripts or migrations.
- Modify database files.
- Modify Django models, services, serializers, routes or permissions under this plan.
- Change existing UI layout or navigation to simplify integration.
- Replace mock data globally before the corresponding HTTP slice passes.
- invent endpoints or response properties.
- add a new state-management or networking library without first checking existing dependencies and obtaining approval.

If an endpoint is missing or its response is insufficient, stop that feature slice and produce a BFF contract-gap report. Do not patch the database or fabricate a response.

---

# 17. Final architectural rule

**PostgreSQL stores and protects the system. Django BFF exposes authorized system capabilities. The mobile API/data layer adapts those capabilities into stable mobile domain models and screen-ready data. React Native UI renders those models.**

The mobile side is not a database replica and not a second business backend. It is the application-facing data and orchestration layer that shields the UI from inconsistent API shapes and keeps the UI independent from storage design.

**v0.10.0 is strictly an integration and adaptation plan. The existing database, backend workflows and UI design are preserved.**
