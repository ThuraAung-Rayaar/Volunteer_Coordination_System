# Volunteer Coordination System v0.5: Structural Plan and Gemini Prompt Kit

Sources used: final SQL design (`volunteer_coordination_system_db_v0_5.sql`) and the Django ORM/Workshift implementation plan (.md).

Note on Workshift: I could not see the Workshift app itself. The UI replan uses the screen names in the .md (Shift Board, Shift Detail, Worker List, Check-in) and maps our domain onto shift vocabulary. If your Workshift structure differs, correct Part C first, because the frontend prompts depend on it.

---

# PART A. What must change in the .md plan

## A1. Corrections (the .md is mostly right; these are the parts to change)

| # | Where in .md | Problem | Change |
|---|---|---|---|
| 1 | §8 all `CheckConstraint(check=...)` | `check=` is deprecated since Django 5.1 and removed in Django 6.0 | Check `python -c "import django;print(django.VERSION)"`. On 5.1+ use `condition=`. Put this in the master prompt or Gemini will emit the old form |
| 2 | §18.4/18.5 assignment flow | Attendance row is created only at "confirm". The SQL design says expected attendance exists once the user is assigned. The .md also makes the coordinator confirm, which is backwards for a shift app | Attendance (`expected`) is created with the assignment. The **volunteer** confirms their own shift (optional step). Check-in works for `assigned` or `confirmed` (Decision D1) |
| 3 | §11.5 and §11.6 | `qr/verify` (auth) and `qr/scan` (ops) overlap and the walk-in flow is ambiguous | Replace both with `POST /qr/resolve/` (public, preview only, no consume) and `POST /qr/redeem/` (authenticated, consumes, behaviour depends on purpose) (D8) |
| 4 | §11 URL list | Duplicated prefixes (`/events/events/`, `/ops/events/{id}/...`) will leak into every mobile call | Flatten: every app is mounted at `/api/v1/` and owns distinct top-level paths (Part B3) |
| 5 | §10.2 and §10.3 | Assignment is created in both `accept_application` and `run_auto_assignment` | One function `create_assignment_from_application()` is the only place assignments are created. Both callers use it. If no post matches it returns `None` and the application stays accepted/unassigned |
| 6 | §10.2 capacity | "Capacity check atomically" with no definition | Capacity rules in D4; lock order event → post → application |
| 7 | §10 services | Permission checks are only in views | Services re-check permissions (`ensure_event_manager`, `ensure_admin`). Views must not be the only guard |
| 8 | §10 check-in | "Check in self: Yes" but no proof of presence | Non-managers can check in only by redeeming a valid `checkin` QR. Managers can check anyone in manually |
| 9 | §8.4 / SQL | Missing constraints: `event_posts UNIQUE(event,title)`, verification path and review checks, `auth_otp.attempt_count` | Add to B01/B02 prompts (listed there) |
| 10 | §13 views | Plan offers SQL views plus unmanaged models | Drop for v0.5. ORM annotations only. The SQL file stays as the reference spec |
| 11 | §6.2 | `DEV_FIXED_OTP` could leak to production | Honour it only when `DEBUG=True` |
| 12 | §10.1 | Token auth checks blocking only at login | Custom DRF auth class rejects `blocked`/`closed` on every request. `blocked_until` in the past counts as unblocked (lazy expiry) |
| 13 | §7.6 validators | "validate_jpeg_file" only validates | Re-encode with Pillow to JPEG, strip EXIF, save under a private directory, store the path and `file_sha256`. Never serve via public MEDIA URL. Admin-only download view |
| 14 | §16 | RN admin screens in scope | Admin = Django admin web only in v0.5 (D7). Moderation services and Django admin actions only. No AdminStack in RN |
| 15 | Feedback | Rules not stated | Only after event `completed`. Volunteer must have had an active assignment. `volunteer_to_coordinator` target is forced to `event.coordinator_id` |
| 16 | Soft delete | Every list query must hide deleted events | `Event.objects.visible()` QuerySet method. All non-admin queries use it |
| 17 | Waitlist | Not defined | Promotion is manual: coordinator accepts a waitlisted application when space frees (no auto-promote in v0.5) |

