# Volunteer Coordination System v0.6.0
# Backend Audit & Gap Remediation Plan

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch reviewed:** `main`  
**Snapshot reviewed:** commit `318d0d10eef8b8bf47baed0bacb2cdfc4f1c12f9` (2026-11-05)  
**Database policy:** PostgreSQL prototype is frozen. No SQL file, SQL object, schema, trigger, function, constraint, or view may be modified as part of this remediation plan.  
**Purpose:** Stabilize the already-implemented backend, correct verified gaps, improve repeatable demos and deployment readiness, and guide Qwen Coder through small, auditable changes.

---

## 1. Executive assessment

The backend is a substantial Django + Django REST Framework + PostgreSQL implementation. The eight functional phases have been developed through an iterative prompt → implementation → review → test → completion-report workflow. The core layered architecture is coherent:

```text
BFF / API + Admin Portal
          |
          v
Common infrastructure
(auth, permissions, DB context, privacy, security, errors, transactions)
          |
          v
Django services layer
          |
          v
Django ORM models / read-view models
          |
          v
Frozen PostgreSQL prototype
(functions, triggers, constraints, views, tables)
```

The strongest architectural decision is the database-first contract: Django coordinates workflows, while PostgreSQL remains authoritative for existing database-enforced state transitions, constraints, capacity and assignment logic, and trigger-based auditing. The audit does **not** recommend rewriting the services layer or changing the SQL prototype.

The main remaining work is last-mile stabilization:

1. Repository privacy and dependency hygiene.
2. Real OTP delivery and authentication/session hardening.
3. Production settings, deployment, routing, and API documentation.
4. A functional data-backed admin portal and repeatable demo setup.
5. Maintenance scheduling, health checks, CI, observability, and backup procedures.
6. Stronger end-to-end tests that exercise the actual user-facing workflows rather than simulating some steps with direct ORM updates.

**Current readiness assessment:** backend feature coverage is broad; the project is not yet ready for an externally accessible demo or production deployment.

## 2. Audit scope and evidence

This review used the current repository snapshot and the files below:

- `prompt code/prompt_log/` — the eight original phase execution histories.
- `prompt code/prompt_result_analysis/` — 24 phase artifacts: one implementation review, one test analysis, and one completion report for each of P1–P8.
- `prompt code/result_analysis_log/` — implementation, testing, and completion logs, including empty placeholders and a duplicated/misspelled Phase 6 file.
- `prompt code/dev/master_plan.md`, `prompt code/ref_code/`, and `prompt code/spec/` — implementation guardrails and reference material.
- Current backend source, settings, requirements, Docker files, URL configuration, tests, templates, and repository inventory.
- User-provided `BACKEND_ANALYSIS.md` (Qwen analysis), compared against current source rather than accepted without verification.

### Evidence limitations

- I inspected the GitHub source and the recorded test outputs; I did not clone and execute the repository in this review. Therefore the test totals below are **reported results**, not independently reproduced runs.
- A passing test report does not prove production deployment readiness or prove that every UI/mobile workflow has been manually exercised.
- The contents of the committed verification-image files were not visually inspected. Their filenames and location make them potentially sensitive; they must be treated as exposed until confirmed synthetic.
- No SQL changes were made during this audit.

## 3. What the phase history actually shows

### 3.1 `prompt_log/`

The eight prompt logs show a consistent development approach: inspect the reference code and actual SQL objects, implement a phase in small groups of files, run Django/database tests, correct failures, and write a completion report. They also preserve interruptions and failed attempts, which is useful evidence of the implementation process.

The prompt logs' Phase 8 report gives an earlier cumulative suite result of **272 tests**. This was not the final test count in the later analysis trail.

### 3.2 `prompt_result_analysis/`

There are 24 artifacts, three for each phase:

- `phaseN_implementation_review.md`
- `phaseN_test_analysis.md`
- `phaseN_completion_report.md`

The important chronology is that several implementation reviews identify defects **before** subsequent corrections. The completion/test reports then describe the fixes and report the phase as complete. The earlier review documents were generally retained as historical evidence rather than edited to remove superseded findings.

