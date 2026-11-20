# `agent_execution_prompt_v0_12_0_handshake.md`

## Part 1: Global Coding Requirements & Specifications

> **How to Use This File:** Provide both `v0_12_0_backend_client_handshake_plan.md` and `agent_execution_prompt_v0_12_0_handshake.md` to your CLI coding agent. Feed **only one Phase prompt from Part 2 at a time**, and do not advance to the next phase until the current phase builds cleanly, passes all verification commands, and passes your review.

### 1. Role & Primary Reference

You are a Senior Full-Stack Platform Engineer specializing in **PostgreSQL (database-first SQL/PLpgSQL)**, **Django / Django REST Framework (`drf-spectacular`)**, and **React Native (TypeScript / Jest)** working in the `ThuraAung-Rayaar/Volunteer_Coordination_System` workspace.

Before executing any phase in Part 2, you MUST read:
1. Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` (this file).
2. The corresponding Phase and referenced contract sections of `v0_12_0_backend_client_handshake_plan.md`.

### 2. Pre-Flight & Initial System State

Before starting Phase 0 or Phase 1, verify these starting conditions (assumptions where exact local environment details are not specified in the plan):

- **Git Baseline:** Checked out from `main` (plan baseline commit `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a`; inspect current `HEAD` for any newer commits before modifying files).
- **PostgreSQL Runtime:** A local PostgreSQL instance is running and configured for Django tests (never substitute SQLite for PostgreSQL invariant tests).
- **Backend Environment:** Python virtual environment is active with Django, DRF, `drf-spectacular`, and PostgreSQL database drivers installed (`python manage.py check` runs cleanly).
- **Mobile Environment:** Node.js and npm are installed in `mobile/` (`npm test` and `npx tsc --noEmit` run cleanly).
- **Locked Release Decisions:**
  - OTP length is standardized to **6 digits** across backend, schema, and mobile.
  - Session-bound OTP verification is implemented first over TLS; the Client Identity Envelope (CIT / JWE / HPKE) is gated behind a separate React Native cryptography compatibility spike and must not block the core challenge handshake.
  - SMS provider integration (Twilio/SNS/Firebase/SMPP), native GPS/geofence check-in UI, Friends, async dispatchers, and certificate pinning are **explicitly deferred**.

### 3. Mandatory Workspace Inspection

Before making any code edits in this release, inspect these 5 baseline files to match real namespaces, conventions, error envelopes, and patterns:

1. `postgres_sql/updated_volunteer_coordination_system_Database.sql` (`auth_otp`, `request_otp`, `verify_otp`, `attendance`, `trg_attendance_guard`)
2. `backend/services/auth_service.py` and `backend/common/security.py`
3. `backend/services/attendance_service.py` and `backend/bff/checkin/views.py`
4. `backend/bff/urls.py` and `backend/bff/auth/urls.py`
5. `mobile/src/core/api/apiClient.ts` and `mobile/src/core/auth/tokenStore.ts`

### 4. Architecture & Technical Guardrails

- **Strict Backend-First Gate:** Do NOT modify mobile UI screens (`OtpLoginScreen.tsx`, `CoordinatorAttendanceScreen.tsx`, `AttendanceRow.tsx`) until Phase 4 (Backend Integration Gate) passes against PostgreSQL and real HTTP.
- **Separate the Three Credentials:**
  - Never confuse the optional Client Identity Envelope (CIT), the one-time opaque `auth_session_token` (256-bit random, stored only as a keyed hash, never a JWT, never sent in `Authorization`), and the existing DRF `Token` (`Authorization: Token <token>`, retained unchanged).
- **Exact OTP Row Binding & Clocks:** Every challenge row MUST reference the exact `auth_otp.id`, enforce `challenge.expires_at <= otp.expires_at` (max 180 seconds), use deterministic row locking, and be single-use under concurrent verification.
- **Key Separation & Redaction:** Use distinct `OTP_CODE_HMAC_SECRET` and `AUTH_SESSION_TOKEN_SECRET` (separated from `PHONE_HASH_HMAC_SECRET`). Never log raw phone, OTP code, challenge token, CIT, or DRF token.
- **Truthful Delivery & Safe `dev_code`:** Keep `ConsoleOtpDeliveryAdapter` as a narrow placeholder. Never claim an SMS was sent (`dev_code_available` / `console_simulated` / `provider_not_configured`). Gate `dev_code` behind a dedicated local/test flag that is impossible to expose in production even if `DEBUG` is misconfigured.
- **Backward Compatibility:** Keep legacy `POST /api/v1/auth/otp/request/`, `POST /api/v1/auth/otp/verify/`, and the root manual check-in alias working during rollout; make `/api/v1/checkin/attendance/manual-checkin/` canonical for mobile.
- **One Source of Truth & No Fabricated Data:**
  - Never alias `phone` to `email` (P1-01).
  - Never fabricate `checkedInAt = new Date()`, overwrite server `method` (`qr_scan`/`geo`), or clear pending geo-confirmation on manual check-in.
  - Never fabricate assignments (P1-03) or return hard-coded feedback metrics like `{avgRating: 4.9, totalRatings: 10}` (P1-04).
  - Keep transport DTOs out of repositories/use cases via explicit domain mappers (P1-05).
- **Secure Storage Fail-Closed:** In production HTTP mode, never silently fall back to `AsyncStorage` or in-memory storage for bearer tokens; keep `MemoryTokenStore` strictly for injected tests.
- **No Speculative POST Retries:** Do not auto-retry non-idempotent POSTs (OTP request/verify, manual check-in, QR redemption) after timeouts. Clear local session only on HTTP `401`, never on `403/404/409/429/5xx` or network timeout.
- **Deferred Scope Protection:** Do not remove dormant backend geo functions (`geo_check_in`), do not add native GPS/map packages or mock coordinates to UI, and leave Friends visibly deferred as Coming Soon.

### 5. Universal CLI Execution & Stop Rules

1. **Single-Phase Scope:** Execute ONLY the requested phase from Part 2. Never scaffold, pre-edit, or opportunistically refactor files belonging to future phases.
2. **Build & Verify Before Stopping:** Run every build, schema, and test command specified in the phase and fix all errors before finishing.
3. **Mandatory 4-Part Summary & HARD STOP:** End every phase response with:
   - **Completed Phase**
   - **Files Created / Modified**
   - **Build & Verification Output**
   - **Next Step Gate**
   - Followed by an explicit **HARD STOP**.

---

## Part 2: Separate CLI Coding Phases

### Phase 0 — Contract Freeze, Baseline OpenAPI Snapshot & Scope Lock

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 4, Section 5, and Section 7 (Phase 0) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `backend/bff/urls.py`
2. `backend/bff/auth/urls.py`
3. `backend/bff/checkin/urls.py`
4. `mobile/src/data/endpoints/authApi.ts` and `mobile/src/data/endpoints/checkinApi.ts`

IN-SCOPE TASKS:
1. Verify current git HEAD against baseline commit `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a` and confirm no unexpected drift in auth or checkin routes.
2. Generate a baseline OpenAPI schema snapshot from the current Django BFF using `drf-spectacular` (e.g., `python manage.py spectacular --file backend/openapi_baseline_v0_12_0.yaml` or the repository's configured schema path) so future phases can diff against it.
3. Audit every mobile endpoint wrapper in `mobile/src/data/endpoints/` against `backend/bff/urls.py` to document the exact route matrix (canonical `checkin/` paths vs deprecated root aliases, legacy OTP routes vs new tokenized routes).
4. Record the locked v0.12.0 contract parameters in a concise contract freeze note (or existing docs location): 6-digit OTP length, max 180s challenge TTL (`min(issued_at + 180s, otp.expires_at)`), error code table from Section 4.3, canonical manual check-in response shape from Section 5.3, and explicit exclusion of SMS providers, native GPS/geofence UI, and Friends.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify SQL files, Django models, services, views, serializers, or mobile source code in this phase.
- Do NOT install npm or pip packages.

VERIFICATION & HARD STOP:
1. Run `python manage.py check` and `python manage.py spectacular --validate` (or the repo's configured schema validation command).
2. Confirm the baseline OpenAPI snapshot file was generated without errors and lists existing auth and checkin operations.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 1 — PostgreSQL OTP Challenge Schema, Stored Function & Key Separation

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 3.3, Section 3.4, and Section 7 (Phase 1 — Tickets AUTH-01, AUTH-04) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `postgres_sql/updated_volunteer_coordination_system_Database.sql` (around `auth_otp`, `request_otp`, `verify_otp`, OTP rate trigger)
2. `backend/common/security.py`
3. `backend/config/settings.py` (or the active settings module)
4. Existing Django auth models / OTP database test files

IN-SCOPE TASKS:
1. Update the database-first SQL schema (`postgres_sql/updated_volunteer_coordination_system_Database.sql`) and create an additive SQL upgrade script (with rollback notes) that adds:
   - An OTP challenge table (`auth_otp_challenge` or naming matching repo conventions) with: unique `challenge_token_hash`, foreign key `otp_id` referencing exact `auth_otp.id`, `purpose`, `created_at`, `expires_at` (with constraint/logic ensuring `expires_at <= otp.expires_at`), `consumed_at`, optional `request_id`, and optional unique `identity_nonce_hash` for replay prevention. Store NO raw challenge token, raw phone, or raw OTP.
   - An atomic PostgreSQL stored function (e.g., `verify_otp_challenge(...)`) that resolves by challenge hash, locks the challenge row and its exact `auth_otp` row in deterministic order, validates `purpose`, both `expires_at` timestamps, consumption status, and attempt limit, increments failed attempts on the exact `auth_otp` row, and atomically consumes both rows on success.
   - Cleanup/retention logic for expired OTP/challenge/nonce records that never deletes active challenges or required audit rows.
2. Preserve the existing phone-based OTP request rate-limit trigger and DRF `Token` table untouched.
3. Update unmanaged Django model declarations (if applicable) so Django matches the new PostgreSQL table.
4. In `backend/common/security.py` and Django settings, separate `OTP_CODE_HMAC_SECRET` and `AUTH_SESSION_TOKEN_SECRET` from `PHONE_HASH_HMAC_SECRET` (or derive independent keys via documented KDF with explicit context strings), add startup settings validation, and add helper functions for generating a cryptographically secure 256-bit opaque challenge token and computing its keyed hash.
5. Add PostgreSQL database invariant tests verifying: unique challenge hash, exact `otp_id` binding, expiry cap (`<= otp.expires_at`), single-use consumption, second-use rejection, failed-attempt increment on exact OTP row, concurrent/parallel verify race safety (only one succeeds), new OTP request cannot satisfy an older challenge, purpose mismatch rejection, both expiry clocks enforced, and existing phone rate-limit trigger preserved.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify `backend/services/auth_service.py`, DRF views/serializers, or any `mobile/` files yet.
- Do NOT touch `attendance` triggers or `geo_check_in` functions.

VERIFICATION & HARD STOP:
1. Apply the additive SQL migration/schema to the local PostgreSQL test database.
2. Run PostgreSQL-backed Django/SQL tests covering the new challenge table, stored function, and `backend/common/security.py` key-separation tests (e.g., `python manage.py test backend.apps.<auth_app>` or the repo's pytest/manage.py command against PostgreSQL).
3. Verify zero SQLite fallback is used and all concurrency/replay/expiry tests pass.
4. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 2A — Backend Auth Challenge Service & Safe Dev-Code Guard

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 2.2, Section 3.5, Section 4, and Section 7 (Phase 2 — Tickets AUTH-02, AUTH-03) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `backend/services/auth_service.py`
2. `backend/common/security.py`
3. Existing auth service test files in `backend/`

IN-SCOPE TASKS:
1. Standardize `OTP_CODE_LENGTH = 6` in `backend/services/auth_service.py` (with any temporary 4-digit mode strictly isolated to explicit local/test config if required).
2. Implement tokenized challenge service functions (e.g., `request_tokenized_login_otp(...)` and `verify_tokenized_login_otp(...)`) that:
   - Normalize phone -> compute phone hash -> check account policy -> generate 6-digit OTP -> persist `auth_otp` and challenge row atomically -> invoke `ConsoleOtpDeliveryAdapter` -> return the raw `auth_session_token` once with `expires_in` (<= 180s), `code_length: 6`, and truthful `delivery` metadata (`provider`, `channel`, `delivered: false`, `configured: false`).
   - Support request-id idempotency where practical so explicit retries return the same active challenge rather than creating duplicate OTPs.
   - Verify using ONLY `auth_session_token` + `code` (+ optional `display_name`) via the Phase 1 PostgreSQL challenge verification function, translating DB failures into stable domain errors (`invalid_challenge`, `invalid_code`, `challenge_expired`, `challenge_consumed`, `otp_rate_limited`, `account_blocked`, `account_closed`).
   - Issue the existing DRF `Token` only after atomic OTP/challenge consumption and user eligibility checks pass.
3. Update `ConsoleOtpDeliveryAdapter` / delivery response handling so it reports truthful status (`dev_code_available`, `console_simulated`, or `provider_not_configured`) and never claims an SMS was sent.
4. Gate `dev_code` behind a dedicated local/test feature flag with production settings validation proving `dev_code` cannot be returned in production configuration even if `DEBUG=True`.
5. Keep existing legacy `request_login_otp` and `verify_login_otp` service functions working for backward compatibility, and verify sensitive-field redaction keeps phone, OTP, challenge token, and DRF token out of logs.
6. Add comprehensive service unit/integration tests covering all return states, error translations, failed-attempt persistence, and production `dev_code` suppression.

NON-GOALS (DO NOT TOUCH):
- Do NOT integrate Twilio, AWS SNS, Firebase, SMPP, Celery, or ThreadPoolExecutor.
- Do NOT modify DRF views/serializers (`backend/bff/auth/`), attendance services, or `mobile/` files.

VERIFICATION & HARD STOP:
1. Run `python manage.py check` and run all auth service tests against PostgreSQL.
2. Confirm a dedicated test asserts `dev_code` is absent under production settings even when `DEBUG=True`.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 2B — Backend Manual Check-In Service & P1 Domain Rules

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 2.3, Section 5.2–5.5, Section 6 (P1-02, P1-06), and Section 7 (Phase 2 — Tickets ATT-01, MAP-02, INV-01) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `backend/services/attendance_service.py`
2. `backend/apps/attendance/tests/test_services_phase7.py`
3. Profile/donation PATCH service module (for P1-02)
4. Invite application service module (for P1-06)

IN-SCOPE TASKS:
1. Update `attendance_service.manual_check_in()` in `backend/services/attendance_service.py`:
   - Return a structured authoritative result containing `attendance_id`, `event_id`, `user_id`, `status`, `method`, `checkin_at`, `recorded_by_user_id`, and `already_checked_in` (boolean).
   - For idempotent repeats on rows already `checked_in` or `completed`, return `already_checked_in=True` while preserving the existing server `method` (`qr_scan`, `geo`, `coordinator_manual`), original `checkin_at`, and any pending geo-confirmation state (never relabel to manual).
   - Catch/translate a cancelled attendance row transition (rejected by `trg_attendance_guard`) into a stable domain conflict error (`409 invalid_state`) rather than leaking an unhandled DB/500 error.
   - Preserve `get_event_for_manager_or_404(..., require_write=True)` and database trigger authority checks.
2. Implement server-side donation master/sub-flag aggregate consistency (P1-02) for profile PATCH semantics so partial updates cannot leave inconsistent master/sub-flag states.
3. Verify/fix backend invite response service logic (P1-06) so volunteer accept/reject operates transactionally on the existing invite application ID rather than requiring a new browse application.
4. Expand `backend/apps/attendance/tests/test_services_phase7.py` and relevant service tests to cover all Section 5.5 backend acceptance cases (active event + onboarding -> 200, missing row -> `not_assigned`, inactive event, cancelled assignment, missing onboarding, owner-as-monitor -> 403, unrelated coordinator -> 404, idempotent repeat preserving QR/geo method & timestamp, cancelled attendance -> `409 invalid_state`, concurrent duplicate calls, audit note/recorder, donation transition matrix, and invite accept/reject transaction).

NON-GOALS (DO NOT TOUCH):
- Do NOT modify `geo_service.py` or `geo_check_in`.
- Do NOT modify DRF serializers/views or `mobile/` files in this phase.

VERIFICATION & HARD STOP:
1. Run `python manage.py test backend.apps.attendance.tests.test_services_phase7` and the profile/invite service test suites against PostgreSQL.
2. Confirm all Section 5.5 manual check-in invariants, P1-02 donation matrix cases, and P1-06 invite transaction tests pass.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 3 — DRF BFF Routes, Serializers, `/me/bootstrap/` & OpenAPI Contract

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 4, Section 5.3, Section 7 (Phase 3), and Section 8.7 (Tickets AUTH-02, ATT-01, API-01) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `backend/bff/auth/serializers.py`, `backend/bff/auth/views.py`, `backend/bff/auth/urls.py`
2. `backend/bff/checkin/serializers.py`, `backend/bff/checkin/views.py`, `backend/bff/checkin/urls.py`
3. `backend/bff/urls.py`
4. `backend/apps/attendance/tests/test_bff_checkin_phase7.py`

IN-SCOPE TASKS:
1. Auth BFF (`backend/bff/auth/`):
   - Add `TokenizedOtpRequestSerializer` and `TokenizedOtpVerifySerializer` (verify serializer MUST NOT accept or require `phone`).
   - Add public (`AllowAny`) views and routes for `POST /api/v1/auth/tokenized/request-otp/` and `POST /api/v1/auth/tokenized/verify-otp/` wired to Phase 2A services.
   - Map all Section 4.3 domain errors to consistent HTTP statuses and machine-readable error codes (`invalid_identity_token`, `invalid_challenge`, `invalid_code`, `challenge_expired`, `account_blocked`/`account_closed`, `challenge_consumed`, `otp_rate_limited`, `service_unavailable`).
   - Retain legacy `/api/v1/auth/otp/request/` and `/api/v1/auth/otp/verify/` routes with deprecation metadata/logging hooks.
2. Manual Check-In BFF (`backend/bff/checkin/`):
   - Update `AttendanceManualCheckinView` and its response serializer to return the full authoritative payload (`attendance_id`, `event_id`, `user_id`, `status`, `method`, `checkin_at`, `recorded_by_user_id`, `already_checked_in`) and `409 invalid_state` for cancelled rows.
   - Document `POST /api/v1/checkin/attendance/manual-checkin/` as canonical while retaining the root compatibility alias.
   - Update geo endpoint OpenAPI descriptions to explicitly note it is a dormant backend capability not active in the v0.12.0 mobile release.
3. Compact Session Bootstrap Endpoint (`GET /api/v1/me/bootstrap/`):
   - Add an authenticated DRF endpoint returning only the minimal Section 8.7 payload (`user` with real `null` email when absent—never phone fallback, `coordinator` status/`can_access_workspace`, and server-derived `capabilities`). Keep query count minimal and test query count.
4. OpenAPI & API Tests:
   - Regenerate the `drf-spectacular` OpenAPI schema and verify pagination docs match actual page/page-size behavior.
   - Add/update DRF API tests covering auth tokenized endpoints, legacy auth compatibility, `/api/v1/me/bootstrap/` (including query count and `email: null`), and `test_bff_checkin_phase7.py` for canonical manual check-in.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify any `mobile/` files yet.
- Do NOT remove legacy OTP routes or root check-in aliases.

VERIFICATION & HARD STOP:
1. Run `python manage.py spectacular --validate` (and diff against the Phase 0 baseline snapshot).
2. Run all DRF BFF tests (`test_bff_checkin_phase7.py`, new auth BFF tests, bootstrap tests) against PostgreSQL.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 4 — Backend Integration Gate & Real-HTTP CI Verification (No UI Yet)

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 6 (P1-07) and Section 7 (Phase 4 — Ticket INT-01) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `mobile/src/core/api/apiClient.ts`
2. Existing CI workflow files (e.g., `.github/workflows/` if present)
3. `backend/config/urls.py` and `mobile/package.json`

IN-SCOPE TASKS:
1. Create a real-HTTP integration test suite that boots Django against PostgreSQL and executes real HTTP requests using the actual mobile `ApiClient` (no Jest fake/mocked `ApiClient`).
2. Cover all mandatory Phase 4 real-HTTP scenarios:
   - `POST /api/v1/auth/tokenized/request-otp/` -> receive `auth_session_token` -> `POST /api/v1/auth/tokenized/verify-otp/` (without phone) -> receive DRF `Token` -> `GET /api/v1/me/bootstrap/` succeeds with `Authorization: Token ...`.
   - OTP replay and parallel verify fail deterministically (`409 challenge_consumed` / `400 invalid_challenge`).
   - Production configuration smoke check proves `dev_code` is absent.
   - Coordinator loads event roster -> `POST /api/v1/checkin/attendance/manual-checkin/` -> returns authoritative server `checkin_at` and `method` -> refreshed roster matches server state.
   - Owner-as-monitor (`403`), unrelated coordinator (`404`), and unauthenticated caller (`401`) are rejected server-side.
   - Client session invalidation check: `401` clears local session; `403`/`404`/`409`/`429`/`5xx` and timeout do NOT silently clear local session.
3. Add or update the CI workflow (e.g., `.github/workflows/v0_12_0_integration.yml`) to provision PostgreSQL, apply SQL/migrations in documented order, run backend tests, validate OpenAPI, run mobile TypeScript/Jest checks, and execute the real-HTTP integration suite with commit SHA and test output artifacts.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify any mobile UI screens (`mobile/src/features/**/screens/`).
- Do NOT refactor mobile repositories or DTOs yet (that is Phase 6).

VERIFICATION & HARD STOP:
1. Execute the full backend test suite, `python manage.py spectacular --validate`, and the new real-HTTP integration suite locally against PostgreSQL + live Django server.
2. Confirm 100% pass rate with zero mocked HTTP transport in the integration suite.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 5 — Mobile Secure Storage & Hardened `ApiClient` Transport

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 2.1, Section 7 (Phase 5 — Ticket AUTH-05), and Section 8.3–8.4 of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `mobile/package.json` and `mobile/package-lock.json`
2. `mobile/src/core/auth/tokenStore.ts`
3. `mobile/src/core/auth/sessionManager.ts`
4. `mobile/src/core/api/apiClient.ts`

IN-SCOPE TASKS:
1. Install and pin `react-native-keychain` (updating both `mobile/package.json` and `mobile/package-lock.json` together).
2. Refactor `mobile/src/core/auth/tokenStore.ts`:
   - Use `react-native-keychain` as the declared secure token store.
   - Remove `AsyncStorage` and silent in-memory fallback in production HTTP mode; fail closed with a controlled session-storage error if secure storage is unavailable.
   - Keep `MemoryTokenStore` strictly as an explicitly injected test implementation.
   - Expose a non-sensitive storage capability status without ever exposing or logging token values.
3. Harden `mobile/src/core/api/apiClient.ts`:
   - Keep `Authorization: Token <token>` injection and `401`-only session invalidation.
   - Add per-request correlation ID header (`X-Request-ID`) and structured request timing telemetry while strictly redacting `Authorization`, phone, OTP, CIT, and challenge tokens from all logs.
   - Ensure timeout timers are cleared and caller `AbortSignal` listeners are detached on every exit path.
   - Enforce no automatic retry of non-idempotent POST requests; allow explicit idempotency key headers only where backend supports them.
4. Add unit tests for `tokenStore.ts`, `sessionManager.ts`, and `apiClient.ts` covering set/get/clear, fail-closed storage errors, logout, `401` vs non-`401` handling, abort cleanup, and timeout cleanup.

NON-GOALS (DO NOT TOUCH):
- Do NOT implement CIT JWE/HPKE encryption unless a separate React Native/Hermes spike is explicitly approved.
- Do NOT modify backend files, DTOs, repositories, or UI screens.

VERIFICATION & HARD STOP:
1. Run `npx tsc --noEmit` and Jest unit tests for `tokenStore`, `sessionManager`, and `apiClient` inside `mobile/`.
2. Confirm `mobile/package.json` and `mobile/package-lock.json` both pin `react-native-keychain` and zero `AsyncStorage` token fallback remains.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 6A — Mobile Auth Challenge DTOs, `authApi`, `UserContext` & Bootstrap Wiring

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 4, Section 6 (P1-01), Section 7 (Phase 6 — Authentication), and Section 8.7 (Ticket MAP-01) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `mobile/src/data/dto/authDto.ts`
2. `mobile/src/data/endpoints/authApi.ts`
3. `mobile/src/app/UserContext.tsx`
4. Mobile profile mapper file(s) where phone-to-email fallback exists

IN-SCOPE TASKS:
1. Update `mobile/src/data/dto/authDto.ts` to define typed DTOs for:
   - `TokenizedOtpRequestDto` / `TokenizedOtpResponseDto` (`status`, `auth_session_token`, `expires_in`, `code_length`, `delivery`, optional `dev_code`)
   - `TokenizedOtpVerifyRequestDto` (`auth_session_token`, `code`, optional `display_name` — NO `phone` field) / `TokenizedOtpVerifyResponseDto` (`token`, `user`)
   - `BootstrapResponseDto` matching `GET /api/v1/me/bootstrap/`
2. Update `mobile/src/data/endpoints/authApi.ts` to add `requestTokenizedOtp()`, `verifyTokenizedOtp()`, and `getBootstrap()` targeting the canonical Phase 3 BFF routes.
3. Refactor `mobile/src/app/UserContext.tsx`:
   - Hold ephemeral challenge state (`authSessionToken`, expiry, `codeLength`, `delivery`) strictly separate from the persisted DRF bearer token.
   - Persist the DRF token via `sessionManager` ONLY after `verifyTokenizedOtp()` succeeds.
   - Replace the post-login and cold-start parallel `getProfile()` + `getCoordinatorProfile()` fan-out with the single `GET /api/v1/me/bootstrap/` call.
   - Clear ephemeral challenge state on verification success, change-phone, resend, expiry, or cancellation.
4. Fix P1-01 (`MAP-01`): Remove every phone-to-email fallback in `UserContext.tsx` and all profile mappers (`phone` maps only to `phone`; absent `email` remains `null`/`undefined`).
5. Add unit tests for auth DTOs, `authApi`, `UserContext` challenge lifecycle, single-request bootstrap, and P1-01 phone/email separation.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify `OtpLoginScreen.tsx` or other UI screens yet (that is Phase 7).
- Do NOT modify attendance repositories or backend files.

VERIFICATION & HARD STOP:
1. Run `npx tsc --noEmit` and Jest tests for auth API, `UserContext`, and profile mappers in `mobile/`.
2. Verify via code search/test that `verifyTokenizedOtp` never serializes `phone` and no phone-to-email fallback remains.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 6B — Mobile Attendance Repository & Remaining P1 Data-Layer Remediation

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 5.3–5.5, Section 6 (P1-02 through P1-06), and Section 7 (Phase 6 — Attendance & Other Remediation; Tickets ATT-02, REPO-01, USE-01, MAP-03, INV-01) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `mobile/src/data/dto/checkinDto.ts` and `mobile/src/data/endpoints/checkinApi.ts`
2. `mobile/src/data/endpoints/coordinatorApi.ts` and `mobile/src/data/http/HttpCoordinatorRepository.ts`
3. Mobile use cases / repositories affected by P1-02, P1-03, P1-04, P1-05, P1-06

IN-SCOPE TASKS:
1. Manual Check-In Data Layer (`ATT-02`):
   - Expand `ManualCheckinResponseDto` in `checkinDto.ts` to match the authoritative Phase 3 response (`attendance_id`, `event_id`, `user_id`, `status`, `method`, `checkin_at`, `recorded_by_user_id`, `already_checked_in`).
   - Update `HttpCoordinatorRepository.manualCheckIn` to accept explicit `({ eventId, volunteerUserId, note? })` (or `(eventId, volunteerUserId, note?)`), call canonical `checkinApi.manualCheckIn()` (`/api/v1/checkin/attendance/manual-checkin/`), and remove the `attendanceCache` prerequisite completely.
   - Map the server response into a typed domain mutation result; remove `new Date().toISOString()`, never overwrite server `method` (`qr_scan`/`geo`), and never clear `isPendingGeoConfirmation` unless server state confirms it.
   - Keep geo repository methods dormant behind feature configuration.
2. Remaining P1 Remediation:
   - `P1-02` (`MAP-02`): Align `mapProfileUpdateRequest()` with server-side donation master/sub-flag PATCH rules (or pass authoritative current profile).
   - `P1-03` (`REPO-01`): Remove fabricated assignment fallback domain objects and first-managed-event fallback; return real mutation IDs + deterministic refetch or explicit sync failure.
   - `P1-04` (`USE-01`): Remove hard-coded `{avgRating: 4.9, totalRatings: 10}` from coordinator feedback use cases; return source-backed values, empty/unavailable state, or typed error.
   - `P1-05` (`MAP-03`): Add explicit domain models and mappers for history, capacity, UUID lookup, geo-attempt review, and charity taxonomy so transport DTOs never leak out of repositories/use cases.
   - `P1-06` (`INV-01`): Wire volunteer invite accept/reject to the existing invite application ID so the full coordinator-invite -> volunteer-response -> coordinator-view round trip works.
3. Add Jest tests for direct manual check-in without warm `attendanceCache`, authoritative server timestamp/method mapping, failure/retry states, and P1-02 through P1-06.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify `CoordinatorAttendanceScreen.tsx` or `AttendanceRow.tsx` yet (that is Phase 7).
- Do NOT enable native GPS/geolocation packages or Friends endpoints.

VERIFICATION & HARD STOP:
1. Run `npx tsc --noEmit` and the full `mobile/` Jest unit test suite.
2. Run the Phase 4 real-HTTP integration test suite against live Django + PostgreSQL to verify updated mobile repositories pass against the live BFF.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 7 — Mobile UI Integration (OTP Login & Coordinator Manual Check-In)

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 7 (Phase 7) and Section 10 (Integration and UI) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. `mobile/src/features/auth/screens/OtpLoginScreen.tsx`
2. `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx`
3. `mobile/src/features/coordinator/components/AttendanceRow.tsx`

IN-SCOPE TASKS:
1. Wire `OtpLoginScreen.tsx` to the Phase 6A challenge flow:
   - Phone submission creates one OTP challenge and advances to code entry; prevent double-submit while in flight.
   - Enforce server-supplied `code_length` (default locked 6 digits) in input validation and copy.
   - Display delivery status honestly; show a `dev_code` banner ONLY in development builds when `dev_code` is returned.
   - Submit verification with `auth_session_token` + `code` only (never resending phone); display expired/invalid/locked errors without needlessly wiping the user's phone input.
   - Clear ephemeral challenge/code state on change-phone, resend, completion, or navigation exit.
2. Wire `CoordinatorAttendanceScreen.tsx` and `AttendanceRow.tsx` to the Phase 6B manual check-in flow:
   - Pass explicit `eventId` and `volunteerUserId` from `CoordinatorAttendanceItem` (with optional confirmation prompt / audit note if supported).
   - Enable manual check-in action only when row state permits it and coordinator has write capability (noting UI hide is UX only, not authorization).
   - Render exact server-returned `method` and `checkin_at`; on `already_checked_in: true`, show "Already checked in" while preserving original server method.
   - On `409`/`403`/`404`/validation failure, keep the previous row state intact and display the backend error message.
   - Remove the `(Demo)` label ONLY after confirming the Phase 4/6B real-HTTP integration gate is green.
3. Verify UI Exclusions:
   - Friends remains visibly marked Coming Soon.
   - No GPS capture, map pins, location permission prompts, or mock coordinates are presented as active.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify backend files, database SQL, or `tokenStore.ts`/`apiClient.ts`.
- Do NOT implement Friends screens or native GPS/QR scanner UI.

VERIFICATION & HARD STOP:
1. Run `npx tsc --noEmit` and mobile UI/component Jest tests covering `OtpLoginScreen`, `CoordinatorAttendanceScreen`, and `AttendanceRow`.
2. Re-run the Phase 4 real-HTTP integration test suite against Django + PostgreSQL to verify end-to-end compatibility.
3. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate) and perform a HARD STOP.
```

