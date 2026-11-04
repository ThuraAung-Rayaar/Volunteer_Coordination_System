# Volunteer Coordination System (v0.6.0) — Step-by-Step Backend Implementation Plan

**Version:** `v0.6.0`  
**Companion Specifications:**  
1. `updated_volunteer_coordination_system_Database_2.sql` (Canonical Database-First Schema)  
2. `v0_6_0_business_rules_declaration.md` (214 Workflows, Privacy Tiers `T0`–`T4`, Formulas & State Machines)  
3. `v0_6_0_services_architecture.md` (`common/`, `services/`, `bff/`, and `admin_portal/` Contracts)  

**Working Root:** `backend/`  
**Execution Principle:** One gated phase at a time. Never advance to the next phase until the current phase's verification gate passes with zero errors.

---

## 1. Master Phase Roadmap & Verification Gates

| Phase | Phase Name | Files Created / Updated | Verification Gate Command |
| :--- | :--- | :--- | :--- |
| **Phase P0** | **Database `uuid` Sync & ORM View Models** | `updated_volunteer_coordination_system_Database_2.sql`, `apps/accounts/models.py`, `apps/events/models.py`, `apps/audit/models.py` | `SELECT * FROM self_test();` (10/10 pass) + `python manage.py check` (0 issues) |
| **Phase P1** | **Core Infrastructure & Security Context (`common/` & `config/`)** | `config/settings/base.py`, `config/settings/local.py`, `config/settings/production.py`, `common/utils.py`, `common/db_context.py`, `common/exceptions.py`, `common/permissions.py` | Unit tests for crypto, tag normalization, `SET LOCAL app.user_id`/`app.ip`, PG error translation, and `404` masking pass |
| **Phase P2** | **Public Read & Browsing BFF (`T0`)** | `bff/volunteer/serializers.py`, `bff/volunteer/views.py`, `bff/volunteer/urls.py`, `bff/urls.py`, `config/urls.py` | `GET /api/v1/charity-fields/`, `GET /api/v1/events/`, `GET /api/v1/events/{id}/`, `GET /api/v1/events/{id}/posts/` + draft/deleted `404` masking tests pass |
| **Phase P3** | **Identity, OTP Auth, Self Profile, Availability & UUID Lookup** | `services/otp_service.py`, `bff/auth/serializers.py`, `bff/auth/views.py`, `bff/auth/urls.py`, `bff/volunteer/*` | Full OTP lifecycle (`W01`–`W12`), allow-list `/me/` update (`W13`–`W17`), availability (`W18`–`W22`), and UUID lookup (`W23`–`W24`) tests pass |
| **Phase P4** | **Verification Images & Coordinator Approval** | `services/assignment_service.py` (Part 1), `admin_portal/views.py`, `admin_portal/urls.py`, `bff/coordinator/*` | Private JPEG upload (`W27`–`W29`), admin review & auto-verification hierarchy (`W30`–`W33`), and coordinator approval (`W34`–`W40`) tests pass |
| **Phase P5** | **Event Lifecycle, Posts, Handover, Owner-as-Monitor & Retake** | `services/assignment_service.py` (Part 2), `bff/coordinator/serializers.py`, `bff/coordinator/views.py`, `bff/coordinator/urls.py` | Event state machine (`W41`–`W46`), handover/retake (`W50`–`W53`), Owner-as-Monitor read-only block, and post sync (`W59`–`W63`) tests pass |
| **Phase P6** | **Recruitment Applications & Smart Assignment Engine** | `services/assignment_service.py` (Part 3), `bff/volunteer/*`, `bff/coordinator/*` | Browse/invite apply (`W64`–`W79`), capacity & schedule conflict guards, `run_auto_assignment`, `assign_manually`, and shift confirm/cancel (`W80`–`W93`) tests pass |
| **Phase P7** | **Onboarding, QR Tokens & 4-Path Check-In (QR, Geo, Manual, Walk-In)** | `services/qr_service.py`, `services/geo_service.py`, `bff/checkin/serializers.py`, `bff/checkin/views.py`, `bff/checkin/urls.py` | Onboarding ack (`W122`–`W125`), QR preview/redeem (`W142`–`W149`), 13-branch `geo_check_in` (`W96`–`W109`), confirm/reject queue (`W113`–`W115`), and manual roll-call (`W110`–`W112`) tests pass |
| **Phase P8** | **Two-Way Feedback, Admin Moderation, Maintenance & Schema Freeze** | `services/geo_service.py` (Feedback), `admin_portal/views.py`, `apps/audit/management/commands/run_maintenance.py`, `tests_e2e/` | Feedback (`W126`–`W131`), insert-to-apply moderation (`W132`–`W141`), maintenance jobs (`W162`–`W165`), 25-step E2E test, and `spectacular --file schema.yml --fail-on-warn` pass |

