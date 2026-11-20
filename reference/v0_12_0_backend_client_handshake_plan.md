# v0.12.0 — Backend–Client Handshake & Attendance Integration Plan

> **Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
> **Baseline branch:** `main`  
> **Baseline commit reviewed:** `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a`  
> **Plan branch:** `plan/v0.12.0-backend-client-handshake`  
> **Plan status:** Implementation plan — not a claim that the work below has been implemented  
> **Prepared:** 19 November 2026

---

## 1. Executive decision

The current repository has a substantial BFF and mobile data-layer structure. The next step should **not** be a rewrite and should **not** start with screens. First freeze and complete the backend contract, its database state transitions, authorization rules, and real integration tests. Only after the backend passes those gates should the mobile transport, DTOs, repositories, use cases, and UI be wired to it.

### 1.1 Decisions for this release

| Area | Decision | Release treatment |
|---|---|---|
| Coordinator manual on-site check-in | **In scope and achievable** | Complete the existing request/response contract, remove cache coupling in the HTTP repository, return and display authoritative server state, and verify role/state rules against PostgreSQL. |
| Volunteer GPS/geofence check-in | **Defer** | Keep the existing backend capability dormant. Do not depend on native GPS, maps, location permissions, or mocked coordinates in the release UI. |
| Friends / friend connections | **Coming Soon** | Leave the capability visibly deferred. It is not a dependency of authentication, volunteer event participation, or attendance. |
| OTP network-provider integration | **Placeholder only** | Do not integrate Twilio, AWS SNS, Firebase Phone Auth, SMPP, or another telecom provider in this release. Keep a narrow delivery-adapter boundary for a later provider integration. |
| Tokenized authentication handshake | **In scope** | Introduce a one-time, server-bound OTP challenge so verification no longer resends the phone number. Add the encrypted Client Identity Envelope only with a defined threat model and tested React Native cryptography support. |
| Existing DRF bearer token | **Retain for compatibility** | Continue returning and using the existing DRF `Token` for authenticated BFF requests. The OTP challenge token is not an API bearer token and must never be used in `Authorization`. |
| Legacy OTP routes | **Temporary compatibility** | Keep existing request/verify routes while the new mobile build rolls out. Deprecate only after client adoption is demonstrated. |

### 1.2 What “backend first” means

The backend is not considered complete when a Django view returns a plausible JSON object. It is complete only when:

1. The database schema, functions, constraints, and triggers enforce the business invariants.
2. The service layer uses those database operations transactionally and translates failures into stable domain errors.
3. DRF serializers and views expose an explicit, versioned request/response contract.
4. Permissions are enforced server-side, not only by disabling a mobile button.
5. The OpenAPI schema describes the same contract the mobile client will consume.
6. Django API tests run against PostgreSQL, and a separate real-HTTP integration test proves that the mobile `ApiClient` can call the BFF.
7. The contract is frozen before mobile DTOs, repositories, use cases, or screens are made dependent on it.

---

## 2. Repository baseline and evidence

This plan is based on source inspection at commit `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a`. Re-check `main` before implementation because the branch may have moved.

### 2.1 Authentication baseline

The inspected source currently has:

- `backend/services/auth_service.py`: phone normalization, phone hash, OTP generation, `request_otp()` invocation, adapter call, account checks, verification, user creation, and DRF token issuance.
- `backend/common/security.py`: phone HMAC, Fernet phone encryption/decryption, OTP HMAC, QR token helpers, and sensitive-field redaction.
- `backend/bff/auth/serializers.py`: both existing OTP request and verification serializers require `phone`.
- `backend/bff/auth/views.py`: current views call `request_login_otp(raw_phone=...)` and `verify_login_otp(raw_phone=...)`.
- `backend/bff/auth/urls.py`: legacy `otp/request/`, `otp/verify/`, and route aliases exist. The proposed `tokenized/request-otp/` and `tokenized/verify-otp/` routes do not exist yet.
- `mobile/src/data/endpoints/authApi.ts` and `authDto.ts`: current request and verify payloads both contain `phone`.
- `mobile/src/app/UserContext.tsx`: `verifyOtp()` sends the phone again and stores the returned DRF token with `sessionManager`.
- `mobile/src/core/api/apiClient.ts`: injects `Authorization: Token ...`, supports JSON/FormData, timeout, abort, response parsing, and invalidates local session on HTTP 401.
- `mobile/src/core/auth/sessionManager.ts`: handles token storage and 401 notifications.
- `mobile/src/core/auth/tokenStore.ts`: dynamically tries Keychain, SecureStore, AsyncStorage, then memory. The inspected `mobile/package.json` and `mobile/package-lock.json` do not declare any of those optional storage packages. Therefore hardware-backed persistence is not established by the current dependency manifest.

### 2.2 OTP behavior that must be represented accurately

The currently active source adapter is `ConsoleOtpDeliveryAdapter`. It records a delivery attempt as console/passthrough; it does not call a telecom/SMS provider. When Django `DEBUG` is true, `request_login_otp()` returns `dev_code` to the app. This is suitable only as a development/testing path. The requested provider integration remains deferred in this plan.

The backend service currently sets `OTP_CODE_LENGTH = 4`, while `OtpLoginScreen.tsx` presents a six-digit heading and prompt and permits up to six characters. This is an active client/server contract mismatch. The proposed contract must choose one length and test it end to end. The recommendation in this plan is a **six-digit code** before any production use; if the project intentionally retains four digits for a local prototype, the UI and schema must say four consistently.

The database `verify_otp(phone_hash, code_hash, purpose)` selects the latest unconsumed OTP for that phone and purpose, locks the selected row, checks expiry and attempt count, and consumes/increments the row. This protects a single selected OTP record, but it does not bind verification to a specific request/challenge. A session-bound challenge should point to the exact OTP row to avoid ambiguity when a user requests more than one code.

### 2.3 Manual check-in baseline

Manual on-site check-in is already implemented across the following layers:

- BFF: `backend/bff/checkin/views.py` exposes `AttendanceManualCheckinView`; it accepts `event_id`, `user_id`, and optional `note` and calls `attendance_service.manual_check_in()`.
- Routes: `backend/bff/checkin/urls.py` includes `attendance/manual-checkin/` and event-scoped aliases.
- Service: `backend/services/attendance_service.py` checks that the actor can write to the event, locks the volunteer attendance row, updates it to `checked_in`, records method `coordinator_manual`, records the actor, and is idempotent for rows already `checked_in` or `completed`.
- Database: `trg_attendance_guard()` validates legal status transitions, event active state, active assignment, onboarding acknowledgement, method, and event-manager authority for a manual check-in.
- Tests: `backend/apps/attendance/tests/test_services_phase7.py` covers the manual check-in and checkout lifecycle; `test_bff_checkin_phase7.py` covers the event-scoped manual endpoint and owner-as-monitor mutation rejection.
- Mobile: `HttpCoordinatorRepository.manualCheckIn()` currently calls `coordinatorApi.manualCheckIn()`, which targets the root compatibility route `/api/v1/attendance/manual-checkin/`. A separate `checkinApi.manualCheckIn()` wrapper targets `/api/v1/checkin/attendance/manual-checkin/`. The backend mounts the check-in URLs both under the `checkin/` prefix and as root aliases. Make the `checkin/` path canonical and retire the root alias only after compatibility review. The coordinator screen wires the action into `AttendanceRow`.