### 3.3 `result_analysis_log/`

The later result log gives this reported cumulative test progression:

| Stage | Reported full-suite tests | Reported result |
|---|---:|---|
| P1 follow-up test log | 81 | Pass |
| P2 test analysis | 328 | Pass |
| P3 test analysis | 369 | Pass |
| P4 completion log | 430 | Pass |
| P5 testing/completion logs | 483 | Pass |
| P6 completion/testing logs | 549 | Pass |
| P7 testing log | 586 | Pass |
| P8 testing/completion logs | 619 | Pass |

The latest recorded result is **619 passed, 0 failed, 0 errors, 0 skipped**. The Qwen analysis also states 619. This is the strongest reported test result in the files reviewed, but must still be reproduced on a clean local environment and preferably in CI before relying on it.

The log directory is not a complete archival record: Phase 2's implementation/testing/completion text files are empty; Phase 4's test log is empty; Phase 7's completion-report text file is empty; and `log phasse 6 implementation report.txt` appears to be a duplicate/misspelled Phase 6 artifact. The Markdown phase analysis directory is more complete than the result log directory.

## 4. Phase-by-phase findings reconciliation

This section distinguishes historical findings from defects confirmed in the current source.

### P1 — Common infrastructure and security context

**Historical review:** The Phase 1 review listed two critical and three high findings, including empty-IP audit insertion, Python UUIDv4 overriding PostgreSQL UUIDv7, PostgreSQL context leakage in errors, non-canonical constraint codes, and missing security settings.

**Current-source reconciliation:** Several were corrected in the current source:

- `Users.uuid` uses a database-side `uuidv7()` default (`db_default=RawSQL('uuidv7()', [])`).
- `log_security_event()` converts an empty/unresolved IP to `None` before inserting into the `INET` field.
- `translate_db_exception()` parses the first error line, avoiding the appended PostgreSQL `CONTEXT:` text in the client message.
- Constraint exceptions map to domain-level codes such as `duplicate_application` and `schedule_conflict`.
- `AllowListSerializerMixin` rejects unexpected and read-only fields.
- Phone/tag normalization uses the project's `ValidationError`.
- Verification-image dimension checks, UUID path validation, and upload-size checks exist.

**Still confirmed:** `backend/config/settings/base.py` contains development fallback values for `SECRET_KEY`, `PHONE_HASH_HMAC_SECRET`, and `PHONE_ENCRYPTION_KEY`. Production settings do not fail fast when these values are absent or unsafe.

**Remediation:** P1 security configuration hardening remains open; do not re-implement already-corrected Phase 1 logic without a new failing test.

### P2 — Public browsing and read services

**Historical review:** The P2 review flagged a missing charity-field endpoint, missing T2 fields on event detail, and `authentication_classes=[]` preventing optional authentication on public endpoints.

**Current-source reconciliation:** These findings appear corrected in the current source:

- `CharityFieldsListView` and the `charity-fields/` route exist.
- Public API views use `permission_classes = [AllowAny]` without disabling the configured authentication classes, allowing anonymous requests while still recognizing an authenticated caller.
- `PublicEventDetailView` uses `get_visible_event_or_404()` and gates `onboarding_text`, `onboarding_version`, and `compensation_note` through `can_access_event_t2()`.

**Remediation:** Treat the old P2 findings as resolved unless a current test reproduces them. Preserve anonymous browsing and verify authenticated draft/participant access with API tests.

### P3 — OTP auth, profiles, availability, UUID lookup

**Historical review:** The P3 review flagged missing public UUID lookup, OTP hourly-rate-limit test coverage, failed-OTP attempt counter behavior inside outer transactions, and stale OTP-service code.

**Current-source reconciliation:**

- `profile_service.lookup_user_by_uuid()` exists.
- `UserByUuidView` and `users/by-uuid/<uuid:uuid>/` route exist.
- `otp_service.py` is now a compatibility shim re-exporting `auth_service` rather than the earlier dead implementation.

