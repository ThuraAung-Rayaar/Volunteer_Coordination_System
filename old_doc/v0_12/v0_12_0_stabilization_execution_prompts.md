# Agent Execution Prompt — Volunteer Coordination System v0.12.0 Stabilization

**Prompt File:** `agent_execution_prompt_v0_12_0_stabilization.md`  
**Primary Specification:** `V0_12_0_STABILIZATION_MASTER_PLAN.md`  
**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System` (`main`)

---

## Part 1: Global Coding Requirements & Specifications

> **How to Use This File:** Provide both `V0_12_0_STABILIZATION_MASTER_PLAN.md` and `agent_execution_prompt_v0_12_0_stabilization.md` to Gemini Flash CLI (or any CLI coding agent). Feed **only one Phase prompt from Part 2 at a time**, starting with **Phase 0 (Database Preflight)**, and advance to the next phase only after the current phase's build, tests, and review gate pass.

### 1. Role & Primary Reference

Act as a senior full-stack stabilization engineer working across Python/Django/DRF (`backend/`), PostgreSQL 18.x (database-first, frozen schema), and React Native/TypeScript (`mobile/`) in the `Volunteer_Coordination_System` repository. Before executing any phase, read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` alongside the full relevant section of `V0_12_0_STABILIZATION_MASTER_PLAN.md`. This is a targeted stabilization of the existing v0.12.0 feasibility prototype—preserve the current architecture and business rules without redesigning or expanding scope.

### 2. Pre-Flight & Initial System State

The following starting conditions must be true (or verified in Phase 0) before any implementation begins:

- **Git Baseline:** Working on `main` at or after reviewed HEAD `99db25a7ba26d26ad5d803e028ce405b827e926d` (`remove error file`), with any local uncommitted user changes preserved.
- **Protected Prototype Database:** PostgreSQL 18.x (reference snapshot: 18.6) hosting `volunteer_coordination_db` with native `uuidv7()`, 31 base tables, `auth_otp_challenge`, `user_verification_images`, required challenge functions/triggers, and coordinator views.
- **Disposable Test Database:** A separate PostgreSQL 18.x test database (visibly distinct from `volunteer_coordination_db`) is required for all write tests, integration suites, and fixture seeding.
- **Backend & Mobile Runtimes:** Python/Django/DRF environment with `cryptography`, `Pillow`, and `drf-spectacular` installed; Node.js/npm environment for `mobile/` (`npm ci`, `npx tsc --noEmit`, Jest).
- **Environment & Secrets (Assumed Supplied Outside Source Control):** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `VERIFICATION_MEDIA_ROOT`, `VERIFICATION_IMAGE_ENCRYPTION_KEY` (32 bytes, separate from `PHONE_ENCRYPTION_KEY` and HMAC secrets), and `OTP_DELIVERY_*` variables. If a concrete SMS vendor has not yet been supplied, implement only the provider-neutral adapter contract and configurable transport boundary—never invent vendor API payloads.
- **Mandatory First Gate:** **Phase 0 (Database Preflight)** must return **PASS** before Phase A coding begins.

### 3. Mandatory Workspace Inspection

Before editing any file, inspect the live repository at the current HEAD in the required reading order rather than relying solely on prior summaries:

1. `docs/full_database_details.md`, `docs/backend_analysis.md`, `docs/mobile_analysis.md`, and `docs/tokenization_login_architecture.md`
2. `reference/v0_12_0_backend_client_handshake_plan.md`, `reference/v0_12_0_database_migration_guide.md`, and `reference/database_deep_dive.md`
3. `postgres_sql/updated_volunteer_coordination_system_Database.sql` and `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` (**read-only reference only**)
4. `backend/config/settings/base.py` and `backend/config/settings/production.py`
5. `mobile/package.json` and `mobile/src/core/api/apiClient.ts`

*Explicitly excluded:* Never inspect or modify `old_doc/` or any subdirectory inside it.

### 4. Architecture & Technical Guardrails

