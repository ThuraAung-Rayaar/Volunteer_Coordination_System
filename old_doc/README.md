# Historical Archive Summary (`old_doc/`)

> **Consolidated:** 2026-11-25  
> **Current Authoritative Docs:** [docs/README.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/README.md)

This file summarizes the key decisions, verified milestones, technical constraints, and remaining operational items from all prior project logs, handoff work orders, stabilization reports, and prompt dumps (v0.1.0 through v0.12.2 and the AI/ML transition). All raw intermediate logs, code dumps, and superseded plans have been removed.

---

## 1. Project Evolution Timeline (Superseded by `docs/`)

| Era / Milestone | What Was Delivered | Authoritative Current Doc |
|---|---|---|
| **Database-First Core & Triggers** | PostgreSQL 18.6 schema (`31` base tables, `uuidv7()`, `btree_gist` exclusion constraints, triggers & views) frozen as immutable contract. | [full_database_details.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/full_database_details.md) |
| **Backend & BFF (v0.11.x)** | Django 5.1 / DRF 3.15 BFF with 82 role capabilities (43 volunteer + 39 coordinator), Admin Portal UI, and self-hosted map tile engine (`map_engine.py`). | [backend_analysis.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/backend_analysis.md) |
| **v0.12.0 Stabilization (Phases 0–E)** | Tokenized OTP login (`auth_session_token`, 180s TTL), `OtpDeliveryAdapter` post-commit dispatch, AES-256-GCM verification image encryption (`VIMG\x01`), cross-event assignment validation, removal of fabricated mobile fallbacks, CI workflow (`.github/workflows/v0_12_0_integration.yml`). **Verified:** 662 backend tests, 588 mobile tests, 0 TS errors, 14/14 real-HTTP E2E scenarios, clean Gradle build. | [tokenization_login_architecture.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/tokenization_login_architecture.md) |
| **v0.12.2 Mobile & Hardware Stabilization** | Physical Samsung Galaxy (`RFCR71P2BKE`) verification via `adb reverse tcp:8000/8081`, `VolunteerDynamicIsland` & `CoordinatorDynamicIsland`, permanent drawer menu (`AppHeader`), front-camera verification selfie enforcement, multi-event card picker, ended-event filtering. **Verified:** 39 Jest suites / 621 tests, 662 backend tests, 0 TS errors. | [mobile_analysis.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/mobile_analysis.md) |
| **AI, ML & QueryCache Integration** | Read-only role-scoped AI Assistant (`Mock`/`Ollama`/`Gemini` with `thought_signature` support, `vcs.*.v1` prompts, PII redaction), `recommendation-v1`, `staffing_insight_service.py`, `AssistantScreen`, bounded LRU `QueryCache`, and canonical `postgres_sql/VCS_db.sql` audit. **Verified:** 58 AI/DB/analytics tests + live Gemini 200 OK smoke test. | [ai_ml_integration.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/ai_ml_integration.md) & [FINAL_VCS_AI_HANDOFF_REPORT.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/audit/FINAL_VCS_AI_HANDOFF_REPORT.md) |

---

## 2. Key Technical Constraints & Resolved Pitfalls

1. **Frozen Database Policy:** Never run `makemigrations`/`migrate` against `volunteer_coordination_db`. All tests and seeders must target disposable `test_volunteer_coordination_db` (enforced by `scripts/db_preflight_check.py` and `tests/test_script_safety_guards`).
2. **Windows SQLite File Locking (`WinError 32`):** In `backend/common/map_engine.py` and map export tests, `with sqlite3.connect(...)` only manages transactions, not file descriptors—always call `conn.close()` in `try ... finally` before `os.replace()` or temp directory cleanup.
3. **Android Front-Camera Verification:** `VerificationCoordinatorStatusScreen.tsx` disables gallery selection and `react-native-image-picker` enforces front-facing camera extras (`CAMERA_FACING: 1`, `USE_FRONT_CAMERA: true`, `LENS_FACING: 1`).
4. **Physical Device USB Networking:** Use `adb reverse tcp:8000 tcp:8000` and `adb reverse tcp:8081 tcp:8081` with the `usb` host preset (`127.0.0.1:8000`).
5. **Environmental Boundaries (Windows Host):** iOS native builds (`xcodebuild`, `pod install`, `XCTest`) require macOS; physical GNSS/optical sensor testing requires real handsets.

---

## 3. Remaining Operational & Production Rollout Tasks (from v0.12.0 Ledger)

All software and automated test tasks are complete. The following **external/infrastructure** tasks remain for production deployment:

1. **Remote GitHub Actions Run:** Push candidate branch to GitHub to run `.github/workflows/v0_12_0_integration.yml` on remote PostgreSQL 18.x runners.
2. **Production SMS Carrier Provisioning:** Configure live SMS gateway credentials (`SMS_DELIVERY_BACKEND`, `SMS_PROVIDER_ENDPOINT`, `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID`) and outbound HTTPS (443) egress.
3. **Physical Device Keystore/Keychain QA:** Verify token persistence across force-kill and reboot on physical Android (Keystore) and iOS (Keychain) devices.
4. **Live Verification Image Encryption Runbook:** Back up `backend/private_media/verification_images/`, inject `IMAGE_ENCRYPTION_KEY_PRIMARY_ID` and `IMAGE_ENCRYPTION_KEYS` from vault/KMS, and run `python backend/manage.py encrypt_verification_images`.