The feature is therefore **achievable without implementing GPS or map support**. QR token create/redeem endpoints and mobile API wrappers also exist, so QR is a plausible later on-site self-service option; a real native QR scanner flow was not established in this source pass and is not needed for the manual-check-in release. It is not fully production-hardened at the mobile boundary yet:

1. `HttpCoordinatorRepository.manualCheckIn(attendanceId)` requires the matching record to already exist in `attendanceCache`. Calling it without first loading the roster returns “Attendance record not found in active roster cache.”
2. After a successful POST, the repository ignores the returned DTO and locally sets `checkedInAt = new Date().toISOString()`, method, and status. That can misrepresent a server state or server timestamp.
3. The UI labels the operation `Manual Check-In (Demo)` even though an HTTP path exists. The label should be removed only after the live BFF flow passes the integration gate.
4. The response returns only `id`, `status`, and `method`; it should return the full authoritative attendance mutation result needed by the mobile domain object.
5. The service returns an already checked-in/completed row without explicitly telling the caller that no mutation occurred. The client must not overwrite an existing geo/QR method or clear a pending geo-confirmation state based on a manual-check-in success message.
6. A cancelled attendance row is not a valid direct transition to `checked_in` under the database trigger. The service should translate this into a stable conflict response, not leak it as an unexpected server error.

### 2.4 GPS/geofence baseline (deferred)

The PostgreSQL `geo_check_in()` function and BFF endpoint already implement server-side distance calculation, event geofence checks, assignment checks, event timing, onboarding, accuracy, stale-fix, and a client-supplied mocked-location flag. Attempt telemetry is retained for coordinator review.

However, the mobile `NativeDeviceLocationProvider` dynamically requires `@react-native-community/geolocation`, and that package is absent from `mobile/package.json` and `package-lock.json`. The iOS permission branch calls `requestAuthorization()` but returns `granted` without awaiting the authorization outcome. The DTO supports `captured_at` and `is_mocked`; past mobile code paths have not consistently propagated the complete location fix. Native device mapping is therefore not a safe release dependency now.

The server-side `is_mocked` value is supplied by the client and cannot independently prove a device is genuine. GPS anti-spoofing should be treated as risk telemetry, not a security guarantee. Since native mapping is out of scope for this release, no mobile UI should imply that real GPS validation is available.

---

## 3. Tokenization specification review

The uploaded `tokenization_login_architecture.md` is a useful target design, but it combines three different ideas and contains assumptions that should be corrected before code is written.

### 3.1 Separate the three credentials

| Credential | Purpose | Lifetime / storage | Must not be confused with |
|---|---|---|---|
| Client Identity Envelope (CIT / identity token) | Carries the phone identity to the BFF encrypted to the server public key, if application-layer encryption is required by the threat model. | One request; timestamp and one-time nonce; private key only on server/KMS. | It is not a login session and not an authentication bearer token. |
| OTP challenge token (`auth_session_token`) | Identifies the exact OTP request and binds verify to the phone hash, purpose, expiry, and attempt state. | Opaque, random, short-lived, one-time; store only a keyed hash server-side. Suggested effective lifetime: no longer than 180 seconds and never longer than the OTP row expiry. | It is not a DRF API token. |
| DRF API token | Authenticates normal BFF calls after successful OTP verification. | Persist in native secure storage; validate on every authenticated request. | It is not the OTP challenge token. |

Use an opaque 256-bit challenge token generated by a cryptographically secure random source. Do not use a self-contained JWT for this challenge: single-use consumption, attempt counting, revocation, and exact OTP-row binding require authoritative server state anyway. Store `HMAC(AUTH_SESSION_TOKEN_SECRET, raw_challenge_token)` or an equivalent keyed digest, never the raw challenge token.

### 3.2 The CIT is an encrypted envelope, not tokenization in the strict sense

The specification calls `Encrypt(server_public_key, phone || timestamp || nonce)` a Client Identity Token. That design is more accurately an **application-layer encrypted identity envelope**. It protects the phone payload from intermediate systems that terminate TLS before the Django process, provided only the intended BFF service can decrypt it. It does not make the phone anonymous to the BFF: the BFF must decrypt it to normalize, hash, encrypt-at-rest, and dispatch the OTP.

If CIT is adopted:

- Use an established JWE or HPKE implementation with authenticated encryption and a vetted React Native implementation. Do not invent a custom AES/RSA envelope or store a shared tokenization secret inside the mobile bundle.
- The app may contain the server public key; the app must not contain the corresponding private key or any symmetric server secret.
- Include a key identifier so the server can rotate keys without breaking all clients at once.
- Put one nonce and one client timestamp inside the authenticated encrypted payload. The uploaded spec duplicates `client_nonce` both inside and outside the envelope; use one canonical value.
- Enforce the timestamp window on the server and persist/consume the nonce atomically (unique constraint or atomic cache `SET NX` with expiry). A client-generated nonce alone does not prevent replay.
- Continue requiring TLS. CIT is an extra privacy boundary, not a replacement for transport encryption, endpoint authentication, rate limits, or server log redaction.
- Keep raw phone, decrypted payload, OTP, challenge token, and DRF token out of logs and analytics.

**Recommendation:** implement session-bound OTP verification first, and implement CIT as a separate gated sub-phase after a React Native cryptography compatibility spike. The core handshake must not depend on a speculative native/JWE library. If the threat model requires preventing the reverse proxy from seeing the phone, CIT becomes a prerequisite before production rollout; otherwise it can follow while the TLS-protected legacy route is maintained.

### 3.3 Bind a challenge to one exact OTP row

The uploaded design stores a session-to-phone mapping in Redis or memory. The current system is database-first and already stores OTP state in PostgreSQL. Prefer one authoritative transactional design for the first implementation:

1. Generate OTP and its keyed code hash.
2. Insert the `auth_otp` row using the existing DB rate-limit trigger.
3. Insert a challenge row referencing the exact `auth_otp.id`, storing a keyed hash of the opaque session token, purpose, `created_at`, `expires_at`, `consumed_at`, and optional client/request metadata.
4. Commit both rows together.
5. Return the raw challenge token to the client once.
6. On verify, resolve and lock the challenge and its exact OTP row, validate purpose/expiry/consumption/attempt limit, compare the code hash, and atomically consume both.
7. Only then create/find the user and issue the existing DRF token.

This is safer than selecting “the latest unconsumed OTP for this phone” during verification. It also avoids making Redis a required new dependency just to keep OTP-to-session state. Redis can be added later for distributed nonce replay protection or higher-throughput throttles if it is part of the deployed infrastructure.

The challenge expiry must be `min(issued_at + challenge_ttl, otp.expires_at)`. The uploaded document proposes a three-minute challenge and the current database default is a five-minute OTP. Both clocks must be enforced; there must not be a period in which a challenge is live after its OTP has expired.

### 3.4 Key separation and OTP strength