- **DATABASE FROZEN (Absolute Rule):** Never edit `postgres_sql/updated_volunteer_coordination_system_Database.sql` or `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`. Never add/alter/drop tables, columns, triggers, views, constraints, or functions. Never create Django migrations, change `managed = False`, or run `migrate`, `makemigrations`, `scripts/alter_local_db.py`, `scripts/seed_integration_fixtures.py`, `DROP`, `TRUNCATE`, or `DELETE` against `volunteer_coordination_db`.
- **Database Safety Gate:** Before any command that connects to PostgreSQL, print `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, active settings module, and environment label (never passwords/secrets). Refuse execution if the target is `volunteer_coordination_db` and the command can write test/fixture data, or if the target is not on a disposable allow-list.
- **No Redesign / Scope Exclusions:** Do not implement CIT / JWE / HPKE envelopes, Celery/Redis/Kafka async OTP workers, provider failover, native GPS/geofence UI, or Friends. Retain DRF `Token` (`Authorization: Token <token>`), legacy OTP routes, and `managed = False` models.
- **Server-Side Encrypted Images Only:** Never store image bytes in PostgreSQL or add encryption columns to `user_verification_images`. Encrypt sanitized JPEGs in memory with AES-256-GCM into a versioned binary envelope before writing to `VERIFICATION_MEDIA_ROOT` (outside public `MEDIA_ROOT`/static). Decrypt only in memory after admin authorization.
- **Zero Secret/PII Leakage:** Never log or print raw phone numbers, OTPs, OTP/challenge hashes, `auth_session_token`, DRF tokens, `Authorization` headers, provider API keys, encryption keys, image paths, or image bytes.
- **No Fabricated Data:** Never invent server IDs, timestamps (`new Date()`), coordinates `(0,0)`, `geo_checkin_enabled: true`, or fallback placeholder objects in mobile HTTP repositories.
- **Evidence Honesty:** Label all verification accurately (**Source inspected**, **Static verification**, **Unit test**, **PostgreSQL-backed test**, **Real HTTP test**, **Device test**) and record the exact Git SHA. Never substitute SQLite for PostgreSQL or claim mocked Jest tests as real HTTP/device proof.
- **Git Discipline:** Do not reset, rebase, clean, commit, push, or open a PR unless explicitly instructed.

### 5. Universal CLI Execution & Stop Rules

- Execute **only** the single requested phase; never pre-implement tasks from later phases or refactor unrelated code.
- Open and read every target file at the current HEAD before editing.
- Run all required phase build, static, and test commands and resolve failures before stopping (or record exact root-cause blockers without weakening assertions).
- End **every** phase with this structured completion report and an explicit **HARD STOP**:
  1. **Completed Phase:** Phase ID, scope, and current Git SHA.
  2. **Files Created / Modified:** Exact paths and brief reason for each change.
  3. **Database Safety Statement:** Explicit confirmation of every DB target touched, whether any DDL/DML occurred, and confirmation that `volunteer_coordination_db` schema/data was not modified.
  4. **Build & Verification Output:** Exact commands, exit codes, test counts, PostgreSQL `server_version`, evidence labels, and any unresolved issues.
  5. **Next Step Gate:** `PASS` or `BLOCKED` with exact conditions, followed by **HARD STOP** (wait for the next user prompt).

---

## Part 2: Separate CLI Coding Phases

### Phase 0 — Read-Only Database Preflight & Image Storage Inventory

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 2 ("FIRST ACTION — DATABASE PREFLIGHT AND DECISION GATE") of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

SCOPE: Execute the mandatory read-only PostgreSQL preflight and read-only verification-image file-system inventory. Do NOT edit application code, SQL files, or database rows in this phase.

SCOPED INSPECTION:
- `backend/config/settings/base.py`
- `docs/full_database_details.md`
- `postgres_sql/updated_volunteer_coordination_system_Database.sql` (read-only reference)
- `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` (read-only reference)

IN-SCOPE TASKS:
1. Check `git status` and record the exact current Git HEAD SHA and branch.
2. Print the effective non-secret database target (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, active Django settings module, `ATOMIC_REQUESTS`). Mask all passwords and secrets. Confirm target is `volunteer_coordination_db` with no silent fallback.
3. Run the complete read-only SQL preflight block from Section 2.2 of `V0_12_0_STABILIZATION_MASTER_PLAN.md` inside `BEGIN READ ONLY; ... COMMIT;` using `psql -X -v ON_ERROR_STOP=1` (via `PGPASSWORD` env var, never on the command line). Run integrity-count queries only after verifying required tables exist.
4. Perform the read-only file-system inventory of `VERIFICATION_MEDIA_ROOT` per Section 2.3: directory existence, DB image row count, private file count, existing referenced file count, legacy plaintext JPEG count (by signature), already-encrypted file count, total bytes, largest file size, and verify the directory is NOT under public `MEDIA_ROOT` or static assets. Print aggregate counts only (zero UUIDs, filenames, paths, or hashes).
5. Evaluate Section 2.4 Pass Criteria and map the result to Branches A–F (Section 2.5).
6. If PASS (Branch A or F), save the sanitized read-only report to `artifacts/v0_12_0_db_preflight_<commit>.md` with zero secrets or PII.

NON-GOALS (DO NOT TOUCH):
- Do NOT execute any DDL, DML, `migrate`, `makemigrations`, `alter_local_db.py`, `seed_integration_fixtures.py`, `SELECT ... FOR UPDATE`, or maintenance functions.
- Do NOT modify any `.sql`, `.py`, `.ts`, or `.yml` file.
- Do NOT open, rename, encrypt, or delete any verification image files.
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Confirm `git diff` is empty for all tracked source files and that `artifacts/v0_12_0_db_preflight_<commit>.md` contains PostgreSQL 18.x `server_version`, `uuidv7()` resolution, object/trigger/constraint/view inventory, integrity counts, and aggregate image inventory.
- Output the 5-part completion report from Part 1 Section 5 (Completed Phase, Files Created/Modified, Database Safety Statement, Build & Verification Output, Next Step Gate).
- If any mandatory criterion fails (Branches B, C, D, or E), set Next Step Gate to BLOCKED and stop.
- HARD STOP. Wait for explicit confirmation before starting Phase A.
```

