# Volunteer Coordination System — v0.12.0 Stabilization Master Plan

**Document type:** Technical stabilization specification and acceptance contract  
**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch reviewed:** `main`  
**Reviewed HEAD:** `99db25a7ba26d26ad5d803e028ce405b827e926d` (`remove error file`)  
**Document date:** 2026-11-21  
**Target:** Stabilize the existing v0.12.0 feasibility prototype without redesigning it  
**Execution model:** One phase at a time using Gemini Flash CLI; the future phase-prompt document must reference this master plan  
**Database policy:** DATABASE FROZEN — NO SCHEMA OR DATABASE-OBJECT CHANGES

---

## 0. Executive decision and non-negotiable direction

### 0.1 Objective

Stabilize the existing v0.12.0 implementation so the feasibility prototype can be demonstrated reliably across the existing Django/DRF backend, PostgreSQL database, React Native mobile application, and server-side verification-image storage.

This is a stabilization effort. It is **not** a redesign, rewrite, architecture migration, or feature expansion. Preserve the current architecture and existing business rules. Repair the implementation where it does not meet its own contracts, improve the execution and security boundaries, and prove the result through repeatable tests.

### 0.2 Architecture to preserve

Keep the current technologies and layering:

- **Backend:** Python, Django, Django REST Framework, existing BFF modules and service layer.
- **Database:** PostgreSQL, database-first schema, stored functions, constraints, triggers and views.
- **Mobile:** React Native and TypeScript.
- **Mobile layers:** existing screens, domain models, use cases, DTOs, mappers, endpoint wrappers, repository interfaces, HTTP repositories and mock repositories.
- **Authentication:** phone-based OTP request, one-time `auth_session_token` challenge, and the existing DRF `Token` for authenticated API calls.
- **Attendance:** PostgreSQL-backed attendance state and the existing coordinator manual check-in flow.
- **Verification images:** files stored on the server, not as database blobs.

Do not replace these patterns with a different framework or a new architecture.

### 0.3 Database freeze — absolute rule

The database is frozen from this point forward. Treat the current PostgreSQL schema and its business logic as the immutable contract.

The following are prohibited during this stabilization project:

1. Editing `postgres_sql/updated_volunteer_coordination_system_Database.sql`.
2. Editing or executing schema upgrades against the existing local/prototype database, including `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` and `scripts/alter_local_db.py`.
3. Adding, removing, renaming or changing tables, columns, data types, defaults, constraints, indexes, triggers, views, stored functions or procedures.
4. Creating Django migrations or changing `managed = False` models to make Django manage the database schema.
5. Using `migrate`, `makemigrations`, schema editors or ORM-generated DDL against the existing project database.
6. Running destructive tests, reset commands, seed scripts, truncation, data cleanup or rollback SQL against the existing project database.
7. Trying to repair a failed database preflight automatically by running SQL from an agent.

**Permitted:** ordinary application reads and writes that the already-existing schema supports; new backend/mobile code that uses the current schema; file-system operations for encrypted image storage; and database tests against a separate disposable test database created from an approved copy of the frozen baseline.

The canonical database files are read-only reference material for this task. A separate ephemeral CI/test database may be initialized from the frozen schema plus the already-existing v0.12.0 additive upgrade script, but that must never point at or modify the existing local/prototype database. The SQL files themselves must remain unchanged.

### 0.4 Explicit prototype scope decisions

| Area | v0.12.0 stabilization decision |
|---|---|
| General architecture | Preserve; no redesign |
| PostgreSQL schema | Frozen; no DDL or stored-object changes |
| PostgreSQL minimum runtime | Use PostgreSQL 18.x for the prototype baseline; verify exact version during preflight |
| OTP verification | Keep challenge-bound verification; verify with `auth_session_token` and code only |
| OTP delivery | Keep a provider-neutral adapter boundary and add a configured external network/SMS provider adapter; in the prototype, send synchronously/directly to the submitted mobile number through the configured provider |
| Provider delivery semantics | Never claim handset delivery solely because a provider accepted an API request |
| CIT / encrypted identity envelope | **Not implemented in this prototype.** Use phone over TLS for OTP request. Do not build JWE/HPKE/CIT here. |
| DRF API token | Retain existing DRF `Token` and `Authorization: Token <token>` behavior |
| Verification images | Sanitize then encrypt as files on the server; never store image bytes in PostgreSQL |
| Image database metadata | Reuse existing `image_path`, `file_format`, `file_sha256` and review fields; no new columns |
| Native GPS / mobile geofence UI | Deferred; do not activate or redesign |
| Friends | Coming Soon / deferred |
| Async OTP worker / durable queue | Not required for this feasibility prototype; use a bounded direct provider call after OTP/challenge persistence |
| Legacy OTP routes | Keep for compatibility; do not remove during stabilization |
| Old documentation | Do not inspect or modify `old_doc/` or any subdirectory |

### 0.5 What this document is

This is the detailed source of truth for the stabilization work. It defines the database-first decision gate, implementation phases A–E, constraints, specific defects to address, test plans, stop/go criteria, and the evidence Gemini Flash CLI must provide.

It is not the later prompting document. The later prompting document should contain the individual phase prompts and point back to this master plan. Do not ask the coding agent to implement all phases in one large operation.

---

## 1. Repository baseline and evidence boundary

### 1.1 Reviewed baseline

At review time:

- Repository: `ThuraAung-Rayaar/Volunteer_Coordination_System`
- Branch: `main`
- HEAD: `99db25a7ba26d26ad5d803e028ce405b827e926d`
- Latest commit message: `remove error file`
- Current HEAD deleted `.github/workflows/v0_12_0_integration.yml`.
- A prior real-HTTP report exists, but it records commit `1c0f238d286c389e9e14cdb6644ada823c3c6082`, not the reviewed HEAD.
- The last observed integration CI failure was associated with an earlier commit and failed during PostgreSQL schema initialization with `function uuidv7() does not exist`; downstream database tests could not proceed.

Do not assume any test report from an earlier SHA proves the current HEAD works. Every stabilization result must record its exact commit SHA.

### 1.2 Reading order for the coding agent

Before editing anything, the coding agent must inspect these source materials in this order:

**First — `docs/`:**

1. `docs/full_database_details.md`
2. `docs/backend_analysis.md`
3. `docs/mobile_analysis.md`
4. `docs/tokenization_login_architecture.md`

**Second — `reference/`:**

1. `reference/v0_12_0_backend_client_handshake_plan.md`
2. `reference/v0_12_0_database_migration_guide.md`
3. `reference/agent_execution_prompt_v0_12_0_handshake.md`
4. `reference/v0_12_0_real_http_integration_report.md`
5. `reference/database_deep_dive.md`
6. Relevant v0.12.0 entries in `reference/prompt_log/` and `reference/log/`

`old_doc/` is explicitly excluded.

### 1.3 Important existing implementation facts

These facts were observed in the reviewed source and must guide the fixes:

- `docs/full_database_details.md` describes `volunteer_coordination_db` on PostgreSQL 18.6, with 31 base tables and populated prototype data.
- The documented database includes `auth_otp_challenge` and `user_verification_images`.
- The canonical SQL contains `uuid UUID NOT NULL DEFAULT uuidv7()` in `users`.
- PostgreSQL's built-in `uuidv7()` is a PostgreSQL 18 feature. The PostgreSQL 14+/16 compatibility wording in older project documentation is stale for the current canonical schema. See the official PostgreSQL 18 UUID documentation: <https://www.postgresql.org/docs/18/datatype-uuid.html> and release notes: <https://www.postgresql.org/docs/18/release-18.html>.
- The canonical schema file contains the challenge table and retention function definitions, while the existing additive upgrade file contains the challenge guard trigger and the `create_otp_challenge` / `verify_otp_challenge` functions. The runtime database must be checked for the full set; do not assume the base SQL file alone supplies every required object.
- Django models for core business tables are unmanaged (`managed = False`). PostgreSQL owns DDL and business constraints.
- OTP service code already has an `OtpDeliveryAdapter` abstraction and a `ConsoleOtpDeliveryAdapter`, but the current active adapter does not dispatch real SMS.
- The tokenized request accepts `phone` over TLS and has an `identity_token` stub. The prototype must use phone over TLS and must not attempt CIT.
- Verification-image uploads are sanitized to JPEG and currently written as plaintext files beneath `VERIFICATION_MEDIA_ROOT`. The database stores a relative path and metadata; it does not store the image bytes.
- Admin image viewing currently opens the stored file and streams it directly. It must decrypt encrypted file content before returning image bytes.

### 1.4 Evidence labels

Every implementation report must distinguish:

- **Source inspected:** the code exists and its structure was reviewed.
- **Static verification:** lint, type check, schema generation or compile succeeded.
- **Unit test:** isolated unit behavior passed.
- **PostgreSQL-backed test:** test executed against PostgreSQL, not SQLite.
- **Real HTTP test:** actual network HTTP request to the Django BFF, with the actual mobile `ApiClient` or a real client transport.
- **Device test:** Android/iOS application installed and behavior tested on a real device or approved emulator.

Never describe a source-level observation or a mocked Jest test as real runtime verification.

---

# 2. FIRST ACTION — DATABASE PREFLIGHT AND DECISION GATE

**This is mandatory and must happen before Phase A coding, before mobile changes, and before running any command that can write to the project database.**

The agent must first inspect the database connection and the existing objects using read-only SQL. It must not run migrations, seeds, tests that write to the current database, maintenance functions, or ORM writes during this stage.

## 2.1 Identify the exact database target

Read the effective connection values without printing the password or any secret:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- Active Django settings module
- Effective `ATOMIC_REQUESTS` value

Expected database name in the documented prototype: `volunteer_coordination_db`.

The agent must print the host, port, database name, user, settings module and current Git SHA. It must mask passwords and all cryptographic secrets.

Do not silently fall back to another local PostgreSQL instance, SQLite, a database with a similar name, or a developer's default connection.

## 2.2 Read-only connection checks

Run the following checks using `psql` or an equivalent PostgreSQL client. Use a read-only transaction. Do not include passwords in command history.

Example PowerShell connection setup:

```powershell
# Set credentials in the process environment, not in a committed file or command argument.
$env:PGPASSWORD = $env:DB_PASSWORD
psql -X -v ON_ERROR_STOP=1 `
  -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME
```

Once connected, execute:

```sql
BEGIN READ ONLY;