## A2. Decisions to lock before coding

Defaults below are my recommendation. Change any of them now. Gemini must never choose these itself.

| ID | Decision | Default |
|---|---|---|
| D1 | Who confirms an assignment | Volunteer, optional. Check-in allowed from `assigned` or `confirmed` |
| D2 | Verification gating | Not required to apply to events. Required (`verified`) before admin can approve a coordinator |
| D3 | Event activation | Manual by coordinator (`published → active`). Check-in only when `active` |
| D4 | Capacity | With `post`: `required_headcount - active assignments on that post`. Without post: `max_participants - accepted applications` (null = unlimited) |
| D5 | Auth | DRF `TokenAuthentication`, custom class adds block check |
| D6 | URLs | Flat, `/api/v1/` root (Part B3) |
| D7 | Admin UI | Django admin web only |
| D8 | Walk-in | resolve → OTP login → redeem → application `source=qr_walkin`, status `pending` |
| D9 | Heavy work | `physical_level=heavy` needs `can_lift_heavy`. `medium` needs `physical_ok` |

---

# PART B. Final structure

## B1. Backend file tree (target state)

```
backend/            settings.py, urls.py
docs/CONTRACT.md   <- single source of truth for Gemini (B4)
apps/
  common/    constants.py  exceptions.py  security.py  permissions.py
             pagination.py  validators.py  fields.py(existing)
  accounts/  models.py services.py serializers.py views.py urls.py admin.py
             authentication.py        <- NEW (blocked-aware token auth)
             tests/ test_security.py test_models.py test_auth.py
                    test_profile.py test_coordinator.py
  events/    models.py services.py serializers.py views.py urls.py admin.py
             tests/ test_models.py test_lifecycle.py test_application.py
             management/commands/ seed_charity_fields.py seed_demo_data.py
  ops/       models.py services.py serializers.py views.py urls.py admin.py
             tests/ test_models.py test_qr.py test_assignment.py
                    test_attendance.py test_feedback.py
  audit/     models.py services.py serializers.py views.py urls.py admin.py
             tests/ test_moderation.py
  tests_e2e/ test_feasibility_flow.py
```

## B2. Change map (existing file → what changes)

| File | Change |
|---|---|
| `settings.py` | Secret from env (no fallback), DRF defaults (IsAuthenticated, pagination, exception handler, custom auth class), HMAC/Fernet/`DEV_FIXED_OTP` settings, private media root for verification images, logging |
| `accounts/models.py` | Add missing fields (`password`, `last_login`, `blood_type` default `unknown`, `file_sha256`, `comparison_score`, `attempt_count`), all constraints, `is_blocked` property with lazy expiry |
| `events/models.py` | Constraints, `UNIQUE(event,title)` on posts, `Event.objects.visible()`, `CharityField` PK = `code` |
| `ops/models.py` | Constraints, `uq_feedback_once` via `RunSQL` migration (COALESCE expression index) |
| `audit/models.py` | `feedback` FK on moderation, subject/expiry constraints |
| every `views.py` | Replace open `ModelViewSet` writes with thin service-backed views. Keep read-only viewsets where useful |
| every `urls.py` | Flat routes (B3) |
| migrations | Option A reset (delete 0001/0002, regenerate) because the project is pre-data |

## B3. URL map (final, `/api/v1/` prefix)

```
AUTH     POST auth/otp/request/        POST auth/otp/verify/
ME       GET/PATCH me/                 GET/PUT me/charity-interests/
         GET/POST me/verification-images/
         GET me/coordinator/           POST me/coordinator/        (apply)
         GET me/applications/          GET me/assignments/         (My Shifts)
LOOKUP   GET charity-fields/
EVENTS   GET events/ (published, visible; filters: charity_field,date_from,date_to,q)
         GET events/{id}/
         GET/POST coordinator/events/  PATCH coordinator/events/{id}/
         POST events/{id}/publish|activate|complete|cancel/
         GET/POST events/{id}/posts/   PATCH posts/{id}/
         POST events/{id}/apply/
         GET events/{id}/applications/     (manager)
         GET events/{id}/roster/           (manager: assignment + attendance)
         GET events/{id}/unassigned/       (manager)
APPS     POST applications/{id}/accept|reject|waitlist|withdraw/
ASSIGN   POST events/{id}/assignments/auto-run/
         POST events/{id}/assignments/manual/
         POST assignments/{id}/confirm|cancel/
ATTEND   POST events/{id}/check-in/  check-out/  mark-absent/
         POST events/{id}/onboarding/acknowledge/
         POST events/{id}/feedback/
QR       POST events/{id}/qr/ (manager: generate; returns raw token ONCE)
         POST qr/resolve/ (public)    POST qr/redeem/ (auth)
```