---

### Phase A — Environment Alignment, Script Guards & PostgreSQL 18 CI Recovery

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 3 ("PHASE A — DATABASE FREEZE CONFIRMATION, ENVIRONMENT ALIGNMENT AND CI RECOVERY") of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase 0 Database Preflight must be PASS.

SCOPE: Align the test environment to PostgreSQL 18.x, guard destructive helper/seeder scripts against targeting `volunteer_coordination_db`, restore the deleted integration CI workflow, and run baseline static checks.

SCOPED INSPECTION:
- `.github/workflows/` (existing workflows)
- `scripts/seed_integration_fixtures.py`
- `scripts/alter_local_db.py`
- `backend/config/settings/base.py`

IN-SCOPE TASKS:
1. Create a read-only preflight/baseline helper script (if not already present) that validates the frozen DB contract without any auto-repair or DDL capability, and confirm the Phase 0 baseline artifact records all Section 3.2 (A1) fields.
2. Restore `.github/workflows/v0_12_0_integration.yml` per Section 3.2 (A2–A3):
   - Pin a deliberate PostgreSQL 18.x service image tag (not PostgreSQL 16, not `latest`) and archive `SHOW server_version`.
   - Use an ephemeral CI database only; bootstrap with `set -euo pipefail` and `psql -X -v ON_ERROR_STOP=1` loading `postgres_sql/updated_volunteer_coordination_system_Database.sql` and (verified against contract) `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`. Fail fast on any SQL error.
   - Include all required dependency-ordered stages: SHA record, PG 18 health, backend deps, disposable DB bootstrap, `manage.py check`, OpenAPI `spectacular --validate`, PostgreSQL-backed Django tests, mobile `npm ci`, `npx tsc --noEmit`, mobile Jest unit/contract tests, real-HTTP integration suite, encrypted image tests, and non-sensitive artifact upload.
3. Harden `scripts/seed_integration_fixtures.py` (and guard `scripts/alter_local_db.py`) per Section 3.2 (A4):
   - Require explicit `APP_ENV=ci` or `APP_ENV=test` plus an explicit disposable DB name allow-list.
   - Refuse `production`, `prod`, `volunteer_coordination_db`, non-allow-listed DB names, or unapproved remote hosts.
   - Redact raw tokens and phone numbers from stdout/logs; restrict temporary fixture files to the ephemeral workspace and clean them up after runs.
4. Update stale environment/CI docs that incorrectly claim PostgreSQL 14/16 compatibility for the frozen `uuidv7()` schema, and document the static-review finding that the existing migration rollback section does not restore `purge_expired_otps()` (without editing any SQL file).

NON-GOALS (DO NOT TOUCH):
- Do NOT edit `postgres_sql/updated_volunteer_coordination_system_Database.sql` or `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`.
- Do NOT run `alter_local_db.py`, `seed_integration_fixtures.py`, or any write test against `volunteer_coordination_db`.
- Do NOT modify auth services, image encryption code, BFF business endpoints, or mobile application screens (Phases B–D).
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Run baseline static checks (configured against the test environment, not mutating `volunteer_coordination_db`):
  - `python backend/manage.py check`
  - `python backend/manage.py spectacular --file /tmp/v0_12_0_openapi_phase_a.yaml --validate` (or temp path outside tracked source)
  - `cd mobile && npx tsc --noEmit`
  - `cd mobile && npm test -- --runInBand`