**Still worth verifying:** There is an explicit database OTP rate limit in the prototype, but the historical review requested a direct test of the hourly request limit. Verify that a current test exercises the actual sixth request and expects the intended 429 result. Also verify invalid-attempt counter persistence in the actual request transaction shape used by the BFF.

### P4 — Verification and coordinator lifecycle

**Historical review:** The P4 review reported no critical/high defects but identified test gaps around verification-status recomputation, image superseding, coordinator reactivation, and some transaction/file-streaming robustness.

**Current-source reconciliation:** The current source has private-path resolution, upload-size/dimension checks, `FileResponse` streaming, and the later test analysis reports expanded verification/coordinator tests. The current code uses a private image root and the volunteer serializer does not expose the internal path.

**Still confirmed:** Private verification images are committed in the public repository (see P0 below). Private application storage is not sufficient if test or development images are accidentally committed to source control.

### P5 — Event lifecycle, posts, handover

**Historical review:** P5 implementation review reported no critical/high findings; it recommended transactional wrappers, charity-code deduplication, and stronger tests for publish-time gates/cascade behavior.

**Current-source reconciliation:** Event and post mutators are now wrapped with `transaction.atomic`; `_replace_charity_fields()` deduplicates codes before insertion. Current service functions delegate coordinator handover to the existing SQL function and read capacity from the SQL view.

**Still worth verifying:** Expand integration assertions for the side effects/cascades of event completion and cancellation. Tests should check related application, assignment, attendance, and QR-token state—not only the event's status.

### P6 — Applications and assignments

**Historical review:** The earlier P6 review found missing transaction boundaries and a missing coordinator invite flow. It also noted missing route aliases and insufficiently layered tests.

**Current-source reconciliation:** The present source includes `invite_volunteer_to_event()`, and mutating application/assignment methods are transaction-decorated. Unit, service, trigger, and BFF test modules now exist. The later Phase 6 test reports 94 dedicated tests and 549 full-suite tests.

**Remediation:** Historical P6 high findings should not be re-opened without a failing current test. Keep explicit coverage for invite target identity, authorization, duplicate applications, schedule overlap, capacity concurrency, and assignment idempotency.

### P7 — Onboarding, QR, attendance, geolocation

**Historical review:** The P7 review raised critical/high concerns about `select_for_update()` outside a transaction, QR join-token consumption not being atomic with application creation, transaction-local database context, and missing direct database tests.

**Current-source reconciliation:** The current source wraps `manual_check_in()`, `redeem_qr_token()`, and other mutating operations with `transaction.atomic`; attendance manual check-in uses `select_for_update()` inside the transaction. The later completion/test materials describe direct trigger tests and an expanded attendance suite.

**Still worth verifying:** Ensure the QR `join_event` branch is covered by a test that proves the token is not consumed if application creation fails. Ensure check-in methods restore the previous transaction context reliably on both success and exception paths.

### P8 — Feedback, moderation, audit, maintenance, reporting

**Historical review:** The P8 implementation review reported missing transaction decorators on moderation/feedback, OpenAPI generation warnings, missing E2E tests, and missing admin serializer allow-list mixins.

**Current-source reconciliation:** These specific historical defects appear corrected:

- `record_moderation_action()` and `submit_event_feedback()` are transaction-decorated.
- `backend/tests_e2e/test_e2e_lifecycle.py` exists.
- Admin portal serializers inherit `AllowListSerializerMixin`.
- `common/schema.py` implements custom schema handling; the later P8 test/completion logs report `spectacular --fail-on-warn` passing with zero warnings.

**Important test-quality qualification:** The 25-step E2E test is useful, but several steps are not truly exercised through their advertised end-user workflows. It creates a QR token but does not redeem it; the step labelled manual check-in reads the attendance already created by geolocation rather than invoking the manual check-in service; and it directly updates event/attendance statuses through the ORM. Therefore it should be considered a broad lifecycle smoke test, not complete proof of all 25 workflows.