---

## 2. Phase-by-Phase Execution Specification

---

### Phase P0: Database `uuid` Sync & Read-Only ORM View Models

**Objective:** Ensure PostgreSQL has the `users.uuid` column with a `UNIQUE` constraint and immutability guard (plus a PostgreSQL 14–17 `uuidv7()` fallback if your local server is older than PostgreSQL 18), and register the `uuid` field and the 11 read-only SQL View models in Django.

#### Step P0.1 — SQL Patch 
Step P0.1 — Verify users.uuid (PostgreSQL 18 native)
The column, default, and unique constraint already exist in the schema. Verify only
DO $$ or if `users.uuid` was added via `ALTER TABLE`, ensure the following idempotent block is applied to `volunteer_coordination_db`:

```
psql -U postgres -d volunteer_coordination_db -c "SELECT count(*) FROM pg_constraint WHERE conname = 'uq_users_uuid';"
```
Expected: 1. No patch needed.

#### Step P0.2 — Update `backend/apps/accounts/models.py` (`Users.uuid`)
Add uuid right below id on Users: uuid = models.UUIDField(unique=True, editable=False) — non-editable, database-generated via uuidv7().
* Keep `USERNAME_FIELD = "phone_hash"` and `managed = False`.

#### Step P0.3 — Add Read-Only ORM Models for the 11 Operational Views
1. **In `backend/apps/events/models.py`:** Add `managed = False` models for:
   * `VEventPostCapacity` (`db_table = "v_event_post_capacity"`, `post_id` PK)
   * `VPublicEvents` (`db_table = "v_public_events"`, `event_id` PK)
   * `VEventSummary` (`db_table = "v_event_summary"`, `event_id` PK)
   * `VAcceptedUnassigned` (`db_table = "v_accepted_unassigned"`, `application_id` PK)
   * `VEventCheckinBoard` (`db_table = "v_event_checkin_board"`, `assignment_id` PK)
   * `VPendingConfirmations` (`db_table = "v_pending_confirmations"`, `attendance_id` PK)
   * `VEventCoordinatorHistory` (`db_table = "v_event_coordinator_history"`, `changed_at` PK)
2. **In `backend/apps/audit/models.py`:** Add `managed = False` models for:
   * `VAdminDashboard` (`db_table = "v_admin_dashboard"`, `active_users` PK)
   * `VUserModerationSummary` (`db_table = "v_user_moderation_summary"`, `user_id` PK)
   * `VGeoAttemptsReview` (`db_table = "v_geo_attempts_review"`, `id` PK)

#### Step P0.4 — Gate P0 Verification
```powershell
python manage.py makemigrations accounts events coordination attendance audit
python manage.py migrate
python manage.py check
```

---

### Phase P1: Core Infrastructure & Security Context (`backend/common/` & `backend/config/`)

**Objective:** Build the security, cryptographic, session-context, and exception-translation backbone required by every service and BFF view.