- Run refusal unit checks proving `seed_integration_fixtures.py` and `alter_local_db.py` abort when pointed at `volunteer_coordination_db` or `production`.
- Output the 5-part completion report from Part 1 Section 5 with exact SHA, commands, exit codes, and evidence labels.
- HARD STOP. Wait for Phase A review approval before starting Phase B1.
```

---

### Phase B1 — Backend Auth Stabilization & Direct OTP Network Delivery Adapter

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 4 (4.1–4.3 and backend tests in 4.5) of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase A PASS. All DB tests in this phase MUST target a separate disposable PostgreSQL 18.x database only.

SCOPE: Stabilize backend challenge-bound OTP auth, add the provider-neutral direct SMS delivery adapter boundary with post-commit dispatch, and fix defects B1–B6 without any database schema changes.

SCOPED INSPECTION:
- `backend/services/auth_service.py`
- `backend/bff/auth/serializers.py` and `backend/bff/auth/views.py`
- `backend/config/settings/base.py` and `backend/config/settings/production.py`
- `backend/apps/accounts/tests/test_tokenized_auth_service.py` and `backend/apps/accounts/tests/test_bff_auth_tokenized.py`

IN-SCOPE TASKS:
1. Preserve `OtpDeliveryAdapter` in `backend/services/auth_service.py` and define a structured delivery result containing: provider identifier, delivery channel (`sms`), `configured` state, provider request acceptance state, final handset delivery state (true ONLY on genuine provider receipt), provider message/correlation ID, safe error category, and retryability (`safe_retry`, `not_safe_to_retry`, `unknown_outcome`). Never include raw phone or OTP in results or logs.
2. Add a configurable external network/SMS provider adapter boundary reading `OTP_DELIVERY_PROVIDER`, `OTP_DELIVERY_ENABLED`, `OTP_PROVIDER_BASE_URL`, `OTP_PROVIDER_API_KEY`, `OTP_PROVIDER_API_SECRET`, `OTP_PROVIDER_SENDER_ID`, `OTP_PROVIDER_TIMEOUT_SECONDS`, and `OTP_PROVIDER_DELIVERY_RECEIPTS_ENABLED` from environment variables (no literal secret fallbacks). Return truthful `provider_not_configured` when unconfigured; enforce strict timeouts; do NOT invent vendor-specific API payloads.
3. Enforce strict transaction ordering on `POST /api/v1/auth/tokenized/request-otp/`: commit the narrow `transaction.atomic()` OTP + challenge persistence FIRST, and invoke `OtpDeliveryAdapter.send(...)` ONLY after commit succeeds (use `transaction.non_atomic_requests` on this view if needed under `ATOMIC_REQUESTS=True`).
4. Fix auth defects without DDL:
   - **B1 (Purpose propagation):** Either restrict tokenized request purpose to `login` (documenting `qr_registration` as dormant) OR propagate exact purpose end-to-end from serializer -> BFF -> service -> `verify_otp_challenge()`. Enforce mismatch rejection.
   - **B2 (Request-ID idempotency):** Handle active retry deterministically (return still-active challenge with "existing request / no redispatch"), reject same `request_id` with different phone/purpose, and prevent unique-hash collisions after expiry/consumption without deleting rows or weakening constraints. Never fabricate a `dev_code` that disagrees with the stored OTP hash; force `dev_code` off in `production.py` even if `DEBUG=True`.
   - **B3 (Pre-verification user provisioning):** Inspect whether existing triggers require pre-verify user rows; add a dedicated DRF/IP-scoped throttle on the tokenized OTP request endpoint alongside the DB per-phone limit; avoid creating user rows on invalid/rejected requests where the frozen schema allows, and document any frozen-schema constraint.
   - **B4–B6 (Truthful status, no-phone verify, compact bootstrap):** Keep verify body to `{auth_session_token, code, display_name}` (no phone, exact 6-digit OTP, stable machine-readable error codes), keep `identity_token` stub rejected/non-operational (no CIT), keep legacy routes with deprecation signal, and keep `GET /api/v1/me/bootstrap/` returning actual server values (`email: null` when absent).
5. Add comprehensive unit and PostgreSQL-backed API tests in `test_tokenized_auth_service.py` and `test_bff_auth_tokenized.py` covering all Section 4.5 backend scenarios (post-commit dispatch, DB failure skips adapter, provider states, redaction, `dev_code` suppression, request-ID retries/concurrency, purpose mismatch, parallel verify).

NON-GOALS (DO NOT TOUCH):
- Do NOT implement CIT / JWE / HPKE, Celery/Redis queues, or provider failover.
- Do NOT edit any SQL file, Django migration, or `managed = False` model.
- Do NOT modify mobile files in `mobile/` (Phase B2) or image storage files (Phase C1).
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Print disposable test DB identity before running tests.
- Run against disposable PostgreSQL 18.x:
  - `python backend/manage.py check`
  - `python backend/manage.py test apps.accounts.tests.test_tokenized_auth_service apps.accounts.tests.test_bff_auth_tokenized`
  - `python backend/manage.py spectacular --file /tmp/v0_12_0_openapi_phase_b1.yaml --validate`
- Output the 5-part completion report from Part 1 Section 5.
- HARD STOP. Wait for review before starting Phase B2.
```

---

### Phase B2 — Mobile Auth Client, Ephemeral Challenge State & Secure Token Lifecycle

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 4 (4.4–4.6) of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase B1 PASS.

SCOPE: Align the React Native auth client, `UserContext`, `SessionManager`, `tokenStore`, and `OtpLoginScreen` with the stabilized Phase B1 backend contract.

SCOPED INSPECTION:
- `mobile/src/data/endpoints/authApi.ts`
- `mobile/src/app/UserContext.tsx`
- `mobile/src/core/auth/tokenStore.ts` and `mobile/src/core/auth/sessionManager.ts`
- `mobile/src/features/auth/screens/OtpLoginScreen.tsx`

IN-SCOPE TASKS:
1. Update `mobile/src/data/endpoints/authApi.ts` and auth DTOs:
   - `requestTokenizedOtp()` sends only phone + purpose + `request_id` (never `identity_token` or CIT).
   - `verifyTokenizedOtp()` sends only `auth_session_token`, 6-digit `code`, and optional `display_name` (never `phone`).
   - Map the truthful provider delivery status fields (`configured`, accepted/queued, confirmed receipt, unknown timeout, existing idempotent challenge).
   - Preserve legacy endpoint wrappers for compatibility.
