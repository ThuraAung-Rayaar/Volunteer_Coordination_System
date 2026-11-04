# Volunteer Coordination System (v0.6.0) — Services, Common Infrastructure & BFF Architecture

**Version:** `v0.6.0`  
**Companion Business Rules Spec:** `v0_6_0_business_rules_declaration.md`  
**Companion SQL Schema:** `updated_volunteer_coordination_system_Database_2.sql`  
**Target Directory Root:** `backend/`  
**Architectural Mandate:** Thin Python Services + Database-First Trigger/Function Execution + Privacy-Tiered BFF Endpoints (`T0`–`T4`)

---

## 1. Architectural Overview & Layer Boundaries

Because the PostgreSQL database (`v0.6.0`) enforces all **114 `CHECK` constraints, 52 triggers, 8 state machines, composite foreign keys, GiST schedule non-overlap, and 25 stored functions**, the Python backend is strictly divided into four non-overlapping layers:

```text
React Native Mobile App (Workshift UI)          Django Admin Portal (Web)
                 │                                         │
                 ▼                                         ▼
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     backend/bff/ (REST API)     │       │     backend/admin_portal/       │
│  • Allow-list Serializers       │       │  • Admin / Super Admin Views    │
│  • T0–T4 Privacy-Tier Filtering │       │  • Private Image Stream         │
│  • 404-Not-403 Resource Masking │       │  • Insert-to-Apply Moderation   │
│  • Owner-as-Monitor Guard       │       │  • Geo Fraud Telemetry Review   │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
                 └────────────────────┬────────────────────┘
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │               backend/services/                 │
             │  • otp_service.py        • qr_service.py        │
             │  • geo_service.py        • assignment_service.py│
             │  (+ Profile, Event, Application & Admin helpers)│
             └────────────────────────┬────────────────────────┘
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │                backend/common/                  │
             │  • db_context.py   (SET LOCAL app.user_id / ip) │
             │  • exceptions.py   (PG Error -> Friendly HTTP)  │
             │  • permissions.py  (Role & 404 Masking Guards)  │
             │  • utils.py        (HMAC, Fernet, JPEG, Tags)   │
             └────────────────────────┬────────────────────────┘
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │        PostgreSQL 14+/18+ Engine (v0.6.0)       │
             │  • 22 Tables  • 52 Triggers • 25 Functions      │
             │  • 11 Views   • 114 Checks  • GiST Exclusion    │
             └─────────────────────────────────────────────────┘
```

### 1.1 The Five Golden Rules of `backend/services/`
1. **Never Reimplement SQL Triggers in Python:** Do not write Python loops to cascade event completions, calculate post `open`/`full` status, bump `onboarding_version`, or write diff rows into `audit_logs`. PostgreSQL triggers (`trg_01_*`, `trg_50_*`, `trg_95_*`) do this automatically.
2. **Always Establish Session Context First:** Every authenticated request must execute `set_db_session_context(user.id, client_ip)` inside an atomic block (`ATOMIC_REQUESTS = True`) so `app_user_id()` and `app_ip()` are populated inside PostgreSQL triggers.
3. **Commit Expected Business Result Codes:** Stored functions like `verify_otp(...)` and `geo_check_in(...)` return status codes (`'invalid_code'`, `'outside_geofence'`, `'mock_location'`) instead of raising SQL exceptions so that counter increments (`attempt_count + 1`) and anti-fraud telemetry rows (`attendance_geo_attempts`) are committed to disk. Services must let those transactions commit before returning HTTP `400` to the client.
4. **Enforce Allow-Lists at the Boundary:** Every `POST`/`PATCH`/`PUT` endpoint uses an explicit allow-list serializer that rejects unknown or privileged keys with HTTP `400` before calling any service.
5. **Enforce `404-Not-403` Masking & Owner-as-Monitor in the BFF:** If a user requests a resource they are not allowed to know exists, raise `ResourceMaskedNotFound` (HTTP `404`). If an Event Owner (`owner_id`) attempts a write operation while `owner_id != current_coordinator_id`, raise `OwnerMonitorReadOnlyError` (HTTP `403`) except on the `/retake/` endpoint.

---

## 2. Exact Project File Mapping (`backend/`)

This architecture maps directly onto your existing folder structure without introducing duplicate directories:

```text
backend/
├── manage.py
├── config/
│   ├── settings/
│   │   ├── base.py                 # ATOMIC_REQUESTS=True, DRF settings, secrets, VERIFICATION_MEDIA_ROOT
│   │   ├── local.py                # DEBUG=True (local dev only), DEV_FIXED_OTP
│   │   └── production.py           # DEBUG=False, HTTPS/HSTS hardening
│   └── urls.py                     # Mounts /api/v1/ (bff.urls) and /admin-portal/ (admin_portal.urls)
├── common/
│   ├── db_context.py               # set_db_session_context, DbContextMiddleware, BlockedAwareTokenAuthentication
│   ├── exceptions.py               # DomainError subclasses, PG trigger error parser, custom DRF exception handler
│   ├── permissions.py              # IsActiveUser, IsApprovedCoordinator, EventManagerPermission, Admin/SuperAdmin guards
│   └── utils.py                    # normalize_phone, phone_hash, encrypt/decrypt_phone, hash_token, normalize_tags, transcode_jpeg
├── apps/
│   ├── accounts/models.py          # Users (with uuid), AuthOtp, UserVerificationImages, OnboardingAcknowledgments, UserCharityInterests, VolunteerAvailabilityRules, VolunteerAvailabilityExceptions
│   ├── events/models.py            # CharityFields, Events, EventPosts, EventApplications, EventCharityFields (+ Read-Only View Models)
│   ├── coordination/models.py      # CoordinatorProfiles, EventCoordinatorHistory, Assignments
│   ├── attendance/models.py        # QrTokens, Attendance, AttendanceGeoAttempts
│   └── audit/models.py             # AuditLogs, Feedback, ModerationActions, AppSettings
├── services/
│   ├── otp_service.py              # OTP request/verify, token issue/logout, profile & availability services, UUID lookup
│   ├── assignment_service.py       # Event/Post CRUD, handover/retake, application workflows, auto/manual assignment
│   ├── qr_service.py               # QR generation, read-only preview (qr_token_status), redemption (qr_check_in / qr_walkin_apply), onboarding tick
│   └── geo_service.py              # GPS check-in (geo_check_in), confirm/reject queue, manual check-in/out/absent, feedback
├── bff/
│   ├── urls.py                     # Aggregates auth/, volunteer/, coordinator/, checkin/ under /api/v1/
│   ├── auth/                       # POST otp/request, otp/verify, logout
│   ├── volunteer/                  # Public events/posts, /me/ profile & availability, apply/withdraw, my-roster, feedback, UUID lookup
│   ├── coordinator/                # Event/Post management, handover/retake, applications accept/reject, auto/manual assign, Shift Console
│   └── checkin/                    # QR generate/resolve/redeem, onboarding ack, geo-check-in, confirm/reject, manual roll-call
└── admin_portal/
    ├── urls.py                     # Admin & Super Admin API + template routes
    └── views.py                    # Dashboard KPIs, verification image review + private stream, coordinator approval, moderation_actions, maintenance runner
```

