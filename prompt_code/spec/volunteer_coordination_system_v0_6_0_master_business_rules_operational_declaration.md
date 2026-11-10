# Volunteer Coordination System (v0.6.0) — Master Business Rules, Formulas & Operational Declaration

**Version:** `v0.6.0` (Declared from Unified Database-First Schema `updated_volunteer_coordination_system_Database_2.sql`)  
**Target Engine:** PostgreSQL 18+ (native `uuidv7()` + `btree_gist`)  
**Database Baseline:** 22 Tables $\cdot$ 114 `CHECK` Constraints $\cdot$ 13 `UNIQUE` Constraints $\cdot$ 20 `UNIQUE` Indexes $\cdot$ 3 `GIN` Indexes $\cdot$ 1 GiST `EXCLUDE` Constraint (`ex_assignments_no_overlap`) $\cdot$ 52 Triggers $\cdot$ 25 Stored Functions $\cdot$ 11 Views $\cdot$ 10-Point Zero-Pollution `self_test()`  
**Total Declared Workflows:** **214 End-to-End Operational Workflows** (Cross-Referenced with `1.1–19.10` and `W01–W168`)  
**Architecture Pattern:** Database-First Rule Engine + Django Service/BFF Policy Layer + React Native Workshift Client

---

## 1. Executive Declaration & Schema Delta (`v0.5.2` $\rightarrow$ `v0.6.0`)

This document is the formal, binding **Business Rules & Operational Declaration (`v0.6.0`)** for the **Volunteer Coordination System**. It locks the contract between the PostgreSQL database engine (`updated_volunteer_coordination_system_Database_2.sql`), the Django Backend/BFF (`backend/apps/`, `backend/services/`, `backend/bff/`, `backend/admin_portal/`), and the React Native Workshift mobile application (`mobile/`).

### 1.1 Key Schema & Architectural Declarations in `updated_volunteer_coordination_system_Database_2.sql`

| Architectural Element | Declared Specification in `v0.6.0` | Operational & SQL Impact |
| :--- | :--- | :--- |
| **1. Time-Ordered Public User UUID (`users.uuid`)** | `uuid UUID NOT NULL DEFAULT uuidv7()` on `users` | Generates a K-sortable, non-enumerable external identity for QR badges and user-code lookups while keeping users.id for internal joins and foreign keys. Declared state: uuid UUID NOT NULL DEFAULT uuidv7() with CONSTRAINT uq_users_uuid UNIQUE (uuid) — both present in the PostgreSQL 18 schema. trg_01_users_guard enforces NEW.uuid IS NOT DISTINCT FROM OLD.uuid (uuid is immutable after generation).⚠️ One schema action still remains: verify trg_01_users_guard actually contains the uuid immutability line. If it doesn't, add IF NEW.uuid IS DISTINCT FROM OLD.uuid THEN RAISE EXCEPTION 'immutable: uuid cannot be changed'; END IF; to the UPDATE branch.* |
| **2. Option A Coordinator Foreign Keys** | `events.owner_id`, `events.current_coordinator_id`, and `event_coordinator_history` reference `coordinator_profiles(user_id) ON DELETE RESTRICT` | Guarantees at the foreign-key level that no user can ever be assigned as an event owner or coordinator without a `coordinator_profiles` record, while triggers additionally enforce `status = 'approved'`. |
| **3. Composite Foreign Key Integrity** | `fk_applications_post_event`, `fk_applications_qr_event`, `fk_assignments_application`, `fk_assignments_post_event`, `fk_attendance_assignment`, `fk_attendance_qr_event` | Makes cross-event data corruption impossible at the database level: an application, assignment, attendance record, post, or QR token can never reference an entity belonging to a different `event_id` or `user_id`. |
| **4. Database-First Authority vs. App BFF Policy** | PostgreSQL enforces all 114 value checks, state machines, capacity locks, cascades, and secret-redacted audit logs; Django BFF enforces Privacy Tiers (`T0`–`T4`), **Owner-as-Monitor read-only mode**, and **HTTP 404 masking** | Django never duplicates SQL trigger logic; it sets transaction-local session context (`app.user_id`, `app.ip`), calls stored workflow functions, and translates PostgreSQL error codes into friendly user messages. |

---

## 2. Ten Declared System Roles

