# Database Migration Guide: v0.12.0 OTP Challenge & Session Handshake

**Document ID:** `DOC-MIG-v0.12.0-DB-UPGRADE`  
**Milestone Version:** `v0.12.0`  
**Phase:** Phase 1 (PostgreSQL OTP Challenge Schema, Stored Function & Key Separation)  
**Target Engine:** PostgreSQL 14+ (Database-First Architecture)  
**Schema Script Path:** `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`  
**Master Database Script:** `postgres_sql/updated_volunteer_coordination_system_Database.sql`  

---

## 1. Overview & Architectural Motivation

In Release v0.12.0, authentication transitions from the legacy protocol (which repeatedly re-transmitted raw phone numbers during verification) to a **tokenized, session-bound OTP challenge handshake**:

1. **Exact OTP Row Binding:** Rather than querying the latest unconsumed OTP by phone hash, verification is bound strictly to an exact `auth_otp` primary key record (`otp_id`).
2. **Dual Expiry Clocks:** Challenge TTL is capped at **180 seconds** (`min(now() + 180s, otp.expires_at)`). Both the challenge clock and the parent OTP clock are enforced by PostgreSQL.
3. **Deterministic Row Locking:** Verification locks the challenge row first, then locks the exact linked `auth_otp` row `FOR UPDATE` to eliminate concurrency race conditions.
4. **Single-Use Consumption:** Successful verification marks both the challenge and the parent OTP row as consumed simultaneously. Subsequent verify attempts fail immediately with `challenge_consumed`.
5. **No Raw Secrets in DB:** The database stores only `HMAC-SHA256(AUTH_SESSION_TOKEN_SECRET, raw_token)` in a 64-character column. The raw 256-bit challenge token is never persisted.

---

## 2. Migration Execution Instructions

### Option A: Using `psql` (Recommended CLI)

From the project root directory, execute the additive upgrade script against your local database:

```bash
# Set your PostgreSQL environment variables if needed:
export PGPASSWORD="your_postgres_password"

# Apply the upgrade script to your local database:
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
```

*(On Windows PowerShell):*
```powershell
$env:PGPASSWORD="postgres"
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql\v0_12_0_auth_otp_challenge_upgrade.sql
```

### Option B: Using Python Virtual Environment (psycopg / Django shell)

You can also apply the upgrade script directly using the project's Python environment:

```powershell
.\.venv\Scripts\python.exe -c @"
import psycopg
from pathlib import Path

sql = Path('postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql').read_text(encoding='utf-8')
conn = psycopg.connect('dbname=volunteer_coordination_db user=postgres password=postgres host=127.0.0.1 port=5432')
with conn.cursor() as cur:
    cur.execute(sql)
conn.commit()
conn.close()
print('Migration successfully applied to volunteer_coordination_db.')
"@
```

### Option C: GUI Tools (pgAdmin, DBeaver, DataGrip)
1. Open your database administration tool and connect to `volunteer_coordination_db`.
2. Open the SQL Editor and load the file `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`.
3. Execute the entire transaction (`BEGIN ... COMMIT`).

---

## 3. Detailed Schema Alterations

The migration performs the following additive operations:

### 3.1 New Table: `auth_otp_challenge`
```sql
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
```

### 3.2 Indexes Created
- `idx_auth_otp_challenge_otp_id`: Fast foreign key navigation and cascade operations.
- `idx_auth_otp_challenge_expires`: Partial index for rapid scanning of unconsumed, expiring challenges.
- `idx_auth_otp_challenge_nonce`: Unique partial index on `identity_nonce_hash` for replay attack prevention.

### 3.3 Integrity Trigger: `trg_01_auth_otp_challenge_guard`
A `BEFORE INSERT OR UPDATE` trigger enforces two critical database invariants that standard SQL constraints cannot:
1. `NEW.expires_at <= v_otp.expires_at`: A challenge cannot outlive its parent OTP row.
2. `NEW.purpose == v_otp.purpose`: The challenge purpose must match the underlying OTP purpose.