---

## 3. Layer 1: `backend/common/` Infrastructure Specification

### 3.1 `backend/common/utils.py` (Cryptography, Tag Normalization & JPEG Sanitizer)

| Function Signature | Input $\rightarrow$ Output | Exact Operational Contract |
| :--- | :--- | :--- |
| `normalize_phone(raw_phone: str) -> str` | `str` $\rightarrow$ E.164 `str` | Strips spaces, hyphens, and parentheses; validates digits ($7..15$ digits) and leading `+`; raises `DomainError("invalid_phone")` if malformed. |
| `compute_phone_hash(phone: str) -> str` | Raw/normalized phone $\rightarrow$ 64-char hex `str` | Calls `normalize_phone(phone)`, then computes `hmac.new(settings.PHONE_HASH_HMAC_SECRET.encode(), norm.encode(), hashlib.sha256).hexdigest()`. Satisfies `ck_users_phone_hash_len` ($32..128$ chars). |
| `compute_otp_hash(raw_code: str) -> str` | 4-digit OTP `str` $\rightarrow$ 64-char hex `str` | Computes HMAC-SHA256 of `raw_code.strip()` using `settings.PHONE_HASH_HMAC_SECRET`. |
| `encrypt_phone(phone: str) -> str` | Phone `str` $\rightarrow$ Fernet token `str` | Encrypts normalized phone using `Fernet(settings.PHONE_ENCRYPTION_KEY)`. |
| `decrypt_phone(token: str \| None) -> str \| None` | Fernet token $\rightarrow$ Plain phone `str` | Decrypts `phone_enc` or `emergency_contact_phone_enc` for `T1` self-view, `T3` active-shift safety view, or `T4` admin view. |
| `generate_raw_qr_token() -> tuple[str, str]` | `()` $\rightarrow$ `(raw_token, token_hash)` | Generates `raw = secrets.token_urlsafe(32)` and `token_hash = hashlib.sha256(raw.encode()).hexdigest()`. Satisfies `ck_qr_hash_len`. |
| `hash_qr_token(raw_token: str) -> str` | `raw_token` $\rightarrow$ 64-char hex `str` | Computes `hashlib.sha256(raw_token.strip().encode()).hexdigest()`. |
| `normalize_tags(tags: list[str] \| None) -> list[str]` | `list[str]` $\rightarrow$ Normalized `list[str]` | Lowercases, trims (`btrim`), removes empty strings, deduplicates preserving order, and validates `len(result) <= 30` and each tag `1 <= len(t) <= 50`. Matches PostgreSQL `tags_are_normalized(tags)`. |
| `sanitize_and_save_verification_jpeg(user_uuid, image_type, uploaded_file) -> tuple[str, str]` | Uploaded file $\rightarrow$ `(rel_path, sha256_hex)` | Opens image with Pillow (`Image.open`), verifies image integrity, converts to RGB (stripping all EXIF metadata), encodes as `JPEG` (`quality=90`), computes 64-char lowercase hex SHA-256 (`ck_verification_sha256`), writes to `settings.VERIFICATION_MEDIA_ROOT / f"{user_uuid}/{image_type}_{uuid4().hex[:8]}.jpg"`, and returns `(relative_path, sha256_hex)` satisfying `ck_verification_image_path` (`\.jpe?g$`). |

---

### 3.2 `backend/common/db_context.py` (Session Context & `BlockedAwareTokenAuthentication`)

PostgreSQL triggers rely on `app_user_id()` (`current_setting('app.user_id', true)::BIGINT`) and `app_ip()` (`current_setting('app.ip', true)::INET`). Because Django REST Framework authenticates `Token <key>` inside the view dispatch cycle (after standard Django middleware), session context **must** be set in both places:

1. **`get_client_ip(request) -> str`:**
   * Extracts `request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()` or falls back to `request.META.get("REMOTE_ADDR", "").strip()`.
   * Validates IP syntax via Python's `ipaddress.ip_address()` so invalid strings never cause PostgreSQL `::INET` cast errors.
2. **`set_db_session_context(user_id: int | None, ip_address: str | None) -> None`:**
   * Executes parameterized `SELECT set_config('app.user_id', %s, true)` and `SELECT set_config('app.ip', %s, true)` on `django.db.connection`.
   * Because `DATABASES["default"]["ATOMIC_REQUESTS"] = True`, `is_local = true` scopes the setting strictly to the current HTTP request's database transaction.
3. **`BlockedAwareTokenAuthentication(TokenAuthentication)`:**
   * Looks up `Token` with `select_related("user")`.
   * **Lazy Block Release (`W12`):** If `user.account_status == "blocked"` and `user.blocked_until is not None` and `user.blocked_until <= timezone.now()`, calls `SELECT release_expired_blocks()` and refreshes `user`.
   * **Active Check (`W08`, `W09`, `W11`):** If `not user.is_active` or `user.account_status != "active"`, raises DRF `AuthenticationFailed("This account is blocked or closed.")`.
   * Calls `set_db_session_context(user.id, get_client_ip(request))` immediately and returns `(user, token)`.
4. **`DbContextMiddleware`:**
   * For session-authenticated requests (such as `admin_portal` views), if `request.user.is_authenticated`, calls `set_db_session_context(request.user.id, get_client_ip(request))`.

---

### 3.3 `backend/common/exceptions.py` (PostgreSQL Trigger Error Translator & Security Logger)

When a PostgreSQL trigger or constraint blocks an operation, `psycopg` raises a `django.db.Error` (`InternalError`, `IntegrityError`, `OperationalError`, or `ProgrammingError`). The custom DRF exception handler intercepts these, extracts the machine-readable prefix (`<code>: <detail>`), and translates them into clean JSON responses:

```json
{
  "error": {
    "code": "capacity_full",
    "message": "This role has reached its maximum headcount."
  }
}
```

#### Complete PostgreSQL-to-HTTP Translation Table