## 5. Reconciliation of the Qwen `BACKEND_ANALYSIS.md`

The Qwen report is a useful operational checklist, but some of its findings describe an earlier snapshot. Use it as a hypothesis list, not an authoritative patch list.

### Qwen findings verified in the current source

| Finding | Assessment |
|---|---|
| OTP is not sent through a real provider | Confirmed: `ConsoleOtpDeliveryAdapter` reports `delivered: false` and no provider configured. |
| No Swagger/ReDoc routes | Confirmed: API URLs do not mount the drf-spectacular schema/docs views. |
| No seed/demo management command | Confirmed in repository inventory. |
| Hardcoded/fallback secrets | Confirmed in base settings. |
| CORS allows all origins | Confirmed: `CORS_ALLOW_ALL_ORIGINS = True`. |
| No DRF throttling configuration | Confirmed; database OTP limits do not replace HTTP throttling for the whole API. |
| Token lifecycle has no expiry/rotation policy | Confirmed: DRF tokens are retrieved/created with `get_or_create`; the `purge_expired_tokens()` helper deletes OTP rows, not stale DRF tokens. |
| Production settings are incomplete | Confirmed: production settings only set `DEBUG = False`. |
| Docker uses Django `runserver` and local requirements | Confirmed. |
| Maintenance has no scheduler; aggregate-refresh helper is a no-op | Confirmed. |
| Duplicate URL aliases | Confirmed: the BFF is mounted under `/api/v1/`, `/api/`, and `/api/bff/mobile/`, with duplicate route inclusions. |
| No root README or GitHub Actions workflow | Confirmed in the repository root inventory. |

### Qwen findings not supported by current source (stale or inaccurate)

| Qwen finding | Current-source evidence |
|---|---|
| UUIDv4 overrides UUIDv7 | Current model uses PostgreSQL `uuidv7()` through `db_default`. |
| Missing-IP security logging breaks `INET` insert | Current `log_security_event()` passes `None` for an empty/unresolved IP. |
| PostgreSQL call stack leaks from error translation | Current translator uses the first error line. |
| Constraint names are exposed as public error codes | Current constraint map uses canonical domain codes. |
| Serializer mixin does not reject read-only fields | Current mixin explicitly rejects input to read-only fields. |
| Admin serializers lack allow-list mixins | Current admin portal serializers import and use `AllowListSerializerMixin`. |
| UUID lookup endpoint missing | Current service, view, and URL route exist. |
| P2 charity-fields endpoint and T2 event-detail gate missing | Both are present in current source. |
| Admin templates do not exist | Templates exist, but are static placeholders rather than a data-backed admin UI. |
| Verification images have no admin serving path | A protected admin-gated image-streaming endpoint exists; direct public media serving is intentionally not exposed. |

### Additional finding confirmed by this audit: private files committed to the public repository

The current repository contains 29 files under `backend/private_media/verification_images/`: 14 files named `id_license_*`, 14 files named `mock_selfie_*`, and one flower example. The repeated blob hashes suggest that many files may be duplicated fixtures, but the image content was not inspected. Treat the ID/selfie files as potentially sensitive until proven synthetic.

**Required action:** inspect the assets, remove any real-person/identity material from the repository, add `private_media/` to `.gitignore`, keep only synthetic fixtures in a dedicated test-fixture directory, and assess whether Git history must be rewritten. If genuine identity data was ever committed, treat it as exposed and follow the appropriate incident/notification process. Do not assume deleting a file from the latest commit removes it from public Git history.

## 6. Current gap register and remediation priorities

### P0 — Resolve before sharing a public demo

