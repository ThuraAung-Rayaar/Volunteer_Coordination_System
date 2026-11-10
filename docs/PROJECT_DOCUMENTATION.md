# Volunteer Coordination System — Full Project Documentation

**Version:** v0.6.0  
**Date:** 2026-11-10  
**Stack:** Django 5.1 · Django REST Framework · PostgreSQL 18 · Docker  
**Scope:** Backend + Admin Portal + Self-Hosted Map Engine  
*(Mobile/React Native client is excluded from this document.)*

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Technology Stack & Dependencies](#4-technology-stack--dependencies)
5. [Environment & Configuration](#5-environment--configuration)
6. [Database Design](#6-database-design)
7. [Django Apps](#7-django-apps)
8. [Service Layer](#8-service-layer)
9. [Backend-for-Frontend (BFF) API](#9-backend-for-frontend-bff-api)
10. [Admin Portal](#10-admin-portal)
11. [Self-Hosted Map Engine](#11-self-hosted-map-engine)
12. [Common Utilities](#12-common-utilities)
13. [Tests](#13-tests)
14. [Docker & Deployment](#14-docker--deployment)
15. [Database Seeding](#15-database-seeding)
16. [Existing Documentation Files](#16-existing-documentation-files)
17. [Known Limitations & Explicit Exclusions](#17-known-limitations--explicit-exclusions)

---

## 1. Project Overview

The **Volunteer Coordination System (VCS)** is an online-first people-coordination platform for charity programs, food giveaways, teaching initiatives, and large-scale event setups. It handles:

- **Volunteer recruitment** via phone-based OTP authentication
- **Capability & availability profiling** of volunteers
- **Identity verification** (selfie + ID document review by admins)
- **Coordinator management** (apply → approve → manage events)
- **Event lifecycle management** (draft → publish → activate → complete/cancel)
- **Role/post assignment** to volunteers (auto & manual)
- **Geolocation check-in** with server-side distance verification
- **Attendance tracking** with QR, manual, and geo methods
- **Post-event feedback** (bidirectional: coordinator↔volunteer)
- **Admin governance & moderation** (warnings, blocks, audit logs)
- **Self-hosted offline map engine** (ASEAN macro + Myanmar regional micro tiles)

> [!IMPORTANT]
> **Explicitly excluded from scope:** Payroll, wage calculation, break timers, money movement, legal contracts, and heavy unstructured AI dependencies.

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                      │
│                                                                            │
│   Web / Admin Portal (Leaflet.js)        Mobile App (React Native)        │
│   • Served via admin_portal templates    • React Native app (excluded)    │
│   • Leaflet tiles → /api/v1/maps/        • Calls BFF endpoints            │
└───────────────────────────┬────────────────────────────┬───────────────────┘
                            │                            │
                   HTTPS :8000 (Django)          HTTPS :8000 (Django)
                            │                            │
┌───────────────────────────▼────────────────────────────▼───────────────────┐
│                        DJANGO BACKEND                                       │
│                                                                             │
│  ┌──────────────┐  ┌─────────────────────────────────────────────────┐     │
│  │  Admin       │  │  BFF (Backend-for-Frontend) Layer               │     │
│  │  Portal      │  │  bff/auth/    bff/volunteer/                    │     │
│  │  (UI views   │  │  bff/coordinator/   bff/checkin/                │     │
│  │  + API views)│  │  → Calls service layer                          │     │
│  └──────────────┘  └─────────────────────────────────────────────────┘     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Service Layer (backend/services/)                                  │   │
│  │  auth · otp · profile · verification · event · event_post          │   │
│  │  application · assignment · attendance · geo · qr · onboarding     │   │
│  │  coordinator · feedback · audit · moderation · maintenance · query  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Django Apps (ORM models — database-first, managed = False)         │   │
│  │  accounts · events · coordination · attendance · audit              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌────────────────────┐  ┌─────────────────────────────────────────────┐   │
│  │  Map Engine        │  │  Common Utilities                           │   │
│  │  (common/          │  │  authentication · permissions · privacy     │   │
│  │   map_engine.py)   │  │  exceptions · serializers · transactions    │   │
│  │  map/ (MBTiles     │  │  security · utils · db_context              │   │
│  │  tile stores)      │  └─────────────────────────────────────────────┘   │
│  └────────────────────┘                                                     │
└────────────────────────────────────────────────┬────────────────────────────┘
                                                 │
                                     PostgreSQL 18 :5432
                                     (volunteer_coordination_db)
```

**Key architectural decisions:**

| Decision | Detail |
|---|---|
| **Database is the source of truth** | Every invariant is a constraint or trigger. |
| **Status machines are trigger-enforced** | Illegal transitions (e.g., `draft → completed`) raise errors at DB level. |
| **Event ownership split** | `events.owner_id` never changes; `events.current_coordinator_id` can be handed over. |
| **Geo check-in is server-measured** | Server computes distance via `geo_check_in()`. Client claims are ignored. |
| **Machine-coded errors** | Business errors raised with prefix codes, e.g. `capacity_full: ...`. |
| **Session context** | `SET LOCAL app.user_id` and `SET LOCAL app.ip` per request transaction. |
| **Dual-identifier pattern** | Internal: `BIGINT` surrogate keys. Public APIs: immutable `UUIDv7` to prevent IDOR attacks. |

---

## 3. Repository Structure

```
python_stack/
├── backend/                        # Django project root
│   ├── admin_portal/               # Django admin UI + API app
│   │   ├── templates/admin_portal/ # Jinja-like HTML templates
│   │   │   ├── base_admin.html
│   │   │   ├── login.html
│   │   │   ├── dashboard.html
│   │   │   ├── event_create.html
│   │   │   ├── events_detail.html
│   │   │   ├── coordinator_board.html
│   │   │   ├── users.html
│   │   │   ├── user_create.html
│   │   │   ├── geo_monitoring.html
│   │   │   ├── feedback.html
│   │   │   └── settings.html
│   │   ├── admin.py
│   │   ├── map_views.py            # Map Engine HTTP views
│   │   ├── phone_utils.py          # Phone hash/lookup utilities
│   │   ├── serializers.py
│   │   ├── urls.py                 # Admin portal URL conf
│   │   └── views.py                # UI + API views
│   │
│   ├── apps/                       # Domain model apps (managed = False)
│   │   ├── accounts/               # Users, OTP, verification, availability
│   │   ├── attendance/             # QR tokens, attendance, geo attempts
│   │   ├── audit/                  # Audit logs, feedback, moderation, app settings
│   │   ├── coordination/           # Coordinator profiles, assignments, history
│   │   └── events/                 # Events, posts, applications, charity fields
│   │
│   ├── bff/                        # Backend-for-Frontend API layer
│   │   ├── auth/                   # OTP request/verify, logout
│   │   ├── checkin/                # Onboarding, QR, attendance, feedback
│   │   ├── coordinator/            # Event CRUD, lifecycle, applications, assignments
│   │   └── volunteer/              # Public events, profile, availability, coordinator apply
│   │
│   ├── common/                     # Shared utilities & middleware
│   │   ├── authentication.py       # Token-based auth helpers
│   │   ├── db_context.py           # DbContextMiddleware (SET LOCAL app.user_id)
│   │   ├── exceptions.py           # Custom exception handlers
│   │   ├── map_engine.py           # Self-hosted tile engine
│   │   ├── permissions.py          # DRF permission classes
│   │   ├── privacy.py              # Phone hash/encrypt helpers
│   │   ├── schema.py               # drf-spectacular schema customizations
│   │   ├── security.py             # Security helpers
│   │   ├── serializers.py          # Shared serializer base classes
│   │   ├── transactions.py         # DB transaction helpers
│   │   └── utils.py                # General utilities
│   │
│   ├── config/                     # Django project settings
│   │   ├── settings/
│   │   │   ├── base.py             # Core settings
│   │   │   ├── local.py            # Development overrides
│   │   │   └── production.py       # Production overrides
│   │   ├── urls.py                 # Root URL conf
│   │   ├── asgi.py
│   │   └── wsgi.py
│   │
│   ├── media/                      # Public uploaded media
│   ├── private_media/              # Private verification images
│   ├── requirements/
│   │   ├── base.txt                # Production dependencies
│   │   └── local.txt               # Development extras
│   ├── services/                   # Service layer (business logic)
│   ├── tests_e2e/                  # End-to-end lifecycle tests
│   ├── Dockerfile
│   ├── manage.py
│   └── schema.yml                  # OpenAPI schema (generated)
│
├── docs/                           # ← This documentation lives here
├── map/                            # Self-hosted MBTiles tile files
│   ├── asean_macro.mbtiles
│   ├── yangon.mbtiles
│   ├── mandalay.mbtiles
│   ├── naypyidaw.mbtiles
│   ├── shan.mbtiles
│   └── ... (14 Myanmar regional packs + 1 ASEAN macro)
│
├── postgres_sql/                   # Database schema & reports
│   ├── updated_volunteer_coordination_system_Database.sql
│   ├── Database_report.md
│   └── self_test.sql
│
├── seeding/                        # Data seeding SQL files
│   ├── seed_data.sql
│   └── Qwen_sql_20261106_cf1i1orzq.sql
│
├── prompt_code/                    # Planning docs & spec archive
│   └── spec/                       # Versioned architecture specs
│
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## 4. Technology Stack & Dependencies

### Core Stack

| Layer | Technology | Version |
|---|---|---|
| Language | Python | 3.11 |
| Web Framework | Django | >=5.1, <5.2 |
| REST API | Django REST Framework | >=3.15.2 |
| Database | PostgreSQL | 18-alpine (Docker) |
| DB Driver | psycopg (v3) | >=3.2.0 |
| Containerization | Docker + Docker Compose | — |

### Production Dependencies (`requirements/base.txt`)

| Package | Purpose |
|---|---|
| `Django>=5.1,<5.2` | Web framework |
| `psycopg>=3.2.0` + `psycopg-binary` | PostgreSQL async driver (psycopg3) |
| `djangorestframework>=3.15.2` | REST API layer |
| `django-cors-headers>=4.3.0` | CORS header management |
| `python-dotenv>=1.0.0` | `.env` file loading |
| `drf-spectacular>=0.27.0` | OpenAPI 3 schema generation |
| `Pillow>=10.0.0` | Image processing (verification photos) |
| `django-filter>=24.3,<25` | Queryset filtering |
| `cryptography>=43.0,<51` | Phone number encryption (Fernet) |

### Development Extras (`requirements/local.txt`)

| Package | Purpose |
|---|---|
| `ruff>=0.4.0` | Linting & formatting |
| `pytest-django>=4.8.0` | Test runner |

---

## 5. Environment & Configuration

### Environment Variables (`.env.example`)

| Variable | Description | Default |
|---|---|---|
| `DEBUG` | Django debug mode | `True` |
| `SECRET_KEY` / `DJANGO_SECRET_KEY` | Django secret key | Insecure dev key |
| `ALLOWED_HOSTS` | Comma-separated allowed hostnames | `localhost,127.0.0.1` |
| `PHONE_HASH_HMAC_SECRET` | HMAC secret for phone hashing (≥32 chars) | *(must set)* |
| `PHONE_ENCRYPTION_KEY` | Fernet key for phone encryption (URL-safe base64) | *(must set)* |
| `DB_NAME` | PostgreSQL database name | `volunteer_coordination_db` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_HOST` | PostgreSQL host | `127.0.0.1` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `CARTO_API_KEY` | CartoDB Voyager API key (tile fallback) | *(must set)* |

### Settings Split

| File | Usage |
|---|---|
| `config/settings/base.py` | Core settings (all environments) |
| `config/settings/local.py` | Development overrides (`DEBUG=True`, etc.) |
| `config/settings/production.py` | Production hardening |

### Installed Apps

```
Django core apps: admin, auth, contenttypes, sessions, messages, staticfiles, postgres
Third-party:      rest_framework, rest_framework.authtoken, corsheaders,
                  django_filters, drf_spectacular
Local apps:       apps.accounts, apps.events, apps.coordination,
                  apps.attendance, apps.audit, admin_portal, bff
```

### Middleware Stack (in order)

1. `SecurityMiddleware`
2. `CorsMiddleware`
3. `SessionMiddleware`
4. `CommonMiddleware`
5. `CsrfViewMiddleware`
6. `AuthenticationMiddleware`
7. `common.db_context.DbContextMiddleware` ← sets `app.user_id` / `app.ip` per request
8. `MessageMiddleware`
9. `XFrameOptionsMiddleware`

---

## 6. Database Design

### Schema Version

**v0.5.2** (Database-First, Option A)  
Target Engine: PostgreSQL 14+ (requires `btree_gist` extension)

### Loading the Schema

```bash
# Load into an empty database
psql -U postgres -d volunteer_coordination_db \
  -f postgres_sql/updated_volunteer_coordination_system_Database.sql

# Run self-tests
psql -U postgres -d volunteer_coordination_db -c "SELECT * FROM self_test();"
```

The schema is wrapped in a single `BEGIN … COMMIT` transaction — any error rolls everything back.

### Core Tables

#### `users` (app: `accounts`)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | Internal surrogate key |
| `uuid` | UUIDv7 | Public-facing identifier (IDOR-safe) |
| `phone_hash` | CHAR(128) UNIQUE | HMAC-SHA256 of phone number |
| `phone_enc` | TEXT | Fernet-encrypted phone number |
| `display_name` | VARCHAR(150) | — |
| `is_admin` / `is_staff` / `is_superuser` | BOOLEAN | Role flags |
| `account_status` | ENUM | `active` · `blocked` · `closed` |
| `blocked_until` | TIMESTAMPTZ | Temporary block expiry |
| `preferred_language` | VARCHAR(35) | Default `"en"` |
| `blood_type` | ENUM | A+/A-/B+/B-/AB+/AB-/O+/O-/unknown |
| `skills` | TEXT[] | ArrayField |
| `verification_status` | ENUM | `none` · `pending` · `verified` · `rejected` |
| Physical attributes | BOOLEAN | `physical_ok`, `can_lift_heavy`, `has_leader_experience`, etc. |
| Support flags | BOOLEAN | `needs_meal_support`, `needs_travel_support`, `accepts_unpaid` |

#### `auth_otp`

| Column | Type | Notes |
|---|---|---|
| `phone_hash` | TEXT | Hashed phone of requestor |
| `code_hash` | TEXT | Hashed OTP code |
| `purpose` | ENUM | `login` · `qr_registration` |
| `attempt_count` | INT | Anti-brute-force counter |
| `expires_at` | TIMESTAMPTZ | — |
| `consumed_at` | TIMESTAMPTZ | NULL until used |

#### `coordinator_profiles` (app: `coordination`)

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT PK/FK → users | One-to-one |
| `status` | ENUM | `pending` · `approved` · `suspended` · `revoked` |
| `approved_by` | FK → users | Admin who approved |

#### `events` (app: `events`)

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | — |
| `owner_id` | FK → coordinator_profiles | Never changes after creation |
| `current_coordinator_id` | FK → coordinator_profiles | Can be handed over |
| `title`, `description` | TEXT | — |
| `purpose_type` | ENUM | `charity_event` · `help_wanted_event` |
| `status` | ENUM | `draft` → `published` → `active` → `completed`/`cancelled` |
| `acceptance_mode` | ENUM | `auto` · `manual` |
| `location_name`, `latitude`, `longitude` | — | Geo location |
| `geo_radius_m` | INT | Check-in geofence radius |
| `geo_checkin_enabled` | BOOLEAN | — |
| `map_provider` | ENUM | `openstreetmap` · `google` |
| `start_at`, `end_at` | TIMESTAMPTZ | Event time window |
| `max_participants` | INT | Capacity cap |
| `leader_strategy` | ENUM | `none` · `first_experienced` · `manual` |
| `compensation_kind` | ENUM | `unpaid` · `arranged_outside_system` |
| `qr_registration_enabled` | BOOLEAN | Walk-in QR registration |
| `onboarding_text`, `onboarding_version` | — | Pre-event briefing |

#### `event_posts` (app: `events`)

Sub-roles/positions within an event (e.g. "Food Distribution", "Registration Desk").

| Column | Type | Notes |
|---|---|---|
| `event_id` | FK → events | — |
| `title` | VARCHAR | Post name |
| `required_headcount` | INT | Slots to fill |
| `status` | ENUM | `open` · `closed` |

#### `event_applications` (app: `events`)

| Column | Type | Notes |
|---|---|---|
| `event_id` / `user_id` | FKs | Unique active application per user per event |
| `status` | ENUM | `pending` · `accepted` · `waitlisted` · `withdrawn` · `rejected` |
| `conditions_snapshot` | JSONB | Snapshot of conditions at time of application |

#### `assignments` (app: `coordination`)

| Column | Type | Notes |
|---|---|---|
| `event_id` / `user_id` / `application_id` | FKs | — |
| `post_id` | FK → event_posts | NULL if unroled |
| `group_code` | VARCHAR | Group identifier |
| `is_group_leader` | BOOLEAN | — |
| `status` | ENUM | `assigned` · `confirmed` · `completed` · `cancelled` |
| `assigned_by` | ENUM | `auto` · `coordinator` · `admin` |
| `schedule_start`, `schedule_end` | TIMESTAMPTZ | — |

#### `attendance` (app: `attendance`)

| Column | Type | Notes |
|---|---|---|
| `event_id` / `user_id` / `assignment_id` | FKs | — |
| `qr_token_id` | FK → qr_tokens | NULL if non-QR check-in |
| `status` | ENUM | `expected` · `checked_in` · `absent` · `completed` · `cancelled` |
| `method` | ENUM | `qr_scan` · `coordinator_manual` · `geo` · `system` |
| `checkin_latitude`, `checkin_longitude` | DECIMAL | — |
| `checkin_distance_m` | DECIMAL | Server-computed |
| `geo_verified` | BOOLEAN | Passes geofence check |
| `confirmation_status` | ENUM | `not_required` · `pending` · `confirmed` · `rejected` |

#### `qr_tokens` (app: `attendance`)

| Column | Type | Notes |
|---|---|---|
| `event_id` / `created_by` | FKs | — |
| `purpose` | ENUM | `walkin_registration` · `checkin` · `join_event` |
| `token_hash` | CHAR(128) UNIQUE | — |
| `max_uses` | INT | NULL = unlimited |
| `used_count` | INT | — |
| `expires_at` | TIMESTAMPTZ | — |
| `revoked_at` | TIMESTAMPTZ | NULL until revoked |

#### `feedback` (app: `audit`)

| Column | Type | Notes |
|---|---|---|
| `direction` | ENUM | `coordinator_to_volunteer` · `volunteer_to_event` · `volunteer_to_coordinator` |
| `score` | INT | Rating score |
| `tags` | TEXT[] | Tag array |
| `comment` | TEXT | — |
| `status` | ENUM | `active` · `hidden` |

#### `audit_logs` (app: `audit`)

| Column | Type | Notes |
|---|---|---|
| `actor_user_id` | FK → users | NULL for system |
| `action` | VARCHAR(100) | Action code |
| `entity_type` | VARCHAR(100) | Affected entity type |
| `entity_id` | BIGINT | Affected entity ID |
| `before_data` / `after_data` | JSONB | State snapshots |
| `ip_address` | INET | Client IP |

#### `moderation_actions` (app: `audit`)

| Column | Type | Notes |
|---|---|---|
| `admin_user_id` | FK → users | — |
| `action_type` | ENUM | `user_warning` · `user_block` · `user_unblock` · `account_close` · `account_reinstate` · `event_delete` · `event_restore` · `event_cancel` · `feedback_hide` |
| `expires_at` | TIMESTAMPTZ | For temporary blocks |

### PostgreSQL Views (Read-Only ORM Models)

| View | Mapped ORM Model | Purpose |
|---|---|---|
| `v_public_events` | `VPublicEvents` | Enriched public event listing |
| `v_event_summary` | `VEventSummary` | Coordinator dashboard counters |
| `v_event_post_capacity` | `VEventPostCapacity` | Post fill-rate |
| `v_event_checkin_board` | `VEventCheckinBoard` | Real-time check-in board |
| `v_event_checkin_status` | `VEventCheckinStatus` | Per-user check-in status |
| `v_pending_confirmations` | `VPendingConfirmations` | Coordinator confirmation queue |
| `v_geo_attempts_review` | `VGeoAttemptsReview` | Geo attempt audit board |
| `v_event_coordinator_history` | `VEventCoordinatorHistory` | Handover history |
| `v_user_moderation_summary` | `VUserModerationSummary` | Per-user moderation stats |
| `v_admin_dashboard` | `VAdminDashboard` | Super-admin dashboard counters |

---

## 7. Django Apps

### `apps.accounts` — Users & Identity

**Models:** `Users`, `AuthOtp`, `UserVerificationImages`, `OnboardingAcknowledgments`, `UserCharityInterests`, `VolunteerAvailabilityRules`, `VolunteerAvailabilityExceptions`

**Key design:**
- `Users` extends `AbstractBaseUser` with phone-hash as the `USERNAME_FIELD`
- Phone numbers are never stored in plaintext — only as `phone_hash` (HMAC) + `phone_enc` (Fernet)
- `UserVerificationImages` supports 3 image types: `mock_selfie`, `id_license`, `driver_license`
- Availability is modelled as recurring weekly rules + per-date exceptions

### `apps.events` — Events & Applications

**Models:** `CharityFields`, `Events`, `EventPosts`, `EventApplications`, `EventCharityFields`  
**Read-only views:** `VPublicEvents`, `VEventSummary`, `VEventPostCapacity`

**Key design:**
- Event lifecycle enforced by DB triggers: `draft → published → active → completed/cancelled`
- `acceptance_mode`: `auto` auto-accepts applications; `manual` requires coordinator decision
- `auto_assign_enabled`: triggers automatic slot assignment after acceptance
- `qr_registration_enabled`: allows walk-in volunteer registration via QR scan
- `onboarding_version` bumps force re-acknowledgment by all assigned volunteers

### `apps.coordination` — Coordinators & Assignments

**Models:** `CoordinatorProfiles`, `EventCoordinatorHistory`, `Assignments`  
**Read-only views:** `VEventCoordinatorHistory`

**Key design:**
- Coordinator apply → admin approves → coordinator can create/manage events
- `Assignments` has 4 unique constraints to prevent double-assignment, double-leadership
- Event handover creates `EventCoordinatorHistory` records

### `apps.attendance` — Check-in & QR

**Models:** `QrTokens`, `Attendance`, `AttendanceGeoAttempts`  
**Read-only views:** `VEventCheckinBoard`, `VEventCheckinStatus`, `VPendingConfirmations`, `VGeoAttemptsReview`

**Key design:**
- Three check-in methods: QR scan, coordinator manual entry, GPS geofence
- All geo attempts logged in `AttendanceGeoAttempts` for anti-spoofing review
- `confirmation_status` lets coordinators confirm/reject ambiguous check-ins
- `walk_in_flag` marks attendees who registered on-site via QR

### `apps.audit` — Governance & Feedback

**Models:** `AuditLogs`, `Feedback`, `ModerationActions`, `AppSettings`  
**Read-only views:** `VUserModerationSummary`, `VAdminDashboard`

**Key design:**
- Feedback is bidirectional: coordinator↔volunteer and volunteer→event
- `ModerationActions` records all admin enforcement (warnings, blocks, event cancellations)
- `AppSettings` is a key-value store for tunable integer system parameters

> [!NOTE]
> All models use `managed = False`. The database schema is maintained through the SQL file, not Django migrations. Migrations exist only for seeding/schema reference.

---

## 8. Service Layer

Located in `backend/services/`, each file encapsulates a domain's business logic, called by BFF views and admin portal views. This keeps views thin.

| Service File | Responsibilities |
|---|---|
| `auth_service.py` | Token-based authentication, session validation |
| `otp_service.py` | OTP generation, rate limiting, verification, consumption |
| `profile_service.py` | User profile read/update, charity interests |
| `verification_service.py` | Verification image upload, admin review flow |
| `availability_service.py` | Availability rules/exceptions CRUD, conflict checking |
| `event_service.py` | Event CRUD, lifecycle transitions (publish/activate/complete/cancel) |
| `event_post_service.py` | Post CRUD, capacity tracking, post close |
| `application_service.py` | Volunteer applications, withdrawal, coordinator decisions |
| `assignment_service.py` | Auto-assign, manual assign, group/leader logic, unassign |
| `coordinator_service.py` | Coordinator apply, admin approve/suspend/revoke, handover/retake |
| `attendance_service.py` | Check-in/checkout, confirmation flow, attendance board |
| `geo_service.py` | Server-side distance calculation, geo attempt logging, spoofing review |
| `qr_service.py` | QR token generation, resolve, redeem, revoke |
| `onboarding_service.py` | Onboarding text fetch, acknowledgment recording |
| `feedback_service.py` | Feedback submission, listing, admin hide |
| `audit_service.py` | Audit log creation, admin audit board |
| `moderation_service.py` | User warning/block/unblock, account close/reinstate |
| `maintenance_service.py` | Scheduled cleanup tasks (expired OTPs, stale tokens, etc.) |
| `query_service.py` | Shared complex query helpers used across multiple services |

---

## 9. Backend-for-Frontend (BFF) API

**Base URL prefix:** `/api/v1/` (also mounted at `/api/bff/mobile/` and `/api/`)

### Root URL Configuration (`config/urls.py`)

| Prefix | Handler |
|---|---|
| `/` | Redirects to `/api/v1/admin/ui/login/` |
| `/admin/` | Django admin |
| `/admin-dashboard/` | `admin_portal.urls` |
| `/api/schema/` | OpenAPI schema (drf-spectacular) |
| `/api/docs/` | Swagger UI |
| `/api/v1/` | `bff.urls` |

### BFF URL Layout (`bff/urls.py`)

| Prefix | Namespace |
|---|---|
| `maps/` | Map Engine endpoints (via `admin_portal.map_views`) |
| `auth/` | `bff.auth.urls` |
| `volunteer/` | `bff.volunteer.urls` |
| `checkin/` | `bff.checkin.urls` |
| `coordinator/` | `bff.coordinator.urls` |
| `admin/` | `admin_portal.urls` |

---

### Auth Endpoints (`bff/auth/`)

| Method | Path | View | Description |
|---|---|---|---|
| POST | `auth/otp/request/` | `OtpRequestView` | Request OTP via phone number |
| POST | `auth/request-otp/` | `OtpRequestView` | Alias |
| POST | `auth/otp/verify/` | `OtpVerifyView` | Verify OTP, receive token |
| POST | `auth/verify-otp/` | `OtpVerifyView` | Alias |
| POST | `auth/logout/` | `LogoutView` | Invalidate token |

---

### Volunteer Endpoints (`bff/volunteer/`)

#### Public Events & Taxonomy

| Method | Path | Description |
|---|---|---|
| GET | `charity-fields/` | List active charity field codes |
| GET | `events/` | Public event listing |
| GET | `events/<event_id>/` | Public event detail |
| GET | `events/<event_id>/posts/` | Event posts listing |

#### User Profile & Interests

| Method | Path | Description |
|---|---|---|
| GET/PATCH | `me/` | Volunteer profile (read/update) |
| GET/PATCH | `profile/` | Alias |
| GET/POST/DELETE | `me/charity-interests/` | Manage charity field interests |
| GET | `users/by-uuid/<uuid>/` | Look up user by public UUID |

#### Availability

| Method | Path | Description |
|---|---|---|
| GET | `me/availability/` | Availability summary |
| GET/POST | `me/availability/rules/` | Weekly recurring rules |
| GET/POST | `me/availability/exceptions/` | Date-specific exceptions |
| GET/PATCH/DELETE | `me/availability/exceptions/<exception_id>/` | Exception detail |
| POST | `me/availability/check/` | Check availability for event time window |
| POST | `events/check-availability/` | Alias |

#### Identity Verification & Coordinator

| Method | Path | Description |
|---|---|---|
| GET/POST | `me/verification-images/` | Upload/view verification images |
| GET/POST | `me/coordinator/` | Coordinator profile / apply |
| POST | `coordinator/apply/` | Alias |

#### Applications & Assignments

| Method | Path | Description |
|---|---|---|
| POST | `events/<event_id>/apply/` | Apply to an event |
| GET | `me/applications/` | My active/past applications |
| POST | `applications/<application_id>/withdraw/` | Withdraw an application |
| GET | `me/assignments/` | My current assignments |
| POST | `assignments/<assignment_id>/confirm/` | Confirm an assignment |
| POST | `assignments/<assignment_id>/cancel/` | Cancel an assignment |
| POST | `events/<event_id>/check-availability/` | Check availability for event |

---

### Coordinator Endpoints (`bff/coordinator/`)

#### Event CRUD & Lifecycle

| Method | Path | Description |
|---|---|---|
| GET/POST | `coordinator/events/` | List coordinator's events / create event |
| GET/PATCH/DELETE | `coordinator/events/<event_id>/` | Event detail |
| GET | `events/<event_id>/summary/` | Real-time event summary counters |
| POST | `events/<event_id>/publish/` | Draft → Published |
| POST | `events/<event_id>/activate/` | Published → Active |
| POST | `events/<event_id>/complete/` | Active → Completed |
| POST | `events/<event_id>/cancel/` | Cancel event |
| POST | `events/<event_id>/handover/` | Hand over coordination to another coordinator |
| POST | `events/<event_id>/retake/` | Retake coordination |

#### Event Posts

| Method | Path | Description |
|---|---|---|
| GET/POST | `coordinator/events/<event_id>/posts/` | Manage posts |
| GET/PATCH | `posts/<post_id>/` | Post detail |
| POST | `posts/<post_id>/close/` | Close a post (stop accepting applicants) |
| GET | `coordinator/events/<event_id>/post-capacity/` | Post fill-rate |

#### Applications & Assignments

| Method | Path | Description |
|---|---|---|
| GET | `coordinator/events/<event_id>/applications/` | Pending applications |
| POST | `applications/<application_id>/accept/` | Accept application |
| POST | `applications/<application_id>/reject/` | Reject application |
| POST | `applications/<application_id>/waitlist/` | Waitlist application |
| POST | `applications/<application_id>/<action>/` | Generic decision endpoint |
| POST | `coordinator/events/<event_id>/auto-assign/` | Run auto-assignment |
| POST | `coordinator/events/<event_id>/manual-assign/` | Manually assign a volunteer |
| GET | `coordinator/events/<event_id>/assignments/` | View assignments |
| GET | `coordinator/events/<event_id>/unassigned/` | Unassigned accepted volunteers |

---

### Check-in / Attendance Endpoints (`bff/checkin/`)

#### Onboarding

| Method | Path | Description |
|---|---|---|
| GET | `events/<event_id>/onboarding/` | Get onboarding text + ack status |
| POST | `events/<event_id>/onboarding/acknowledge/` | Record acknowledgment |

#### QR Tokens

| Method | Path | Description |
|---|---|---|
| POST | `qr/resolve/` | Resolve QR token to event info |
| POST | `qr/redeem/` | Redeem QR token (walk-in) |
| POST | `coordinator/events/<event_id>/qr-tokens/` | Generate a new QR token |
| POST | `coordinator/qr-tokens/<qr_id>/revoke/` | Revoke a QR token |

#### Check-in / Checkout

| Method | Path | Description |
|---|---|---|
| POST | `attendance/qr-checkin/` | QR-based check-in |
| POST | `attendance/manual-checkin/` | Coordinator manual check-in |
| POST | `attendance/geo-checkin/` | GPS geofence check-in |
| POST | `attendance/<attendance_id>/checkout/` | Checkout |
| GET | `me/attendance/` | Volunteer's own attendance history |

#### Coordinator Boards & Confirmation

| Method | Path | Description |
|---|---|---|
| GET | `coordinator/events/<event_id>/attendance/` | Full attendance board |
| GET | `coordinator/events/<event_id>/attendance/pending/` | Pending confirmations |
| GET | `coordinator/events/<event_id>/geo-attempts/` | Geo attempt review list |
| POST | `coordinator/attendance/<attendance_id>/confirm/` | Confirm check-in |
| POST | `coordinator/attendance/<attendance_id>/reject/` | Reject check-in |

#### Feedback

| Method | Path | Description |
|---|---|---|
| POST | `events/<event_id>/feedback/` | Submit feedback |
| GET | `events/<event_id>/feedback/list/` | List event feedback |
| GET | `me/feedback/` | My given/received feedback |

---

## 10. Admin Portal

**URL prefix:** `/admin-dashboard/` (also `/api/v1/admin/`)

A Django-rendered web application providing super-admin and coordinator management capabilities.

### Template Pages

| Path | Template | Purpose |
|---|---|---|
| `ui/login/` | `login.html` | Admin authentication |
| `ui/dashboard/` | `dashboard.html` | System health & counters |
| `ui/event-create/` | `event_create.html` | Admin event creation form |
| `ui/events/` | `events_detail.html` | Event listing + detail + geo map |
| `ui/users/` | `users.html` | User directory |
| `ui/user-create/` | `user_create.html` | Provision a new user |
| `ui/geo-monitoring/` | `geo_monitoring.html` | Geo attempt review board |
| `ui/coordinators/` | `coordinator_board.html` | Coordinator approval board |
| `ui/feedback/` | `feedback.html` | Feedback intelligence dashboard |
| `ui/settings/` | `settings.html` | App settings + map sync |

### Admin API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `verification-images/` | Pending verification images |
| GET | `verification-images/<id>/file/` | Serve private image file |
| POST | `verification-images/<id>/review/` | Approve/reject verification image |
| GET | `coordinators/` | Pending coordinator applications |
| POST | `coordinators/<user_id>/<action>/` | Approve/suspend/revoke coordinator |
| GET | `dashboard/` | Aggregated system stats |
| POST | `moderation/` | Execute moderation action |
| GET | `feedback/` | Full feedback listing |
| POST | `feedback/<id>/hide/` | Hide inappropriate feedback |
| GET | `audit/` | Audit log browser |
| GET | `geo-attempts/` | Geo attempt review |
| GET | `coordinator-history/` | Coordinator handover history |
| POST | `maintenance/run/` | Trigger maintenance cleanup |
| GET | `users/<user_id>/moderation-summary/` | Per-user moderation summary |
| POST | `users/<user_id>/<action>/` | Warn/block/unblock/close user |
| GET/POST | `events/` | Admin event listing/creation |
| POST | `events/<event_id>/<action>/` | Admin event lifecycle actions |

---

## 11. Self-Hosted Map Engine

Introduced in **v0.6.0** (`MAP-TASK-01`) to permanently eliminate external tile server dependencies.

### Problem Solved

- **OSM block:** Browser `<img>` tags cannot set custom `User-Agent`, triggering OSM 403 bans.
- **Django streaming:** `.pmtiles` require HTTP 206 Partial Content support, absent from `runserver`.

### 3-Tier Architecture

| Tier | Description |
|---|---|
| **Tier 1 — Local SQLite MBTiles Store** | Persistent `.mbtiles` files on disk. ASEAN macro (z0–z9) + 14+ Myanmar regional micro packs (z10–z18). |
| **Tier 2 — Server Gatekeeper Proxy** | Django serves tiles from local store; on miss, fetches once with compliant `User-Agent`, caches permanently to SQLite, returns PNG. Falls back to SVG grid tile if fully offline. |
| **Tier 3 — Monthly Sync CLI** | `python manage.py sync_offline_maps --region <code> --max-zoom <z>` |

### Regional MBTiles Packs (`map/`)

| File | Coverage |
|---|---|
| `asean_macro.mbtiles` | ASEAN region, z0–z9 |
| `yangon.mbtiles` | Yangon Region |
| `mandalay.mbtiles` | Mandalay Region |
| `naypyidaw.mbtiles` | Naypyidaw Union Territory |
| `shan.mbtiles` | Shan State |
| `ayeyarwady.mbtiles` | Ayeyarwady Delta |
| `bagan_magway.mbtiles` | Central Dry Zone |
| `bago.mbtiles` | Bago Region |
| `mawlamyine_south.mbtiles` | Mon & Kayin Corridor |
| `rakhine.mbtiles` | Rakhine State |
| `sagaing.mbtiles` | Sagaing Region |
| `tanintharyi.mbtiles` | Tanintharyi Archipelago |
| `kachin.mbtiles` | Kachin State |
| `chin.mbtiles` | Chin State |
| `kayah.mbtiles` | Kayah State |
| `kayin.mbtiles` | Kayin State |
| `magway.mbtiles` | Magway Region |
| `mon.mbtiles` | Mon State |

### Map API Endpoints

| Method | Path | Description | Access |
|---|---|---|---|
| GET | `maps/catalog/` | JSON manifest of all tile packs | Public |
| GET | `maps/tiles/<z>/<x>/<y>.png` | Tile server (local → cache → SVG fallback) | Public |
| GET | `maps/regions/<region_code>/download/` | Stream regional `.mbtiles` with Range support | Public/Auth |
| POST | `maps/sync/` | Trigger admin tile sync/warm-up | Super Admin |

### Core Implementation

- **`backend/common/map_engine.py`** — Self-hosted tile engine: SQLite `.mbtiles` / `.pmtiles` store, ASEAN/Myanmar bounding-box calculator, compliant server-side tile fetcher, offline SVG fallback generator.
- **`backend/apps/events/management/commands/sync_offline_maps.py`** — Management command for monthly sync.

---

## 12. Common Utilities

Located in `backend/common/`:

| Module | Purpose |
|---|---|
| `authentication.py` | Token authentication backend for DRF |
| `db_context.py` | `DbContextMiddleware` — sets `app.user_id` and `app.ip` via `SET LOCAL` per request, enabling DB-level permission checks in triggers |
| `exceptions.py` | Custom DRF exception handler, maps service-layer coded exceptions to HTTP responses |
| `map_engine.py` | Self-hosted tile engine (see §11) |
| `permissions.py` | Custom DRF `BasePermission` classes (IsVolunteer, IsCoordinator, IsAdmin, etc.) |
| `privacy.py` | Phone number hashing (HMAC-SHA256) and encryption (Fernet) utilities |
| `schema.py` | `drf-spectacular` schema customizations and hooks |
| `security.py` | Input sanitization, anti-spoofing helpers |
| `serializers.py` | Shared serializer base classes and mixins |
| `transactions.py` | Context managers for atomic DB transactions with session-context injection |
| `utils.py` | General helpers (pagination, response formatting, date utilities) |

---

## 13. Tests

### Unit & Integration Tests (per-app)

| App / Module | Test Location |
|---|---|
| `apps.accounts` | `apps/accounts/tests/` |
| `apps.attendance` | `apps/attendance/tests/` |
| `apps.audit` | `apps/audit/tests/` |
| `apps.events` | `apps/events/tests/unit/` + `tests/integration/` |
| `bff.volunteer` | `bff/volunteer/tests/` |

### End-to-End Tests

`backend/tests_e2e/test_e2e_lifecycle.py` — Full volunteer lifecycle test (register → apply → assign → check-in → feedback).

### Running Tests

```bash
cd backend
# Using pytest (recommended)
pytest

# Using Django test runner
python manage.py test
```

> [!TIP]
> `config/test_runner.py` provides a custom test runner configuration.

---

## 14. Docker & Deployment

### `docker-compose.yml` Services

| Service | Image | Port | Description |
|---|---|---|---|
| `db` | `postgres:18-alpine` | `5432:5432` | PostgreSQL database |
| `backend` | Built from `backend/Dockerfile` | `8000:8000` | Django application server |

### `backend/Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev
COPY requirements/ /app/requirements/
RUN pip install --no-cache-dir -r requirements/local.txt
COPY . /app/
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

> [!WARNING]
> The Dockerfile installs `requirements/local.txt` (includes dev tools). For production, switch to `requirements/base.txt` and use Gunicorn/uWSGI instead of `runserver`.

### Starting the Stack

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with real secrets

# Start all services
docker-compose up -d

# Run database migrations (schema is SQL-driven)
docker-compose exec backend python manage.py migrate

# Seed the database
docker-compose exec db psql -U postgres -d volunteer_coordination_db \
  -f /path/to/postgres_sql/updated_volunteer_coordination_system_Database.sql

# Sync map tiles
docker-compose exec backend python manage.py sync_offline_maps
```

### Running Locally (without Docker)

```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate      # Unix

# Install dependencies
pip install -r backend/requirements/local.txt

# Configure environment
cp .env.example .env

# Run server
cd backend
python manage.py runserver
```

---

## 15. Database Seeding

Seed files are located in `seeding/`:

| File | Description |
|---|---|
| `seed_data.sql` | Primary seed data (users, events, assignments, etc.) |
| `Qwen_sql_20261106_cf1i1orzq.sql` | Supplemental seed data |

```bash
psql -U postgres -d volunteer_coordination_db -f seeding/seed_data.sql
```

---

## 16. Existing Documentation Files

The `docs/` directory contains the following planning and audit documents:

| File | Description |
|---|---|
| `BUSINESS_RULES_AND_PERMISSIONS.md` | Full business rules, permission matrix, and access control reference |
| `SEEDING_SQL_SPECIFICATION_AND_PROMPT_RULES.md` | Rules and specification for generating seed SQL |
| `P0_hygiene_dependency_audit_read_only.md` | Dependency hygiene audit (read-only review) |
| `v0_6_0_backend_audit_and_gap_remediation.md` | Backend audit findings and remediation plan |
| `volunteer_coordination_system_v0_6_0_full_remediation_new_features_seeding_admin_dashboard_plan.md` | Full remediation + new features + seeding + admin dashboard plan |
| `volunteer_coordination_system_v0_6_0_live_demo_swagger_api_testing_playbook.md` | Live demo & Swagger API testing playbook |
| `volunteer_coordination_system_v0_6_0_post_implementation_audit_exploit_review_final_polish_plan.md` | Post-implementation security audit & exploit review plan |
| `volunteer_coordination_system_v0_6_0_super_admin_control_center_v2_0_code_audit_final_hardening_plan.md` | Super Admin Control Center v2.0 — code audit & final hardening plan |
| `volunteer_coordination_system_v0_6_0_super_admin_control_center_v2_0_master_plan.md` | Super Admin Control Center v2.0 — master plan |

### Database Documentation

Located in `postgres_sql/`:

| File | Description |
|---|---|
| `Database_report.md` | Full PostgreSQL schema documentation (tables, triggers, views, functions, operational guide) |
| `updated_volunteer_coordination_system_Database.sql` | Canonical schema SQL (single source of truth) |
| `self_test.sql` | Self-test suite — runs `self_test()` to verify schema integrity |

### Architecture Planning Documents

Located in `prompt_code/spec/`:

| File | Description |
|---|---|
| `volunteer_coordination_system_v0_6_0_*.md` | Various version planning documents |
| `analysis_doc.txt` | System analysis notes |

---

## 17. Known Limitations & Explicit Exclusions

> [!CAUTION]
> The following items are **deliberately out of scope** for this system.

| Out of Scope | Reason |
|---|---|
| **Payroll / wage calculation** | Excluded by design — compensation is `unpaid` or `arranged_outside_system` |
| **Break timers** | Not a labour-law system |
| **Money movement / payments** | No financial transactions |
| **Legal contracts** | No document generation or e-signature |
| **Heavy AI/ML pipelines** | No model inference, embeddings, or vector search in the backend |
| **Mobile app (React Native)** | Maintained in the excluded `mobile/` directory |

> [!NOTE]
> **Django `managed = False`:** All app models are unmanaged. The database schema is fully owned by the SQL file in `postgres_sql/`. Django `migrate` does not create or alter any application tables — it only manages Django's own system tables (sessions, auth, contenttypes).

> [!WARNING]
> **`runserver` is not production-ready.** The current `Dockerfile` uses `python manage.py runserver`. For production, use Gunicorn with WSGI or Uvicorn with ASGI, behind a reverse proxy (Nginx/Caddy).

---

*Documentation generated: 2026-11-10 | System version: v0.6.0*