Error format for every failure: `{"error": {"code": "capacity_full", "message": "..."}}`.

## B4. `docs/CONTRACT.md` (paste this file into the repo as is; every prompt references it)

````markdown
# CONTRACT v0.5 (source of truth. If code and contract differ, the contract wins.)

## Constants (apps/common/constants.py)
ACCOUNT_STATUS: active, blocked, closed
COORDINATOR_STATUS: pending, approved, suspended, revoked
EVENT_STATUS: draft, published, active, completed, cancelled
APPLICATION_STATUS: pending, accepted, waitlisted, rejected, withdrawn, expired
ASSIGNMENT_STATUS: assigned, confirmed, completed, cancelled
ATTENDANCE_STATUS: expected, checked_in, absent, completed
QR_PURPOSE: walkin_registration, checkin, join_event
FEEDBACK_DIRECTION: coordinator_to_volunteer, volunteer_to_event, volunteer_to_coordinator
ACTIVE_APPLICATION = (pending, accepted, waitlisted)
ACTIVE_ASSIGNMENT  = (assigned, confirmed, completed)

## Exceptions (apps/common/exceptions.py), all subclass DomainError(code, message, http_status)
DomainError 400 | PermissionDeniedError 403 | AccountBlockedError 403
InvalidStateError 409 | CapacityFullError 409 | OnboardingRequiredError 409
ApplicationNotAllowedError 400 | QrTokenInvalidError 400 | NotFoundError 404

## Permission helpers (apps/common/permissions.py)
is_admin(user), is_approved_coordinator(user), ensure_admin(actor),
ensure_event_manager(actor, event)   # event.coordinator_id == actor.id or admin
ensure_active_account(user)          # raises AccountBlockedError

## State machines (services only. Never PATCH status)
Event: draft→published→active→completed ; published→cancelled ; active→cancelled
Application: pending→accepted|rejected|waitlisted|withdrawn ; waitlisted→accepted|rejected|withdrawn ; accepted→withdrawn (cancel its assignment)
Assignment: assigned→confirmed|cancelled ; confirmed→completed|cancelled
Attendance: expected→checked_in|absent ; checked_in→completed

## Capacity (D4)
post given: remaining = post.required_headcount − count(active assignments on post)
no post:    remaining = event.max_participants − count(accepted applications) ; None = unlimited
Lock order: event → post → application (select_for_update inside transaction.atomic)

## Service signatures (actor first when an actor acts)
accounts: request_otp(phone, purpose="login"); verify_otp(phone, code, purpose="login") -> (user, token, created)
          update_profile(user, data); set_charity_interests(user, codes)
          add_verification_image(user, image_type, uploaded_file); review_verification_image(actor, image, status, note="")
          recompute_verification_status(user); apply_as_coordinator(user, notes="")
          approve_coordinator(actor, profile); suspend_coordinator(actor, profile); revoke_coordinator(actor, profile)
events:   create_event(actor, data, charity_codes=()); update_event(actor, event, data)
          publish_event|activate_event|complete_event|cancel_event(actor, event)
          add_post(actor, event, data); update_post(actor, post, data); close_post(actor, post)
          apply_to_event(user, event, post=None, source="browse", qr_token=None) -> application
          withdraw_application(user, application); accept_application(actor, application, post=None) -> (application, assignment|None)
          reject_application(actor, application, reason=""); waitlist_application(actor, application)
