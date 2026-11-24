# 04 — Application Compatibility and Preflight

## 1. Database Preflight Execution (`scripts/db_preflight_check.py`)
- **Command:** `python scripts/db_preflight_check.py`
- **Gate Decision:** `PASS` (Branch A — PASS)
- **Artifact Generated:** `artifacts/v0_12_0_db_preflight_f1d021a.md`
- **Key Checks:**
  - PostgreSQL 18.6: PASS
  - `uuidv7()` Resolution: PASS
  - 31 Public Base Tables: PASS
  - Required Stored Procedures: PASS
  - Required Triggers: PASS
  - Required Coordinator Views: PASS
  - Data Integrity Anomalies: 0

## 2. Django System Check (`backend/manage.py check`)
- **Command:** `python backend/manage.py check`
- **Output:** `System check identified no issues (0 silenced).`
- **Exit Code:** `0`

## 3. Core Feature Test Suite
- **Command:** `python backend/manage.py test bff.coordinator.tests.test_staffing_insight bff.volunteer.tests.test_recommendations ai.tests --noinput`
- **Output:** `Ran 22 tests in 0.662s — OK`
- **Exit Code:** `0`