2. Verify and tighten `mobile/src/app/UserContext.tsx`, `mobile/src/core/auth/sessionManager.ts`, and `mobile/src/core/auth/tokenStore.ts`:
   - Keep `auth_session_token` strictly in ephemeral memory; never place it in an `Authorization` header.
   - Persist DRF `Token` via `SessionManager` / native Keychain-Keystore ONLY after successful OTP verification; fail closed in production HTTP mode if native secure storage is unavailable (never fall back silently to AsyncStorage or memory).
   - Clear challenge state on verification success, expiry, change-phone, resend, and navigation exit.
   - Clear session token ONLY on HTTP 401; never clear on 403, 404, 409, 429, 5xx, or network timeout.
   - Ensure OTP request/verify POSTs are never automatically retried on timeout.
3. Update `mobile/src/features/auth/screens/OtpLoginScreen.tsx`:
   - Enforce 6-digit OTP input matching backend `code_length`.
   - Distinguish "accepted by provider" from "SMS delivered" in UI copy; handle `provider_not_configured`, provider rejection, and unknown timeout truthfully without advancing as if sent or showing a `dev_code` banner for real provider flows.
   - On unknown timeout, display uncertain outcome and let the user explicitly trigger a new resend (new `request_id`).
4. Add/update Jest unit and contract tests covering all Section 4.5 mobile criteria.

NON-GOALS (DO NOT TOUCH):
- Do NOT modify backend Python files, SQL files, or coordinator/attendance mobile screens (Phase D2).
- Do NOT add CIT crypto packages or remove legacy auth wrappers.
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Run from `mobile/`:
  - `npx tsc --noEmit`
  - `npm test -- --runInBand` (verify all auth, `ApiClient`, `SessionManager`, `tokenStore`, and `UserContext` tests pass)
- Output the 5-part completion report from Part 1 Section 5.
- HARD STOP. Wait for Phase B review gate approval before starting Phase C1.
```

---

### Phase C1 — Verification Image AES-256-GCM Encryption, Upload & Admin Decrypt Stream

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 5 (5.1–5.5 and crypto/upload/admin tests in 5.8) of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase A PASS (and Phase B gate recommended). All DB tests MUST use a disposable PostgreSQL 18.x database.

SCOPE: Implement AES-256-GCM versioned envelope encryption for server-side verification image files during upload and authorized in-memory decryption in the admin file-streaming endpoint, using existing database columns only.

SCOPED INSPECTION:
- `backend/common/utils.py` (`sanitize_and_save_verification_jpeg`)
- `backend/services/verification_service.py`
- `backend/admin_portal/views.py` (`AdminVerificationImageFileView`)
- `backend/config/settings/base.py` and `backend/config/settings/production.py`

IN-SCOPE TASKS:
1. Create a single dedicated image-crypto module (e.g., `backend/common/image_crypto.py`) using `cryptography.hazmat.primitives.ciphers.aead.AESGCM`:
   - Define one canonical versioned binary envelope (fixed magic/version prefix, key ID, 96-bit cryptographically random nonce per encryption, AES-256-GCM ciphertext+tag) authenticating the version/key-ID header as AAD.
   - Load 32-byte active key (`VERIFICATION_IMAGE_ENCRYPTION_KEY`), active key ID, and optional decryption key ring from environment variables; reject reuse of `PHONE_ENCRYPTION_KEY`, HMAC secrets, or `SECRET_KEY`; add startup validation in production when image features are enabled.
   - Fail closed on missing/unknown key ID, unsupported envelope version, or authentication tag failure. Never log keys, nonces, paths, hashes, or image bytes.
2. Update `backend/common/utils.py` and `backend/services/verification_service.py` upload pipeline per Section 5.4:
   - Keep size pre-check (`VERIFICATION_MAX_UPLOAD_BYTES`), Pillow format/dimension validation, RGB JPEG re-encoding (stripping EXIF), and plaintext JPEG SHA-256 calculation.
   - Encrypt sanitized JPEG bytes in memory; write ciphertext to a private temp file in the target directory beneath `VERIFICATION_MEDIA_ROOT`, flush/fsync, and atomically replace the target file (zero plaintext temp files on disk).
   - Persist existing `UserVerificationImages` fields only (`image_path`, `file_format='jpeg'`, `file_sha256`, etc.); clean up ONLY the newly-created unreferenced ciphertext file if the DB insert fails; return metadata only (never `image_path` or ciphertext).
3. Update `AdminVerificationImageFileView` in `backend/admin_portal/views.py` per Section 5.5:
   - Preserve admin auth check, masked 404, safe audit log (no path/bytes/hash), and path-traversal guard.
   - Read encrypted envelope from disk, decrypt in memory via key ring, verify decrypted SHA-256 matches `file_sha256`, and stream JPEG bytes with `Content-Type: image/jpeg`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and restrictive `Content-Disposition`.
   - Fail closed on any crypto/integrity error; never return ciphertext with an image MIME type or write decrypted bytes to disk.
4. Add unit and PostgreSQL-backed tests covering all crypto, upload, and admin-stream cases in Section 5.8.

NON-GOALS (DO NOT TOUCH):
- Do NOT add columns to `user_verification_images` or store image bytes in PostgreSQL.
- Do NOT run in-place conversion on existing production/prototype image files yet (Phase C2).
- Do NOT modify auth services, attendance services, or mobile code.
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Print disposable test DB identity before running tests.
- Run against disposable PostgreSQL 18.x:
  - `python backend/manage.py check`
  - Run the new image crypto, upload, and admin stream test modules via `python backend/manage.py test ...`
- Verify test assertions inspect the actual file on disk to prove it starts with the encrypted envelope magic bytes (not JPEG `FF D8`) and that admin stream returns byte-identical decrypted JPEG.
- Output the 5-part completion report from Part 1 Section 5.
- HARD STOP. Wait for review before starting Phase C2.
```

