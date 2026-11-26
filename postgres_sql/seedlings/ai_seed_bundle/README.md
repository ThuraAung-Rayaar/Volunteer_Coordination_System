# AI Seed Bundle (Synthetic Test Cohort)

**Target database contract:** v0.12.0 frozen PostgreSQL schema  
**Specification:** `reference/AI_CHAT_MEMORY_AND_SYNTHETIC_SEED_DATA_PLAN.md`

## 1. Overview

This bundle generates and seeds:
- **500 synthetic user accounts** (450 volunteers, 20 pending coordinator applicants, 30 approved coordinators; 0 synthetic admins).
- **150 synthetic events** distributed equally across 5 clusters:
  - Yangon (30), Mandalay (30), Pyay (30), Bago (30), Magway (30).
  - Lifecycle: 90 completed, 15 cancelled, 10 active, 30 published (through 2027-03-31), 5 draft.
- Related workflow records created through existing database triggers and functions (posts, applications, assignments, attendance, feedback, coordinator history).

## 2. Phone Number & Cryptographic Specifications

- Canonical initial: `+959`
- Subscriber length distribution:
  - **7 digits:** starts with `50`-`55` (83 users)
  - **8 digits:** starts with `81`-`89` (83 users)
  - **9 digits:** starts with `40`-`49`, `61`-`68`, `90`-`99` (334 users, 2/3 of 500)
- Hashes and encryption generated via backend functions (`compute_phone_hash` HMAC-SHA256 and `encrypt_phone` Fernet).
- No raw phone numbers or secret keys are stored in Git-tracked files.
- Local mapping manifest is saved at `.local/ai_seed_manifest.json` (ignored by Git).

## 3. Operator Execution Instructions

### Step 1: Create a verified backup copy of the original database
```bash
pg_dump -h 127.0.0.1 -p 5432 -U postgres -Fc -d volunteer_coordination_db -f pre_ai_seed_backup_20261124.dump

# (Optional standby copy)
createdb -h 127.0.0.1 -p 5432 -U postgres volunteer_coordination_db_backup
pg_restore -h 127.0.0.1 -p 5432 -U postgres --no-owner --no-privileges -d volunteer_coordination_db_backup pre_ai_seed_backup_20261124.dump
```

### Step 2: Run the master seed script on localhost
```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql/seedlings/ai_seed_bundle/run_all.sql
```

### Step 3: Verify the Acceptance Gates
The final validation script `09_validation_report.sql` automatically runs all 16 acceptance gates.