| # | Role Code | Role Title | Declared Authority & Scope |
| :--- | :--- | :--- | :--- |
| 1 | `R01` | **Guest** | Unauthenticated visitor. Can browse `T0` public events (`v_public_events`), post capacities (`v_event_post_capacity`), charity fields, preview QR token status (`qr_token_status`), and request/verify OTPs. |
| 2 | `R02` | **Volunteer (Unverified)** | Authenticated user (`account_status = 'active'`, `verification_status != 'verified'`). Can manage own profile/availability, browse/apply to events, acknowledge onboarding, check in, and submit post-event feedback. Cannot apply to become a coordinator. |
| 3 | `R03` | **Verified Volunteer** | Authenticated active user with `verification_status = 'verified'` (approved `'mock_selfie'` + approved `'id_license'` or `'driver_license'`). Eligible to apply as a Coordinator (`coordinator_profiles`). |
| 4 | `R04` | **Walk-in Volunteer** | On-site registrant who applies via `qr_walkin_apply()` (`source = 'qr_walkin'`, `walk_in_flag = TRUE`). Application always starts as `'pending'` (never auto-accepted) and check-in is restricted to `'qr_scan'` or `'coordinator_manual'` (barred from GPS check-in). |
| 5 | `R05` | **Coordinator Applicant** | Verified user holding `coordinator_profiles.status = 'pending'`. Cannot create or coordinate events until approved by an active Admin. |
| 6 | `R06` | **Approved Coordinator** | Active user holding `coordinator_profiles.status = 'approved'`. Authorized to create new events and receive coordinator handovers. |
| 7 | `R07` | **Event Owner** | Original creator of an event (`events.owner_id`, permanently immutable). Holds full read/write management when `owner_id == current_coordinator_id`. Enters **Owner-as-Monitor (Read-Only + Retake)** mode whenever `owner_id != current_coordinator_id`. |
| 8 | `R08` | **Current Coordinator** | Active operational manager of an event (`events.current_coordinator_id`). Holds full operational write authority over the event, posts, applications, assignments, QR tokens, and attendance confirmations. |
| 9 | `R09` | **Admin / Super Admin** | Governance roles (`users.is_admin = TRUE` for Operational Admin; `users.is_superuser = TRUE` for Super Admin). Enforces platform rules via `moderation_actions`, reviews verification images, and approves coordinators. |
| 10 | `R10` | **System (Triggers & Scheduler)** | Automated database triggers (`trg_01_*`, `trg_50_*`, `trg_90_*`, `trg_95_*`), stored workflow functions, and periodic maintenance jobs (`release_expired_blocks`, `expire_stale_applications`, `purge_expired_otps`, `purge_geo_evidence`). |

---

## 3. Five-Tier Data Privacy & Consent Declaration (`T0`–`T4`)

Every field on `users`, `events`, and operational tables is assigned to a strict visibility tier:

| Tier | Tier Name | Authorized Readers | Declared Fields & Scope |
| :--- | :--- | :--- | :--- |
| **T0** | **Public** | Anyone (No Auth Required) | `v_public_events` and `v_event_post_capacity` for events where `status IN ('published', 'active') AND deleted_at IS NULL`: `event_id`, `title`, `description`, `purpose_type`, `location_name`, `landmark_text`, `latitude`, `longitude`, `geo_radius_m`, `geo_checkin_enabled`, `map_provider`, `start_at`, `end_at`, `application_deadline`, `status`, `acceptance_mode`, `max_participants`, `meals_provided`, `lodging_provided`, `travel_support_provided`, `compensation_kind`, `current_coordinator_id`, `coordinator_name`, `charity_fields`, `spots_remaining`, and active `charity_fields` lookup rows. |
| **T1** | **Minimal Identity & Self** | • The User themselves (full self-profile)<br>• Any authenticated user looking up `users.uuid` (**Minimal Public Card only**) | **Minimal Public Card (UUID Lookup):** `users.uuid`, `users.display_name` ONLY.<br>**Self-Only Operational Records:** Own `event_applications`, own `assignments`, own `attendance`, own `onboarding_acknowledgments`, own `volunteer_availability_rules` & `exceptions`, own submitted `feedback`, own `user_charity_interests`. |
| **T2** | **Event-Scoped Semi-Private** | • The User themselves<br>• Event's `current_coordinator_id` and `owner_id` (**only** while the user holds an `'accepted'` application or non-cancelled `assignment` on that open event)<br>• Co-Volunteers assigned to the same event (**Roster Peer Subset only**) | **Coordinator Event-Scoped Volunteer Profile:** `skills`, `physical_ok`, `good_eyesight`, `needs_glasses`, `can_lift_heavy`, `can_work_outdoor`, `has_leader_experience`, `new_to_volunteer`, `preferred_language`, `home_area`, `needs_meal_support`, `needs_travel_support`, `accepts_unpaid`, `verification_status`.<br>**Accepted Volunteer Event Details:** `onboarding_text`, `onboarding_version`, `compensation_note`, assigned `group_code`, `is_group_leader`, live attendance state.<br>**Roster Peer Subset:** `display_name`, `group_code`, `is_group_leader`, post `title`. |
| **T3** | **Strictly Private Personal Data** | • The User themselves<br>• Active Admins / Super Admins<br>• *(Active-Shift Safety Exception)*: Decrypted phone & emergency contact shown to `current_coordinator_id` **only** while `event.status == 'active'` for `'assigned'`/`'confirmed'`/`'checked_in'` volunteers | Decrypted `phone_enc`, `emergency_contact_name`, decrypted `emergency_contact_phone_enc`, `blood_type`, `is_willing_to_donate`, `is_willing_to_donate_blood`, `is_willing_to_donate_items`, `user_verification_images` (served only via private admin stream). **Hard Rule:** `phone_hash`, `code_hash`, `token_hash`, and `password` are **never** serialized in any API response. |
| **T4** | **Admin & Governance Restricted** | • Active Admins (`is_admin = TRUE`)<br>• Super Admins (`is_superuser = TRUE`) for admin-account details and destructive actions | `moderation_actions`, `audit_logs`, `attendance_geo_attempts` (`v_geo_attempts_review`), `v_admin_dashboard`, `v_user_moderation_summary`, `account_status`, `blocked_until`, `is_admin`, `is_staff`, `is_superuser`, `app_settings`. |

### 3.1 Declared Formula for Event-Scoped `T2` Consent

