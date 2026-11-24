# VCS AI — Database Source of Truth and Schema Audit Report

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch:** `feature/ai-chat-cache-ml-insights`  
**Git HEAD:** `f1d021a4f7449b8254b59efabdf75d933963bc14`  
**Date:** 2026-11-24  
**Audit Scope:** Task DB-01 (Source-of-truth reconciliation, static script inspection, and schema contract audit)  
**Safety Status:** STRICTLY READ-ONLY — Zero database alterations, migrations, or DDL/DML executed.

---

## 1. Executive Summary & Core Provenance Findings

This audit addresses the seven mandatory questions in Section 2.1 of `docs/VCS_AI_UNIFIED_HANDOFF.md`:

1. **Authoritative Bootstrap Source:**  
   `postgres_sql/updated_volunteer_coordination_system_Database.sql` combined with the additive upgrade `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql`.
2. **Frozen v0.12.0 Database Contract Artifact:**  
   `docs/full_database_details.md` (and the verification artifact `artifacts/v0_12_0_db_preflight_99db25a.md`).
3. **v0.5.2 Header Discrepancy Explanation:**  
   The checked-in canonical SQL script `postgres_sql/updated_volunteer_coordination_system_Database.sql` contains full v0.12.0 definitions (including `auth_otp_challenge`, `user_verification_images`, `trg_01_auth_otp_challenge_guard`, and `v0.12.0` inline comments at lines 2225 and 3167). However, its comment header (lines 1–10) was never updated from `v0.5.2`. It is **not** an old schema; it is a **current v0.12.0-level DDL script with a stale header comment**.
4. **Current Live Database Schema Fingerprint:**  
   The live database `volunteer_coordination_db` on `127.0.0.1:5432` contains exactly **31 base tables, 11 views, 0 materialized views, 438 constraints, 53 triggers, and 2 active extensions (`btree_gist` 1.8 and `plpgsql` 1.0)** on PostgreSQL 18.6.
5. **Live DB Match vs v0.12.0 Contract vs Bootstrap SQL:**  
   The live database matches the **frozen v0.12.0 contract 100%**. All 31 tables, 11 views, and required stored procedures match `docs/full_database_details.md`.
6. **Django Migrations vs PostgreSQL Script Ownership:**  
   The system is **Database-First**. PostgreSQL DDL scripts are the sole source of truth for all domain entities, triggers, check constraints, exclusion constraints, and functions. Django migrations manage only Django framework tables (`django_migrations`, `django_content_type`, `django_session`, `django_admin_log`, `auth_group`, `auth_group_permissions`, `auth_permission`, `authtoken_token`). All domain models in Django are unmanaged or mapped to PostgreSQL tables and views.
7. **Expected vs Drift Differences:**  
   There is **zero unexplained schema drift**. The difference between domain DDL (23 tables) and the 31 tables in the live database consists entirely of the 8 standard Django framework tables.

---

## 2. Syntax Defect in Canonical SQL Source (`tags_are_normalized`)

### 2.1 Defect Details
- **File:** `postgres_sql/updated_volunteer_coordination_system_Database.sql`
- **Location:** Line 72
- **Severity:** HIGH / SYNTAX BLOCKER (for standalone `psql -f` bootstrap execution)
- **Defective Source:**
  ```sql
  CREATE FUNCTION tags_are_normalized(tags TEXT[])
  RETURNS BOOLEAN
  LANGUAGE sql IMMUTABLE AS $$
      SELECT COALESCE(cardinality(tags) <= 30, FALSE)
         AND NOT EXISTS ( ....................................................................................
              SELECT 1 FROM unnest(tags) AS t(tag)
               WHERE t.tag IS NULL
                  OR t.tag = ''
                  OR t.tag <> lower(btrim(t.tag))
                  OR char_length(t.tag) > 50)
  $$;
  ```
  Line 72 contains a corrupted run of over 10,000 literal dots (`.`) immediately following `AND NOT EXISTS (`.
- **Parser Impact:**
  PostgreSQL parser rejects this line with `ERROR: syntax error at or near "."`. Any attempt to run this script directly in `psql` aborts the transaction (`BEGIN; ... ROLLBACK;`).

### 2.2 Proof of Test-Runner Workaround
In `backend/config/test_runner.py` (lines 55–59):
```python
with open(sql_file, "r", encoding="utf-8") as f:
    sql = f.read()
import re
sql = re.sub(r'AND NOT EXISTS \(\s*\.\.\.+', 'AND NOT EXISTS (', sql)
cur.execute(sql)
```
The Django test runner actively sanitizes this exact defect in memory before executing test database setup.

### 2.3 Live Database State
In the live database (`volunteer_coordination_db`), `tags_are_normalized` has the **clean, uncorrupted definition**:
```sql
CREATE OR REPLACE FUNCTION public.tags_are_normalized(tags text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT COALESCE(cardinality(tags) <= 30, FALSE)
       AND NOT EXISTS (
            SELECT 1 FROM unnest(tags) AS t(tag)
             WHERE t.tag IS NULL
                OR t.tag = ''
                OR t.tag <> lower(btrim(t.tag))
                OR char_length(t.tag) > 50)
$function$
```
This proves the live database was initialized or repaired using the correct SQL syntax.