#### Step P1.1 — Harden `backend/config/settings/` (`base.py`, `local.py`, `production.py`)
1. **Mandatory Environment Secrets (`base.py`):**
   * Require `DJANGO_SECRET_KEY`, `PHONE_HASH_HMAC_SECRET`, and `PHONE_ENCRYPTION_KEY` from `os.environ` (raise `ImproperlyConfigured` if any is missing or empty).
   * Default `DEBUG = False` in `base.py` and `production.py`; enable `DEBUG = True` and optional `DEV_FIXED_OTP` only in `local.py` via `.env`.
2. **Database Transaction & Atomic Context (`base.py`):**
   * Set `"ATOMIC_REQUESTS": True` inside `DATABASES["default"]` so PostgreSQL `SET LOCAL app.user_id` and `SET LOCAL app.ip` persist for the entire request transaction and reset automatically afterward.
3. **Private Verification Media Root (`base.py`):**
   * Set `VERIFICATION_MEDIA_ROOT = BASE_DIR / "private_media" / "verification_images"` (separate from public `MEDIA_ROOT`).
4. **DRF Configuration (`base.py`):**
   * `"DEFAULT_AUTHENTICATION_CLASSES": ["common.db_context.BlockedAwareTokenAuthentication"]`
   * `"DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"]`
   * `"EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler"`
   * `"DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema"`

#### Step P1.2 — Implement `backend/common/utils.py`
Implement pure, side-effect-free helpers:
1. `normalize_phone(raw_phone: str) -> str`
2. `compute_phone_hash(phone: str) -> str` (HMAC-SHA256 using `settings.PHONE_HASH_HMAC_SECRET`)
3. `compute_otp_hash(raw_code: str) -> str` (HMAC-SHA256 using `settings.PHONE_HASH_HMAC_SECRET`)
4. `encrypt_phone(phone: str) -> str` & `decrypt_phone(token: str | None) -> str | None` (Fernet using `settings.PHONE_ENCRYPTION_KEY`)
5. `generate_raw_qr_token() -> tuple[str, str]` & `hash_qr_token(raw_token: str) -> str` (SHA-256 hex)
6. `normalize_tags(tags: list[str] | None) -> list[str]` (lowercases, trims, drops empty strings, deduplicates, enforces $\le 30$ tags of $\le 50$ chars matching `tags_are_normalized()`)
7. `sanitize_and_save_verification_jpeg(user_uuid, image_type: str, uploaded_file) -> tuple[str, str]` (Pillow open $\rightarrow$ RGB conversion stripping EXIF $\rightarrow$ JPEG encode $\rightarrow$ SHA-256 hex $\rightarrow$ saves under `VERIFICATION_MEDIA_ROOT`)

#### Step P1.3 — Implement `backend/common/db_context.py`
1. `get_client_ip(request) -> str`: Extracts first IP from `X-Forwarded-For` or `REMOTE_ADDR`, validates via `ipaddress.ip_address()`, returns `""` if invalid.
2. `set_db_session_context(user_id: int | None, ip_address: str | None = None) -> None`: Executes `SELECT set_config('app.user_id', %s, true)` and `SELECT set_config('app.ip', %s, true)`.
3. `BlockedAwareTokenAuthentication(TokenAuthentication)`:
   * Resolves token user.
   * If `user.account_status == "blocked"` and `user.blocked_until` is in the past, executes `SELECT release_expired_blocks()` and refreshes `user`.
   * If `not user.is_active` or `user.account_status != "active"`, raises `AuthenticationFailed("Account is blocked or closed.")`.
   * Calls `set_db_session_context(user.id, get_client_ip(request))` and returns `(user, token)`.
4. `DbContextMiddleware`: Sets `set_db_session_context(request.user.id, get_client_ip(request))` when `request.user.is_authenticated` (supporting session-based Admin Portal views).