| PostgreSQL Exception Prefix / Constraint Name | HTTP Status | Mapped `error.code` | User-Friendly Message |
| :--- | :---: | :--- | :--- |
| `ResourceMaskedNotFound` / `Http404` / `event_not_found` / `application_not_found` / `attendance_not_found` | `404` | `not_found` | `"The requested resource was not found."` |
| `OwnerMonitorReadOnlyError` | `403` | `owner_monitor_read_only` | `"You are in read-only monitor mode while coordination is delegated. Retake coordination authority first to make changes."` |
| `permission_denied` / `account_blocked` / `append_only` (`ERRCODE 42501`) | `403` | `permission_denied` | `"This action is not available for your account."` |
| `otp_rate_limited` | `429` | `otp_rate_limited` | `"Too many verification codes requested. Please try again in an hour."` |
| `capacity_full` / `capacity_conflict` | `409` | `capacity_full` | `"No places remaining for this role or event."` |
| `schedule_conflict` / `ex_assignments_no_overlap` | `409` | `schedule_conflict` | `"You already have an overlapping shift during this time window."` |
| `uq_event_application_active` | `409` | `duplicate_application` | `"You already have an active application for this event."` |
| `uq_assignment_active` / `uq_assignment_application` | `409` | `duplicate_assignment` | `"This volunteer is already assigned to this event."` |
| `uq_assignment_group_leader` | `409` | `duplicate_group_leader` | `"This group already has an assigned team leader."` |
| `uq_feedback_event_once` / `uq_feedback_user_once` | `409` | `duplicate_feedback` | `"You have already submitted feedback for this shift."` |
| `uq_onboarding_ack_user_event_ver` | `409` | `already_acknowledged` | `"You have already acknowledged this version of the briefing."` |
| `deadline_passed` | `400` | `deadline_passed` | `"The application deadline for this event has passed."` |
| `event_not_open` / `event_ended` / `event_deleted` / `event_not_editable` | `400` | `event_not_open` | `"This event is no longer open for this action."` |
| `event_not_active` | `400` | `event_not_active` | `"Check-in is only available while the event is active."` |
| `event_frozen` | `400` | `event_frozen` | `"Completed or cancelled events are locked and cannot be edited."` |
| `event_not_completed` | `400` | `event_not_completed` | `"Feedback can only be submitted after the event is completed."` |
| `publish_requires_post` | `400` | `publish_requires_post` | `"Add at least one open role post before publishing this event."` |
| `publish_requires_future_start` | `400` | `publish_requires_future_start` | `"The event start time must be in the future to publish."` |
| `post_closed` | `400` | `post_closed` | `"This role post is closed."` |
| `walkin_disabled` | `400` | `walkin_disabled` | `"Walk-in registration is disabled for this event."` |
| `qr_token_invalid` | `400` | `qr_token_invalid` | `"This QR code is invalid, expired, revoked, or has reached its usage limit."` |
| `onboarding_required` / `stale_onboarding_version` / `not_applicant` | `400` | `onboarding_required` | `"Please read and acknowledge the latest pre-shift briefing before checking in."` |
| `not_assigned` | `400` | `not_assigned` | `"You do not have an active shift assignment for this event."` |
| `not_verified` / `coordinator_not_approved` | `400` | `not_verified` | `"Identity verification and coordinator approval are required for this action."` |
| `reason_required` / `ck_moderation_reason` | `400` | `reason_required` | `"A reason is required for this action."` |
| `invalid_transition` / `invalid_state` / `immutable` | `400` | `invalid_state` | `"This action is not valid for the current status."` |

#### Security Red-Alert Logger (`log_security_event`)
Whenever a non-admin probes an `/admin-portal/` or `/api/v1/admin/` endpoint, or a user attempts to read another user's `T3` private record without authorization:
1. Before raising `ResourceMaskedNotFound` (HTTP `404`), `log_security_event(request, action="security.red_alert.unauthorized_access", entity_type=..., entity_id=...)` inserts an entry into `AuditLogs` (using an independent database cursor/savepoint so it persists even when the view returns `404`).

---

### 3.4 `backend/common/permissions.py` (Role, Privacy-Tier & `404` Masking Guards)

| Helper / Permission Class | Enforcement Logic | Failure Behavior |
| :--- | :--- | :--- |
| `ensure_active_user(user)` | Checks `user.is_authenticated and user.is_active and user.account_status == "active"`. | Raises `PermissionDeniedError` (`401`/`403`). |
| `ensure_admin(request, require_superuser=False)` | Checks `user.is_admin and user.is_active` (and `user.is_superuser` if `require_superuser=True`). | Calls `log_security_event(request, "security.red_alert.admin_route_denied")` and raises `ResourceMaskedNotFound` (**HTTP `404`**). |
| `ensure_approved_coordinator(user)` | Queries `SELECT is_approved_coordinator(%s)` with `[user.id]`. | Raises `DomainError("coordinator_not_approved")` (`400`/`403`). |
| `get_event_for_manager_or_404(user, event_id, require_write=True)` | Loads `Events` (`deleted_at__isnull=True`). Checks if `user.is_admin` or `user.id in (event.owner_id, event.current_coordinator_id)`:<br>• If neither: raises `ResourceMaskedNotFound` (**HTTP `404`**).<br>• If `require_write=True` and `not user.is_admin` and `user.id == event.owner_id` and `event.owner_id != event.current_coordinator_id`: raises `OwnerMonitorReadOnlyError` (**HTTP `403`**).<br>• If `require_write=True` and `not user.is_admin`: verifies `is_approved_coordinator(user.id)`. | Enforces both `404` masking for non-managers and **Owner-as-Monitor read-only mode** (`C02`–`C11`). |
| `get_visible_event_or_404(user, event_id)` | Loads `Events`. If `deleted_at is not None` and `not user.is_admin`: raises `404`. If `status in ("published", "active")`: returns `event`. Otherwise, if `user` is authenticated and (`user.is_admin` or `user.id in (event.owner_id, event.current_coordinator_id)` or user has an application/assignment on `event`): returns `event`. Else raises **HTTP `404`**. | Prevents public or unauthorized users from discovering `'draft'` or `'deleted'` events (`W159`, `W160`). |
| `can_coordinator_read_t2(actor, target_user_id, event)` | Returns `True` if `actor.is_admin` or (`actor.id in (event.owner_id, event.current_coordinator_id)` and `event.status in ("published", "active")` and (`EventApplications.objects.filter(event=event, user_id=target_user_id, status="accepted").exists()` or `Assignments.objects.filter(event=event, user_id=target_user_id).exclude(status="cancelled").exists()`)). | Enforces the `T2` Event-Scoped Consent Formula. |

---

## 4. Layer 2: `backend/services/` Detailed Specification

All business operations are grouped into the four service modules in `backend/services/`:

---

### 4.1 `backend/services/otp_service.py` (Identity, OTP, Profile, Availability & UUID Lookup)

Covers **Domains 1, 2, and 3** (`W01`–`W26`, `W150`–`W151`):