$$\text{CanCoordinatorReadT2}(\text{Actor}, \text{Volunteer}, \text{Event}) = \text{is\_event\_manager}(\text{Event.id}, \text{Actor.id}) \;\text{AND}\; \Big(\exists \text{ App } (\text{status} = \text{'accepted'}) \;\lor\; \exists \text{ Assignment } (\text{status} \ne \text{'cancelled'})\Big) \;\text{AND}\; (\text{Event.status} \in \{\text{'published'}, \text{'active'}\})$$

---

## 4. Declared Permission Matrices

### 4.1 Admin Permission Matrix (`A01`–`A12`)

| Code | Declared Capability | Prototype: Super Admin (`is_superuser`) | Prototype: Admin (`is_admin`) | Future: Monitorer | Future: Request Accepter |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **A01** | View summary dashboards (`v_admin_dashboard`, `v_event_summary`) | Allowed | Allowed | Allowed | Allowed |
| **A02** | View user dashboards **+ admin account details** | Allowed | Denied (`404`) | Denied | Denied |
| **A03** | View user summary dashboards only | Allowed | Allowed | Allowed | Allowed |
| **A04** | View volunteer/coordinator detail & `v_user_moderation_summary` | Allowed | Allowed | Allowed | Denied |
| **A05** | View volunteer, coordinator **+ admin** in-depth detail & `audit_logs` | Allowed | Denied (`404`) | Denied | Denied |
| **A06** | Review verification images & approve/suspend/revoke coordinators | Allowed | Allowed | Denied | Allowed |
| **A07** | Cancel an open event (`moderation_actions.action_type = 'event_cancel'`) | Allowed | Allowed | Denied | Denied |
| **A08** | Soft-delete or restore an event (`event_delete` / `event_restore`) | Allowed | Denied (`404`) | Denied | Denied |
| **A09** | Warn, block, or unblock a non-admin user (`user_warning`, `user_block`, `user_unblock`) | Allowed | Allowed | Denied | Denied |
| **A10** | Close or reinstate a user account (`account_close`, `account_reinstate`) | Allowed | Denied (`404`) | Denied | Denied |
| **A11** | Revoke admin flags or close an admin account | Allowed | Denied (`404`) | Denied | Denied |
| **A12** | Modify `app_settings` & full platform governance | Allowed | Denied (`404`) | Denied | Denied |

### 4.2 Coordinator Permission Matrix (`C01`–`C16`)

| Code | Declared Capability | Owner (`owner == current`) | Current Coordinator (`current != owner`) | Owner-as-Monitor (`owner != current`) | Former Coordinator |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **C01** | Create new event (starts as `'draft'`) | Allowed | N/A | N/A | Allowed (New Event) |
| **C02** | Edit event details & `onboarding_text` | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C03** | Publish, activate, complete, or cancel event | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C04** | Create, edit, or close event posts (`event_posts`) | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C05** | View event applications & `v_accepted_unassigned` | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |
| **C06** | Accept, reject, or waitlist applications | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C07** | Read `T2` semi-private profile of accepted volunteers | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |
| **C08** | Run `run_auto_assignment()` or `assign_manually()` | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C09** | Generate or revoke event QR tokens (`qr_tokens`) | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C10** | Manual check-in/out/absent or confirm/reject geo check-in | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C11** | Hand over coordination (`change_event_coordinator`) | Allowed | Allowed | **Blocked (Must Retake First)** | Denied (`404`) |
| **C12** | **Retake coordination authority** (`current_coordinator_id := owner_id`) | N/A | Denied | **Allowed** | Denied (`404`) |
| **C13–C14** | Delegate / revoke volunteer team-lead authority | *Deferred* | *Deferred* | Denied | Denied |
| **C15** | View Shift Console (`v_event_summary`, `v_event_checkin_board`, `v_pending_confirmations`) | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |
| **C16** | View coordinator handover history (`v_event_coordinator_history`) | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |

---

## 5. Exhaustive Step-by-Step Operational Workflows & Plain-Language Formulas (All 20 Domains / 214 Workflows)

---

### Domain 1: Authentication, OTP & Session Context (Workflows `1.1`–`1.10` / `W01`–`W12`)

#### 1A. Declared Formulas
1. **Phone Normalization, Keyed HMAC & Fernet Encryption:**
   $$\text{NormalizedPhone} = \text{E164\_Normalize}(\text{InputPhone})$$
   $$\text{phone\_hash} = \text{HMAC\_SHA256}(\text{PHONE\_HASH\_HMAC\_SECRET}, \text{NormalizedPhone}) \quad (\text{64 hex chars, satisfies } \text{ck\_users\_phone\_hash\_len}: 32 \le \text{len} \le 128)$$
   $$\text{phone\_enc} = \text{FernetEncrypt}(\text{PHONE\_ENCRYPTION\_KEY}, \text{NormalizedPhone})$$

2. **OTP Hourly Rate-Limit Formula (`trg_01_otp_rate_limit`):**
   $$\text{RequestsLastHour}(P) = \text{Count}\Big(\text{auth\_otp rows where } \text{phone\_hash} = P \;\text{AND}\; \text{created\_at} > \text{now}() - \text{INTERVAL '1 hour'}\Big)$$
   $$\text{CanRequestOTP}(P) = \Big(\text{RequestsLastHour}(P) < \text{setting\_int}(\text{'otp\_max\_requests\_per\_hour'})\Big) \quad (\text{Default} = 5)$$

