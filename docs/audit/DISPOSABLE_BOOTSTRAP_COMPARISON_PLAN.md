# VCS AI — Disposable Bootstrap Comparison Plan (Task DB-03)

**Target Scenario:** Phase D (Disposable Database Bootstrap & Schema Catalog Comparison)  
**Safety Status:** Operator-initiated only. Never run against `volunteer_coordination_db`.

---

## 1. Safety Invariants & Guardrails

1. **Unique Explicit Database Name:**
   The comparison test must only be run on a newly created, disposable database name (e.g., `vcs_schema_bootstrap_audit_20261124`). The runner script must reject any execution where the target database is `volunteer_coordination_db`, `test_volunteer_coordination_db`, or any production name.
2. **Mandatory Confirmation Gate:**
   An operator must explicitly confirm creation and bootstrap before any DDL executes.
3. **Known Blockers Before Execution:**
   - **Blocker 1 (Syntax Error):** Line 72 of `postgres_sql/updated_volunteer_coordination_system_Database.sql` contains the literal-dot sequence inside `tags_are_normalized()`. Direct `psql -f` will abort unless line 72 is corrected.
   - **Blocker 2 (Stale Header):** Header line 2 states `v0.5.2`, but content is v0.12.0.

---

## 2. Step-by-Step Operator Commands

### Step 1: Create the Disposable Database
```powershell
# Set PostgreSQL environment
$env:PGHOST     = "127.0.0.1"
$env:PGPORT     = "5432"
$env:PGUSER     = "postgres"
$env:PGPASSWORD = "postgres"

$disposableDb = "vcs_schema_bootstrap_audit_20261124"

# 1. Create empty disposable DB
createdb -h 127.0.0.1 -p 5432 -U postgres $disposableDb
```

### Step 2: Test Canonical Bootstrap Execution
```powershell
# Run canonical SQL (after line 72 syntax fix is reviewed and applied)
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d $disposableDb `
     -f postgres_sql/updated_volunteer_coordination_system_Database.sql

# Run additive OTP challenge upgrade if not already embedded
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d $disposableDb `
     -f postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
```

### Step 3: Extract Schema-Only Dumps for Comparison
```powershell
# Live schema dump
pg_dump --schema-only --no-owner --no-privileges `
  -h 127.0.0.1 -p 5432 -U postgres `
  --dbname volunteer_coordination_db `
  --file artifacts/live_schema.sql

# Bootstrap schema dump
pg_dump --schema-only --no-owner --no-privileges `
  -h 127.0.0.1 -p 5432 -U postgres `
  --dbname $disposableDb `
  --file artifacts/bootstrap_schema.sql
```

### Step 4: Catalog Diff Analysis
```powershell
# Diff the two schema files
git diff --no-index artifacts/live_schema.sql artifacts/bootstrap_schema.sql > artifacts/schema_diff.patch
```

### Step 5: Clean Up Disposable Database
```powershell
# ONLY drop the disposable database
dropdb -h 127.0.0.1 -p 5432 -U postgres $disposableDb

Remove-Item Env:PGPASSWORD
```
