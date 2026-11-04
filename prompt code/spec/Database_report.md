# Volunteer Coordination System — PostgreSQL Database Documentation

**Schema Version:** v0.5.2 (Database-First, Option A)
**Target Engine:** PostgreSQL 14+ (requires `btree_gist` extension)
**Stack:** Django 5.1/5.2 + DRF + BFF + React Native Workshift Client
**Architecture:** Option A — Event coordinator foreign keys point to `coordinator_profiles.user_id`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & Design Principles](#2-architecture--design-principles)
3. [Configuration & Core Helpers](#3-configuration--core-helpers)
4. [Data Tables Reference](#4-data-tables-reference)
5. [Helper Functions (Read Tables)](#5-helper-functions-read-tables)
6. [Workflow Functions](#6-workflow-functions)
7. [Triggers & State Machines](#7-triggers--state-machines)
8. [Views](#8-views)
9. [Self-Test Suite](#9-self-test-suite)
10. [Operational Guide](#10-operational-guide)
11. [Appendix](#11-appendix)

---

## 1. Overview

The Volunteer Coordination System (PEC HR / Workshift Coordination) is an online-first people-coordination platform for charity programs, food giveaways, teaching initiatives, and large-scale event setups. It handles recruitment, capability profiling, pre-work onboarding, role/group assignment, geolocation check-in, attendance tracking, feedback, and admin moderation.

**Scope:** Online-first coordination, onboarding, attendance, and feedback.
**Explicitly excluded:** Payroll, wage calculation, break timers, money movement, legal contracts, and heavy unstructured AI dependencies.

This document describes the **canonical database schema** — the single source of truth. Every business invariant that can be expressed in SQL is expressed as a constraint or trigger, not as an application convention.

### How to Load

```bash
# Load the schema into an EMPTY database
psql -U postgres -d volunteer_coordination_db -f updated_volunteer_coordination_system_Database.sql

# Verify the load
psql -U postgres -d volunteer_coordination_db -c "SELECT * FROM self_test();"
```

The entire schema is wrapped in a single `BEGIN ... COMMIT` transaction. **Any error rolls everything back**, so the database is never left in a half-built state.

---

## 2. Architecture & Design Principles

| Principle | Meaning |
|---|---|
| **Database is the source of truth** | Every invariant is a constraint or trigger. The application cannot accidentally write invalid data. |
| **Status machines are trigger-enforced** | Illegal transitions (e.g., `draft → completed`) raise errors. |
| **Event ownership split** | `events.owner_id` **never changes**. `events.current_coordinator_id` can be handed over, with history kept in `event_coordinator_history`. |
| **Geo check-in is server-measured** | The server computes the distance itself via `geo_check_in()`. The client's claimed distance is ignored. Every attempt is logged. |
| **Machine-coded errors** | Business errors are raised with a code prefix, e.g. `capacity_full: ...`. Expected business *failures* (wrong OTP, outside geofence) are returned as result codes, not raised. |
| **Session context** | Set once per request transaction via `SET LOCAL app.user_id = '<id>'` and `SET LOCAL app.ip = '<ip>'`. When set, triggers enforce permissions. When unset, the session is treated as trusted system/maintenance work. |
| **Foreign key policy** | `ON DELETE RESTRICT` everywhere (history is never cascaded away), except pure child rows (charity interests, event charity fields) which use `CASCADE`. |
| **Dual-identifier pattern** | Internal relational integrity, foreign key references, and joins rely on compact `BIGINT` surrogate keys (`users.id`). Public-facing APIs, URLs, mobile clients, and external tokens reference immutable, time-ordered `UUIDv7` (`users.uuid`) generated via `uuidv7()` to eliminate sequential ID enumeration (IDOR) attacks while maintaining B-tree clustering locality. |

---

## 3. Configuration & Core Helpers

### 3.1 `app_settings` — Tunable Parameters

Database-level settings stored as integer values.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | Primary key. Must match `^[a-z][a-z0-9_]*$` |
| `value_int` | INTEGER | NOT NULL |
| `description` | TEXT | Human-readable explanation |

**Seeded values:**

| Key | Value | Purpose |
|---|---|---|
| `geo_max_accuracy_m` | 100 | Reject GPS fixes less accurate than this (metres) |
| `geo_default_radius_m` | 150 | Geofence radius when the event does not set one |
| `geo_max_fix_age_sec` | 60 | Reject GPS fixes older than this (seconds) |
| `geo_checkin_window_before_min` | 30 | Minutes before `start_at` when geo check-in opens |
| `otp_max_requests_per_hour` | 5 | OTP requests allowed per phone per hour |
| `otp_max_attempts` | 5 | Wrong-code attempts allowed per OTP |
| `otp_ttl_minutes` | 5 | OTP lifetime (minutes) |

### 3.2 Core Helper Functions

| Function | Returns | Purpose |
|---|---|---|
| `setting_int(key)` | INTEGER | Reads an integer setting from `app_settings` |
| `app_user_id()` | BIGINT | Reads `app.user_id` session variable (NULL if unset) |
| `app_ip()` | INET | Reads `app.ip` session variable |
| `geo_distance_m(lat1, lon1, lat2, lon2)` | DOUBLE PRECISION | Haversine great-circle distance in metres |
| `tags_are_normalized(tags)` | BOOLEAN | True if array is lowercase, trimmed, non-empty, ≤30 tags of ≤50 chars |
| `set_updated_at()` | TRIGGER | Sets `updated_at := now()` on UPDATE |

---

## 4. Data Tables Reference

### 4.1 Lookup

#### `charity_fields` — Controlled Vocabulary

A single shared vocabulary used by both users (interests) and events (categories). Managed by admin.

| Column | Type | Constraints |
|---|---|---|
| `code` | TEXT | PK. Regex `^[a-z][a-z0-9_]{1,49}$` |
| `label` | TEXT | NOT NULL, 1–100 chars |
| `active` | BOOLEAN | NOT NULL DEFAULT TRUE |
| `sort_order` | INTEGER | NOT NULL DEFAULT 100 |

Seeded with 13 fields: `teaching`, `food_distribution`, `elderly_care`, `child_care`, `animal_welfare`, `environment`, `disaster_support`, `blood_donation`, `fundraising`, `logistics`, `cleaning`, `cooking`, `other`.

---

### 4.2 Identity & Capability

#### `users` — Custom Auth User Model

The central identity table. Phone OTP for mobile, optional password for admin web login. Implements a **dual-identifier pattern**: internal joins and relational constraints use `id` (`BIGINT`), while public-facing APIs, mobile clients, and external systems reference `uuid` (`UUIDv7`).

**Key columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT | Identity PK (internal surrogate key for high-speed foreign keys and joins) |
| `uuid` | UUID | Public/external identifier. NOT NULL, DEFAULT `uuidv7()`. Time-ordered UUID (RFC 9562) |
| `phone_hash` | TEXT | HMAC hash of phone. UNIQUE, immutable |
| `phone_enc` | TEXT | Fernet-encrypted phone number |
| `password` | TEXT | Nullable (NULL for OTP-only users) |
| `display_name` | TEXT | NOT NULL, 1–150 chars |
| `is_admin`, `is_staff`, `is_superuser`, `is_active` | BOOLEAN | Privilege flags. Staff/superuser imply admin |
| `account_status` | TEXT | `active` / `blocked` / `closed` |
| `blocked_until` | TIMESTAMPTZ | NULL while blocked = indefinite |
| `blood_type` | TEXT | Enum of 8 blood types + `unknown` |
| `skills` | TEXT[] | Normalized skill tags |
| `verification_status` | TEXT | `none` / `pending` / `verified` / `rejected`. Derived by trigger |
| Capability flags | BOOLEAN | `physical_ok`, `good_eyesight`, `needs_glasses`, `can_lift_heavy`, `can_work_outdoor`, `has_leader_experience`, `new_to_volunteer` |
| Donation flags | BOOLEAN | `is_willing_to_donate`, `_blood`, `_items` |
| Support flags | BOOLEAN | `needs_meal_support`, `needs_travel_support`, `accepts_unpaid` |

##### UUIDv7 Field Architecture & Strategy

- **Enumeration Attack (IDOR) Mitigation:** Exposing sequential auto-increment integers (`id`) in API responses or deep links leaks registration metrics and allows malicious actors to systematically enumerate records. The `uuid` field serves as the opaque, non-guessable external identity token.
- **B-Tree Locality & Index Efficiency:** Unlike random UUIDv4 (which causes index page fragmentation and random I/O thrashing under heavy write load), UUIDv7 embeds a 48-bit UNIX millisecond timestamp in the high-order bits. Consecutive inserts are monotonically ordered, allowing PostgreSQL to append into B-tree leaves identically to sequential integers.
- **Dual-Identifier Separation:**
  - `id` (BIGINT): Used internally across all relational foreign keys (`coordinator_profiles.user_id`, `assignments.user_id`, `audit_logs.actor_user_id`, etc.) to keep join overhead low and foreign-key indexes compact (8 bytes vs 16 bytes).
  - `uuid` (UUID): Used externally in REST/GraphQL payloads, client session headers, QR payloads, and external URLs.
- **Django ORM Representation:** Defined in `backend/apps/accounts/models.py` as:
  ```python
  uuid = models.UUIDField(unique=True, editable=False, db_default=models.Value("uuidv7()"))
  ```
- **PostgreSQL Compatibility:** Native in PostgreSQL 17+ (`DEFAULT uuidv7()`). For PostgreSQL 14–16, provided via the `pg_uuidv7` extension or a compatible PL/pgSQL function.

**Constraints (13):**

| Name | Rule |
|---|---|
| `uq_users_phone_hash` | Phone hash is unique |
| `ck_users_phone_hash_len` | Hash length 32–128 |
| `ck_users_display_name` | Name 1–150 chars (trimmed) |
| `ck_users_language` | BCP-47 language tag regex |
| `ck_users_account_status` | Status in (`active`,`blocked`,`closed`) |
| `ck_users_active_status_sync` | `is_active` equals (`account_status = 'active'`) |
| `ck_users_blocked_until` | `blocked_until` only when blocked |
| `ck_users_admin_flags` | Staff/superuser requires admin |
| `ck_users_blood_type` | Valid blood type enum |
| `ck_users_donation_consistency` | Sub-donation flags require master flag |
| `ck_users_emergency_pair` | Emergency name and phone both set or both null |
| `ck_users_skills` | Skills array is normalized |
| `ck_users_verification_status` | Valid verification enum |

**Indexes:** `idx_users_account_status`, `idx_users_verification_status`, `idx_users_is_admin` (partial), `idx_users_blood_donors` (partial), `idx_users_skills_gin` (GIN), `idx_users_blocked_until` (partial), and unique constraint/index on `uuid` (`uq_users_uuid`) for external lookups.

#### `user_charity_interests`

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT | FK → users (CASCADE) |
| `field_code` | TEXT | FK → charity_fields (RESTRICT) |

Unique on `(user_id, field_code)`.

#### `volunteer_availability_rules` — Recurring Weekly Windows

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT | FK → users (CASCADE) |
| `weekday` | INTEGER | 1–7 (Mon–Sun) |
| `start_time`, `end_time` | TIME | `end_time > start_time` |
| `valid_from`, `valid_to` | DATE | Optional date range |

Unique on `(user_id, weekday, start_time)`.

#### `volunteer_availability_exceptions` — Date-Specific Overrides

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT | FK → users (CASCADE) |
| `date` | DATE | The specific date |
| `is_available` | BOOLEAN | TRUE = available despite rules, FALSE = blocked |
| `start_time`, `end_time` | TIME | Optional; both or neither |

Unique on `(user_id, date)`. Exceptions override weekly rules.

#### `coordinator_profiles` — Coordinator Approval

A user may own or coordinate events only while `status = 'approved'`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT | PK, FK → users (RESTRICT) |
| `status` | TEXT | `pending` / `approved` / `suspended` / `revoked` |
| `approved_by_id` | BIGINT | FK → users (RESTRICT) |
| `approved_at` | TIMESTAMPTZ | Set on approval |

**Constraints:** `ck_coordinator_status`, `ck_coordinator_approval` (approved requires `approved_at` + `approved_by_id`), `ck_coordinator_no_self_approval`.

#### `user_verification_images` — Identity Verification

JPEG-only selfie/ID images for verification review.

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT | FK → users (RESTRICT) |
| `image_type` | TEXT | `mock_selfie` / `id_license` / `driver_license` |
| `image_path` | TEXT | Must end in `.jpg`/`.jpeg`, 1–255 chars |
| `file_format` | TEXT | Always `jpeg` |
| `file_sha256` | TEXT | Optional 64-char hex |
| `status` | TEXT | `pending` / `approved` / `rejected` |
| `comparison_status` | TEXT | `pending` / `match` / `no_match` / `needs_review` |
| `comparison_score` | NUMERIC(5,4) | 0–1 |
| `is_current` | BOOLEAN | One current image per type per user |
| `reviewed_by_id`, `reviewed_at` | — | Required once reviewed |

**Partial unique index:** `uq_current_verification_image` on `(user_id, image_type) WHERE is_current`.

#### `auth_otp` — One-Time Passwords

| Column | Type | Notes |
|---|---|---|
| `phone_hash` | TEXT | Lookup key |
| `code_hash` | TEXT | Never the raw code |
| `purpose` | TEXT | `login` / `qr_registration` |
| `attempt_count` | INTEGER | 0–100 |
| `expires_at` | TIMESTAMPTZ | Must be after `created_at` |
| `consumed_at` | TIMESTAMPTZ | Set when used |

**Indexes:** by `(phone_hash, created_at DESC)`, partial open-OTP index, and `expires_at`.

---

### 4.3 Events

#### `events` — The Central Event Table

| Column | Type | Notes |
|---|---|---|
| `owner_id` | BIGINT | FK → coordinator_profiles(user_id). **NEVER changes** |
| `current_coordinator_id` | BIGINT | FK → coordinator_profiles(user_id). Can be handed over |
| `title` | TEXT | 1–255 chars |
| `purpose_type` | TEXT | `charity_event` / `help_wanted_event` |
| `latitude`, `longitude` | NUMERIC(9,6) | Geo check-in point |
| `geo_radius_m` | INTEGER | 20–5000, NULL = default |
| `geo_checkin_enabled` | BOOLEAN | Requires a point |
| `geo_checkin_opens_before_min` | INTEGER | 0–240 |
| `require_checkin_confirmation` | BOOLEAN | Coordinator must confirm geo check-ins |
| `map_provider` | TEXT | `openstreetmap` / `google` |
| `start_at`, `end_at` | TIMESTAMPTZ | `end_at > start_at` |
| `application_deadline` | TIMESTAMPTZ | Must be ≤ `start_at` |
| `status` | TEXT | `draft` / `published` / `active` / `completed` / `cancelled` |
| `acceptance_mode` | TEXT | `auto` / `manual` |
| `auto_assign_enabled` | BOOLEAN | Default TRUE |
| `group_size` | INTEGER | > 0 or NULL |
| `leader_strategy` | TEXT | `none` / `first_experienced` / `manual` |
| `max_participants` | INTEGER | > 0 or NULL |
| Recruiting conditions | BOOLEAN/TEXT | `meals_provided`, `lodging_provided`, `travel_support_provided`, `compensation_kind`, `compensation_note` |
| `onboarding_text`, `onboarding_version` | TEXT/INTEGER | Version bumped by trigger on text change |
| Lifecycle timestamps | TIMESTAMPTZ | `published_at`, `activated_at`, `completed_at`, `cancelled_at` |
| `deleted_at`, `deleted_by_id` | — | Soft delete; both set or both null |

**Notable constraints:** `ck_events_time`, `ck_events_deadline`, `ck_events_soft_delete`, geo range checks, and `ck_events_status_timestamps` (lifecycle timestamps must match status).

**Indexes:** by owner, coordinator, `start_at`, and a partial `idx_events_visible` (non-deleted).

#### `event_coordinator_history` — Handover Audit Trail

Append-only. One row per coordinator handover (and one initial row on event creation).

| Column | Type | Notes |
|---|---|---|
| `event_id` | BIGINT | FK → events (RESTRICT) |
| `from_coordinator_id` | BIGINT | FK → coordinator_profiles. NULL = first assignment |
| `to_coordinator_id` | BIGINT | FK → coordinator_profiles |
| `changed_by_user_id` | BIGINT | FK → users |
| `reason` | TEXT | Optional |

Constraint: `from_coordinator_id IS DISTINCT FROM to_coordinator_id`.

#### `event_charity_fields`

Links events to charity categories. Unique on `(event_id, field_code)`.

#### `event_posts` — Roles Needed at an Event

| Column | Type | Notes |
|---|---|---|
| `event_id` | BIGINT | FK → events (RESTRICT) |
| `title` | TEXT | 1–150 chars |
| `required_headcount` | INTEGER | 1–100000 |
| `physical_level` | TEXT | `none` / `light` / `medium` / `heavy` |
| `required_skills` | TEXT[] | Normalized |
| `leader_needed` | BOOLEAN | |
| `new_volunteers_allowed` | BOOLEAN | Default TRUE |
| `priority` | INTEGER | Lower = filled first |
| `status` | TEXT | `open` / `full` / `closed`. open/full maintained by trigger |

**Composite unique:** `uq_event_posts_id_event` on `(id, event_id)` — target of composite foreign keys.

---

### 4.4 QR, Applications, Assignments

#### `qr_tokens` — Hashed QR Tokens

Only the hash is stored; the raw token is returned once at creation.

| Column | Type | Notes |
|---|---|---|
| `event_id` | BIGINT | FK → events (RESTRICT) |
| `created_by_id` | BIGINT | FK → users (RESTRICT) |
| `purpose` | TEXT | `walkin_registration` / `checkin` / `join_event` |
| `token_hash` | TEXT | UNIQUE, 32–128 chars |
| `max_uses` | INTEGER | NULL = unlimited |
| `used_count` | INTEGER | ≥ 0, ≤ `max_uses` |
| `expires_at`, `revoked_at` | TIMESTAMPTZ | |

#### `event_applications`

| Column | Type | Notes |
|---|---|---|
| `event_id` | BIGINT | FK → events (RESTRICT) |
| `post_id` | BIGINT | Composite FK to `event_posts(id, event_id)` |
| `user_id` | BIGINT | FK → users (RESTRICT) |
| `qr_token_id` | BIGINT | Composite FK to `qr_tokens(id, event_id)` |
| `source` | TEXT | `browse` / `qr_walkin` / `invite` |
| `status` | TEXT | `pending` / `accepted` / `waitlisted` / `rejected` / `withdrawn` / `expired` |
| `decided_by_id`, `decided_at` | — | NULL `decided_by_id` + set `decided_at` = auto-decision |
| `conditions_snapshot` | JSONB | Recruiting conditions at application time |

**Composite FKs** ensure the post and QR token belong to the same event. `ck_application_walkin_token` requires a token for `qr_walkin`. `ck_application_no_self_decision` prevents self-decision.

**Partial unique index:** `uq_event_application_active` on `(event_id, user_id)` for active statuses.

#### `assignments`

| Column | Type | Notes |
|---|---|---|
| `event_id`, `application_id`, `user_id` | BIGINT | Composite FK to `event_applications(id, event_id, user_id)` |
| `post_id` | BIGINT | Composite FK to `event_posts(id, event_id)` |
| `group_code` | TEXT | e.g. `G1`, `G2` |
| `is_group_leader` | BOOLEAN | Requires `group_code` |
| `status` | TEXT | `assigned` / `confirmed` / `completed` / `cancelled` |
| `assigned_by` | TEXT | `auto` / `coordinator` / `admin` |
| `assigned_by_user_id` | BIGINT | NULL when `auto` |
| `schedule_start`, `schedule_end` | TIMESTAMPTZ | NOT NULL; filled from event by trigger |

**Key constraint — `ex_assignments_no_overlap`:** An `EXCLUDE USING gist` rule preventing a volunteer from holding two overlapping active assignments (across all events). Requires `btree_gist`.

**Partial unique indexes:** `uq_assignment_active`, `uq_assignment_application`, `uq_assignment_group_leader`.

---

### 4.5 Attendance & Onboarding

#### `attendance` — Presence Evidence

| Column | Type | Notes |
|---|---|---|
| `event_id`, `user_id` | BIGINT | Unique together |
| `assignment_id` | BIGINT | NOT NULL. Composite FK to `assignments(id, event_id, user_id)` |
| `qr_token_id` | BIGINT | Composite FK to `qr_tokens(id, event_id)` |
| `status` | TEXT | `expected` / `checked_in` / `absent` / `completed` / `cancelled` |
| `checkin_at`, `checkout_at` | TIMESTAMPTZ | `checkout_at ≥ checkin_at` |
| `method` | TEXT | `qr_scan` / `coordinator_manual` / `geo` / `system` |
| `walk_in_flag` | BOOLEAN | Walk-ins cannot use geo check-in |
| Geo evidence | NUMERIC/BOOLEAN | `checkin_latitude`, `checkin_longitude`, `checkin_accuracy_m`, `checkin_distance_m`, `geo_verified` |
| Confirmation | TEXT/BIGINT/TIMESTAMPTZ | `confirmation_status`, `confirmed_by_user_id`, `confirmed_at`, `confirmation_note` |

**Confirmation statuses:** `not_required` / `pending` / `confirmed` / `rejected`.

#### `attendance_geo_attempts` — Anti-Fraud Log

Every geo check-in attempt (accepted or not) is logged for fraud review. Append-only.

| Column | Type | Notes |
|---|---|---|
| `result` | TEXT | 13 values incl. `accepted`, `outside_geofence`, `mock_location`, `low_accuracy`, `stale_fix`, `window_closed`, `not_assigned`, `onboarding_required`, etc. |
| `review_status` | TEXT | `none` / `pending` / `confirmed` / `rejected` |
| `device_mocked` | BOOLEAN | Fraud signal |

#### `onboarding_acknowledgments` — Append-Only

| Column | Type | Notes |
|---|---|---|
| `user_id`, `event_id` | BIGINT | FKs (RESTRICT) |
| `onboarding_version` | INTEGER | ≥ 1 |
| `method` | TEXT | `app_tick` |

Unique on `(user_id, event_id, onboarding_version)`.

---

### 4.6 Feedback & Governance

#### `feedback`

| Column | Type | Notes |
|---|---|---|
| `event_id` | BIGINT | FK → events (RESTRICT) |
| `rater_user_id` | BIGINT | FK → users (RESTRICT) |
| `target_user_id` | BIGINT | FK → users (RESTRICT). NULL for `volunteer_to_event` |
| `direction` | TEXT | `coordinator_to_volunteer` / `volunteer_to_event` / `volunteer_to_coordinator` |
| `score` | INTEGER | NOT NULL, 1–5 |
| `tags` | TEXT[] | Normalized |
| `status` | TEXT | `active` / `hidden` (hidden only via admin moderation) |

**Partial unique indexes:** `uq_feedback_event_once` (no target) and `uq_feedback_user_once` (with target) prevent duplicate feedback.

#### `moderation_actions` — Insert Applies the Action

Inserting a row **applies** the action via trigger. This is the only supported way to block users, delete events, or hide feedback.

| Column | Type | Notes |
|---|---|---|
| `admin_user_id` | BIGINT | NOT NULL, FK → users (RESTRICT) |
| `target_user_id`, `event_id`, `feedback_id` | BIGINT | Mutually exclusive by action type |
| `action_type` | TEXT | 9 values: `user_warning`, `user_block`, `user_unblock`, `account_close`, `account_reinstate`, `event_delete`, `event_restore`, `event_cancel`, `feedback_hide` |
| `reason` | TEXT | Required for destructive actions |
| `expires_at` | TIMESTAMPTZ | Only for `user_block` |

**Constraints:** `ck_moderation_subject` (correct target per action), `ck_moderation_no_self`, `ck_moderation_reason`.

#### `audit_logs` — Append-Only Trail

| Column | Type | Notes |
|---|---|---|
| `actor_user_id` | BIGINT | FK → users (RESTRICT) |
| `action` | TEXT | e.g. `users.update` |
| `entity_type`, `entity_id` | TEXT/BIGINT | What changed |
| `before_data`, `after_data` | JSONB | Only changed columns for updates |
| `ip_address` | INET | |

Protected by triggers against UPDATE, DELETE, and TRUNCATE.

---

## 5. Helper Functions (Read Tables)

| Function | Returns | Purpose |
|---|---|---|
| `is_admin_user(user)` | BOOLEAN | User is an active admin |
| `is_approved_coordinator(user)` | BOOLEAN | User has an approved coordinator profile and is active |
| `is_event_manager(event, user)` | BOOLEAN | Admin, or owner/current coordinator who is still approved |
| `user_has_schedule_conflict(user, start, end, except_event)` | BOOLEAN | Overlapping active assignment exists |
| `is_user_available(user, start, end)` | BOOLEAN | Checks date exceptions first, then weekly rules. No rules = available |
| `assert_actor(actor)` | VOID | Guards workflow functions; sets `app.user_id` |
| `application_remaining_capacity(event, post)` | INTEGER | Lower of event ceiling and post headcount. NULL = unlimited |
| `consume_qr_token(token, purpose)` | VOID | Atomically spends one use or raises `qr_token_invalid` |
| `qr_token_status(token_hash)` | TABLE | Read-only preview (does not consume) |
| `recompute_user_verification(user)` | VOID | Derives `verification_status` from current images |

**Verification status hierarchy:** `none` (no current image) → `rejected` (any rejected) → `verified` (approved selfie AND approved ID/license) → `pending` (anything else).

---

## 6. Workflow Functions

### 6.1 OTP

| Function | Returns | Behavior |
|---|---|---|
| `request_otp(phone_hash, code_hash, purpose)` | BIGINT | Creates OTP with TTL. Rate limit enforced by trigger |
| `verify_otp(phone_hash, code_hash, purpose)` | TEXT | Returns `ok` / `invalid_code` / `expired` / `too_many_attempts` / `no_otp`. Never raises for wrong code so the attempt counter persists |

### 6.2 Assignment

| Function | Returns | Behavior |
|---|---|---|
| `create_assignment_from_application(app, actor)` | BIGINT | The **only automatic path** that creates assignments. Matches skills, physical level, new-volunteer rules, capacity, grouping, and leader selection. Returns NULL if no fit or conflict |
| `run_auto_assignment(event, actor)` | INTEGER | Assigns every accepted-but-unassigned application |
| `assign_manually(app, post, actor, group, leader)` | BIGINT | Coordinator places/moves an accepted volunteer. Capacity enforced by trigger |

### 6.3 Coordinator Handover

| Function | Returns | Behavior |
|---|---|---|
| `change_event_coordinator(event, new_coord, actor, reason)` | VOID | Owner/current coordinator/admin can hand over. Writes history via trigger. Frozen events cannot change |

### 6.4 Check-In

| Function | Returns | Behavior |
|---|---|---|
| `qr_check_in(token_hash, user)` | BIGINT | Volunteer scans coordinator's check-in QR. **Idempotent** — repeat scan returns same attendance, spends no use |
| `qr_walkin_apply(token_hash, user)` | BIGINT | Walk-in applies via QR. Application stays `pending` until accepted |
| `geo_check_in(event, user, lat, lon, accuracy, captured_at, is_mocked)` | TABLE | Server measures distance. Returns result code + attendance + distance + confirmation. Logs every attempt |
| `confirm_attendance(attendance, actor, note)` | VOID | Coordinator confirms a pending geo check-in |
| `reject_attendance(attendance, actor, reason)` | VOID | Coordinator rejects; attendance returns to `expected`, evidence cleared (kept in attempts log) |

**`geo_check_in` result codes:** `accepted`, `already_checked_in`, `invalid_fix`, `low_accuracy`, `stale_fix`, `mock_location`, `outside_geofence`, `window_closed`, `event_not_active`, `geo_disabled`, `not_assigned`, `not_eligible`, `onboarding_required`.

### 6.5 Maintenance (Run from a Scheduler)

| Function | Returns | Purpose |
|---|---|---|
| `release_expired_blocks()` | INTEGER | Unblocks users whose `blocked_until` has passed |
| `expire_stale_applications()` | INTEGER | Expires pending/waitlisted apps for ended events |
| `purge_expired_otps()` | INTEGER | Deletes OTPs older than a day |
| `purge_geo_evidence(interval)` | INTEGER | Nulls coordinates of old geo check-ins (privacy). Distances/results stay |

---

## 7. Triggers & State Machines

### Naming Convention

Triggers fire in alphabetical order within a kind, hence numeric prefixes:

| Prefix | Purpose |
|---|---|
| `trg_01_*` | Guards and state machines (BEFORE) |
| `trg_50_*` | Cascades (AFTER) |
| `trg_90_*` | `updated_at` timestamps |
| `trg_95_*` | Automatic audit trail |

### Trigger Summary by Table

| Table | Key Trigger(s) | What It Enforces |
|---|---|---|
| `users` | `trg_users_guard` | Syncs `is_active`; only admins change privilege/account fields; `phone_hash` and `uuid` immutable |
| `coordinator_profiles` | `trg_coordinator_guard` | Status machine; approval requires admin approver + verified active user |
| `user_verification_images` | `trg_vimg_guard`, `trg_vimg_after` | Immutable uploads; admin-only review; recomputes user verification |
| `auth_otp` | `trg_otp_rate_limit` | Max requests per phone per hour |
| `events` | `trg_events_before_insert/update`, `trg_events_after_insert/update` | Owner must be approved coordinator; status machine; publish requires a post; frozen terminal events; onboarding version auto-bump; lifecycle cascades; coordinator history |
| `event_posts` | `trg_posts_guard` | Post can't move events; headcount can't drop below assigned; auto open/full |
| `qr_tokens` | `trg_qr_guard` | Only for open events; manager-only creation; immutable except `used_count`/`revoked_at` |
| `event_applications` | `trg_applications_before_insert/update`, `trg_applications_after` | Event open, deadline, active account, schedule conflict, QR consumption, auto-accept/waitlist, status machine, capacity on accept, auto-assign on accept |
| `assignments` | `trg_assignments_before_insert/update`, `trg_assignments_after_insert/update` | Accepted-only, capacity, status machine, permission checks; creates attendance; re-evaluates post open/full |
| `attendance` | `trg_attendance_before_insert`, `trg_attendance_guard` | Created as `expected`; status machine; method-specific check-in rules; server-side geo distance; confirmation rules |
| `attendance_geo_attempts` | `trg_geo_attempts_guard`, `_no_delete` | Append-only; coordinates removable but never changed |
| `onboarding_acknowledgments` | `trg_onboarding_before_insert`, `_append_only` | Current version only; applicant only; append-only |
| `feedback` | `trg_feedback_guard` | Completed event only; direction/rater/target rules; immutable after submit |
| `moderation_actions` | `trg_moderation_before_insert`, `_after_insert`, `_append_only` | Admin-only; applies side effects; append-only |
| `audit_logs` | `trg_01_audit_append_only`, `_no_truncate` | Append-only; TRUNCATE blocked |
| `event_coordinator_history` | `trg_01_coord_history_append_only` | Append-only |

### Automatic Audit Trail (`trg_audit_row`)

- Secrets and noise columns are stripped (`phone_enc`, `password`, `emergency_contact_phone_enc`, `token_hash`, `code_hash`, `updated_at`, `last_login`).
- For updates, only **changed columns** are stored.
- Extra columns to hide can be passed as trigger arguments (e.g., attendance hides `checkin_latitude`/`checkin_longitude`).

---

## 8. Views

| View | Purpose |
|---|---|
| `v_event_post_capacity` | Remaining places per post |
| `v_public_events` | What volunteers browse (published/active, not deleted) with charity fields and spots remaining |
| `v_event_summary` | Per-event counters for the coordinator board (avoids join fan-out via subqueries) |
| `v_accepted_unassigned` | Accepted applications with no assignment yet |
| `v_event_checkin_board` | Worker list with live check-in state |
| `v_event_checkin_status` | Alias of the check-in board for compatibility |
| `v_pending_confirmations` | Coordinator's queue of geo check-ins awaiting a decision |
| `v_geo_attempts_review` | Geo attempt log for fraud/telemetry review |
| `v_event_coordinator_history` | Coordinator handover history |
| `v_user_moderation_summary` | Warnings and blocks per user |
| `v_admin_dashboard` | Single-row admin KPI summary |

---

## 9. Self-Test Suite

`self_test()` verifies constraints, triggers, composite FKs, EXCLUDE rules, and audit immutability. **All temporary rows (including automatic `audit_logs` rows) are rolled back automatically** — zero pollution.

| # | Test | Verifies |
|---|---|---|
| 1 | `ck_users_blood_type` | Invalid blood type rejected |
| 2 | `ck_users_account_status` | Invalid account status rejected |
| 3 | `ck_users_donation_consistency` | Donation consistency enforced |
| 4 | `ck_availability_time_order` | Availability time order enforced |
| 5 | `ck_events_time` | Event time order enforced |
| 6 | `ck_events_map_provider` | Map provider enum enforced |
| 7 | `ck_qr_used_count` | QR `used_count` cannot exceed `max_uses` |
| 8 | `schedule_conflict_guard` | Overlapping assignment at a second event rejected |
| 9 | `ck_feedback_score` | Feedback score range enforced |
| 10 | `audit_logs_immutable` | Audit logs are append-only |

Run with:
```sql
SELECT * FROM self_test();
```

---

## 10. Operational Guide

### 10.1 Session Context

At the start of each request transaction, set:

```sql
SET LOCAL app.user_id = '<acting user id>';
SET LOCAL app.ip = '<client ip>';
```

When `app.user_id` is set, triggers enforce who may do what. When unset, the session is treated as trusted system/maintenance work.

### 10.2 Recommended Access Control

- Create two roles: `app_rw` (the application) and `app_ro` (reporting).
- Audit tables are already append-only by trigger; also revoke the privilege:
  ```sql
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, event_coordinator_history, moderation_actions FROM app_rw;
  ```

### 10.3 Maintenance Schedule

| Function | Frequency |
|---|---|
| `release_expired_blocks()` | Every few minutes |
| `expire_stale_applications()` | Hourly |
| `purge_expired_otps()` | Hourly |
| `purge_geo_evidence('90 days')` | Daily |

### 10.4 Post-Load Verification

```sql
SELECT 'check_constraints' AS what, COUNT(*) FROM pg_constraint
  WHERE connamespace='public'::regnamespace AND contype='c' AND conname LIKE 'ck_%'
UNION ALL SELECT 'unique_constraints', COUNT(*) FROM pg_constraint
  WHERE connamespace='public'::regnamespace AND contype='u' AND conname LIKE 'uq_%'
UNION ALL SELECT 'uq_indexes', COUNT(*) FROM pg_indexes
  WHERE schemaname='public' AND indexname LIKE 'uq_%'
UNION ALL SELECT 'gin_indexes', COUNT(*) FROM pg_indexes
  WHERE schemaname='public' AND indexdef LIKE '%USING gin%'
UNION ALL SELECT 'exclude_constraints', COUNT(*) FROM pg_constraint
  WHERE connamespace='public'::regnamespace AND contype='x'
UNION ALL SELECT 'triggers', COUNT(*) FROM pg_trigger
  WHERE tgname LIKE 'trg_%'
UNION ALL SELECT 'functions', COUNT(*) FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
UNION ALL SELECT 'views', COUNT(*) FROM pg_views
  WHERE schemaname = 'public';
```

---

## 11. Appendix

### 11.1 Status Enum Reference

| Entity | Values |
|---|---|
| `users.account_status` | `active`, `blocked`, `closed` |
| `users.verification_status` | `none`, `pending`, `verified`, `rejected` |
| `coordinator_profiles.status` | `pending`, `approved`, `suspended`, `revoked` |
| `user_verification_images.status` | `pending`, `approved`, `rejected` |
| `events.status` | `draft`, `published`, `active`, `completed`, `cancelled` |
| `event_posts.status` | `open`, `full`, `closed` |
| `event_applications.status` | `pending`, `accepted`, `waitlisted`, `rejected`, `withdrawn`, `expired` |
| `assignments.status` | `assigned`, `confirmed`, `completed`, `cancelled` |
| `attendance.status` | `expected`, `checked_in`, `absent`, `completed`, `cancelled` |
| `attendance.confirmation_status` | `not_required`, `pending`, `confirmed`, `rejected` |
| `attendance.method` | `qr_scan`, `coordinator_manual`, `geo`, `system` |
| `feedback.status` | `active`, `hidden` |
| `qr_tokens.purpose` | `walkin_registration`, `checkin`, `join_event` |

### 11.2 Constraint Naming Convention

| Prefix | Meaning |
|---|---|
| `ck_*` | CHECK constraint |
| `uq_*` | UNIQUE constraint or unique index |
| `fk_*` | Named composite foreign key |
| `ex_*` | EXCLUDE constraint |
| `idx_*` | Non-unique index |
| `trg_*` | Trigger |

### 11.3 Object Counts (Expected)

| Object Type | Count |
|---|---|
| Tables | 22 |
| CHECK constraints | ~75 |
| UNIQUE constraints/indexes | ~18 |
| EXCLUDE constraints | 1 |
| GIN indexes | 3 |
| Triggers | ~50 |
| Functions | ~40 |
| Views | 11 |

---

*End of documentation.*