The current helper uses `PHONE_HASH_HMAC_SECRET` for both phone HMAC and OTP code HMAC. Introduce a distinct `OTP_CODE_HMAC_SECRET` and `AUTH_SESSION_TOKEN_SECRET` (or derive independent keys using a documented KDF and explicit context strings). Key rotation must be planned; do not silently change the key used to validate existing active OTPs during a deployment.

Four-digit OTPs have only 10,000 possible values. The database currently limits attempts, but the mobile copy already says six digits. Standardize on six digits in the backend, response schema, client validation, and tests before any production release. If a temporary four-digit debug mode is retained, it must be explicit and isolated to local/test configuration.

### 3.5 SMS provider and async design are explicitly deferred

The uploaded document includes Twilio/AWS/Firebase/SMPP classes, ThreadPoolExecutor/Celery dispatch, provider failover, and circuit breakers. Those are not part of this release. A process-local `ThreadPoolExecutor` is not a durable queue: a worker restart can lose an in-flight delivery, and it does not provide reliable retry, persistence, or exactly-once semantics.

For this release:

- Retain a small `OtpDeliveryAdapter` interface and the current console/dev adapter.
- Return a truthful status such as `dev_code_available`, `console_simulated`, or `provider_not_configured`; do not claim an SMS was sent when no provider call occurred.
- Include `dev_code` only in an explicitly enabled local/test response. Enforce this with settings validation and tests that production configuration can never expose it.
- Do not add external provider credentials, provider SDKs, async worker infrastructure, or network-provider dependencies.

When provider integration is approved later, use a durable outbox/task queue and provider-level idempotency/correlation. The HTTP response should distinguish “queued” from “delivered”; a provider API acknowledgement does not prove that the handset received the SMS. Avoid immediate failover after an ambiguous timeout unless the provider operation is idempotent, otherwise two providers may send duplicate codes.

### 3.6 Latency/SLA correction

The uploaded specification assigns nominal and P99 network-stage estimates that sum to 260 ms, then describes this as a sub-500 ms end-to-end result. These are planning estimates, not measured performance. Mobile radio, DNS, TLS, device wake-up, and carrier behavior are not under Django's control; a hard end-to-end 500 ms guarantee cannot be asserted from source code.

For the current release, measure:

- BFF processing time excluding client/carrier time;
- DB connection acquisition and OTP stored-function time;
- endpoint P50/P95/P99 under a representative load;
- full mobile-to-BFF round trip in an instrumented test environment.

Do not add a latency SLA claim until the test environment and percentile are defined. Since SMS network integration is deferred, no provider-delivery latency is included in this release's request-response budget.

---

## 4. Target handshake contract

The following contract is the proposed target. Exact naming should be locked in the OpenAPI schema before client implementation.

### 4.1 Request OTP / create challenge

**New route:** `POST /api/v1/auth/tokenized/request-otp/`  
**Authentication:** public (`AllowAny`)  
**Content-Type:** `application/json`

If CIT is enabled, request body:

```json
{
  "identity_token": "<JWE-or-HPKE-envelope>",
  "purpose": "login"
}
```

If CIT is not yet required, the first session-bound implementation may use the current `phone` input over TLS on this new route while the rest of the session contract is implemented. Do not present this intermediate step as CIT or as protection from TLS-terminating proxies. The eventual CIT-only route should reject a raw `phone` field.

Suggested development response:

```json
{
  "status": "dev_code_available",
  "auth_session_token": "<opaque-one-time-challenge-token>",
  "expires_in": 180,
  "code_length": 6,
  "delivery": {
    "provider": "console",
    "channel": "console",
    "delivered": false,
    "configured": false
  },
  "dev_code": "123456"
}
```

Suggested non-development response while no SMS provider is configured:

```json
{
  "status": "provider_not_configured",
  "auth_session_token": "<opaque-one-time-challenge-token>",
  "expires_in": 180,
  "code_length": 6,
  "delivery": {
    "provider": "none",
    "channel": "none",
    "delivered": false,
    "configured": false
  }
}
```

The exact response for a no-provider production environment must not imply that the user has received a code. The product must decide whether this state is allowed outside local development; absent a provider, production login cannot be completed through SMS delivery.

### 4.2 Verify challenge

**New route:** `POST /api/v1/auth/tokenized/verify-otp/`  
**Authentication:** public (`AllowAny`)

Request body:

```json
{
  "auth_session_token": "<opaque-one-time-challenge-token>",
  "code": "123456",
  "display_name": "Optional first-login display name"
}
```

The verify request must not contain a phone number. The server resolves the challenge to the exact OTP row and phone hash. On success it returns the existing DRF token and the normal user identity response:

```json
{
  "token": "<existing-drf-token>",
  "user": {
    "id": 142,
    "uuid": "...",
    "display_name": "Volunteer",
    "verification_status": "none"
  }
}
```

### 4.3 Stable error contract

Use the repository's existing error envelope conventions, but lock machine-readable codes in serializer/service tests and OpenAPI. At minimum:

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `invalid_identity_token` | CIT cannot be decoded or validated. |
| 400 | `invalid_challenge` | Challenge is unknown, malformed, wrong purpose, or already consumed. Avoid revealing whether a phone is registered. |
| 400 | `invalid_code` | Code does not match; attempts are incremented. |
| 400 or 410 | `challenge_expired` | Challenge or OTP has expired. Choose one status and use consistently. |
| 403 | `account_blocked` / `account_closed` | Account cannot authenticate. |
| 409 | `challenge_consumed` | A second verify request races with or follows a successful verification. |
| 429 | `otp_rate_limited` | Phone/IP/device policy or maximum attempts was reached. |
| 5xx | `service_unavailable` | Database or required dependency unavailable; never convert to success. |

Do not leak the phone hash, challenge lookup hash, OTP hash, raw code, or decrypted identity payload in response messages.

### 4.4 Backward compatibility

- Keep `POST /auth/otp/request/` and `POST /auth/otp/verify/` working while the older mobile build is supported.
- New mobile versions use only the new challenge flow.
- Add deprecation metadata and telemetry to the legacy routes.
- Do not remove legacy routes until supported app adoption and operational logs show that they are no longer in use.
- Keep the DRF `Token` header contract unchanged in this release: `Authorization: Token <token>`.

---

## 5. Manual on-site check-in contract

### 5.1 Intended behavior

A coordinator physically verifies a volunteer at the event desk and records their attendance. This is a human-confirmed operation, not a location claim. It must not require maps, GPS permission, device geolocation, or a QR scanner.

### 5.2 Current behavior and guards

The backend already enforces these rules:

1. Caller must be authenticated.
2. Caller must have write authority over the event. The service calls `get_event_for_manager_or_404(..., require_write=True)`; owner-as-monitor is read-only.
3. Attendance must exist for the `(event_id, volunteer_user_id)` pair. The service returns `not_assigned` if no row exists.
4. The attendance row is locked during the update.
5. Database trigger requires the event to be active, the assignment to be `assigned` or `confirmed`, and required onboarding to be acknowledged.
6. The method is set to `coordinator_manual`, and the coordinator is recorded as `recorded_by_user`.
7. Repeated check-in for an already checked-in/completed row returns the existing row instead of writing a second check-in.