---

### Phase C2 — Legacy Plaintext Image Conversion Utility & Key-Management Runbook

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 5 (5.6–5.9) of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase C1 PASS. Do NOT touch existing prototype image files without an operator-verified encrypted/protected backup.

SCOPE: Build and test the idempotent, dry-run-first conversion utility for existing plaintext verification images (preserving `image_path` with zero DB modifications) and document key management, rotation, and recovery.

SCOPED INSPECTION:
- `backend/common/image_crypto.py` (created in Phase C1)
- `backend/apps/accounts/models.py` (`UserVerificationImages`)
- `backend/config/settings/base.py`
- `.env.example` (or project env template)

IN-SCOPE TASKS:
1. Create a controlled management command or script (e.g., `backend/apps/accounts/management/commands/encrypt_verification_images.py`) implementing Section 5.6:
   - Default to `--dry-run` (strictly read-only): report aggregate counts only (DB rows, files on disk, plaintext JPEGs, already-encrypted envelopes, missing files, orphans, total bytes) with zero paths, UUIDs, or PII printed.
   - Require an explicit execution flag (e.g., `--apply --confirm-backup`) and run an encrypt/decrypt self-test before touching any file.
   - Support `--single-test-id` to validate one disposable test image first.
   - Encrypt plaintext files in place using a same-directory temp ciphertext file + atomic replace, preserving each DB `image_path` so zero database writes occur.
   - Verify already-encrypted envelopes without double-encrypting; report missing/corrupt files without deleting DB rows.
   - Provide a `--verify-only` read-only post-conversion audit that confirms every DB-referenced file exists, is encrypted, decrypts via the configured key ring, and matches its stored `file_sha256`.
2. Update `.env.example` with placeholder-only variables for `VERIFICATION_IMAGE_ENCRYPTION_KEY`, active key ID, and key ring (never real secrets), and add concise key-management/rotation/backup-recovery operational documentation per Section 5.7.
3. Add automated tests using temporary test directories and disposable PostgreSQL fixtures covering all migration cases in Section 5.8: dry-run makes zero writes, legacy plaintext encrypts in place preserving `image_path` and `file_sha256`, re-run is idempotent, missing/corrupt files are reported without deleting rows, and zero DB schema/row changes occur.

NON-GOALS (DO NOT TOUCH):
- Do NOT execute `--apply` against the live prototype `VERIFICATION_MEDIA_ROOT` unless the user explicitly confirms a protected backup is in place.
- Do NOT modify any database schema, SQL file, or `user_verification_images` rows.
- Do NOT modify Phase B or Phase D code.
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Print disposable test DB identity before running tests.
- Run `python backend/manage.py check` and the conversion utility test suite against disposable PostgreSQL 18.x.
- Run `--dry-run` against a synthetic test directory and confirm zero file mutations and zero PII/path output.
- Output the 5-part completion report from Part 1 Section 5.
- HARD STOP. Wait for Phase C review gate approval before starting Phase D1.
```

---

### Phase D1 — Backend Business Contract Hardening (Check-In, Assignment, Donations & Invites)

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 6 (6.1–6.3, 6.5, 6.7–6.8, and backend tests in 6.10) of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase A PASS (and Phases B–C recommended). All DB tests MUST target a disposable PostgreSQL 18.x database only.

SCOPE: Repair backend business-contract defects across manual assignment event validation, manual check-in authority, coordinator attendance metric semantics, donation preference partial PATCH consistency, and invite round-trip attribution—with zero database schema changes.

SCOPED INSPECTION:
- `backend/services/assignment_service.py` and `backend/bff/coordinator/views.py`
- `backend/services/attendance_service.py` and `backend/bff/checkin/views.py`
- `backend/services/profile_service.py`
- `backend/services/application_service.py`

IN-SCOPE TASKS:
1. **Manual Assignment Event Validation (Section 6.3):** Add an application-level check ensuring the URL `event_id` matches the loaded application's actual event before invoking the existing SQL `assign_manually()` function. Reject cross-event mismatches with a stable 400/404 response. Do not alter `assign_manually()` or any trigger.
2. **Manual Check-In Contract Verification (Section 6.2):** Verify `POST /api/v1/checkin/attendance/manual-checkin/` enforces authenticated manager write permissions (owner-as-monitor 403, unrelated coordinator masked 404, cancelled attendance 409), preserves existing QR/geo method and original `checkin_at` on repeat check-in (`already_checked_in`), keeps actor/note auditable, and returns all authoritative response fields. Keep older aliases intact.
3. **Attendance Metric Semantics (Section 6.5):** Inspect how coordinator attendance counts are served from `v_event_summary.checked_in_count` (which is all-time). Without altering `v_event_summary` or adding views/columns, either expose a clearly named all-time count or compute a properly scoped daily metric in an existing service query over existing tables, and test with multi-date fixtures.
4. **Donation Preferences & Invite Round-Trip (Sections 6.7–6.8):** Verify and add PostgreSQL-backed regression tests for the full 8-case partial PATCH donation transition matrix (master flag vs blood/items sub-flags) and the invite round-trip (coordinator invite -> volunteer list -> volunteer accept/reject by same application ID -> coordinator sees same application ID, no duplicate browse application).

NON-GOALS (DO NOT TOUCH):
- Do NOT edit any SQL file, view (`v_event_summary`), stored function (`assign_manually`), trigger, or Django migration.
- Do NOT add GPS/geofence requirements to manual check-in.
- Do NOT edit mobile files in `mobile/` (Phase D2).
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Print disposable test DB identity before running tests.
- Run against disposable PostgreSQL 18.x:
  - `python backend/manage.py check`
  - `python backend/manage.py test backend/apps/attendance/tests/test_bff_checkin_phase7.py` (plus assignment, donation, invite, and coordinator metric test modules)
  - `python backend/manage.py spectacular --file /tmp/v0_12_0_openapi_phase_d1.yaml --validate`
- Output the 5-part completion report from Part 1 Section 5.
- HARD STOP. Wait for review before starting Phase D2.
```