| ID | Gap | Why it matters | Recommended action |
|---|---|---|---|
| P0-01 | Potentially sensitive verification images committed under `backend/private_media/` | A private application folder becomes public when committed to a public repository. | Inspect assets; purge genuine data from current tree/history; add `private_media/` to `.gitignore`; retain only generated synthetic fixtures. |
| P0-02 | Missing declared Python dependencies | `django_filters` is installed in settings but `django-filter` is absent from requirements; `cryptography.fernet` is imported but `cryptography` is not declared. | Add explicit compatible dependencies to `backend/requirements/base.txt`; create a clean environment and install from declared requirements; run checks/tests. |
| P0-03 | OTP does not reach real users | The console adapter does not send SMS; successful responses can say `sent` even though `delivered` is false. | Implement a provider adapter with environment-based selection, honest delivery status, safe failure handling, and tests with a fake provider. Keep console adapter only for local development. |
| P0-04 | Admin HTML views are not access-controlled and templates are placeholders | The page views render without an explicit admin guard; the dashboard template contains hardcoded sample counts. | Add admin/super-admin page guards; populate page context from existing services/views; do not duplicate database calculations. |

### P1 — Complete before external/public prototype exposure

| ID | Gap | Recommended action |
|---|---|---|
| P1-01 | Unsafe secret fallbacks | Require strong `DJANGO_SECRET_KEY`, `PHONE_HASH_HMAC_SECRET`, and `PHONE_ENCRYPTION_KEY` in non-debug settings. Raise `ImproperlyConfigured` when absent/weak/default. Keep development values isolated to explicit local settings. |
| P1-02 | CORS is globally permissive | Replace `CORS_ALLOW_ALL_ORIGINS` with environment-driven trusted origins. |
| P1-03 | No endpoint throttling | Add scoped DRF throttles for OTP request/verify, login, QR preview/redeem, and geo check-in. Use a shared cache in multi-instance deployment. Keep SQL OTP rate rules intact. |
| P1-04 | Persistent DRF tokens | Define a token expiry/rotation policy using Django's token table or an approved app-level session mechanism. Do not add columns or tables to the frozen SQL prototype. Correct misleading helper names and add tests. |
| P1-05 | Minimal production settings | Add secure cookies, HTTPS redirect, HSTS, proxy settings, `ALLOWED_HOSTS`, security headers, structured logging, and production startup validation. |
| P1-06 | Development server in Docker | Use a production WSGI/ASGI server (for example Gunicorn) and install production dependencies only. Add non-root execution and container health checks. |
| P1-07 | Interactive API documentation not mounted | Add `/api/schema/`, `/api/docs/`, and optionally `/api/redoc/` using drf-spectacular. Verify `--fail-on-warn` against the current route set. |
| P1-08 | Duplicate route aliases | Choose one canonical `/api/v1/` API mount. Preserve a legacy alias only if an existing mobile client demonstrably depends on it; document and test the compatibility contract. |
| P1-09 | Mobile/API contract not fully demonstrated | Generate client types or run contract tests from `schema.yml`; reconcile the mobile API clients and authentication expectations. |

### P2 — Operational readiness and repeatable demonstrations

| ID | Gap | Recommended action |
|---|---|---|
| P2-01 | No seed/demo command | Add an idempotent `seed_demo` command that calls the services layer and creates synthetic accounts/events/applications/assignments. Clearly separate demo-only shortcuts from real authentication/verification. |
| P2-02 | No health endpoint | Add `/healthz/` with safe app/database readiness checks. Do not expose secret or detailed infrastructure data. |
| P2-03 | Maintenance is manually invoked | Schedule `run_maintenance` with OS cron/systemd or a proper worker scheduler. Add job outcome logging/alerting. |
| P2-04 | Aggregate refresh stub returns `0` | Either implement a truthful read/cache computation using existing SQL views, or remove/mark the unsupported operation; do not report false success. |
| P2-05 | No CI workflow | Add CI for lint, Django checks, PostgreSQL service, SQL prototype test DB setup, full tests, OpenAPI generation, and SQL-freeze diff guard. |
| P2-06 | No setup/runbook documentation | Add root README, environment variable guide, database bootstrap instructions, API guide, demo script, security model, backup/restore guide, and deployment runbook. |
| P2-07 | No backup/restore procedure | Document and test PostgreSQL backup/restore. Preserve append-only audit records; any archive/export process must not mutate the frozen tables. |
| P2-08 | E2E coverage overstates real workflow coverage | Add actual QR redemption, manual check-in, QR walk-in, cancellation/completion cascade, and API-level status-transition tests. Avoid direct ORM state mutation except in narrowly scoped trigger-bypass test setup. |