3. **OTP Verification Decision Formula (`verify_otp(p_phone_hash, p_code_hash, p_purpose)`):**
   Locking the latest unconsumed row $V$ (`consumed_at IS NULL`) `FOR UPDATE`:
   $$\text{verify\_otp} = \begin{cases} \text{'no\_otp'} & \text{if no unconsumed row } V \text{ exists} \\ \text{'expired'} & \text{if } V.\text{expires\_at} \le \text{now}() \\ \text{'too\_many\_attempts'} & \text{if } V.\text{attempt\_count} \ge \text{setting\_int}(\text{'otp\_max\_attempts'}) \; (5) \\ \text{'ok'} \; (\text{sets } V.\text{consumed\_at} = \text{now}()) & \text{if } V.\text{code\_hash} == p\_code\_hash \\ \text{'invalid\_code'} \; (\text{sets } V.\text{attempt\_count} = V.\text{attempt\_count} + 1) & \text{if } V.\text{code\_hash} \ne p\_code\_hash \end{cases}$$

4. **Per-Request Database Session Context Formula (`common/db_context.py`):**
   $$\text{ClientIP} = \text{FirstValidIP}(\text{X-Forwarded-For}, \text{REMOTE\_ADDR})$$
   $$\text{Inside Request Transaction} : \quad \text{SELECT set\_config}(\text{'app.user\_id'}, \text{str}(\text{User.id}), \text{true}); \quad \text{SELECT set\_config}(\text{'app.ip'}, \text{ClientIP}, \text{true});$$

#### 1B. Step-by-Step Operational Workflows
* **`1.1` / `W01` (OTP Request) & `1.6` / `W10` (OTP Rate Limit Exceeded):**
  1. Guest submits `POST /api/v1/auth/otp/request/` with `{phone, purpose}` (`purpose` $\in \{\text{'login'}, \text{'qr\_registration'}\}$).
  2. Service normalizes `phone` $\rightarrow$ `phone_hash` and checks if a `Users` row exists:
     * If `account_status == 'closed'` (**`1.9` / `W09`**): reject with HTTP `403` (`"This account has been closed."`).
     * If `account_status == 'blocked'` and `blocked_until <= now()` (**`1.8` / `W12`**): execute `SELECT release_expired_blocks()` to restore the user to `'active'`.
     * If still `account_status == 'blocked'` (**`1.8` / `W08`**): reject with HTTP `403` (`"This account is currently blocked."`).
  3. Service generates a 4-digit OTP code (using `DEV_FIXED_OTP` **only** when `settings.DEBUG is True`), hashes it to `code_hash`, and executes `SELECT request_otp(%s, %s, %s)`.
  4. Trigger `trg_01_otp_rate_limit` checks `RequestsLastHour(phone_hash) < 5`. If $\ge 5$, raises `otp_rate_limited` $\rightarrow$ HTTP `429`. Otherwise inserts row with `expires_at = now() + 5 mins` and returns `{"status": "sent"}` (plus `dev_code` only if `settings.DEBUG`).
* **`1.2`–`1.5`, `1.8`–`1.9` / `W02`–`W06`, `W08`–`W09` (OTP Verification — All 5 Branches):**
  1. Guest submits `POST /api/v1/auth/otp/verify/` with `{phone, code, purpose}`.
  2. Service hashes inputs and calls `SELECT verify_otp(%s, %s, %s)`.
  3. Because `verify_otp()` returns result codes instead of raising exceptions, any `attempt_count + 1` update on `'invalid_code'` (`1.3` / `W03`) is committed before returning HTTP `400`.
  4. Branches `'no_otp'` (`1.5` / `W06`), `'expired'` (`1.4` / `W04`), and `'too_many_attempts'` (`W05`) return HTTP `400`/`429` with friendly messages.
  5. On `'ok'` (`1.2` / `W02`), service gets or creates the `Users` row (PostgreSQL automatically assigns `uuid DEFAULT uuidv7()`, `is_active = TRUE`, `account_status = 'active'`), verifies the user is not blocked/closed, issues a DRF `Token`, and returns `{"token": key, "user": T1Profile}`.
* **`1.7` / `W07` (User Logout):** Authenticated user calls `POST /api/v1/auth/logout/`; service deletes caller's DRF token row.
* **`1.10` & `W11` (Session Context & Mid-Session Block Rejection):** On every authenticated request, `BlockedAwareTokenAuthentication` runs `release_expired_blocks()` if needed, rejects inactive/blocked users with HTTP `401`/`403` (`W11`), and sets `app.user_id` and `app.ip` via `set_config(..., true)`.

---

### Domain 2: User Profile, Public UUID (`uuidv7`) & Capability Profiling (Workflows `2.1`–`2.4`, `W13`–`W17`, `W23`–`W26`)

#### 2A. Declared Formulas
1. **Tag Array Normalization Formula (`tags_are_normalized(tags)`):**
   $$\text{NormalizeTags}(L) = \text{UniquePreservingOrder}\Big(\big[\text{lower}(\text{btrim}(x)) \;\big|\; x \in L \text{ where } \text{btrim}(x) \ne \text{''}\big]\Big)$$
   $$\text{tags\_are\_normalized}(T) = (\text{cardinality}(T) \le 30) \;\text{AND}\; \forall t \in T : \big(t \ne \text{''} \;\land\; t == \text{lower}(\text{btrim}(t)) \;\land\; \text{char\_length}(t) \le 50\big)$$