1. **`request_login_otp(raw_phone: str, purpose: str = "login") -> dict` (`W01`, `W08`–`W10`, `W12`):**
   * Normalizes `raw_phone`, computes `phone_hash`.
   * Checks existing `Users` row by `phone_hash`:
     * If `account_status == "closed"` $\rightarrow$ raise `DomainError("account_closed", status=403)`.
     * If `account_status == "blocked"`: runs `SELECT release_expired_blocks()`. Reloads user; if still `"blocked"` $\rightarrow$ raise `DomainError("account_blocked", status=403)`.
   * Generates a 4-digit OTP code (`f"{secrets.randbelow(10000):04d}"`, or `settings.DEV_FIXED_OTP` when `settings.DEBUG and settings.DEV_FIXED_OTP`).
   * Computes `code_hash = compute_otp_hash(raw_code)`.
   * Executes `SELECT request_otp(%s, %s, %s)` with `[phone_hash, code_hash, purpose]`. (If rate limit $\ge 5$/hr is hit, PostgreSQL raises `otp_rate_limited`).
   * Returns `{"status": "sent", **({"dev_code": raw_code} if settings.DEBUG else {})}`.

2. **`verify_login_otp(raw_phone: str, raw_code: str, purpose: str = "login", display_name: str | None = None) -> dict` (`W02`–`W06`, `W08`–`W09`):**
   * Computes `phone_hash` and `code_hash`.
   * Calls `SELECT verify_otp(%s, %s, %s)` with `[phone_hash, code_hash, purpose]`.
   * Inspects result code:
     * If `result != "ok"`: returns `{"ok": False, "result": result}` so the caller view commits the transaction (preserving `attempt_count + 1` in `auth_otp`) and returns HTTP `400`/`429`.
   * If `result == "ok"`:
     * Runs `SELECT release_expired_blocks()`.
     * Looks up `user = Users.objects.filter(phone_hash=phone_hash).first()`.
     * If `user is None`: creates `Users` with `phone_hash=phone_hash`, `phone_enc=encrypt_phone(raw_phone)`, `display_name=(display_name or "Volunteer").strip()[:150]`, `password=None` (PostgreSQL sets `uuid DEFAULT uuidv7()`).Do not pass uuid — PostgreSQL assigns it via DEFAULT uuidv7() on insert
     * If `user.account_status != "active"` or `not user.is_active`: raises `DomainError("account_blocked", status=403)`.
     * Updates `user.last_login = timezone.now(update_fields=["last_login"])`.
     * Issues DRF token: `token, _ = Token.objects.get_or_create(user=user)`.
     * Returns `{"ok": True, "result": "ok", "token": token.key, "user": user}`.

3. **`logout_user(user, auth_token) -> None` (`W07`):**
   * Deletes `auth_token` (or `Token.objects.filter(user=user).delete()`).

4. **`update_user_profile(user: Users, validated_data: dict) -> Users` (`W14`–`W16`, `W25`–`W26`):**
   * Strictly checks `set(validated_data.keys()) <= PROFILE_EDITABLE_FIELDS`.
   * If `"skills"` in `validated_data`: normalizes via `normalize_tags(validated_data["skills"])`.
   * Handles emergency contact pairing (`W26`):
     * If `"emergency_contact_phone"` is provided: encrypts into `user.emergency_contact_phone_enc` (or sets `None` if empty).
     * Verifies `(user.emergency_contact_name is None) == (user.emergency_contact_phone_enc is None)` before save (`ck_users_emergency_pair`).
   * Verifies donation consistency (`ck_users_donation_consistency`): if `not user.is_willing_to_donate` and (`user.is_willing_to_donate_blood` or `user.is_willing_to_donate_items`), raises `DomainError("invalid_donation_flags")`.
   * Saves `user` and returns refreshed instance.

5. **`replace_charity_interests(user: Users, field_codes: list[str]) -> list[str]` (`W17`):**
   * Validates all codes exist in `CharityFields.objects.filter(active=True, code__in=field_codes)`.
   * Atomically deletes existing `UserCharityInterests` for `user` and bulk-creates the new rows.

6. **`set_weekly_availability_rules(user: Users, rules_data: list[dict]) -> list` (`W19`):**
   * Atomically deletes `VolunteerAvailabilityRules.objects.filter(user=user)` and inserts the new rules (`weekday`, `start_time`, `end_time`, `valid_from`, `valid_to`).

7. **`upsert_availability_exception(user: Users, exc_data: dict) -> VolunteerAvailabilityExceptions` & `delete_availability_exception(user: Users, exc_id: int)` (`W20`–`W21`):**
   * Creates/updates by `(user, date)` or deletes owned exception (raising `404` if not found).

8. **`check_user_availability(user_id: int, start_at, end_at) -> bool` (`W22`, `W150`–`W151`):**
   * Calls `SELECT is_user_available(%s, %s, %s)` with `[user_id, start_at, end_at]` and returns `bool`.

9. **`lookup_user_by_uuid(actor: Users, target_uuid: str, event_id: int | None = None) -> dict` (`W23`–`W24`):**
   * Queries `target = Users.objects.filter(uuid=target_uuid, account_status="active").first()`. If `None`, raises `ResourceMaskedNotFound` (`404`).
   * If `event_id` is provided: loads `event = get_event_for_manager_or_404(actor, event_id, require_write=False)` and checks `can_coordinator_read_t2(actor, target.id, event)`. If `True`, returns the `T2` Event-Scoped Volunteer Card + shift assignment/attendance status for that event.
   * Otherwise, returns strictly the `T1` Minimal Public Card (`{"uuid": str(target.uuid), "display_name": target.display_name}`).

---

### 4.2 `backend/services/assignment_service.py` (Events, Posts, Handover/Retake, Applications & Assignment Engine)

Covers **Domains 4, 5, 6, 7, 8, and 9** (`W27`–`W93`):

1. **Verification & Coordinator Profile Services (`W27`–`W40`):**
   * `upload_verification_image(user: Users, image_type: str, uploaded_file) -> UserVerificationImages`: calls `sanitize_and_save_verification_jpeg()`, inserts row into `UserVerificationImages(user=user, image_type=image_type, image_path=rel_path, file_format="jpeg", file_sha256=sha256, is_current=True)`. Triggers `trg_01_vimg_guard` and `trg_50_vimg_after` automatically archive any old image of that type and recompute `user.verification_status`.
   * `apply_for_coordinator(user: Users, notes: str = "") -> CoordinatorProfiles`: verifies `user.verification_status == "verified"` (else raises `DomainError("not_verified")`), gets or creates `CoordinatorProfiles(user=user, defaults={"status": "pending", "notes": notes})`.

