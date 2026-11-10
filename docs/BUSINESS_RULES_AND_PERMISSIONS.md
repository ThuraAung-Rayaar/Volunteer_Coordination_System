# Volunteer Coordination System v0.6.0
# Business Rules & Permissions — Complete Implementation Reference

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch:** `fix/bknd_stablize` (HEAD `3c03f37`)  
**Server:** `http://127.0.0.1:8000`  
**Date:** 2026-11-06  
**Scope:** Every business rule, permission guard, state machine, and data access policy currently
implemented in the Django + DRF + PostgreSQL backend. Rules are stated as implemented facts; SQL-enforced
rules are marked **(DB)**; Python-layer rules are marked **(PY)**; both layers enforce the same rule where
marked **(DB+PY)**.

---

## Table of Contents

1. [Role & Identity Model](#1-role--identity-model)
2. [Authentication System](#2-authentication-system)
3. [DRF Permission Classes](#3-drf-permission-classes)
4. [Privacy Tier Model (T0–T4)](#4-privacy-tier-model-t0t4)
5. [User Profile Rules](#5-user-profile-rules)
6. [Identity Verification Rules](#6-identity-verification-rules)
7. [Coordinator Lifecycle Rules](#7-coordinator-lifecycle-rules)
8. [Event Lifecycle Rules](#8-event-lifecycle-rules)
9. [Application Rules](#9-application-rules)
10. [Assignment Rules](#10-assignment-rules)
11. [QR Token Rules](#11-qr-token-rules)
12. [Attendance & Check-In Rules](#12-attendance--check-in-rules)
13. [Onboarding Acknowledgment Rules](#13-onboarding-acknowledgment-rules)
14. [Feedback Rules](#14-feedback-rules)
15. [Moderation Rules](#15-moderation-rules)
16. [Admin Portal Rules](#16-admin-portal-rules)
17. [Serializer & Input Validation Rules](#17-serializer--input-validation-rules)
18. [Data Never Exposed](#18-data-never-exposed)
19. [API URL Surface](#19-api-url-surface)
20. [Event Lifecycle State Machine (Summary Diagram)](#20-event-lifecycle-state-machine)

---

## 1. Role & Identity Model

### 1.1 User Fields

There is **no `role` field** on the `Users` model. Role is determined by field combination:

| Role | Field Condition | Source file |
|---|---|---|
| **Anonymous** | Not authenticated | — |
| **Volunteer (Active)** | `is_admin=False`, `account_status='active'`, `is_active=True` | `apps/accounts/models.py` |
| **Coordinator (Approved)** | `is_admin=False`, active, plus `coordinator_profiles.status='approved'` | `apps/accounts/models.py` + `apps/coordination/models.py` |
| **Admin** | `is_admin=True`, `is_active=True`, `account_status='active'` | `apps/accounts/models.py` |
| **Super Admin** | `is_admin=True`, `is_superuser=True`, `is_active=True` | `apps/accounts/models.py` |

### 1.2 Account Status Machine

```
active ──block──▶ blocked ──release──▶ active
active ──close──▶ closed   (terminal, only super admin can reinstate)
```

| Status | Meaning |
|---|---|
| `active` | Normal operation |
| `blocked` | Temporarily banned; `blocked_until` may be set for expiry |
| `closed` | Permanently closed; login and OTP requests rejected with HTTP 403 |

**Lazy block release (PY):** Every token authentication call checks `blocked_until <= now()` and calls the SQL `release_expired_blocks()` before rejecting or allowing the request (`common/authentication.py` L48–52).

### 1.3 Verification Status Machine

```
none ──upload──▶ pending ──approve──▶ verified
                 pending ──reject──▶ rejected
```

Recomputed automatically by SQL trigger `trg_50_vimg_after` calling `recompute_user_verification()` **(DB)**.

### 1.4 UUID

Every user gets a UUIDv7 generated on the PostgreSQL side: `db_default=RawSQL('uuidv7()', [])`. The Django `uuid` field is never set by Python code.

---

## 2. Authentication System

### 2.1 OTP Flow

**Source:** `services/auth_service.py`

| Step | Rule | Layer |
|---|---|---|
| Normalize phone | Strips spaces, hyphens, parens, dots; validates 7–15 digits; preserves `+` | PY |
| Compute phone_hash | HMAC-SHA256 with `PHONE_HASH_HMAC_SECRET` from settings | PY |
| Check account status | `closed` → HTTP 403; `blocked` → try `release_expired_blocks()` first | PY |
| OTP code generation | 4-digit cryptographically secure numeric code (`secrets.randbelow`) | PY |
| Rate limit enforcement | `request_otp(phone_hash, code_hash, purpose)` SQL function; `trg_01_otp_rate_limit` raises `otp_rate_limited` on excess → HTTP 429 | DB |
| OTP delivery | Console adapter only (no real SMS); `delivered: False` unless `DEBUG=True` | PY |
| OTP verification | `verify_otp(phone_hash, code_hash, purpose)` SQL function; returns result code | DB |
| First-time registration | On first successful OTP verify: auto-create `Users` row | PY |
| Token issuance | `Token.objects.get_or_create(user=user)` — persistent DRF token, no expiry | PY |
| `dev_code` exposure | OTP code included in response body **only when `DEBUG=True`** | PY |
| Logout | Deletes the DRF token; subsequent requests with that token receive 401 | PY |

### 2.2 Token Authentication

**Source:** `common/authentication.py` — `BlockedAwareTokenAuthentication`

Every authenticated API request:
1. Resolves DRF token → user
2. Runs lazy block expiry if `blocked_until` has passed
3. Rejects `blocked` or `closed` accounts with `AuthenticationFailed` → HTTP 401
4. Sets PostgreSQL session context: `app.user_id` and `app.ip` for trigger attribution

### 2.3 OTP Code Never Logged

Raw OTP codes are never written to any log. The delivery adapter receives the code but logs only the purpose and adapter method.

---

## 3. DRF Permission Classes

**Source:** `common/permissions.py`

| Class | Condition | Used for |
|---|---|---|
| `IsActiveUser` | Authenticated + `is_active=True` + `account_status='active'` | Standard authenticated endpoints |
| `IsAdminUser` | `is_admin=True` + `is_active=True` | Admin-only API endpoints |
| `IsSuperAdminUser` | `is_admin=True` + `is_superuser=True` + `is_active=True` | Super-admin-only actions |
| `IsApprovedCoordinator` | Active + `coordinator_profile.status='approved'` | Coordinator management endpoints |
| `AllowAnyReadOnly` | GET/HEAD/OPTIONS: anyone; mutations: authenticated | Public browsing endpoints |

### 3.1 Guard Functions (raise on failure)

| Function | Failure Behavior | Used By |
|---|---|---|
| `ensure_active_user(user)` | Raises `PermissionDeniedError` (HTTP 401 if unauthenticated, 403 if inactive) | Service layer |
| `ensure_admin(request, require_superuser)` | Logs security red-alert; raises `ResourceMaskedNotFound` (HTTP **404**, not 403) to mask endpoint existence | Admin route entry points |
| `ensure_approved_coordinator(user)` | Raises `PermissionDeniedError` (HTTP 403) | Coordinator write operations |

### 3.2 404-Not-403 Masking

All admin route failures return HTTP 404 (not 403) to prevent information leakage about whether admin endpoints exist. This is applied by `ensure_admin()` and `get_event_for_manager_or_404()`.

---

## 4. Privacy Tier Model (T0–T4)

**Source:** `common/privacy.py`

### Tier Definitions

| Tier | Name | Who can access |
|---|---|---|
| **T0** | Public | Anyone (unauthenticated or authenticated) |
| **T1** | Minimal Identity + Self | UUID + display_name for anyone authenticated; full self-data for owner |
| **T2** | Event-Scoped Semi-Private | Event managers (owner, coordinator, admin) for volunteers with accepted application or active assignment |
| **T3** | Strictly Private | Self only + Admin + Active-Shift Safety Exception |
| **T4** | Admin & Governance | Admin or Super Admin only |

### T0 — Public Event Fields

```
event_id, title, description, purpose_type, location_name, landmark_text,
latitude, longitude, geo_radius_m, geo_checkin_enabled, map_provider,
start_at, end_at, application_deadline, status, acceptance_mode,
max_participants, meals_provided, lodging_provided, travel_support_provided,
compensation_kind, current_coordinator_id, coordinator_name,
charity_fields, spots_remaining
```
*(served via `v_public_events` view)*

### T1 — Minimal Public Card

```
uuid, display_name
```
Any authenticated user can resolve a UUID to these two fields only.

### T2 — Coordinator Visible Fields (for accepted volunteers)

```
skills, physical_ok, good_eyesight, needs_glasses, can_lift_heavy,
can_work_outdoor, has_leader_experience, new_to_volunteer,
preferred_language, home_area, needs_meal_support, needs_travel_support,
accepts_unpaid, verification_status
```
Access requires: actor is event manager + event is published/active + target has accepted application or active assignment.

### T2 — Event Detail Fields (for accepted volunteers/participants)

```
onboarding_text, onboarding_version, compensation_note,
group_code, is_group_leader
```

### T3 — Never accessible via API (self + admin only)

```
phone_enc (decrypted phone for self-view), emergency_contact_name,
emergency_contact_phone_enc, blood_type, is_willing_to_donate,
is_willing_to_donate_blood, is_willing_to_donate_items
```

**T3 Active-Shift Safety Exception:** The current coordinator of an **active** event may read T3 data for a volunteer who has an `assigned` or `confirmed` assignment on that event (emergency contact access during the event).

### T4 — Admin-Only Fields

```
account_status, blocked_until, is_admin, is_staff, is_superuser,
moderation logs, audit logs, geo attempt telemetry
```

### Fields Never Exposed in Any Response

```
phone_hash, code_hash, token_hash, password
```

---

## 5. User Profile Rules

**Source:** `services/profile_service.py`

### 5.1 Editable Fields (allow-list)

A user may only update these fields on their own profile:

```
display_name, preferred_language, home_area, emergency_contact_name,
emergency_contact_phone, blood_type, is_willing_to_donate,
is_willing_to_donate_blood, is_willing_to_donate_items, physical_ok,
good_eyesight, needs_glasses, can_lift_heavy, can_work_outdoor,
has_leader_experience, new_to_volunteer, skills,
needs_meal_support, needs_travel_support, accepts_unpaid
```

### 5.2 Privileged Fields (never settable via profile update)

```
is_admin, is_staff, is_superuser, is_active, account_status,
blocked_until, phone_hash, phone_enc, password, verification_status,
uuid, id
```

Any request containing these fields raises `DomainError` with HTTP 400.

### 5.3 Emergency Contact Pairing Rule **(PY)**

Emergency contact `name` and `phone` must both be provided or both be empty.
Clearing the name automatically clears the phone. Partial provision raises HTTP 400 with `emergency_contact_mismatch`.

### 5.4 Skills Normalization

Skills are normalized: stripped, lowercased, deduplicated, sorted. Empty strings are removed.

### 5.5 Phone Encryption

Phone numbers are stored encrypted (Fernet symmetric encryption using `PHONE_ENCRYPTION_KEY`). The raw phone is returned only in self-profile view (decrypted on the fly). The `phone_hash` (HMAC-SHA256) is used for all lookups.

### 5.6 Charity Interests

Users can maintain a list of charity interest field codes. Replace is atomic (delete all, re-insert). Only active charity field codes are accepted; unknown or inactive codes raise HTTP 400.

### 5.7 UUID Lookup (W23/W24)

Any authenticated user can look up a **target UUID** and receive:
- T1 card `{uuid, display_name}` by default
- T2 card (full volunteer profile fields) if the caller is an event manager and the target has an accepted application/active assignment on that event

Non-existent or inactive user UUIDs return HTTP 404.

---

## 6. Identity Verification Rules

**Source:** `services/verification_service.py`

### 6.1 Upload Rules

| Rule | Detail | Layer |
|---|---|---|
| Allowed types | `mock_selfie`, `id_license`, `driver_license` | PY |
| Max file size | 5 MB (configurable via `VERIFICATION_MAX_UPLOAD_BYTES`) | PY |
| Empty file | Rejected with HTTP 400 | PY |
| Image format | Must be a valid image (PIL validation); non-images rejected | PY |
| Min dimension | 200 px (both axes); configurable via `VERIFICATION_MIN_DIMENSION` | PY |
| Max dimension | 6000 px (both axes); configurable via `VERIFICATION_MAX_DIMENSION` | PY |
| EXIF stripping | Image is re-encoded as JPEG/RGB with EXIF data removed | PY |
| SHA-256 | Computed and stored for integrity | PY |
| File location | Stored in `VERIFICATION_MEDIA_ROOT` (never in public `MEDIA_ROOT`) | PY |
| Path traversal guard | Resolved path must be within `VERIFICATION_MEDIA_ROOT` | PY |
| Status on insert | Always forced to `pending` **(DB trigger `trg_01_vimg_guard`)** | DB |
| Previous images | Previous `is_current=True` image of same type deactivated by trigger | DB |

### 6.2 Admin Review Rules

| Rule | Layer |
|---|---|
| Only active admins may review | PY + DB |
| Admin cannot review their own image (`ck_verification_no_self_review`) | PY + DB |
| Image must be in `pending` status to be reviewed | PY + DB |
| Valid decisions: `approved`, `rejected` | PY |
| Comparison score must be 0–1 | PY |
| Comparison status choices: `pending`, `match`, `no_match`, `needs_review` | PY |

### 6.3 Verification Status Recomputation

`users.verification_status` is **never computed in Python**. It is recomputed by `recompute_user_verification()` SQL function, called automatically by trigger `trg_50_vimg_after` whenever an image row changes **(DB)**.

### 6.4 Private Image Streaming

Verification images are served only through an admin-gated streaming endpoint. The file path is never returned in API responses. Access requires active admin role.

---

## 7. Coordinator Lifecycle Rules

**Source:** `services/coordinator_service.py`

### 7.1 Coordinator Status Machine

```
pending ──approve──▶ approved ──suspend──▶ suspended
                     approved ──revoke──▶  revoked
                     suspended ──revoke──▶ revoked
```
*(Transitions enforced by DB trigger `trg_01_coordinator_guard`)*

### 7.2 Application Rules

| Rule | Layer |
|---|---|
| User must have `verification_status='verified'` to apply | PY |
| Duplicate application returns `409` if any application already exists (non-pending) | PY |
| If pending application exists, re-applying just updates notes (idempotent) | PY |
| Trigger forces `status='pending'` on insert | DB |
| Notes may be updated while application is in `pending` state only | PY |

### 7.3 Admin Decision Rules

| Rule | Layer |
|---|---|
| Only active admins (`is_admin=True`, `is_active=True`) may approve/suspend/revoke | PY + DB |
| Admin cannot change **their own** coordinator status (`ck_coordinator_no_self_approval`) | PY + DB |
| Approval requires target user to be active + verified (enforced by DB) | DB |
| Transition validity enforced by `trg_01_coordinator_guard` | DB |

---

## 8. Event Lifecycle Rules

**Source:** `services/event_service.py`, `common/permissions.py`

### 8.1 Event Status Machine

```
draft ──publish──▶ published ──activate──▶ active ──complete──▶ completed (terminal)
draft ──cancel──▶  cancelled (terminal)
published ──cancel──▶ cancelled (terminal)
active ──cancel──▶    cancelled (terminal)
```
*(Enforced by both Python `VALID_TRANSITIONS` dict and DB trigger `trg_01_events_before_update`)*

### 8.2 Event Creation Rules

| Rule | Layer |
|---|---|
| Creator must be an approved coordinator | PY |
| Initial `status` is always `draft` (trigger-enforced) | DB |
| Initial `onboarding_version` is always `1` (trigger-enforced) | DB |
| Initial `current_coordinator_id` = `owner_id` (trigger-enforced) | DB |
| Only allow-listed fields accepted (see `EVENT_CREATE_FIELDS`) | PY |
| Charity fields: 1–3 required; must be active codes | PY |
| `end_at > start_at` required | PY (admin path) |
| Owner field is immutable after creation (trigger-enforced) | DB |

### 8.3 Event Update Rules

| Rule | Layer |
|---|---|
| Actor must be event manager with write access | PY |
| Status, owner, coordinator, and onboarding_version cannot be changed via update | PY |
| Only allow-listed fields accepted (see `EVENT_UPDATE_FIELDS`) | PY |
| `onboarding_version` auto-increments when `onboarding_text` changes (trigger) | DB |

### 8.4 Event Visibility Rules

| Event status | Who can view |
|---|---|
| `published`, `active` | Anyone (anonymous or authenticated) |
| `draft`, `completed`, `cancelled` | Event managers (owner, current_coordinator) + admins + active participants (accepted application or active assignment) |
| Deleted (`deleted_at IS NOT NULL`) | Admins only |

### 8.5 Event Manager Definition

An **event manager** is any of:
- Active admin (`is_admin=True`, `is_active=True`)
- Event owner who is also an **approved coordinator**
- Current coordinator who is an **approved coordinator**

This mirrors SQL function `is_event_manager(p_event, p_user)`.

### 8.6 Owner-as-Monitor Rule (C12)

When an owner has handed over coordination (i.e., `owner_id != current_coordinator_id`), the **owner becomes a read-only monitor**:
- Read access: allowed
- Write access (edit, transition, assignment, etc.): **blocked** with `OwnerMonitorReadOnlyError`

The owner can exit this state by calling `retake_event_coordinator()`.

### 8.7 Coordinator Handover Rules

| Rule | Layer |
|---|---|
| Actor must be event manager with write access | PY |
| New coordinator must be an approved coordinator | PY + DB |
| SQL `change_event_coordinator()` updates `current_coordinator_id` and writes to `event_coordinator_history` | DB |
| Handover while in Owner-as-Monitor state is blocked (owner must retake first) | PY |

### 8.8 Owner Retake Rules

| Rule | Layer |
|---|---|
| Only the event **owner** may retake | PY |
| Owner must still be an approved coordinator to retake | PY |
| Already-coordinator is a no-op (idempotent) | PY |
| Calls same `change_event_coordinator()` SQL function | DB |

### 8.9 Admin Event Creation (Super Admin path)

| Rule | Layer |
|---|---|
| Actor must be `is_superuser=True` | PY |
| If `owner_user_id` specified: target must be active + verified + approved coordinator | PY |
| If no owner specified: admin's own account is provisioned as coordinator | PY |
| Charity fields: 1–3 required | PY |
| `end_at > start_at` validated | PY |
| Audit log entry created (`action='admin.event_create'`) | PY |

---

## 9. Application Rules

**Source:** `services/application_service.py`

### 9.1 Application Source Types

| Source | Meaning |
|---|---|
| `browse` | Volunteer found and applied from event listing |
| `qr_walkin` | Walk-in via QR code |
| `invite` | Manager directly invited a volunteer |

### 9.2 Submit Application Rules

| Rule | Layer |
|---|---|
| Event must be visible (published/active) | PY |
| `invite` source requires actor to be event manager | PY |
| Event must be published/active and not deleted | DB trigger |
| Application deadline must not have passed | DB trigger |
| Event must not have ended | DB trigger |
| User account must be active | DB trigger |
| Post must be open (if post specified) | DB trigger |
| No schedule conflict (via `user_has_schedule_conflict()`) | DB trigger |
| No duplicate active application | DB trigger |
| QR token consumed for walk-in source | DB trigger |
| Auto-accept or auto-waitlist based on `acceptance_mode` and capacity | DB trigger |

### 9.3 Coordinator Decision Rules

Valid decisions: `accepted`, `rejected`, `waitlisted`

| Rule | Layer |
|---|---|
| Actor must be event manager with write access | PY |
| Transition validity enforced by `trg_01_applications_before_update` | DB |
| Capacity check on accept | DB trigger |
| Auto-assignment on accept if `auto_assign_enabled=True` | DB trigger `trg_50_applications_after` |

### 9.4 Withdraw Rules

| Rule | Layer |
|---|---|
| Only applicant themselves or event manager can withdraw | PY |
| Only `pending`, `waitlisted`, or `accepted` applications can be withdrawn | PY |
| DB trigger cascades cancellation to any active assignment on withdraw | DB |

### 9.5 T2 Data in Application Listing

For coordinator's application list view: T2 semi-private fields (`skills`, `physical_ok`, `can_lift_heavy`, etc.) are included **only for `accepted` applicants**.

### 9.6 Availability Check

Before applying, volunteers can call `check_user_availability_for_event()` which delegates to SQL functions `is_user_available()` and `user_has_schedule_conflict()`.

### 9.7 Stale Application Expiry

`expire_stale_applications()` calls SQL function to expire `pending`/`waitlisted` applications for ended events. Called by the maintenance scheduler.

---

## 10. Assignment Rules

**Source:** `services/assignment_service.py`

### 10.1 Assignment Status Machine

```
assigned ──confirm──▶ confirmed ──(event ends)──▶ completed
assigned ──cancel──▶  cancelled
confirmed ──cancel──▶ cancelled (blocked if completed)
```

### 10.2 Auto-Assignment

Runs `run_auto_assignment(event_id, actor_id)` SQL function. Actor must be event manager with write access.

The SQL function:
- Iterates accepted-but-unassigned applications
- Calls `create_assignment_from_application()` for each
- Matching/grouping/capacity logic entirely in PostgreSQL

### 10.3 Manual Assignment

| Rule | Layer |
|---|---|
| Actor must be event manager with write access | PY |
| Application must be `accepted` | PY |
| Calls `assign_manually(application_id, post_id, actor_id, group_code, is_group_leader)` SQL | DB |
| Capacity and schedule-overlap checks in SQL | DB |

### 10.4 Confirm Assignment

| Rule | Layer |
|---|---|
| **Only the assigned volunteer themselves** may confirm | PY |
| Assignment must be in `assigned` status | PY |

### 10.5 Cancel Assignment

| Rule | Layer |
|---|---|
| Volunteer can cancel own assignment, or event manager can cancel any on their event | PY |
| `completed` assignments cannot be cancelled | PY |
| Cancellation is idempotent (already-cancelled returns without error) | PY |

---

## 11. QR Token Rules

**Source:** `services/qr_service.py`

### 11.1 Token Creation

| Rule | Layer |
|---|---|
| Actor must be event manager with write access | PY |
| Valid purposes: `walkin_registration`, `checkin`, `join_event` | PY |
| Raw token is generated with `secrets.token_urlsafe(32)` | PY |
| **Only the SHA-256 hash is stored** (raw token returned once, never again) | PY |
| Raw token is **never logged** | PY |
| TTL defaults to 240 minutes | PY |

### 11.2 Preview (Read-Only)

`preview_qr_token()` calls SQL `qr_token_status()`. **Consumes nothing.** Returns validity and reason without side effects.

### 11.3 Redemption Dispatch

| Purpose | Action |
|---|---|
| `checkin` | Calls SQL `qr_check_in(token_hash, user_id)` → creates attendance record |
| `walkin_registration` | Calls SQL `qr_walkin_apply(token_hash, user_id)` → creates walk-in application |
| `join_event` | Calls SQL `consume_qr_token()` + creates `browse` application via ORM |

### 11.4 Purpose Mismatch Guard

`qr_check_in()` explicitly rejects tokens whose purpose is not `checkin`.

### 11.5 Revocation

Idempotent. Already-revoked tokens return without error. Actor must be event manager with write access.

---

## 12. Attendance & Check-In Rules

**Source:** `services/attendance_service.py`, `services/geo_service.py`

### 12.1 Manual Check-In (Coordinator)

| Rule | Layer |
|---|---|
| Actor must be event manager with write access | PY |
| Volunteer must have an attendance record for the event (must already be assigned) | PY |
| Already-checked-in or completed: idempotent (returns existing record) | PY |
| DB trigger `trg_01_attendance_guard` validates event active + active assignment + onboarding | DB |
| Uses `select_for_update()` for concurrency safety | PY |

### 12.2 Check-Out

| Rule | Layer |
|---|---|
| Actor can check out own attendance, or event manager can check out any | PY |
| Only `checked_in` status can transition to checkout | PY |

### 12.3 Geo Check-In Rules

| Rule | Layer |
|---|---|
| **Server-authoritative distance** via Haversine in SQL `geo_check_in()` | DB |
| Client's claimed distance is **never trusted** | PY (passes raw lat/lng, not distance) |
| `is_mocked=True` → `mock_location` result code, check-in rejected | DB |
| All 13 result codes logged in `attendance_geo_attempts` table | DB |
| Does NOT raise on geofence/accuracy failures (telemetry must commit) | PY |

#### Geo Check-In Result Codes

| Code | Meaning |
|---|---|
| `accepted` | ✅ Check-in successful |
| `already_checked_in` | ✅ Already checked in (idempotent) |
| `invalid_fix` | GPS coordinates invalid |
| `low_accuracy` | GPS accuracy insufficient |
| `stale_fix` | Location fix too old |
| `mock_location` | Mock GPS detected, rejected |
| `outside_geofence` | Outside the event area radius |
| `window_closed` | Geo check-in window not open |
| `event_not_active` | Event is not active |
| `geo_disabled` | Geo check-in not enabled for this event |
| `not_assigned` | No active shift for this event |
| `not_eligible` | Walk-in must use QR or coordinator |
| `onboarding_required` | Must acknowledge briefing first |

HTTP 200 for `accepted` and `already_checked_in`; HTTP 400 for all others.

### 12.4 Geo Confirmation/Rejection

Coordinator confirms or rejects pending geo check-in via SQL `confirm_attendance()` / `reject_attendance()`. Actor must be event manager with write access.

### 12.5 Attendance History (Self-View)

Strictly omits: raw coordinates, accuracy, device telemetry **(BR-PRIV-T4)**.  
Returns only: `status`, `method`, `checkin_at`, `checkout_at`, `confirmation_status`, `walk_in_flag`.

---

## 13. Onboarding Acknowledgment Rules

**Source:** `services/onboarding_service.py`

| Rule | Layer |
|---|---|
| User must have an active application (`pending`, `accepted`, or `waitlisted`) to acknowledge | PY + DB trigger |
| Acknowledgment is per event per onboarding version (uniqueness constraint) | DB |
| Idempotent: re-acknowledging the current version returns existing row | PY |
| **Append-only**: existing acknowledgments are never overwritten | PY + DB |
| Trigger enforces event open + version match + self-only + applicant-only | DB (`trg_01_onboarding_before_insert`) |

---

## 14. Feedback Rules

**Source:** `services/feedback_service.py`

### 14.1 Submission Rules

| Rule | Layer |
|---|---|
| Valid directions: `coordinator_to_volunteer`, `volunteer_to_event`, `volunteer_to_coordinator` | PY |
| Score must be 1–5 | PY |
| Event must have `status='completed'` | DB trigger `trg_01_feedback_guard` |
| Rater must have participated in the event | DB trigger |
| Direction and target rules validated | DB trigger |
| Self-rating prohibited | DB trigger |
| Feedback is immutable after submission | DB trigger |
| `volunteer_to_event`: target is forced to `None` | PY |
| `volunteer_to_coordinator`: target defaults to `event.current_coordinator_id` | PY |

### 14.2 Feedback Visibility Rules (Privacy)

| Viewer | What they see |
|---|---|
| Admin | All feedback rows for the event including `rater_user_id` |
| Non-admin | Only their **own** authored feedback rows (filtered to `status='active'`) |
| Anyone viewing feedback about a user | Only aggregate summary (avg, count, distribution) — never individual rows/comments or `from_user_id` |

### 14.3 Feedback Hiding

Feedback can **only** be hidden through moderation (`feedback_hide` action). The service **never** directly sets `feedback.status = 'hidden'`. The moderation trigger `trg_50_moderation_after_insert` applies the hide via `app.privileged_write`.

---

## 15. Moderation Rules

**Source:** `services/moderation_service.py`

### 15.1 Action Types and Privilege Requirements

| Action | Requires | Target |
|---|---|---|
| `user_warning` | Admin | `target_user_id` |
| `user_block` | Admin | `target_user_id` |
| `user_unblock` | Admin | `target_user_id` |
| `account_close` | **Super Admin** | `target_user_id` |
| `account_reinstate` | **Super Admin** | `target_user_id` |
| `event_delete` | **Super Admin** | `event_id` |
| `event_restore` | **Super Admin** | `event_id` |
| `event_cancel` | Admin | `event_id` |
| `feedback_hide` | Admin | `feedback_id` |

### 15.2 Moderation Rules

| Rule | Layer |
|---|---|
| Exactly one target field per action (mutual exclusivity enforced) | PY + DB |
| Target must exist (checked before insert) | PY |
| Reason required for: `user_block`, `account_close`, `event_delete`, `event_cancel`, `feedback_hide` | PY |
| `expires_at` only valid for `user_block` | PY |
| Admin cannot moderate their own account (`ck_moderation_no_self`) | PY + DB |
| Super-admin-only actions return HTTP 404 (not 403) to unprivileged admins | PY |
| DB trigger `trg_50_moderation_after_insert` applies the actual mutation | DB |
| This service **only inserts** into `moderation_actions`; it never directly updates `users`, `events`, or `feedback` | PY |

---

## 16. Admin Portal Rules

**Source:** `admin_portal/views.py`, `services/event_service.py`

### 16.1 Admin API Endpoint Guards

All admin API endpoints use `ensure_admin(request)` which:
1. Returns HTTP 404 (masked) for unauthenticated requests
2. Returns HTTP 404 (masked) for non-admin authenticated requests
3. Logs a `security.red_alert.admin_route_denied` security event on failure

> **Known gap (P0-04):** The HTML portal pages (`dashboard`, `geo_monitoring`, `coordinator_board`) currently render with empty contexts and lack explicit admin guards. This is an open remediation item.

---

## 17. Serializer & Input Validation Rules

**Source:** `common/permissions.py` — `AllowListSerializerMixin`

Applied to all admin portal and BFF serializers:

| Rule | Detail |
|---|---|
| Unknown fields rejected | Any input key not declared on the serializer → `{key: ["Unexpected or forbidden field."]}` |
| Read-only field updates rejected | Any attempt to send a `read_only=True` field → `{key: ["Read-only field cannot be modified."]}` |

### Input Allow-Lists

| Context | Allow-list |
|---|---|
| Event creation | `EVENT_CREATE_FIELDS` (21 fields in `event_service.py`) |
| Event update | `EVENT_UPDATE_FIELDS` (21 fields in `event_service.py`) |
| Profile update | `PROFILE_EDITABLE_FIELDS` (18 fields in `profile_service.py`) |

---

## 18. Data Never Exposed

The following fields are **never** included in any API response under any circumstances:

| Field | Reason |
|---|---|
| `phone_hash` | Internal lookup key; would allow correlation attacks |
| `code_hash` | Hashed OTP code; cryptographically sensitive |
| `token_hash` | Hashed QR token; would allow replay |
| `password` | Nullable; never set for OTP-only users |
| `image_path` | Private file storage path; images served through streaming endpoint only |
| Raw OTP code | Only echoed in `dev_code` when `DEBUG=True` |
| Raw QR token | Returned once at creation; never retrievable again |

---

## 19. API URL Surface

**Source:** `config/urls.py`, `bff/urls.py`

### Root URL patterns (all mounted at `http://127.0.0.1:8000`)

| Prefix | Handler |
|---|---|
| `admin/` | Django admin site |
| `admin-dashboard/` | Admin portal HTML pages |
| `api/schema/` | drf-spectacular raw schema |
| `api/docs/` | Swagger UI |
| `api/v1/` | BFF (canonical) |
| `api/bff/mobile/` | BFF (mobile alias) |
| `api/` | BFF (bare alias) |

### BFF URL Groups (`bff/urls.py`)

| Sub-path | Group |
|---|---|
| `auth/` | OTP request, verify, logout |
| `volunteer/` | Profile, verification, coordinator application, events browsing, applications, assignments, feedback, availability |
| `checkin/` | Geo check-in, QR check-in, manual check-in, attendance |
| `coordinator/` | Event management, coordinator board, application decisions, assignment management |
| `admin/` | Admin portal endpoints (also mounted at `admin-dashboard/`) |

> **Note:** `api/bff/mobile/`, `api/v1/`, and `api/` all serve the same `bff.urls`. All three prefixes are live simultaneously.

---

## 20. Event Lifecycle State Machine

```
                    ┌─────────────────────────────────────┐
                    │          EVENTS                      │
                    │                                      │
                    │  draft ───publish───▶ published      │
                    │    │                     │           │
                    │    │                  activate       │
                    │    │                     │           │
                    │    │                     ▼           │
                    │    │                  active         │
                    │    │                     │           │
                    │    │               complete/cancel   │
                    │    │                  │    │         │
                    │    │                  ▼    ▼         │
                    │  cancel──────────▶ completed cancelled│
                    │    (from any        (terminal)        │
                    │     non-terminal)   (terminal)        │
                    └─────────────────────────────────────┘

COORDINATOR STATUS:  pending ──approve──▶ approved ──suspend──▶ suspended
                                          approved ──revoke──▶  revoked

APPLICATION STATUS:  pending ──accept──▶  accepted ──(trigger)──▶ (assignment created)
                     pending ──waitlist──▶ waitlisted
                     pending ──reject──▶   rejected
                     pending ──withdraw──▶ withdrawn
                     accepted ──withdraw──▶ withdrawn (cascades to cancel assignment)

ASSIGNMENT STATUS:   assigned ──confirm──▶ confirmed
                     assigned ──cancel──▶  cancelled
                     confirmed ──(event complete)──▶ completed

ATTENDANCE STATUS:   scheduled ──(manual/qr)──▶ checked_in
                     checked_in ──checkout──▶ completed
                     checked_in ──(event end)──▶ completed

USER ACCOUNT:        active ──block──▶ blocked ──release──▶ active
                     active ──close──▶ closed   (super admin can reinstate)

VERIFICATION:        none ──upload──▶ pending ──approve──▶ verified
                                      pending ──reject──▶  rejected
```

---

## Appendix A — PostgreSQL Functions Called by Service Layer

| SQL Function | Called From | Purpose |
|---|---|---|
| `request_otp(phone_hash, code_hash, purpose)` | `auth_service.request_login_otp()` | OTP creation + rate-limit enforcement |
| `verify_otp(phone_hash, code_hash, purpose)` | `auth_service.verify_login_otp()` | OTP verification; returns result code |
| `release_expired_blocks()` | Auth on login/token-resolve | Unblock accounts past `blocked_until` |
| `is_approved_coordinator(user_id)` | `coordinator_service`, `event_service` | Check coordinator approval status |
| `is_user_available(user_id, start_at, end_at)` | `application_service` | Availability check pre-apply |
| `user_has_schedule_conflict(user_id, start_at, end_at, event_id)` | `application_service` | Schedule conflict check |
| `expire_stale_applications()` | `application_service` (maintenance) | Expire dead applications |
| `run_auto_assignment(event_id, actor_id)` | `assignment_service` | Auto-assign accepted volunteers |
| `create_assignment_from_application(app_id, actor_id)` | `assignment_service` | Single-application assignment |
| `assign_manually(app_id, post_id, actor_id, group_code, is_leader)` | `assignment_service` | Manual post assignment |
| `change_event_coordinator(event_id, new_coord_id, actor_id, reason)` | `event_service` | Coordinator handover / retake |
| `recompute_user_verification(user_id)` | `verification_service` (admin) | Explicit verification recompute |
| `geo_check_in(event_id, user_id, lat, lng, accuracy, captured_at, is_mocked)` | `geo_service` | Server-side geofence check + attendance |
| `qr_check_in(token_hash, user_id)` | `qr_service` | QR check-in redemption |
| `qr_walkin_apply(token_hash, user_id)` | `qr_service` | QR walk-in registration |
| `qr_token_status(token_hash)` | `qr_service` | Read-only QR validity preview |
| `consume_qr_token(token_id, purpose)` | `qr_service` | Mark token as consumed |
| `confirm_attendance(attendance_id, actor_id, note)` | `attendance_service` | Confirm pending geo check-in |
| `reject_attendance(attendance_id, actor_id, reason)` | `attendance_service` | Reject pending geo check-in |

---

## Appendix B — PostgreSQL Triggers Referenced

| Trigger | Table | Enforces |
|---|---|---|
| `trg_01_otp_rate_limit` | `auth_otp` | Max OTP requests per hour per phone |
| `trg_01_users_guard` | `users` | Account status transitions; privilege field immutability |
| `trg_01_vimg_guard` | `user_verification_images` | Force status=pending, deactivate old current, block self-review |
| `trg_50_vimg_after` | `user_verification_images` | Recompute `users.verification_status` |
| `trg_01_coordinator_guard` | `coordinator_profiles` | Status machine; no-self-approval; verified+active prerequisite |
| `trg_01_events_before_insert` | `events` | Force draft/v1/owner=coordinator on create |
| `trg_01_events_before_update` | `events` | Status machine; publish gates; freeze rules; onboarding version bump |
| `trg_50_events_after_update` | `events` | Completion/cancellation cascades |
| `trg_01_applications_before_insert` | `event_applications` | Deadline, event open, account, post open, no-conflict, auto-accept/waitlist |
| `trg_01_applications_before_update` | `event_applications` | Status transitions; manager permission; capacity on accept |
| `trg_50_applications_after` | `event_applications` | Auto-assign on accept; cascade cancel on withdraw |
| `trg_01_attendance_guard` | `attendance` | Status transitions; event active; assignment active; onboarding |
| `trg_01_onboarding_before_insert` | `onboarding_acknowledgments` | Applicant-only; version match; event open |
| `trg_01_feedback_guard` | `feedback` | Event completed; participation; direction; self-rating ban; immutability |
| `trg_50_moderation_after_insert` | `moderation_actions` | Apply block/close/delete/hide via `app.privileged_write` |
| `EXCLUDE` constraint (btree_gist) | `assignments` | No overlapping schedule/post conflicts |

---

*This document was generated by static inspection of the live codebase on 2026-11-06. It reflects the state of branch `fix/bknd_stablize` at HEAD `3c03f37`. No code was modified during this inspection.*