---

### Phase D2 — Mobile HTTP Repository Cleanup, Honest Mappers & Endpoint Parity Matrix

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 6 (6.2, 6.4–6.11) of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phase D1 PASS.

SCOPE: Remove all fabricated fallback data in mobile HTTP repositories, fix manual check-in cache prerequisites, align metric labels and null event geo fields, prevent stale local donation overrides, and complete the canonical BFF-to-mobile route matrix.

SCOPED INSPECTION:
- `mobile/src/data/http/HttpCoordinatorRepository.ts`
- `mobile/src/data/endpoints/checkinApi.ts`
- `mobile/src/data/mappers/coordinatorMapper.ts` and `mobile/src/data/mappers/profileMapper.ts`
- `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx`

IN-SCOPE TASKS:
1. **Manual Check-In Mobile Contract (Section 6.2):** Ensure the HTTP repository calls the canonical `checkinApi` wrapper (`/api/v1/checkin/attendance/manual-checkin/`) using explicit `(eventId, volunteerUserId)` with NO preloaded roster-cache prerequisite. Use authoritative server response DTOs or deterministic roster refetch; remove `new Date()` timestamps, speculative geo-pending clears, and optimistic pre-API success states; preserve prior row state on 403/404/409/validation errors.
2. **Remove Fabricated Fallbacks (Section 6.4):** Audit all HTTP repositories and use cases and eliminate synthetic fallback objects:
   - `HttpCoordinatorRepository.updateApplicationStatus()`: return a minimal typed server mutation result or deterministic refetch; fail explicitly on sync failure instead of fabricating applicant details/timestamps.
   - `HttpCoordinatorRepository.manualCheckIn()`: return authoritative mutation fields + refetch or explicit sync failure; never invent event title, volunteer name, post title, or assignment ID.
   - Assignment creation & feedback metrics: remove placeholder/first-managed-event fallbacks and hard-coded sample ratings/counts; represent unavailable metrics as unavailable/empty.
3. **Metric Semantics, Event Geo Fields & Donation/DTO Mappers (Sections 6.5–6.9):**
   - Rename `checkedInTodayCount` to match its real all-time semantics OR bind it to the true daily backend field from Phase D1 (never mislabel all-time as "today").
   - Fix event detail mapping so missing latitude/longitude remain `null`/`undefined` (never `(0,0)`) and missing `geo_checkin_enabled` never defaults to `true`.
   - Ensure `profileMapper.ts` does not override server-owned donation aggregate semantics with stale local state.
   - Audit and complete explicit DTO-to-domain mapping for currently exposed capability surfaces (event post capacity, coordinator history, volunteer UUID lookup, geo-attempt review metadata, charity taxonomy, feedback summary/items, attendance roster/manual response) without inventing missing BFF fields.
4. Refresh the complete canonical route parity matrix (Section 6.9) covering all active BFF routes, mobile wrappers, DTOs, domain mappers, and tests.
5. Add/update Jest tests covering all Section 6.10 mobile criteria (no warm cache manual check-in, no fabricated fallbacks, null geo fields, metric semantics, donation/invite mapping, mock vs HTTP contract parity).

NON-GOALS (DO NOT TOUCH):
- Do NOT activate native GPS/geofence UI or map navigation.
- Do NOT modify backend SQL or Python files unless a verified OpenAPI contract bug blocks mapping (if found, report as a blocker).
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Run from `mobile/`:
  - `npx tsc --noEmit`
  - `npm test -- --runInBand`