2. **Donation & Emergency Contact Pairing Formulas (`ck_users_donation_consistency`, `ck_users_emergency_pair`):**
   $$\text{ValidDonation} = \text{is\_willing\_to\_donate} \;\lor\; (\neg\text{is\_willing\_to\_donate\_blood} \land \neg\text{is\_willing\_to\_donate\_items})$$
   $$\text{ValidEmergencyContact} = (\text{emergency\_contact\_name IS NULL}) == (\text{emergency\_contact\_phone\_enc IS NULL})$$

#### 2B. Step-by-Step Operational Workflows
* **`2.1` / `W13` & `W23` (View Own Profile & Public UUID):** `GET /api/v1/me/` returns the user's self profile including `uuid` (generated via `uuidv7()`), decrypted phone/emergency phone (for self view only), capability flags, normalized `skills`, `verification_status`, and `charity_interests`. Never exposes `phone_hash`, `phone_enc`, or `password`.
* **`2.2`–`2.3`, `W14`–`W16`, `W25`–`W26` (Update Profile with Strict Allow-List):**
  1. `PATCH /api/v1/me/` validates payload against `PROFILE_EDITABLE_FIELDS`.
  2. Any privileged or immutable key (`is_admin`, `is_staff`, `is_superuser`, `is_active`, `account_status`, `blocked_until`, `phone_hash`, `phone_enc`, `password`, `verification_status`, `uuid`) is rejected with HTTP `400` (`2.3` / `W15`), backed up by `trg_01_users_guard`.
  3. Normalizes `skills` (`W25`), validates `blood_type` choices and BCP-47 `preferred_language` (`W16`), enforces donation consistency and emergency contact pairing (`W26`), encrypts `emergency_contact_phone_enc`, and saves.
* **`2.4` / `W17` (Set Charity Interests):** `PUT /api/v1/me/charity-interests/` atomically replaces the user's rows in `user_charity_interests` using active codes from `charity_fields`.
* **`W24` (Public UUID Lookup / Coordinator Scan):** `GET /api/v1/users/by-uuid/{uuid}/` returns `404` if not found, `T2` profile + shift state if `?event_id=` is passed by that event's manager for an accepted volunteer, or the `T1` Minimal Public Card (`{uuid, display_name}`) otherwise.

---

### Domain 3: Volunteer Availability Rules & Exceptions (Workflows `2.5`–`2.9` / `W18`–`W22`, `W150`–`W151`)

#### 3A. Declared Formula (`is_user_available(p_user, p_start, p_end)`)
Let $D = p\_start\text{::DATE}$, $W = \text{ISODOW}(p\_start) \in 1..7$, $S = p\_start\text{::TIME}$, $E = p\_end\text{::TIME}$:
$$\text{is\_user\_available} = \begin{cases} \text{FALSE} & \text{if Exception } X \text{ on } D \text{ has } \neg X.\text{is\_available} \land X.\text{start\_time IS NULL} \\ \neg(S < X.\text{end\_time} \land E > X.\text{start\_time}) & \text{if Exception } X \text{ on } D \text{ has } \neg X.\text{is\_available} \land X.\text{start\_time IS NOT NULL} \\ \text{TRUE} & \text{if Exception } X \text{ on } D \text{ has } X.\text{is\_available} \land X.\text{start\_time IS NULL} \\ (S \ge X.\text{start\_time} \land E \le X.\text{end\_time}) & \text{if Exception } X \text{ on } D \text{ has } X.\text{is\_available} \land X.\text{start\_time IS NOT NULL} \\ \text{TRUE} & \text{if no Exception on } D \land \text{User has } 0 \text{ rows in } \text{volunteer\_availability\_rules} \\ \exists \text{ Rule } R \text{ on weekday } W \text{ valid on } D \text{ with } S \ge R.\text{start\_time} \land E \le R.\text{end\_time} & \text{otherwise} \end{cases}$$

#### 3B. Step-by-Step Operational Workflows
* **`2.5` / `W18`:** `GET /api/v1/me/availability/` lists all recurring weekly rules and date exceptions.
* **`2.6` / `W19`:** `POST /api/v1/me/availability/rules/` atomically replaces weekly rules (`ck_availability_weekday`, `ck_availability_time_order`, `ck_availability_valid_range`, `uq_availability_rule`).
* **`2.7`–`2.8` / `W20`–`W21`:** `POST` and `DELETE /api/v1/me/availability/exceptions/` manage one-off date overrides (`uq_availability_exception`, `ck_availability_exception_times`).
* **`2.9` / `W22`, `W150`–`W151`:** `GET /api/v1/events/{id}/check-availability/` calls `SELECT is_user_available(user_id, event.start_at, event.end_at)`.

---

### Domain 4: Identity Verification Images & Trust Hierarchy (Workflows `3.1`–`3.9` / `W27`–`W33`)

#### 4A. Declared Formula (`recompute_user_verification(p_user)` via `trg_50_vimg_after`)
Evaluating current images (`is_current = TRUE`) for `p_user`:
$$\text{users.verification\_status} = \begin{cases} \text{'none'} & \text{if no current image exists} \\ \text{'rejected'} & \text{if } \exists \text{ current image with } \text{status} = \text{'rejected'} \\ \text{'verified'} & \text{if } (\exists \text{ approved } \text{'mock\_selfie'}) \;\land\; (\exists \text{ approved } \text{'id\_license'} \text{ or } \text{'driver\_license'}) \\ \text{'pending'} & \text{otherwise} \end{cases}$$