ops:      generate_qr_token(actor, event, purpose, max_uses=None, ttl_minutes=240) -> (QrToken, raw_token)
          resolve_qr_token(raw) -> QrToken ; redeem_qr_token(user, raw) -> dict
          create_assignment_from_application(application, actor=None) -> Assignment|None   # ONLY place assignments are created
          run_auto_assignment(actor, event) -> list[Assignment]
          assign_manually(actor, application, post, group_code=None, is_leader=False)
          confirm_assignment(user, assignment) ; cancel_assignment(actor, assignment, reason="")
          check_in(actor, event, user, method, qr_token=None) ; check_out(actor, event, user) ; mark_absent(actor, event, user)
          acknowledge_onboarding(user, event) ; submit_feedback(user, event, direction, target_user=None, score=None, tags=(), comment="")
audit:    log_action(actor, action, entity_type, entity_id, before=None, after=None, ip=None)
          warn_user|block_user|unblock_user|close_account|reinstate_account(admin, target, reason, expires_at=None)
          delete_event|restore_event|cancel_event_by_admin(admin, event, reason) ; hide_feedback(admin, feedback, reason)
          dashboard_stats() -> dict

## Rules
- apply_to_event: event published/active, deadline not passed, account active, no active application,
  qr_walkin requires qr_token. Snapshot conditions into conditions_snapshot.
  acceptance_mode=auto: capacity ok → accepted + create_assignment_from_application (if auto_assign_enabled); full → waitlisted.
  acceptance_mode=manual: always pending.
- create_assignment_from_application also get_or_create the Attendance row (expected).
- Auto-assign filters: required_skills empty or overlap; heavy→can_lift_heavy, medium→physical_ok;
  new_volunteers_allowed; sort by post.priority asc; first post with remaining > 0.
  group_code = "G{n}" using event.group_size; leader = first member with has_leader_experience in a group without leader
  (only if post.leader_needed or event.leader_strategy == first_experienced).
- check_in: event active; user has assignment in (assigned, confirmed); if event.require_onboarding_ack the user must have an
  ack for event.onboarding_version else OnboardingRequiredError; non-manager requires a valid checkin QR; idempotent.
- feedback: event completed; rater had an active assignment (or is event coordinator); volunteer_to_coordinator target = event.coordinator.
- update_event: changing onboarding_text increments onboarding_version.
- Every state change writes log_action. Every query for non-admins uses Event.objects.visible().
````

---

# PART C. Workshift UI replan

## C1. Vocabulary mapping

| Workshift term | Our domain |
|---|---|
| Shift | Event |
| Position / Role | EventPost |
| Shift request | EventApplication |
| Assigned shift | Assignment (+ group, leader) |
| Clock-in | Attendance via QR |
| Worker list | Roster (assignment + attendance) |
| Manager | Coordinator (approved) |

## C2. Navigation (role-based, one account)

```
RootNavigator
 ├─ AuthStack           LoginPhone → OtpVerify → ProfileSetup → (VerificationUpload, skippable)
 └─ MainApp
     ├─ VolunteerTabs   Shift Board | My Shifts | Check-in | Profile
     └─ CoordinatorTabs My Events | Applicants | Roster | Profile   (shown only when approved)
```

A "Switch to coordinator mode" toggle sits in Profile and appears only when `GET me/coordinator/` returns `approved`. No admin stack (D7).

## C3. Screen → API → states