---

### Phase 8 — Evidence Ledger Regeneration & Staged Rollout Readiness

```text
ROLE & REFERENCE:
Read Part 1 of `agent_execution_prompt_v0_12_0_handshake.md` and Section 7 (Phase 8), Section 9 (Ticket EVID-01), and Section 10 (Definition of Done) of `v0_12_0_backend_client_handshake_plan.md`.

SCOPED INSPECTION:
Inspect only:
1. Existing capability evidence ledger document in the repository
2. `backend/bff/auth/urls.py` and `backend/bff/checkin/urls.py`
3. SQL upgrade/rollback notes from Phase 1

IN-SCOPE TASKS:
1. Regenerate the capability evidence ledger (`EVID-01`) directly from verified source files, current git commit SHA, and actual real-HTTP / PostgreSQL test outputs:
   - Mark operations "runtime verified" ONLY where proven by the Phase 4 real-HTTP integration suite (never from Jest mock-client tests).
   - Mark Friends, native GPS/geofence UI, and SMS provider delivery honestly as deferred/dormant.
2. Verify staged rollout readiness:
   - Confirm additive SQL migration and safe rollback notes do not delete active OTP state mid-login.
   - Confirm both legacy and tokenized OTP endpoints remain active with deprecation telemetry on legacy routes.
   - Confirm production-like smoke test verifies no false "SMS sent" state and no `dev_code` leakage.
3. Complete a final pass over Section 10 (Definition of Done) of `v0_12_0_backend_client_handshake_plan.md` and record exact command outputs for every checked item.

NON-GOALS (DO NOT TOUCH):
- Do NOT delete legacy OTP routes, root check-in aliases, or dormant backend `geo_check_in` functions in this release.
- Do NOT introduce new product features.

VERIFICATION & HARD STOP:
1. Run the full verification matrix one final time: `python manage.py spectacular --validate`, full PostgreSQL backend test suite, `mobile/` `npx tsc --noEmit` + Jest unit suite, and the real-HTTP integration test suite.
2. Output the 4-part summary (Completed Phase, Files Created / Modified, Build & Verification Output, Next Step Gate — Release Ready) and perform a HARD STOP.
```

### Check for database updated and step by step procedure from database update to remigration sucess in the backend
```
need to check the system new features the database must add
if the database changes whether the existing features might break
after altering the database , updating it will the remigration to match with backend backfire or work
after that the handshake between the database and backend need to be tested
```