## 7. Recommended execution sequence

Do not ask Qwen to “fix the whole backend” in one task. Use the sequence below and review every diff.

1. **Security hygiene:** inspect private media, remove any real identity data from Git, add ignore rules, and verify no unintended secrets are tracked.
2. **Clean install:** add missing dependencies, rebuild the environment from scratch, and run Django checks.
3. **Authentication delivery:** implement a pluggable OTP adapter and honest delivery outcome semantics.
4. **Application security:** fail-fast secrets, CORS allow-list, DRF throttling, and token rotation/expiry policy.
5. **API usability:** Swagger/ReDoc routes, canonical route structure, and mobile/API contract checks.
6. **Admin usability:** protect HTML views and make dashboard/monitoring/coordination pages data-backed.
7. **Demo and operations:** seed demo data, health check, scheduled maintenance, production server container, logging, backup runbook, CI.
8. **E2E verification:** test the real workflows and prove the SQL prototype did not change.

Keep each step in its own branch or small pull request. Do not combine security cleanup, API refactoring, UI, and deployment changes in one large diff.

## 8. SQL freeze guardrails

The following rules are mandatory for Qwen Coder, Antigravity, and human contributors:

- Do not edit `postgres sql/updated_volunteer_coordination_system_Database.sql`.
- Do not edit the SQL copy in `prompt code/spec/` either.
- Do not rename or alter tables, columns, SQL functions, triggers, constraints, or views.
- Do not add migrations intended to repair or extend prototype-owned tables.
- Do not replace SQL-owned logic with a parallel Python implementation.
- Do not alter Django models or migrations that mirror the SQL prototype without explicit approval.
- If a requirement cannot be satisfied without a schema change, document it as a future schema proposal; do not implement it silently.

For every remediation PR, compare the SQL files against the starting branch and require a zero-diff result. Use the actual repository SQL paths discovered by the agent rather than assuming a path.

## 9. Best way to use Qwen Coder through a browser

There are two different workflows that are easy to confuse:

1. **Qwen Chat / a browser chat page:** best for asking questions, reviewing uploaded files, preparing patches, or analyzing reports. Unless that specific environment has repository/workspace tools enabled, it does not automatically have the local checkout or the ability to run your Django/PostgreSQL tests.
2. **Qwen Code Web UI:** the official Qwen Code project documents an experimental browser UI launched from a local project with `qwen serve --open`. This is the better fit when you want a browser interface while Qwen Code works against the actual local repository. The official README describes it as experimental; do not expose its local daemon publicly. By default the service is local/loopback, and shared/untrusted environments should use the documented authentication option.

**Recommended approach:** use Qwen Code's local Web UI from the root of your cloned repository, not a chat-only browser session, for code modifications. It lets the coding agent inspect files and run commands in the project workspace. Use the normal Qwen Chat web interface as a second-opinion reviewer when you only want analysis or a proposed patch.

### 9.1 Start Qwen Code Web UI on Windows

Install the current Qwen Code package using the official installation instructions, then open PowerShell in the repository root:

```powershell
cd C:\path\to\Volunteer_Coordination_System

git status
# Create a separate working branch before asking the agent to edit files.
git switch -c fix/backend-stabilization

# Launch Qwen Code's browser UI (experimental).
qwen serve --open
```

Follow the current Qwen Code authentication instructions (`/auth` in the interactive CLI if needed) and open the local URL printed by the command. Do not expose the daemon port through router port-forwarding or a public tunnel. On a shared machine/network, configure the supported server token/authentication option before allowing access.

If you only have the Qwen Chat website, upload a sanitized source archive and the specific docs/files required for one task. Do not upload `.env`, tokens, private media, real identity documents, production database dumps, or secrets. Browser-chat output should be treated as a proposed patch for human application and local testing.

### 9.2 Prepare a safe workspace

