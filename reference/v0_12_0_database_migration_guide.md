# Database Migration & Compatibility Guide: v0.12.0 OTP Challenge & Session Handshake

**Document ID:** `DOC-MIG-v0.12.0-DB-UPGRADE`  
**Milestone Version:** `v0.12.0`  
**Target Engine:** **PostgreSQL 18.x ONLY** (Strict Dependency on native `uuidv7()` and `btree_gist`)  
**Schema Script Path (Reference Only):** `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`  
**Master Database Script (Reference Only):** `postgres_sql/updated_volunteer_coordination_system_Database.sql`  

---

## 1. Engine Compatibility Notice: PostgreSQL 18.x Requirement

> [!WARNING]
> **PostgreSQL 14 / 16 Compatibility Claims Are Stale & Obsolete.**  
> Older project documentation claimed compatibility with PostgreSQL 14+ or PostgreSQL 16. That wording is **incompatible** with the current frozen schema.  
> The canonical schema (`updated_volunteer_coordination_system_Database.sql`) strictly requires the built-in `uuidv7()` function, which was officially introduced in **PostgreSQL 18** (Reference snapshot: PostgreSQL 18.6). Running on PostgreSQL 14 or 16 will fail immediately during schema bootstrap with `function uuidv7() does not exist`.

---

## 2. Overview & Architectural Motivation

In Release v0.12.0, authentication transitions from the legacy protocol to a **tokenized, session-bound OTP challenge handshake**:

1. **Exact OTP Row Binding:** Rather than querying the latest unconsumed OTP by phone hash, verification is bound strictly to an exact `auth_otp` primary key record (`otp_id`).
2. **Dual Expiry Clocks:** Challenge TTL is capped at **180 seconds** (`min(now() + 180s, otp.expires_at)`). Both the challenge clock and the parent OTP clock are enforced by PostgreSQL.
3. **Deterministic Row Locking:** Verification locks the challenge row first, then locks the exact linked `auth_otp` row `FOR UPDATE` to eliminate concurrency race conditions.
4. **Single-Use Consumption:** Successful verification marks both the challenge and the parent OTP row as consumed simultaneously. Subsequent verify attempts fail immediately with `challenge_consumed`.
5. **No Raw Secrets in DB:** The database stores only `HMAC-SHA256(AUTH_SESSION_TOKEN_SECRET, raw_token)` in a 64-character column. The raw 256-bit challenge token is never persisted.

---

## 3. Ephemeral CI / Test Database Bootstrap

> [!IMPORTANT]
> **DATABASE FROZEN (Absolute Rule):**  
> Never apply DDL, migrations, or scripts against `volunteer_coordination_db`. The instructions below apply strictly to **ephemeral CI databases** (`ci_volunteer_coordination_db`) or disposable test databases (`test_volunteer_coordination_db`).

### Using `psql` in Ephemeral CI:
```bash
set -euo pipefail
export PGPASSWORD="postgres"

# 1. Load canonical base schema
psql -X -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -p 5432 -U postgres -d ci_volunteer_coordination_db \
  -f postgres_sql/updated_volunteer_coordination_system_Database.sql

# 2. Apply additive challenge upgrade
psql -X -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -p 5432 -U postgres -d ci_volunteer_coordination_db \
  -f postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
```

---

## 4. Static Review Defect: Migration Rollback Incompleteness

> [!CAUTION]
> **Static Review Finding (P2 Defect in `v0_12_0_auth_otp_challenge_upgrade.sql`):**  
> In `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` (lines 235–248), the upgrade replaces `purge_expired_otps()` with a version that invokes `purge_expired_otp_challenges()`:
> ```sql
> CREATE OR REPLACE FUNCTION purge_expired_otps()
> RETURNS INTEGER LANGUAGE plpgsql AS $$
> DECLARE v_n INTEGER;
> BEGIN
>     PERFORM purge_expired_otp_challenges(INTERVAL '1 day');
>     DELETE FROM auth_otp WHERE expires_at < now() - INTERVAL '1 day' ...
> ...
> ```
> 
> However, the commented-out **ROLLBACK SCRIPT** in that same file (lines 255–264):
> ```sql
> DROP TRIGGER IF EXISTS trg_01_auth_otp_challenge_guard ON auth_otp_challenge;
> DROP FUNCTION IF EXISTS trg_auth_otp_challenge_before();
> DROP FUNCTION IF EXISTS verify_otp_challenge(TEXT, TEXT, TEXT);
> DROP FUNCTION IF EXISTS create_otp_challenge(BIGINT, TEXT, INTEGER, TEXT, TEXT, TEXT);
> DROP FUNCTION IF EXISTS purge_expired_otp_challenges(INTERVAL);
> DROP TABLE IF EXISTS auth_otp_challenge CASCADE;
> ```
> **DOES NOT restore the original `purge_expired_otps()` function!**  
> If the rollback script were executed as written, `purge_expired_otps()` would remain in place referencing the dropped `purge_expired_otp_challenges()` function, causing maintenance tasks to crash with an `UndefinedFunction` error on subsequent runs.
> 
> **Policy:** Under the frozen database rule, the SQL files are **NOT modified**. If a manual rollback on an ephemeral/disposable database is ever required, the following restorative definition must be included:
> 
> ```sql
> -- Restorative DDL for purge_expired_otps() during rollback:
> CREATE OR REPLACE FUNCTION purge_expired_otps()
> RETURNS INTEGER
> LANGUAGE plpgsql AS $$
> DECLARE
>     v_n INTEGER;
> BEGIN
>     DELETE FROM auth_otp
>      WHERE expires_at < now() - INTERVAL '1 day'
>         OR created_at < now() - INTERVAL '1 day';
>     GET DIAGNOSTICS v_n = ROW_COUNT;
>     RETURN v_n;
> END;
> $$;
> ```
