# VCS Prototype Runbook — 2026-11-26

**Purpose:** Repeatable local demonstration of the Volunteer Coordination System with PostgreSQL, Django BFF, React Native, deterministic assistant fallback, recommendations and staffing insights.

**Repository:** ThuraAung-Rayaar/Volunteer_Coordination_System  
**Working branch only:** feature/ai-chat-cache-ml-insights  
**Database contract:** frozen v0.12.0  
**This is a runbook, not a database repair or seeding instruction.**

---

## 1. Safety gate before starting

Open PowerShell in the repository root.

Run:

~~~powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git fetch origin feature/ai-chat-cache-ml-insights
git status --short --branch
~~~

Expected branch:

~~~text
feature/ai-chat-cache-ml-insights
~~~

Stop if the active branch is different. Do not switch to main. Do not run git reset, git clean, git checkout -- ., or any command that discards work.

Check that the working tree is understood before making changes. Preserve existing modifications.

### Database identity

Before starting Django, check that the intended local PostgreSQL service is running.

The documented local target is:

- Host: 127.0.0.1
- Port: 5432
- Database: volunteer_coordination_db
- Engine: PostgreSQL 18.6

Use a password prompt or the local untracked environment file. Do not put a database password in shell history or a command-line argument.

Example read-only identity check:

~~~powershell
psql -X -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), current_setting('server_version'), current_setting('transaction_read_only'); COMMIT;"
~~~

Confirm that the database name, host, port and version are the expected local values before continuing. If the target is remote, production, a different database, or cannot be identified, stop.

### Test database warning

The repository uses a custom Django SQL-file test runner. Running Django tests may create and then drop/recreate the separate database named test_volunteer_coordination_db (unless an explicit test DB name is configured). Before running tests, verify that this test database is disposable and contains no user data or work that must be preserved. Never point Django's TEST.NAME at volunteer_coordination_db. If the expected test database contains valuable data, stop and arrange a new, uniquely named disposable test database through reviewed local test settings before running the suite.

**Never run the following against the existing application database as part of this demo:**

- postgres_sql/VCS_db.sql
- postgres_sql/updated_volunteer_coordination_system_Database.sql
- postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
- postgres_sql/self_test.sql
- postgres_sql/verify_local_db.sql
- seeding scripts or legacy reset scripts
- scripts that create/drop databases or reset sequences

The custom Django test runner may build the isolated test database using VCS_db.sql. That is part of the existing automated test flow; do not manually point it at the real database. Do not change the live schema to make a test pass.

---

## 2. Backend environment

Use the existing Python virtual environment if present. From repository root:

~~~powershell
.\.venv\Scripts\Activate.ps1
python --version
python -m pip --version
~~~

If dependencies are not installed in that environment, use only the repository's existing requirements:

~~~powershell
python -m pip install -r backend\requirements\local.txt
~~~

Do not add dependencies for the demo unless the implementation agent documents and justifies them.

### Backend local environment & DI config

Django settings load [config_di.py](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/config_di.py), which prioritizes `<root>/di_config.local.json` (created via `python scripts/setup_di_config.py`) before falling back to `backend/.env` and root `.env`. Both `di_config.local.json` and `.env` are gitignored; never commit real keys.

For a brand-new laptop/workstation setup from scratch:
1. Check prerequisites: `python scripts\check_system_status.py` (writes `SYSTEM_STATUS.md`).
2. Generate `di_config.local.json`: `.\.venv\Scripts\python.exe scripts\setup_di_config.py --interactive`.
3. Create and seed local DB + `SEEDED_CREDENTIALS.txt`: `.\.venv\Scripts\python.exe postgres_sql\manage_database.py`.
4. Launch Django + Metro + Android AVD/USB (3 terminals): see [NEW_LAPTOP_WINDOWS_SETUP_GUIDE.md](NEW_LAPTOP_WINDOWS_SETUP_GUIDE.md).

Required local DB settings should match the verified local instance:

~~~dotenv
DB_NAME=volunteer_coordination_db
DB_USER=postgres
DB_PASSWORD=SET_LOCALLY_ONLY
DB_HOST=127.0.0.1
DB_PORT=5432
~~~

Do not add this file to Git. The repository .gitignore already ignores .env and .env.local; preserve that rule.

### AI provider modes

#### Default safe mode — deterministic/mock

Use this for the reliable local demo and for any scenario that touches real volunteer/account data:

~~~dotenv
AI_ENABLED=true
AI_PROVIDER=mock
AI_TIMEOUT_SECONDS=10
AI_MAX_OUTPUT_TOKENS=300
AI_RATE_LIMIT_PER_MINUTE=10
~~~

The mock provider must explain real DTO fields supplied by the backend. It must not return invented hardcoded volunteer records or outdated policy text.

#### Gemini Hydrogen sample mode

