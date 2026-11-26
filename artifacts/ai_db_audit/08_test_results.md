# 08 — Test Results and Execution Evidence

- **Execution Environment:** Windows 10/11, Python 3.12.4, PostgreSQL 18.6
- **Target Databases:**
  - Live Read-Only Audit Target: `volunteer_coordination_db` (Zero DDL/DML, strictly `BEGIN READ ONLY;`)
  - Integration/Unit Test Target: `test_volunteer_coordination_db` (Ephemeral / Isolated)
  - Phase D Bootstrap Target: `vcs_schema_bootstrap_audit_20261124` (Ephemeral / Dropped cleanly)

## 1. Automated Test Suite Execution (58 Passed, 0 Failed, 0 Skipped)
- **Execution Command:**
  ```powershell
  .\.venv\Scripts\python.exe backend\manage.py test ai.tests bff.coordinator.tests.test_staffing_insight bff.volunteer.tests.test_recommendations tests.test_script_safety_guards --noinput
  ```
- **Execution Output:**
  ```text
  Creating test database for alias 'default'...
  Found 58 test(s).
  System check identified no issues (0 silenced).
  Ran 58 tests in 1.635s

  OK
  Destroying test database for alias 'default'...
  ```
- **Test Suite Breakdown:**
  1. `ai.tests.test_assistant_chat`: 8 passed (Chat endpoint, prompt guard, bounded history, read-only guarantees)
  2. `ai.tests.test_gemini_provider`: 8 passed (Tool call structure, missing key fail-closed, key absence in URLs, HTTP 429/500/timeout/malformed payload masking)
  3. `ai.tests.test_ollama_provider`: 4 passed (Ollama chat format, native endpoint, tool call translation)
  4. `ai.tests.test_role_prompts`: 13 passed (Role prompt templates, version IDs `vcs.*.v1`, scope determination, volunteer/coordinator/admin/super_admin boundaries)
  5. `ai.tests.test_ai_readiness_integration`: 6 passed (Pending coordinator restriction, cross-coordinator isolation, ordinary admin isolation, volunteer data segregation, deterministic recommendation ranking)
  6. `bff.coordinator.tests.test_staffing_insight`: 9 passed (Coordinator authorization, 404 masking, completed assignments unassigned exclusion, full post coverage imbalance signal)
  7. `bff.volunteer.tests.test_recommendations`: 2 passed (Deterministic ranking, hard eligibility, availability fit)
  8. `tests.test_script_safety_guards`: 8 passed (Seeder and alter-script refusal against protected databases)

## 2. Django System Check (`manage.py check`)
- **Command:** `.\.venv\Scripts\python.exe backend\manage.py check`
- **Output:** `System check identified no issues (0 silenced).` (Exit code: 0)

## 3. Database Preflight Check (`db_preflight_check.py`)
- **Command:** `.\.venv\Scripts\python.exe scripts\db_preflight_check.py`
- **Result:** `[PREFLIGHT RESULT] Gate Decision: PASS` (Branch A — PASS)
- **Artifact:** `artifacts/v0_12_0_db_preflight_f1d021a.md`

## 4. Phase D Disposable Bootstrap Comparison
- **Command:** `.\.venv\Scripts\python.exe scripts\execute_phase_d_comparison.py`
- **Result:** Exit Code `0`.
  - Disposable database `vcs_schema_bootstrap_audit_20261124` created and dropped cleanly.
  - Domain tables: 23/23 match (100%).
  - Views: 11/11 match (100%).
  - Triggers & Functions: 100% match.
  - Live DB `volunteer_coordination_db` zero modifications.

## 5. AI Provider Smoke-Test Management Command

### Mock Provider:
- **Command:** `.\.venv\Scripts\python.exe backend\manage.py ai_smoke_test --provider=mock`
- **Result:**
  ```text
  Provider: mock
  Model:    default
  Status:   SUCCESS (200 OK)
  Latency:  0.0 ms
  Prompt Tokens:     80
  Completion Tokens: 45
  ```

### Live Gemini REST Adapter:
- **Command:** `.\.venv\Scripts\python.exe backend\manage.py ai_smoke_test --provider=gemini`
- **Result:**
  ```text
  Provider: gemini
  Model:    gemini-3.5-flash-lite
  Status:   SUCCESS (200 OK)
  Latency:  953.0 ms
  Prompt Tokens:     6
  Completion Tokens: 1
  ```