#### Step P1.4 — Implement `backend/common/exceptions.py`
1. Define `DomainError(Exception)` (`code`, `message`, `status_code=400`, `extra=None`), `ResourceMaskedNotFound(DomainError)` (`status_code=404`), `OwnerMonitorReadOnlyError(DomainError)` (`status_code=403`), and `PermissionDeniedError(DomainError)` (`status_code=403`).
2. Implement `log_security_event(request, action: str, entity_type: str, entity_id: int | None = None, details: dict | None = None)`: Writes an append-only row into `audit_logs` so unauthorized admin/private-data probes are recorded even when the endpoint returns HTTP `404`.
3. Implement `translate_db_exception(exc: Exception) -> DomainError`: Regex-parses PostgreSQL trigger prefixes (`capacity_full:`, `schedule_conflict:`, `permission_denied:`, `event_frozen:`, `onboarding_required:`, `qr_token_invalid:`, `otp_rate_limited:`, etc.) and constraint names (`uq_*`, `ck_*`, `ex_assignments_no_overlap`) into the exact HTTP status codes (`400`, `403`, `404`, `409`, `429`) and user-friendly messages defined in `v0_6_0_services_architecture.md`.
4. Implement `custom_exception_handler(exc, context)` returning standardized `{"error": {"code": ..., "message": ...}}` JSON payloads and never leaking raw SQL or stack traces.

#### Step P1.5 — Implement `backend/common/permissions.py`
1. `AllowListSerializerMixin`: Overrides `to_internal_value()` to reject any request body key not declared in `self.fields` with `ValidationError({key: "field_not_allowed"})`.
2. Guard functions:
   * `ensure_active_user(user)`
   * `ensure_admin(request, require_superuser: bool = False)` (logs `security.red_alert.admin_route_denied` and raises `ResourceMaskedNotFound` (`404`) on failure)
   * `ensure_approved_coordinator(user)`
   * `get_visible_event_or_404(user, event_id: int)`
   * `get_event_for_manager_or_404(user, event_id: int, require_write: bool = True)` (enforces `404` for non-managers and raises `OwnerMonitorReadOnlyError` (`403`) when `require_write=True` and `user.id == event.owner_id != event.current_coordinator_id`)
   * `can_coordinator_read_t2(actor, target_user_id: int, event) -> bool`

#### Step P1.6 — Gate P1 Verification
Write and run `apps/accounts/tests/test_common_infrastructure.py` testing phone hashing/encryption, tag normalization, `set_db_session_context`, `translate_db_exception`, and `AllowListSerializerMixin`.

---

### Phase P2: Public Read & Browsing BFF (`T0` — Domain 18)

**Objective:** Expose the unauthenticated `T0` discovery endpoints for **Tab 1 (`Open Shifts`)** using `v_public_events` and `v_event_post_capacity`, with strict `404` masking for draft or soft-deleted events (`W158`–`W161`).

#### Step P2.1 — Implement Public Serializers & Views in `backend/bff/volunteer/`
1. **`GET /api/v1/charity-fields/` (`AllowAny` — `W161`):** Returns active `CharityFields` ordered by `sort_order, code`.
2. **`GET /api/v1/events/` (`AllowAny` — `W158`):** Queries `VPublicEvents` with optional query filters:
   * `charity_field` (array containment `charity_fields__contains=[code]`)
   * `purpose_type` (`charity_event` | `help_wanted_event`)
   * `meals_provided`, `lodging_provided`, `travel_support_provided` (`bool`)
   * `compensation_kind` (`unpaid` | `arranged_outside_system`)
   * Returns `200 OK` with `[]` when no events match (friendly empty state).
3. **`GET /api/v1/events/{id}/` (`AllowAny` — `W159`):**
   * Calls `event = get_visible_event_or_404(request.user, id)`.
   * Returns `T0` public event fields + post capacities from `VEventPostCapacity`.
   * Includes `T2` fields (`onboarding_text`, `onboarding_version`, `compensation_note`) **only** if `request.user` is authenticated and holds an `'accepted'` application, active assignment, or manager role on `event`.
4. **`GET /api/v1/events/{id}/posts/` (`AllowAny` — `W160`):**
   * Calls `event = get_visible_event_or_404(request.user, id)` (so requesting posts of a `'draft'` event as an anonymous user or regular volunteer returns `404`).
   * Queries `EventPosts` joined with `VEventPostCapacity` for `event`.

