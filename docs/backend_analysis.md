# Backend Analysis — Volunteer HR Management System
> **Generated:** 2026-11-15 | **Updated:** 2026-11-19 | **Target folder:** `python_stack/backend/` | **Framework:** Django 5.1 / DRF 3.15 | **Release:** v0.11.1 (Full Role Capability Parity Verified)

---

## Table of Contents
1. [Top-Level Folder Structure](#1-top-level-folder-structure)
2. [Configuration & Settings](#2-configuration--settings)
3. [Database Connection](#3-database-connection)
4. [Django Apps & Models](#4-django-apps--models)
5. [Services Layer](#5-services-layer)
6. [BFF (Backend-For-Frontend) API Layer](#6-bff-backend-for-frontend-api-layer)
7. [Admin Portal](#7-admin-portal)
8. [Common Infrastructure](#8-common-infrastructure)
9. [URL Routing Overview](#9-url-routing-overview)
10. [Migrations State](#10-migrations-state)
11. [Test Coverage Summary](#11-test-coverage-summary)
12. [Dependencies](#12-dependencies)
13. [Deployment](#13-deployment)
14. [What Is Implemented vs. Pending](#14-what-is-implemented-vs-pending)

---

## 1. Top-Level Folder Structure

```
python_stack/backend/
├── admin_portal/           # Web UI for administrators (HTML templates + API views)
├── apps/                   # Django application packages
│   ├── accounts/           # User identity, OTP auth, verification, availability
│   ├── audit/              # Audit logs, feedback, moderation actions, app settings
│   ├── attendance/         # QR tokens, attendance records, geo check-in attempts
│   ├── coordination/       # Coordinator profiles, assignments, event handover history
│   └── events/             # Events, event posts, applications, charity field taxonomy
├── bff/                    # Backend-For-Frontend: mobile-oriented REST API
│   ├── auth/               # OTP login/logout endpoints
│   ├── volunteer/          # Volunteer self-service (profile, events, applications)
│   ├── checkin/            # Attendance, QR, geo check-in, feedback, onboarding
│   └── coordinator/        # Coordinator event CRUD, assignments, application review
├── common/                 # Cross-cutting: auth, DB context, permissions, exceptions
├── config/                 # Django project settings and URL router
│   ├── settings/
│   │   ├── base.py         # Shared settings (apps, DB, DRF, middleware, media)
│   │   ├── local.py        # Dev overrides
│   │   └── production.py   # Production overrides
│   ├── urls.py             # Root URL dispatcher
│   ├── asgi.py / wsgi.py   # ASGI/WSGI entry points
│   └── test_runner.py      # Custom test runner (SQL file fixtures)
├── services/               # Business logic layer (~19 service modules)
├── tests/                  # Cross-phase capability parity tests (test_v0_11_0_capability_parity.py)
├── tests_e2e/              # End-to-end lifecycle tests
├── media/                  # Uploaded media (public)
├── private_media/          # Private uploads (verification images)
├── requirements/
│   ├── base.txt            # Core production deps
│   └── local.txt           # Dev/test extras (ruff, pytest-django)
├── Dockerfile
├── manage.py
└── schema.yml              # Pre-generated OpenAPI 3.0 schema (206 KB)
```

---

## 2. Configuration & Settings

**File:** `config/settings/base.py`

### Installed Apps

| Group | Apps |
|---|---|
| **Django built-ins** | `django.contrib.admin`, `auth`, `contenttypes`, `sessions`, `messages`, `staticfiles`, `postgres` |
| **Third-party** | `rest_framework`, `rest_framework.authtoken`, `corsheaders`, `django_filters`, `drf_spectacular` |
| **Local apps** | `apps.accounts`, `apps.events`, `apps.coordination`, `apps.attendance`, `apps.audit`, `admin_portal`, `bff` |

### Key Settings

| Setting | Value |
|---|---|
| `AUTH_USER_MODEL` | `accounts.Users` (custom user model) |
| `ATOMIC_REQUESTS` | `True` — every HTTP request runs in a PostgreSQL transaction |
| `ROOT_URLCONF` | `config.urls` |
| `TIME_ZONE` | `UTC` |
| `DEFAULT_AUTO_FIELD` | `BigAutoField` |
| `API version` | `0.6.0` (from drf_spectacular title) |

### REST Framework (DRF) Config

```python
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES':    ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'common.authentication.BlockedAwareTokenAuthentication',  # custom
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_THROTTLE_RATES': { 'anon': '60/min', 'user': '300/min' },
    'EXCEPTION_HANDLER': 'common.exceptions.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'common.schema.CleanAutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'PageNumberPagination',
    'PAGE_SIZE': 50,
}
```

### Middleware Stack (in order)

1. `SecurityMiddleware`
2. `CorsMiddleware` (CORS headers)
3. `SessionMiddleware`
4. `CommonMiddleware`
5. `CsrfViewMiddleware`
6. `AuthenticationMiddleware`
7. **`common.db_context.DbContextMiddleware`** ← custom; injects `app.user_id` into PostgreSQL session
8. `MessageMiddleware`
9. `XFrameOptionsMiddleware`

### Media Settings

| Setting | Path |
|---|---|
| `MEDIA_ROOT` | `backend/media/` |
| `VERIFICATION_MEDIA_ROOT` | `backend/private_media/verification_images/` |
| `STATIC_ROOT` | `backend/staticfiles/` |
| `STATICFILES_DIRS` | `admin_portal/static/` |

---

## 3. Database Connection

### Connection Config (`base.py`)

```python
DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.postgresql',  # psycopg3
        'NAME':     os.getenv('DB_NAME',     'volunteer_coordination_db'),
        'USER':     os.getenv('DB_USER',     'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
        'HOST':     os.getenv('DB_HOST',     '127.0.0.1'),
        'PORT':     os.getenv('DB_PORT',     '5432'),
        'ATOMIC_REQUESTS': True,
    }
}
```

All values are environment-variable-driven; defaults are dev-only. `.env` is loaded from both `backend/` and the project root.

### Session Context Injection — `common/db_context.py`

This is a critical pattern. PostgreSQL triggers read two session-local variables to attribute actions:

```sql
-- triggers call:
current_setting('app.user_id', true)   -- actor's user ID
current_setting('app.ip', true)        -- client IP
```

Django sets these at the **start of every transaction** using:

```python
cursor.execute(
    "SELECT set_config('app.user_id', %s, true), set_config('app.ip', %s, true)",
    [str(user_id), ip_address]
)
```

**Two injection points:**

| Path | When |
|---|---|
| `BlockedAwareTokenAuthentication.authenticate_credentials()` | DRF Token auth (BFF/API requests) |
| `DbContextMiddleware.__call__()` | Session auth (admin portal requests) |

Because `ATOMIC_REQUESTS=True`, the `SET LOCAL` persists for the entire request and is automatically discarded on commit/rollback. Anonymous requests receive an empty `app.user_id` (triggers treat `NULL` as a system/trusted operation).

### Schema Authority

> [!IMPORTANT]
> Django is **NOT** the schema authority. **All 15+ tables are declared with `managed = False`** in every model. The PostgreSQL schema (`updated_volunteer_coordination_system_Database.sql`) owns all DDL, constraints, triggers, and stored functions. Django only reads and writes records.

---

## 4. Django Apps & Models

All models use `managed = False` (schema managed by PostgreSQL, not Django migrations).

### 4.1 `apps.accounts` — User Identity & Auth

**Purpose:** Core user model, OTP authentication, phone privacy, ID verification, charity interests, availability.

| Model | DB Table | Key Fields |
|---|---|---|
| `Users` | `users` | `id`, `phone_hash` (HMAC), `phone_enc` (AES), `display_name`, `account_status` (`active`/`blocked`/`closed`), `is_admin`, `is_superuser`, `is_verified`, `is_active`, `last_login` |
| `AuthOtp` | `auth_otp` | `id`, `phone_hash`, `code_hash`, `purpose`, `attempt_count`, `expires_at`, `used_at` |
| `UserVerificationImages` | `user_verification_images` | `id`, `user`, `image_path`, `status` (`pending`/`approved`/`rejected`), `reviewed_by`, `reviewed_at` |
| `OnboardingAcknowledgments` | `onboarding_acknowledgments` | `id`, `user`, `event`, `onboarding_version`, `acknowledged_at` |
| `UserCharityInterests` | `user_charity_interests` | `id`, `user`, `charity_field` (FK→`charity_fields`) |
| `VolunteerAvailabilityRules` | `volunteer_availability_rules` | `id`, `user`, `day_of_week` (0–6), `start_time`, `end_time`, `is_available` |
| `VolunteerAvailabilityExceptions` | `volunteer_availability_exceptions` | `id`, `user`, `exception_date`, `is_available`, `start_time`, `end_time`, `reason` |

**Custom User Model Notes:**
- `AUTH_USER_MODEL = 'accounts.Users'` — Django's auth system uses this model
- Phone number stored as HMAC hash (`phone_hash`) + AES-encrypted blob (`phone_enc`) — raw phone is never persisted
- `is_verified` flag set when at least one `UserVerificationImages` row is approved

---

### 4.2 `apps.events` — Events & Applications

**Purpose:** Charity field taxonomy, event lifecycle, event posts (capacity slots), volunteer applications.

| Model | DB Table | Key Fields |
|---|---|---|
| `CharityFields` | `charity_fields` | `code` (PK, slug), `label`, `description` |
| `Events` | `events` | `id`, `title`, `description`, `purpose_type`, `status` (`draft`/`published`/`active`/`completed`/`cancelled`), `owner` (FK→`users`), `current_coordinator` (FK→`users`), `latitude`, `longitude`, `geo_radius_m`, `geo_checkin_enabled`, `start_at`, `end_at`, `application_deadline`, `acceptance_mode` (`manual`/`auto`/`open`), `auto_assign_enabled`, `max_participants`, `onboarding_text`, `require_onboarding_ack`, `qr_registration_enabled`, `deleted_at` |
| `EventPosts` | `event_posts` | `id`, `event`, `title`, `description`, `capacity`, `status` (`open`/`closed`), `created_at` |
| `EventApplications` | `event_applications` | `id`, `event`, `user`, `post` (nullable FK), `status` (`pending`/`accepted`/`rejected`/`withdrawn`/`waitlisted`), `application_note`, `applied_at`, `reviewed_at`, `reviewed_by` |
| `EventCharityFields` | `event_charity_fields` | `event`, `charity_field` (composite PK) |

**View Models (read-only DB views mapped to `managed=False` models):**

| Django Model | DB View | Purpose |
|---|---|---|
| `VEventPostCapacity` | `v_event_post_capacity` | Capacity + assigned count per post |
| `VPublicEvents` | `v_public_events` | Published/active events with safe public fields |
| `VEventSummary` | `v_event_summary` | Aggregate counts (applicants, assigned, attended) per event |

---

### 4.3 `apps.attendance` — QR, Attendance & Geo Check-in

**Purpose:** QR token lifecycle, attendance recording (all three check-in methods), geo check-in attempt telemetry.

| Model | DB Table | Key Fields |
|---|---|---|
| `QrTokens` | `qr_tokens` | `id`, `event`, `created_by` (coordinator), `token` (UUID), `purpose` (`checkin`), `used_at`, `revoked_at`, `expires_at` |
| `Attendance` | `attendance` | `id`, `event`, `user`, `assignment` (nullable FK), `checkin_method` (`qr`/`geo`/`manual`), `checkin_at`, `checkout_at`, `confirmation_status` (`auto_confirmed`/`pending`/`confirmed`/`rejected`) |
| `AttendanceGeoAttempts` | `attendance_geo_attempts` | `id`, `event`, `user`, `latitude`, `longitude`, `accuracy_m`, `is_mocked`, `result_code`, `distance_m`, `captured_at`, `created_at` |

**View Models:**

| Django Model | DB View | Purpose |
|---|---|---|
| `VEventCheckinBoard` | `v_event_checkin_board` | Full check-in roster per event (coordinator view) |
| `VEventCheckinStatus` | `v_event_checkin_status` | Per-user check-in status for each event |
| `VPendingConfirmations` | `v_pending_confirmations` | Attendance rows awaiting coordinator confirmation |
| `VGeoAttemptsReview` | `v_geo_attempts_review` | Geo attempts with event + user context for admin/coordinator review |

---

### 4.4 `apps.coordination` — Coordinator Profiles & Assignments

**Purpose:** Coordinator role management, event-volunteer assignment records, coordinator handover history.

| Model | DB Table | Key Fields |
|---|---|---|
| `CoordinatorProfiles` | `coordinator_profiles` | `user` (OneToOne PK, FK→`users`), `status` (`pending`/`approved`/`suspended`/`revoked`), `approved_by`, `approved_at`, `notes` |
| `EventCoordinatorHistory` | `event_coordinator_history` | `id`, `event`, `from_coordinator`, `to_coordinator`, `changed_by_user`, `reason`, `changed_at` |
| `Assignments` | `assignments` | `id`, `event`, `application`, `user`, `post` (nullable), `group_code`, `is_group_leader`, `status` (`assigned`/`confirmed`/`completed`/`cancelled`), `assigned_by` (`auto`/`coordinator`/`admin`), `schedule_start`, `schedule_end`, `confirmed_at`, `cancelled_at`, `conditions_snapshot` |

**Unique Constraints on `Assignments`:**
- One active assignment per (event, user) — prevents double-assignment
- One active assignment per application — prevents one application spawning two slots
- One group leader per (event, group_code) — group integrity

**View Models:**

| Django Model | DB View | Purpose |
|---|---|---|
| `VEventCoordinatorHistory` | `v_event_coordinator_history` | Handover history with coordinator display names |

---

### 4.5 `apps.audit` — Audit, Feedback & Moderation

**Purpose:** Immutable audit trail, volunteer/coordinator feedback, admin moderation actions, app-level settings, admin dashboard metrics.

| Model | DB Table | Key Fields |
|---|---|---|
| `AuditLogs` | `audit_logs` | `id`, `actor_user`, `action`, `entity_type`, `entity_id`, `before_data` (JSON), `after_data` (JSON), `ip_address`, `created_at` |
| `Feedback` | `feedback` | `id`, `event`, `rater_user`, `target_user` (nullable), `direction` (`coordinator_to_volunteer`/`volunteer_to_event`/`volunteer_to_coordinator`), `score`, `tags` (array), `comment`, `status` (`active`/`hidden`) |
| `ModerationActions` | `moderation_actions` | `id`, `admin_user`, `target_user`, `event`, `feedback`, `action_type`, `reason`, `expires_at` |
| `AppSettings` | `app_settings` | `key` (PK), `value_int`, `description` |

**Moderation Action Types:**
`user_warning`, `user_block`, `user_unblock`, `account_close`, `account_reinstate`, `event_delete`, `event_restore`, `event_cancel`, `feedback_hide`

**View Models:**

| Django Model | DB View | Purpose |
|---|---|---|
| `VUserModerationSummary` | `v_user_moderation_summary` | Per-user warning/block counts and last dates |
| `VAdminDashboard` | `v_admin_dashboard` | Live aggregate: active users, events by status, pending confirmations, warnings |

---

## 5. Services Layer

**Directory:** `backend/services/` — 19 service modules

The services layer contains **all business logic**, keeping views thin. Services call PostgreSQL stored functions for complex operations and never re-implement DB-side logic.

| Service Module | Responsibility |
|---|---|
| `auth_service.py` | OTP request → PostgreSQL `request_otp()`, OTP verify → `verify_otp()`, token issue/revoke, lazy block release via `release_expired_blocks()`, pluggable `OtpDeliveryAdapter` registry, `OTP_CONSOLE_PASSTHROUGH` dev support, and integration foundation for tokenized authentication (`docs/tokenization_login_architecture.md`) |
| `otp_service.py` | Authoritative shim: delegates authentication and OTP workflows to `auth_service.py` (`request_login_otp`, `verify_login_otp`, `logout_user`, `purge_expired_tokens`) |
| `event_service.py` | Event CRUD, lifecycle transitions (`draft→published→active→completed`), coordinator handover (`change_event_coordinator()` SQL fn), charity field associations, and handover history tracking |
| `event_post_service.py` | Event post (capacity slot) creation, closing, and post capacity monitoring |
| `application_service.py` | Volunteer application submission, accept/reject/waitlist decisions, withdrawal, `invite_volunteer_to_event()` logic, and complete permitted Tier-2 applicant data retrieval |
| `assignment_service.py` | Auto-assign (`run_auto_assignment()` SQL fn), manual assign (`assign_manually()` SQL fn), confirm/cancel assignments, and enriched assignment queries with application metadata |
| `attendance_service.py` | QR check-in (`qr_check_in()` SQL fn), manual check-in, coordinator check-out, confirmation/rejection, and sanitized attendance history tracking |
| `geo_service.py` | GPS check-in via `geo_check_in()` SQL fn; returns 13 result codes; never re-computes Haversine distance in Python |
| `qr_service.py` | QR token creation, revocation, resolve/redeem lifecycle |
| `coordinator_service.py` | Coordinator application, approval/suspension/revocation workflows |
| `profile_service.py` | User profile read/update, charity interest management |
| `verification_service.py` | Verification image upload (validation: max 5 MB, 200–6000 px), admin review (approve/reject) |
| `availability_service.py` | Weekly availability rules CRUD, exception dates CRUD, conflict-check against event schedule |
| `onboarding_service.py` | Onboarding acknowledgment recording per event version, status check |
| `query_service.py` | Read-only query orchestration: public event list (via `v_public_events`), event detail, event post list (via `v_event_post_capacity`), event summary (via `v_event_summary`) |
| `feedback_service.py` | Feedback submission (all three directions: volunteer-to-event, coordinator-to-volunteer, volunteer-to-coordinator), score/tag validation, and feedback summaries |
| `moderation_service.py` | Admin moderation actions: block/unblock user, close/reinstate account, cancel/delete/restore events, hide feedback |
| `audit_service.py` | Write audit log entries, query audit log history, and `get_event_history()` for manager-scoped event audit trails |
| `maintenance_service.py` | Scheduled maintenance: `run_maintenance()` SQL fn (OTP cleanup, block expiry, stale data) |

### Key Service Patterns

> [!NOTE]
> **Database-first delegation:** Services explicitly state "Database-first rules honoured here" and delegate all constraint enforcement, state machine transitions, and complex computations to PostgreSQL stored functions. Python code performs only request-level authorization and orchestration.

```python
# Example: auto-assignment delegates entirely to SQL
cursor.execute("SELECT run_auto_assignment(%s, %s)", [event_id, actor.id])

# Example: geo check-in delegates to SQL (never recomputes Haversine in Python)
cursor.execute("SELECT * FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)", [...])
```

---

## 6. BFF (Backend-For-Frontend) API Layer

**Base prefix:** `/api/bff/mobile/` → `bff/urls.py`

The BFF is organized into 4 sub-packages. Many endpoints have both a canonical path and a convenience alias.

### 6.1 Auth — `/api/bff/mobile/auth/`

#### Production & Baseline Routes
| Method | Path | View | Description |
|---|---|---|---|
| POST | `otp/request/` | `OtpRequestView` | Request login OTP for phone number |
| POST | `otp/verify/` | `OtpVerifyView` | Verify OTP → issue DRF token |
| POST | `logout/` | `LogoutView` | Delete auth token (logout) |

> Aliases: `request-otp/` = `otp/request/`, `verify-otp/` = `otp/verify/`

#### Tokenization Authentication Specification (Ready for Rollout)
*Detailed architecture and specifications defined in:* [tokenization_login_architecture.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/tokenization_login_architecture.md)
- `POST /api/v1/auth/tokenized/request-otp/`: Accepts client-side encrypted Client Identity Token (CIT), issues ephemeral `auth_session_token` (180s TTL), and asynchronously enqueues SMS dispatch.
- `POST /api/v1/auth/tokenized/verify-otp/`: Approves login using `auth_session_token` and `code` without ever re-transmitting raw phone PII.
- `OtpDeliveryAdapter` framework supporting Console (Dev), Twilio Verify, AWS SNS, Telecom SMPP, and automated failover.

---

### 6.2 Volunteer — `/api/bff/mobile/volunteer/` (also mounted at root)

#### Taxonomy & Public Events (Phase 2)
| Method | Path | View | Description |
|---|---|---|---|
| GET | `charity-fields/` | `CharityFieldsListView` | List all charity field categories |
| GET | `events/` | `PublicEventListView` | Browse public events (filterable, paginated) |
| GET | `events/<id>/` | `PublicEventDetailView` | Public event detail |
| GET | `events/<id>/posts/` | `PublicEventPostsView` | Event posts with capacity |

#### User Profile (Phase 3)
| Method | Path | View | Description |
|---|---|---|---|
| GET/PATCH | `me/` | `MeProfileView` | Own profile read/update |
| GET/POST/DELETE | `me/charity-interests/` | `MeCharityInterestsView` | Manage charity field interests |
| GET | `users/by-uuid/<uuid>/` | `UserByUuidView` | Lookup user by UUID |

#### Availability (Phase 3)
| Method | Path | View | Description |
|---|---|---|---|
| GET/PUT | `me/availability/` | `MeAvailabilityView` | Weekly availability rules (all days) |
| GET/POST | `me/availability/rules/` | `MeAvailabilityRulesView` | Individual rule management |
| GET/POST | `me/availability/exceptions/` | `MeAvailabilityExceptionsView` | Exception dates list/create |
| GET/PUT/DELETE | `me/availability/exceptions/<id>/` | `MeAvailabilityExceptionDetailView` | Single exception |
| POST | `me/availability/check/` | `EventCheckAvailabilityView` | Check availability against event window |

#### Identity Verification & Coordinator (Phase 4)
| Method | Path | View | Description |
|---|---|---|---|
| GET/POST | `me/verification-images/` | `MeVerificationImagesView` | Upload/view verification images |
| GET/POST | `me/coordinator/` | `MeCoordinatorView` | View coordinator profile / apply |

#### Applications & Assignments (Phase 6)
| Method | Path | View | Description |
|---|---|---|---|
| POST | `events/<id>/apply/` | `EventApplyView` | Apply to an event |
| GET | `me/applications/` | `MyApplicationsView` | List own applications |
| POST | `applications/<id>/withdraw/` | `ApplicationWithdrawView` | Withdraw application |
| GET | `me/assignments/` | `MyAssignmentsView` | List own assignments |
| POST | `assignments/<id>/confirm/` | `AssignmentConfirmView` | Confirm assignment |
| POST | `assignments/<id>/cancel/` | `AssignmentCancelView` | Cancel assignment |

---

### 6.3 Check-in — `/api/bff/mobile/checkin/` (also mounted at root)

#### Onboarding
| Method | Path | Description |
|---|---|---|
| GET | `events/<id>/onboarding/` | Get onboarding briefing text |
| POST | `events/<id>/onboarding/acknowledge/` | Record acknowledgment |

#### QR Tokens
| Method | Path | Description |
|---|---|---|
| POST | `qr/resolve/` | Resolve a QR code payload |
| POST | `qr/redeem/` | Redeem QR for check-in |
| POST | `coordinator/events/<id>/qr-tokens/` | Create a new QR token |
| POST | `coordinator/qr-tokens/<id>/revoke/` | Revoke a QR token |

#### Check-in (flat paths + RESTful aliases)
| Method | Path | Description |
|---|---|---|
| POST | `attendance/qr-checkin/` | QR-based check-in |
| POST | `attendance/manual-checkin/` | Manual/coordinator check-in |
| POST | `attendance/geo-checkin/` | GPS geolocation check-in |
| POST | `attendance/<id>/checkout/` | Check out (end shift) |
| POST | `events/<id>/geo-checkin/` | (alias) |
| POST | `events/<id>/checkin/` | (alias) |
| POST | `events/<id>/checkout/` | (alias) |

#### Volunteer History & Feedback
| Method | Path | Description |
|---|---|---|
| GET | `me/attendance/` | Own attendance history |
| POST | `events/<id>/feedback/` | Submit feedback |
| GET | `events/<id>/feedback/list/` | List feedback for event |
| GET | `me/feedback/` | Own feedback history |

#### Coordinator Attendance Management
| Method | Path | Description |
|---|---|---|
| GET | `coordinator/events/<id>/attendance/` | Full check-in board |
| GET | `coordinator/events/<id>/attendance/pending/` | Pending confirmations |
| GET | `coordinator/events/<id>/geo-attempts/` | Geo attempt review |
| POST | `coordinator/attendance/<id>/confirm/` | Confirm attendance |
| POST | `coordinator/attendance/<id>/reject/` | Reject attendance |

---

### 6.4 Coordinator — `/api/bff/mobile/coordinator/` (also mounted at root)

#### Coordinator Application
| Method | Path | Description |
|---|---|---|
| POST | `apply/` | Apply to become a coordinator |

#### Event CRUD & Lifecycle
| Method | Path | Description |
|---|---|---|
| GET/POST | `coordinator/events/` | List own events / create new event |
| GET/PATCH | `coordinator/events/<id>/` | Event detail / update |
| POST | `events/<id>/publish/` | Draft → Published |
| POST | `events/<id>/activate/` | Published → Active |
| POST | `events/<id>/complete/` | Active → Completed |
| POST | `events/<id>/cancel/` | Cancel event (from draft/published/active) |
| POST | `events/<id>/handover/` | Hand over coordination to another coordinator |
| POST | `events/<id>/retake/` | Original owner retakes coordination |

#### Event Posts
| Method | Path | Description |
|---|---|---|
| GET/POST | `coordinator/events/<id>/posts/` | List / create event posts |
| GET/PATCH | `posts/<id>/` | Post detail / update |
| POST | `posts/<id>/close/` | Close a post (stop accepting applicants) |

#### Applications, Assignments & Coordination Operations
| Method | Path | Description |
|---|---|---|
| GET | `coordinator/events/<id>/applications/` | List applications for event |
| POST | `applications/<id>/accept/` | Accept an application |
| POST | `applications/<id>/reject/` | Reject an application |
| POST | `applications/<id>/waitlist/` | Move to waitlist |
| POST | `coordinator/events/<id>/invite/` | Invite a volunteer to event (`CoordinatorInviteView`) |
| POST | `coordinator/events/<id>/auto-assign/` | Run auto-assignment algorithm |
| POST | `coordinator/events/<id>/manual-assign/` | Manually assign a volunteer |
| GET | `coordinator/events/<id>/assignments/` | List event assignments |
| GET | `coordinator/events/<id>/unassigned/` | List accepted-but-unassigned volunteers |
| GET | `coordinator/events/<id>/post-capacity/` | Capacity breakdown per post |
| GET | `coordinator/events/<id>/summary/` | Aggregate metrics summary for event |
| GET | `coordinator/events/<id>/history/` | Handover and lifecycle audit history (`EventHistoryView`) |
| GET | `coordinator/feedback/` | Coordinator-specific feedback ratings (`CoordinatorFeedbackSummaryView`) |

---

## 7. Admin Portal

**Base prefix:** `/api/bff/mobile/admin/` → `admin_portal/urls.py`
**Also routed at:** `/admin-dashboard/` (from root `config/urls.py`)

The admin portal has two layers: **Template Views** (server-rendered HTML) and **API Views** (JSON endpoints consumed by HTMX/JS in those templates).

### 7.1 Template Views (HTML pages)

| URL | Function | Page |
|---|---|---|
| `ui/login/` | `admin_login_view` | Admin login form |
| `ui/logout/` | `admin_logout_view` | Logout |
| `ui/dashboard/` / `""` | `dashboard_view` | Main dashboard (v_admin_dashboard) |
| `ui/event-create/` | `event_create_tab_view` | Event creation form |
| `ui/events/` | `events_detail_and_geo_view` | Event list + geo map |
| `ui/users/` | `users_directory_view` | User directory |
| `ui/user-create/` | `user_provision_view` | Provision a new user |
| `ui/geo-monitoring/` | `geo_monitoring_view` | Real-time geo check-in monitor |
| `ui/coordinators/` | `coordinator_board_view` | Coordinator approval board |
| `ui/feedback/` | `feedback_intelligence_view` | Feedback analytics |
| `ui/settings/` | `admin_settings_view` | App settings management |
| `ui/phone-lookup/` | `admin_phone_hash_lookup_api` | Lookup user by phone hash |

**Templates directory:** `admin_portal/templates/admin_portal/` (11 HTML templates)

### 7.2 Administrative API Views

#### Verification Images (Phase 4)
| Method | Path | View | Description |
|---|---|---|---|
| GET | `verification-images/` | `AdminPendingVerificationImagesView` | List pending images |
| GET | `verification-images/<id>/file/` | `AdminVerificationImageFileView` | Serve image file |
| POST | `verification-images/<id>/review/` | `AdminReviewVerificationImageView` | Approve/reject image |

#### Coordinators (Phase 4)
| Method | Path | View | Description |
|---|---|---|---|
| GET | `coordinators/` | `AdminPendingCoordinatorsView` | List pending coordinator applications |
| POST | `coordinators/<user_id>/<action>/` | `AdminCoordinatorDecisionView` | Approve/suspend/revoke |

#### Governance, Moderation & Audit (Phase 8)
| Method | Path | View | Description |
|---|---|---|---|
| GET | `dashboard/` | `AdminDashboardView` | Live stats from `v_admin_dashboard` |
| POST | `moderation/` | `AdminModerationView` | Perform moderation action |
| GET | `feedback/` | `AdminFeedbackListView` | List all feedback |
| POST | `feedback/<id>/hide/` | `AdminHideFeedbackView` | Hide a feedback entry |
| GET | `audit/` | `AdminAuditLogsView` | Query audit logs |
| GET | `coordinator-history/` | `AdminCoordinatorHistoryView` | Handover history |
| GET | `geo-monitoring/api/` | `AdminGeoMonitoringView` | Geo attempt data |
| POST | `maintenance/run/` | `AdminRunMaintenanceView` | Trigger maintenance SQL function |
| GET | `users/<id>/moderation-summary/` | `AdminModerationSummaryView` | Per-user warning/block history |
| POST | `users/<id>/<action>/` | `AdminUserActionView` | User-level moderation |
| GET/POST | `events/` | `AdminEventListCreateView` | Admin event list/create |
| POST | `events/<id>/<action>/` | `AdminEventActionView` | Admin event state action |

#### Self-Hosted Map Engine (MAP-TASK-01)
| Method | Path | Description |
|---|---|---|
| GET | `maps/catalog/` | Available map regions catalog |
| GET | `maps/tiles/<z>/<x>/<y>.png` | Tile proxy/streaming |
| GET | `maps/regions/<code>/download/` | Download offline map region |
| POST | `maps/sync/` | Trigger map tile sync |

**Files:** `map_views.py` (23.8 KB), `map_engine.py` in `common/` (23.8 KB)

---

## 8. Common Infrastructure

**Directory:** `backend/common/`

| File | Size | Purpose |
|---|---|---|
| `authentication.py` | 2.5 KB | `BlockedAwareTokenAuthentication` — custom DRF token auth with account status check + DB context injection |
| `db_context.py` | 4.7 KB | `DbContextMiddleware` + `set_db_session_context()` — injects `app.user_id` and `app.ip` into PostgreSQL session |
| `exceptions.py` | 17.7 KB | Custom exception hierarchy: `DomainError`, `PermissionDeniedError`, `ResourceMaskedNotFound`, `OwnerMonitorReadOnlyError`, `OtpRateLimitError`, `custom_exception_handler`, security event logging |
| `permissions.py` | 12.6 KB | DRF permission classes (`IsActiveUser`, `IsAdminUser`, `IsSuperAdminUser`, `IsApprovedCoordinator`, `AllowAnyReadOnly`) + guard functions + `AllowListSerializerMixin` |
| `privacy.py` | 10.4 KB | Phone number encryption/decryption (AES), HMAC hashing, PII scrubbing utilities |
| `security.py` | 6.6 KB | Security utilities (input sanitization, injection detection) |
| `utils.py` | 7.2 KB | `normalize_phone()`, `compute_phone_hash()`, `encrypt_phone()`, `compute_otp_hash()` and other shared utilities |
| `map_engine.py` | 23.8 KB | Self-hosted map tile engine and region management |
| `transactions.py` | 4.4 KB | Atomic transaction helpers |
| `schema.py` | 2.6 KB | `CleanAutoSchema` (drf_spectacular hook), `clean_endpoints_hook` |
| `serializers.py` | 97 B | Shared base serializers |
| `test_common_infrastructure.py` | 47.4 KB | Comprehensive infrastructure test suite |

### Key Security Patterns

```
phone → normalize → HMAC(phone_hash) stored for lookup
                 → AES-encrypt(phone_enc) stored for display
                 → never stored raw
```

**Permission Hierarchy:**
- `IsActiveUser` — authenticated + `account_status == 'active'`
- `IsApprovedCoordinator` — above + `coordinator_profile.status == 'approved'`
- `IsAdminUser` — authenticated + `is_admin == True + is_active`
- `IsSuperAdminUser` — above + `is_superuser == True`

**404 Masking:** Admin route access failures raise `ResourceMaskedNotFound` (HTTP 404 not 403) to prevent information leakage about admin endpoint existence.

**Owner-as-Monitor:** When a coordinator hands over their event, they retain read-only ("monitor") access. Write attempts raise `OwnerMonitorReadOnlyError` (HTTP 403).

---

## 9. URL Routing Overview

**Root `config/urls.py`** dispatches to the following primary URL prefixes:

```
/admin-dashboard/        → admin_portal.urls     (HTML UI + Admin APIs)
/admin/                  → admin.site.urls       (Django native admin)
/api/v1/                 → bff.urls              (Primary API endpoint for mobile & clients)
/api/bff/mobile/         → bff.urls              (BFF legacy/semantic alias)
/api/                    → bff.urls              (Root API convenience alias)
  ├── auth/              → bff.auth.urls         (OTP request/verify/logout)
  ├── volunteer/         → bff.volunteer.urls    (Volunteer self-service, events, applications)
  ├── checkin/           → bff.checkin.urls      (QR, geo-checkin, attendance, onboarding, feedback)
  ├── coordinator/       → bff.coordinator.urls  (Coordinator workspace, event CRUD, assignments)
  ├── admin/             → admin_portal.urls     (Admin actions, approvals, moderation)
  └── maps/              → admin_portal.map_views(Self-hosted map tile catalog and sync)
/api/schema/             → drf_spectacular SpectacularAPIView (OpenAPI 3.0 schema)
/api/docs/               → SpectacularSwaggerView (Interactive Swagger UI)
```

> [!NOTE]
> All three prefixes (`/api/v1/`, `/api/bff/mobile/`, and `/api/`) route directly into `bff.urls`. In addition, many BFF endpoints are double-mounted: once under `/coordinator/events/<id>/...` for semantic clarity and once under `/events/<id>/...` as a convenience alias. Both resolve to the same view. The React Native mobile client standardizes on `/api/v1/`.

---

## 10. Migrations State

Migrations use `managed = False` models — they create Django's ORM knowledge of the schema **without touching the actual DB tables** (DDL is owned by PostgreSQL). They register models for Django admin, relations, and type validation.

| App | Migrations | Contents |
|---|---|---|
| `accounts` | 0001_initial | All 7 account models |
| `events` | 0001_initial, 0002 | Tables + 3 view-model registrations (`v_event_post_capacity`, `v_public_events`, `v_event_summary`) |
| `attendance` | 0001_initial, 0002 | Tables + 4 view-model registrations |
| `coordination` | 0001_initial, 0002 | Tables + `v_event_coordinator_history` |
| `audit` | 0001_initial, 0002 | Tables + `v_user_moderation_summary`, `v_admin_dashboard` |

---

## 11. Test Coverage Summary

Tests are organized by **development phase** and **cross-cutting capability parity**, reflecting incremental feature delivery and end-to-end contract validation:

```
backend/
├── common/test_common_infrastructure.py    (47 KB — infrastructure unit tests)
├── bff/volunteer/tests/
│   └── test_phase2_...py                  (Phase 2: public events, taxonomy)
├── apps/*/tests/
│   ├── test_phase3_*.py                   (Phase 3: profile, availability)
│   ├── test_phase4_*.py                   (Phase 4: verification, coordinator)
│   ├── test_phase5_*.py                   (Phase 5: event lifecycle)
│   ├── test_phase6_*.py                   (Phase 6: applications, assignments)
│   ├── test_phase7_*.py                   (Phase 7: attendance, check-in)
│   ├── test_phase8_*.py                   (Phase 8: audit, moderation, governance)
│   ├── test_bff_phase1_parity.py          (BFF phase 1 parity verification)
│   └── test_bff_phase2_parity.py          (BFF phase 2 parity verification)
├── tests/
│   └── test_v0_11_0_capability_parity.py  (40 tests, 991 lines — verifies all 82 role capabilities)
└── tests_e2e/test_e2e_lifecycle.py        (End-to-end lifecycle flow)
```

**Total Test Count:** **754 Tests Passing (100%)**
- 714 baseline unit, trigger, and service tests
- 40 cross-cutting capability parity tests

**Custom Test Runner:** `config/test_runner.SqlFileTestRunner` — loads `.sql` schema and triggers before running tests (seeds the DB from the authoritative SQL schema).

**What tests cover:**
- DB trigger behavior (rate limits, state machine transitions, cascade rules)
- Service-layer functions (all 19 services)
- BFF endpoint HTTP contracts across all 82 capabilities (status codes, payload shape, permission gating, error taxonomy)
- Infrastructure (auth tokens, permissions, session DB context, exception handlers)
- E2E: full volunteer and coordinator lifecycle flows

---

## 12. Dependencies

### Production (`requirements/base.txt`)

| Package | Version Spec | Purpose |
|---|---|---|
| `Django` | `>=5.1,<5.2` | Web framework |
| `psycopg` | `>=3.2.0` | PostgreSQL driver (psycopg3) |
| `psycopg-binary` | `>=3.2.0` | Binary wheels for psycopg3 |
| `djangorestframework` | `>=3.15.2` | REST API framework |
| `django-cors-headers` | `>=4.3.0` | CORS middleware |
| `python-dotenv` | `>=1.0.0` | `.env` file loader |
| `drf-spectacular` | `>=0.27.0` | OpenAPI 3.0 schema generation |
| `Pillow` | `>=10.0.0` | Image processing (verification images) |
| `django-filter` | `>=24.3,<25` | QuerySet filtering for DRF |
| `cryptography` | `>=43.0,<51` | AES encryption for phone numbers |

### Dev/Test (`requirements/local.txt`)

| Package | Purpose |
|---|---|
| `ruff` | Fast Python linter/formatter |
| `pytest-django` | Django integration for pytest |

> [!NOTE]
> No Celery, Redis, or async task queue is in the dependencies. Background tasks are run synchronously via management commands or the `/maintenance/run/` admin endpoint.

---

## 13. Deployment

**Dockerfile:**
```dockerfile
FROM python:3.11-slim        # Note: Dockerfile uses 3.11; dev uses 3.12 (from pyc files)
WORKDIR /app
RUN apt-get install gcc libpq-dev   # psycopg native build deps
COPY requirements/ /app/requirements/
RUN pip install -r requirements/local.txt
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

> [!WARNING]
> The Dockerfile uses `runserver` — this is a development server, not suitable for production. A production deployment would use gunicorn/uvicorn behind a reverse proxy (nginx). The Dockerfile currently installs `local.txt` (includes dev deps like ruff/pytest).

**Environment Variables:**

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | (insecure dev key) | Django secret key |
| `PHONE_HASH_HMAC_SECRET` | `dev-hmac-...` | HMAC secret for phone hashing |
| `PHONE_ENCRYPTION_KEY` | (dev key) | AES key for phone encryption |
| `CARTO_API_KEY` | (dev key) | External map/tile API key |
| `DB_NAME` | `volunteer_coordination_db` | PostgreSQL database name |
| `DB_USER` | `postgres` | DB user |
| `DB_PASSWORD` | `postgres` | DB password |
| `DB_HOST` | `127.0.0.1` | DB host |
| `DB_PORT` | `5432` | DB port |
| `DEBUG` | `false` | Django debug mode |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Allowed hostnames |
| `CORS_ALLOW_ALL_ORIGINS` | `True` (if DEBUG) | CORS policy |

---

## 14. What Is Implemented vs. Pending

### ✅ Fully Implemented

| Feature Area | Phase | Evidence |
|---|---|---|
| OTP phone authentication (request + verify + token issuance + logout) | 1 | `auth_service.py`, `bff/auth/` |
| Public event browsing with filtering/pagination | 2 | `query_service.py`, `bff/volunteer/` Phase 2 endpoints |
| User profile management (display name, charity interests) | 3 | `profile_service.py`, `me/` endpoints |
| Weekly availability rules + exception dates | 3 | `availability_service.py`, `me/availability/` endpoints |
| Identity verification image upload + admin review | 4 | `verification_service.py`, admin portal Phase 4 APIs |
| Coordinator application + admin approval/suspension/revocation | 4 | `coordinator_service.py`, admin coordinator routes |
| Event full lifecycle (draft→publish→activate→complete/cancel) | 5 | `event_service.py`, coordinator event CRUD endpoints |
| Event posts (capacity slots) management | 5 | `event_post_service.py` |
| Event coordinator handover + owner retake | 5 | `change_event_coordinator()` SQL fn, `handover/` endpoint |
| Volunteer application (apply/withdraw/accept/reject/waitlist) | 6 | `application_service.py`, application endpoints |
| Auto-assignment algorithm (PostgreSQL-side) | 6 | `assignment_service.py` → `run_auto_assignment()` |
| Manual assignment by coordinator | 6 | `assign_manually()` SQL fn |
| Assignment confirm/cancel by volunteer | 6 | `AssignmentConfirmView`, `AssignmentCancelView` |
| Onboarding briefing acknowledgment | 7 | `onboarding_service.py` |
| QR token create/revoke/redeem | 7 | `qr_service.py` |
| QR-based check-in | 7 | `attendance_service.py` → `qr_check_in()` |
| GPS geo check-in (13 result codes, Haversine in SQL) | 7 | `geo_service.py` → `geo_check_in()` |
| Manual coordinator check-in | 7 | `attendance_service.py` |
| Check-out (end shift) | 7 | `AttendanceCheckoutView` |
| Coordinator check-in confirmation/rejection | 7 | Coordinator attendance board endpoints |
| Feedback (all 3 directions) | 7 | `feedback_service.py` |
| Admin dashboard (live metrics from `v_admin_dashboard`) | 8 | `AdminDashboardView` |
| Moderation actions (all 9 types) | 8 | `moderation_service.py` |
| Audit log recording + query | 8 | `audit_service.py` |
| Admin moderation summary per user | 8 | `v_user_moderation_summary` |
| Scheduled maintenance trigger | 8 | `maintenance_service.py` → `run_maintenance()` |
| Self-hosted map tile engine | MAP-TASK-01 | `map_engine.py`, `map_views.py` |
| OpenAPI schema (206 KB) | — | `schema.yml` pre-generated |
| Admin web UI (all 11 template pages) | — | `admin_portal/templates/` |
| React Native Mobile BFF Integration | v0.11.1 | Complete integration across all 82 role capabilities (43 volunteer + 39 coordinator) with dual-mode mock/HTTP repositories (`mobile/src/data/http/`, `endpoints/`, `mappers/`, `domain/usecases/`) |
| Unified API routing (`/api/v1/`, `/api/bff/mobile/`, `/api/`) | — | All map to `bff.urls` with identical view resolution |
| Tokenization Login & Active OTP Framework | v0.11.1 | Complete architectural specification, wire schemas, and enterprise adapter templates defined in `docs/tokenization_login_architecture.md` |

### ⚠️ Partially Implemented / Ready for Deployment

| Item | Status | Note |
|---|---|---|
| Active SMS OTP delivery | **Template Ready** | `ConsoleOtpDeliveryAdapter` active for dev/test (`dev_code` response); production templates for Twilio, AWS SNS, and Telecom SMPP specified in `docs/tokenization_login_architecture.md` |
| Map tile proxy | **Partial** | `CARTO_API_KEY` suggests external tile source; offline region management implemented but map data likely not bundled |
| Custom Test Runner SQL path | **Resolved** | `config/test_runner.py` configured to load authoritative schema SQL |

### ❌ In-Flight / Production Hardening

| Item | Note |
|---|---|
| Celery / Async task worker | Framework and thread pool pipeline drafted in `tokenization_login_architecture.md` to guarantee <500ms SLA for external SMS dispatch |
| Production Dockerfile & WSGI | Currently uses `manage.py runserver`; production deployment to configure Gunicorn/Uvicorn with PgBouncer connection pooling |
| Push notifications | Planned FCM/APNs integration for assignment and attendance notifications |

---

*Analysis generated from: `backend/config/settings/base.py`, all 5 app `models.py` files, `bff/*/urls.py`, `admin_portal/urls.py`, `config/urls.py`, `services/*.py` (all 19 modules sampled), `common/*.py` (all files), `Dockerfile`, `requirements/*.txt`. Total files read: ~35.*
