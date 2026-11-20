# Phase 0 Baseline Freeze, Contract Lock & Scope Ledger (v0.12.0)

**Document ID:** `DOC-BL-v0.12.0-PHASE-0`  
**Milestone Version:** `v0.12.0`  
**Status:** COMPLETE / FROZEN  
**Audit Date:** 19 November 2026  
**Primary Reference:** `reference/v0_12_0_backend_client_handshake_plan.md`  
**Execution Prompt Reference:** `reference/agent_execution_prompt_v0_12_0_handshake.md`  
**Baseline Git Commit:** `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a` (`Merge branch 'mobile'`)  
**Current HEAD Commit:** `1c0f238` (Branch: `mobile`, zero route/contract drift against baseline)  
**Baseline OpenAPI Snapshot:** `docs/baseline/openapi_baseline_v0_12_0.yaml`  

---

## 1. System Baseline & Environment Pre-Flight Verification

### 1.1 Git Baseline & Repository Integrity
- **Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`
- **Baseline Commit (Plan):** `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a`
- **Active Working Branch:** `mobile`
- **Working Tree Evaluation:** `git diff 7ae7fa17c77edc055d3919ac24cdef61b7b80c3a HEAD -- backend/bff mobile/src/data/endpoints` confirmed **zero diff / zero drift** in BFF routing and mobile endpoint wrappers.
- **Source Code Immutability in Phase 0:** Zero application code, Django models, views, serializers, stored procedures, or mobile UI/service code was modified during Phase 0.

### 1.2 Runtime Environment State
1. **Python Virtual Environment (`.venv`):**
   - Active Python version: Python 3.12 (venv).
   - `python manage.py check`: Passed cleanly with `System check identified no issues (0 silenced)`.
2. **PostgreSQL Database:**
   - Active database: Local PostgreSQL instance configured with `btree_gist` extension.
   - Django PostgreSQL test suite: Verified against `test_volunteer_coordination_db` with `Ran 40 tests in 1.208s - OK`. Zero SQLite fallback permitted.
3. **OpenAPI Schema Generation (`drf-spectacular`):**
   - Validation: `python manage.py spectacular --file docs/baseline/openapi_baseline_v0_12_0.yaml --validate` executed with exit code 0.
   - Output size: 206,614 bytes (OpenAPI 3.0.3 specification capturing all active endpoints, schemas, tags, and security schemes).
4. **Mobile Environment (`mobile/`):**
   - Jest Test Suite: `npm --prefix mobile test -- --watchAll=false` executed with `Test Suites: 32 passed, 32 total; Tests: 511 passed, 511 total`.
   - TypeScript Static Check: `npx tsc --noEmit` executed with exit code 0 and zero type diagnostics.

---

## 2. Mandatory 5-Point Baseline Source Inspection

As mandated by Part 1 Section 3 of `agent_execution_prompt_v0_12_0_handshake.md`, the five core baseline files were inspected:

| # | File Path | Baseline Findings & Verification |
|---|---|---|
| 1 | `postgres_sql/updated_volunteer_coordination_system_Database.sql` | `auth_otp` (lines 356–380) enforces `attempt_count BETWEEN 0 AND 100`, `expires_at > created_at`. `request_otp()` (lines 1263–1275) creates OTP rows with TTL from `setting_int('otp_ttl_minutes')`. `verify_otp()` (lines 1279–1310) locks the latest unconsumed row (`FOR UPDATE`), checks expiry and max attempts, increments attempt count on mismatch, and consumes on success. `trg_attendance_guard()` (lines 2618–2750) strictly validates legal attendance status transitions, event active status, valid assignment, and onboarding acknowledgment. |
| 2 | `backend/services/auth_service.py` & `backend/common/security.py` | `auth_service.py` sets `OTP_CODE_LENGTH = 4` (prototype mismatch with mobile 6 digits). Uses `ConsoleOtpDeliveryAdapter`. `security.py` utilizes `PHONE_HASH_HMAC_SECRET` for both phone hashing and OTP hashing. Requires key separation (`OTP_CODE_HMAC_SECRET`, `AUTH_SESSION_TOKEN_SECRET`). |
| 3 | `backend/services/attendance_service.py` & `backend/bff/checkin/views.py` | `manual_check_in()` locks attendance row with `select_for_update()`, validates write permission via `get_event_for_manager_or_404(actor, event_id, require_write=True)`, sets `status='checked_in'`, `method='coordinator_manual'`. Returns existing row idempotently if already `checked_in` or `completed`. `AttendanceManualCheckinView` returns minimal response `{"id": att.id, "status": att.status, "method": att.method}`; must be upgraded to full canonical mutation payload. |
| 4 | `backend/bff/urls.py` & `backend/bff/auth/urls.py` | `bff/urls.py` mounts `auth/`, `volunteer/`, `checkin/`, `coordinator/`, plus root compatibility includes `path('', include('bff.volunteer.urls'))`, `path('', include('bff.coordinator.urls'))`, `path('', include('bff.checkin.urls'))`. `bff/auth/urls.py` contains legacy `otp/request/`, `request-otp/`, `otp/verify/`, `verify-otp/`, and `logout/`. |
| 5 | `mobile/src/core/api/apiClient.ts` & `mobile/src/core/auth/tokenStore.ts` | `ApiClient` handles standard HTTP headers, JSON/FormData, timeout controller, and triggers `sessionManager.handleUnauthorized()` strictly on HTTP 401. `tokenStore.ts` dynamically resolves keychain -> secure_store -> async_storage -> memory fallback; fails closed in production HTTP mode. |

---

## 3. Mobile Endpoint Wrapper to BFF Route Matrix Audit

Detailed mapping of all wrappers in `mobile/src/data/endpoints/` against `backend/bff/urls.py`:

### 3.1 Authentication Routes (`authApi.ts` vs `backend/bff/auth/urls.py`)

| Wrapper Method | Client URL Path | BFF Route Pattern | HTTP Method | Route Classification | Status / Action |
|---|---|---|---|---|---|
| `authApi.requestOtp` | `auth/otp/request/` | `path("otp/request/", OtpRequestView)` | POST | Legacy OTP Request | Active during rollout; resends phone. Will be complemented by `POST /api/v1/auth/tokenized/request-otp/`. |
| `authApi.verifyOtp` | `auth/otp/verify/` | `path("otp/verify/", OtpVerifyView)` | POST | Legacy OTP Verify | Active during rollout; resends phone. Will be complemented by `POST /api/v1/auth/tokenized/verify-otp/`. |
| `authApi.logout` | `auth/logout/` | `path("logout/", LogoutView)` | POST | Canonical Auth | Retained unchanged; invalidates server session. |
| *(None - Phase 2)* | `auth/tokenized/request-otp/` | *To be added in Phase 2* | POST | Target Handshake | Creates challenge bound to `auth_otp.id`; returns `auth_session_token`. |
| *(None - Phase 2)* | `auth/tokenized/verify-otp/` | *To be added in Phase 2* | POST | Target Handshake | Verifies `auth_session_token` + `code` without phone number. |

### 3.2 Check-in & Attendance Routes (`checkinApi.ts` & `coordinatorApi.ts` vs `backend/bff/checkin/urls.py`)

| Wrapper Method | Client URL Path | BFF Route Pattern | Canonical Status | Notes |
|---|---|---|---|---|
| `checkinApi.manualCheckIn` | `checkin/attendance/manual-checkin/` | `path("attendance/manual-checkin/", AttendanceManualCheckinView)` under `checkin/` prefix | **Canonical** | Preferred canonical mobile route. Returns authoritative mutation payload. |
| `coordinatorApi.manualCheckIn` | `attendance/manual-checkin/` | `path("attendance/manual-checkin/", AttendanceManualCheckinView)` under root `''` include | **Deprecated Alias** | Must be migrated to use `checkinApi.manualCheckIn()` canonical route in Phase 5. Root alias kept on backend for backward compatibility. |
| `checkinApi.qrCheckIn` | `checkin/attendance/qr-checkin/` | `path("attendance/qr-checkin/", AttendanceQrCheckinView)` | Canonical | Check-in only QR redemption. |
| `checkinApi.submitGeoCheckIn` | `checkin/attendance/geo-checkin/` | `path("attendance/geo-checkin/", AttendanceGeoCheckinView)` | Canonical (Dormant) | Backend GPS verification logic retained; mobile native UI deferred. |
| `checkinApi.checkoutAttendance` | `checkin/attendance/${id}/checkout/` | `path("attendance/<int:attendance_id>/checkout/", AttendanceCheckoutView)` | Canonical | Volunteer/manager shift checkout. |
| `checkinApi.getOnboarding` | `checkin/events/${id}/onboarding/` | `path("events/<int:event_id>/onboarding/", EventOnboardingView)` | Canonical | Volunteer briefing retrieval. |
| `checkinApi.acknowledgeOnboarding` | `checkin/events/${id}/onboarding/acknowledge/` | `path("events/<int:event_id>/onboarding/acknowledge/", EventOnboardingAcknowledgeView)` | Canonical | Append-only safety sign-off. |
| `checkinApi.resolveQrToken` | `checkin/qr/resolve/` | `path("qr/resolve/", QrResolveView)` | Canonical | Public QR preview. |
| `checkinApi.redeemQrToken` | `checkin/qr/redeem/` | `path("qr/redeem/", QrRedeemView)` | Canonical | Authenticated QR redemption. |
| `checkinApi.createCoordinatorQrToken` | `checkin/coordinator/events/${id}/qr-tokens/` | `path("coordinator/events/<int:event_id>/qr-tokens/", QrTokenCreateView)` | Canonical | Coordinator QR generation. |
| `checkinApi.revokeCoordinatorQrToken` | `checkin/coordinator/qr-tokens/${id}/revoke/` | `path("coordinator/qr-tokens/<int:qr_id>/revoke/", QrTokenRevokeView)` | Canonical | Coordinator QR revocation. |
| `checkinApi.getGeoAttempts` | `checkin/coordinator/events/${id}/geo-attempts/` | `path("coordinator/events/<int:event_id>/geo-attempts/", CoordinatorGeoAttemptsView)` | Canonical | Audit telemetry review. |
| `coordinatorApi.confirmAttendance` | `coordinator/attendance/${id}/confirm/` | `path("coordinator/attendance/<int:attendance_id>/confirm/", CoordinatorConfirmAttendanceView)` | Canonical | Confirms geo check-in. |
| `coordinatorApi.rejectAttendance` | `coordinator/attendance/${id}/reject/` | `path("coordinator/attendance/<int:attendance_id>/reject/", CoordinatorRejectAttendanceView)` | Canonical | Rejects geo check-in. |
| `coordinatorApi.getAttendanceRoster` | `coordinator/events/${id}/attendance/` | `path("coordinator/events/<int:event_id>/attendance/", CoordinatorAttendanceBoardView)` | Canonical | Attendance board view. |
| `coordinatorApi.getPendingGeoConfirmations` | `coordinator/events/${id}/attendance/pending/` | `path("coordinator/events/<int:event_id>/attendance/pending/", CoordinatorPendingConfirmationsView)` | Canonical | Pending confirmation board. |

### 3.3 Event, Profile & Volunteer Routes (`eventApi.ts` & `profileApi.ts` vs BFF)

| Wrapper Method | Client URL Path | BFF Route Pattern | Classification | Notes |
|---|---|---|---|---|
| `eventApi.getCharityFields` | `charity-fields/` | `volunteer.urls` | Canonical | Public taxonomy. |
| `eventApi.getEvents` | `events/` | `volunteer.urls` | Canonical | Public event listing. |
| `eventApi.getEventDetail` | `events/${id}/` | `volunteer.urls` | Canonical | Public event details. |
| `eventApi.getEventPosts` | `events/${id}/posts/` | `volunteer.urls` | Canonical | Open post list. |
| `eventApi.applyToEvent` | `events/${id}/apply/` | `volunteer.urls` | Canonical | Volunteer application. |
| `eventApi.getMyApplications` | `me/applications/` | `volunteer.urls` | Canonical | My applications. |
| `eventApi.withdrawApplication` | `applications/${id}/withdraw/` | `volunteer.urls` | Canonical | Application withdrawal. |
| `eventApi.getMyAssignments` | `me/assignments/` | `volunteer.urls` | Canonical | Volunteer assignments. |
| `eventApi.confirmAssignment` | `assignments/${id}/confirm/` | `volunteer.urls` | Canonical | Shift confirmation. |
| `eventApi.cancelAssignment` | `assignments/${id}/cancel/` | `volunteer.urls` | Canonical | Shift cancellation. |
| `profileApi.getProfile` / `updateProfile`| `me/` | `volunteer.urls` | Canonical | Profile GET / PATCH. |
| `profileApi.getCharityInterests` | `me/charity-interests/` | `volunteer.urls` | Canonical | Volunteer interests. |
| `profileApi.getAvailability` | `me/availability/` | `volunteer.urls` | Canonical | Weekly schedules. |
| `profileApi.getVerificationStatus` | `me/verification-images/`| `volunteer.urls` | Canonical | Identity verification. |
| `profileApi.getCoordinatorProfile` | `me/coordinator/` | `volunteer.urls` | Canonical | Coordinator application status. |
| `profileApi.lookupUserByUuid` | `users/by-uuid/${uuid}/` | `volunteer.urls` | Canonical | Public UUID lookup. |
| `profileApi.getAttendanceHistory` | `checkin/me/attendance/` | `checkin.urls` | Canonical | Volunteer attendance history. |
| `profileApi.getFeedbackSummary` | `checkin/me/feedback/` | `checkin.urls` | Canonical | Feedback rating summary. |

---

## 4. Locked v0.12.0 Contract Parameters

The following parameters and specifications are locked for Release v0.12.0:

### 4.1 OTP & Challenge Security Specifications
1. **Standardized OTP Code Length:**
   - Locked to **6 numeric digits** (`^\d{6}$`).
   - Replaces the 4-digit prototype length across database constraints, stored functions, Django backend services, serializers, and mobile input validation.
2. **Challenge Token Structure & Storage:**
   - 256-bit cryptographically secure random token generated via `secrets.token_bytes(32)`.
   - Never stored raw in the database; stored only as a keyed HMAC hash: `HMAC-SHA256(AUTH_SESSION_TOKEN_SECRET, raw_token)`.
   - Single-use consumption enforced atomically in PostgreSQL.
3. **Challenge TTL & Expiry Clock Constraint:**
   - Maximum challenge TTL: **180 seconds** (3 minutes).
   - Enforced database invariant: `challenge.expires_at <= otp.expires_at`.
   - Effective challenge expiration: `min(issued_at + 180s, otp.expires_at)`.
   - Both challenge expiry and parent OTP expiry clocks are checked and enforced at verification time.
4. **Attempt Limits & Row Locking:**
   - Maximum failed attempts: **5 attempts** per OTP row (controlled via `setting_int('otp_max_attempts')`).
   - Deterministic row locking order on verification: Challenge row locked first, then linked `auth_otp` row locked `FOR UPDATE`.
   - Failed verification attempts increment `attempt_count` on the exact bound `auth_otp` row without rolling back.
5. **Key Separation & Cryptographic Isolation:**
   - `PHONE_HASH_HMAC_SECRET`: Strictly reserved for phone number HMAC hashing.
   - `OTP_CODE_HMAC_SECRET`: Dedicated secret for OTP code HMAC generation and verification.
   - `AUTH_SESSION_TOKEN_SECRET`: Dedicated secret for opaque challenge token HMAC hashing.
   - `PHONE_ENCRYPTION_KEY`: Reserved for Fernet phone symmetric encryption.
   - Startup settings validation will fail fast if any key is missing or reused.

### 4.2 Three Credentials Separation Model

```
+----------------------------------------------------------------------------------------------------+
| 1. Client Identity Envelope (CIT / JWE / HPKE) [OPTIONAL / GATED]                                 |
|    - Purpose: Encrypts raw phone from device to BFF against TLS-terminating proxies.               |
|    - Status: Gated behind React Native crypto spike; session-bound handshake implemented first.     |
+----------------------------------------------------------------------------------------------------+
| 2. Auth Session Token (auth_session_token) [ONE-TIME CHALLENGE CREDENTIAL]                         |
|    - Purpose: Binds verify request to the exact auth_otp database record.                          |
|    - Characteristics: 256-bit opaque string, 180s TTL, single-use, stored as keyed hash.           |
|    - RESTRICTION: Never used as a Bearer token; never passed in HTTP Authorization header.         |
+----------------------------------------------------------------------------------------------------+
| 3. DRF Authentication Token (Token <key>) [LONG-LIVED API SESSION]                                |
|    - Purpose: Standard bearer token for all authenticated BFF requests.                            |
|    - Transmission: 'Authorization: Token <token>'                                                  |
|    - Storage: Hardware-backed secure storage (Keychain / SecureStore); fails closed in production. |
+----------------------------------------------------------------------------------------------------+
```

### 4.3 Stable Machine-Readable Error Contract

All tokenized auth endpoints and check-in endpoints must adhere to the standardized error codes:

| HTTP Status | Error Code | Domain Meaning | Logging / Redaction Guard |
|---:|---|---|---|
| **400** | `invalid_identity_token` | Client Identity Envelope (CIT) cannot be decrypted or decoded. | Redact raw payload. |
| **400** | `invalid_challenge` | Challenge token is unknown, malformed, expired, or purpose mismatch. | Do not disclose whether phone exists. |
| **400** | `invalid_code` | OTP numeric code does not match; failed attempt counter incremented. | Redact raw code. |
| **400 / 410** | `challenge_expired` | Challenge TTL or parent OTP row TTL has expired. | Choose 400 with `challenge_expired`. |
| **403** | `account_blocked` | Account is suspended or blocked from logging in. | Audit event logged. |
| **403** | `account_closed` | Account has been permanently closed. | Audit event logged. |
| **409** | `challenge_consumed`| Challenge token has already been consumed (replay / duplicate race). | Single-use guard triggered. |
| **409** | `invalid_state` | Attendance status transition disallowed (e.g. cancelled -> checked_in).| Maintain DB trigger invariant. |
| **429** | `otp_rate_limited` | Phone, IP, or challenge exceeded maximum attempts or rate limits. | Rate trigger enforced. |
| **503** | `service_unavailable`| Database connection failure or internal dependency unavailable. | Never convert 5xx to success. |

### 4.4 Canonical Manual Check-in Specification

**Route:** `POST /api/v1/checkin/attendance/manual-checkin/`  
**Permissions:** Authenticated Coordinator (`IsAuthenticated` + write permissions on event)  
**Request Payload:**
```json
{
  "event_id": 142,
  "user_id": 28,
  "note": "Identity verified at event registration desk"
}
```

**Authoritative Server Response (200 OK):**
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

**Idempotent Repeat Response (200 OK):**
When the volunteer is already `checked_in` or `completed`:
```json
{
  "attendance_id": 781,
  "event_id": 142,
  "user_id": 28,
  "status": "checked_in",
  "method": "qr_scan",
  "checkin_at": "2026-11-19T13:15:22Z",
  "recorded_by_user_id": null,
  "already_checked_in": true
}
```
*Guards:*
- `method` and `checkin_at` reflect the authoritative server row; never overwritten with request values.
- Existing `geo` or `qr_scan` method is preserved.
- Existing pending geo-confirmation status is never cleared by an idempotent manual check-in.

---

## 5. Explicit Deferrals & Scope Locks

The following capabilities are explicitly declared **OUT OF SCOPE** for Release v0.12.0:

1. **SMS Provider Integration:**
   - No external telecom integrations (Twilio, AWS SNS, Firebase Phone Auth, SMPP).
   - Adapter boundary remains `ConsoleOtpDeliveryAdapter`.
   - Truthful delivery reporting: Status is `dev_code_available` (in local/test mode) or `provider_not_configured` (in production mode). Never claim SMS was dispatched.
   - `dev_code` is gated behind an explicit test feature flag, impossible to expose in production even if `DEBUG` is true.
2. **Native GPS / Geofence Check-in UI:**
   - Dormant backend PostgreSQL function `geo_check_in()` and BFF endpoint remain intact.
   - No native device GPS packages (`@react-native-community/geolocation`), maps, or location permission prompts added to release UI.
   - No simulated/mocked coordinates in mobile UI screens.
3. **Friends & Social Features:**
   - Friends capability remains visibly marked as "Coming Soon".
4. **Certificate Pinning & Async Dispatchers:**
   - Deferred to subsequent hardening releases.

---

## 6. P1 Remediation Alignment (Sections 6 & P1-01 to P1-07)

The plan integrates seven critical P1 architectural remediations:
- **P1-01 (Phone Aliasing):** Remove phone-to-email fallback across all profile mappers and `UserContext`. Phone maps only to phone; absent email remains null.
- **P1-02 (Donation Merge):** Enforce server-side consistency for donation flag PATCH operations; do not assume client knows current profile state.
- **P1-03 (No Fabricated Assignments):** Remove synthesized assignment fallback objects. Return actual mutation IDs and refetch deterministically.
- **P1-04 (No Invented Metrics):** Remove hard-coded feedback ratings (`{avgRating: 4.9, totalRatings: 10}`). Return source-backed or empty/unavailable state.
- **P1-05 (DTO Boundary Isolation):** Keep transport DTOs isolated from repositories and use-cases via explicit domain mappers.
- **P1-06 (Invite Round Trip):** Verify coordinator invite -> volunteer response -> coordinator status lifecycle references valid invite application IDs.
- **P1-07 (Real HTTP Parity Gate):** Gate mobile UI integration on real HTTP and PostgreSQL integration tests, not just Jest mock tests.

---

## 7. Phase 0 Verification & Confirmation

1. `python manage.py check`: Passed (0 issues).
2. `python manage.py spectacular --file docs/baseline/openapi_baseline_v0_12_0.yaml --validate`: Generated valid 206 KB OpenAPI 3.0.3 schema snapshot.
3. `npm test` in `mobile/`: 32 test suites passed, 511 tests passed.
4. `npx tsc --noEmit` in `mobile/`: Zero TypeScript compilation errors.
5. PostgreSQL Django test suite: Ran 40 capability tests against PostgreSQL with 0 failures.
6. Baseline route matrix, locked contract parameters, and scope boundaries fully documented and frozen.