#### Step P2.2 — Gate P2 Verification
Run tests verifying that published/active events and posts return `200`, while draft and soft-deleted events and their posts return `404` to anonymous users and non-managers.

---

### Phase P3: Identity, OTP Auth, Self Profile, Availability & UUID Lookup (Domains 1, 2, 3)

**Objective:** Implement the complete authentication lifecycle (`W01`–`W12`), self-profile management (`W13`–`W17`, `W25`–`W26`), volunteer availability (`W18`–`W22`, `W150`–`W151`), and public UUID lookup (`W23`–`W24`).

#### Step P3.1 — Implement `backend/services/otp_service.py`
Implement all 9 functions specified in `v0_6_0_services_architecture.md` Section 4.1:
* `request_login_otp(raw_phone, purpose="login")`
* `verify_login_otp(raw_phone, raw_code, purpose="login", display_name=None)`
* `logout_user(user, auth_token)`
* `update_user_profile(user, validated_data)`
* `replace_charity_interests(user, field_codes)`
* `set_weekly_availability_rules(user, rules_data)`
* `upsert_availability_exception(user, exc_data)` & `delete_availability_exception(user, exc_id)`
* `check_user_availability(user_id, start_at, end_at)`
* `lookup_user_by_uuid(actor, target_uuid, event_id=None)`

#### Step P3.2 — Implement `backend/bff/auth/` Views & Serializers
* `POST /api/v1/auth/otp/request/` (`AllowAny`)
* `POST /api/v1/auth/otp/verify/` (`AllowAny` — commits transaction even on `'invalid_code'` so `attempt_count` increments persist in `auth_otp`, then returns HTTP `200` on `'ok'` or HTTP `400`/`429` on failure)
* `POST /api/v1/auth/logout/` (`IsAuthenticated`)

#### Step P3.3 — Implement Self Profile, Availability & UUID Endpoints in `backend/bff/volunteer/`
* `GET /api/v1/me/` & `PATCH /api/v1/me/` (using `ProfileUpdateSerializer` with `AllowListSerializerMixin`)
* `GET /api/v1/me/charity-interests/` & `PUT /api/v1/me/charity-interests/`
* `GET /api/v1/me/availability/`, `POST /api/v1/me/availability/rules/`, `POST /api/v1/me/availability/exceptions/`, `DELETE /api/v1/me/availability/exceptions/{id}/`
* `GET /api/v1/events/{id}/check-availability/`
* `GET /api/v1/users/by-uuid/{uuid}/` (returns `T1` Minimal Public Card `{uuid, display_name}`, or `T2` card if `?event_id=` is passed by an authorized event manager for an accepted volunteer)

#### Step P3.4 — Gate P3 Verification
Run unit/API tests covering:
* 5 OTP requests allowed per hour; 6th returns `429 otp_rate_limited`.
* 5 wrong OTP code tries increment `attempt_count`; 6th returns `too_many_attempts`.
* `PATCH /api/v1/me/` with `is_admin`, `is_staff`, `is_superuser`, `account_status`, `phone_hash`, or `uuid` returns `400`.
* `PATCH /api/v1/me/` with `blood_type="O_POS"` or unpaired emergency contact returns `400`.
* `GET /api/v1/me/` includes `uuid` and decrypted `phone`, and never includes `phone_hash` or `phone_enc`.

---

### Phase P4: Verification Images & Coordinator Approval (Domains 4, 5)

**Objective:** Implement private JPEG verification upload, admin image review with automatic `users.verification_status` recomputation (`W27`–`W33`), and coordinator application/approval (`W34`–`W40`).

#### Step P4.1 — Implement Verification & Coordinator Functions in `backend/services/assignment_service.py`
* `upload_verification_image(user, image_type, uploaded_file)`
* `review_verification_image(admin_user, image_id, status, note="")`
* `apply_for_coordinator(user, notes="")`
* `decide_coordinator_profile(admin_user, target_user_id, new_status, notes=None)` (`new_status` $\in \{\text{'approved'}, \text{'suspended'}, \text{'revoked'}\}$)