Before starting each Qwen task:

```powershell
git status --short
git switch -c fix/<one-small-task>
```

Keep the following project references available in the workspace:

- `prompt code/dev/master_plan.md`
- `prompt code/spec/volunteer_coordination_system_v0_6_0_master_business_rules_operational_declaration.md`
- `prompt code/spec/volunteer_coordination_system_v0_6_0_services_common_infrastructure_bff_architecture.md`
- `prompt code/spec/volunteer_coordination_system_v0_6_0_step_by_step_backend_implementation_plan.md`
- This audit document
- The relevant phase review/test/completion documents
- The exact SQL object definitions that the service calls (read-only reference)

Do not send all 24 phase documents in every prompt. Provide the master guardrails, this audit, and only the relevant phase references and source files. This reduces context noise and avoids Qwen treating obsolete findings as current requirements.

### 9.3 Master instruction for Qwen Coder

Paste this at the start of a Qwen Code session:

> You are working in the existing Volunteer Coordination System v0.6.0 Django + DRF + PostgreSQL repository. Read `prompt code/dev/master_plan.md` and `v0_6_0_backend_audit_and_gap_remediation.md` first.
>
> **The PostgreSQL prototype is frozen.** Do not change either SQL prototype copy, SQL functions, triggers, constraints, views, prototype-owned tables/columns, or migrations that attempt to modify them. Do not silently alter the business rules. PostgreSQL remains the authority for all rules already enforced there; Django services orchestrate the workflows.
>
> Before changing code, inspect the current source. Treat historical review findings as hypotheses: verify whether each is still present. Several findings were already fixed after their original review. Never re-implement a fix that is already in the current source. Report `CONFIRMED`, `ALREADY FIXED`, `NOT REPRODUCIBLE`, or `NEEDS HUMAN DECISION` for each relevant finding.
>
> Work only on the one task I specify. First provide a plan with exact files, dependencies, security implications, SQL dependencies, tests, and rollback considerations. Do not edit files until I approve the plan. After approval, implement only that scope, add tests, run the relevant tests and Django checks, inspect the final diff, and report exact commands and outputs. Never claim a command passed unless you executed it successfully.
>
> Never commit, push, merge, or change branches unless I explicitly request it. Never install/upgrade packages without approval. Do not edit `.env`, secrets, private media, or production data. Preserve existing working behavior and avoid unrelated refactoring.

### 9.4 Task prompt — read-only verification first

> Audit task: `<TASK ID AND NAME>`.
>
> Do not edit any file. Inspect the current implementation and the related phase review/test/completion documents. Verify whether the finding is still present at the current branch head. Follow call chains through BFF → serializer/permission → service → ORM/SQL function and inspect the relevant tests.
>
> Return:
> 1. Status: CONFIRMED / ALREADY FIXED / NOT REPRODUCIBLE / NEEDS HUMAN DECISION.
> 2. Evidence: exact file paths, function/class names, and relevant line ranges.
> 3. Actual user/system impact.
> 4. Smallest safe fix that does not modify SQL.
> 5. Tests to add or update.
> 6. Risks and dependencies.
>
> Wait for approval before making changes.

### 9.5 Task prompt — implement one approved remediation

> Implement only approved task `<TASK ID>` using the approved plan. Do not expand scope.
>
> Constraints:
> - Keep the PostgreSQL prototype and both SQL copies unchanged.
> - Reuse the existing common infrastructure and services architecture.
> - Keep BFF views thin and serializers strict.
> - Use parameterized SQL for any existing SQL function calls.
> - Preserve transaction-local database context and restore it safely.
> - Never log raw OTPs, phone numbers, QR tokens, identity documents, secrets, or private paths.
> - Add regression tests for both expected success and failure/security behavior.
>
> After implementation:
> - Run the focused test module.
> - Run `python backend/manage.py check --settings=config.settings.local`.
> - Run the full suite if the environment supports it.
> - Run OpenAPI generation with `--fail-on-warn` if API contracts changed.
> - Show `git diff --stat`, the full list of changed files, and prove that the SQL files have zero diff from the starting branch.
> - Report anything not run or not verified. Do not commit or push.