SELECT
    current_database()                         AS database_name,
    current_user                               AS connected_user,
    current_setting('server_version')          AS server_version,
    current_setting('server_version_num')      AS server_version_num,
    current_setting('transaction_read_only')   AS transaction_read_only,
    current_setting('search_path')             AS search_path,
    pg_is_in_recovery()                        AS is_replica;

SELECT
    to_regprocedure('uuidv7()') AS uuidv7_function,
    to_regclass('public.users') AS users_table,
    to_regclass('public.auth_otp') AS auth_otp_table,
    to_regclass('public.auth_otp_challenge') AS auth_otp_challenge_table,
    to_regclass('public.user_verification_images') AS verification_images_table,
    to_regclass('public.attendance') AS attendance_table,
    to_regclass('public.assignments') AS assignments_table,
    to_regclass('public.events') AS events_table,
    to_regclass('public.event_applications') AS event_applications_table,
    to_regclass('public.event_posts') AS event_posts_table;

SELECT count(*) AS public_base_table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

SELECT key, value_int
FROM app_settings
WHERE key IN (
    'otp_ttl_minutes', 'otp_max_attempts', 'otp_max_requests_per_hour'
)
ORDER BY key;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
      'users', 'auth_otp', 'auth_otp_challenge',
      'user_verification_images', 'attendance', 'assignments'
  )
ORDER BY table_name, ordinal_position;

SELECT
    to_regprocedure('create_otp_challenge(bigint,text,integer,text,text,text)') AS create_otp_challenge,
    to_regprocedure('verify_otp_challenge(text,text,text)') AS verify_otp_challenge,
    to_regprocedure('purge_expired_otp_challenges(interval)') AS purge_expired_otp_challenges,
    to_regprocedure('purge_expired_otps()') AS purge_expired_otps,
    to_regprocedure('request_otp(text,text,text)') AS request_otp,
    to_regprocedure('release_expired_blocks()') AS release_expired_blocks;

SELECT
    c.relname AS table_name,
    t.tgname AS trigger_name,
    t.tgenabled AS enabled_state,
    pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND c.relname IN (
      'auth_otp', 'auth_otp_challenge', 'users',
      'user_verification_images', 'attendance', 'assignments'
  )
ORDER BY c.relname, t.tgname;

SELECT
    rel.relname AS table_name,
    c.conname AS constraint_name,
    c.contype AS constraint_type,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND rel.relname IN (
      'users', 'auth_otp', 'auth_otp_challenge',
      'user_verification_images', 'attendance', 'assignments'
  )
ORDER BY table_name, constraint_name;

SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
      'v_event_summary', 'v_event_checkin_board',
      'v_pending_confirmations', 'v_geo_attempts_review',
      'v_event_post_capacity', 'v_accepted_unassigned'
  )
ORDER BY table_name;

-- Integrity checks: read-only counts only. No rows or tokens are printed.
SELECT count(*) AS orphaned_challenges
FROM auth_otp_challenge c
LEFT JOIN auth_otp o ON o.id = c.otp_id
WHERE o.id IS NULL;

SELECT count(*) AS challenge_expiry_exceeds_parent
FROM auth_otp_challenge c
JOIN auth_otp o ON o.id = c.otp_id
WHERE c.expires_at > o.expires_at;

SELECT count(*) AS challenge_purpose_mismatches
FROM auth_otp_challenge c
JOIN auth_otp o ON o.id = c.otp_id
WHERE c.purpose <> o.purpose;

SELECT count(*) AS current_image_rows_missing_path
FROM user_verification_images
WHERE image_path IS NULL OR btrim(image_path) = '';

COMMIT;
```

`to_regclass()` and `to_regprocedure()` return `NULL` for missing objects, so the first object-inventory query can report missing relations/functions without modifying anything. Run the later integrity-count queries only after confirming their required tables exist; if a required table is missing, record FAIL and skip dependent queries. Do not replace read-only queries with `CREATE`, `ALTER`, `DROP`, `UPDATE`, `DELETE`, `TRUNCATE`, `SELECT ... FOR UPDATE`, or calls to maintenance functions.

## 2.3 Additional file-system preflight for images

This is a read-only file-system inventory, not a database mutation. Use the configured `VERIFICATION_MEDIA_ROOT` path without opening, modifying, renaming or deleting image contents during preflight.

Collect:

- Whether the configured directory exists.
- Number of database image rows.
- Number of files under the private root.
- Number of files referenced by `image_path` that exist.
- Count of legacy plaintext JPEGs, if detectable by file signature.
- Count of already-encrypted files, if the project already has a recognized encrypted envelope marker.
- Total bytes and largest file size.

Do not print user UUIDs, filenames, image paths, hashes or image contents in the report. Aggregate counts only.

If the private directory is currently under a web-accessible/static path, treat that as a security blocker. The expected configured path is `VERIFICATION_MEDIA_ROOT`, outside public `MEDIA_ROOT` and outside static assets.

## 2.4 Database pass criteria

The database preflight is **PASS** only if all mandatory checks below hold:

1. Connection resolves to the intended `volunteer_coordination_db` target.
2. Database is PostgreSQL 18.x or later and the `uuidv7()` function resolves. The documented reference environment is PostgreSQL 18.6. The current canonical schema requires `uuidv7()`; do not claim PostgreSQL 14/16 support while the frozen SQL still requires this built-in function.
3. `users`, `auth_otp`, `auth_otp_challenge`, `user_verification_images`, `attendance`, `assignments`, `events`, `event_applications` and `event_posts` exist.
4. Required challenge functions exist with the signatures expected by the service layer.
5. The challenge guard trigger exists and is enabled.
6. Core attendance/user/application triggers, constraints and coordinator views expected by existing services are present and enabled.
7. No challenge references a missing OTP row.
8. No challenge expiry exceeds the parent OTP expiry.
9. No challenge-purpose mismatch exists.
10. Database user has the permissions needed for ordinary application DML but does not require DDL permission for the stabilization work.
11. The current DB identity matches the configured app connection; no silent fallback occurred.

The documented count of 31 public base tables is a comparison point from `docs/full_database_details.md`, not a substitute for checking required named objects. The same snapshot reports 76 `user_verification_images` rows; use that only as a historical reference and inventory the current files/rows independently. If either count differs, investigate before declaring PASS.

## 2.5 Decision branches — what happens after the database check

### Branch A — PASS

If every mandatory criterion passes:

1. Save the read-only output as `artifacts/v0_12_0_db_preflight_<commit>.md` or JSON/text artifact without secrets or PII.
2. Record PostgreSQL version, database target alias, required object presence, object counts and integrity counts.
3. Confirm that no DDL or migration has been run.
4. Take a verified backup/snapshot according to the project's existing backup process before any file encryption operation that touches existing image files. The backup must be protected and must not expose plaintext images.
5. Proceed to Phase A.

### Branch B — Connection or configuration failure

Examples: PostgreSQL stopped, wrong host/port, credentials invalid, wrong database name, or app settings point at another instance.

Actions:

1. Stop. Do not run tests or code that will write to another database.
2. Fix only the external connection configuration or PostgreSQL service selection.
3. Do not create a replacement schema or run any migration.
4. Repeat the complete read-only preflight.
5. Proceed only after PASS.

### Branch C — PostgreSQL version mismatch or missing `uuidv7()`

The current schema uses native `uuidv7()`, introduced in PostgreSQL 18. The current project database snapshot reports PostgreSQL 18.6.

Actions:

1. Stop all database-backed test and migration activity.
2. Point the prototype/test runtime to a compatible PostgreSQL 18.x instance matching the current database baseline, preferably the same verified 18.6 environment when available.
3. Do not edit the SQL default, replace UUID generation, install an unapproved extension, or alter the database to work around the mismatch.
4. Update only environment/deployment/CI configuration and stale documentation that claims the frozen schema works on PostgreSQL 14/16.
5. Repeat the read-only preflight.
6. If the required compatible runtime cannot be provided, report BLOCKED. Do not proceed by silently changing database behavior.

### Branch D — Missing table, function, trigger, view, constraint or schema drift

Actions:

1. Stop. Do not execute the migration guide, `alter_local_db.py`, base SQL, a `CREATE OR REPLACE` statement, or a manual repair query.
2. Compare the live objects with the frozen SQL files and the database snapshot.
3. Determine whether the application points to the wrong database or whether the intended database has drifted.
4. If it is the wrong target, correct the connection configuration and repeat preflight.
5. If the intended database is genuinely missing or has changed objects, preserve the evidence and report BLOCKED. Any repair requires a separate, explicit database-change decision; it is outside this stabilization mandate.

### Branch E — Data integrity failure

Examples: orphaned challenge records, challenge expiry beyond OTP expiry, purpose mismatch, missing image paths, or inconsistent attendance states.

Actions:

1. Stop and preserve read-only results.
2. Do not modify or delete rows to make tests pass.
3. Identify whether the result is a stale test row, known legacy data, or genuine corruption using read-only queries and approved audit logs.
4. Record the exact affected count and the affected entity category only; do not print PII or token material.
5. Report BLOCKED and request a separately approved data-repair process. The database freeze remains in force.

### Branch F — PASS with image-storage warnings only

If database checks pass but image files are missing, plaintext, or stored in an exposed location:

1. Authentication and non-image backend work may proceed only if the affected image feature is kept disabled for user-facing upload/review operations.
2. Phase C cannot pass until storage and encryption are corrected.
3. Do not delete old images or image rows to simplify migration.

## 2.6 What must never be run against the existing database

The coding agent must treat these as blocked unless explicitly directed to a separate disposable database:

```text
python scripts/alter_local_db.py
psql ... -f postgres_sql/updated_volunteer_coordination_system_Database.sql
psql ... -f postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
python scripts/seed_integration_fixtures.py
python manage.py migrate
python manage.py makemigrations
DROP DATABASE ...
DROP TABLE ...
TRUNCATE ...
DELETE FROM ...
```

Also prohibit tests whose setup/teardown writes to the current prototype database. Use a separate disposable PostgreSQL database for integration tests.

---

# 3. PHASE A — DATABASE FREEZE CONFIRMATION, ENVIRONMENT ALIGNMENT AND CI RECOVERY

**Dependency:** Database preflight PASS.  
**Primary objective:** Prove that the existing database is usable without changing it, align the test environment with the frozen PostgreSQL baseline, and restore automated verification.

## 3.1 Scope

Phase A may change:

- CI workflow files.
- Environment/configuration documentation.
- Test harness configuration.
- Database preflight/report scripts that only read the project database.
- Test isolation utilities that direct tests to a dedicated disposable database.

Phase A must not change:

- Any SQL source file under `postgres_sql/`.
- Any database object or row in the existing prototype database.
- Django `managed = False` declarations.
- Existing domain logic, auth implementation, image implementation or UI (those belong to later phases).

## 3.2 Required work

### A1. Record frozen baseline and prevent accidental DDL

Create a concise baseline record containing:

- Git HEAD and branch.
- PostgreSQL server version and server version number.
- Database name and non-secret connection identity.
- Public table count for comparison with the 31-table snapshot.
- Presence of required challenge, auth, attendance, image and view objects.
- Object-integrity check counts.
- Image storage directory inventory counts.
- Statement that no database object or data was changed during preflight.

Do not create an automatic schema “repair” feature. The preflight script must fail safely and report missing objects.

### A2. Align PostgreSQL CI runtime

The deleted `.github/workflows/v0_12_0_integration.yml` must be replaced with an active integration workflow.

Requirements:

1. Use PostgreSQL 18.x, not PostgreSQL 16.
2. Print and archive `SHOW server_version` in CI artifacts.
3. Pin the database image to a deliberate PostgreSQL 18 tag; do not use an unreviewed `latest` tag.
4. Create a new ephemeral database for CI. Never point GitHub Actions at the developer's existing prototype database.
5. Load the frozen canonical schema into the ephemeral CI database with `psql -v ON_ERROR_STOP=1` and shell `set -e`.
6. Apply the already-existing `v0_12_0_auth_otp_challenge_upgrade.sql` to the ephemeral CI database only if the frozen base SQL does not provide every required function/trigger. The repository currently has the challenge table/retention definitions in the base SQL and challenge verification/creation functions in the additive upgrade file; verify that contract before deciding the order.
7. Do not edit either SQL file to make CI pass.
8. Do not run the additive script against the existing local/prototype database.
9. Ensure schema bootstrap failure stops the workflow immediately. No backend tests should run against a partially created schema.
10. Record the CI commit SHA, PostgreSQL version, schema bootstrap result and artifact references.

Suggested strict shell pattern:

```bash
set -euo pipefail
export PGPASSWORD="$DB_PASSWORD"
psql -X -v ON_ERROR_STOP=1 \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f postgres_sql/updated_volunteer_coordination_system_Database.sql