A cancelled attendance row is not a legal direct transition to `checked_in` under `trg_attendance_guard`; return a clear `409 invalid_state` response. If a row is already checked in by QR or GPS, preserve that method and any confirmation state; a manual request must not relabel it.

### 5.3 Canonical request and response

Keep the existing mobile-compatible route as canonical for this release:

`POST /api/v1/checkin/attendance/manual-checkin/`

This is the canonical path already represented by `checkinApi.manualCheckIn()`. The current coordinator repository uses the duplicate root alias `/api/v1/attendance/manual-checkin/`; update it to use the canonical check-in wrapper. Keep the root alias temporarily for compatibility.

Request:

```json
{
  "event_id": 142,
  "user_id": 28,
  "note": "Identity checked at the registration desk"
}
```

Return authoritative state, not just a success message:

```json
{
  "attendance_id": 781,
  "event_id": 142,
  "user_id": 28,
  "status": "checked_in",
  "method": "coordinator_manual",
  "checkin_at": "2026-11-19T13:30:00Z",
  "recorded_by_user_id": 6,
  "already_checked_in": false
}
```

For an idempotent repeat, return the same canonical fields and set `already_checked_in: true`. The `method` and `checkin_at` must describe the existing server record; never replace them with the requested method or local device time.

### 5.4 Mobile contract correction

Change the repository contract so it does not require an earlier roster fetch just to discover the event and user IDs. Use one of these explicit signatures:

- `manualCheckIn(eventId, volunteerUserId, note?)`, or
- `manualCheckIn({ eventId, volunteerUserId, note? })`.

The UI already has a `CoordinatorAttendanceItem`; pass its `eventId` and `userId` directly. Keep `attendanceId` for confirmation/checkout operations whose API is actually attendance-row scoped.

After the POST:

- Map the returned authoritative DTO into the attendance domain model, or refetch the event roster.
- Do not fabricate `checkedInAt` with `new Date()`.
- Do not set `checkInMethod = 'manual'` if the server returned `qr_scan` or `geo`.
- Do not set `isPendingGeoConfirmation = false` unless the response confirms that the state is no longer pending.
- Show success only after the API returns success; show conflicts and validation errors from the backend.
- Remove the “(Demo)” label only after the real-HTTP integration test passes.

### 5.5 Manual check-in acceptance tests

Backend/PostgreSQL tests must cover:

- assigned volunteer + active event + required onboarding acknowledged -> `200`, status `checked_in`, method `coordinator_manual`, timestamp and actor populated;
- volunteer not assigned / attendance row missing -> stable `400` or `409` `not_assigned`;
- inactive/cancelled event -> denied;
- assignment cancelled -> denied;
- required onboarding not acknowledged -> denied;
- owner-as-monitor -> `403`;
- unrelated coordinator -> masked `404` where that is the repository's policy;
- unauthenticated caller -> `401`;
- repeated call -> idempotent response with original method and timestamp preserved;
- already checked-in by QR/GPS -> no relabel to manual and no loss of confirmation status;
- cancelled attendance row -> `409 invalid_state`;
- concurrent duplicate calls -> one effective state transition and deterministic response;
- request note and recorder identity appear in the attendance record/audit trail as intended.

Mobile tests must cover a direct call with no roster-cache warm-up, server timestamp mapping, failure state, retry after a network error, and stale roster refresh.

---

## 6. P1 remediation included in the plan

The findings supplied with the request remain in the plan. They are grouped by the dependency order required to keep the backend/client contract coherent.

| ID | Finding | Required correction | Gate |
|---|---|---|---|
| P1-01 | Phone remains aliased into email | Remove phone-to-email fallbacks from all profile mappers and `UserContext` bootstrap/verify fallback paths. `phone` must map only to `phone`; absent email stays `null`/undefined. | Domain mapping tests and profile API tests. |
| P1-02 | Donation merge helper is not supplied current profile | Either pass an authoritative current profile into `mapProfileUpdateRequest()` or make donation master/sub-flag merge an explicit server-side aggregate rule. Prefer server-side consistency for PATCH semantics. | Transition matrix for all master/sub-flag combinations and concurrent update test. |
| P1-03 | Manual assignment can synthesize fake assignment | Remove fabricated fallback domain object and first-managed-event fallback. Return a minimal mutation result with actual IDs, then refetch deterministically; otherwise return explicit sync failure. | HTTP repository tests for missing mapping/refetch error. |
| P1-04 | Coordinator feedback may return invented metrics | Remove hard-coded `{avgRating: 4.9, totalRatings: 10}`. Return source-backed values, empty/unavailable state, or typed error. | Use-case tests for absent repository and empty feedback. |
| P1-05 | DTOs leak from repositories/use cases | Introduce domain models and explicit mapping for history, capacity, UUID lookup, geo-attempt review, and charity taxonomy. Keep DTOs at transport boundary. | Type-level/domain mapping tests and repository contract tests. |
| P1-06 | Invite round trip is incomplete | Volunteer acceptance/rejection must reference the existing invite application ID, not create a new browse application. Verify coordinator creates invite -> volunteer sees it -> volunteer responds -> coordinator sees final status. | Backend transaction test plus mobile repository round-trip integration. |
| P1-07 | Mobile parity tests do not call the actual BFF | Add Django + PostgreSQL + real HTTP integration tests using the actual mobile `ApiClient` and HTTP repositories. Keep Jest mocks for unit tests only. | Required integration CI gate. |

Additional connected work:

- Resolve the manual check-in client cache dependency and local timestamp fabrication described in Section 5.
- Canonicalize route usage so mobile wrappers use one documented route. Keep older aliases only for compatibility.
- Correct pagination documentation to match the actual page/page-size contract; do not describe it as cursor pagination unless implemented.
- Regenerate the OpenAPI schema and compare the mobile wrappers against it.
- Regenerate the capability evidence ledger from source and test outputs; do not mark an operation “runtime verified” based only on a mock-client test.

---

## 7. Implementation sequence — backend before client before UI

No UI work should begin until Phase 4 is green. The following sequence is intentionally ordered by dependency.

### Phase 0 — Contract freeze and scope control

**Deliverables**

- Agree the endpoint names, request/response schemas, error codes, and status codes in Sections 4 and 5.
- Lock OTP code length (recommend six digits), OTP TTL, challenge TTL, attempt limit, and whether CIT is a production prerequisite.
- Define the current delivery status as console/dev only; no SMS provider work.
- Mark Friends and native GPS/geofence as deferred.
- Generate a baseline OpenAPI document from the current Django code and retain it for diffing.

**Exit criteria**

- No unresolved request/response field ownership.
- All mobile-used paths map to one canonical BFF operation.
- Every deferred capability is explicitly excluded from the UI's release acceptance criteria.

### Phase 1 — Database state and constraints (backend foundation)

**Work**

1. Add an OTP challenge table or equivalent database-first structure:
   - challenge token keyed hash (unique);
   - foreign key to exact `auth_otp` row;
   - purpose;
   - creation/expiry timestamps;
   - consumption timestamp;
   - optional request-id and identity nonce hash;
   - no raw challenge token, raw phone, or raw OTP.