### 9.6 Task prompt — independent code review

> Review the current diff for task `<TASK ID>`. Do not edit files.
>
> Look specifically for authorization bypasses, privacy leaks, transaction boundaries, rollback behavior, duplicate operations, idempotency, race conditions, trigger actor context, error translation, secret handling, path traversal, API contract changes, missing tests, and unintended scope expansion.
>
> Verify that no SQL prototype file or prototype-owned model/migration was changed. Classify findings as CRITICAL / HIGH / MEDIUM / LOW. For each finding, give a reproducible scenario and a minimal remedy. Mark each historical finding as already fixed when appropriate.

## 10. Qwen Coder completion gate

Do not accept a task as complete until all applicable checks are satisfied:

- [ ] The work item is limited to one approved scope.
- [ ] All modified files are listed and justified.
- [ ] No SQL file, SQL object, or prototype-owned migration changed.
- [ ] No secrets, real identity documents, or private-media files were added.
- [ ] Relevant unit/service/database/API tests pass.
- [ ] Full regression suite was run, or the reason it could not be run is stated.
- [ ] `manage.py check` passes.
- [ ] OpenAPI generation passes if endpoints/serializers/routes changed.
- [ ] Permission and privacy behavior has explicit tests.
- [ ] Transaction and rollback behavior has explicit tests for multi-step writes.
- [ ] `git diff` contains no unrelated formatting/refactoring changes.
- [ ] SQL-freeze diff guard is clean.
- [ ] Qwen provides exact command output and a concise implementation report.
- [ ] Human review is complete before merge.

## 11. Suggested first Qwen work items

Start with these in order; do not begin by implementing every item at once:

1. **P0-01 Private media repository audit** — determine which files are synthetic, remove any genuine identity material from Git history as appropriate, and add ignore rules. This should be human-supervised because history rewriting is destructive.
2. **P0-02 Requirements reproducibility** — add missing `django-filter` and `cryptography` dependencies, then prove a clean install works.
3. **P0-03 OTP delivery adapter** — implement provider abstraction/configuration and truthful response semantics; use a fake adapter in tests and keep real credentials out of the repo.
4. **P1-01/P1-02 Production secrets and CORS** — split local and production settings and fail safely on missing configuration.
5. **P1-07 API documentation routes** — mount schema/Swagger/ReDoc and verify schema generation.
6. **P1-04 Token lifecycle** — define session expiry/rotation and maintenance behavior without changing the frozen SQL prototype.
7. **P0-04 Admin portal** — protect template pages and replace hardcoded cards with real service data.
8. **P2 operations** — demo seed, health check, scheduler, Docker production server, CI and runbooks.

## 12. Final decision

The current backend is a strong functional prototype with a clear database-first architecture. The phase history shows iterative correction and increasing test coverage, culminating in a reported 619-test full-suite pass. Many historical review findings are already corrected and should not be treated as open defects.

The next development cycle should be called **Backend Stabilization & Demo Readiness**, not a rewrite and not another domain-feature phase. Preserve the services architecture, verify each outstanding finding against current code, fix the highest-risk operational gaps first, and prove that the frozen PostgreSQL prototype remains byte-for-byte unchanged.

---

## References

### Repository references

- [Repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System)
- [Prompt execution logs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/tree/main/prompt%20code/prompt_log)
- [Phase review/test/completion analysis](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/tree/main/prompt%20code/prompt_result_analysis)
- [Result analysis logs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/tree/main/prompt%20code/result_analysis_log)
- [Master plan](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/prompt%20code/dev/master_plan.md)
- [Backend source](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/tree/main/backend)
- [Qwen analysis uploaded by user](BACKEND_ANALYSIS.md) — external attachment, not a repository file.

### Qwen Code official references

- [Qwen Code official repository and README](https://github.com/QwenLM/qwen-code)
- [Qwen Code website](https://qwen.ai/qwencode)