2. **Event Lifecycle & Coordinator Handover/Retake (`W41`–`W58`):**
   * `create_event(coordinator_user: Users, validated_data: dict, charity_codes: list[str]) -> Events` (`W41`): verifies `ensure_approved_coordinator(coordinator_user)`, inserts `Events(owner_id=coordinator_user.id, current_coordinator_id=coordinator_user.id, **validated_data)` and attaches `EventCharityFields`.
   * `update_event(actor: Users, event_id: int, validated_data: dict, charity_codes: list[str] | None = None) -> Events` (`W42`): calls `event = get_event_for_manager_or_404(actor, event_id, require_write=True)` (enforcing **Owner-as-Monitor read-only block**), applies only `EVENT_EDITABLE_FIELDS`, saves `event` (trigger automatically bumps `onboarding_version` if `onboarding_text` changed), and updates `EventCharityFields` if provided.
   * `transition_event_status(actor: Users, event_id: int, target_status: str, cancel_reason: str | None = None) -> Events` (`W43`–`W46`): calls `get_event_for_manager_or_404(actor, event_id, require_write=True)`, sets `event.status = target_status` (and `event.cancel_reason = cancel_reason` if cancelling), and saves. PostgreSQL triggers validate publish gates (`publish_requires_post`, `publish_requires_future_start`), set lifecycle timestamps, and execute completion/cancellation cascades.
   * `handover_event_coordinator(actor: Users, event_id: int, new_coordinator_id: int, reason: str = "") -> None` (`W50`, `W52`, `W53`): calls `get_event_for_manager_or_404(actor, event_id, require_write=True)` and executes `SELECT change_event_coordinator(%s, %s, %s, %s)` with `[event_id, new_coordinator_id, actor.id, reason]`.
   * `retake_event_coordinator(owner_user: Users, event_id: int, reason: str = "Owner retook coordination") -> None` (`W51` / `C12`): loads `event = get_event_for_manager_or_404(owner_user, event_id, require_write=False)`. Verifies `owner_user.id == event.owner_id` (else `403`/`404`), and executes `SELECT change_event_coordinator(%s, %s, %s, %s)` with `[event.id, owner_user.id, owner_user.id, reason]`.

3. **Event Posts Management (`W59`–`W63`):**
   * `create_event_post(actor: Users, event_id: int, validated_data: dict) -> EventPosts`: checks `get_event_for_manager_or_404(actor, event_id, require_write=True)`, normalizes `required_skills = normalize_tags(...)`, and inserts `EventPosts`.
   * `update_event_post(actor: Users, post_id: int, validated_data: dict) -> EventPosts`: loads post, checks `get_event_for_manager_or_404(actor, post.event_id, require_write=True)`, updates allow-listed `POST_EDITABLE_FIELDS`, normalizes `required_skills`, and saves.
   * `close_event_post(actor: Users, post_id: int) -> EventPosts`: checks write manager permission, sets `post.status = "closed"`, and saves.

4. **Recruitment & Applications (`W64`–`W79`):**
   * `apply_to_event_browse(user: Users, event_id: int, post_id: int | None = None, note: str = "") -> EventApplications` (`W64`, `W67`–`W68`): verifies event is visible (`status in ("published", "active")` and `deleted_at is None`, else `404`), inserts `EventApplications(event_id=event_id, post_id=post_id, user=user, source="browse", note=note, conditions_acknowledged_at=timezone.now())`, and refreshes from DB (since `trg_01_applications_before_insert` and `trg_50_applications_after` automatically snapshot conditions, auto-accept/waitlist, and auto-assign).
   * `decide_application(actor: Users, application_id: int, new_status: str, post_id: int | None = None, note: str | None = None) -> EventApplications` (`W69`–`W71`): `new_status` $\in \{\text{"accepted"}, \text{"rejected"}, \text{"waitlisted"}\}$. Checks `get_event_for_manager_or_404(actor, app.event_id, require_write=True)`, updates `app.status = new_status`, `app.decided_by = actor`, `app.decided_at = timezone.now()`, and saves.
   * `withdraw_application(actor: Users, application_id: int) -> EventApplications` (`W72`, `W79`): verifies `actor.id == app.user_id` or `actor` is active write manager for `app.event_id` (else `404`), sets `app.status = "withdrawn"`, and saves (trigger automatically cancels any active assignment and attendance).

5. **Smart Auto-Assignment & Manual Assignment (`W80`–`W93`):**
   * `run_event_auto_assignment(actor: Users, event_id: int) -> int` (`W80`): checks `get_event_for_manager_or_404(actor, event_id, require_write=True)` and calls `SELECT run_auto_assignment(%s, %s)` with `[event_id, actor.id]`. Returns integer count of newly assigned volunteers.
   * `assign_volunteer_manually(actor: Users, application_id: int, post_id: int | None, group_code: str | None = None, is_group_leader: bool = False) -> int` (`W82`–`W84`): loads application, checks `get_event_for_manager_or_404(actor, app.event_id, require_write=True)`, and calls `SELECT assign_manually(%s, %s, %s, %s, %s)` with `[application_id, post_id, actor.id, group_code, is_group_leader]`. Returns `assignment_id`.
   * `confirm_volunteer_assignment(user: Users, assignment_id: int) -> Assignments` (`W85`): loads assignment for `user` (else `404`), sets `status = "confirmed"`, and saves.
   * `cancel_volunteer_assignment(actor: Users, assignment_id: int, reason: str = "") -> Assignments` (`W86`–`W87`): verifies `actor.id == assignment.user_id` or write manager of `assignment.event_id` (else `404`), sets `status = "cancelled"`, `cancel_reason = reason`, and saves.

---

### 4.3 `backend/services/qr_service.py` (QR Tokens & Pre-Work Onboarding)

Covers **Domains 10 and 11** (`W95`, `W121`–`W125`, `W142`–`W149`):

1. **`acknowledge_event_onboarding(user: Users, event_id: int) -> OnboardingAcknowledgments` (`W122`–`W125`):**
   * Loads visible open event (`get_visible_event_or_404(user, event_id)`).
   * Inserts `OnboardingAcknowledgments(user=user, event=event, onboarding_version=event.onboarding_version, method="app_tick")` (idempotent if already acknowledged for current version).
2. **`create_event_qr_token(actor: Users, event_id: int, purpose: str, max_uses: int | None = None, ttl_minutes: int = 240) -> dict` (`W142`–`W144`):**
   * Checks `get_event_for_manager_or_404(actor, event_id, require_write=True)`.
   * Generates `raw_token, token_hash = generate_raw_qr_token()`.
   * Inserts `QrTokens(event_id=event_id, created_by=actor, purpose=purpose, token_hash=token_hash, max_uses=max_uses, expires_at=timezone.now() + timedelta(minutes=ttl_minutes))`.
   * Returns `{"id": qr.id, "raw_token": raw_token, "purpose": qr.purpose, "expires_at": qr.expires_at, "max_uses": qr.max_uses}` (raw token is returned only once).