#### 4B. Step-by-Step Operational Workflows
* **`3.1`–`3.3`, `W27`–`W29`, `W33` (Upload Verification Image — Selfie / ID / Driver License):**
  1. User uploads image to `POST /api/v1/me/verification-images/`.
  2. Service strips EXIF, converts to RGB JPEG, computes 64-char hex `file_sha256` (`ck_verification_sha256`), writes to private `VERIFICATION_MEDIA_ROOT`, and inserts into `user_verification_images`.
  3. Trigger `trg_01_vimg_guard` forces `status = 'pending'`, deactivates any prior `is_current = TRUE` image of the same `image_type` (`uq_current_verification_image`), and `trg_50_vimg_after` recomputes `users.verification_status`.
* **`3.4`–`3.9` / `W30`–`W32` (Admin Review & Immutability Guards):**
  1. Admin calls `POST /api/v1/admin/verification-images/{id}/review/` with `status` $\in \{\text{'approved'}, \text{'rejected'}\}$.
  2. Guards enforce: image metadata is immutable (`3.9`), only `'pending'` images can be reviewed (`3.8`), reviewer must be an active admin (`trg_01_vimg_guard`), and admin cannot review their own image (`3.7` / `ck_verification_no_self_review`).
  3. `trg_50_vimg_after` automatically updates `users.verification_status` (`3.6` / `W32`).

---

### Domain 5: Coordinator Lifecycle & Approval (Workflows `4.1`–`4.8` / `W34`–`W40`)

#### 5A. State Machine & Formula
$$\text{pending} \longrightarrow \text{approved} \;\big|\; \text{revoked}, \qquad \text{approved} \longleftrightarrow \text{suspended}, \qquad \text{approved}/\text{suspended} \longrightarrow \text{revoked} \; (\text{Terminal})$$
$$\text{is\_approved\_coordinator}(U) = \exists \text{ Profile } CP \text{ where } CP.\text{user\_id} = U \;\land\; CP.\text{status} = \text{'approved'} \;\land\; \text{Users}(U).\text{is\_active} = \text{TRUE}$$

#### 5B. Step-by-Step Operational Workflows
* **`4.1`–`4.2` / `W34`:** Verified user applies via `POST /api/v1/me/coordinator/`; creates `coordinator_profiles` with `status = 'pending'` (unverified users are rejected with `not_verified`).
* **`4.3`–`4.8` / `W35`–`W40`:** Admin approves (`W35`), suspends (`W36`), reactivates (`W38`), or revokes (`W37`) a coordinator profile. `trg_01_coordinator_guard` and `ck_coordinator_no_self_approval` block self-approval (`4.7` / `W39`), unverified approval (`4.8` / `W40`), and illegal status jumps (`4.8`).

---

### Domain 6: Event Lifecycle, Handover, Owner-as-Monitor & Retake (Workflows `5.1`–`5.16` / `W41`–`W58`)

#### 6A. State Machine & Authority Formulas
$$\text{draft} \longrightarrow \text{published} \;\big|\; \text{cancelled}, \qquad \text{published} \longrightarrow \text{active} \;\big|\; \text{cancelled}, \qquad \text{active} \longrightarrow \text{completed} \;\big|\; \text{cancelled}$$
$$\text{BFF Write Authority}(\text{Actor}, \text{Event}) = \text{is\_admin\_user}(\text{Actor.id}) \;\lor\; \big(\text{Actor.id} == \text{Event.current\_coordinator\_id} \;\land\; \text{is\_approved\_coordinator}(\text{Actor.id})\big)$$
$$\text{BFF Owner-as-Monitor State}(\text{Actor}, \text{Event}) = (\text{Actor.id} == \text{Event.owner\_id}) \;\land\; (\text{Event.owner\_id} \ne \text{Event.current\_coordinator\_id}) \implies \text{Read-Only + Retake Only}$$

#### 6B. Step-by-Step Operational Workflows
* **`5.1` / `W41` (Create Event):** Approved coordinator creates event; `trg_01_events_before_insert` forces `status = 'draft'`, `onboarding_version = 1`, `current_coordinator_id = owner_id`, and `trg_50_events_after_insert` logs `'initial coordinator'` in `event_coordinator_history`.
* **`5.2`, `5.7`, `5.9` / `W42`, `W54`, `W55` (Edit Event):** Current Coordinator edits event details. `owner_id` is immutable (`5.9` / `W54`); completed/cancelled events are frozen (`5.7` / `W55`); editing `onboarding_text` auto-increments `onboarding_version` (`12.4` / `W124`).
* **`5.3` / `W43`, `W57`, `W58` (Publish Event):** Transitions `'draft' -> 'published'`. Requires $\ge 1$ non-closed post (`publish_requires_post`) and `start_at > now()` (`publish_requires_future_start`). Sets `published_at = now()`.
* **`5.4` / `W44` (Activate Event):** Transitions `'published' -> 'active'`; sets `activated_at = now()`.
* **`5.5` / `W45` (Complete Event Cascade):** Transitions `'active' -> 'completed'`; sets `completed_at = now()`. `trg_50_events_after_update` cascades: `'expected'` attendance $\rightarrow$ `'absent'`, `'checked_in'` attendance $\rightarrow$ `'completed'`, active assignments $\rightarrow$ `'completed'`, `'pending'`/`'waitlisted'` applications $\rightarrow$ `'expired'`, active QR tokens $\rightarrow$ `revoked_at = now()`.
* **`5.6` / `W46` (Cancel Event Cascade):** Transitions `'draft'`/`'published'`/`'active' -> 'cancelled'`; sets `cancelled_at = now()`, cancels active assignments, expires pending/waitlisted applications, and revokes QR tokens.
* **`5.10`–`5.13` / `W50`–`W53` (Coordinator Handover & Owner Retake):** Calls `SELECT change_event_coordinator(event_id, new_coordinator_id, actor_id, reason)`. Verifies target is an approved coordinator (`5.12`), event is not frozen (`5.13`), updates `current_coordinator_id`, and appends to `event_coordinator_history`. While delegated, Owner is in **Owner-as-Monitor** read-only mode until calling Retake (`change_event_coordinator` with `new_coordinator_id = owner_id`, `W51`).
* **`5.14`–`5.16` / `W47`–`W48` (Admin Soft Delete & Restore):** Executed via `moderation_actions` (`event_delete` / `event_restore`). Deleted events cannot change status (`5.16`).