| Screen | Endpoints | Notes |
|---|---|---|
| LoginPhone / OtpVerify | `auth/otp/request`, `auth/otp/verify` | Store token in SecureStore. Handle `account_blocked` |
| ProfileSetup | `me/` PATCH, `charity-fields/`, `me/charity-interests/` | Blood type, donation willingness, skills, capability toggles |
| VerificationUpload | `me/verification-images/` | Camera selfie + ID photo, JPEG upload, show review status |
| Shift Board | `events/` | Cards: title, time, location, charity chips, remaining spots. Filter by charity field and date |
| Shift Detail | `events/{id}/`, `events/{id}/posts/`, `events/{id}/apply/` | Button logic in C4 |
| My Shifts | `me/applications/`, `me/assignments/` | Sections: Upcoming, Pending, Past. Confirm button, onboarding acknowledge |
| Check-in | `qr/redeem/` | Camera scan. Needs onboarding acknowledged first |
| Rate event | `events/{id}/feedback/` | After `completed` |
| Coordinator: My Events | `coordinator/events/` + lifecycle actions | Create/edit wizard, posts editor, publish/activate/complete |
| Coordinator: Applicants | `events/{id}/applications/`, `applications/{id}/accept…` | Accept, reject, waitlist |
| Coordinator: Roster | `events/{id}/roster/`, `events/{id}/unassigned/`, `assignments/auto-run`, `check-in`, `mark-absent` | Worker List with live check-in status. Manual assign |
| Coordinator: QR | `events/{id}/qr/` | Show check-in QR and walk-in QR (raw token shown once, so keep in memory) |
| Walk-in entry | `qr/resolve/` → login → `qr/redeem/` | Deep link carries the token |

## C4. Shift Detail button logic (volunteer)

| Server state | UI |
|---|---|
| published, not applied, spots left | **Apply** (primary) |
| published, full | Apply (shows "may be waitlisted") |
| application pending | Pending + **Withdraw** |
| waitlisted | Waitlisted badge + Withdraw |
| accepted, no assignment | "Accepted, awaiting placement" |
| assignment `assigned` | Post/group shown + **Confirm shift** |
| event `active` + assignment | **Check in** (opens scanner) |
| onboarding unacknowledged | Onboarding sheet with tick, blocks check-in |
| attendance `checked_in` | Checked-in badge |
| event `completed` + attended | **Rate event** |
| rejected / cancelled | Read-only badge |

Rule: the UI never computes eligibility itself. It renders what the server returns and shows the server `error.message` on failure. The server wins.

## C5. Mobile structure

```
mobile/src/
  theme/colors.ts          # surface #eddab6, border #a1814f, primary #e6ac00, pressed #674632, text #1d1716
  api/    client.ts  endpoints.ts  types.generated.ts   # types from /api/schema/ via openapi-typescript
  store/  auth.ts                                       # token + me + mode (volunteer|coordinator)
  navigation/ RootNavigator AuthStack VolunteerTabs CoordinatorTabs
  modules/ auth profile verification events shifts attendance feedback coordinator
  components/ WorkshiftCard StatusBadge PrimaryButton SectionCard QRScanner EmptyState ErrorBanner
  hooks/   useApi (TanStack Query wrappers)
```

---

# PART D. Method for Gemini Flash

Flash is fast but loses details in long contexts and invents names. So:

1. **One prompt = one module** (max 2 source files + their test file).
2. **Always send the same three things:** (a) the MASTER RULES block, (b) `docs/CONTRACT.md`, (c) the current content of any file it must edit. Never paste the whole .md plan or the whole SQL.
3. **Tests first, in the same prompt.** The tests are what tell you if Flash drifted.
4. **Full files only**, no diffs, no "...rest unchanged".
5. **Repair loop:** run the tests, paste the failing output into the REPAIR template. Maximum 2 loops. If still red, bring the failure back to me instead of letting Flash guess.
6. **Commit after every green prompt.** Never stack prompts on red.
7. **Freeze before UI:** after B17, generate the OpenAPI schema and build the frontend against it.

## D1. MASTER RULES (paste at the top of every prompt)

```
ROLE: Senior Django engineer on an existing project.
PROJECT: Volunteer Coordination System v0.5, online-only. Django + DRF + PostgreSQL.
Apps: accounts, events, ops, audit, common. docs/CONTRACT.md is the source of truth.

HARD RULES
1. Business logic lives only in apps/<app>/services.py. Views and serializers are thin:
   validate input, call ONE service, serialize the result.
2. Every state-changing service uses @transaction.atomic, re-checks permissions with
   apps.common.permissions helpers, and calls apps.audit.services.log_action.
3. Use constants from apps/common/constants.py. No raw status strings.
4. Raise only DomainError subclasses. Never return error dicts.
5. Use select_for_update() before capacity/count checks. Lock order: event, post, application.
6. Model constraints use CheckConstraint(condition=...) and UniqueConstraint(condition=...).
   PostgreSQL only.
7. Never store raw OTP codes, raw QR tokens or plain phone numbers.
8. Touch ONLY files listed under TOUCH. Do not rename existing public names.
   Do not add dependencies that are not listed.
9. If something is ambiguous, apply docs/CONTRACT.md, add a "# ASSUMPTION: ..." comment and
   continue. Do not ask questions.

OUTPUT FORMAT: for each file, a line "### path/to/file.py" followed by ONE fenced code block
with the COMPLETE file. No diffs, no ellipsis, no explanation. End with a 3-line "Run:" list.
```