---

## 3. Active SQL Scripts Inventory & Safety Classification

| Script Path | Purpose | Safe on Live DB? | Safe on Empty DB? | Mutates Data? | Classification & Approval |
|---|---|:---:|:---:|:---:|---|
| `postgres_sql/updated_volunteer_coordination_system_Database.sql` | Canonical Bootstrap DDL | **NO** (Contains `BEGIN; ...`) | Yes (after dot-fix) | DDL / inserts settings | Bootstrap script. Operator approval required. |
| `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` | Migration for `auth_otp_challenge` | **NO** (Already applied) | No (Depends on base DDL) | DDL / migration | Additive migration. Do not re-run. |
| `postgres_sql/self_test.sql` | Self-test assertion functions | **NO** (Creates/drops test rows) | Yes | Yes (in test tx) | Verification test. Operator approval required. |
| `postgres_sql/verify_local_db.sql` | Verification & smoke test | **NO** (Section 9 inserts mock row into `auth_otp`) | No | **YES** | Smoke test with DML. DO NOT RUN on live DB. |
| `seeding/seed_data.sql` | Legacy seed data | **NO** | Only test clone | **YES** | Destructive / demo seed. |
| `seeding/ai_seed_bundle/*.sql` | AI synthetic seed bundle | **NO** | Intended for disposable clone | **YES** | Synthetic fixture suite. Protected by script guards. |
| `scripts/db_preflight_check.py` | Read-only preflight gate | **YES** (Strict `BEGIN READ ONLY;`) | Yes | **NO** | Safe diagnostic tool. |
| `scripts/db_diagnostics/*.sql` | Read-only diagnostic queries | **YES** (Strict `SELECT` only) | Yes | **NO** | Safe diagnostic suite. |
| `scripts/alter_local_db.py` | Local development DB patcher | **NO** (Has safety guard against `volunteer_coordination_db`) | Disposable only | **YES** | Blocked on live DB by code guard. |
| `scripts/seed_integration_fixtures.py` | Integration test seeder | **NO** (Has safety guard against `volunteer_coordination_db`) | Disposable only | **YES** | Blocked on live DB by code guard. |

---

## 4. Object Inventory (Frozen v0.12.0 Live Contract)

### 4.1 Base Tables (31 Total)
- **Domain Tables (23):** `app_settings`, `assignments`, `attendance`, `attendance_geo_attempts`, `audit_logs`, `auth_otp`, `auth_otp_challenge`, `charity_fields`, `coordinator_profiles`, `event_applications`, `event_charity_fields`, `event_coordinator_history`, `event_posts`, `events`, `feedback`, `moderation_actions`, `onboarding_acknowledgments`, `qr_tokens`, `user_charity_interests`, `user_verification_images`, `users`, `volunteer_availability_exceptions`, `volunteer_availability_rules`.
- **Django Framework Tables (8):** `auth_group`, `auth_group_permissions`, `auth_permission`, `authtoken_token`, `django_admin_log`, `django_content_type`, `django_migrations`, `django_session`.

### 4.2 Views (11 Total)
`v_accepted_unassigned`, `v_admin_dashboard`, `v_event_checkin_board`, `v_event_checkin_status`, `v_event_coordinator_history`, `v_event_post_capacity`, `v_event_summary`, `v_geo_attempts_review`, `v_pending_confirmations`, `v_public_events`, `v_user_moderation_summary`.

### 4.3 Key Stored Procedures & Triggers
- `tags_are_normalized(text[])`: Validated clean in live catalog.
- `create_otp_challenge(...)`, `verify_otp_challenge(...)`, `purge_expired_otp_challenges(...)`: Present and active.
- Triggers: 53 triggers present (e.g., `trg_01_attendance_guard`, `trg_01_auth_otp_challenge_guard`, `trg_01_users_guard`, `trg_50_vimg_after`, `trg_95_users_audit`).

---

## 5. Discrepancy Register

| ID | Subject | Severity | Evidence | Remediation Proposal |
|---|---|---|---|---|
| DISC-001 | Canonical SQL Header `v0.5.2` vs Live Contract `v0.12.0` | LOW (Documentation) | Header says `v0.5.2`, body has v0.12.0 tables `auth_otp_challenge` (line 387, 2225, 3167). | Update file header in a reviewed migration commit to reflect `v0.12.0 Unified PostgreSQL Schema`. |
| DISC-002 | Literal Dot Corruption in `tags_are_normalized()` | HIGH (Bootstrap Blocker) | Line 72 of `updated_volunteer_coordination_system_Database.sql` has `AND NOT EXISTS ( ....`. | Remove literal dot corruption in SQL file so that disposable databases can bootstrap without in-memory regex. |
| DISC-003 | `verify_local_db.sql` mutates data | MEDIUM (Operational Safety) | Section 9 contains `INSERT INTO auth_otp` without transaction rollback. | Refactor script to run verification inside `BEGIN ... ROLLBACK;` or mark strictly as a test script. |
