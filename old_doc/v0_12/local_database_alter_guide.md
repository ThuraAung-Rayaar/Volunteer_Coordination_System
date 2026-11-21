# Local Database Alteration Guide: v0.12.0 Tokenized OTP Challenge Handshake

**Document ID:** `DOC-LOCAL-DB-ALTER-v0.12.0`  
**Target Engine:** PostgreSQL 18+ (Database-First Architecture)  
**Database Name:** `volunteer_coordination_db` (default)  
**Additive Upgrade Script:** `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`  
**Master Database Script:** `postgres_sql/updated_volunteer_coordination_system_Database.sql`  
**Automated Python Helper:** `scripts/alter_local_db.py`  

---

## 1. Overview: What Changed & Why

In Release **v0.12.0**, the authentication subsystem was upgraded from the legacy OTP verification flow to a secure, session-bound **Tokenized OTP Challenge Handshake**. 

### The Problem with the Legacy Flow
- The mobile client had to send the raw user `phone` number again during the verify step (`POST /api/v1/auth/verify-otp/`).
- The database had to query for the latest unconsumed OTP matching the phone hash, which was vulnerable to concurrent race conditions and OTP reuse.

### The v0.12.0 Handshake Architecture
- **Step 1 (Request OTP):** `POST /api/v1/auth/tokenized/request-otp/` takes the phone number, generates a 6-digit OTP, creates an `auth_otp` record, and issues a 256-bit cryptographic `auth_session_token`.
- **Step 2 (Verify OTP):** `POST /api/v1/auth/tokenized/verify-otp/` requires **ONLY** `auth_session_token` and the 6-digit `code`. The phone number is **never transmitted** during verification.
- **Database Enforcement:** PostgreSQL directly enforces dual-clock TTL expiry (challenge TTL capped at 180s), deterministic row locking (`FOR UPDATE`), single-use consumption, and code attempt limits.

### Safety Guarantee
This migration is **100% additive and safe for existing data**:
- **No data loss:** Existing `users`, `events`, `attendance`, `profiles`, and active `auth_otp` rows remain completely intact.
- **Dual compatibility:** Legacy OTP endpoints remain operational alongside the new tokenized routes during the migration period.

---

## 2. Summary of Database Schema Changes

The migration introduces the following new objects to your PostgreSQL database:

| Object Type | Name | Purpose |
| :--- | :--- | :--- |
| **Table** | `auth_otp_challenge` | Stores tokenized challenge sessions tied to `auth_otp(id)` via `ON DELETE CASCADE`. Stores `HMAC-SHA256` token hash (never raw token). |
| **Index** | `idx_auth_otp_challenge_otp_id` | B-tree index on foreign key `otp_id` for fast navigation and cascading deletions. |
| **Index** | `idx_auth_otp_challenge_expires` | Partial B-tree index on `(expires_at) WHERE consumed_at IS NULL` for rapid lookup of active challenges. |
| **Index** | `idx_auth_otp_challenge_nonce` | Unique partial index on `identity_nonce_hash` for replay attack prevention. |
| **Trigger Function** | `trg_auth_otp_challenge_before()` | Validates invariants: `challenge.expires_at <= otp.expires_at` and `challenge.purpose == otp.purpose`. |
| **Trigger** | `trg_01_auth_otp_challenge_guard` | `BEFORE INSERT OR UPDATE` trigger bound to `auth_otp_challenge`. |
| **Stored Function** | `create_otp_challenge(...)` | Atomic function to issue challenge, clamp TTL to $\le 180$s and parent OTP expiry, and return new challenge ID. |
| **Stored Function** | `verify_otp_challenge(...)` | Atomic function using deterministic row locking (`auth_otp_challenge` then `auth_otp` `FOR UPDATE`), checking single-use consumption, dual clocks, attempt limits, and hash verification. |
| **Retention Function** | `purge_expired_otp_challenges(...)` | Cleans up consumed or expired challenges older than retention period (default 1 day). Leaves active challenges untouched. |
| **Retention Function** | `purge_expired_otps()` | Updated to invoke `purge_expired_otp_challenges(INTERVAL '1 day')` before purging parent OTP records. |

---

## 3. How to Alter Your Local Database (Choose One Method)

### Method A: Automated Python Helper (Recommended & Fastest)

If you have this repository's virtual environment set up, you do not even need `psql` installed or configured in your system `PATH`. Simply run the automated migration helper from the project root:

#### Windows PowerShell / Command Prompt:
```powershell
.\.venv\Scripts\python.exe scripts/alter_local_db.py
```

#### macOS / Linux:
```bash
./.venv/bin/python scripts/alter_local_db.py
```

**Expected Output:**
```text
============================================================
Volunteer Coordination System: v0.12.0 Local DB Alteration
============================================================
Connecting to PostgreSQL at 127.0.0.1:5432/volunteer_coordination_db as user 'postgres'...
[OK] Connected successfully.
Executing migration script: v0_12_0_auth_otp_challenge_upgrade.sql...
[OK] Migration script executed successfully.

Verifying database objects...
  - Table 'auth_otp_challenge': FOUND
  - Stored functions: ['create_otp_challenge', 'purge_expired_otp_challenges', 'verify_otp_challenge']
  - Trigger 'trg_01_auth_otp_challenge_guard': ACTIVE

============================================================
[SUCCESS] Local database has been successfully updated to v0.12.0!
============================================================
```

---

### Method B: PostgreSQL CLI (`psql`)

If you have the PostgreSQL command-line tools installed, you can apply the SQL file directly using `psql`.

#### Windows PowerShell:
```powershell
# Set your PostgreSQL password environment variable (default: postgres)
$env:PGPASSWORD = "postgres"

# Execute migration script against volunteer_coordination_db
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql\v0_12_0_auth_otp_challenge_upgrade.sql
```

#### Windows Command Prompt (CMD):
```cmd
set PGPASSWORD=postgres
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql\v0_12_0_auth_otp_challenge_upgrade.sql
```