#### Step P4.2 — Expose Volunteer & Admin Endpoints
1. **In `backend/bff/volunteer/`:**
   * `GET /api/v1/me/verification-images/` & `POST /api/v1/me/verification-images/` (never exposes `image_path`).
2. **In `backend/bff/coordinator/`:**
   * `GET /api/v1/me/coordinator/` & `POST /api/v1/me/coordinator/`
3. **In `backend/admin_portal/`:**
   * `GET /api/v1/admin/verification-images/{id}/file/` (streams private JPEG via `FileResponse` only after `ensure_admin(request)` passes; logs `security.warning.admin_image_view`).
   * `POST /api/v1/admin/verification-images/{id}/review/`
   * `POST /api/v1/admin/coordinators/{user_id}/{action}/` (`approve`, `suspend`, `revoke`)

#### Step P4.3 — Gate P4 Verification
Run tests verifying:
* Uploading `mock_selfie` sets `verification_status = 'pending'`; uploading a second `mock_selfie` archives the first (`is_current = False`).
* Admin approving `mock_selfie` + `id_license` automatically transitions `user.verification_status` to `'verified'` via `trg_50_vimg_after`.
* Unverified user cannot apply or be approved as a coordinator (`not_verified`).
* Admin cannot review their own verification image or approve their own coordinator profile (`ck_verification_no_self_review`, `ck_coordinator_no_self_approval`).

---

### Phase P5: Event Lifecycle, Posts, Handover, Owner-as-Monitor & Retake (Domains 6, 7)

**Objective:** Implement event creation, editing, state transitions, role posts, coordinator handover, **Owner-as-Monitor read-only enforcement**, and Owner Retake (`W41`–`W63`).

#### Step P5.1 — Implement Event & Post Functions in `backend/services/assignment_service.py`
* `create_event(coordinator_user, validated_data, charity_codes)`
* `update_event(actor, event_id, validated_data, charity_codes=None)`
* `transition_event_status(actor, event_id, target_status, cancel_reason=None)`
* `handover_event_coordinator(actor, event_id, new_coordinator_id, reason="")`
* `retake_event_coordinator(owner_user, event_id, reason="Owner retook coordination")`
* `create_event_post(actor, event_id, validated_data)`
* `update_event_post(actor, post_id, validated_data)`
* `close_event_post(actor, post_id)`

#### Step P5.2 — Expose Coordinator Endpoints in `backend/bff/coordinator/`
* `GET /api/v1/coordinator/events/` & `POST /api/v1/coordinator/events/`
* `PATCH /api/v1/coordinator/events/{id}/`
* `POST /api/v1/events/{id}/publish/`, `/activate/`, `/complete/`, `/cancel/`
* `POST /api/v1/events/{id}/handover/` & `POST /api/v1/events/{id}/retake/`
* `POST /api/v1/events/{id}/posts/`, `PATCH /api/v1/posts/{id}/`, `POST /api/v1/posts/{id}/close/`

#### Step P5.3 — Gate P5 Verification
Run tests verifying:
* Publishing an event without an open post fails with `400 publish_requires_post`; publishing with a past `start_at` fails with `400 publish_requires_future_start`.
* Editing `onboarding_text` automatically increments `onboarding_version` via `trg_01_events_before_update`.
* When Owner hands over `current_coordinator_id` to Coordinator B:
  * A row is written to `event_coordinator_history`.
  * Owner can still `GET` the Shift Console (`is_read_only_monitor = True`), but `PATCH` event or `POST` post by Owner returns `403 owner_monitor_read_only`.
  * Owner calling `POST /api/v1/events/{id}/retake/` restores `current_coordinator_id = owner_id` and unlocks write actions.

---