## D2. TASK template

```
TASK <ID>: <title>
CONTEXT (read-only): <files>
TOUCH (create or overwrite): <files>
CONTRACT: <signatures and behaviour, copied from CONTRACT.md>
RULES: <task-specific rules>
TESTS TO WRITE: <list of test names and what each asserts>
DONE WHEN: <commands that must pass>
```

## D3. REPAIR template

```
The tests below fail. Fix ONLY the files listed. Return the COMPLETE files.
Do not change tests unless the test contradicts docs/CONTRACT.md (then say which line).
FILES: <paths>   (paste current content)
FAILING OUTPUT: <paste>
```

---

# PART E. Backend prompt sequence

Run in this order. Each block is the body of a TASK (add MASTER RULES + CONTRACT on top).

**B00 Foundation**
TOUCH: `backend/settings.py`, `.env.example`, `requirements.txt`, `apps/common/{constants,exceptions,security,pagination}.py`, `apps/common/tests/test_security.py`
Do: constants and exceptions exactly as in CONTRACT. `domain_exception_handler` returns `{"error":{"code","message"}}` with the exception's http_status. `security.py`: `hash_phone`, `encrypt_phone`, `decrypt_phone` (Fernet), `hash_otp`, `generate_raw_token`, `hash_token` (HMAC-SHA256 with `PHONE_HASH_HMAC_SECRET`). Settings: secret from env without fallback, DRF defaults (IsAuthenticated, `StandardPagination`, exception handler), `DEV_FIXED_OTP` honoured only if `DEBUG`, private `VERIFICATION_MEDIA_ROOT`. Add `cryptography`, `Pillow`, `pytest`, `pytest-django`.
Tests: hash deterministic; different secret → different hash; encrypt/decrypt roundtrip; raw token ≠ stored hash.

**B01 Accounts models**
TOUCH: `apps/accounts/models.py`, `apps/accounts/tests/test_models.py`
Do: add missing fields (`password` nullable, `last_login`, `blood_type` default `unknown`, `comparison_score`, `file_sha256`, `attempt_count`). Constraints: `ck_users_blocked_until`, `ck_users_donation_consistency`, `ck_coordinator_approval`, `uq_current_verification_image`, image path must end `.jpg/.jpeg`, review fields required when status ≠ pending. `User.is_blocked` returns False when `blocked_until` is in the past.
Tests: each constraint raises `IntegrityError` on a violating row and accepts a valid one.

**B02 Events, ops, audit models and migration reset**
TOUCH: `apps/{events,ops,audit}/models.py`, the three `tests/test_models.py`, new `apps/ops/migrations/` RunSQL for `uq_feedback_once`
Do: constraints per .md §8.2–8.4 using `condition=`, plus `UNIQUE(event,title)` on posts, `Event.objects.visible()`, `CharityField.code` as PK, moderation `feedback` FK. Delete old migrations, regenerate.
Tests: one test per constraint (duplicate active application, duplicate active assignment, end before start, deadline after start, QR over max_uses, checked_in without checkin_at, feedback target rule, moderation subject).
Run: `makemigrations`, `migrate`, `pytest apps -k models`.

**B03 Audit services**
TOUCH: `apps/audit/services.py`, `apps/audit/tests/test_moderation.py`
Do: `log_action`, all moderation functions in CONTRACT. Each runs atomically: create `ModerationAction`, update target state (user status/blocked_until, event soft-delete fields, feedback hidden), write audit log. `dashboard_stats()` uses ORM counts only.
Tests: warn creates action and audit row; block sets status and `blocked_until`; expired block treated as unblocked; delete/restore event; non-admin raises `PermissionDeniedError`.