---

### Domain 7: Event Posts / Role Definitions (Workflows `6.1`–`6.7` / `W59`–`W63`)

* **`6.1`–`6.7` / `W59`–`W63`:** Current Coordinator creates (`6.1`), updates (`6.2`), or closes (`6.3`) posts on an open event (`6.7`). `event_id` is immutable (`6.6`), `required_headcount` cannot drop below active assignments (`6.5` / `capacity_conflict`), and `status` automatically toggles between `'open'` and `'full'` whenever assignments change (`6.4` / `W62`).

---

### Domain 8: Recruitment & Applications (Workflows `7.1`–`7.24` / `W64`–`W79`)

#### 8A. Declared Remaining Capacity Formula (`application_remaining_capacity(p_event, p_post)`)
$$\text{EventRem} = \text{Event.max\_participants} - \text{Count}(\text{accepted applications on Event}) \quad (\text{or } \infty \text{ if NULL})$$
$$\text{PostRem} = \text{Post.required\_headcount} - \text{Count}(\text{active assignments on Post}) - \text{Count}(\text{accepted unassigned apps on Post}) \quad (\text{or } \infty \text{ if NULL})$$
$$\text{application\_remaining\_capacity} = \max\big(0, \;\min(\text{EventRem}, \text{PostRem})\big) \quad (\text{or NULL if both } \infty)$$

#### 8B. Step-by-Step Operational Workflows
* **`7.4`–`7.8`, `7.13`–`7.24` / `W64`–`W68`, `W74`–`W78` (Apply via `browse`, `qr_walkin`, or `invite`):**
  * `trg_01_applications_before_insert` locks `events` (`FOR UPDATE`), verifies event is open and not ended, deadline not passed (`7.14`), user is `'active'` (`7.16`), post belongs to event and is open (`fk_applications_post_event`, `7.20`), no overlapping shift (`user_has_schedule_conflict`, `7.15`), and no duplicate active application (`uq_event_application_active`, `7.13`).
  * Snapshots recruiting conditions (`7.24`). Walk-ins consume 1 `'walkin_registration'` QR use and stay `'pending'` (`7.5`). Non-walk-ins in `'auto'` mode are auto-accepted if `application_remaining_capacity() > 0` (`7.7` / `W67`, triggering `create_assignment_from_application` if `auto_assign_enabled`) or `'waitlisted'` (`7.8` / `W68`).
* **`7.9`–`7.12` / `W69`–`W73`, `W79` (Accept, Reject, Waitlist, Withdraw, Expire):**
  * Coordinator accepts (`7.9`), rejects (`7.10`), or waitlists (`7.11`). Volunteer withdraws (`7.11` / `W72`), which cascades to cancel any active assignment (`W79`).

---

### Domain 9: Smart Assignment & Team Grouping Engine (Workflows `8.1`–`8.15` / `W80`–`W93`)

* **`8.1`–`8.2`, `8.9`–`8.10` / `W80`–`W81` (`create_assignment_from_application` & `run_auto_assignment`):**
  * Matches accepted unassigned applicants to open posts by `priority ASC, id ASC` where skills overlap (`required_skills && user.skills`), physical capability matches (`medium` $\implies$ `physical_ok`; `heavy` $\implies$ `can_lift_heavy`), experience matches (`new_volunteers_allowed OR NOT new_to_volunteer`), and headcount is available.
  * Chunks volunteers into groups `'G1'`, `'G2'`, $\dots$ of size `group_size` (`8.9`) and assigns `is_group_leader = TRUE` to the first experienced member when required (`8.10`, `uq_assignment_group_leader`).
  * Automatically creates an `'expected'` `attendance` row (`9.1` / `W94`).
* **`8.3`–`8.8`, `8.11`–`8.15` / `W82`–`W93` (`assign_manually`, Move, Confirm, Cancel, GiST Overlap Guard):**
  * Coordinator places or moves volunteers via `assign_manually()` (`8.3`–`8.4`). Volunteer confirms own shift (`8.5` / `W85`). Volunteer or Coordinator cancels non-completed shift (`8.6`–`8.7`). `ex_assignments_no_overlap` prevents overlapping shifts across all events (`8.12` / `W90`).

