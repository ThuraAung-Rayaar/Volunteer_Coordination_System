# Unified Database Seedlings (`postgres_sql/seedlings/`)

All database seedlings live here (consolidated from the legacy root `seeding/` folder) and are orchestrated by [postgres_sql/manage_database.py](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/postgres_sql/manage_database.py).

## Seedling Catalog

1. **`01_yangon_demo_seed.sql`**
   - Seeds **42 accounts** across all four roles:
     - **1 Super Admin** (`+959100000001` — `is_superuser=TRUE`, `is_admin=TRUE`, `is_staff=TRUE`)
     - **1 Operations Admin** (`+959100000002` — `is_admin=TRUE`, `is_staff=TRUE`)
     - **5 Approved Coordinators** (`+959100000011` – `+959100000015`)
     - **3 Pending Coordinator Applicants** (`+959100000021` – `+959100000023`)
     - **32 Volunteers** (`+959100000024` – `+959100000055`) covering verified, pending verification, rejected verification, blood donors, warned, and blocked states
   - Seeds **10 Yangon events** (published, active, completed, draft, cancelled), **20 posts**, **25 applications**, **23 assignments & attendance rows**, **2 geo attempts**, **8 feedback rows**, **5 moderation actions**, and **QR tokens**.
   - When run through `postgres_sql/manage_database.py`, `phone_hash` (HMAC-SHA256), `phone_enc` (Fernet), and PBKDF2 admin passwords are dynamically computed using your active `di_config.local.json` secrets, and rich credentials are exported to `SEEDED_CREDENTIALS.txt` at the repository root.

2. **`ai_seed_bundle/` (500-User / 150-Event Multi-City Synthetic Cohort)**
   - Contains `generate_seed_bundle.py`, `run_all.sql`, and SQL phases `00_preflight.sql` through `09_validation_report.sql` covering `Yangon`, `Mandalay`, `Pyay`, `Bago`, and `Magway`.
   - Pass `--with-ai-cohort` to `postgres_sql/manage_database.py` (or accept the interactive prompt) to regenerate with your active DI keys and seed automatically after `01_yangon_demo_seed.sql`.