**B04 OTP and auth**
TOUCH: `apps/accounts/services.py` (OTP part), `apps/accounts/authentication.py`, `apps/accounts/tests/test_auth.py`
Do: `request_otp` hashes phone and code, stores `AuthOtp` (5-minute expiry), uses `DEV_FIXED_OTP` when allowed. `verify_otp` checks expiry, attempt count (max 5), consumes, creates user on first login, rejects blocked/closed, returns DRF token. `BlockedAwareTokenAuthentication` rejects blocked/closed on every request.
Tests: happy path creates user; reuse of a consumed code fails; expired fails; 6th wrong attempt locks; blocked user rejected; same phone gives same user.

**B05 Profile, verification, coordinator services**
TOUCH: `apps/accounts/services.py` (rest), `apps/common/validators.py`, `apps/accounts/tests/{test_profile,test_coordinator}.py`
Do: `update_profile`, `set_charity_interests` (replace set), `add_verification_image` (Pillow open → re-encode JPEG → strip EXIF → save in `VERIFICATION_MEDIA_ROOT` → store path and sha256, flip previous `is_current` to False), `review_verification_image`, `recompute_verification_status`, coordinator apply/approve/suspend/revoke. Approve requires `verification_status == verified` (D2).
Tests: PNG upload becomes JPEG; non-image rejected; old image no longer current; approve fails when unverified; approve sets `approved_at`.

**B06 Accounts API**
TOUCH: `apps/accounts/{serializers,views,urls}.py`, `apps/accounts/tests/test_api.py`
Do: endpoints under AUTH and ME in B3 only. Remove open write access to sensitive fields (`is_admin`, `account_status`, `verification_status`). Verification image list returns metadata, never the file path.
Tests: unauthenticated rejected; PATCH `is_admin` ignored; OTP endpoints are `AllowAny`.

**B07 Event lifecycle services**
TOUCH: `apps/events/services.py` (lifecycle and posts), `apps/events/tests/test_lifecycle.py`
Do: `create_event` (approved coordinator only), `update_event` (bumps `onboarding_version` on text change), publish (needs ≥1 post), activate, complete (marks assignments and attendance completed), cancel (cancels assignments), posts CRUD, charity field replace. Enforce the Event state machine.
Tests: every legal transition and at least one illegal one; unapproved coordinator blocked; publish without post fails.

**B08 Application services**
TOUCH: `apps/events/services.py` (applications), `apps/events/tests/test_application.py`
Do: `apply_to_event`, `withdraw_application`, `accept_application`, `reject_application`, `waitlist_application` exactly as in CONTRACT Rules and Capacity. `accept_application` calls `ops.services.create_assignment_from_application` (import inside the function to avoid a circular import).
Tests: manual→pending; auto with space→accepted+assignment; auto full→waitlisted; duplicate rejected; blocked user rejected; past deadline rejected; accept at capacity raises `CapacityFullError`; two-thread capacity test with `TransactionTestCase`.

**B09 QR services**
TOUCH: `apps/ops/services.py` (QR), `apps/ops/tests/test_qr.py`
Do: `generate_qr_token` (stores hash, returns raw once), `resolve_qr_token` (validates only), `redeem_qr_token` (atomic, `select_for_update`, increments `used_count`, then by purpose: walkin → `apply_to_event(source=qr_walkin)`, checkin → `check_in(method=qr_scan)`).
Tests: expired, revoked, over max_uses, wrong purpose, raw token never in DB, walk-in creates pending application.

**B10 Assignment engine**
TOUCH: `apps/ops/services.py` (assignment), `apps/ops/tests/test_assignment.py`
Do: `create_assignment_from_application`, `run_auto_assignment`, `assign_manually`, `confirm_assignment` (owner only), `cancel_assignment`, groups and leaders as in CONTRACT.
Tests: skill match, heavy needs `can_lift_heavy`, new volunteers excluded where not allowed, priority order, no match leaves user unassigned, one leader per group, attendance row created.