---

### Domain 10: Pre-Work Digital Onboarding (Workflows `12.1`–`12.7` / `W122`–`W125`)

* **`12.1`–`12.7` / `W122`–`W125`:** Applicant reads `onboarding_text` and inserts an append-only `app_tick` row in `onboarding_acknowledgments` matching the event's current `onboarding_version`. Editing `onboarding_text` increments `onboarding_version`, requiring re-acknowledgment before check-in.

---

### Domain 11: QR Token Management (Workflows `11.1`–`11.11` / `W142`–`W149`)

* **`11.1`–`11.11` / `W142`–`W149`:** Coordinator generates `'checkin'`, `'walkin_registration'`, or `'join_event'` tokens (storing only `token_hash`). `qr_token_status(p_token_hash)` previews validity without consuming a use; `consume_qr_token()` atomically increments `used_count` only when `qr_check_in()` or `qr_walkin_apply()` succeeds.

---

### Domain 12: Attendance & Non-Geo Check-In / Roll-Call (Workflows `9.1`–`9.16` / `W94`–`W95`, `W110`–`W112`, `W116`–`W121`)

* **`9.2`–`9.5` / `W95`, `W121` (Volunteer QR Scan Check-In):** Calls `SELECT qr_check_in(token_hash, user_id)`. Idempotent on repeat scans; verifies active event, active assignment, and current onboarding acknowledgment.
* **`9.6`–`9.15` / `W110`–`W112` (Coordinator Manual Check-In, Check-Out & Mark Absent):** Current Coordinator checks in volunteers in person (`method = 'coordinator_manual'`, `recorded_by_user_id = actor.id`), records `checkout_at`, or marks `'expected'` volunteers `'absent'`.

---

### Domain 13: GPS Geolocation Check-In & Confirmation Queue (Workflows `10.1`–`10.17` / `W96`–`W109`, `W113`–`W115`, `W119`)

* **`10.1`–`10.12` / `W96`–`W109` (`geo_check_in` 13-Result Pipeline):** Pre-scheduled volunteer submits GPS coordinates. `geo_check_in()` evaluates all 13 conditions in order (`event_not_active`, `geo_disabled`, `not_assigned`, `not_eligible` for walk-ins, `already_checked_in`, `window_closed`, `onboarding_required`, `invalid_fix`, `mock_location`, `low_accuracy` $> 100\text{ m}$, `stale_fix` $> 60\text{ s}$, `outside_geofence` via server Haversine `geo_distance_m()`, or `accepted`), logging every attempt in `attendance_geo_attempts`.
* **`10.13`–`10.17` / `W113`–`W115`, `W119` (`confirm_attendance` & `reject_attendance`):** Coordinator confirms or rejects pending geo check-ins from `v_pending_confirmations`. Rejecting requires a reason, resets `attendance.status` to `'expected'`, and clears check-in fields on `attendance` so the volunteer can retry.

---

### Domain 14: Two-Way Verifiable Feedback (Workflows `13.1`–`13.10` / `W126`–`W131`)

* **`13.1`–`13.10` / `W126`–`W131`:** After `event.status == 'completed'`, attended volunteers (`attendance.status == 'completed'`) rate the event (`volunteer_to_event`) or coordinator (`volunteer_to_coordinator`), and the owner/coordinator rates assigned volunteers (`coordinator_to_volunteer`) with a $1..5$ score and normalized tags. Immutable once submitted; can only be hidden via admin moderation (`feedback_hide`).

---

### Domain 15: Admin Watchman Moderation & Governance (Workflows `14.1`–`14.14` / `W47`–`W49`, `W129`, `W132`–`W141`)

* **`14.1`–`14.14` / `W132`–`W141` (Insert-to-Apply Moderation):** Admin inserts into `moderation_actions` (`user_warning`, `user_block`, `user_unblock`, `account_close`, `account_reinstate`, `event_delete`, `event_restore`, `event_cancel`, `feedback_hide`). Trigger `trg_50_moderation_after_insert` automatically applies the state change and syncs `users.is_active`. Blocks self-moderation and blocking/closing other admins.

---

### Domains 16–20: Maintenance, Audit, Dashboards, Error Masking & Security Guards (`15.1`–`19.10` / `W152`–`W168`)

* **Domain 16 (Maintenance — `W162`–`W165`):** `release_expired_blocks()`, `expire_stale_applications()`, `purge_expired_otps()`, and `purge_geo_evidence('90 days')`.
* **Domain 17 (Audit — `W167`–`W168`):** 13 `trg_95_*_audit` triggers log JSONB diffs while stripping secrets and GPS coordinates; `trg_block_mutation` enforces append-only immutability.
* **Domain 18 (11 Views — `W152`–`W161`):** `v_event_post_capacity`, `v_public_events`, `v_event_summary`, `v_accepted_unassigned`, `v_event_checkin_board`, `v_event_checkin_status`, `v_pending_confirmations`, `v_geo_attempts_review`, `v_event_coordinator_history`, `v_user_moderation_summary`, and `v_admin_dashboard`.
* **Domain 19 & 20 (`404-Not-403` Masking & Security Alerts — `18.1`–`19.10`):** Unauthorized access to hidden/admin resources logs `security.red_alert.*` in `audit_logs` and returns **HTTP 404**; all PostgreSQL trigger error prefixes translate into friendly user messages.