#### Linux / macOS (Bash / Zsh):
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
```

---

### Method C: GUI Tools — pgAdmin 4

If you manage your local database using **pgAdmin 4**:

1. Open **pgAdmin 4** and connect to your local PostgreSQL server.
2. In the left browser tree, expand:
   `Servers` $\rightarrow$ `PostgreSQL 18` $\rightarrow$ `Databases` $\rightarrow$ `volunteer_coordination_db`.
3. Right-click on `volunteer_coordination_db` and select **Query Tool** (or press `Ctrl + E`).
4. In the Query Tool toolbar:
   - Click the **Open File** icon (folder icon or `Ctrl + O`).
   - Navigate to your project folder and select:  
     `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`.
   - *(Alternatively, copy the SQL script from Section 4 of this guide and paste it into the editor window).*
5. Click the **Execute / Run** button (play icon or press `F5`).
6. Verify that the **Messages** pane displays:
   ```text
   COMMIT
   Query returned successfully in XX msec.
   ```

---

### Method D: GUI Tools — DBeaver / DataGrip / VS Code

1. Connect to `volunteer_coordination_db`.
2. Open the file `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` in the SQL editor.
3. Select all statements (`Ctrl + A`) and execute as a script (`Alt + X` in DBeaver, `Ctrl + Enter` in DataGrip).
4. Verify execution completes with exit code 0 / commit success.

---

## 4. Complete SQL Migration Script (Copy-Pasteable)

If you prefer to copy and paste the raw SQL directly into any SQL editor, use the complete block below:

```sql
-- =============================================================================
-- Migration: v0.12.0 Additive Upgrade — OTP Challenge Table & Stored Functions
-- File: postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
-- Target Database: PostgreSQL 18+ (Volunteer Coordination System)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table: auth_otp_challenge
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_otp_challenge (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    otp_id               BIGINT NOT NULL REFERENCES auth_otp (id) ON DELETE CASCADE,
    challenge_token_hash TEXT NOT NULL UNIQUE,
    purpose              TEXT NOT NULL DEFAULT 'login',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL,
    consumed_at          TIMESTAMPTZ,
    request_id           TEXT,
    identity_nonce_hash  TEXT,

    CONSTRAINT ck_auth_otp_challenge_purpose
        CHECK (purpose IN ('login', 'qr_registration')),
    CONSTRAINT ck_auth_otp_challenge_token_hash_len
        CHECK (length(challenge_token_hash) = 64),
    CONSTRAINT ck_auth_otp_challenge_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT ck_auth_otp_challenge_consumed
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

-- Indexes for challenge lookups and expiry scans
CREATE INDEX IF NOT EXISTS idx_auth_otp_challenge_otp_id
    ON auth_otp_challenge (otp_id);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenge_expires
    ON auth_otp_challenge (expires_at)
    WHERE consumed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_otp_challenge_nonce
    ON auth_otp_challenge (identity_nonce_hash)
    WHERE identity_nonce_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Trigger Function: Enforce Challenge Expiry <= Parent auth_otp Expiry
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_auth_otp_challenge_before()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_otp auth_otp%ROWTYPE;
BEGIN
    SELECT * INTO v_otp FROM auth_otp WHERE id = NEW.otp_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_otp_reference: referenced auth_otp row (%) does not exist', NEW.otp_id;
    END IF;

    -- Invariant: Challenge expiry cannot exceed parent OTP expiry
    IF NEW.expires_at > v_otp.expires_at THEN
        RAISE EXCEPTION 'challenge_expiry_exceeds_otp: challenge expires_at (%) cannot exceed auth_otp expires_at (%)',
            NEW.expires_at, v_otp.expires_at;
    END IF;

    -- Invariant: Challenge purpose must match parent OTP purpose
    IF NEW.purpose <> v_otp.purpose THEN
        RAISE EXCEPTION 'purpose_mismatch: challenge purpose (%) must match auth_otp purpose (%)',
            NEW.purpose, v_otp.purpose;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_01_auth_otp_challenge_guard ON auth_otp_challenge;
CREATE TRIGGER trg_01_auth_otp_challenge_guard
    BEFORE INSERT OR UPDATE ON auth_otp_challenge
    FOR EACH ROW EXECUTE FUNCTION trg_auth_otp_challenge_before();

-- -----------------------------------------------------------------------------
-- 3. Stored Function: create_otp_challenge
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_otp_challenge(
    p_otp_id               BIGINT,
    p_challenge_token_hash TEXT,
    p_ttl_seconds          INTEGER DEFAULT 180,
    p_purpose              TEXT DEFAULT 'login',
    p_request_id           TEXT DEFAULT NULL,
    p_identity_nonce_hash  TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_otp          auth_otp%ROWTYPE;
    v_challenge_id BIGINT;
    v_expires_at   TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_otp FROM auth_otp WHERE id = p_otp_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_otp_reference: referenced auth_otp row (%) does not exist', p_otp_id;
    END IF;

    -- Capped at max 180s challenge TTL and parent OTP expiry: min(issued_at + 180s, otp.expires_at)
    v_expires_at := LEAST(now() + make_interval(secs => LEAST(p_ttl_seconds, 180)), v_otp.expires_at);

    INSERT INTO auth_otp_challenge (
        otp_id,
        challenge_token_hash,
        purpose,
        expires_at,
        request_id,
        identity_nonce_hash
    )
    VALUES (
        p_otp_id,
        p_challenge_token_hash,
        p_purpose,
        v_expires_at,
        p_request_id,
        p_identity_nonce_hash
    )
    RETURNING id INTO v_challenge_id;

    RETURN v_challenge_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Stored Function: verify_otp_challenge (Atomic, Deterministic Locking)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION verify_otp_challenge(
    p_challenge_token_hash TEXT,
    p_code_hash            TEXT,
    p_purpose              TEXT DEFAULT 'login'
)
RETURNS TABLE (
    status     TEXT,
    phone_hash TEXT,
    otp_id     BIGINT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_chal auth_otp_challenge%ROWTYPE;
    v_otp  auth_otp%ROWTYPE;
BEGIN
    -- Step 1: Deterministic locking order — lock challenge row first
    SELECT * INTO v_chal
      FROM auth_otp_challenge
     WHERE challenge_token_hash = p_challenge_token_hash
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'invalid_challenge'::TEXT, NULL::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Step 2: Purpose validation
    IF v_chal.purpose <> p_purpose THEN
        RETURN QUERY SELECT 'invalid_challenge'::TEXT, NULL::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Step 3: Lock linked parent auth_otp row
    SELECT * INTO v_otp
      FROM auth_otp
     WHERE id = v_chal.otp_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'invalid_challenge'::TEXT, NULL::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Step 4: Check consumption status (single-use constraint)
    IF v_chal.consumed_at IS NOT NULL OR v_otp.consumed_at IS NOT NULL THEN
        RETURN QUERY SELECT 'challenge_consumed'::TEXT, NULL::TEXT, v_chal.otp_id;
        RETURN;
    END IF;

    -- Step 5: Enforce dual expiry clocks
    IF v_chal.expires_at <= now() OR v_otp.expires_at <= now() THEN
        RETURN QUERY SELECT 'challenge_expired'::TEXT, NULL::TEXT, v_chal.otp_id;
        RETURN;
    END IF;

    -- Step 6: Enforce attempt limit
    IF v_otp.attempt_count >= setting_int('otp_max_attempts') THEN
        RETURN QUERY SELECT 'too_many_attempts'::TEXT, NULL::TEXT, v_chal.otp_id;
        RETURN;
    END IF;

    -- Step 7: Compare code hash
    IF v_otp.code_hash = p_code_hash THEN
        UPDATE auth_otp_challenge SET consumed_at = now() WHERE id = v_chal.id;
        UPDATE auth_otp SET consumed_at = now() WHERE id = v_otp.id;
        RETURN QUERY SELECT 'ok'::TEXT, v_otp.phone_hash, v_otp.id;
        RETURN;
    END IF;

    -- Wrong code: increment attempt counter on the exact bound auth_otp row
    UPDATE auth_otp SET attempt_count = attempt_count + 1 WHERE id = v_otp.id;
    RETURN QUERY SELECT 'invalid_code'::TEXT, NULL::TEXT, v_otp.id;
    RETURN;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Stored Functions: Retention & Cleanup
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION purge_expired_otp_challenges(p_retention INTERVAL DEFAULT INTERVAL '1 day')
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    -- Delete consumed or expired challenges older than retention threshold.
    -- Active challenges (unconsumed where expires_at >= now()) are never deleted.
    DELETE FROM auth_otp_challenge
     WHERE (consumed_at IS NOT NULL AND consumed_at < now() - p_retention)
        OR (expires_at < now() - p_retention);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION purge_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    PERFORM purge_expired_otp_challenges(INTERVAL '1 day');
    DELETE FROM auth_otp
     WHERE expires_at < now() - INTERVAL '1 day'
        OR created_at < now() - INTERVAL '1 day';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

COMMIT;
```

---

## 5. Post-Migration Verification Queries

Run the queries below in your SQL editor to confirm that all objects were successfully created:

### 1. Check Table Structure & Columns
```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'auth_otp_challenge'
 ORDER BY ordinal_position;
```

**Expected Result (9 columns):**
| column_name | data_type | is_nullable |
| :--- | :--- | :--- |
| `id` | bigint | NO |
| `otp_id` | bigint | NO |
| `challenge_token_hash` | text | NO |
| `purpose` | text | NO |
| `created_at` | timestamp with time zone | NO |
| `expires_at` | timestamp with time zone | NO |
| `consumed_at` | timestamp with time zone | YES |
| `request_id` | text | YES |
| `identity_nonce_hash` | text | YES |

---

### 2. Check Stored Procedures
```sql
SELECT proname, proargnames, prorettype::regtype
  FROM pg_proc
 WHERE proname IN ('create_otp_challenge', 'verify_otp_challenge', 'purge_expired_otp_challenges')
   AND pronamespace = 'public'::regnamespace;
```

**Expected Result:**
- `create_otp_challenge` (returns `bigint`)
- `verify_otp_challenge` (returns `record` with `status`, `phone_hash`, `otp_id`)
- `purge_expired_otp_challenges` (returns `integer`)

---

### 3. Check Active Triggers
```sql
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
  FROM pg_trigger
 WHERE tgrelid = 'public.auth_otp_challenge'::regclass;
```

**Expected Result:**
- `trg_01_auth_otp_challenge_guard` is active.

---

### 4. Interactive End-to-End Handshake Sanity Test

You can execute this self-cleaning PL/pgSQL block in your SQL editor to test the complete challenge handshake in PostgreSQL:

```sql
DO $$
DECLARE
    v_otp_id   BIGINT;
    v_chal_id  BIGINT;
    v_status   TEXT;
    v_phone_h  TEXT;
    v_bound_id BIGINT;
    c_chal_h   TEXT := repeat('a', 64);
    c_code_h   TEXT := repeat('b', 64);
    c_ph_hash  TEXT := repeat('c', 64);
BEGIN
    -- 1. Insert temporary parent auth_otp row
    INSERT INTO auth_otp (phone_hash, code_hash, purpose, expires_at)
    VALUES (c_ph_hash, c_code_h, 'login', now() + INTERVAL '5 minutes')
    RETURNING id INTO v_otp_id;

    -- 2. Call create_otp_challenge
    v_chal_id := create_otp_challenge(
        p_otp_id               => v_otp_id,
        p_challenge_token_hash => c_chal_h,
        p_ttl_seconds          => 180,
        p_purpose              => 'login'
    );
    RAISE NOTICE 'Challenge created with ID: %', v_chal_id;

    -- 3. Verify OTP challenge with matching code hash
    SELECT status, phone_hash, otp_id
      INTO v_status, v_phone_h, v_bound_id
      FROM verify_otp_challenge(c_chal_h, c_code_h, 'login');

    RAISE NOTICE 'Verification result: status=%, phone_hash=%, otp_id=%', v_status, v_phone_h, v_bound_id;

    IF v_status <> 'ok' OR v_phone_h <> c_ph_hash OR v_bound_id <> v_otp_id THEN
        RAISE EXCEPTION 'Verification test failed! Got status=%', v_status;
    END IF;

    -- 4. Verify replay attempt fails with challenge_consumed
    SELECT status INTO v_status FROM verify_otp_challenge(c_chal_h, c_code_h, 'login');
    RAISE NOTICE 'Replay test result: status=%', v_status;

    IF v_status <> 'challenge_consumed' THEN
        RAISE EXCEPTION 'Replay attack guard failed! Expected challenge_consumed, got %', v_status;
    END IF;

    -- 5. Cleanup test records
    DELETE FROM auth_otp WHERE id = v_otp_id;
    RAISE NOTICE 'Test passed successfully! Cleaned up test records.';
END;
$$;
```

---

### 5. Run Backend Integration Tests
To confirm that Django and the backend test suite successfully talk to your updated database:

```powershell
.\.venv\Scripts\python.exe backend/manage.py test apps.accounts.tests.test_otp_challenge_invariants apps.accounts.tests.test_tokenized_auth_service
```

---

## 6. Troubleshooting Common Issues

### Issue 1: `relation "auth_otp" does not exist`
- **Cause:** Your local PostgreSQL database was never seeded with the core database schema.
- **Fix:** Initialize your database using the master schema first:
  ```powershell
  psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql\updated_volunteer_coordination_system_Database.sql
  ```

### Issue 2: `'psql' is not recognized as an internal or external command`
- **Cause:** PostgreSQL's `bin/` directory is not added to your system `PATH`.
- **Fix:** Use **Method A** (`.\.venv\Scripts\python.exe scripts/alter_local_db.py`), which uses the project's Python virtual environment and does not depend on system `PATH`.

### Issue 3: `password authentication failed for user "postgres"`
- **Cause:** Your local PostgreSQL password differs from the default (`postgres`).
- **Fix:** Set the environment variable before running:
  ```powershell
  $env:PGPASSWORD = "your_actual_password"
  .\.venv\Scripts\python.exe scripts/alter_local_db.py
  ```

### Issue 4: `could not connect to server: Connection refused`
- **Cause:** PostgreSQL service is not currently running.
- **Fix (Windows):** Check and start the service:
  ```powershell
  Get-Service postgresql*
  Start-Service postgresql-x64-16  # (or your installed version)
  ```

---

## 7. Rollback Procedure

If you ever need to revert the database back to the pre-v0.12.0 schema, execute the rollback script below:

```sql
BEGIN;

-- 1. Drop trigger and trigger guard function
DROP TRIGGER IF EXISTS trg_01_auth_otp_challenge_guard ON auth_otp_challenge;
DROP FUNCTION IF EXISTS trg_auth_otp_challenge_before();

-- 2. Drop stored functions
DROP FUNCTION IF EXISTS verify_otp_challenge(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_otp_challenge(BIGINT, TEXT, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS purge_expired_otp_challenges(INTERVAL);

-- 3. Drop table (cascades indexes and foreign keys)
DROP TABLE IF EXISTS auth_otp_challenge CASCADE;

COMMIT;
```

> [!NOTE]
> Because `auth_otp_challenge` references `auth_otp` with `ON DELETE CASCADE`, rolling back this migration only drops the challenge table and does **NOT** delete any existing user accounts, passwords, or active parent `auth_otp` rows.

---

## 8. Fresh Database Alternative (For Clean Reinstalls)

If you are setting up a completely new development workstation and prefer to initialize the database from scratch rather than altering an existing one:

```powershell
# Drop and recreate volunteer_coordination_db
dropdb -h 127.0.0.1 -p 5432 -U postgres volunteer_coordination_db
createdb -h 127.0.0.1 -p 5432 -U postgres volunteer_coordination_db

# Apply the master schema (already includes v0.12.0 tables, functions, and triggers)
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql\updated_volunteer_coordination_system_Database.sql
```