# The challenge migration is permitted only for the newly created disposable CI DB.
psql -X -v ON_ERROR_STOP=1 \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
```

The CI script must establish that `$DB_NAME` is the ephemeral workflow service database, not a developer connection. It must not accept production secrets or a remote production host.

### A3. Restore required CI stages

The workflow must run in dependency order:

1. Checkout and record SHA.
2. Start PostgreSQL 18.x and wait for health.
3. Install backend dependencies.
4. Initialize disposable test DB from the frozen schema and existing upgrade script.
5. Run Django system checks.
6. Generate and validate OpenAPI.
7. Run PostgreSQL-backed Django service/API tests.
8. Install mobile dependencies with lockfile enforcement (`npm ci`).
9. Run `npx tsc --noEmit`.
10. Run mobile unit/contract Jest tests, excluding only the live HTTP suite if it runs separately.
11. Run the real-HTTP suite against the CI Django/PostgreSQL instance.
12. Run the verification-image encrypted storage tests.
13. Upload non-sensitive logs and reports.

A missing stage is not a passing stage. CI must fail if any required command is skipped or has a non-zero exit code.

### A4. Protect test data

The existing `scripts/seed_integration_fixtures.py` creates users, coordinators, events, applications, attendance records and DRF tokens, and writes token/phone details into a fixture. Ensure it can only target a disposable integration database.

Required controls:

- Require an explicit environment marker such as `APP_ENV=ci` or `APP_ENV=test` plus a database name allow-list.
- Refuse `production`, `prod`, any non-allow-listed database, and any remote host not explicitly allowed for CI.
- Do not print raw authentication tokens or phone numbers in CI logs.
- Store temporary fixture material only in the ephemeral CI workspace, restrict file access and delete it after the test run.
- Never upload secrets or integration fixture files as public CI artifacts.
- Never invoke the seeder against `volunteer_coordination_db` unless that database is itself a disposable clone created specifically for the test and explicitly marked as such.

### A5. Baseline static checks

Before later phases, Phase A must establish that current code can at least be loaded and inspected:

- `python backend/manage.py check` with the test environment configuration.
- `python backend/manage.py spectacular --file <temporary-output> --validate` with output outside tracked source until review.
- `cd mobile && npx tsc --noEmit`.
- `cd mobile && npm test -- --runInBand` or the project's equivalent locked command.

Do not claim runtime integration success from these checks.

## 3.3 Phase A acceptance criteria

- [ ] Database preflight is PASS and artifact saved.
- [ ] No DDL, migration, seed or data cleanup ran against the existing prototype DB.
- [ ] PostgreSQL test environment is PostgreSQL 18.x and records its exact version.
- [ ] CI workflow exists on current `main` and is triggered by the relevant branch/PR events.
- [ ] CI database bootstrap uses strict fail-fast shell behavior.
- [ ] CI test data is isolated and sensitive fixture values are redacted.
- [ ] Django checks pass.
- [ ] OpenAPI validation passes.
- [ ] Mobile TypeScript and existing Jest suite pass, or remaining failures are recorded as blockers with exact test names.
- [ ] Phase A report contains SHA, commands, results, and next gate.

**HARD STOP:** Do not begin Phase B until Phase A has passed review. If database preflight is not PASS, Phase A remains blocked; do not compensate with schema changes.

---

# 4. PHASE B — AUTHENTICATION STABILIZATION AND DIRECT OTP NETWORK DELIVERY

**Dependency:** Phase A PASS.  
**Primary objective:** Stabilize the existing challenge-bound OTP flow and provide a provider-neutral network delivery integration boundary that can send the OTP directly to the mobile number requested by the user in the feasibility prototype.

## 4.1 Preserve the three credential boundaries

Keep these credentials separate:

1. **Submitted phone number:** user identity input for this feasibility prototype. It travels to the BFF over TLS. It is normalized and used transiently for provider dispatch; it must not be logged.
2. **OTP challenge token (`auth_session_token`):** short-lived, opaque, single-use challenge credential. Store only its keyed hash in the existing `auth_otp_challenge` row. Never send it in an `Authorization` header. Never treat it as the DRF API token.
3. **DRF API token:** existing authenticated API credential returned only after successful OTP verification. Keep the existing `Authorization: Token <token>` contract and persist it in native secure storage on mobile.

### CIT exclusion

CIT is outside the v0 feasibility prototype. Do not implement JWE, HPKE, a client public-key envelope, envelope nonces, phone detokenization, a CIT DTO or a CIT crypto dependency. Do not make CIT a blocker for the prototype.

The prototype request uses the submitted phone number over TLS. Keep the existing `identity_token` stub non-operational or explicitly reject it with the existing stable unsupported/invalid-identity response. The UI and mobile endpoint wrapper must not send `identity_token`.

Do not describe the phone-over-TLS prototype as protecting the phone number from TLS-terminating proxies. That protection belongs to the deferred CIT product redesign.

## 4.2 OTP delivery architecture

### Existing boundary to preserve

`backend/services/auth_service.py` already has an `OtpDeliveryAdapter` base/interface and `ConsoleOtpDeliveryAdapter`. Preserve that boundary; do not place vendor-specific HTTP calls inside BFF views or the OTP domain service.

The target flow is:

```text
Mobile enters phone
        |
        v
POST /api/v1/auth/tokenized/request-otp/ (TLS)
        |
        v
Normalize phone + account policy + abuse/rate checks
        |
        v
Generate 6-digit OTP and keyed OTP hash
        |
        v
Persist OTP + linked challenge in PostgreSQL
        |  (existing SQL functions/triggers only; no DB changes)
        v
Commit OTP/challenge transaction
        |
        v
OtpDeliveryAdapter.send(destination_phone, OTP, request context)
        |
        v
Configured external network/SMS provider
        |
        v
User receives OTP on the submitted mobile number
        |
        v
POST /api/v1/auth/tokenized/verify-otp/ {auth_session_token, code}
        |
        v