3. **`revoke_event_qr_token(actor: Users, qr_token_id: int) -> QrTokens` (`11.7`):**
   * Loads `QrTokens`, checks `get_event_for_manager_or_404(actor, qr.event_id, require_write=True)`, sets `qr.revoked_at = timezone.now()`, and saves.
4. **`preview_qr_token(raw_token: str) -> dict` (`W145`):**
   * Computes `token_hash = hash_qr_token(raw_token)` and calls `SELECT * FROM qr_token_status(%s)` with `[token_hash]`.
   * If no row returned, raises `DomainError("qr_token_invalid", status=400)`.
   * Returns `{"token_id": row[0], "event_id": row[1], "purpose": row[2], "is_valid": row[3], "reason": row[4]}`.
5. **`redeem_qr_token(user: Users, raw_token: str) -> dict` (`W65`, `W95`, `W121`, `W146`–`W149`):**
   * Computes `token_hash = hash_qr_token(raw_token)` and calls `status = preview_qr_token(raw_token)`.
   * If `not status["is_valid"]`: raises `DomainError("qr_token_invalid", detail=status["reason"], status=400)`.
   * Dispatches by `status["purpose"]`:
     * **`"checkin"`:** Executes `SELECT qr_check_in(%s, %s)` with `[token_hash, user.id]` $\rightarrow$ returns `{"result": "checked_in", "event_id": status["event_id"], "purpose": "checkin", "attendance_id": att_id}`.
     * **`"walkin_registration"`:** Executes `SELECT qr_walkin_apply(%s, %s)` with `[token_hash, user.id]` $\rightarrow$ returns `{"result": "walkin_applied", "event_id": status["event_id"], "purpose": "walkin_registration", "application_id": app_id}`.
     * **`"join_event"`:** Calls `apply_to_event_browse(user, status["event_id"])` and consumes token via `SELECT consume_qr_token(%s, 'join_event')`.

---

### 4.4 `backend/services/geo_service.py` (GPS Check-In, Confirmation Queue, Manual Roll-Call & Feedback)

Covers **Domains 12, 13, and 14** (`W96`–`W120`, `W126`–`W131`):

1. **`submit_geo_check_in(user: Users, event_id: int, lat: float, lon: float, accuracy_m: float, captured_at=None, is_mocked: bool = False) -> dict` (`W96`–`W109`):**
   * Executes `SELECT * FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)` with `[event_id, user.id, lat, lon, accuracy_m, captured_at, is_mocked]`.
   * Unpacks `(out_result, out_attendance_id, out_distance_m, out_confirmation)`.
   * **Crucial Transaction Rule:** Because `geo_check_in()` inserts an audit row into `attendance_geo_attempts` on every call, `submit_geo_check_in()` returns the dictionary `{"result": out_result, "attendance_id": out_attendance_id, "distance_m": out_distance_m, "confirmation_status": out_confirmation}` without raising a Python exception—allowing the database transaction to commit the telemetry row. The BFF view then returns HTTP `200` if `out_result in ("accepted", "already_checked_in")` or HTTP `400` with the mapped friendly message if rejected.
2. **`confirm_pending_geo_attendance(actor: Users, attendance_id: int, note: str | None = None) -> None` (`W113`, `W119`):**
   * Loads `att = Attendance.objects.filter(id=attendance_id).first()` (else `404`).
   * Checks `get_event_for_manager_or_404(actor, att.event_id, require_write=True)`.
   * Executes `SELECT confirm_attendance(%s, %s, %s)` with `[attendance_id, actor.id, note]`.
3. **`reject_pending_geo_attendance(actor: Users, attendance_id: int, reason: str) -> None` (`W114`):**
   * Loads `att = Attendance.objects.filter(id=attendance_id).first()` (else `404`).
   * Checks `get_event_for_manager_or_404(actor, att.event_id, require_write=True)`.
   * Executes `SELECT reject_attendance(%s, %s, %s)` with `[attendance_id, actor.id, reason]`.
4. **`manual_coordinator_check_in(actor: Users, event_id: int, volunteer_user_id: int, note: str = "") -> Attendance` (`W110`):**
   * Checks `get_event_for_manager_or_404(actor, event_id, require_write=True)`.
   * Loads `att = Attendance.objects.select_for_update().filter(event_id=event_id, user_id=volunteer_user_id).first()`. If `None`, raises `DomainError("not_assigned")`.
   * If `att.status in ("checked_in", "completed")`: returns `att` (idempotent).
   * Sets `att.status = "checked_in"`, `att.method = "coordinator_manual"`, `att.recorded_by_user = actor`, `att.checkin_at = timezone.now()`, `att.note = note or att.note`, and saves.
5. **`check_out_volunteer(actor: Users, event_id: int, volunteer_user_id: int) -> Attendance` (`W112`):**
   * Verifies `actor.id == volunteer_user_id` or `get_event_for_manager_or_404(actor, event_id, require_write=True)`.
   * Updates `att.checkout_at = timezone.now()` on a `'checked_in'` row and saves.
6. **`mark_volunteer_absent(actor: Users, event_id: int, volunteer_user_id: int, note: str = "") -> Attendance` (`W111`):**
   * Checks `get_event_for_manager_or_404(actor, event_id, require_write=True)`.
   * Updates `att.status = "absent"`, `att.note = note or att.note` on an `'expected'` row and saves.
7. **`submit_event_feedback(rater: Users, event_id: int, direction: str, score: int, tags: list[str] | None = None, comment: str = "", target_user_id: int | None = None) -> Feedback` (`W126`–`W131`):**
   * Loads visible event (`get_visible_event_or_404(rater, event_id)`).
   * Normalizes `clean_tags = normalize_tags(tags)`.
   * If `direction == "volunteer_to_event"`: forces `target_user_id = None`.
   * If `direction == "volunteer_to_coordinator"` and `target_user_id is None`: defaults `target_user_id = event.current_coordinator_id`.
   * Inserts `Feedback(event_id=event_id, rater_user=rater, target_user_id=target_user_id, direction=direction, score=score, tags=clean_tags, comment=comment)`.

---

## 5. Layer 3: BFF (`backend/bff/`) & Admin Portal (`backend/admin_portal/`) Endpoint Matrix

All mobile endpoints are mounted under `/api/v1/` via `backend/bff/urls.py`:

### 5.1 `backend/bff/auth/` — Authentication Endpoints

| Method & Path | Permission | Service Function Called | Privacy Tier & Response |
| :--- | :--- | :--- | :--- |
| `POST /api/v1/auth/otp/request/` | `AllowAny` | `otp_service.request_login_otp` | Returns `{"status": "sent"}` (+ `dev_code` in `DEBUG`). |
| `POST /api/v1/auth/otp/verify/` | `AllowAny` | `otp_service.verify_login_otp` | Commits attempt counters; returns `{"token": ..., "user": T1Profile}` on `'ok'`, or `400`/`429` on failure. |
| `POST /api/v1/auth/logout/` | `IsAuthenticated` | `otp_service.logout_user` | Returns `204 No Content`. |