2. Add a uniqueness constraint to prevent replay nonce reuse within its validity period.
3. Add/replace a stored function that verifies by challenge ID/hash, locks the challenge and exact OTP row, checks purpose and both expiry values, increments failed attempts, and consumes the successful challenge exactly once.
4. Preserve the existing phone-based request rate-limit trigger as the database ground truth.
5. Add cleanup/retention logic for expired OTP/challenge/nonce records. Ensure cleanup never deletes an active challenge or audit evidence prematurely.
6. Separate OTP-code HMAC and challenge-token hashing keys from phone-HMAC key usage. Add startup settings validation and a rotation plan.
7. Ensure six-digit OTP generation and matching tests.
8. Keep the existing DRF Token table and semantics unchanged in this release.
9. Add manual attendance mutation audit/result requirements only if the existing attendance audit record does not already capture the intended fields; do not create duplicate audit systems.

**Database tests**

- challenge/token hash is unique;
- challenge points to one OTP row;
- expiry cannot exceed OTP expiry;
- valid code succeeds once;
- second use fails as already consumed;
- wrong code increments attempts on the exact OTP row;
- parallel verify requests cannot both succeed;
- a new OTP request cannot make an older challenge verify against the new OTP;
- purpose mismatch fails;
- challenge expiry and OTP expiry are both enforced;
- existing phone rate limit still returns a controlled error.

**Exit criteria**

- SQL self-tests and Django tests pass against PostgreSQL, not SQLite substitutes.
- SQL schema source, upgrade script, rollback notes, and unmanaged Django model declarations agree.

### Phase 2 — Backend domain services

**Work**

1. Refactor auth request into clear steps: normalize/decrypt identity -> compute phone hash -> account policy -> generate OTP -> persist OTP + challenge atomically -> invoke current console adapter -> produce safe response.
2. Add server-side challenge creation and challenge-based verification service functions.
3. Keep provider integration abstract. The console adapter must report that delivery is simulated, not claim real SMS delivery.
4. Keep `dev_code` available only under a dedicated local/test feature flag; a production settings test must prove it is absent even if `DEBUG` is misconfigured.
5. Preserve account-closed/blocked semantics and ensure failed OTP attempts persist.
6. Issue the existing DRF token only after successful OTP consumption and user eligibility checks.
7. Add idempotency semantics for repeated request submissions where practical. Do not blindly retry a POST from the client; the server should recognize a request ID and return the same challenge when a transport retry is explicitly supported.
8. Correct manual attendance service semantics:
   - return structured result including whether already checked in;
   - preserve existing QR/geo methods and confirmation state on repeat;
   - map cancelled/invalid state to a stable domain conflict;
   - keep event manager and database-trigger checks authoritative.
9. Implement the P1-01 through P1-06 service/domain corrections where they belong; avoid pushing domain rules into React components.

**Exit criteria**

- Unit and service integration tests cover all service return/error states.
- No hard-coded user metrics, fabricated assignments, or fabricated attendance timestamps remain in HTTP repository response handling.

### Phase 3 — DRF BFF, route, schema, and contract completion

**Work**

1. Add `TokenizedOtpRequestSerializer` and `TokenizedOtpVerifySerializer` (or names agreed in Phase 0).
2. Add public request and verify views that call the new challenge services.
3. Add routes:
   - `POST /api/v1/auth/tokenized/request-otp/`
   - `POST /api/v1/auth/tokenized/verify-otp/`
4. Keep legacy OTP routes and serializers during rollout.
5. Add stable error response mapping for invalid challenge, expired challenge, invalid code, attempts exceeded, blocked account, and dependency failure.
6. Complete manual check-in response serialization and return the real database state.
7. Keep manual check-in authenticated; retain service-level event manager checks and PostgreSQL trigger checks. Hiding the button in monitor mode is UX only, not authorization.
8. Canonicalize path usage. Keep root aliases only as deprecated compatibility paths; the mobile client should consume one canonical `checkin/` namespace.
9. Regenerate `drf-spectacular` schema and document all auth and attendance operations, response bodies, status codes, and authentication requirements.
10. Add an authenticated, compact `GET /api/v1/me/bootstrap/` response (or an equivalent single canonical endpoint) for app startup after login. It should return the minimal user identity/profile summary, account status, coordinator application/status, and the capability state needed to route the user. This replaces the current two-request `getProfile()` + `getCoordinatorProfile()` bootstrap fan-out. Keep detailed profile and coordinator resources as separate endpoints for later screens.
11. Correct operation descriptions that currently imply native GPS capture is active; mark geo endpoint as backend capability currently not enabled in the mobile release.

**Exit criteria**