### Phase P6: Recruitment Applications & Smart Assignment Engine (Domains 8, 9)

**Objective:** Implement volunteer event applications, coordinator decisions, auto-assignment (`run_auto_assignment`), manual assignment (`assign_manually`), and shift confirmation/cancellation (`W64`–`W93`).

#### Step P6.1 — Implement Application & Assignment Functions in `backend/services/assignment_service.py`
* `apply_to_event_browse(user, event_id, post_id=None, note="")`
* `invite_volunteer_to_event(actor, event_id, volunteer_user_id, post_id=None, note="")`
* `decide_application(actor, application_id, new_status, post_id=None, note=None)`
* `withdraw_application(actor, application_id)`
* `run_event_auto_assignment(actor, event_id)`
* `assign_volunteer_manually(actor, application_id, post_id, group_code=None, is_group_leader=False)`
* `confirm_volunteer_assignment(user, assignment_id)`
* `cancel_volunteer_assignment(actor, assignment_id, reason="")`

#### Step P6.2 — Expose Volunteer Roster & Coordinator Shift Console Endpoints
1. **In `backend/bff/volunteer/`:**
   * `POST /api/v1/events/{id}/apply/`
   * `POST /api/v1/applications/{id}/withdraw/`
   * `GET /api/v1/me/applications/` & `GET /api/v1/me/roster/` (Tab 2 composite payload)
   * `POST /api/v1/assignments/{id}/confirm/` & `POST /api/v1/assignments/{id}/cancel/`
2. **In `backend/bff/coordinator/`:**
   * `GET /api/v1/events/{id}/shift-console/` (Tab 3 composite payload: `VEventSummary` + `VEventPostCapacity` + `VAcceptedUnassigned` + `VEventCheckinBoard` + `VPendingConfirmations` + `VEventCoordinatorHistory`)
   * `GET /api/v1/events/{id}/applications/` (returns `T2` capability profile for accepted applicants; `T1` minimal profile for pending/rejected)
   * `POST /api/v1/applications/{id}/accept/`, `/reject/`, `/waitlist/`
   * `POST /api/v1/events/{id}/assignments/auto-run/` & `POST /api/v1/events/{id}/assignments/manual/`

#### Step P6.3 — Gate P6 Verification
Run tests verifying:
* Auto-mode event accepts and auto-assigns volunteers up to capacity, then places subsequent applicants on `waitlisted`, and flips `event_posts.status` from `'open'` to `'full'`.
* Applying to an event that overlaps an existing active assignment returns `409 schedule_conflict`.
* Withdrawing an accepted application automatically cancels the volunteer's active assignment and `'expected'` attendance, and re-opens the post (`'full' -> 'open'`).

---

### Phase P7: Onboarding, QR Tokens & 4-Path Check-In (Domains 10, 11, 12, 13)

**Objective:** Implement onboarding acknowledgment (`W122`–`W125`), QR token generation/preview/redemption (`W142`–`W149`), 13-branch server-side GPS check-in (`W96`–`W109`), coordinator geo confirmation/rejection (`W113`–`W115`), and manual roll-call check-in/out/absent (`W110`–`W112`).

#### Step P7.1 — Implement `backend/services/qr_service.py` & `backend/services/geo_service.py`
Implement all functions specified in `v0_6_0_services_architecture.md` Sections 4.3 and 4.4.

#### Step P7.2 — Expose Check-In Endpoints in `backend/bff/checkin/`
* `POST /api/v1/events/{id}/onboarding/acknowledge/`
* `POST /api/v1/events/{id}/qr/` & `POST /api/v1/qr/{id}/revoke/`
* `POST /api/v1/qr/resolve/` (`AllowAny`) & `POST /api/v1/qr/redeem/` (`IsAuthenticated`)
* `POST /api/v1/events/{id}/geo-check-in/` (`IsAuthenticated` — commits `attendance_geo_attempts` row on all 13 result codes!)
* `GET /api/v1/events/{id}/attendance/pending/`
* `POST /api/v1/attendance/{id}/confirm/` & `POST /api/v1/attendance/{id}/reject/`
* `POST /api/v1/events/{id}/check-in/` (coordinator manual only; rejects `token` key with `400`), `/check-out/`, `/mark-absent/`