Existing PostgreSQL verify_otp_challenge() + existing DRF Token issuance
```

### Adapter requirements

Define a stable adapter contract with a structured result. The result should represent at least:

- provider identifier;
- delivery channel (`sms` for an SMS/telecom network provider);
- whether the provider is configured;
- provider request acceptance state;
- final handset delivery state, only when the provider supplies a real delivery receipt;
- provider message/correlation ID, when available;
- provider error category safe for application handling;
- retryability classification (`safe_retry`, `not_safe_to_retry`, `unknown_outcome`).

Do not return or log raw OTP or raw phone in the result.

### Prototype delivery mode

For the feasibility prototype:

1. Use a configured network/SMS provider adapter to send the generated OTP directly to the normalized submitted mobile number.
2. Dispatch synchronously/directly as part of the request flow; do not introduce Celery, Redis, Kafka, a durable outbox, a worker fleet, provider failover or circuit-breaker infrastructure in this prototype.
3. Put all provider details behind the adapter. The service must not know provider-specific URL paths, request JSON, auth-header formats or response schemas.
4. Provider credentials and sender configuration must come from environment variables or the deployment secret store, never source control, mobile source, logs or database rows.
5. Use a strict network timeout. Do not let a network provider hang the BFF request indefinitely.
6. Do not fake a successful send. If no provider is configured, return an explicit `provider_not_configured` state and do not advance the real HTTP login UI as though the OTP was sent.
7. Unit tests must inject a fake/in-memory adapter that captures the destination and OTP only inside the test process. The fake is not a production provider and must never be selected silently in production.
8. A provider API acknowledgement usually means accepted/queued by the provider, not proven delivered to the handset. Only set a final `delivered` flag when the provider supplies a genuine delivery receipt. UI wording must distinguish “accepted by provider” from “delivered”.

No specific provider vendor has been selected in the source brief. Therefore the coding agent must not invent Twilio, AWS SNS, Firebase, SMPP, or another provider's API payload. Implement the adapter contract and a configurable provider transport boundary. A concrete provider mapping must use the chosen provider's actual documentation/configuration supplied to the project; record the provider name and version in the environment/runbook.

### Suggested configuration contract

Use names consistent with the existing settings style. The exact prefix can match project conventions, but the meaning must be explicit:

```text
OTP_DELIVERY_PROVIDER=<provider-id>
OTP_DELIVERY_ENABLED=true|false
OTP_PROVIDER_BASE_URL=<provider-specific base URL, if applicable>
OTP_PROVIDER_API_KEY=<secret; never log>
OTP_PROVIDER_API_SECRET=<secret; only if required>
OTP_PROVIDER_SENDER_ID=<approved sender ID>
OTP_PROVIDER_TIMEOUT_SECONDS=<bounded integer>
OTP_PROVIDER_DELIVERY_RECEIPTS_ENABLED=true|false
```

Do not put credentials in `settings/base.py` as literal fallbacks. Development and tests must not accidentally use production credentials. Production-like HTTP tests must either use a provider sandbox with approved test destinations or the injected fake adapter; never send real OTPs to test fixture phone numbers by accident.

### Transaction ordering

Do not dispatch a network message before the OTP and challenge are durably committed. Otherwise a provider can deliver a code for a challenge whose database transaction later rolls back.

Because the project uses `ATOMIC_REQUESTS=True`, verify the actual transaction boundary. The implementation must guarantee this sequence:

1. Open a narrow transaction for OTP/challenge persistence.
2. Persist using existing database functions.
3. Commit that transaction successfully.
4. Only then call the network adapter.

If necessary, make only the tokenized OTP request view non-atomic at the request wrapper and call a small explicit `transaction.atomic()` persistence operation before the adapter call. Do not alter database schema or turn off atomic behavior globally. Add a test that proves the provider adapter is not invoked when persistence fails and is not invoked before the transaction commit.

### Failure and idempotency behavior

- Provider not configured: return a truthful non-delivery state; do not expose `dev_code` as a substitute in normal prototype mobile operation.
- Provider explicitly rejects the request: return a stable delivery failure response; do not report success.
- Provider timeout/connection loss: outcome may be unknown. Do not blindly send through another provider or auto-retry the POST, because the first provider may already have accepted the message.
- Retry with the same `request_id`: return the same still-active challenge token and truthful “existing request / no redispatch” state. Do not create another challenge with the same unique challenge hash. The service stores only the OTP hash, so it cannot safely reconstruct and resend the original raw OTP.
- User-requested resend: create a new request identifier/challenge under the existing rate limit and explicitly supersede/expire behavior supported by the current SQL contract. Do not alter SQL. If the current database cannot express the intended state safely, report the limitation rather than invent a DDL change.
- No automatic mobile POST retry after timeout. Show an uncertain outcome and let the user explicitly request another code.

### OTP security rules

- Exactly six digits in backend generation, response `code_length`, screen input, DTO and tests.
- Preserve the existing challenge maximum TTL of 180 seconds and ensure it never exceeds parent OTP expiry.
- Preserve the existing parent OTP TTL configuration (`app_settings.otp_ttl_minutes`, documented default five minutes), maximum attempts and per-phone request rate settings; verify actual live values rather than hard-coding new ones.
- Preserve exact OTP-row binding via existing `otp_id` foreign key.
- Preserve challenge-first then OTP row-lock order in the existing verifier.
- Preserve attempt counting on the exact linked OTP row.
- Preserve atomic single-use consumption.
- Keep `PHONE_HASH_HMAC_SECRET`, `OTP_CODE_HMAC_SECRET`, `AUTH_SESSION_TOKEN_SECRET` and `PHONE_ENCRYPTION_KEY` separate as intended.
- Never log raw phone, OTP, code hash, challenge token, challenge hash, DRF token, Authorization header, provider API key or provider response body if it may contain PII/OTP.
- Do not return `dev_code` when an external provider is configured or in any production/prod setting. If a local-only fake mode retains `dev_code`, gate it explicitly behind `DEBUG`, local/test environment and a dedicated feature flag; production settings must override it to false even if DEBUG is misconfigured.

## 4.3 Authentication defects to fix

### B1. Purpose propagation mismatch

Current request serializer accepts `login` and `qr_registration`, but the verify serializer/view/service call currently defaults to `login` and does not propagate the requested purpose.

For the feasibility prototype, choose one explicit policy:

- If QR registration challenge verification is not part of the v0.12.0 feasibility workflow, restrict tokenized request purpose to `login` in the active prototype endpoint and document QR registration as dormant; OR
- If the existing prototype requires QR registration purpose, propagate the exact purpose through the complete DTO → serializer → BFF → service → existing SQL verifier contract.

Do not accept a purpose at request time and silently verify as `login`. Whichever route is chosen must have an API test for mismatch behavior. Do not modify the SQL allowed-purpose constraint.

### B2. Request-ID idempotency after expiry/consumption

Current idempotent request handling derives a deterministic challenge token from `request_id` and phone hash, checks for an active challenge, and then attempts a new insert if none is active. The original challenge row remains in the table and its hash is unique, so a retry after consumption/expiry can collide with the unique constraint.

Fix at the service/API layer without schema changes:

- Define the lifetime/meaning of one `request_id`.
- If that request ID has a historical challenge, do not attempt to insert another challenge with the same deterministic token hash.
- Return a stable conflict/used-request result or require a new request ID for a resend.
- Make same request ID + same purpose + same phone deterministic.
- Reject same request ID with a different phone/purpose rather than aliasing identities.
- Test active retry, after successful consumption, after expiry, different purpose, different phone, simultaneous retries and the provider-timeout case.
- Ensure development-only response behavior never returns a code different from the code represented by the database hash.

Do not weaken the unique challenge-hash constraint or delete old challenge rows to make a retry work.

### B3. Account row created before OTP verification

The current service creates a new `Users` row during OTP request before the user proves possession of the phone. This can create unverified account rows when clients repeatedly request OTPs for many numbers.

Stabilize this without schema changes:

- First establish whether pre-verification account creation is required by existing triggers or service behavior.
- Preserve existing-account closed/blocked policy checks.
- Add a specific DRF/IP-scoped throttle for the tokenized OTP endpoint in addition to the existing database per-phone limit.
- Avoid creating a user row for every rejected/invalid request where the existing schema/service contract permits it.
- Do not invent a new identity table, OTP plaintext column, challenge table or cache schema.
- If safely deferring user creation requires persisting new identity material that the frozen schema cannot represent, document the constraint and keep the existing flow for this feasibility version with bounded abuse throttles. Do not force a redesign.

### B4. Delivery-result truthfulness

Tests must distinguish:

- provider not configured;
- provider request rejected;
- provider accepted/queued;
- provider delivery receipt confirmed;
- provider timeout with unknown outcome;
- existing idempotent challenge returned without redispatch.

The mobile screen must not say “SMS delivered” when the provider only accepted the API request. Do not show a development code banner for a real network provider flow.

### B5. Verify error mapping and no-phone contract

Retain the canonical verify body:

```json
{
  "auth_session_token": "<opaque challenge token>",
  "code": "123456",
  "display_name": "Optional name"
}
```

The verify serializer must not require or transmit `phone`. It must preserve stable machine-readable errors for `invalid_challenge`, `invalid_code`, `challenge_expired`, `challenge_consumed`, rate limit, blocked account and closed account. Keep the existing DRF Token response shape.

### B6. Keep `/me/bootstrap/` as a compact identity boundary

Preserve `GET /api/v1/me/bootstrap/` as the small authenticated startup endpoint. It must return actual server values, including `email: null` when there is no email. Do not substitute phone as email, and do not turn bootstrap into a full-profile endpoint.

## 4.4 Mobile authentication tasks

Preserve the current React context and API-client structure.

- `authApi.requestTokenizedOtp()` sends phone + purpose + request ID only; no CIT.
- `authApi.verifyTokenizedOtp()` sends challenge token + code + optional display name only.
- `UserContext` keeps the challenge token ephemeral in memory.
- `UserContext` writes the DRF token to `SessionManager` only after successful verification.
- `tokenStore.ts` keeps the native Keychain/Keystore adapter as the default production store and memory as explicit test injection only.
- Expiry, change-phone, resend and navigation exit clear challenge state.
- On HTTP 401 only, clear session. Do not clear the bearer token on 403/404/409/429/5xx/network timeout.
- Do not blindly retry OTP request/verify POSTs.
- Keep the legacy endpoint methods/routes until compatibility retirement is explicitly approved.

If native secure storage is not available on the target build, fail closed in production HTTP mode. Do not silently fall back to AsyncStorage or memory.

## 4.5 Phase B acceptance tests

**Service/provider tests:**

- Six-digit OTP generated and response code length is six.
- `OtpDeliveryAdapter` receives the normalized destination phone and the same code whose HMAC hash was persisted.
- Adapter call occurs only after the challenge persistence transaction commits.
- Adapter not called when database persistence fails.
- Provider not configured response is truthful.
- Provider rejection, accepted, confirmed receipt and unknown timeout map to distinct safe states.
- Raw phone, OTP and provider secrets absent from logs.
- `dev_code` impossible in production even when DEBUG is true.
- Active request-ID retry does not create a second OTP/challenge or duplicate message.
- Consumed/expired request-ID retry does not cause unique-hash exception or accidental code mismatch.
- Concurrent request-ID retries have deterministic behavior.
- Purpose mismatch is handled as specified.
- Blocked/closed account behavior remains intact.
- Wrong OTP increments the exact linked OTP attempt count.
- Challenge replay and parallel verify have exactly one successful verification.

**API tests:**

- Request route is public and validates phone/purpose/request ID.
- Verify route is public and does not accept a phone field as a required input.
- Verify payload contains only the challenge token and OTP data, not the phone.
- Stable error envelope and status codes.
- Provider status response is truthful.
- `/me/bootstrap/` works after verification with DRF Token.
- Legacy routes remain present and emit their deprecation signal.

**Mobile tests:**

- Challenge token never enters Authorization header.
- DRF Token is stored only after verify success.
- Challenge state is cleared on success/expiry/change-phone/navigation exit.
- A provider-not-configured/failed state does not pretend the code was delivered.
- Unknown network timeout does not automatically retry the POST.
- Session clear occurs only on 401.

## 4.6 Phase B acceptance criteria

- [ ] No CIT code or crypto package added.
- [ ] Configured adapter sends to the user-entered/normalized mobile destination through the selected external provider.
- [ ] Provider response is interpreted honestly.
- [ ] Challenge and OTP persistence commits before direct network dispatch.
- [ ] No DB schema, SQL function or trigger change.
- [ ] Purpose behavior is consistent from request through verify.
- [ ] Request-ID retries cannot collide or fabricate a different OTP.
- [ ] Mobile verify sends no phone.
- [ ] Secure DRF token lifecycle remains intact.
- [ ] Backend/PostgreSQL, BFF, OpenAPI and mobile tests pass.

**HARD STOP:** Do not begin Phase C until Phase B passes the review gate. Provider credentials and real delivery must be verified in a sandbox/test destination before enabling the provider for the prototype demo.

---

# 5. PHASE C — SERVER-SIDE ENCRYPTED VERIFICATION IMAGE FILES

**Dependency:** Phase A PASS. Phase B may proceed in parallel only if the phase owner and test DB are isolated; Phase C must not modify database objects.  
**Primary objective:** Keep verification images as server files but encrypt the content at rest. Use the existing database metadata only.

## 5.1 Current implementation and required correction

Current relevant paths:

- `backend/services/verification_service.py`
- `backend/common/utils.py` (`sanitize_and_save_verification_jpeg`)
- `backend/config/settings/base.py` (`VERIFICATION_MEDIA_ROOT`)
- `backend/apps/accounts/models.py` (`UserVerificationImages`)
- `backend/bff/volunteer/serializers.py`
- `backend/admin_portal/views.py` (`AdminVerificationImageFileView`)

Current behavior:

1. Validate file type, size and dimensions.
2. Strip EXIF by converting/re-encoding to RGB JPEG.
3. Compute SHA-256 of sanitized JPEG bytes.
4. Write the JPEG bytes as plaintext below `VERIFICATION_MEDIA_ROOT`.
5. Save its relative path and metadata in `user_verification_images`.
6. Admin image endpoint opens and streams the file directly.

Required behavior:

1. Keep the current upload validation and sanitization.
2. Encrypt the sanitized JPEG bytes before writing to disk.
3. Store only ciphertext bytes in the private server storage directory.
4. Keep PostgreSQL storing metadata and a path only; never a `bytea`, base64 payload or blob.
5. Decrypt only after authenticated admin authorization in the file-stream endpoint.
6. Do not expose `image_path`, storage location, encryption key ID or file contents in volunteer metadata responses.

## 5.2 Database contract — reuse fields, do not add fields

The existing image model already contains:

- `image_path`
- `file_format`
- `file_sha256`
- `image_type`
- `status`
- `comparison_status`
- `comparison_score`
- `is_current`
- reviewer IDs/timestamps/notes

Keep all field definitions and constraints unchanged.

Recommended semantics:

- `image_path`: same relative opaque path under `VERIFICATION_MEDIA_ROOT`; preserve existing path value where possible so no DB row update is required for in-place encryption.
- `file_format`: continues describing the decrypted/sanitized source image format (`jpeg`), not the encrypted envelope's file suffix.
- `file_sha256`: continue representing SHA-256 of the decrypted/sanitized JPEG bytes so existing metadata meaning is preserved. Verify the hash after decryption and before streaming.
- Database status/review fields remain controlled by existing PostgreSQL triggers.

Do not add `encryption_key_id`, `is_encrypted`, `ciphertext`, `nonce`, `iv`, `tag`, `storage_backend` or any other columns. The encrypted file envelope carries its own version/key metadata.

## 5.3 Encryption design requirements

Use a standard authenticated-encryption implementation already supported by the backend dependency stack, preferably `cryptography.hazmat.primitives.ciphers.aead.AESGCM` with a 256-bit key.

Requirements:

- AES-256-GCM or another explicitly approved authenticated-encryption construction.
- Cryptographically random unique nonce per file encryption (AES-GCM 96-bit nonce recommended).
- Authentication tag checked during decryption; any tamper or wrong key causes a controlled failure and must not stream bytes.
- A versioned encrypted-file envelope so later key rotation/format evolution does not require a database schema change.
- Envelope includes non-secret format version and key identifier, nonce and ciphertext/tag. Authenticate the version/key-id header as associated data.
- Do not store the encryption key in PostgreSQL, source control, mobile app, file name, image metadata response or the encrypted file itself.
- Use a dedicated `VERIFICATION_IMAGE_ENCRYPTION_KEY`, independent from `PHONE_ENCRYPTION_KEY`, HMAC keys, Django `SECRET_KEY`, QR secrets and OTP secrets.
- Key must be 32 bytes, supplied through the environment or secret manager, with validation on startup when image operations are enabled.
- Support a key identifier/key ring for decryption during rotations. New writes use the active key; old keys remain available for decrypting existing files until conversion is proven complete.
- Never log image bytes, plaintext, nonce, key, ciphertext, raw file path, or plaintext hash.

A suggested file envelope is a binary format with a fixed magic/version prefix, key ID, nonce and AES-GCM ciphertext+tag. Define the exact byte format once in one module and test it thoroughly. Do not invent different envelope parsing logic in the upload and streaming views.

## 5.4 Upload pipeline

The upload service must perform this order:

1. Authenticate volunteer and validate permitted upload route.
2. Validate `image_type` against the existing choices.
3. Check request size before fully buffering content; enforce existing `VERIFICATION_MAX_UPLOAD_BYTES`.
4. Validate actual image content with Pillow; do not trust extension or MIME type alone.
5. Validate minimum/maximum dimensions.
6. Re-encode to sanitized JPEG and strip EXIF/metadata.
7. Compute plaintext JPEG SHA-256.
8. Encrypt the sanitized JPEG bytes in memory using the active image encryption key.
9. Write ciphertext to a private temporary file in the same target directory.
10. Flush/fsync as appropriate, then atomically replace the target file. Ensure no plaintext JPEG temporary file is written to disk.
11. Create the existing `UserVerificationImages` row with the relative path, `file_format='jpeg'`, plaintext JPEG hash and current status semantics. Let existing database triggers handle state/review behavior.
12. On database failure after file write, remove the newly-created orphan ciphertext file using a controlled cleanup path; do not delete an existing file referenced by an existing row.
13. Return only current metadata fields; never return image_path or ciphertext.

Use random opaque filenames or the existing random suffix approach. The user UUID may be used as a directory namespace only if the path is not exposed in API responses or logs.

## 5.5 Admin streaming pipeline

`AdminVerificationImageFileView` must:

1. Require authenticated administrator access using the existing authorization helper.
2. Resolve the DB row by ID; keep masked 404 behavior for unauthorized/missing records.
3. Log an audit event containing only safe IDs/action metadata; no path, image bytes or content hash.
4. Resolve the file path beneath `VERIFICATION_MEDIA_ROOT` with the existing path-traversal protection.
5. Read the encrypted envelope and select the key by the envelope key ID.
6. Authenticate/decrypt in memory; reject tampered or unsupported formats.
7. Verify decrypted plaintext SHA-256 matches `file_sha256` when the field exists.
8. Return decrypted JPEG bytes with `Content-Type: image/jpeg`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and a restrictive content disposition appropriate to the admin viewer.
9. Never write decrypted output to a public/static directory or persistent temporary path.
10. Fail closed if the key is missing, invalid, unknown or the ciphertext authentication fails. Do not return ciphertext with an image MIME type.

Volunteer image listing remains metadata-only. A volunteer must not be able to call the admin image file endpoint, infer a raw path or retrieve another user's file.

## 5.6 Existing plaintext image conversion

The database snapshot lists existing `user_verification_images` rows. Do not assume all current files are empty or disposable.

Perform the conversion as a separate, controlled file-system operation:

1. Take and verify a protected backup of the private image directory. The backup must have restricted access and be stored encrypted or on a protected volume.
2. Run a read-only dry run that counts files, references, sizes, encryption signatures, orphan files and missing files. Do not print paths or user identifiers.
3. Confirm a valid encryption key and successful encrypt/decrypt self-test.
4. Convert one test image from a disposable test user first.
5. Validate it by decrypting in memory and matching the pre-conversion plaintext hash.
6. Convert existing files in place using a temporary ciphertext file + atomic replacement. Preserve each DB `image_path` value so the database is not modified.
7. For already-encrypted files, verify the envelope and do not encrypt a second time.
8. For missing/corrupt files, report the count and stop those records; do not delete their DB rows.
9. After full conversion, run a read-only verification that every DB-referenced file exists, is encrypted, decrypts using the configured key ring, and matches its stored plaintext hash.
10. Keep the protected backup until the release owner signs off. Remove any plaintext backup only through the approved secure-erasure process; do not leave plaintext duplicate files in `MEDIA_ROOT`, static assets, temporary folders, CI artifacts or logs.

If existing image files cannot be encrypted safely without changing image rows, stop and report why. Do not alter database fields to work around the issue.

## 5.7 Key management and operations

- Add documented environment variables for the active encryption key and key identifier.
- Add production startup validation when verification image features are enabled.
- Use a different key for image-file encryption than phone encryption.
- Keep secrets out of `.env.example` actual values; show placeholders only.
- Ensure server process and backup operators can read the key; unrelated app users cannot.
- Back up the key separately from encrypted files, with access controls and recovery test.
- Key rotation: add new key to key ring, switch active key ID, re-encrypt files atomically, verify, then retire an old key only after no files require it and backups are accounted for.
- Do not rotate by deleting the current key before all files decrypt under the replacement.

## 5.8 Phase C acceptance tests

**Crypto unit tests:**

- Encrypt/decrypt round trip returns byte-identical sanitized JPEG.
- Ciphertext does not contain the plaintext JPEG or recognizable JPEG header.
- Every encryption uses a unique nonce.
- Wrong key fails.
- Modified ciphertext/tag/header fails authentication.
- Unsupported envelope version fails closed.
- Unknown key ID fails closed.
- Plaintext SHA-256 validation detects altered output.
- Key separation rejects using phone/HMAC/Django secrets as the image key.

**Upload tests:**

- Valid image sanitized, encrypted and stored outside public media.
- Actual disk file contains encrypted envelope rather than plaintext JPEG.
- DB row contains only existing path/metadata and no image bytes.
- Invalid format, MIME spoof, empty file, too large, too small, too large dimensions and EXIF-bearing image behave correctly.
- Existing DB trigger still controls status/current-image transitions.
- Database insert failure cleans up only the newly-created unreferenced ciphertext file.

**Admin/read tests:**

- Active admin receives decrypted JPEG bytes, not ciphertext.
- Non-admin and unauthenticated callers cannot access files.
- Another user's metadata does not reveal path.
- Missing key, corrupted file, missing file and path traversal all fail closed.
- Response is private/no-store and not publicly cacheable.

**Migration tests:**

- Dry-run has no writes.
- Legacy plaintext test file encrypts in place with same relative path.
- Existing SHA-256 matches after decrypt.
- Re-running conversion is idempotent and does not double-encrypt.
- Missing/corrupt file is reported without deleting the row.
- No database schema or row changes occur during conversion.

## 5.9 Phase C acceptance criteria

- [ ] New uploads are encrypted before any file reaches disk.
- [ ] Private storage is outside public/static paths.
- [ ] Existing DB columns and rows remain structurally unchanged.
- [ ] Admin streaming decrypts only after authorization.
- [ ] Hash integrity is verified after decryption.
- [ ] No plaintext image files or plaintext temporary artifacts remain in the active storage path.
- [ ] Conversion is backed up, repeatable and idempotent.
- [ ] Key setup, rotation and backup recovery are documented.
- [ ] All crypto/upload/authorization/stream tests pass.

**HARD STOP:** Do not enable image upload/review on the prototype while files remain plaintext or the admin stream returns encrypted bytes as if they were JPEGs.

---

# 6. PHASE D — BUSINESS CONTRACT, SERVICE AND MOBILE CONSISTENCY

**Dependency:** Phase A PASS. Phase D should follow Phase B and Phase C for integrated authentication/image testing.  
**Primary objective:** Correct the remaining known behavior and data-contract defects without changing the database schema or reworking the architecture.

## 6.1 General contract rule

Keep the current source-of-truth allocation:

- PostgreSQL owns persisted business state and legal transitions.
- Service layer owns orchestration and domain error translation.
- BFF serializers own wire validation/allow-lists.
- OpenAPI describes the BFF contract.
- DTOs describe transport.
- Mappers translate DTOs to domain models.
- Repositories own HTTP/cache behavior.
- Use cases own application operations.
- Screens own presentation and ephemeral form state.

Never fabricate a server-owned identifier, state, timestamp, location, capacity, permission or metric in the mobile layer.

## 6.2 Attendance / coordinator manual check-in

Preserve the existing canonical BFF route:

`POST /api/v1/checkin/attendance/manual-checkin/`

Keep older aliases temporarily for backward compatibility. The mobile HTTP repository must use the canonical `checkin/` endpoint wrapper.

Request contract:

```json
{
  "event_id": 142,
  "user_id": 28,
  "note": "Identity checked at the registration desk"
}
```

The server response must remain authoritative and contain the actual persisted values:

- `attendance_id`
- `event_id`
- `user_id`
- `status`
- `method`
- `checkin_at`
- `recorded_by_user_id`
- `already_checked_in`

Required backend behavior:

1. Authenticated caller only.
2. Event manager with write permission only; owner-as-monitor remains read-only.
3. Attendance record must exist for the event/user pair.
4. Existing row lock and SQL attendance trigger remain authoritative.
5. Active event, legal assignment state and onboarding acknowledgement remain enforced by existing database logic.
6. Cancelled rows return a stable 409 conflict.
7. Repeat check-in is idempotent and returns the original method/time.
8. Existing QR or geo method is never relabelled as manual.
9. Actor ID and note remain auditable.
10. No GPS requirement or map behavior is added.

Required mobile behavior:

- Remove the roster-cache prerequisite for the explicit `(eventId, volunteerUserId)` repository signature.
- Use the actual response DTO or perform a deterministic roster refetch.
- Remove synthetic fallback records with placeholder volunteer names/IDs.
- Do not set timestamps using `new Date()`.
- Do not clear geo pending state unless the server explicitly proves the state changed.
- Do not show success before the API response.
- Display 403/404/409 and validation failures while preserving the prior row state.

## 6.3 Manual assignment route/event validation

Current BFF route includes `event_id`, but the service loads the application and derives the event from the application itself. Add an application-level consistency check that the route event ID matches the application's event before invoking the existing SQL assignment function.

- Do not modify `assign_manually()` or any trigger.
- Wrong event/application pairing must fail with a stable 400/404 policy, not assign in the application's real event under a different URL.
- Add tests for matching event, mismatched event, missing application, unauthorized manager and invalid application state.

## 6.4 Remove mobile fabricated fallbacks

Search all HTTP repositories and use cases for fabricated fallback data, hard-coded values and locally invented server metadata.

At minimum repair these observed areas:

### Coordinator application status

`HttpCoordinatorRepository.updateApplicationStatus()` currently fabricates an application object if cache lookup and refetch cannot produce the updated record (including placeholder applicant details and a local timestamp).

Replace this behavior with one of:

- A minimal typed mutation result using only IDs/status actually returned by the server; or
- A deterministic refetch of the existing application from its known event.

If neither can provide a real record, return an explicit synchronization failure. Never return a fabricated full domain object.

### Manual attendance result

`HttpCoordinatorRepository.manualCheckIn()` currently fabricates an attendance item when it cannot find the server row in cache after successful mutation.

Use the authoritative mutation fields plus a refetch. If the full row remains unavailable, return a minimal result or explicit synchronization failure; do not invent event title, volunteer name, post title, assignment ID or user metadata.

### Assignment result

Preserve the existing direction in which assignment creation refetches server assignments and fails explicitly if it cannot synchronize. Remove any remaining placeholder/first-managed-event fallbacks in HTTP mode.

### Feedback metrics

Search for hard-coded sample metrics such as average rating, rating count or feedback totals. An unavailable metric must be represented as unavailable/empty or returned from the real service, not as a plausible-looking fabricated rating.

## 6.5 Coordinator attendance metric semantics

The mobile property `checkedInTodayCount` is currently assembled from event `checked_in_count`, while SQL `v_event_summary.checked_in_count` counts all `checked_in` or `completed` attendance rows without restricting the date.

Since the database is frozen:

- Do not alter `v_event_summary` or add a view/column.
- Either rename the application-layer label/property to describe the existing all-time event count, or compute a clearly scoped daily metric in an existing service query using the current tables and existing fields.
- Do not call an all-time total “today”.
- Test against fixture rows on different dates, in a disposable test DB.
- Do not fabricate a daily metric from a client local clock or cached data.

If the product needs a database-owned daily aggregate but the frozen database does not provide it, report it as a deferred metric rather than changing SQL.

## 6.6 Event detail missing values and geo flags

The current HTTP event detail mapping can coerce missing coordinates to zero and can default missing `geo_checkin_enabled` to true.

Correct the mapper without changing schema:

- Missing latitude/longitude remain null/undefined in the domain model when the contract permits.
- Do not substitute `(0,0)` for unknown coordinates.
- Missing `geo_checkin_enabled` must not be converted to `true` by assumption. Use a conservative disabled/unknown representation that matches the existing domain type.
- Mobile GPS/map workflows remain dormant in this prototype.
- Never label placeholder/default coordinates as an actual event location.

## 6.7 Donation preference consistency

The backend profile service already contains aggregate handling for the master donation flag and its blood/items sub-flags. Preserve the server-side consistency behavior.

Verify all partial PATCH permutations:

- Master true with no sub-flags.
- Master false with existing sub-flags true.
- Master false plus one sub-flag true (reject or resolve according to existing documented rule; keep it consistent).
- Blood true without master field.
- Items true without master field.
- Blood false while items remains true.
- Both sub-flags false.
- No donation keys supplied.

The mobile mapper must not override the server's aggregate semantics using stale local state. Use the current profile only where the repository contract explicitly supplies it; otherwise prefer server-owned merge rules. Do not modify DB checks.

## 6.8 Invite round-trip

Preserve existing invite application semantics:

1. Coordinator creates invite.
2. Volunteer sees the invite in their own application list.
3. Volunteer accepts/rejects the existing invite application by its ID.
4. Coordinator sees the same application ID with its final status.

Do not create a second browse application when the volunteer accepts/rejects. Preserve transaction and actor attribution behavior already present in `application_service.py`. Add tests over the existing service/BFF routes and actual HTTP repository path.

## 6.9 DTO/domain boundary and endpoint parity

Audit the existing HTTP repositories/use cases for raw transport DTO leakage. Complete mapping for the existing capability surfaces that are currently exposed, including:

- Event post capacity.
- Coordinator history.
- Volunteer UUID lookup.
- Geo-attempt review metadata (backend stays dormant from mobile UI).
- Charity taxonomy.
- Feedback summary and feedback items.
- Attendance roster and manual mutation response.

Do not invent missing DTO fields. If a value does not exist in the BFF schema, preserve an explicit absent state or report the contract gap.

Create/refresh a route matrix:

| Capability | Canonical BFF route | Mobile wrapper | DTO | Domain mapping | Test |
|---|---|---|---|---|---|
| Tokenized OTP request | `/api/v1/auth/tokenized/request-otp/` | `authApi` | auth DTO | request result | API + real HTTP |
| Tokenized OTP verify | `/api/v1/auth/tokenized/verify-otp/` | `authApi` | auth DTO | session result | API + real HTTP |
| Bootstrap | `/api/v1/me/bootstrap/` | `authApi` | bootstrap DTO | user snapshot | API + real HTTP |
| Manual check-in | `/api/v1/checkin/attendance/manual-checkin/` | `checkinApi` | check-in DTO | attendance mutation | PostgreSQL + real HTTP |
| Verification image upload | `/api/v1/me/verification-images/` | profile endpoint | upload DTO | image metadata | API + encrypted file test |
| Admin image stream | `/api/v1/admin/verification-images/{id}/file/` | admin portal | binary | browser/admin stream | auth + crypto test |

The coding agent must fill the complete matrix for existing routes, not only the examples above.

## 6.10 Phase D acceptance tests

- Manual check-in direct repository call works without preloaded roster cache.
- Existing QR/geo method and timestamp are preserved on repeat.
- Cancelled row and unauthorized/monitor actors are rejected.
- Event ID mismatch on manual assignment is rejected.
- No fabricated application/attendance/assignment/feedback object exists in HTTP repositories.
- `checkedInTodayCount` is either truly daily or renamed to its real all-time meaning.
- Missing coordinates remain absent; geo capability is not accidentally enabled.
- Donation transitions pass the full test matrix.
- Invite create → volunteer respond → coordinator read returns the same application ID.
- DTO/domain mappers handle null, missing, unknown and error values explicitly.
- Mock and HTTP repository contracts remain aligned, but mock tests do not count as live integration proof.

## 6.11 Phase D acceptance criteria

- [ ] No database schema or stored object change.
- [ ] Backend remains authoritative for attendance and assignment.
- [ ] Manual check-in has no roster-cache prerequisite.
- [ ] All fabricated HTTP-domain fallbacks removed.
- [ ] Metrics labels match their actual time range.
- [ ] Missing coordinates and missing geo state are represented truthfully.
- [ ] Donation and invite behavior are tested.
- [ ] Canonical routes match OpenAPI and mobile endpoint wrappers.

**HARD STOP:** Do not begin Phase E sign-off if any application still returns fabricated server state or if an endpoint contract differs between BFF/OpenAPI/DTO/repository.

---

# 7. PHASE E — FULL VERIFICATION, DEVICE QA AND STABILIZATION SIGN-OFF

**Dependencies:** Phases A–D complete.  
**Primary objective:** Prove the frozen database, backend, external OTP delivery boundary, encrypted image storage, mobile client and manual attendance flow work together on the exact candidate commit.

## 7.1 Verification environments

Use two separate environment classes:

### Existing prototype database

- Read-only preflight and approved normal application use only.
- No schema changes, migrations, data resets, fixture seeding or destructive tests.
- It may be used for a manually approved, non-destructive demonstration with existing data.

### Disposable PostgreSQL test database

- PostgreSQL 18.x.
- Initialized from the frozen SQL baseline and the existing v0.12.0 upgrade file as needed.
- Contains synthetic/anonymized fixture data only.
- Created and destroyed by CI/test automation, never shared with the prototype database.
- Used for all tests that insert/update/delete records, test triggers, concurrency or seed integration fixtures.

The `DB_NAME` for the test environment must be visibly different from `volunteer_coordination_db`, and test scripts must refuse to run if it matches the protected prototype database name.

## 7.2 Required backend verification

Run in a clean Python environment connected only to the disposable PostgreSQL database:

1. Django system check.
2. PostgreSQL schema-object preflight.
3. Auth challenge invariant tests.
4. Auth service tests.
5. Tokenized BFF endpoint tests.
6. Manual check-in service and BFF tests.
7. Profile, donation, invite, assignment and privacy tests.
8. Verification image encryption/upload/stream tests.
9. Full backend test suite.
10. OpenAPI generation and validation.

Important: do not run the full suite against the existing prototype database merely because the suite currently defaults to it. Fix test configuration to use the disposable database.

## 7.3 Required mobile verification

Run from `mobile/`:

```bash
npm ci
npx tsc --noEmit
npm test -- --runInBand
```

Also run dedicated test targets for:

- `ApiClient` request/timeout/abort/redaction behavior.
- Keychain/Keystore token store set/get/clear and failure behavior.
- `SessionManager` clears only on 401.
- Tokenized auth request/verify DTOs and no-phone verify body.
- OTP provider status presentation and retry behavior.
- `UserContext` challenge clearing and token persistence.
- Coordinator manual check-in with no warm cache.
- Attendance method/timestamp/state mapping.
- Profile phone/email and donation mappings.
- Application invite round-trip.
- Missing/null event geo fields.
- No fabricated repository fallbacks.

## 7.4 Real HTTP integration gate

The existing suite `mobile/src/data/__tests__/v0_12_0_realHttpIntegration.test.ts` is a useful foundation. It must run against the exact candidate SHA and a disposable PostgreSQL 18 database.

Required real HTTP scenarios:

### Authentication

1. Mobile ApiClient sends OTP request over actual HTTP to Django.
2. Configured provider sandbox/fake integration captures the requested destination and confirms provider invocation. A unit test may use fake; a real sandbox test must use an approved test destination.
3. API response distinguishes provider accepted from handset delivered.
4. Mobile stores challenge token in ephemeral state only.
5. Verify request includes challenge token + six-digit OTP and no phone.
6. Backend returns existing DRF Token only on success.
7. Mobile persists DRF Token using secure storage.
8. Authenticated `/api/v1/me/bootstrap/` succeeds.
9. Invalid code, invalid token, expired token, consumed token and rate-limit errors map correctly.
10. Replayed verify and parallel verify produce exactly one successful verification.
11. Same request ID retries are deterministic and do not duplicate OTP dispatch or trigger unique-hash crashes.
12. Provider timeout does not lead to automatic duplicate dispatch.
13. Production configuration never returns `dev_code`.

### Manual check-in

1. Coordinator authenticates with DRF Token.
2. Coordinator fetches event roster.
3. Manual check-in uses explicit event ID + volunteer user ID.
4. Backend returns actual attendance ID, event ID, user ID, status, method, server timestamp, recorder and idempotency indicator.
5. Mobile renders those values without generating local data.
6. Refreshed roster matches persisted database state.
7. Repeat manual check-in preserves original method/time.
8. Owner-as-monitor receives 403.
9. Unrelated coordinator receives masked 404 according to existing policy.
10. Unauthenticated caller receives 401.
11. Cancelled attendance receives a stable conflict.

### Verification images

1. Upload a sanitized JPEG using a real multipart HTTP request.
2. Inspect server storage in test environment and verify ciphertext envelope, not plaintext JPEG.
3. Volunteer metadata response excludes image path and file bytes.
4. Admin endpoint returns decrypted JPEG after authorization.
5. Non-admin cannot retrieve image file.
6. Corrupted ciphertext/wrong key fails closed.
7. Stored hash matches decrypted sanitized file.

### Client session

- 401 clears token and notifies listeners.
- 403/404/409/429/5xx and network timeout do not silently clear the token.
- A timed-out OTP request is not automatically retried.

## 7.5 Android and iOS build/device QA

Source-level dependency checks are not enough. Build both platforms supported by the repository.

For Android:

- Confirm the secure-storage native module links and builds.
- Install on an emulator or device.
- Request OTP, verify OTP, close/reopen app, and confirm DRF token persistence through Android Keystore.
- Log out and confirm stored token cleared.
- Test secure-storage unavailable/failure behavior.
- Test image picker upload path with a valid file and oversized/invalid files.

For iOS:

- Confirm the secure-storage native module builds and Keychain is usable.
- Install on simulator/device.
- Test login, app restart, logout, keychain failure and image upload path.
- Verify privacy-sensitive images do not appear in public app caches or shared folders.

Do not claim device verification if only TypeScript/Jest passed.

## 7.6 Security and privacy checks

- Search backend/mobile logs for raw phone, OTP, challenge token, DRF token, provider API key, image path and decrypted image content.
- Confirm request/response logging redacts sensitive fields recursively.
- Confirm image files are encrypted at rest in the active storage root.
- Confirm keys are not committed or returned by any API.
- Confirm image admin stream requires administrator authorization.
- Confirm verification images are not under public `MEDIA_ROOT` or static asset directories.
- Confirm production settings cannot expose `dev_code`.
- Confirm OTP provider status does not imply final delivery without a provider receipt.
- Confirm no mobile API request sends CIT or a fake `identity_token`.

## 7.7 Performance observations for feasibility

Do not create a service-level agreement or performance guarantee without measurements.

Record:

- request OTP BFF latency, excluding provider call and including provider call;
- provider HTTP response time and outcome;
- verify endpoint latency;
- `/me/bootstrap/` latency and query count;
- manual check-in latency;
- image upload latency and encryption overhead;
- admin image decrypt/stream latency.

Report median, P95 and P99 only when enough representative samples exist. Separate provider API acceptance latency from handset delivery time.

## 7.8 Required final artifacts

Produce a `v0_12_0_stabilization_report.md` containing:

1. Candidate Git SHA and branch.
2. Database preflight artifact reference and PostgreSQL version.
3. Explicit statement that the existing DB schema was not modified.
4. CI run URL and complete stage results.
5. Backend test command/results.
6. OpenAPI validation result and schema diff summary.
7. Mobile TypeScript/Jest result.
8. Real HTTP test result.
9. Android/iOS build and device-test evidence.
10. OTP provider identifier, sandbox/production mode, destination test policy, acceptance vs delivery semantics (never include provider credentials).
11. Image encryption algorithm, envelope version, key ID (not key value), storage inventory counts and integrity result.
12. Remaining known defects, deferred features and operational caveats.
13. Release decision: PASS, CONDITIONAL PASS or NO-GO.

Do not upload fixture tokens, raw phones, OTPs, encryption keys, image bytes, private paths or PII in artifacts.

## 7.9 Phase E exit criteria

- [ ] All previous phase gates are passed.
- [ ] Database preflight is PASS on the protected prototype DB, and tests ran only on the disposable DB.
- [ ] No database schema or stored object was modified.
- [ ] CI is green on the exact candidate SHA.
- [ ] Full backend tests are green against PostgreSQL 18.x.
- [ ] OpenAPI is valid and matches endpoint wrappers/DTOs.
- [ ] Mobile type check and Jest suite are green.
- [ ] Real HTTP OTP + bootstrap scenario passes.
- [ ] Direct OTP provider adapter is exercised in approved sandbox/test mode and delivery state is truthful.
- [ ] Real HTTP manual check-in scenario passes.
- [ ] Image file encryption and admin decrypt/stream scenario passes.
- [ ] Android and iOS build checks pass; device-level storage tests are documented.
- [ ] No fabricated data paths remain in the HTTP repositories.
- [ ] Final report makes no unsupported “100% complete” or “production ready” claim.

**HARD STOP:** Stabilization is complete only after Phase E evidence is reviewed. Otherwise retain NO-GO or CONDITIONAL PASS and list the blockers.

---

# 8. Consolidated defect and work ledger

This ledger combines the findings from the current-main source review with the additional prototype decisions in this master plan.

| Priority | Area | Finding / required action | Phase | Evidence required |
|---|---|---|---|---|
| P0 | Database | Preflight exact DB identity, PostgreSQL version, objects, triggers, constraints and integrity before any work | DB Gate / A | Read-only preflight artifact |
| P0 | PostgreSQL version | Canonical `uuidv7()` requires PostgreSQL 18; align runtime/CI without editing SQL | DB Gate / A | `server_version`, `uuidv7()` resolution |
| P0 | CI | Current `main` removed the earlier v0.12.0 integration workflow; restore a PostgreSQL 18 integration gate | A | Green workflow on current SHA |
| P0 | Database freeze | Prohibit DDL/migrations/schema repair on the current project DB | All | Explicit no-DDL statement and command logs |
| P0 | Image privacy | Current image upload stores plaintext JPEGs; encrypt at rest and decrypt only in admin stream | C | Disk ciphertext + admin stream tests |
| P1 | OTP provider | Current active adapter is console simulation; add external provider adapter and direct prototype dispatch | B | Adapter tests + approved provider sandbox |
| P1 | OTP purpose | Request accepts `qr_registration`, verify defaults to `login`; lock scope or propagate purpose consistently | B | Purpose API/service tests |
| P1 | Request ID | Retry after expiry/consumption can collide with unique deterministic challenge hash | B | Expired/consumed/concurrent request-ID tests |
| P1 | OTP idempotent dev response | Idempotent path can return a fixed dev code not proven to match stored OTP | B | No mismatch path; production suppression |
| P1 | OTP provisioning | New user row is created before OTP possession proof; assess and throttle within frozen schema | B | Abuse/throttle tests and decision record |
| P1 | Delivery semantics | Provider acceptance is not necessarily final delivery; distinguish status and UI copy | B | Provider result mapping tests |
| P1 | Manual assignment | Validate URL event ID matches application event ID | D | Cross-event mismatch test |
| P1 | Mobile fabricated data | Remove fallback placeholder application and attendance objects | D | HTTP repository failure tests |
| P1 | Metrics | `checkedInTodayCount` currently derives from all-time event check-in count; rename or compute true daily value using existing tables | D | Multi-date fixture test |
| P1 | Event geo fields | Do not convert missing coordinates to `(0,0)` or missing geo-enabled field to `true` | D | Null/missing mapping tests |
| P2 | Migration helper | Existing helper can target environment-supplied DB; guard it from non-disposable targets or leave it unused | A | Refusal tests; no DB execution |
| P2 | Fixture seeder | Protect integration DB, redact tokens/phone, avoid artifact exposure | A | Refusal and redaction tests |
| P2 | Migration rollback | Existing rollback section does not restore the replaced `purge_expired_otps()` function; document defect, do not run rollback or modify DB | A / report | Static review report |
| P2 | Invite | Prove invite round-trip uses same application row | D | Backend + real HTTP test |
| P2 | Donation preferences | Prove master/sub-flag partial PATCH matrix | D | Transition matrix |
| P2 | DTO/domain boundary | Complete explicit mapping for currently exposed DTOs | D | Type/domain tests |
| P2 | Secure storage | Prove Android Keystore/iOS Keychain actual builds and fail-closed behavior | E | Build/device QA |

---

# 9. Cross-phase engineering rules for Gemini Flash CLI

These rules are mandatory for every future phase prompt that references this document.

## 9.1 Work on the current branch and preserve user changes

- Re-check `git status` and current HEAD before each phase.
- Do not reset, clean, rebase, force checkout or discard user changes.
- Do not overwrite unrelated files.
- Do not touch `old_doc/`.
- Do not commit or push unless separately requested.
- Do not create a PR unless separately requested.

## 9.2 Inspect before editing

Before editing a file, open the current file at the actual current HEAD. Do not rely only on this document or an earlier CLI summary. Read its imports, callers, tests and neighboring conventions.

Use the exact repository namespaces and paths. Do not create duplicate services or a parallel API architecture.

## 9.3 One phase at a time

- Implement only the phase named in the later prompt.
- Do not pre-implement tasks from future phases.
- Do not “clean up” unrelated code.
- Do not refactor architecture while making a targeted correction.
- Run the phase's acceptance tests and report before proceeding.
- End every phase with an explicit HARD STOP and wait for the next prompt.

## 9.4 Database safety enforcement

Before every command that might connect to PostgreSQL, print the effective database host/port/name and environment label, but never the password.

The agent must refuse to run the command if:

- the target database is `volunteer_coordination_db` and the command can write test/fixture data;
- the command applies DDL, a migration, seed/reset/cleanup SQL or rollback SQL;
- the target is production or cannot be positively identified;
- the test database name is not on an explicit disposable database allow-list.

Do not assume a test runner's `--keepdb` or `manage.py test` is safe. Verify the active settings and test database configuration first.

## 9.5 Do not invent provider specifications

The external OTP provider has not been named in this master plan. The coding agent must create/maintain the provider-neutral adapter and configurable boundary, but it must not invent a vendor API schema or claim live SMS delivery until real provider documentation and credentials/sandbox configuration are supplied.

Use fake adapters only in tests. Clearly differentiate fake tests, provider sandbox tests and live external delivery evidence.

## 9.6 Do not invent storage/database metadata

- No new image columns.
- No image blobs in PostgreSQL.
- No encryption key in DB or source control.
- No plaintext file temporary path.
- No public static file serving.
- No fake image URL/path in DTOs.

## 9.7 Code quality and verification

- Keep changes small and phase-scoped.
- Add regression tests for each fixed defect.
- Run formatting/lint/type/test commands available in the repository.
- Do not suppress tests or weaken assertions merely to obtain green CI.
- Do not convert PostgreSQL tests to SQLite.
- Capture failing command output and root cause when a test cannot run.
- No claim of device/runtime verification without actual evidence.

## 9.8 Required phase completion report

Every phase response from Gemini Flash CLI must contain:

1. **Completed phase and scope.**
2. **Files created/modified.** Include the exact paths and explain why each was changed.
3. **Database safety statement.** State explicitly whether any DB connection was made, which target was used, whether DDL/DML occurred, and confirm that the protected project DB schema was not modified.
4. **Build and verification output.** Commands, exit codes, test counts, database version and commit SHA.
5. **Unresolved issues.** Do not hide failed/skipped tests.
6. **Next phase gate.** PASS or BLOCKED with the exact condition.
7. **HARD STOP.** No work on the next phase until a new prompt is provided.

---

# 10. Final feasibility-prototype scope and release statement

The v0.12.0 feasibility prototype is intended to prove that the current Volunteer Coordination System can support its existing volunteer/coordinator workflows with a real backend and mobile client. It is not the final recreated commercial product.

The following must work for the prototype to pass stabilization:

- Existing PostgreSQL database is healthy and remains frozen.
- Existing service/BFF/mobile architecture behaves consistently.
- Phone-based OTP request reaches the configured network/SMS provider directly for the submitted mobile number.
- OTP verification is bound to the exact existing database challenge/OTP rows and issues the existing DRF token only on success.
- Mobile secure storage works for the DRF token.
- Coordinator manual check-in is authoritative, idempotent and auditable.
- Verification images are encrypted files stored on the server and are decryptable only through the authorized admin stream.
- Existing volunteer/coordinator API paths and DTOs work without fabricated client data.
- Automated tests and real HTTP verification run against a disposable PostgreSQL 18.x database.

Explicitly excluded from this feasibility version:

- CIT / JWE / HPKE identity envelope (deferred until real-product recreation).
- Friends and social connections.
- Native GPS/geofence mobile experience and map navigation.
- Durable asynchronous OTP dispatch, worker fleet and provider failover.
- A database schema redesign or additional database fields.
- Any database migration or change to existing PostgreSQL functions/triggers/views/constraints.

**Final rule:** stabilize the system that exists. Do not redesign it. Do not change the database. If an issue cannot be fixed safely using the current database contract and application/file-storage layers, document it as a blocker or deferred item rather than changing the frozen database.

---

## Appendix A — Repository paths to prioritize

### Database (read-only reference only)

- `postgres_sql/updated_volunteer_coordination_system_Database.sql`
- `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`
- `docs/full_database_details.md`
- `reference/database_deep_dive.md`

### Backend auth

- `backend/services/auth_service.py`
- `backend/common/security.py`
- `backend/config/settings/base.py`
- `backend/config/settings/production.py`
- `backend/bff/auth/serializers.py`
- `backend/bff/auth/views.py`
- `backend/bff/auth/urls.py`
- `backend/apps/accounts/models.py`
- `backend/apps/accounts/tests/test_tokenized_auth_service.py`
- `backend/apps/accounts/tests/test_bff_auth_tokenized.py`

### Verification image storage

- `backend/services/verification_service.py`
- `backend/common/utils.py`
- `backend/apps/accounts/models.py`
- `backend/bff/volunteer/serializers.py`
- `backend/bff/volunteer/views.py`
- `backend/admin_portal/views.py`
- `backend/admin_portal/urls.py`
- `backend/config/settings/base.py`

### Attendance / coordinator

- `backend/services/attendance_service.py`
- `backend/services/assignment_service.py`
- `backend/bff/checkin/views.py`
- `backend/bff/checkin/serializers.py`
- `backend/bff/checkin/urls.py`
- `backend/bff/coordinator/views.py`
- `backend/services/profile_service.py`
- `backend/services/application_service.py`

### Mobile auth and data

- `mobile/src/core/auth/tokenStore.ts`
- `mobile/src/core/auth/sessionManager.ts`
- `mobile/src/core/api/apiClient.ts`
- `mobile/src/data/endpoints/authApi.ts`
- `mobile/src/data/endpoints/checkinApi.ts`
- `mobile/src/app/UserContext.tsx`
- `mobile/src/data/http/HttpCoordinatorRepository.ts`
- `mobile/src/data/mappers/coordinatorMapper.ts`
- `mobile/src/data/mappers/profileMapper.ts`
- `mobile/src/features/auth/screens/OtpLoginScreen.tsx`
- `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx`

### Tests and automation

- `mobile/src/data/__tests__/v0_12_0_realHttpIntegration.test.ts`
- `backend/apps/attendance/tests/test_bff_checkin_phase7.py`
- `scripts/run_real_http_suite.py`
- `scripts/seed_integration_fixtures.py`
- `scripts/alter_local_db.py` (do not run against the protected DB)
- `.github/workflows/` (restore current integration workflow)

---

## Appendix B — Official and repository references

### Repository references reviewed

- `docs/full_database_details.md` — documented PostgreSQL 18.6 database snapshot, table inventory, image metadata and database details.
- `docs/backend_analysis.md` — Django/BFF/service organization and database-first ownership.
- `docs/mobile_analysis.md` — React Native architecture, secure token storage and data-layer contracts.
- `docs/tokenization_login_architecture.md` — tokenization terminology, credential separation and earlier architecture proposal.
- `reference/v0_12_0_backend_client_handshake_plan.md` — v0.12.0 API, auth, manual check-in, phase and acceptance contracts.
- `reference/agent_execution_prompt_v0_12_0_handshake.md` — previous agent phase discipline and hard-stop rules; updated by this master plan where newer prototype decisions differ.
- `reference/v0_12_0_database_migration_guide.md` — existing migration details, reviewed for object inventory only; **do not execute against the frozen project database**.
- `reference/v0_12_0_real_http_integration_report.md` — historical 12/12 real-HTTP run on SHA `1c0f238d286c389e9e14cdb6644ada823c3c6082`; not evidence for current HEAD.
- `reference/database_deep_dive.md` — table and business-rule reference.

### PostgreSQL reference

- PostgreSQL 18 UUID data type and UUID generation documentation: <https://www.postgresql.org/docs/18/datatype-uuid.html>
- PostgreSQL 18 release notes (UUIDv7 built-in function): <https://www.postgresql.org/docs/18/release-18.html>

**Document end — use this as the stabilization master specification for the later Gemini Flash CLI phase prompts.**
