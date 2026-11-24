# 01 — Repository and Target Audit

- **Date:** 2026-11-24
- **Git Branch:** `feature/ai-chat-cache-ml-insights`
- **Git HEAD SHA:** `f1d021a4f7449b8254b59efabdf75d933963bc14`
- **Base Branch:** `main` (Foundation commit: `031a7ad0fe5612f26fcea0f1ed52f4ccc7cf3e2c`)
- **Working Tree State:** Clean (Untracked work order document `docs/VCS_AI_UNIFIED_HANDOFF.md`)

## Database Settings (Redacted)
- **Engine:** `django.db.backends.postgresql`
- **Database Name:** `volunteer_coordination_db`
- **Host:** `127.0.0.1` (Strict loopback)
- **Port:** `5432`
- **User:** `postgres`
- **Credentials:** Redacted (Managed via untracked local `.env`)

## SQL Script Inventory & Classification
1. `postgres_sql/updated_volunteer_coordination_system_Database.sql` — Canonical bootstrap DDL (v0.12.0 content with stale v0.5.2 header; syntax blocked by line 72 dots). DO NOT run on live DB.
2. `postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql` — Migration script for OTP challenge. Already applied in live DB.
3. `postgres_sql/self_test.sql` — Test validation functions. DO NOT run on live DB.
4. `postgres_sql/verify_local_db.sql` — Verification script containing DML smoke test in Section 9. DO NOT run on live DB.
5. `seeding/seed_data.sql` — Legacy seed data. Prohibited on live DB.
6. `seeding/ai_seed_bundle/*.sql` — AI synthetic test bundle. Guarded for disposable DBs only.
7. `scripts/db_preflight_check.py` — Read-only preflight checker (`BEGIN READ ONLY;`). Safe.
8. `scripts/db_diagnostics/` — Read-only diagnostic suite. Safe.