Gemini is an external provider. Use it only for synthetic, non-sensitive DTOs and a bounded sample request. Do not submit real phone numbers, private volunteer profiles, real application details, verification data, emergency contacts, exact coordinates or sensitive notes.

~~~dotenv
AI_ENABLED=true
AI_PROVIDER=gemini
AI_MODEL=gemini-4-hydrogen
AI_API_KEY=YOUR_LOCAL_SECRET
AI_TIMEOUT_SECONDS=20
AI_MAX_OUTPUT_TOKENS=300
AI_RATE_LIMIT_PER_MINUTE=5
~~~

Keep the real key in the ignored local environment only. Never place it in React Native configuration, an issue, a prompt, source code, a screenshot, logs, or a commit.

Hydrogen is a hosted API model, not the local under-1-GB model. Google currently publishes API pricing of $1.50 per million input tokens and $7.50 per million output tokens. Confirm the active project, access, quota and applicable terms before sending requests. Set a small demonstration budget and stop using the provider if quota or cost is unclear.

For real account-specific prototype screens, switch back to AI_PROVIDER=mock so the explanation is generated locally from the authorised DTO.

#### Optional local model test

If time and hardware permit, use an Ollama host and benchmark Qwen2.5 0.5B:

~~~powershell
ollama pull qwen2.5:0.5b
ollama run qwen2.5:0.5b
~~~

Configure the backend's local environment:

~~~dotenv
AI_ENABLED=true
AI_PROVIDER=ollama
AI_MODEL=qwen2.5:0.5b
AI_OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_OLLAMA_KEEP_ALIVE=5m
AI_TIMEOUT_SECONDS=30
AI_MAX_OUTPUT_TOKENS=300
~~~

This model download is listed at approximately 398 MB by Ollama; actual runtime RAM is higher. Test English and Burmese/မြန်မာ output against the same facts-only fixtures. Do not block the demo on this model, and do not silently fall back to a paid service.

---

## 3. Backend verification and startup

Run the Django system check:

~~~powershell
python backend\manage.py check
~~~

Run the relevant targeted test suites:

~~~powershell
python backend\manage.py test ai.tests bff.coordinator.tests.test_staffing_insight bff.volunteer.tests.test_recommendations --noinput
~~~

Run the full backend suite if time allows:

~~~powershell
python backend\manage.py test --noinput
~~~

Run the mock provider smoke test:

~~~powershell
python backend\manage.py ai_smoke_test --provider=mock
~~~

After the work-order implementation lands, test Gemini with only the synthetic smoke prompt:

~~~powershell
python backend\manage.py ai_smoke_test --provider=gemini --model=gemini-4-hydrogen
~~~

The current smoke-test command must be checked to ensure the model override is passed to the Gemini provider and no secret/prompt/URL is printed. If it fails, record the status and use mock mode.

### Start Django

From repository root:

~~~powershell
python backend\manage.py runserver 127.0.0.1:8000
~~~

Keep this terminal open.

The project root URL may redirect to the admin login. API schema endpoint is:

~~~text
http://127.0.0.1:8000/api/schema/
~~~

The documented assistant endpoints after the work-order implementation should be:

~~~text
GET  http://127.0.0.1:8000/api/v1/assistant/prompts/
POST http://127.0.0.1:8000/api/v1/assistant/chat/
~~~

Both require an authenticated session/token. Do not test protected routes by disabling permissions or hardcoding a user ID.

---

## 4. Mobile setup and startup

Open a second PowerShell terminal.

Check runtime versions:

~~~powershell
node --version
npm --version
adb devices
~~~

The mobile package specifies Node.js 22.11.0 or later.

From repository root:

~~~powershell
cd mobile
~~~

Use the lockfile-consistent install if dependencies are not installed:

~~~powershell
npm ci
~~~

Do not replace the lockfile by running npm install unless a dependency change is approved and necessary.

### Start Metro

~~~powershell
npm start
~~~

Keep Metro open.

### Physical Android device over USB

In a third terminal, from mobile/:

~~~powershell
npm run reverse
npm run android
~~~

The reverse script maps port 8081 for Metro and port 8000 for Django.

The current API host preset for USB development is http://localhost:8000. Confirm that the active API host preset matches the connection mode.

### Android Studio emulator

Use the Android emulator host preset:

~~~text
http://10.0.2.2:8000
~~~

Do not use localhost from the emulator for the host machine's Django server.

### HTTP versus mock data mode

The mobile app's DataMode defaults to mock. The demonstration must intentionally select the mode:

- Mock mode: mobile displays deterministic mock repositories. It does not prove backend/database integration.
- HTTP mode: mobile calls the authenticated Django BFF and PostgreSQL services.

For the real integrated demo, select HTTP mode in the app's existing settings/developer configuration and verify the request reaches Django. Do not treat a successful mock-mode screen as proof of backend integration.

Do not bypass authentication to simplify the demo. Use an authorised test account and the existing login/token flow.

---

## 5. Demo sequence