#### Step P7.3 — Gate P7 Verification
Run tests verifying:
* Checking in before acknowledging onboarding returns `400 onboarding_required`.
* Repeat QR check-in scan is idempotent and does not consume a second QR use (`W121`).
* Walk-in QR redemption (`qr_walkin_apply`) creates a `'pending'` application with `source='qr_walkin'`, sets `walk_in_flag=True` upon assignment, and blocks the walk-in volunteer from using `geo-check-in` (`not_eligible`).
* GPS check-in within radius sets `status='checked_in'` and `confirmation_status='pending'`; GPS check-in outside radius returns `400 outside_geofence` AND persists the failed attempt in `attendance_geo_attempts`.
* Coordinator rejecting a pending geo check-in resets `attendance.status` to `'expected'` and clears coordinates on `attendance` while preserving the attempt in `attendance_geo_attempts`.

---

### Phase P8: Two-Way Feedback, Admin Moderation, Maintenance & Schema Freeze (Domains 14, 15, 16, 17)

**Objective:** Complete post-event feedback (`W126`–`W131`), insert-to-apply admin moderation (`W132`–`W141`), scheduled maintenance commands (`W162`–`W165`), the full E2E test suite, and the frozen OpenAPI schema (`schema.yml`).

#### Step P8.1 — Implement Feedback, Moderation & Maintenance
1. **Feedback (`geo_service.submit_event_feedback` & `POST /api/v1/events/{id}/feedback/`):** Enforces event `'completed'`, rater participation, target rules across all 3 directions, and tag normalization.
2. **Admin Portal & Governance (`backend/admin_portal/views.py`):**
   * `GET /api/v1/admin/dashboard/` (`VAdminDashboard`)
   * `GET /api/v1/admin/geo-attempts/` (`VGeoAttemptsReview`)
   * `GET /api/v1/admin/users/{id}/moderation-summary/` (`VUserModerationSummary`)
   * `POST /api/v1/admin/users/{id}/{action}/` (`warn`, `block`, `unblock` for Admin; `close`, `reinstate` for Super Admin)
   * `POST /api/v1/admin/events/{id}/{action}/` (`cancel` for Admin; `delete`, `restore` for Super Admin)
   * `POST /api/v1/admin/feedback/{id}/hide/`
   * `GET /api/v1/admin/audit-logs/` (Super Admin only)
3. **Maintenance Command (`apps/audit/management/commands/run_maintenance.py`):**
   * Executes `release_expired_blocks()`, `expire_stale_applications()`, `purge_expired_otps()`, and `purge_geo_evidence('90 days')`.

#### Step P8.2 — Final E2E Test & OpenAPI Schema Freeze (Gate P8)
```powershell
python manage.py test apps bff admin_portal tests_e2e --noinput
python manage.py spectacular --file schema.yml --fail-on-warn
```

---

## 3. Definition of Done for Backend `v0.6.0`

1. `SELECT * FROM self_test();` in PostgreSQL passes all 10 database self-tests with zero leftover rows.
2. All 214 workflows in `v0_6_0_business_rules_declaration.md` are wired through `common/`, `services/`, `bff/`, and `admin_portal/`.
3. Non-admins probing `/api/v1/admin/*` receive **HTTP `404`** (not `403`) and generate a `security.red_alert.admin_route_denied` entry in `audit_logs`.
4. Event Owners whose coordination is delegated (`owner_id != current_coordinator_id`) receive `is_read_only_monitor: true` on `GET` endpoints, are blocked from write mutations with `403 owner_monitor_read_only`, and can reclaim full control via `POST /api/v1/events/{id}/retake/`.
5. `schema.yml` generates with zero warnings and is ready to drive the React Native Workshift client (`mobile/src/api/`).