- Confirm via grep/audit that no fabricated placeholder objects or `(0,0)` / `geo_checkin_enabled ?? true` coercions remain in `mobile/src/data/http/` or `mobile/src/data/mappers/`.
- Output the 5-part completion report from Part 1 Section 5 (including the completed route parity matrix).
- HARD STOP. Wait for Phase D review gate approval before starting Phase E.
```

---

### Phase E — Full Disposable-DB Suite, Real HTTP Gate, Device QA & Stabilization Sign-Off

```text
Read Part 1 of `agent_execution_prompt_v0_12_0_stabilization.md` and Section 7 ("PHASE E — FULL VERIFICATION, DEVICE QA AND STABILIZATION SIGN-OFF") of `V0_12_0_STABILIZATION_MASTER_PLAN.md`.

PREREQUISITE: Phases A, B1, B2, C1, C2, D1, and D2 all PASS. All write/integration tests MUST run ONLY against a separate disposable PostgreSQL 18.x database (never `volunteer_coordination_db`).

SCOPE: Execute end-to-end verification on the exact candidate Git SHA across backend, OpenAPI, mobile Jest, real HTTP integration, security/privacy log audit, performance measurements, and platform build/device checks, then produce `v0_12_0_stabilization_report.md`.

SCOPED INSPECTION:
- `scripts/run_real_http_suite.py`
- `mobile/src/data/__tests__/v0_12_0_realHttpIntegration.test.ts`
- `.github/workflows/v0_12_0_integration.yml`
- `artifacts/v0_12_0_db_preflight_<commit>.md`

IN-SCOPE TASKS:
1. **Backend Verification (Section 7.2):** Against a clean disposable PostgreSQL 18.x database (print non-secret target identity first), run:
   - `python backend/manage.py check`
   - PostgreSQL schema-object preflight on the disposable DB
   - Full backend test suite (auth challenge invariants, auth service, tokenized BFF, manual check-in, profile/donation/invite/assignment/privacy, verification image encryption/upload/admin stream)
   - `python backend/manage.py spectacular --file /tmp/v0_12_0_openapi_final.yaml --validate`
2. **Mobile & Real HTTP Verification (Sections 7.3–7.4):**
   - Run `cd mobile && npm ci && npx tsc --noEmit && npm test -- --runInBand`.
   - Run `mobile/src/data/__tests__/v0_12_0_realHttpIntegration.test.ts` (via `scripts/run_real_http_suite.py` or equivalent) against the live local Django server backed by the disposable PostgreSQL 18.x database, verifying all Section 7.4 scenarios: Authentication (OTP request/provider status/no-phone verify/DRF token/bootstrap/errors/concurrency/request-ID idempotency/no `dev_code`), Manual Check-In (explicit IDs/idempotency/403/404/401/409), Verification Images (multipart upload -> ciphertext on disk -> metadata excludes path -> admin decrypted JPEG stream -> non-admin blocked -> tamper fail-closed), and Client Session (401-only clear, no OTP POST auto-retry).
3. **Android/iOS Build & Device QA Check (Section 7.5):** Run available Android/iOS native build checks for secure storage (Keystore/Keychain) and document exact build/device test results. If a physical device/emulator or macOS/iOS toolchain is unavailable in the CLI environment, record it honestly as NOT EXECUTED / CONDITIONAL blocker—never fabricate device verification.
4. **Security, Privacy & Performance Audit (Sections 7.6–7.7):**
   - Scan backend/mobile test logs to confirm zero raw phone, OTP, challenge token, DRF token, provider API key, image path, or decrypted image bytes appear.
   - Verify active storage is outside public `MEDIA_ROOT`/static, production suppresses `dev_code`, and no CIT/`identity_token` requests are sent.
   - Record observed feasibility latencies (OTP request with/without provider, verify, `/me/bootstrap/`, manual check-in, image upload+encrypt, admin decrypt+stream) without inventing SLAs.
5. **Final Sign-Off Artifact (Section 7.8):** Generate `v0_12_0_stabilization_report.md` containing all 13 required items (candidate SHA/branch, DB preflight reference & PG version, explicit no-schema-modification statement, CI status/URL, backend/OpenAPI/mobile/real-HTTP/device evidence, OTP provider mode & acceptance-vs-delivery semantics, image crypto algorithm/envelope version/key ID/inventory counts, unresolved defects/deferred items, and honest release decision: `PASS`, `CONDITIONAL PASS`, or `NO-GO`). Zero secrets, tokens, or PII in the report.

NON-GOALS (DO NOT TOUCH):
- Do NOT run destructive tests or fixture seeding against `volunteer_coordination_db`.
- Do NOT weaken assertions, skip failing tests, or claim "100% complete" / "production ready" without evidence.
- Do NOT commit, push, or open a PR unless explicitly instructed.
- Do NOT inspect `old_doc/`.

VERIFICATION & HARD STOP:
- Verify all Section 7.9 Exit Criteria checkboxes honestly against recorded command outputs.
- Confirm `v0_12_0_stabilization_report.md` contains zero secrets, raw phones, tokens, keys, or private file paths.
- Output the 5-part completion report from Part 1 Section 5.
- HARD STOP. Stabilization execution is complete pending human review of `v0_12_0_stabilization_report.md`.
```