**B11 Attendance, onboarding, feedback**
TOUCH: `apps/ops/services.py` (rest), `apps/ops/tests/{test_attendance,test_feedback}.py`
Do: `acknowledge_onboarding`, `check_in`, `check_out`, `mark_absent`, `submit_feedback` per CONTRACT Rules.
Tests: onboarding required blocks check-in; new version requires a new ack; non-manager without QR rejected; check-in twice is idempotent; feedback only after completed; duplicate feedback rejected.

**B12 Events API** (TOUCH `apps/events/{serializers,views,urls}.py`, `tests/test_api.py`): endpoints for EVENTS and APPS in B3. Public list uses `visible()` and published only. Lifecycle via `@action`. No direct status PATCH. `events/{id}/roster/` and `unassigned/` use ORM annotations.

**B13 Ops API** (TOUCH `apps/ops/{serializers,views,urls}.py`, `tests/test_api.py`): endpoints for ASSIGN, ATTEND, QR in B3. Plus `me/applications/` and `me/assignments/` (My Shifts) returning event title, time, post, group, attendance status.

**B14 Django admin workflow**
TOUCH: the four `admin.py` files. Inlines (images, interests, posts, charity fields). Actions that call services (approve coordinator, block/unblock, publish, soft-delete/restore, confirm/cancel assignments). `AuditLog` read-only. Verification image review page with admin-only file download. A dashboard view calling `dashboard_stats()`.

**B15 Seed data**
TOUCH: `apps/events/management/commands/seed_demo_data.py`. 1 admin, 1 approved coordinator, 2 volunteers, 1 published event with 3 posts, and one application → assignment → attendance. Idempotent.

**B16 End-to-end feasibility test**
TOUCH: `apps/tests_e2e/test_feasibility_flow.py`. Implement the 20-step flow from the .md §14.1 through the HTTP API (APIClient), not services. Plus the negative list from §14.2.

**B17 API freeze**
Run `python manage.py spectacular --file schema.yml`. Check every endpoint in B3 appears. Commit `schema.yml`. This is the contract for the mobile app.

---

# PART F. Frontend prompt sequence (after B17)

Use a different MASTER block for the app:

```
ROLE: Senior React Native (Expo, TypeScript) engineer.
RULES: types come from src/api/types.generated.ts (generated from schema.yml). Never hand-write API types.
Server state with TanStack Query; auth token in expo-secure-store. Colours only from src/theme/colors.ts.
No business logic in screens: render server state, call endpoints, show error.message.
Touch only listed files. Output complete files, one fenced block each.
```

| ID | Task |
|---|---|
| F00 | Scaffold, theme (`colors.ts`), `api/client.ts` (token header, error unwrap), type generation script, `StatusBadge`, `PrimaryButton`, `WorkshiftCard` |
| F01 | AuthStack: LoginPhone, OtpVerify, session restore, blocked-account screen |
| F02 | ProfileSetup, charity interests picker, VerificationUpload (camera, JPEG), status display |
| F03 | Shift Board (filters, cards) and Shift Detail with the C4 button table |
| F04 | My Shifts (sections, confirm, onboarding sheet) |
| F05 | Check-in screen with `QRScanner` → `qr/redeem/`, deep link for walk-in → `qr/resolve/` |
| F06 | Coordinator mode toggle, My Events, create/edit wizard, posts editor, lifecycle buttons |
| F07 | Coordinator Applicants, Roster (check-in status), unassigned list, auto-run, QR display |
| F08 | Feedback screen, empty and error states, final pass |

---

# PART G. Checkpoints

| After | You should see |
|---|---|
| B02 | Migrations apply on PostgreSQL, constraint tests green |
| B06 | Login with `DEV_FIXED_OTP`, `GET me/` works, `is_admin` cannot be set |
| B11 | All service tests green, including the concurrent capacity test |
| B13 | Full API surface in `/api/docs/` |
| B16 | End-to-end flow green. This proves v0.5 feasibility |
| B17 | `schema.yml` committed, frontend work begins |