### 3.4 Atomic Stored Procedure: `create_otp_challenge`
```sql
create_otp_challenge(
    p_otp_id               BIGINT,
    p_challenge_token_hash TEXT,
    p_ttl_seconds          INTEGER DEFAULT 180,
    p_purpose              TEXT DEFAULT 'login',
    p_request_id           TEXT DEFAULT NULL,
    p_identity_nonce_hash  TEXT DEFAULT NULL
) RETURNS BIGINT
```
- Automatically caps the TTL to `LEAST(p_ttl_seconds, 180)` and caps `expires_at` to `v_otp.expires_at`.
- Returns the new `auth_otp_challenge.id`.

### 3.5 Atomic Verification Stored Procedure: `verify_otp_challenge`
```sql
verify_otp_challenge(
    p_challenge_token_hash TEXT,
    p_code_hash            TEXT,
    p_purpose              TEXT DEFAULT 'login'
) RETURNS TABLE (
    status     TEXT,
    phone_hash TEXT,
    otp_id     BIGINT
)
```
- **Deterministic Row Locking:** Locks `auth_otp_challenge` first, then locks `auth_otp` with `FOR UPDATE`.
- **Status Returns:**
  - `'ok'` — Correct code; both challenge and OTP rows atomically consumed (`consumed_at = now()`); returns `phone_hash`.
  - `'invalid_challenge'` — Challenge not found or purpose mismatch.
  - `'challenge_consumed'` — Already consumed in a prior or concurrent verify attempt.
  - `'challenge_expired'` — Either challenge or parent OTP row has expired.
  - `'too_many_attempts'` — Parent OTP row reached `otp_max_attempts`.
  - `'invalid_code'` — Code hash does not match; increments `attempt_count` on the exact `auth_otp` row.

### 3.6 Data Retention & Cleanup Functions
- `purge_expired_otp_challenges(p_retention INTERVAL DEFAULT INTERVAL '1 day')`: Cleans up consumed or expired challenges older than the retention threshold. Active (unconsumed) challenges are never touched.
- `purge_expired_otps()`: Replaced to invoke challenge cleanup before purging expired parent OTPs.

---

## 4. Post-Migration Verification Queries

Run the following queries to verify that all database objects have been correctly installed:

```sql
-- 1. Check table existence and columns
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'auth_otp_challenge'
 ORDER BY ordinal_position;

-- 2. Verify stored functions exist
SELECT proname, proargnames, prorettype::regtype
  FROM pg_proc
 WHERE proname IN ('create_otp_challenge', 'verify_otp_challenge', 'purge_expired_otp_challenges')
   AND pronamespace = 'public'::regnamespace;

-- 3. Verify triggers attached to auth_otp_challenge
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
  FROM pg_trigger
 WHERE tgrelid = 'public.auth_otp_challenge'::regclass;
```

Expected result:
- `auth_otp_challenge` table exists with 9 columns.
- `create_otp_challenge`, `verify_otp_challenge`, and `purge_expired_otp_challenges` functions are present.
- `trg_01_auth_otp_challenge_guard` is active on `auth_otp_challenge`.

---

## 5. Rollback Procedure

If you ever need to rollback this migration from your local database, run the following SQL script:

```sql
BEGIN;

-- Drop trigger and trigger guard function
DROP TRIGGER IF EXISTS trg_01_auth_otp_challenge_guard ON auth_otp_challenge;
DROP FUNCTION IF EXISTS trg_auth_otp_challenge_before();

-- Drop challenge stored functions
DROP FUNCTION IF EXISTS verify_otp_challenge(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_otp_challenge(BIGINT, TEXT, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS purge_expired_otp_challenges(INTERVAL);

-- Drop table (cascades indexes and foreign keys)
DROP TABLE IF EXISTS auth_otp_challenge CASCADE;

COMMIT;
```
