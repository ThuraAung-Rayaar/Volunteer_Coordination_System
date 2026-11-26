# Unified PostgreSQL Creation, Structure & Seedlings (`postgres_sql/`)

This directory is the unified source of truth for PostgreSQL 18+ database creation, schema structure, verification, and seed data (`seedlings/`).

## Directory Layout

```text
postgres_sql/
├── manage_database.py                                # Unified Python lifecycle script (creation -> structure -> migrations -> seedlings -> credentials TXT)
├── 00_create_database.sql                            # Creates local database (volunteer_coordination_db)
├── VCS_db.sql                                        # Canonical v0.12.0 schema DDL (23 domain tables, 11 views, functions, triggers)
├── updated_volunteer_coordination_system_Database.sql # Mirror copy of VCS_db.sql for legacy tooling compatibility
├── v0_12_0_auth_otp_challenge_upgrade.sql            # Additive v0.12.0 OTP challenge upgrade (already included in VCS_db.sql)
├── self_test.sql                                     # Database-level self-test suite
├── verify_local_db.sql                               # Read-only inspection + OTP handshake smoke test
├── README.md
└── seedlings/                                        # Unified seed datasets (moved from legacy seeding/)
    ├── README.md
    ├── 01_yangon_demo_seed.sql                       # Core Yangon demo dataset (Super Admin, Admin, Coordinators, Volunteers, Events)
    └── ai_seed_bundle/                               # 500-user / 150-event Myanmar cluster synthetic seed bundle
```

## Unified Python Lifecycle Manager (`manage_database.py`)

Run from the repository root with your local PostgreSQL username and password (`localhost` / `127.0.0.1`):

```powershell
# Full setup (prompts for DB user/password, creates DB, applies VCS_db.sql + Django migrate, seeds, writes SEEDED_CREDENTIALS.txt)
.\.venv\Scripts\python.exe postgres_sql\manage_database.py

# Include the 500-user / 150-event multi-city AI synthetic cohort as well
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --with-ai-cohort --verify-structure

# Modular phases
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --phase create
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --phase structure --verify-structure
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --phase seed
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --phase verify
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --phase export
```

*(Compatibility wrapper: `scripts/setup_local_db.py` delegates directly to `postgres_sql/manage_database.py`.)*