- `manage.py spectacular --validate` (or the repository's configured equivalent) succeeds.
- API tests prove route resolution, serializer allow-lists, HTTP status codes, permissions, and response field types.
- No route exists in the mobile wrapper without a matching BFF route and schema operation.

### Phase 4 — Backend integration gate (no UI yet)

This is the most important stop/go gate.

**Required test layers**

1. **PostgreSQL invariant tests:** stored functions, triggers, uniqueness, row locks, attempt counters, and check-in transitions.
2. **Django service tests:** domain orchestration and stable error translation.
3. **DRF API tests:** route, serializer, permissions, authentication, multipart where applicable, and response payload.
4. **OpenAPI contract tests:** generated schema matches the agreed snapshots and DTO source expectations.
5. **Real HTTP smoke tests:** start Django against PostgreSQL and call from a real HTTP transport. Do not inject a Jest fake `ApiClient` for these tests.

**Real HTTP scenarios**

- OTP request -> challenge token -> verify request containing challenge token + code only -> DRF token response -> one authenticated `/me/bootstrap/` request succeeds.
- OTP replay and parallel verify fail safely.
- Production settings do not return `dev_code`.
- Coordinator loads event roster -> manual check-in -> backend returns server timestamp and method -> refreshed roster shows the same value.
- Owner-as-monitor and unrelated coordinator cannot mutate the attendance row.
- Unauthenticated BFF calls return 401.
- A 401 clears client session; 403/404/409/429/5xx and network timeout do not silently clear it.

**CI**

Add a CI workflow if the repository does not already have one. It should provision PostgreSQL, apply the database SQL/migrations in the documented order, run backend tests, validate OpenAPI, run TypeScript/Jest tests, and run the real-HTTP integration suite. Store commit SHA, database version, commands, and result artifacts.

**Exit criteria**

- Phase 4 is green on a clean environment.
- The backend API contract is frozen and linked from the mobile implementation PR.
- No UI changes are merged ahead of this gate.

### Phase 5 — Mobile platform infrastructure

**Work**

1. Install and pin a supported secure-storage package such as `react-native-keychain`; update `package.json` and `package-lock.json` together. Validate Android Keystore and iOS Keychain behavior on real builds.
2. Remove `AsyncStorage` as a bearer-token fallback. In production HTTP mode, if secure storage is unavailable, fail closed with a controlled session-storage error rather than silently persisting a bearer token in an unencrypted store or memory.
3. Keep `MemoryTokenStore` as an injected test implementation only.
4. Expose storage capability without exposing token values. Add tests for set/get/clear, app restart persistence, logout, storage failure, and platform-specific behavior.
5. Keep the current `Authorization: Token ...` header and session invalidation behavior while the server still uses DRF Token.
6. Add correlation ID support and structured request timing to `ApiClient`. Never log Authorization, phone, OTP, CIT, or challenge token.
7. Do not automatically retry non-idempotent OTP or attendance POSTs. Use explicit idempotency keys only on operations for which the backend implements idempotency.
8. Ensure timeout timers are cleared and caller abort listeners are detached on all paths; test aborted and timed-out requests.
9. Implement the chosen CIT encryption wrapper only after a working React Native/Hermes proof-of-concept against the server JWE/HPKE implementation.

**Exit criteria**

- Secure token storage works on supported real Android/iOS builds.
- App restart restores session only from secure storage.
- No production configuration falls back to insecure storage.

### Phase 6 — Mobile DTOs, endpoint wrappers, repositories, and use cases

**Authentication**

1. Add typed challenge request/response and verify request/response DTOs.
2. `authApi.requestTokenizedOtp()` sends the agreed identity envelope or temporary phone payload plus purpose.
3. `authApi.verifyTokenizedOtp()` sends only challenge token, code, and optional display name.
4. Refactor `UserContext` to hold the challenge state separately from the DRF API token.
5. Store the DRF token only after the backend verifies the OTP.
6. Replace the current post-login/cold-start parallel profile + coordinator-profile requests with the single authenticated bootstrap endpoint from Phase 3.
7. Clear challenge token and OTP code after success, change-phone, resend, expiry, or cancellation.
8. Remove all phone-to-email fallbacks in `UserContext` and profile mappers.

**Attendance**

1. Expand `ManualCheckinResponseDto` to the authoritative response.
2. Change the coordinator repository contract to accept `eventId` and `volunteerUserId` explicitly; remove the `attendanceCache` prerequisite for manual check-in.
3. Map the response DTO to a domain attendance mutation result.
4. Refresh the event roster after the mutation or update the specific row from server fields.
5. Keep geo/QR DTOs isolated from domain types; do not expose transport DTOs to use cases.
6. Keep the geo repository methods dormant behind feature configuration until native geo is approved.

**Other remediation**

- Complete explicit mappers for P1-05.
- Fix donation patch semantics for P1-02.
- Fix invite round trip for P1-06.
- Remove fabricated assignment fallback for P1-03.
- Remove invented metrics for P1-04.

**Exit criteria**

- Repository/use-case tests use typed domain values, not transport DTOs.
- HTTP repository unit tests cover all failure and null/refetch cases.
- No mock-mode fixture is mistaken for a backend integration result.

### Phase 7 — UI integration (only after Phase 4 and 6)

**OTP login UI**

1. Phone entry creates one challenge and advances the screen to code entry.
2. Show delivery status honestly. A console/dev code banner appears only in development builds.
3. Validate the server-supplied `code_length` (or the locked six-digit constant if that is the final contract).
4. Verify with challenge token + code; the phone is not resent.
5. Show expired/invalid/locked states without clearing the user's phone unnecessarily.
6. Clear ephemeral challenge/code when the user changes the phone, requests a new challenge, completes login, or leaves the flow.
7. Save the DRF token only after verification success; then bootstrap the profile from the BFF.

**Coordinator attendance UI**

1. Show the attendance roster from the server.
2. Keep the manual action available only for rows whose current state permits it and when the coordinator has write capability.
3. Show a confirmation prompt before recording manual presence if the product wants an audit note.
4. Submit explicit event ID + volunteer user ID.
5. Render the exact server-returned method and timestamp.
6. On an idempotent response, display “Already checked in” and preserve the original method.
7. On 409/403/404/validation failure, keep the row's old state and show the returned error.
8. Remove `(Demo)` only after the real-HTTP path passes.

**UI exclusions**

- Friends screens and friend APIs remain Coming Soon.
- GPS capture, map pins, map navigation, location permission prompts, native geo check-in, and geo confirmation workflow are not part of this release's UI acceptance criteria.
- Do not show default/mock coordinates as if they were a real check-in location.

### Phase 8 — Staged rollout and legacy retirement

1. Deploy database changes first using an additive/expand migration.
2. Deploy backend supporting both legacy and challenge endpoints.
3. Run production-like smoke tests with provider still flagged as unconfigured; verify no false “SMS sent” state.
4. Release mobile that uses the challenge flow and secure storage.
5. Monitor legacy OTP endpoint usage and new challenge success/failure metrics.
6. Remove legacy phone-based verify only when the supported mobile version floor and observed traffic show it is safe.
7. Do not remove geo backend functions as part of this release; leave them dormant and document their deferred status.
8. Keep a rollback path for the new challenge endpoints and additive schema; do not roll back by deleting active OTP state mid-login.

---

## 8. Contract design rules to prevent future UI breakage

Use these rules for every BFF capability, not only login and attendance.

### 8.1 One source of truth per field

- Database owns persisted business state and state transitions.
- Service layer owns business orchestration and domain errors.
- DRF serializer owns wire validation and field allow-lists.
- DTO owns the JSON transport shape.
- Mapper owns DTO-to-domain conversion.
- Repository owns network access, caching, and data-source selection.
- Use case owns user-visible business operations.
- UI owns presentation and ephemeral form state only.

Do not recompute server-owned fields in the UI: status, check-in timestamps, assignment IDs, capacity values, eligibility, ownership, geo distance, or confirmation status.

### 8.2 Mutation response rule

Every mutation should return enough authoritative data for the client to render the result without guessing. When a full domain object is too large, return a typed mutation result containing real IDs and new status. A successful POST followed by a failed refetch must never produce a fabricated full domain object.

### 8.3 Error rule

The BFF must return stable machine-readable error codes. Mobile code must branch on status/code, not string-match a human sentence. Keep these cases distinct:

- 400: malformed request or business validation failure;
- 401: unauthenticated/invalid DRF token;
- 403: authenticated but explicitly forbidden;
- 404: masked or absent resource according to policy;
- 409: state conflict / already consumed / invalid transition;
- 429: throttling or attempt limit;
- 5xx: server or dependency failure.

Do not clear the local session for every non-2xx response. Continue clearing only on 401 unless a deliberate session-expiry contract is introduced.

### 8.4 Idempotency and retry rule

- GET may be retried with bounded backoff for network/transient failures.
- POST must not be retried automatically unless it has a server-supported idempotency key or the operation is explicitly idempotent.
- OTP issuance, OTP verification, manual check-in, QR redemption, assignment, and event transition need explicit semantics for duplicate requests.
- A network timeout does not prove the server failed to commit. The client should query/refetch state or repeat with the same idempotency key, not generate a different mutation blindly.

### 8.5 Route rule

- Keep one canonical route per operation under `/api/v1/`.
- Use path parameters for resources scoped by identity; use body fields for mutation values.
- Keep aliases only for a defined migration window; document the canonical route in the mobile endpoint file and OpenAPI.
- Validate that every mobile endpoint wrapper resolves to exactly one BFF view.

### 8.6 Version and schema rule

- Generate OpenAPI from the BFF after each backend contract change.
- Add schema snapshot/diff to CI.
- If a required or meaning-changing field is added, update serializer, OpenAPI, DTO, mapper, repository contract, mock implementation, and tests in the same change set.
- Do not write “100% parity” or “runtime verified” in a ledger unless a real HTTP integration test proves it.

### 8.7 Make the handshake efficient without coupling UI to the database

The current login success path stores the DRF token and then calls `refreshSessionUser()`. That method makes two HTTP requests in parallel (`getProfile()` and `getCoordinatorProfile()`). Cold-start bootstrap repeats the same fan-out. Replace that specific startup pattern with one small, authenticated bootstrap resource:

`GET /api/v1/me/bootstrap/`

Suggested response shape:

```json
{
  "user": {
    "id": 142,
    "uuid": "...",
    "display_name": "Volunteer",
    "phone": "+959********",
    "email": null,
    "account_status": "active",
    "verification_status": "none"
  },
  "coordinator": {
    "status": "none",
    "can_access_workspace": false
  },
  "capabilities": {
    "volunteer": true,
    "coordinator": false
  }
}
```

Rules for this endpoint:

- It is authenticated with the existing DRF token and is the single source for the initial app identity snapshot.
- Include only the fields needed to establish the session and route to the correct workspace. Do not include a complete profile, event list, attendance roster, or private volunteer T2 fields.
- Return actual `null` for absent email; never substitute the phone number or a fake example email.
- Derive capabilities server-side from account/coordinator state. UI role checks are navigation conveniences, not authorization.
- Keep detailed profile/coordinator endpoints available for feature screens. Do not make the bootstrap endpoint a catch-all aggregation endpoint.
- Add one query/service-level aggregation where possible and test its query count. Avoid one profile request plus one coordinator request after every login.

Other efficiency controls:

1. **OTP request/verify DB work:** index the challenge hash uniquely; index OTP lookups on the real predicate (`phone_hash`, `purpose`, unconsumed/created ordering) where the query plan demonstrates a benefit. Keep verify row locks narrow and lock challenge + OTP in a documented deterministic order.
2. **No speculative retries:** do not retry OTP request, verify, QR redemption, manual check-in, or other POSTs automatically after timeout. A timed-out POST may have committed. Use idempotency keys for supported mutations and refetch state when the outcome is uncertain.
3. **One in-flight request per form action:** disable submit while sending, debounce repeated taps, and use a stable request/idempotency ID where the backend supports it.
4. **Small mutation responses:** return identifiers and authoritative fields needed to update the client, not entire event aggregates. Fetch larger detail only when the screen needs it.
5. **Batch list data:** avoid mobile-side N+1 fan-out such as fetching one event summary per event after loading a coordinator event list. Either include safe summary fields in the list serializer or expose a paged summary endpoint with all needed counts. Do not make one API call per roster row.
6. **Read caching only where safe:** event descriptions/taxonomy may be cached with clear invalidation; authentication state, permissions, current attendance status, pending decisions, and one-time tokens must come from the server and be refreshed after mutations.
7. **Connection pooling as measured infrastructure:** reuse Django database connections and add PgBouncer only if the deployed environment needs it and transaction-pooling compatibility is verified. Do not claim a <5 ms connection acquisition without measurements.
8. **Correlated timing:** accept or generate a request ID; log request ID, endpoint, status, server duration, and DB duration. Never include phone, OTP, challenge token, CIT, Authorization, or raw location fields in logs.
9. **Performance budgets:** measure P50/P95/P99 for request OTP, verify, bootstrap, and manual check-in under representative load. Keep client network time distinct from BFF and database time.

The result is fewer startup round trips, better observability, explicit retry semantics, and no client-side recreation of backend state.

---

## 9. Priority breakdown and implementation tickets

### P0 — Must complete before the mobile UI is treated as connected

| Ticket | Scope | Completion proof |
|---|---|---|
| AUTH-01 | Add OTP challenge DB table/function with exact `auth_otp` row binding | PostgreSQL tests prove one-time consumption and replay/race behavior. |
| AUTH-02 | Add challenge request/verify service and BFF routes | DRF API tests + OpenAPI schema. |
| AUTH-03 | Align OTP length, TTL, attempt counter, and safe dev-code behavior | Backend/mobile contract tests; production config cannot return `dev_code`. |
| AUTH-04 | Separate cryptographic key purposes and document key rotation | Settings validation + crypto helper tests. |
| AUTH-05 | Make secure storage a declared required mobile dependency | Real Android/iOS storage test; no insecure production fallback. |
| ATT-01 | Return authoritative manual check-in mutation DTO | API tests include timestamp, recorder, current method, idempotent indicator. |
| ATT-02 | Remove manual check-in cache precondition and local timestamp fabrication | Mobile HTTP repository tests without warm cache and actual BFF HTTP integration. |
| INT-01 | Run actual mobile ApiClient/HTTP repositories against Django + PostgreSQL | CI artifact includes commit, environment, command, and successful test result. |

### P1 — Complete before declaring the full BFF/mobile connection clean

| Ticket | Scope | Completion proof |
|---|---|---|
| MAP-01 | Phone/email field separation | Mapper and UserContext tests. |
| MAP-02 | Donation master/sub-flag aggregate consistency | Full transition matrix. |
| REPO-01 | Remove fabricated assignment result and arbitrary event fallback | HTTP repository failure-path tests. |
| USE-01 | Remove hard-coded coordinator feedback statistics | Use-case test with no source repository. |
| MAP-03 | Add domain models/mappers for all exposed transport DTOs | DTO/domain boundary tests. |
| INV-01 | Complete invite application response round trip | Backend + mobile end-to-end test over real HTTP. |
| API-01 | Canonicalize BFF paths and regenerate OpenAPI | Route matrix test and schema diff. |
| EVID-01 | Regenerate capability evidence ledger from source and integration output | Ledger references real test names/commit and marks unverified rows honestly. |

### Deferred — do not pull into this implementation batch

| Item | Reason | Re-entry condition |
|---|---|---|
| Native GPS/geofence mobile integration | User explicitly excludes native geo mapping from this session; package and permission work is incomplete. | Approved native module, real-device permission tests, full metadata propagation, privacy review, and backend integration test. |
| Friends | User requests Coming Soon treatment. | Separate product scope and API/domain design. |
| SMS provider integration | Network provider is a later integration. | Provider selected, credentials/secrets plan, delivery SLA and compliance agreed. |
| Durable asynchronous OTP delivery and failover | Requires provider integration and queue operations. | Provider integration approved; durable queue/outbox, retries, idempotency, and delivery observability designed. |
| Mobile certificate pinning | The uploaded document specifies it, but no pinning library/config was verified in this source pass. | Threat model, certificate rotation strategy, platform proof-of-concept, and release/rollback process approved. |

---

## 10. Definition of Done

The release can be called “backend/client handshake ready” only when all applicable items below are true.

### Backend and database

- [ ] Additive SQL upgrade and rollback strategy are reviewed.
- [ ] OTP challenge has cryptographically random opaque token, stored only as keyed hash.
- [ ] Challenge binds to exact OTP row and is single-use under concurrent verification.
- [ ] Code expiry, challenge expiry, attempt count, per-phone rate limit, and purpose are enforced.
- [ ] Phone, OTP, CIT, challenge token, and DRF token are absent from logs.
- [ ] `dev_code` is impossible in production configuration.
- [ ] DRF returns the existing bearer-token format only after successful verification.
- [ ] One authenticated bootstrap endpoint returns the minimal session identity/capability summary.
- [ ] Manual check-in authorizes event managers, validates attendance/assignment/onboarding/event state, is auditable, and preserves idempotent semantics.
- [ ] Manual check-in response contains authoritative server state.
- [ ] BFF routes and OpenAPI agree with documented DTOs.

### Mobile data layer

- [ ] Secure storage dependency is installed and locked.
- [ ] Production HTTP mode never silently falls back to AsyncStorage or memory for bearer tokens.
- [ ] Challenge token is kept separate from the DRF bearer token.
- [ ] Verify request contains no phone number.
- [ ] Login and cold-start session bootstrap use one compact profile/capability request, not two independent profile requests.
- [ ] Endpoint wrapper paths match canonical routes.
- [ ] Mappers do not map phone to email or invent server fields.
- [ ] Manual check-in does not require a cached roster and uses the BFF's timestamp/method/status.
- [ ] Mock repositories implement the same domain contract but are never used as evidence of real backend connectivity.

### Integration and UI

- [ ] Actual HTTP integration test performs OTP request/verify/authenticated profile flow.
- [ ] Actual HTTP integration test performs coordinator manual check-in and roster refresh.
- [ ] Authorization negative tests pass.
- [ ] App restart, logout, 401, timeout, and duplicate submission behaviors are tested.
- [ ] OTP screen handles challenge expiry, resend/change-phone, and development-only code behavior.
- [ ] Coordinator attendance screen labels manual check-in as live only after integration gates pass.
- [ ] Friends is marked Coming Soon and does not block release.
- [ ] GPS/map/native location is not presented as active in this release.

---

## 11. Risk register

| Risk | Consequence | Mitigation |
|---|---|---|
| Challenge row not atomically bound to OTP row | A code from one request may be accepted against another request or parallel resend state. | Exact `otp_id` binding, row locks, one-time challenge consumption, race tests. |
| Client encrypts phone with a shared secret embedded in app | Secret can be extracted; encryption provides false assurance. | Public-key JWE/HPKE only, or defer CIT; never ship a shared server secret in the app. |
| CIT implemented without nonce persistence | Captured encrypted envelope can be replayed until expiry. | Unique nonce persistence/atomic consume and timestamp validation. |
| `dev_code` accidentally returned in production | OTP bypass/leak. | Dedicated flag, production startup check, response tests with DEBUG-independent safety. |
| Secure storage silently falls back | Session token lost on app restart or persisted insecurely. | Declared native dependency, production fail-closed behavior, real-device tests. |
| Client retries a POST after timeout | Duplicate OTP/check-in or inconsistent UI. | Server idempotency semantics and no blind POST retry. |
| Manual check-in relies on roster cache | Operation fails on direct entry or stale cache. | Explicit event/user IDs in repository contract. |
| Client fabricates check-in timestamp/status | UI disagrees with database and audit trail. | Use authoritative response or refetch. |
| Geo feature accidentally appears enabled | Mock/default location might be mistaken for real presence. | Feature gate and explicit UI exclusion until native integration is complete. |
| “500ms end-to-end” is promised without measurement | Misleading SLA and incorrect release confidence. | Instrument and publish measured P95/P99 separately for BFF and client round trip. |
| Legacy and tokenized routes diverge during rollout | Users on old clients cannot log in. | Dual-route support, telemetry, minimum supported app version, staged retirement. |

---

## 12. Exact implementation order summary

The required order is:

1. **Freeze contracts and release scope.**
2. **Implement PostgreSQL challenge/OTP state and invariants.**
3. **Implement backend auth and manual check-in services.**
4. **Implement BFF serializers, views, routes, errors, and OpenAPI.**
5. **Pass PostgreSQL, Django API, schema, and real-HTTP backend gates.**
6. **Implement mobile secure storage and API transport.**
7. **Implement mobile DTOs, endpoint wrappers, mappers, repositories, and use cases.**
8. **Pass mobile-to-BFF integration tests.**
9. **Wire OTP and manual-check-in UI.**
10. **Roll out with legacy auth compatibility; retire only after measured adoption.**

This sequence keeps the UI dependent on a proven backend contract rather than letting screen implementation define API behavior. It also allows the manual coordinator attendance flow to ship without waiting for native GPS/map support or a telecom provider.

---

## 13. Source files reviewed

The plan is based on the repository baseline listed at the top and the following source areas:

**Backend auth/security**

- `backend/services/auth_service.py`
- `backend/common/security.py`
- `backend/bff/auth/serializers.py`
- `backend/bff/auth/views.py`
- `backend/bff/auth/urls.py`
- `backend/config/urls.py`
- `backend/bff/urls.py`
- `postgres_sql/updated_volunteer_coordination_system_Database.sql` (`auth_otp`, `request_otp`, `verify_otp`, OTP rate trigger)

**Backend attendance**

- `backend/services/attendance_service.py`
- `backend/services/geo_service.py`
- `backend/bff/checkin/serializers.py`
- `backend/bff/checkin/views.py`
- `backend/bff/checkin/urls.py`
- `backend/apps/attendance/models.py`
- `backend/apps/attendance/tests/test_bff_checkin_phase7.py`
- `backend/apps/attendance/tests/test_services_phase7.py`
- `postgres_sql/updated_volunteer_coordination_system_Database.sql` (`attendance`, `trg_attendance_guard`, `geo_check_in`, `v_event_checkin_board`)

**Mobile**

- `mobile/src/core/api/apiClient.ts`
- `mobile/src/core/auth/tokenStore.ts`
- `mobile/src/core/auth/sessionManager.ts`
- `mobile/src/app/UserContext.tsx`
- `mobile/src/data/dto/authDto.ts`
- `mobile/src/data/dto/checkinDto.ts`
- `mobile/src/data/endpoints/authApi.ts`
- `mobile/src/data/endpoints/checkinApi.ts`
- `mobile/src/data/endpoints/coordinatorApi.ts`
- `mobile/src/data/http/HttpCoordinatorRepository.ts`
- `mobile/src/features/auth/screens/OtpLoginScreen.tsx`
- `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx`
- `mobile/src/features/coordinator/components/AttendanceRow.tsx`
- `mobile/package.json`
- `mobile/package-lock.json`

**User-provided design source**

- `tokenization_login_architecture.md` — reviewed as an architectural proposal. The provider adapters, asynchronous dispatcher, failover circuit breaker, 500 ms latency figures, hardware-backed storage claims, and “zero-cleartext” invariant are treated as proposed target content, not as evidence that those features are present or should all be built in this release.

---

## 14. Final recommendation

Proceed with a backend-first v0.12.0 implementation. Ship **session-bound OTP verification** and **coordinator manual on-site check-in** as the two handshake paths to prove first. Keep the existing DRF token for authenticated application requests. Make secure storage a real declared dependency. Complete the P1 contract/data-integrity corrections and real HTTP integration harness before screen work is accepted.

Do not block this release on Friends, GPS/map/native location, or telecom-provider integration. Keep each clearly marked as deferred, preserve the existing server capability where appropriate, and only re-enable it through a separately tested implementation phase.