### 5.2 `backend/bff/volunteer/` — Volunteer & Public Workshift Endpoints (Tabs 1, 2 & 4)

| Method & Path | Permission | Service / SQL View Used | Privacy Tier & Response |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/charity-fields/` | `AllowAny` | `CharityFields.objects.filter(active=True)` | `T0`: List of active charity field codes & labels. |
| `GET /api/v1/events/` | `AllowAny` | Queries `v_public_events` | `T0`: Paginated open shifts with filters (`charity_field`, `purpose_type`, `meals_provided`, `travel_support_provided`, `compensation_kind`). |
| `GET /api/v1/events/{id}/` | `AllowAny` | `get_visible_event_or_404` + `v_event_post_capacity` | `T0` for public; includes `T2` `onboarding_text` & `compensation_note` if caller is an accepted volunteer or manager. Draft/deleted returns `404`. |
| `GET /api/v1/events/{id}/posts/` | `AllowAny` | `get_visible_event_or_404` + `v_event_post_capacity` | `T0`: Role posts with live `assigned_count` and `remaining` capacity (`404` if event is draft). |
| `GET /api/v1/me/` | `IsAuthenticated` | Self `Users` + `UserCharityInterests` | `T1` + Self `T2`/`T3`: Includes `uuid` (for personal QR badge), decrypted phone, skills, capabilities, verification status. |
| `PATCH /api/v1/me/` | `IsAuthenticated` | `otp_service.update_user_profile` | Allow-list `ProfileUpdateSerializer`; returns updated self profile. |
| `GET/PUT /api/v1/me/charity-interests/` | `IsAuthenticated` | `otp_service.replace_charity_interests` | `T1`: List of subscribed `field_code`s. |
| `GET/POST /api/v1/me/availability/` (`rules/`, `exceptions/`) | `IsAuthenticated` | `otp_service.set_weekly_availability_rules` / `upsert_availability_exception` | `T1`: Weekly rules and date exceptions. |
| `GET /api/v1/events/{id}/check-availability/` | `IsAuthenticated` | `otp_service.check_user_availability` | Returns `{"event_id": id, "available": true/false}`. |
| `GET /api/v1/users/by-uuid/{uuid}/` | `IsAuthenticated` | `otp_service.lookup_user_by_uuid` | `T1` Minimal Public Card (`{uuid, display_name}`), or `T2` card if `?event_id=` passed by event manager for accepted volunteer. |
| `GET/POST /api/v1/me/verification-images/` | `IsAuthenticated` | `assignment_service.upload_verification_image` | `T1`: Metadata only (`image_type`, `status`, `comparison_status`, `reviewed_at` — `image_path` hidden). |
| `POST /api/v1/events/{id}/apply/` | `IsAuthenticated` | `assignment_service.apply_to_event_browse` | `T1`: Created application with `status` (`accepted`, `waitlisted`, or `pending`) and `conditions_snapshot`. |
| `POST /api/v1/applications/{id}/withdraw/` | `IsAuthenticated` | `assignment_service.withdraw_application` | `T1`: Updated application (`status = 'withdrawn'`). |
| `GET /api/v1/me/roster/` | `IsAuthenticated` | Composite BFF query (`Assignments` + `EventApplications` + `Attendance` + `OnboardingAcknowledgments`) | Powers **Tab 2 (`My Roster`)** in 1 call: active shifts, `onboarding_text` + ack status, `group_code`, `is_group_leader`, and check-in state. |
| `POST /api/v1/assignments/{id}/confirm/` | `IsAuthenticated` | `assignment_service.confirm_volunteer_assignment` | `T1`: Assignment (`status = 'confirmed'`). |
| `POST /api/v1/assignments/{id}/cancel/` | `IsAuthenticated` | `assignment_service.cancel_volunteer_assignment` | `T1`: Assignment (`status = 'cancelled'`). |
| `POST /api/v1/events/{id}/feedback/` | `IsAuthenticated` | `geo_service.submit_event_feedback` | `T1`: Created `Feedback` row (`13.1`–`13.3`). |

### 5.3 `backend/bff/coordinator/` — Coordinator Workspace Endpoints (Tab 3: Shift Console)

| Method & Path | Permission | Service / SQL View Used | Privacy Tier & Response |
| :--- | :--- | :--- | :--- |
| `GET/POST /api/v1/me/coordinator/` | `IsAuthenticated` | `assignment_service.apply_for_coordinator` | `T1`: Coordinator profile status (`pending`, `approved`, `suspended`, `revoked`). |
| `GET/POST /api/v1/coordinator/events/` | `IsApprovedCoordinator` | `v_event_summary` / `assignment_service.create_event` | Lists events where caller is `owner_id` or `current_coordinator_id` (with `is_read_only_monitor` boolean flag), or creates a new `'draft'` event. |
| `PATCH /api/v1/coordinator/events/{id}/` | Event Write Manager | `assignment_service.update_event` | Updates event (blocked in Owner-as-Monitor mode). |
| `POST /api/v1/events/{id}/{action}/` (`publish`, `activate`, `complete`, `cancel`) | Event Write Manager | `assignment_service.transition_event_status` | Transitions event status and runs cascades. |
| `POST /api/v1/events/{id}/handover/` | Event Write Manager | `assignment_service.handover_event_coordinator` | Transfers `current_coordinator_id` and logs to `event_coordinator_history`. |
| `POST /api/v1/events/{id}/retake/` | Event Owner Only (`C12`) | `assignment_service.retake_event_coordinator` | Restores `current_coordinator_id = owner_id` when Owner is in monitor mode. |
| `POST /api/v1/events/{id}/posts/` & `PATCH /api/v1/posts/{id}/` & `POST /api/v1/posts/{id}/close/` | Event Write Manager | `assignment_service.create/update/close_event_post` | Manages role posts on an open event. |
| `GET /api/v1/events/{id}/shift-console/` | Event Read Manager (`C15`) | Composite BFF query: `v_event_summary` + `v_event_post_capacity` + `v_accepted_unassigned` + `v_event_checkin_board` + `v_pending_confirmations` + `v_event_coordinator_history` | Powers **Tab 3 (`Shift Console`)** in a single HTTP request, including `is_read_only_monitor: (user.id == event.owner_id and event.owner_id != event.current_coordinator_id)`. |
| `GET /api/v1/events/{id}/applications/` | Event Read Manager (`C05`, `C07`) | `EventApplications` + `T2` Volunteer Profile | Returns `T2` semi-private capability fields for accepted volunteers (`T1` minimal fields for pending/rejected). |
| `POST /api/v1/applications/{id}/{decision}/` (`accept`, `reject`, `waitlist`) | Event Write Manager (`C06`) | `assignment_service.decide_application` | Decides application and triggers auto-assign if enabled. |
| `POST /api/v1/events/{id}/assignments/auto-run/` | Event Write Manager (`C08`) | `assignment_service.run_event_auto_assignment` | Calls `SELECT run_auto_assignment(...)` and returns `{"assigned_count": n}`. |
| `POST /api/v1/events/{id}/assignments/manual/` | Event Write Manager (`C08`) | `assignment_service.assign_volunteer_manually` | Calls `SELECT assign_manually(...)`. |

### 5.4 `backend/bff/checkin/` — Onboarding, QR & 3-Way Check-In Endpoints

| Method & Path | Permission | Service Function Called | Privacy Tier & Response |
| :--- | :--- | :--- | :--- |
| `POST /api/v1/events/{id}/onboarding/acknowledge/` | `IsAuthenticated` | `qr_service.acknowledge_event_onboarding` | Records `app_tick` for current `onboarding_version`. |
| `POST /api/v1/events/{id}/qr/` & `POST /api/v1/qr/{id}/revoke/` | Event Write Manager (`C09`) | `qr_service.create_event_qr_token` / `revoke_event_qr_token` | Generates single-return `raw_token` or revokes active token. |
| `POST /api/v1/qr/resolve/` | `AllowAny` | `qr_service.preview_qr_token` | Read-only preview via `qr_token_status()`. |
| `POST /api/v1/qr/redeem/` | `IsAuthenticated` | `qr_service.redeem_qr_token` | Dispatches to `qr_check_in()` or `qr_walkin_apply()`. |
| `POST /api/v1/events/{id}/geo-check-in/` | `IsAuthenticated` | `geo_service.submit_geo_check_in` | Calls `geo_check_in()`, commits attempt log, returns `200` on `'accepted'`/`'already_checked_in'` or `400` on rejection. |
| `GET /api/v1/events/{id}/attendance/pending/` | Event Read Manager | Queries `v_pending_confirmations` | Lists pending GPS check-ins with distance and accuracy. |
| `POST /api/v1/attendance/{id}/confirm/` & `/reject/` | Event Write Manager (`C10`) | `geo_service.confirm/reject_pending_geo_attendance` | Calls `confirm_attendance()` or `reject_attendance()`. |
| `POST /api/v1/events/{id}/check-in/` | Event Write Manager (`C10`) | `geo_service.manual_coordinator_check_in` | Strictly coordinator manual check-in (`{user_id, note}`; rejects `token`). |
| `POST /api/v1/events/{id}/check-out/` & `/mark-absent/` | Event Write Manager (`C10`) | `geo_service.check_out_volunteer` / `mark_volunteer_absent` | Records `checkout_at` or sets `status = 'absent'`. |

### 5.5 `backend/admin_portal/` — Admin & Super Admin Governance Endpoints (`A01`–`A12`)

All routes in `admin_portal/` enforce `ensure_admin(request, require_superuser=...)` (logging `security.red_alert.admin_route_denied` and returning **HTTP `404`** if an unauthorized user probes them):

| Method & Path | Required Admin Tier | Action / View Executed |
| :--- | :--- | :--- |
| `GET /api/v1/admin/dashboard/` | Admin (`A01`) | Queries `v_admin_dashboard`. |
| `GET /api/v1/admin/verification-images/{id}/file/` | Admin (`A06`) | Streams private JPEG from `VERIFICATION_MEDIA_ROOT` via `FileResponse` and logs `security.warning.admin_image_view`. |
| `POST /api/v1/admin/verification-images/{id}/review/` | Admin (`A06`) | Approves or rejects verification image (`trg_50_vimg_after` recomputes `users.verification_status`). |
| `POST /api/v1/admin/coordinators/{user_id}/{action}/` (`approve`, `suspend`, `revoke`) | Admin (`A06`) | Transitions `CoordinatorProfiles.status`. |
| `POST /api/v1/admin/users/{id}/warn/` & `/block/` & `/unblock/` | Admin (`A09`) | Inserts into `ModerationActions` (`user_warning`, `user_block`, `user_unblock`); trigger applies side effect. |
| `POST /api/v1/admin/users/{id}/close/` & `/reinstate/` | **Super Admin (`A10`)** | Inserts into `ModerationActions` (`account_close`, `account_reinstate`). |
| `POST /api/v1/admin/events/{id}/cancel/` | Admin (`A07`) | Inserts `ModerationActions(action_type='event_cancel', reason=...)`. |
| `POST /api/v1/admin/events/{id}/delete/` & `/restore/` | **Super Admin (`A08`)** | Inserts `ModerationActions(action_type='event_delete' / 'event_restore', reason=...)`. |
| `POST /api/v1/admin/feedback/{id}/hide/` | Admin (`A07`) | Inserts `ModerationActions(action_type='feedback_hide', reason=...)`. |
| `GET /api/v1/admin/geo-attempts/` | Admin (`A04`) | Queries `v_geo_attempts_review` for GPS spoofing/fraud review. |
| `GET /api/v1/admin/audit-logs/` | **Super Admin (`A05`)** | Paginated read-only query over `AuditLogs` (including `security.red_alert.*` events). |

---

## 6. Read-Only ORM View Models (in `apps/events/models.py` & `apps/audit/models.py`)

To query the 11 PostgreSQL views cleanly from `bff/` and `admin_portal/` without raw SQL cursor boilerplate, declare lightweight `managed = False` models for the operational views:

* `PublicEventView` (`db_table = "v_public_events"`, `primary_key = "event_id"`)
* `EventPostCapacityView` (`db_table = "v_event_post_capacity"`, `primary_key = "post_id"`)
* `EventSummaryView` (`db_table = "v_event_summary"`, `primary_key = "event_id"`)
* `AcceptedUnassignedView` (`db_table = "v_accepted_unassigned"`, `primary_key = "application_id"`)
* `EventCheckinBoardView` (`db_table = "v_event_checkin_board"`, `primary_key = "assignment_id"`)
* `PendingConfirmationView` (`db_table = "v_pending_confirmations"`, `primary_key = "attendance_id"`)
* `EventCoordinatorHistoryView` (`db_table = "v_event_coordinator_history"`, `primary_key = "changed_at"`)
* `AdminDashboardView` (`db_table = "v_admin_dashboard"`, `primary_key = "active_users"`)
* `UserModerationSummaryView` (`db_table = "v_user_moderation_summary"`, `primary_key = "user_id"`)
* `GeoAttemptsReviewView` (`db_table = "v_geo_attempts_review"`, `primary_key = "id"`)