Use test/demo accounts and synthetic, non-sensitive data wherever possible. Do not show personal phone numbers, verification images, emergency contacts, or other private data on a projector or screenshot.

### A. Volunteer scenario

1. Sign in as an active volunteer test account.
2. Open Assistant.
3. Verify that the catalogue is the volunteer catalogue.
4. Select "What should I do next?"
5. Verify that the response reflects only the authenticated volunteer's current application and assignment records.
6. Select "Find events that fit me."
7. Verify that returned matches originate from recommendation-v1 and explanations use the supplied score/reasons.
8. Ask "How do I check in?" and verify the answer does not promise a universal geofence radius or claim an event has geo check-in enabled unless its data says so.
9. Verify that sources/actions navigate to valid screens.

### B. Approved coordinator scenario

1. Sign in as an approved coordinator with at least one managed demo event.
2. Open Assistant.
3. Verify that coordinator prompts appear.
4. Select "What needs my attention?"
5. Verify that only the coordinator's own event(s) are included.
6. Open staffing insight for a managed event.
7. Compare required headcount, assigned, open slots, accepted-unassigned, pending/waitlisted and coverage against the staffing API response.
8. Open the event detail screen and verify the staffing panel agrees.

### C. Negative permission scenarios

1. Sign in as a pending coordinator; confirm the assistant uses volunteer scope.
2. Attempt to inspect an event managed by another coordinator; confirm the backend returns masked not-found/clarification and no data.
3. Sign in as an ordinary admin; confirm no private volunteer or staffing prompts appear.
4. Try prompt injection in a user message/history; confirm role and data scope do not change.

### D. Provider outage and fallback

1. Set AI_PROVIDER=mock and demonstrate the deterministic answer.
2. Optionally set an invalid/unavailable Gemini/Ollama endpoint in local environment for a controlled outage test.
3. Confirm the backend returns a useful deterministic explanation from the already-built DTO.
4. Confirm sources and suggested actions remain backend-owned.
5. Confirm no raw exception, key, SQL, phone, coordinate or private DTO appears in the response/logs.

### E. Recommendation/staffing checks

- Show at least one positive recommendation and the actual score/reasons.
- Show a candidate excluded by an already-pending/accepted application or availability conflict.
- Show a staffing case with open slots.
- Show accepted-but-unassigned separately from assigned/completed.
- Show a full post with remaining slots on another post if the imbalance signal is demonstrated.
- Explain signals as operational indicators, not confirmed incidents.

If the available dataset cannot safely demonstrate a case, use existing automated synthetic fixtures and show the test result rather than mutating live application data.

---

## 6. Final validation commands

### Backend

From repository root:

~~~powershell
python backend\manage.py check
python backend\manage.py test ai.tests bff.coordinator.tests.test_staffing_insight bff.volunteer.tests.test_recommendations --noinput
python backend\manage.py ai_smoke_test --provider=mock
~~~

### Mobile

From mobile/:

~~~powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
~~~

If the existing real-HTTP test requires a local backend and test account, run it only after those are ready:

~~~powershell
npm run test:real-http -- --runInBand
~~~

Report exact test counts, failures, skipped suites and exit codes. Do not mark unrun commands as passed.

---

## 7. Stop conditions

Stop and report the blocker instead of trying destructive work if:

- the current Git branch is not feature/ai-chat-cache-ml-insights;
- an unexpected user modification could be overwritten;
- the PostgreSQL target is not identified as the intended local database;
- the database needs schema repair or migration;
- the AI provider would receive real sensitive volunteer data without explicit data approval;
- role isolation or resource ownership checks fail;
- a provider key appears in output, logs, a source file or a client bundle;
- the deterministic fallback fails;
- staffing/recommendation metrics do not reconcile with the current domain rules.

Do not fix these by disabling permission checks, triggers, constraints or audit controls.

---

## 8. End-of-demo checklist

- [ ] Branch remains feature/ai-chat-cache-ml-insights.
- [ ] Main branch remains unchanged.
- [ ] No database schema change occurred.
- [ ] No seeding/reset/bootstrap SQL was applied to the existing application DB.
- [ ] Django system check passed.
- [ ] AI/analytics targeted backend tests passed.
- [ ] Mobile tests, TypeScript and lint results recorded.
- [ ] Volunteer and approved coordinator demo scenarios completed.
- [ ] Pending coordinator and cross-coordinator denial demonstrated.
- [ ] Recommendation ranking and staffing metrics reconciled.
- [ ] Mock deterministic fallback demonstrated.
- [ ] Gemini was only tested with a synthetic DTO and API key remained server-side.
- [ ] Screenshots/logs contain no private data or secrets.
- [ ] Final implementation report records exact commands, results, limits and commit SHA.

**Demo readiness:** choose READY FOR PROTOTYPE DEMO, READY WITH LIMITATIONS, or BLOCKED based on observed evidence, not intention.
