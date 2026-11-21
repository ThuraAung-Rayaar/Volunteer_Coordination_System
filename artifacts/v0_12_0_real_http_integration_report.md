# v0.12.0 Phase 4 Real-HTTP Integration Test Report

- **Date / Time:** 2026-11-21T17:32:42.510177+00:00
- **Commit SHA:** `99db25a7ba26d26ad5d803e028ce405b827e926d`
- **Execution Duration:** 13.50s
- **Status:** **PASSED** (Exit Code 0)
- **Transport:** Real network HTTP sockets (`fetch` over TCP), zero mocks.
- **Backend:** Django BFF with live PostgreSQL database (`test_volunteer_coordination_db`).

## Test Output

```text
> mobile@0.0.1 test:real-http
> jest src/data/__tests__/v0_12_0_realHttpIntegration.test.ts --runInBand
PASS src/data/__tests__/v0_12_0_realHttpIntegration.test.ts (10.709 s)
  Phase 4: Real-HTTP Integration Test Suite (No Mocks)
    Scenario 1: Tokenized Challenge Auth & /me/bootstrap/
      √ executes real-HTTP OTP request -> verify without phone -> DRF Token -> /me/bootstrap/ (222 ms)
    Scenario 2: OTP Replay & Parallel Verify Fail Safely
      √ fails on OTP replay with 409 challenge_consumed (235 ms)
      √ handles concurrent/parallel verify requests safely (one wins, one fails 409) (183 ms)
      √ rejects bogus challenge token with 400 invalid_challenge (53 ms)
      √ rejects wrong OTP code with 400 invalid_code (138 ms)
      √ returns deterministic challenge for repeat request with same request_id (138 ms)
    Scenario 3: Production Configuration Smoke Check
      √ proves dev_code is strictly absent in production configuration over real HTTP (102 ms)
    Scenario 4: Coordinator Loads Roster & Manual Check-In
      √ executes coordinator roster fetch -> manual check-in -> authoritative response -> refreshed roster match (416 ms)
    Scenario 5: Authorization & Resource Masking
      √ blocks Event Owner with 403 Forbidden in monitor mode (W51/W52) (294 ms)
      √ rejects unrelated coordinator with 404 resource masking (70 ms)
      √ rejects unauthenticated requests with 401 Unauthorized (44 ms)
    Scenario 6: Session Invalidation Invariant
      √ clears token and triggers listener ONLY on HTTP 401 Unauthorized (177 ms)
      √ does NOT clear session token on HTTP 403, 404, 409, or network timeout (175 ms)
    Scenario 7: Verification Images Real-HTTP Encrypted Storage & Stream
      √ uploads JPEG -> ciphertext on disk -> admin decrypt stream -> non-admin denied (461 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        11.221 s
Ran all test suites matching /src\\data\\__tests__\\v0_12_0_realHttpIntegration.test.ts/i.
```

## Verified Scenarios

1. **Tokenized Challenge Handshake:** `POST /api/v1/auth/tokenized/request-otp/` -> `auth_session_token` -> `POST /api/v1/auth/tokenized/verify-otp/` (no phone) -> DRF `Token` -> `GET /api/v1/me/bootstrap/` succeeds with `email: null` and decrypted `phone`.
2. **Replay & Parallel Verify Safety:** OTP challenge replay deterministically returns `409 challenge_consumed`. Parallel verifications resolve with exactly one 200 and one 409. Bogus tokens return `400 invalid_challenge`.
3. **Production Dev-Code Suppression:** Live Django server with `ENVIRONMENT=production` and `ALLOW_DEV_CODE_IN_AUTH_RESPONSE=False` strictly omits `dev_code` in real HTTP responses.
4. **Authoritative Check-In & Roster Match:** Coordinator loads roster -> `POST /api/v1/checkin/attendance/manual-checkin/` returns authoritative server `checkin_at` and `method` -> refreshed roster matches server state -> repeat check-in is idempotent.
5. **Authorization & Masking:** Owner-as-monitor blocked (`403 owner_monitor_read_only`), unrelated coordinator masked (`404`), unauthenticated caller denied (`401`).
6. **Session Invalidation:** HTTP 401 clears local session token and triggers listeners; non-401 responses (403, 404, 409, 429, 5xx) and timeouts do NOT silently clear local session.
7. **Verification Image File Encryption & Admin Stream:** Volunteer uploads sanitized JPEG over real HTTP multipart/form-data -> server-side AES-256-GCM envelope stored on disk (`VIMG\x01`) -> volunteer metadata response excludes file path and raw bytes -> admin stream decrypts JPEG in-memory (`image/jpeg`) -> non-admin access is rejected with masked 404/401.
