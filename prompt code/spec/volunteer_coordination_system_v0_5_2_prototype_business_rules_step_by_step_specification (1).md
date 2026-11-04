# Volunteer Coordination System (v0.5.2) — Master Prototype Business Rules, Formulas & Step-by-Step Specification

**Target Baseline:** Unified PostgreSQL Schema `v0.5.2` (22 Tables, 114 CHECK constraints, 13 Unique constraints, 20 Unique indexes, 3 GIN indexes, 1 GiST EXCLUDE constraint, 52 Triggers, 14 Stored Functions, 11 Views, 4 Scheduled Maintenance Jobs) + `users.uuid` (Unique Public User Code)  
**Total Workflows Covered:** **214 Complete Operational Workflows** (reconciling all 20 domains & W01–W168 cross-references)  
**Architecture Pattern:** Database-First Rule Engine + Django Service/BFF Policy Layer + React Native Workshift Client  
**Document Purpose:** Exhaustive, step-by-step operational blueprint and formula reference for coding the Prototype without duplicating database logic.

---

## 1. Executive Synthesis & Architecture Baseline

Your verified `v0.5.2` PostgreSQL database enforces all data-integrity, state-machine, capacity, geofence, and audit invariants at the database level. The Prototype splits authority cleanly across two layers:

| Layer | Core Responsibility in the Prototype |
| :--- | :--- |
| **1. PostgreSQL v0.5.2 Engine (Hard Invariants)** | Enforces 114 value checks, composite foreign keys, GiST schedule non-overlap (`ex_assignments_no_overlap`), 7 state machines, capacity locks, automatic attendance creation, lifecycle cascades, insert-to-apply moderation (`moderation_actions`), and append-only secret-redacted audit logs (`audit_logs`). |
| **2. Django BFF & Service Layer (Access, Privacy & Routing)** | Authenticates users, sets transaction-local actor context (`app.user_id` and `app.ip`), enforces **Owner-as-Monitor read-only mode** during coordinator handover, filters responses by **Data Privacy Tiers (`T0`–`T4`)**, resolves `users.uuid` for external QR/user-code lookups, logs unauthorized access attempts, and masks forbidden/hidden resources with **HTTP 404** and friendly messages. |

### 1.1 Ten Distinct Roles Referenced Across All Workflows

| # | Role | Definition & Scope in the Prototype |
| :--- | :--- | :--- |
| 1 | **Guest** | Unauthenticated visitor browsing public `T0` events, posts, charity fields, or previewing QR validity. |
| 2 | **Volunteer (Unverified)** | Authenticated active user (`account_status = 'active'`, `verification_status != 'verified'`). Can browse, apply, check in, and submit feedback, but cannot become a coordinator. |
| 3 | **Verified Volunteer** | Authenticated active user with `verification_status = 'verified'` (approved selfie + approved ID/driver license). Eligible to apply as a Coordinator. |
| 4 | **Walk-in Volunteer** | On-site registrant who applies by scanning a `'walkin_registration'` QR code (`source = 'qr_walkin'`, `walk_in_flag = TRUE`). Always starts as `'pending'` and checks in via QR or Coordinator Manual only (barred from GPS check-in). |
| 5 | **Coordinator Applicant** | Verified user with `coordinator_profiles.status = 'pending'` awaiting admin review. |
| 6 | **Approved Coordinator** | Active user with `coordinator_profiles.status = 'approved'`. Can create new events and receive coordinator handovers. |
| 7 | **Event Owner** | Original creator of an event (`events.owner_id`, permanently immutable). Holds full read/write control when `owner_id == current_coordinator_id`, and enters **Owner-as-Monitor (Read-Only + Retake)** mode when `owner_id != current_coordinator_id`. |
| 8 | **Current Coordinator** | Active operational manager of an event (`events.current_coordinator_id`). Transferable among approved coordinators with full history in `event_coordinator_history`. |
| 9 | **Admin / Super Admin** | Platform governance roles (`users.is_admin = TRUE` for Admin; `users.is_superuser = TRUE` for Super Admin). |
| 10 | **System (Triggers & Scheduler)** | Automated database triggers (`trg_01_*`, `trg_50_*`, `trg_90_*`, `trg_95_*`), stored functions, and periodic maintenance jobs. |

---

## 2. Five-Tier Data Privacy & Consent Model (`T0`–`T4`)

Every column returned by the BFF is governed by five strict visibility tiers:

| Tier | Name | Allowed Readers | Exact Fields Included |
| :--- | :--- | :--- | :--- |
| **T0** | **Public** | Anyone (including unauthenticated Guests) | Published/Active Event `event_id`, `title`, `description`, `purpose_type`, `location_name`, `landmark_text`, `latitude`, `longitude`, `geo_radius_m`, `geo_checkin_enabled`, `map_provider`, `start_at`, `end_at`, `application_deadline`, `status`, `acceptance_mode`, `max_participants`, `meals_provided`, `lodging_provided`, `travel_support_provided`, `compensation_kind`, `current_coordinator_id`, `coordinator_name`, `charity_fields`, `spots_remaining` (via `v_public_events` and `v_event_post_capacity`). |
| **T1** | **Minimal Identity & Self** | • The User themselves (full self-view)<br>• Any authenticated user looking up `users.uuid` (sees **Minimal Public Card only**: `uuid`, `display_name`) | **Minimal Public Card:** `users.uuid`, `users.display_name`.<br>**Self-Only Operational Data:** Own `event_applications`, own `assignments`, own `attendance`, own `onboarding_acknowledgments`, own `volunteer_availability_rules` & `exceptions`, own given `feedback`, own `user_charity_interests`. |
| **T2** | **Event-Scoped Semi-Private** | • The User themselves<br>• The Event's `current_coordinator_id` and `owner_id` (**only** while the user has an `'accepted'` application or active `assignment` for that event)<br>• Assigned Co-Volunteers in the same event (see **Roster Peer Subset only**) | **Coordinator Event-Scoped Fields:** `skills`, `physical_ok`, `good_eyesight`, `needs_glasses`, `can_lift_heavy`, `can_work_outdoor`, `has_leader_experience`, `new_to_volunteer`, `preferred_language`, `home_area`, `needs_meal_support`, `needs_travel_support`, `accepts_unpaid`, `verification_status`.<br>**Accepted Volunteer Event Details:** `onboarding_text`, `onboarding_version`, `compensation_note`, assigned `group_code`, `is_group_leader`, check-in status.<br>**Roster Peer Subset (same event/group):** `display_name`, `group_code`, `is_group_leader`, post `title`. |
| **T3** | **Strictly Private Personal Data** | • The User themselves<br>• Active Admins / Super Admins<br>• *(Emergency Active-Shift Exception)*: Decrypted phone & emergency contact shown to `current_coordinator_id` **only** while `event.status == 'active'` for `'assigned'`/`'confirmed'`/`'checked_in'` volunteers | Decrypted phone (`phone_enc`), `emergency_contact_name`, decrypted `emergency_contact_phone_enc`, `blood_type`, `is_willing_to_donate`, `is_willing_to_donate_blood`, `is_willing_to_donate_items`, `user_verification_images` (private admin stream only). *Note: `phone_hash`, `code_hash`, `token_hash`, and `password` are NEVER returned in any API response.* |
| **T4** | **Admin & Governance Restricted** | • Active Admins (`is_admin = TRUE`)<br>• Super Admins (`is_superuser = TRUE`) for admin-account details and destructive moderation | `moderation_actions`, `audit_logs`, `attendance_geo_attempts` (`v_geo_attempts_review`), `v_admin_dashboard`, `v_user_moderation_summary`, `account_status`, `blocked_until`, privilege flags (`is_admin`, `is_staff`, `is_superuser`). |

### 2.1 Plain-Language Formula for Event-Scoped Consent (`T2`)

$$\text{CanCoordinatorReadT2}(\text{Actor}, \text{Volunteer}, \text{Event}) = \text{IsEventManager}(\text{Event}, \text{Actor}) \;\text{AND}\; \text{HasAcceptedAppOrActiveAssignment}(\text{Volunteer}, \text{Event}) \;\text{AND}\; (\text{Event.status} \in \{\text{'published'}, \text{'active'}\})$$

---

## 3. Role & Permission Matrices

### 3.1 Admin Permission Matrix (`A01`–`A12`)

| Code | Capability Description | Prototype: Super Admin (`is_superuser`) | Prototype: Admin (`is_admin`) | Future: Monitorer | Future: Request Accepter |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **A01** | Read all summary dashboards (`v_admin_dashboard`, event summaries) | Allowed | Allowed | Allowed | Allowed |
| **A02** | Monitor user dashboards **+ admin account details** | Allowed | Denied (`404`) | Denied | Denied |
| **A03** | Monitor user summary dashboards only | Allowed | Allowed | Allowed | Allowed |
| **A04** | Inspect volunteer/coordinator detail & moderation summary | Allowed | Allowed | Allowed | Denied |
| **A05** | Inspect volunteer, coordinator **+ admin** in-depth detail & audit trail | Allowed | Denied (`404`) | Denied | Denied |
| **A06** | Review verification images & approve/suspend/revoke coordinators | Allowed | Allowed | Denied | Allowed |
| **A07** | Cancel an open event (`event_cancel`) | Allowed | Allowed | Denied | Denied |
| **A08** | Soft-delete or restore an event (`event_delete` / `event_restore`) | Allowed | Denied (`404`) | Denied | Denied |
| **A09** | Warn, block, or unblock a non-admin user (`user_warning`, `user_block`, `user_unblock`) | Allowed | Allowed | Denied | Denied |
| **A10** | Close or reinstate a user account (`account_close`, `account_reinstate`) | Allowed | Denied (`404`) | Denied | Denied |
| **A11** | Revoke admin privileges or close an admin account | Allowed | Denied (`404`) | Denied | Denied |
| **A12** | Modify `app_settings` & full application governance | Allowed | Denied (`404`) | Denied | Denied |

### 3.2 Coordinator Permission Matrix (`C01`–`C16`)

| Code | Capability Description | Owner (`owner == current`) | Current Coordinator (`current != owner`) | Owner-as-Monitor (`owner != current`) | Former Coordinator |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **C01** | Create new event (starts as `'draft'`) | Allowed | N/A | N/A | Allowed (New Event) |
| **C02** | Edit event details & onboarding text | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C03** | Publish, activate, complete, or cancel event | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C04** | Create, edit, or close event posts (`event_posts`) | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C05** | View event applications & unassigned pool | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |
| **C06** | Accept, reject, or waitlist applications | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C07** | Read `T2` semi-private profile of accepted volunteers | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |
| **C08** | Run auto-assignment or manual assignment/grouping | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C09** | Generate or revoke event QR tokens (`qr_tokens`) | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C10** | Perform manual check-in or confirm/reject geo check-in | Allowed | Allowed | **Blocked (Read-Only)** | Denied (`404`) |
| **C11** | Hand over coordination to another approved coordinator | Allowed | Allowed | **Blocked (Must Retake First)** | Denied (`404`) |
| **C12** | **Retake coordination authority** (`current_coordinator_id := owner_id`) | N/A | Denied | **Allowed** | Denied (`404`) |
| **C13–C14** | Delegate / revoke volunteer team-lead authority | *Deferred* | *Deferred* | Denied | Denied |
| **C15** | View live Shift Console (`v_event_summary`, check-in board) | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |
| **C16** | View coordinator handover history (`v_event_coordinator_history`) | Allowed | Allowed | **Allowed (Read-Only)** | Denied (`404`) |

---

## 4. Step-by-Step Operational Workflows & Plain-Language Formulas (All 20 Domains / 214 Workflows)

This section is the master coding specification. Every domain lists its **Plain-Language Mathematical & Logical Formulas**, its **State Machine** (where applicable), and the **Step-by-Step Operational Flows** covering all 214 workflows (cross-referenced with `1.1–19.10` and `W01–W168`).

---

### Domain 1: Authentication, OTP & Session Context (Workflows `1.1`–`1.10` / `W01`–`W12`)

#### 1A. Plain-Language Formulas
1. **Phone Normalization & Keyed Hash Formula:**
   $$\text{NormalizedPhone} = \text{StripSpacesAndPunctuation}(\text{InputPhone}) \quad (\text{E.164 format, e.g., } \text{+959...})$$
   $$\text{phone\_hash} = \text{HMAC\_SHA256}(\text{PHONE\_HASH\_HMAC\_SECRET}, \text{NormalizedPhone}) \quad (\text{64 hex chars, satisfies } 32 \le \text{len} \le 128)$$
   $$\text{phone\_enc} = \text{FernetEncrypt}(\text{PHONE\_ENCRYPTION\_KEY}, \text{NormalizedPhone})$$

2. **OTP Rate-Limit Formula (`trg_01_otp_rate_limit`):**
   $$\text{RecentOTPCount}(\text{phone\_hash}) = \text{Count}\Big(\text{auth\_otp rows where } \text{phone\_hash} = P \;\text{AND}\; \text{created\_at} > \text{now}() - \text{1 hour}\Big)$$
   $$\text{AllowOTPRequest} = \Big(\text{RecentOTPCount}(\text{phone\_hash}) < \text{setting\_int}(\text{'otp\_max\_requests\_per\_hour'})\Big) \quad (\text{Default limit} = 5)$$

3. **OTP Verification Decision Formula (`verify_otp` stored function):**
   Given the latest unconsumed row $V$ in `auth_otp` for $(\text{phone\_hash}, \text{purpose})$ locked `FOR UPDATE`:
   $$\text{VerifyResult} = \begin{cases} \text{'no\_otp'} & \text{if no row } V \text{ exists with } \text{consumed\_at IS NULL} \\ \text{'expired'} & \text{if } V.\text{expires\_at} \le \text{now}() \\ \text{'too\_many\_attempts'} & \text{if } V.\text{attempt\_count} \ge \text{setting\_int}(\text{'otp\_max\_attempts'}) \; (5) \\ \text{'ok'} \; (\text{sets } V.\text{consumed\_at} = \text{now}()) & \text{if } V.\text{code\_hash} == \text{InputCodeHash} \\ \text{'invalid\_code'} \; (\text{sets } V.\text{attempt\_count} = V.\text{attempt\_count} + 1) & \text{if } V.\text{code\_hash} \ne \text{InputCodeHash} \end{cases}$$

4. **Lazy Block Expiry & Account Login Eligibility Formula:**
   $$\text{IsBlockExpired}(\text{User}) = (\text{User.account\_status} == \text{'blocked'}) \;\text{AND}\; (\text{User.blocked\_until IS NOT NULL}) \;\text{AND}\; (\text{User.blocked\_until} \le \text{now}())$$
   $$\text{CanUserAuthenticate}(\text{User}) = (\text{User.account\_status} == \text{'active'}) \;\text{AND}\; (\text{User.is\_active} == \text{TRUE})$$

5. **Per-Request Database Session Context Formula (`db_context.py`):**
   $$\text{FirstClientIP}(\text{Request}) = \text{ First comma-separated token of } \text{X-Forwarded-For} \text{ or } \text{REMOTE\_ADDR}$$
   $$\text{On Authenticated Request inside Transaction} : \quad \text{set\_config}(\text{'app.user\_id'}, \text{str}(\text{User.id}), \text{true}), \quad \text{set\_config}(\text{'app.ip'}, \text{FirstClientIP}, \text{true})$$

#### 1B. Step-by-Step Operational Flows

* **Flow `1.1` / `W01` — Phone OTP Request (Success) & `1.6` / `W10` — OTP Rate Limit Exceeded:**
  * **Role:** Guest.
  * **Preconditions:** `purpose` $\in \{\text{'login'}, \text{'qr\_registration'}\}$; phone string is valid.
  * **Steps:**
    1. BFF serializer validates `phone` and optional `purpose` (defaults to `'login'`).
    2. Service normalizes `phone` and computes `phone_hash = HMAC-SHA256(PHONE_HASH_HMAC_SECRET, normalized_phone)`.
    3. Service checks if a `Users` row exists with `phone_hash`:
       * If `user.account_status == 'closed'` (**Flow `1.9` / `W09`**): abort immediately with HTTP `403`/`400` (`"This account has been closed."`).
       * If `user.account_status == 'blocked'` and `user.blocked_until <= now()` (**Flow `1.8` / `W12`**): call `SELECT release_expired_blocks()` so the user is restored to `'active'` before proceeding.
       * If still `user.account_status == 'blocked'`: abort with HTTP `403` (`"This account is currently blocked."`).
    4. Service generates a random 4-digit OTP code (or uses `settings.DEV_FIXED_OTP` **only** if `settings.DEBUG is True`) and computes `code_hash = HMAC-SHA256(PHONE_HASH_HMAC_SECRET, raw_code)`.
    5. Service executes `SELECT request_otp(%s, %s, %s)` with `[phone_hash, code_hash, purpose]`.
    6. PostgreSQL `request_otp()` inserts into `auth_otp` with `expires_at = now() + otp_ttl_minutes (5 mins)`.
    7. Before insert completes, trigger `trg_01_otp_rate_limit` zeroes `attempt_count = 0`, nulls `consumed_at = NULL`, and counts OTP rows for `phone_hash` in the last 1 hour:
       * **Branch `1.6` / `W10` (Rate Limited):** If count $\ge 5$, PostgreSQL raises `otp_rate_limited: too many OTP requests, try again later` $\rightarrow$ `common/exceptions.py` translates to HTTP `429 Too Many Requests`.
       * **Branch `1.1` / `W01` (Success):** Row is inserted (`ck_auth_otp_expiry` verifies `expires_at > created_at`). Service dispatches SMS and returns `{"status": "sent"}` (plus `"dev_code": raw_code` **only** when `settings.DEBUG is True`).

* **Flow `1.2`–`1.5`, `1.8`–`1.9` / `W02`–`W06`, `W08`–`W09` — Phone OTP Verification (All 5 Return Branches + Account Status Gates):**
  * **Role:** Guest.
  * **Steps:**
    1. BFF serializer validates `phone`, `code`, and `purpose` (allow-list only).
    2. Service normalizes `phone` $\rightarrow$ `phone_hash` and hashes `code` $\rightarrow$ `code_hash`.
    3. Inside an atomic transaction, service calls `SELECT verify_otp(%s, %s, %s)` with `[phone_hash, code_hash, purpose]`.
    4. PostgreSQL locks the newest unconsumed `auth_otp` row (`FOR UPDATE`) and returns a status string without raising an exception (so `attempt_count` increments commit cleanly to the database):
       * **Branch `1.5` / `W06` (`'no_otp'`):** No unconsumed OTP exists for `(phone_hash, purpose)` $\rightarrow$ return HTTP `400` (`code="no_otp"`, *"No active verification code found. Please request a new code."*).
       * **Branch `1.4` / `W04` (`'expired'`):** `expires_at <= now()` $\rightarrow$ return HTTP `400` (`code="otp_expired"`, *"This verification code has expired. Please request a new one."*).
       * **Branch `W05` (`'too_many_attempts'`):** `attempt_count >= 5` $\rightarrow$ return HTTP `429`/`400` (`code="too_many_attempts"`, *"Maximum verification attempts exceeded. Please request a new code."*).
       * **Branch `1.3` / `W03` (`'invalid_code'`):** `code_hash` mismatch; PostgreSQL increments `attempt_count = attempt_count + 1` (checked by `ck_auth_otp_attempt_count` $\in 0..100$) and commits the increment $\rightarrow$ return HTTP `400` (`code="invalid_code"`, *"Incorrect verification code."*).
       * **Branch `1.2` / `W02` (`'ok'`):** `code_hash` matches; PostgreSQL sets `consumed_at = now()` (`ck_auth_otp_consumed`).
    5. On `'ok'`, service runs `SELECT release_expired_blocks()` and looks up `Users.objects.filter(phone_hash=phone_hash).first()`:
       * **If User Does Not Exist (First-Time Registration):** Service encrypts `phone_enc = encrypt_phone(normalized_phone)`, generates `uuid = uuid.uuid4()`, and creates `Users(phone_hash=phone_hash, phone_enc=phone_enc, uuid=uuid, display_name=default_name, password=None)`. Trigger `trg_01_users_guard` sets `is_active = True`, `account_status = 'active'`.
       * **If User Exists & `account_status == 'blocked'` (`1.8` / `W08`):** Reject login with HTTP `403` (`code="account_blocked"`).
       * **If User Exists & `account_status == 'closed'` (`1.9` / `W09`):** Reject login with HTTP `403` (`code="account_closed"`).
    6. Service updates `user.last_login = timezone.now()`, gets or creates DRF `Token.objects.get_or_create(user=user)`, and returns `{"token": token.key, "user": T1ProfileData}`.

* **Flow `1.7` / `W07` — User Logout:**
  * **Role:** Authenticated Volunteer / Coordinator / Admin.
  * **Steps:**
    1. Caller sends `POST /api/v1/auth/logout/` with `Authorization: Token <key>`.
    2. Service deletes the caller's token row from `authtoken_token` (`request.auth.delete()`).
    3. Subsequent requests using that token fail authentication with HTTP `401 Unauthorized`.

* **Flow `1.10` & `W11` — Per-Request Session Context & Mid-Session Block Rejection (`BlockedAwareTokenAuthentication`):**
  * **Role:** System (Authentication + Middleware).
  * **Steps:**
    1. On every incoming API request with a token, `BlockedAwareTokenAuthentication` resolves the `Users` row.
    2. If `user.account_status == 'blocked'` and `user.blocked_until` is in the past (**Flow `W12`**), it calls `SELECT release_expired_blocks()` and refreshes `user`.
    3. If `not user.is_active` or `user.account_status != 'active'` (**Flow `W11`**), it raises `AuthenticationFailed("Account is blocked or inactive.")` (HTTP `401`/`403`).
    4. Immediately upon authenticating `user`, it calls `set_db_session_context(user.id, get_client_ip(request))` inside the active request transaction (`ATOMIC_REQUESTS = True`), executing `SELECT set_config('app.user_id', %s, true)` and `SELECT set_config('app.ip', %s, true)` so all 52 PostgreSQL triggers know the acting user and client IP.

---

### Domain 2: User Profile, Public UUID & Capability Profiling (Workflows `2.1`–`2.4`, `W13`–`W17`, `W23`–`W26`)

#### 2A. Plain-Language Formulas
1. **Skill & Tag Array Normalization Formula (`tags_are_normalized`):**
   $$\text{NormalizeTags}(\text{RawList}) = \text{DeduplicatePreservingOrder}\Big(\big[\text{lower}(\text{trim}(t)) \;\big|\; t \in \text{RawList} \text{ where } \text{trim}(t) \ne \text{''}\big]\Big)$$
   $$\text{IsValidTagArray}(T) = \big(\text{Length}(T) \le 30\big) \;\text{AND}\; \forall t \in T : \big(1 \le \text{char\_length}(t) \le 50 \;\text{AND}\; t == \text{lower}(\text{btrim}(t))\big)$$

2. **Donation Consistency Formula (`ck_users_donation_consistency`):**
   $$\text{DonationValid} = (\text{is\_willing\_to\_donate} == \text{TRUE}) \;\text{OR}\; \big(\neg\text{is\_willing\_to\_donate\_blood} \;\text{AND}\; \neg\text{is\_willing\_to\_donate\_items}\big)$$

3. **Emergency Contact Pair Formula (`ck_users_emergency_pair`):**
   $$\text{EmergencyPairValid} = \big(\text{emergency\_contact\_name IS NULL} \;\text{AND}\; \text{emergency\_contact\_phone\_enc IS NULL}\big) \;\text{OR}\; \big(\text{emergency\_contact\_name IS NOT NULL} \;\text{AND}\; \text{emergency\_contact\_phone\_enc IS NOT NULL}\big)$$

4. **UUID Lookup Visibility Formula (`W23`–`W24`):**
   $$\text{UUIDLookupResponse}(\text{Actor}, \text{TargetUser}, \text{OptionalEvent}) = \begin{cases} \text{T2 Semi-Private Card} & \text{if } \text{OptionalEvent provided} \;\text{AND}\; \text{CanCoordinatorReadT2}(\text{Actor}, \text{TargetUser}, \text{OptionalEvent}) \\ \text{T1 Minimal Public Card } (\{\text{uuid}, \text{display\_name}\}) & \text{otherwise (for any authenticated user)} \end{cases}$$

#### 2B. Step-by-Step Operational Flows

* **Flow `2.1` / `W13` & `W23` — View Own Profile & Public UUID QR Code:**
  * **Role:** Authenticated User.
  * **Steps:**
    1. User requests `GET /api/v1/me/`.
    2. Service decrypts `phone_enc` (and `emergency_contact_phone_enc` if present) using `PHONE_ENCRYPTION_KEY` for self-display only, and returns all `T1` + `T2` + `T3` self fields including `uuid` (for rendering the user's personal QR code badge) and `charity_interests`.
    3. Internal keys (`phone_hash`, `phone_enc`, `emergency_contact_phone_enc`, `password`) are stripped by `UserProfileSerializer`.

* **Flow `2.2`–`2.3`, `W14`–`W16`, `W25`–`W26` — Update Own Profile (Allow-List, Privileged Rejection, Enum/Pair Validation & Skill Normalization):**
  * **Role:** Authenticated User.
  * **Steps:**
    1. User sends `PATCH /api/v1/me/` with JSON payload.
    2. `ProfileUpdateSerializer` checks every incoming key against `PROFILE_EDITABLE_FIELDS`:
       `{"display_name", "preferred_language", "home_area", "emergency_contact_name", "emergency_contact_phone", "blood_type", "is_willing_to_donate", "is_willing_to_donate_blood", "is_willing_to_donate_items", "physical_ok", "good_eyesight", "needs_glasses", "can_lift_heavy", "can_work_outdoor", "has_leader_experience", "new_to_volunteer", "skills", "needs_meal_support", "needs_travel_support", "accepts_unpaid"}`.
    3. **Branch `2.3` / `W15` (Privileged or Unknown Key Rejected):** If the payload contains any key outside `PROFILE_EDITABLE_FIELDS` (such as `is_admin`, `is_staff`, `is_superuser`, `is_active`, `account_status`, `blocked_until`, `phone_hash`, `phone_enc`, `password`, `verification_status`, or `uuid`), serializer immediately returns HTTP `400 Bad Request` (`{key: "field_not_allowed"}`). *(Backstop: PostgreSQL `trg_01_users_guard` also raises `permission_denied` or `immutable: phone_hash cannot be changed` if called directly).*
    4. **Branch `W25` (Skills Normalization):** If `skills` is provided, service normalizes each string via `NormalizeTags(skills)` and verifies $\le 30$ tags of $\le 50$ chars (`ck_users_skills`).
    5. **Branch `W26` (Emergency Contact Pair):**
       * If both `emergency_contact_name` and `emergency_contact_phone` are provided and non-empty: service normalizes and encrypts `emergency_contact_phone_enc = encrypt_phone(emergency_contact_phone)`.
       * If both are cleared (`""` or `None`): service sets both `emergency_contact_name = None` and `emergency_contact_phone_enc = None`.
       * If only one is set while the other is missing: reject with HTTP `400` (`code="emergency_contact_incomplete"`, enforced by `ck_users_emergency_pair`).
    6. **Branch `W16` (Choice, Language, Donation & Length Validation):**
       * `display_name` trimmed length must be $1..150$ (`ck_users_display_name`).
       * `preferred_language` must match `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$` (`ck_users_language`).
       * `blood_type` must be in `{'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'}` (`ck_users_blood_type`).
       * If `is_willing_to_donate_blood` or `is_willing_to_donate_items` is `True` while `is_willing_to_donate` is `False`, reject with HTTP `400` (`ck_users_donation_consistency`).
    7. Service saves `user`; PostgreSQL `trg_90_users_updated_at` updates `updated_at = now()`, and `trg_95_users_audit` writes only the changed columns (redacting `phone_enc` and `emergency_contact_phone_enc`) to `audit_logs`.

* **Flow `2.4` / `W17` — Set Charity Interests:**
  * **Role:** Authenticated User.
  * **Steps:**
    1. User sends `PUT /api/v1/me/charity-interests/` with `{"field_codes": ["teaching", "cooking"]}`.
    2. Service verifies all codes exist in `CharityFields.objects.filter(active=True, code__in=codes)`. If any code is unknown or inactive, return HTTP `400`.
    3. Inside `transaction.atomic()`, service deletes old `UserCharityInterests` rows for `user` and bulk-inserts the new set (`uq_user_charity_interest` prevents duplicates).

* **Flow `W24` — Scan / Lookup User by Public UUID:**
  * **Role:** Authenticated User or Coordinator.
  * **Steps:**
    1. Caller requests `GET /api/v1/users/by-uuid/{uuid}/` (with optional `?event_id={id}`).
    2. If no active user matches `uuid`, return HTTP `404`.
    3. If `event_id` is passed and `CanCoordinatorReadT2(request.user, target_user, event)` is `True`, return the volunteer's `T2` event-scoped profile + their application/assignment/attendance status for that event (enabling 1-scan coordinator check-in).
    4. Otherwise, return strictly the `T1` Minimal Public Card (`{"uuid": target.uuid, "display_name": target.display_name}`).

---

### Domain 3: Volunteer Availability Rules & Exceptions (Workflows `2.5`–`2.9` / `W18`–`W22`, `W150`–`W151`)

#### 3A. Plain-Language Formulas
1. **Weekly Rule Validity Formula (`ck_availability_*`, `uq_availability_rule`):**
   $$\text{RuleValid} = (\text{weekday} \in \{1, 2, 3, 4, 5, 6, 7\}) \;\text{AND}\; (\text{end\_time} > \text{start\_time}) \;\text{AND}\; (\text{valid\_from IS NULL} \;\text{OR}\; \text{valid\_to IS NULL} \;\text{OR}\; \text{valid\_to} \ge \text{valid\_from})$$

2. **Date Exception Validity Formula (`ck_availability_exception_times`, `uq_availability_exception`):**
   $$\text{ExceptionValid} = (\text{start\_time IS NULL} \;\text{AND}\; \text{end\_time IS NULL}) \;\text{OR}\; (\text{start\_time IS NOT NULL} \;\text{AND}\; \text{end\_time IS NOT NULL} \;\text{AND}\; \text{end\_time} > \text{start\_time})$$

3. **Volunteer Availability Evaluation Formula (`is_user_available(p_user, p_start, p_end)`):**
   Let $D = \text{p\_start::DATE}$, $W = \text{ISODOW}(\text{p\_start}) \in 1..7$, $S = \text{p\_start::TIME}$, $E = \text{p\_end::TIME}$:
   $$\text{IsUserAvailable} = \begin{cases} \text{FALSE} & \text{if Exception } X \text{ exists on } D \text{ with } \neg X.\text{is\_available} \;\text{AND}\; X.\text{start\_time IS NULL} \\ \neg(S < X.\text{end\_time} \land E > X.\text{start\_time}) & \text{if Exception } X \text{ exists on } D \text{ with } \neg X.\text{is\_available} \;\text{AND}\; X.\text{start\_time IS NOT NULL} \\ \text{TRUE} & \text{if Exception } X \text{ exists on } D \text{ with } X.\text{is\_available} \;\text{AND}\; X.\text{start\_time IS NULL} \\ (S \ge X.\text{start\_time} \land E \le X.\text{end\_time}) & \text{if Exception } X \text{ exists on } D \text{ with } X.\text{is\_available} \;\text{AND}\; X.\text{start\_time IS NOT NULL} \\ \text{TRUE} & \text{if no Exception on } D \;\text{AND}\; \text{User has } 0 \text{ weekly rules in total} \\ \exists \text{ Rule } R \text{ on weekday } W \text{ valid on } D \text{ with } S \ge R.\text{start\_time} \land E \le R.\text{end\_time} & \text{otherwise} \end{cases}$$

#### 3B. Step-by-Step Operational Flows
* **Flow `2.5` / `W18` — View Own Availability:** `GET /api/v1/me/availability/` returns all `VolunteerAvailabilityRules` (ordered by `weekday, start_time`) and `VolunteerAvailabilityExceptions` (ordered by `date`) for `request.user`.
* **Flow `2.6` / `W19` — Set Weekly Availability Rules:** `POST /api/v1/me/availability/rules/` atomically deletes the user's existing weekly rules and inserts the new list; `trg_95_availability_rules_audit` logs each row.
* **Flow `2.7` / `W20` — Add/Replace Availability Exception:** `POST /api/v1/me/availability/exceptions/` upserts an exception for `(request.user, date)` (`uq_availability_exception`); `trg_95_availability_exceptions_audit` logs the change.
* **Flow `2.8` / `W21` — Remove Availability Exception:** `DELETE /api/v1/me/availability/exceptions/{id}/` deletes the exception owned by `request.user` (returning `404` if not owned by caller).
* **Flow `2.9` / `W22`, `W150`–`W151` — Check Availability for Event (Self or Coordinator):**
  * Volunteer calls `GET /api/v1/events/{id}/check-availability/` (or Coordinator checks an accepted applicant's availability for their event).
  * Service executes `SELECT is_user_available(%s, %s, %s)` with `[target_user.id, event.start_at, event.end_at]` and returns `{"available": True/False}`.

---

### Domain 4: Identity Verification Images & Trust Hierarchy (Workflows `3.1`–`3.9` / `W27`–`W33`)

#### 4A. State Machine & Plain-Language Formulas
1. **Verification Image Status State Machine (`user_verification_images.status`):**
   $$\text{pending} \longrightarrow \text{approved} \quad (\text{Terminal — cannot be re-reviewed})$$
   $$\text{pending} \longrightarrow \text{rejected} \quad (\text{Terminal — cannot be re-reviewed; user uploads a new image})$$

2. **Image File & Review Integrity Formulas (`ck_verification_*` & `trg_01_vimg_guard`):**
   $$\text{ValidUpload} = (\text{image\_type} \in \{\text{'mock\_selfie'}, \text{'id\_license'}, \text{'driver\_license'}\}) \;\text{AND}\; (\text{file\_format} == \text{'jpeg'}) \;\text{AND}\; (\text{image\_path} \sim \text{'\.jpe?g\$'}) \;\text{AND}\; (\text{file\_sha256} \sim \text{'\^[0-9a-f]\{64\}\$'})$$
   $$\text{ValidReview} = (\text{OLD.status} == \text{'pending'}) \;\text{AND}\; (\text{NEW.status} \in \{\text{'approved'}, \text{'rejected'}\}) \;\text{AND}\; \text{ is\_admin\_user}(\text{reviewed\_by\_id}) \;\text{AND}\; (\text{reviewed\_by\_id} \ne \text{user\_id})$$

3. **Automatic User Verification Recomputation Formula (`recompute_user_verification` via `trg_50_vimg_after`):**
   Evaluating only rows where `user_id = U` and `is_current = TRUE`:
   $$\text{users.verification\_status} = \begin{cases} \text{'none'} & \text{if } \text{Count}(\text{current images}) == 0 \\ \text{'rejected'} & \text{if } \exists \text{ current image with } \text{status} == \text{'rejected'} \\ \text{'verified'} & \text{if } (\exists \text{ approved } \text{'mock\_selfie'}) \;\text{AND}\; (\exists \text{ approved } \text{'id\_license'} \text{ or } \text{'driver\_license'}) \\ \text{'pending'} & \text{otherwise} \end{cases}$$

#### 4B. Step-by-Step Operational Flows
* **Flow `3.1`–`3.3`, `W27`–`W29`, `W33` — Upload Selfie / ID License / Driver License (and Re-Upload After Rejection):**
  * **Role:** Authenticated User.
  * **Steps:**
    1. User uploads image file and `image_type` $\in \{\text{'mock\_selfie'}, \text{'id\_license'}, \text{'driver\_license'}\}$ to `POST /api/v1/me/verification-images/`.
    2. Service opens the uploaded file with Pillow, verifies it is a valid image, strips all EXIF metadata, converts color mode to RGB, encodes it as JPEG into memory, computes `file_sha256 = hashlib.sha256(jpeg_bytes).hexdigest()`, and writes the `.jpg` file to `VERIFICATION_MEDIA_ROOT / f"{user.uuid}_{image_type}_{uuid4().hex[:8]}.jpg"`.
    3. Service inserts `UserVerificationImages(user=user, image_type=image_type, image_path=rel_path, file_format="jpeg", file_sha256=sha256, is_current=True)`.
    4. **Trigger `trg_01_vimg_guard` (Before Insert):** Forces `status = 'pending'`, `reviewed_by_id = NULL`, `reviewed_at = NULL`, and automatically runs `UPDATE user_verification_images SET is_current = FALSE WHERE user_id = NEW.user_id AND image_type = NEW.image_type AND is_current` (so `uq_current_verification_image` is never violated, and re-uploading after a rejection archives the rejected image).
    5. **Trigger `trg_50_vimg_after` (After Insert):** Calls `recompute_user_verification(NEW.user_id)`, automatically updating `users.verification_status` (e.g., from `'none'` or `'rejected'` to `'pending'`).

* **Flow `3.4`–`3.8` / `W30`–`W32` — Admin Reviews Verification Image (Approve / Reject / Self-Review & Re-Review Guards):**
  * **Role:** Admin (`A06`).
  * **Steps:**
    1. Admin views pending images (`idx_verification_images_pending`) via the private admin stream (which logs `security.warning.admin_sensitive_view`) and sends `POST /api/v1/admin/verification-images/{id}/review/` with `{"status": "approved" | "rejected", "note": "..."}`.
    2. Service updates `image.status`, `image.note`, `image.reviewed_by = request.user`, `image.reviewed_at = timezone.now()`.
    3. **Trigger & Constraint Guards:**
       * **Flow `3.9` (Image Immutability):** If `user_id`, `image_type`, `image_path`, or `file_sha256` was modified, `trg_01_vimg_guard` raises `immutable: an uploaded image cannot be altered; upload a new one`.
       * **Flow `3.8` (Re-Review Prevention):** If `OLD.status != 'pending'`, `trg_01_vimg_guard` raises `invalid_transition: a reviewed image cannot be reviewed again`.
       * **Flow `3.7` (Self-Review Prevention):** If `reviewed_by_id == user_id`, `ck_verification_no_self_review` rejects the write.
       * **Non-Admin Prevention:** If `not is_admin_user(reviewed_by_id)`, `trg_01_vimg_guard` raises `permission_denied`.
    4. **Flow `3.6` / `W32`:** `trg_50_vimg_after` runs `recompute_user_verification(image.user_id)`. When both a current `'mock_selfie'` and a current `'id_license'`/`'driver_license'` are `'approved'`, `users.verification_status` becomes `'verified'`.

---

### Domain 5: Coordinator Lifecycle & Approval (Workflows `4.1`–`4.8` / `W34`–`W40`)

#### 5A. State Machine & Plain-Language Formulas
1. **Coordinator Profile Status State Machine (`coordinator_profiles.status`):**
   $$\text{pending} \longrightarrow \text{approved} \;\big|\; \text{revoked}$$
   $$\text{approved} \longrightarrow \text{suspended} \;\big|\; \text{revoked}$$
   $$\text{suspended} \longrightarrow \text{approved} \;\big|\; \text{revoked}$$
   $$\text{revoked} \longrightarrow (\text{Terminal — no further transitions})$$

2. **Coordinator Approval Gate Formula (`trg_01_coordinator_guard` & `ck_coordinator_*`):**
   $$\text{CanTransitionToApproved}(\text{Actor}, \text{Profile}) = \text{is\_admin\_user}(\text{Actor.id}) \;\text{AND}\; (\text{Actor.id} \ne \text{Profile.user\_id}) \;\text{AND}\; (\text{Profile.user.is\_active} == \text{TRUE}) \;\text{AND}\; (\text{Profile.user.verification\_status} == \text{'verified'})$$

#### 5B. Step-by-Step Operational Flows
* **Flow `4.1`–`4.2` / `W34` — Apply as Coordinator (Verified vs. Unverified Pre-Check):**
  * **Role:** Authenticated User.
  * **Steps:**
    1. User sends `POST /api/v1/me/coordinator/` with `{"notes": "..."}`.
    2. **Branch `4.2` (Unverified User):** Service checks `request.user.verification_status == 'verified'`. If not `'verified'`, return HTTP `400` (`code="not_verified"`, *"Identity verification must be approved before applying as a coordinator."*).
    3. **Branch `4.1` (Verified User):** Service gets or creates `CoordinatorProfiles(user=request.user, status="pending", notes=notes)`. Trigger `trg_01_coordinator_guard` enforces `status == 'pending'` on insert.

* **Flow `4.3`–`4.8` / `W35`–`W40` — Admin Approves, Suspends, Reactivates, or Revokes Coordinator:**
  * **Role:** Admin (`A06`).
  * **Steps:**
    1. Admin calls `/api/v1/admin/coordinators/{user_id}/approve/` (or `/suspend/`, `/revoke/`).
    2. **Approve (`4.3` / `W35`) & Reactivate (`4.6` / `W38`):** Sets `status = 'approved'`, `approved_by = request.user`, `approved_at = timezone.now()`.
       * **Guard `4.7` / `W39` (No Self-Approval):** If `approved_by_id == user_id`, `ck_coordinator_no_self_approval` rejects the write.
       * **Guard `4.8` / `W40` (Unverified Target):** If target user's `verification_status != 'verified'` or `not is_active`, `trg_01_coordinator_guard` raises `not_verified: only active, verified users can become coordinators`.
    3. **Suspend (`4.4` / `W36`):** Transitions `'approved' -> 'suspended'`. While suspended, `is_approved_coordinator(user_id)` returns `FALSE`, immediately blocking the user from creating new events or mutating events they coordinate.
    4. **Revoke (`4.5` / `W37`):** Transitions `'pending'`/`'approved'`/`'suspended' -> 'revoked'` (terminal state).
    5. **Invalid Transition (`4.8`):** Any jump outside the state machine (e.g., `'pending' -> 'suspended'` or `'revoked' -> 'approved'`) raises `invalid_transition: coordinator status X -> Y`.

---

### Domain 6: Event Lifecycle, Handover, Owner-as-Monitor & Retake (Workflows `5.1`–`5.16` / `W41`–`W58`)

#### 6A. State Machine & Plain-Language Formulas
1. **Event Status State Machine (`events.status`):**
   $$\text{draft} \longrightarrow \text{published} \;\big|\; \text{cancelled}$$
   $$\text{published} \longrightarrow \text{active} \;\big|\; \text{cancelled}$$
   $$\text{active} \longrightarrow \text{completed} \;\big|\; \text{cancelled}$$
   $$\text{completed}, \;\text{cancelled} \longrightarrow (\text{Terminal \& Frozen — only } \text{deleted\_at}/\text{deleted\_by\_id} \text{ may change})$$

2. **Lifecycle Timestamp Invariant Formula (`ck_events_status_timestamps`):**
   $$\text{ValidTimestamps} = \begin{cases} \text{pub}=\emptyset, \text{act}=\emptyset, \text{comp}=\emptyset, \text{canc}=\emptyset & \text{if } \text{status} == \text{'draft'} \\ \text{pub}\ne\emptyset, \text{act}=\emptyset, \text{comp}=\emptyset, \text{canc}=\emptyset & \text{if } \text{status} == \text{'published'} \\ \text{pub}\ne\emptyset, \text{act}\ne\emptyset, \text{comp}=\emptyset, \text{canc}=\emptyset & \text{if } \text{status} == \text{'active'} \\ \text{pub}\ne\emptyset, \text{act}\ne\emptyset, \text{comp}\ne\emptyset, \text{canc}=\emptyset & \text{if } \text{status} == \text{'completed'} \\ \text{canc}\ne\emptyset, \text{comp}=\emptyset & \text{if } \text{status} == \text{'cancelled'} \end{cases}$$

3. **Event Publish Readiness Formula (`trg_01_events_before_update`):**
   $$\text{CanPublish}(\text{Event}) = (\text{Event.status} == \text{'draft'}) \;\text{AND}\; (\text{Event.deleted\_at IS NULL}) \;\text{AND}\; (\text{Event.start\_at} > \text{now}()) \;\text{AND}\; \exists \text{ Post } P \text{ on Event with } P.\text{status} \ne \text{'closed'}$$

4. **Owner-as-Monitor vs. Active Operational Write Authority Formula (Prototype BFF Rule):**
   $$\text{CanWriteEventOperations}(\text{Actor}, \text{Event}) = \text{is\_admin\_user}(\text{Actor.id}) \;\text{OR}\; \Big(\text{Actor.id} == \text{Event.current\_coordinator\_id} \;\text{AND}\; \text{is\_approved\_coordinator}(\text{Actor.id})\Big)$$
   $$\text{CanRetakeEvent}(\text{Actor}, \text{Event}) = \Big(\text{Actor.id} == \text{Event.owner\_id} \;\text{AND}\; \text{Event.owner\_id} \ne \text{Event.current\_coordinator\_id} \;\text{AND}\; \text{is\_approved\_coordinator}(\text{Actor.id}) \;\text{AND}\; \text{Event.status} \notin \{\text{'completed'}, \text{'cancelled'}\}\Big)$$

#### 6B. Step-by-Step Operational Flows
* **Flow `5.1` / `W41` — Create Event:**
  * **Role:** Approved Coordinator (`C01`).
  * **Steps:**
    1. Coordinator submits `POST /api/v1/coordinator/events/` with allow-listed fields (`title`, `description`, `purpose_type`, `location_name`, `landmark_text`, `latitude`, `longitude`, `geo_radius_m`, `geo_checkin_enabled`, `geo_checkin_opens_before_min`, `require_checkin_confirmation`, `map_provider`, `start_at`, `end_at`, `application_deadline`, `acceptance_mode`, `auto_assign_enabled`, `group_size`, `leader_strategy`, `max_participants`, `meals_provided`, `lodging_provided`, `travel_support_provided`, `compensation_kind`, `compensation_note`, `onboarding_text`, `require_onboarding_ack`, `qr_registration_enabled`, and `charity_field_codes`).
    2. Service sets `owner_id = request.user.id`, `current_coordinator_id = request.user.id` and inserts into `events` (and `event_charity_fields`).
    3. **Trigger `trg_01_events_before_insert`:** Verifies `is_approved_coordinator(owner_id)`, forces `status = 'draft'`, `onboarding_version = 1`, and nulls all lifecycle/delete timestamps.
    4. **Trigger `trg_50_events_after_insert`:** Automatically inserts the initial handover record `(event_id, from=NULL, to=current_coordinator_id, changed_by=app_user_id(), reason='initial coordinator')` into `event_coordinator_history`.

* **Flow `5.2`, `5.7`, `5.9` / `W42`, `W54`, `W55` — Edit Event & Automatic Onboarding Version Bump:**
  * **Role:** Current Coordinator (`C02`) or Admin. *(If caller is `owner_id` while `owner_id != current_coordinator_id`, BFF blocks the edit with `Owner-as-Monitor` message).*
  * **Steps:**
    1. Caller sends `PATCH /api/v1/coordinator/events/{id}/` with allow-listed editable fields (`status`, `owner_id`, `current_coordinator_id`, and `onboarding_version` are excluded from the serializer).
    2. **Trigger `trg_01_events_before_update`:**
       * **Guard `5.9` / `W54`:** If `owner_id` changed, raises `immutable: the owner of an event can never be changed`.
       * **Guard `5.7` / `W55`:** If `OLD.status in ('completed', 'cancelled')`, raises `event_frozen: a completed/cancelled event can no longer be changed`.
       * **Onboarding Version Bump (`12.4` / `W124`):** If `NEW.onboarding_text IS DISTINCT FROM OLD.onboarding_text`, automatically increments `NEW.onboarding_version = OLD.onboarding_version + 1`.

* **Flow `5.3` / `W43`, `W57`, `W58` — Publish Event:**
  * **Role:** Current Coordinator (`C03`).
  * **Steps:** Updates `event.status = 'published'`. Trigger `trg_01_events_before_update` checks:
    * If no non-closed post exists on the event (**`W57`**): raises `publish_requires_post: add at least one open post before publishing`.
    * If `start_at <= now()` (**`W58`**): raises `publish_requires_future_start: the start time must be in the future`.
    * Otherwise, sets `published_at = now()`. Event immediately appears in `v_public_events`.

* **Flow `5.4` / `W44` — Activate Event:**
  * **Role:** Current Coordinator (`C03`).
  * **Steps:** Transitions `event.status` from `'published'` to `'active'`. Trigger sets `activated_at = now()`. Unlocks QR, GPS, and manual attendance check-in.

* **Flow `5.5` / `W45` — Complete Event (with Full Completion Cascade):**
  * **Role:** Current Coordinator (`C03`).
  * **Steps:** Transitions `event.status` from `'active'` to `'completed'`.
  * **Before Trigger:** Sets `completed_at = now()`.
  * **After Trigger (`trg_50_events_after_update`):** Automatically executes 5 cascades in the same transaction:
    1. `attendance` where `status = 'expected'` $\rightarrow$ `'absent'` (**`9.14` / `W116`**).
    2. `attendance` where `status = 'checked_in'` $\rightarrow$ `'completed'` (**`9.14` / `W116`**).
    3. `assignments` where `status IN ('assigned', 'confirmed')` $\rightarrow$ `'completed'` (**`8.8` / `W88`**).
    4. `event_applications` where `status IN ('pending', 'waitlisted')` $\rightarrow$ `'expired'` (**`7.12`**).
    5. `qr_tokens` where `revoked_at IS NULL` $\rightarrow$ `revoked_at = now()` (**`11.11` / `W148`**).

* **Flow `5.6` / `W46` — Cancel Event (with Full Cancellation Cascade):**
  * **Role:** Current Coordinator (`C03`) or Admin (`A07`).
  * **Steps:** Transitions `event.status` from `'draft'`, `'published'`, or `'active'` to `'cancelled'` with optional `cancel_reason`.
  * **Before Trigger:** Sets `cancelled_at = now()`.
  * **After Trigger (`trg_50_events_after_update`):** Cancels all `'assigned'`/`'confirmed'` assignments (which cascades `'expected'` attendance to `'cancelled'`), expires `'pending'`/`'waitlisted'` applications, and revokes all active QR tokens.

* **Flow `5.10`–`5.13` / `W50`–`W53` — Coordinator Handover, Owner-as-Monitor & Owner Retake:**
  * **Role:** Event Owner (`C11`, `C12`), Current Coordinator (`C11`), or Admin.
  * **Steps:**
    1. **Handover (`5.10`, `W50`, `W52`, `W53`):** Current Coordinator, Owner (when current), or Admin calls `POST /api/v1/events/{id}/handover/` with `{"new_coordinator_id": target_id, "reason": "..."}`.
       * Service executes `SELECT change_event_coordinator(%s, %s, %s, %s)` with `[event_id, new_coordinator_id, request.user.id, reason]`.
       * **Branch `5.11` (Same Coordinator):** If `current_coordinator_id == new_coordinator_id`, function returns silently (no-op).
       * **Branch `5.12` (Unapproved Target):** If target is not an active approved coordinator, `trg_01_events_before_update` raises `coordinator_not_approved`.
       * **Branch `5.13` (Frozen Event):** If `status in ('completed', 'cancelled')`, raises `event_frozen`.
       * **Success:** Updates `events.current_coordinator_id` and `trg_50_events_after_update` appends a row to `event_coordinator_history`.
    2. **Owner-as-Monitor State:** While `event.owner_id != event.current_coordinator_id`, the Owner can call all `GET` endpoints for the event (`C05`, `C07`, `C15`, `C16`), but the BFF blocks `POST`/`PATCH`/`DELETE` operational actions from the Owner until they retake authority.
    3. **Owner Retake (`W51` / `C12`):** Owner calls `POST /api/v1/events/{id}/retake/` with `{"reason": "..."}` $\rightarrow$ service calls `SELECT change_event_coordinator(event.id, event.owner_id, request.user.id, reason)`. `current_coordinator_id` is restored to `owner_id`, logged in `event_coordinator_history`, and full write authority returns to the Owner.

---

### Domain 7: Event Posts / Role Definitions (Workflows `6.1`–`6.7` / `W59`–`W63`)

#### 7A. State Machine & Plain-Language Formulas
1. **Event Post Status State Machine (`event_posts.status`):**
   $$\text{open} \;\longleftrightarrow\; \text{full} \quad (\text{Maintained automatically by } \text{trg\_01\_posts\_guard} \text{ whenever assignments change})$$
   $$\text{open} \;\big|\; \text{full} \longrightarrow \text{closed} \quad (\text{Set manually by Current Coordinator to stop further assignments})$$

2. **Post Auto-Status & Headcount Formula (`trg_01_posts_guard`):**
   Let $A_{\text{active}} = \text{Count}(\text{assignments where } \text{post\_id} = P.\text{id} \;\text{AND}\; \text{status} \ne \text{'cancelled'})$:
   $$\text{HeadcountUpdateValid} = (P.\text{required\_headcount} \ge \max(1, A_{\text{active}})) \;\text{AND}\; (P.\text{required\_headcount} \le 100,000)$$
   $$\text{PostStatus}(P) = \begin{cases} \text{'closed'} & \text{if } P.\text{status} == \text{'closed'} \\ \text{'full'} & \text{if } P.\text{status} \ne \text{'closed'} \;\text{AND}\; A_{\text{active}} \ge P.\text{required\_headcount} \\ \text{'open'} & \text{if } P.\text{status} \ne \text{'closed'} \;\text{AND}\; A_{\text{active}} < P.\text{required\_headcount} \end{cases}$$

#### 7B. Step-by-Step Operational Flows
* **Flow `6.1` / `W59` — Create Event Post:** Current Coordinator (`C04`) sends `POST /api/v1/events/{id}/posts/` with allow-listed fields (`title`, `description`, `required_headcount`, `physical_level`, `required_skills`, `leader_needed`, `new_volunteers_allowed`, `priority`). Service normalizes `required_skills` via `NormalizeTags()`. Trigger `trg_01_posts_guard` verifies event is open (`draft`/`published`/`active`) and sets `status = 'open'`.
* **Flow `6.2`, `6.5`–`6.7` / `W60`, `W63` — Update Event Post & Guards:** Current Coordinator sends `PATCH /api/v1/posts/{id}/` via `PostUpdateSerializer` (which excludes `event`, `event_id`, `id`, and `status`).
  * **Guard `6.6` / `W63`:** Changing `event_id` raises `immutable: a post cannot move to another event`.
  * **Guard `6.5`:** Reducing `required_headcount` below $A_{\text{active}}$ raises `capacity_conflict: headcount cannot drop below the N volunteers already assigned`.
  * **Guard `6.7`:** Editing a post when the event is completed, cancelled, or deleted raises `event_not_editable`.
* **Flow `6.3` / `W61` — Close Event Post:** Current Coordinator calls `POST /api/v1/posts/{id}/close/` $\rightarrow$ sets `post.status = 'closed'`.
* **Flow `6.4` / `W62` — Automatic Post `open`/`full` Sync:** Whenever an assignment is inserted, moved, or cancelled, `trg_50_assignments_after_*` touches `event_posts.updated_at = now()`, firing `trg_01_posts_guard` to flip `status` between `'open'` and `'full'`.

---

### Domain 8: Recruitment & Applications (Workflows `7.1`–`7.24` / `W64`–`W79`)

#### 8A. State Machine & Plain-Language Formulas
1. **Application Status State Machine (`event_applications.status`):**
   $$\text{pending} \longrightarrow \text{accepted} \;\big|\; \text{waitlisted} \;\big|\; \text{rejected} \;\big|\; \text{withdrawn} \;\big|\; \text{expired}$$
   $$\text{waitlisted} \longrightarrow \text{accepted} \;\big|\; \text{rejected} \;\big|\; \text{withdrawn} \;\big|\; \text{expired}$$
   $$\text{accepted} \longrightarrow \text{withdrawn} \;\big|\; \text{expired}$$
   $$\text{rejected}, \;\text{withdrawn}, \;\text{expired} \longrightarrow (\text{Terminal — no further transitions})$$

2. **Remaining Capacity Formula (`application_remaining_capacity(p_event, p_post)`):**
   $$\text{EventRem} = \begin{cases} \infty & \text{if } \text{Event.max\_participants IS NULL} \\ \text{Event.max\_participants} - \text{Count}(\text{accepted applications on Event}) & \text{otherwise} \end{cases}$$
   $$\text{PostRem} = \begin{cases} \infty & \text{if } p\_post \text{ IS NULL} \\ \text{Post.required\_headcount} - \text{Count}(\text{active assignments on Post}) - \text{Count}(\text{accepted unassigned apps on Post}) & \text{otherwise} \end{cases}$$
   $$\text{RemainingCapacity} = \begin{cases} \text{NULL (Unlimited)} & \text{if } \text{EventRem} = \infty \;\text{AND}\; \text{PostRem} = \infty \\ \max\big(0, \;\min(\text{EventRem}, \text{PostRem})\big) & \text{otherwise} \end{cases}$$

3. **Schedule Conflict Detection Formula (`user_has_schedule_conflict`):**
   $$\text{ConflictExists}(\text{User}, \text{Event}) = \exists \text{ Assignment } A \text{ where } A.\text{user\_id} = \text{User.id} \;\text{AND}\; A.\text{status} \ne \text{'cancelled'} \;\text{AND}\; A.\text{event\_id} \ne \text{Event.id} \;\text{AND}\; \text{tstzrange}(A.\text{schedule\_start}, A.\text{schedule\_end}, \text{'[)'}) \;\mathbf{\&\&}\; \text{tstzrange}(\text{Event.start\_at}, \text{Event.end\_at}, \text{'[)'})$$

#### 8B. Step-by-Step Operational Flows
* **Flow `7.4`–`7.8`, `7.13`–`7.24` / `W64`–`W68`, `W74`–`W78` — Submit Application (`browse`, `qr_walkin`, or `invite`):**
  * **Role:** Volunteer (`browse`), Walk-in Volunteer (`qr_walkin`), or Current Coordinator (`invite`).
  * **Steps:**
    1. Caller submits `POST /api/v1/events/{id}/apply/` (or `POST /api/v1/qr/redeem/` for `'walkin_registration'`).
    2. PostgreSQL trigger `trg_01_applications_before_insert` locks `events` (`FOR UPDATE` — serializing concurrent applicants **`18.5`**) and runs 9 sequential gates:
       * **Gate 1 (`7.17` / `W76`):** Event exists and `deleted_at IS NULL` (else `event_not_found` $\rightarrow$ HTTP `404`).
       * **Gate 2 (`7.18` / `W76`):** `event.status in ('published', 'active')` (else `event_not_open`).
       * **Gate 3 (`7.14` / `W75`):** `application_deadline IS NULL OR now() <= application_deadline` (else `deadline_passed`).
       * **Gate 4 (`7.19`):** `now() <= event.end_at` (else `event_ended`).
       * **Gate 5 (`7.16` / `W77`):** Applicant `account_status == 'active'` (else `account_blocked`).
       * **Gate 6 (`7.6` / `W66`):** Actor is applicant themselves, or event manager (required when `source == 'invite'`).
       * **Gate 7 (`7.20`):** If `post_id` given, post belongs to `event_id` (`fk_applications_post_event`) and `post.status != 'closed'` (else `post_closed`).
       * **Gate 8 (`7.15` / `W78`):** `user_has_schedule_conflict()` is `FALSE` (else `schedule_conflict`).
       * **Gate 9 (`7.13` / `W74`):** No active application (`pending`/`accepted`/`waitlisted`) exists for `(event_id, user_id)` (`uq_event_application_active`).
    3. **Walk-In Token Consumption (`7.5`, `7.21` / `W65`, `W147`):** If `source == 'qr_walkin'`, verifies `event.qr_registration_enabled == TRUE` (else `walkin_disabled`) and calls `consume_qr_token(qr_token_id, 'walkin_registration')`.
    4. **Conditions Snapshot (`7.24`):** Populates `conditions_snapshot` JSONB with the event's support and compensation flags + `onboarding_version`.
    5. **Initial Status & Auto-Decision (`7.7`, `7.8` / `W67`, `W68`):**
       * If `source == 'qr_walkin'` or `event.acceptance_mode == 'manual'`: `status = 'pending'`.
       * If `event.acceptance_mode == 'auto'` and `source != 'qr_walkin'`: evaluates `application_remaining_capacity(event_id, post_id)`. If `NULL` or $> 0$, sets `status = 'accepted'` and `decided_at = now()`; otherwise sets `status = 'waitlisted'`.
    6. **Auto-Assignment Trigger (`trg_50_applications_after`):** If `status == 'accepted'` and `event.auto_assign_enabled == TRUE`, automatically calls `create_assignment_from_application(NEW.id, NULL)`.

* **Flow `7.9`–`7.12`, `7.22`–`7.23` / `W69`–`W73`, `W79` — Accept, Reject, Waitlist, Withdraw, or Expire Application:**
  * **Manual Accept (`7.9` / `W69`):** Current Coordinator (`C06`) calls `POST /api/v1/applications/{id}/accept/`. Trigger `trg_01_applications_before_update` verifies actor is manager, `decided_by_id != user_id` (`7.23`), locks `events`, checks `application_remaining_capacity() > 0` (else raises `capacity_full`), sets `status = 'accepted'`, `decided_by_id`, `decided_at`, and `trg_50_applications_after` triggers auto-assignment if enabled.
  * **Manual Reject (`7.10` / `W70`) & Waitlist (`7.11` / `W71`):** Current Coordinator updates `status` to `'rejected'` or `'waitlisted'`.
  * **Volunteer Withdraw (`7.11` / `W72`, `W79`):** Applicant (or Event Manager) calls `POST /api/v1/applications/{id}/withdraw/`. Sets `status = 'withdrawn'`. `trg_50_applications_after` automatically cancels any active assignment (`status = 'cancelled'`, `cancel_reason = 'application withdrawn'`), which cascades to `attendance`.

---

### Domain 9: Smart Assignment & Team Grouping Engine (Workflows `8.1`–`8.15` / `W80`–`W93`)

#### 9A. State Machine & Plain-Language Formulas
1. **Assignment Status State Machine (`assignments.status`):**
   $$\text{assigned} \longrightarrow \text{confirmed} \;\big|\; \text{completed} \;\big|\; \text{cancelled}$$
   $$\text{confirmed} \longrightarrow \text{completed} \;\big|\; \text{cancelled}$$
   $$\text{completed}, \;\text{cancelled} \longrightarrow (\text{Terminal — no further transitions})$$

2. **Post Eligibility & Priority Matching Formula (`create_assignment_from_application`):**
   Among all posts $P$ on $\text{Event}$ with $P.\text{status} == \text{'open'}$, select the first post ordered by $(P.\text{priority ASC}, P.\text{id ASC})$ satisfying:
   $$\text{PostEligible}(P, \text{App}, \text{User}) = \begin{cases} (\text{App.post\_id IS NULL} \lor P.\text{id} == \text{App.post\_id}) & \text{AND} \\ (\text{cardinality}(P.\text{required\_skills}) == 0 \lor P.\text{required\_skills} \cap \text{User.skills} \ne \emptyset) & \text{AND} \\ \big(P.\text{physical\_level} \in \{\text{'none'}, \text{'light'}\} \lor (P.\text{physical\_level} == \text{'medium'} \land \text{User.physical\_ok}) \lor (P.\text{physical\_level} == \text{'heavy'} \land \text{User.can\_lift\_heavy})\big) & \text{AND} \\ (P.\text{new\_volunteers\_allowed} \lor \neg\text{User.new\_to\_volunteer}) & \text{AND} \\ (\text{ActiveAssignments}(P) < P.\text{required\_headcount}) \end{cases}$$

3. **Group Numbering & Leader Selection Formula:**
   When $\text{Event.group\_size} > 0$:
   $$\text{group\_code} = \text{'G'} \;\Vert\; \min\Big\{g \in \{1 \dots N+1\} \;\Big|\; \text{Count}(\text{Active Assignments in Event with group\_code} = \text{'G'} \Vert g) < \text{Event.group\_size}\Big\}$$
   $$\text{is\_group\_leader} = \text{User.has\_leader\_experience} \;\text{AND}\; \big(\text{Event.leader\_strategy} == \text{'first\_experienced'} \lor P.\text{leader\_needed}\big) \;\text{AND}\; \neg\exists(\text{Active Leader in } (\text{Event}, \text{group\_code}))$$

#### 9B. Step-by-Step Operational Flows
* **Flow `8.1`–`8.2`, `8.9`–`8.10` / `W80`–`W81` — Single & Batch Auto-Assignment (`run_auto_assignment`):**
  * **Role:** Current Coordinator (`C08`) or System Trigger.
  * **Steps:**
    1. Coordinator calls `POST /api/v1/events/{id}/assignments/auto-run/` $\rightarrow$ service executes `SELECT run_auto_assignment(%s, %s)` with `[event.id, request.user.id]`.
    2. PostgreSQL loops over all `'accepted'` unassigned applications ordered by `decided_at, id` and calls `create_assignment_from_application(app_id, NULL)`.
    3. For each application, if a matching post is found and no schedule conflict exists, inserts `assignments` (`assigned_by = 'auto'`, `assigned_by_user_id = NULL`, `status = 'assigned'`).
    4. **After-Insert Trigger (`trg_50_assignments_after_insert` — Flow `9.1` / `W94`):** Automatically creates (or resets) the volunteer's `attendance` row in `status = 'expected'` with `walk_in_flag = (app.source == 'qr_walkin')`, and updates `event_posts` (`open`/`full`).

* **Flow `8.3`–`8.4`, `8.11`–`8.14` / `W82`–`W84`, `W90`–`W92` — Manual Assignment, Move & Regroup (`assign_manually`):**
  * **Role:** Current Coordinator (`C08`) or Admin.
  * **Steps:**
    1. Coordinator calls `POST /api/v1/events/{id}/assignments/manual/` with `{"application_id": ..., "post_id": ..., "group_code": ..., "is_group_leader": ...}`.
    2. Service calls `SELECT assign_manually(%s, %s, %s, %s, %s)`.
    3. If an active assignment already exists for `application_id`, updates `post_id`, `group_code`, and `is_group_leader`; otherwise inserts a new assignment (`assigned_by = 'coordinator'` or `'admin'`).
    4. **Database Guards:**
       * **Guard `8.13` / `W91`:** Application must be `'accepted'` (else `invalid_state`).
       * **Guard `8.11` / `W92`:** Target post must be open and have remaining capacity (else `post_closed` or `capacity_full`).
       * **Guard `8.10`:** At most one active leader per `(event_id, group_code)` (`uq_assignment_group_leader`).
       * **Guard `8.12` / `W90`:** Volunteer cannot hold an overlapping active assignment (`ex_assignments_no_overlap`).

* **Flow `8.5`–`8.7`, `8.15` / `W85`–`W87`, `W93` — Confirm or Cancel Assignment:**
  * **Volunteer Confirm (`8.5` / `W85`):** Assigned volunteer calls `POST /api/v1/assignments/{id}/confirm/`. Updates `status = 'confirmed'`. Trigger `trg_01_assignments_before_update` verifies `app_user_id() == user_id` and sets `confirmed_at = now()`.
  * **Cancel Assignment (`8.6`–`8.7` / `W86`–`W87`, `W93`):** Volunteer or Current Coordinator calls `POST /api/v1/assignments/{id}/cancel/` with `{"reason": "..."}`.
    * If `OLD.status == 'completed'`, trigger raises `invalid_transition` (**`8.7` / `W93`**).
    * Otherwise sets `status = 'cancelled'`, `cancelled_at = now()`, `cancel_reason = reason`. After-trigger sets `'expected'` attendance to `'cancelled'` and refreshes post capacity (`full -> open`).

---

### Domain 10: Pre-Work Digital Onboarding (Workflows `12.1`–`12.7` / `W122`–`W125`)

#### 10A. Plain-Language Formula
$$\text{HasValidOnboardingAck}(\text{User}, \text{Event}) = \neg\text{Event.require\_onboarding\_ack} \;\text{OR}\; \exists \text{ Ack } O \text{ where } O.\text{user\_id} = \text{User.id} \;\text{AND}\; O.\text{event\_id} = \text{Event.id} \;\text{AND}\; O.\text{onboarding\_version} == \text{Event.onboarding\_version}$$

#### 10B. Step-by-Step Operational Flows
* **Flow `12.1` — View Onboarding Briefing:** Accepted/pending/waitlisted volunteer reads `event.onboarding_text` and `event.onboarding_version`.
* **Flow `12.2`–`12.7` / `W122`–`W125` — Acknowledge Onboarding (`app_tick`):**
  * Volunteer calls `POST /api/v1/events/{id}/onboarding/acknowledge/`.
  * Service inserts `OnboardingAcknowledgments(user=request.user, event=event, onboarding_version=event.onboarding_version, method="app_tick")`.
  * **Trigger `trg_01_onboarding_before_insert` Guards:**
    * **Guard `12.6`:** Event must not be deleted, completed, or cancelled (`event_not_open`).
    * **Guard `12.3` / `W125`:** `onboarding_version` must equal `event.onboarding_version` (`stale_onboarding_version`).
    * **Guard `12.5`:** User must hold an active application (`pending`, `accepted`, or `waitlisted`) on the event (`not_applicant`).
    * **Guard `12.7`:** Rows in `onboarding_acknowledgments` are strictly append-only (`trg_01_onboarding_append_only`).

---

### Domain 11: QR Token Management (Workflows `11.1`–`11.11` / `W142`–`W149`)

#### 11A. Plain-Language Formulas
1. **QR Token Generation & Hashing Formula:**
   $$\text{RawToken} = \text{secrets.token\_urlsafe}(32), \qquad \text{token\_hash} = \text{SHA256\_Hex}(\text{RawToken}) \quad (\text{64 hex chars})$$

2. **QR Token Read-Only Validity Formula (`qr_token_status(p_token_hash)`):**
   $$\text{TokenStatus}(\text{Token}, \text{Event}) = \begin{cases} (\text{FALSE}, \text{'event\_deleted'}) & \text{if } \text{Event.deleted\_at IS NOT NULL} \\ (\text{FALSE}, \text{'event\_not\_open'}) & \text{if } \text{Event.status} \notin \{\text{'published'}, \text{'active'}\} \\ (\text{FALSE}, \text{'revoked'}) & \text{if } \text{Token.revoked\_at IS NOT NULL} \\ (\text{FALSE}, \text{'expired'}) & \text{if } \text{Token.expires\_at} \le \text{now}() \\ (\text{FALSE}, \text{'max\_uses\_reached'}) & \text{if } \text{Token.max\_uses IS NOT NULL} \;\text{AND}\; \text{Token.used\_count} \ge \text{Token.max\_uses} \\ (\text{TRUE}, \text{'ok'}) & \text{otherwise} \end{cases}$$

#### 11B. Step-by-Step Operational Flows
* **Flow `11.1`–`11.3`, `11.9`–`11.10` / `W142`–`W144` — Generate QR Token (`checkin`, `walkin_registration`, `join_event`):**
  * Current Coordinator (`C09`) calls `POST /api/v1/events/{id}/qr/` with `{"purpose": ..., "max_uses": ..., "ttl_minutes": ...}`.
  * Service generates `raw_token`, computes `token_hash`, and inserts `QrTokens`.
  * Trigger `trg_01_qr_guard` verifies event is open, caller is manager, and (if `purpose == 'walkin_registration'`) `event.qr_registration_enabled == TRUE` (else raises `walkin_disabled`). Returns `raw_token` **once** to display as a QR code.
* **Flow `11.4` / `W145` — Preview QR Token (`qr_token_status`):**
  * Guest or Volunteer calls `POST /api/v1/qr/resolve/` with `{"token": raw_token}`. Service hashes `raw_token` and calls `SELECT * FROM qr_token_status(%s)`. Returns validity and event preview without incrementing `used_count`.
* **Flow `11.5`–`11.8` / `W146`–`W149` — Redeem QR Token (`qr_check_in` / `qr_walkin_apply`) & Revoke Token:**
  * Volunteer calls `POST /api/v1/qr/redeem/` with `{"token": raw_token}`.
  * Service checks `qr_token_status(token_hash)` and dispatches by `purpose`:
    * If `purpose == 'checkin'`: calls `SELECT qr_check_in(token_hash, request.user.id)`.
    * If `purpose == 'walkin_registration'`: calls `SELECT qr_walkin_apply(token_hash, request.user.id)`.
  * `consume_qr_token()` atomically increments `used_count` only when the check-in or walk-in application actually occurs.
  * Coordinator can revoke any active token via `POST /api/v1/qr/{id}/revoke/` (`revoked_at = now()`).

---

### Domain 12: Attendance & Non-Geo Check-In / Roll-Call (Workflows `9.1`–`9.16` / `W94`–`W95`, `W110`–`W112`, `W116`–`W121`)

#### 12A. State Machine & Plain-Language Formulas
1. **Attendance Status State Machine (`attendance.status`):**
   $$\text{expected} \longrightarrow \text{checked\_in} \;\big|\; \text{absent} \;\big|\; \text{cancelled}$$
   $$\text{absent} \longrightarrow \text{checked\_in} \;\big|\; \text{expected}$$
   $$\text{checked\_in} \longrightarrow \text{completed} \;\big|\; \text{expected } (\text{only when Coordinator rejects a pending Geo check-in})$$
   $$\text{cancelled} \longrightarrow \text{expected } (\text{when volunteer is re-assigned})$$
   $$\text{completed} \longrightarrow (\text{Terminal})$$

2. **Universal Check-In Gate Formula (`trg_01_attendance_guard`):**
   $$\text{CanCheckIn}(\text{User}, \text{Event}, \text{Attendance}) = (\text{Event.deleted\_at IS NULL}) \;\text{AND}\; (\text{Event.status} == \text{'active'}) \;\text{AND}\; (\text{Assignment.status} \in \{\text{'assigned'}, \text{'confirmed'}\}) \;\text{AND}\; \text{HasValidOnboardingAck}(\text{User}, \text{Event})$$

#### 12B. Step-by-Step Operational Flows
* **Flow `9.2`–`9.5`, `9.10`, `9.16` / `W95`, `W120`–`W121` — Volunteer QR Scan Check-In (`qr_check_in`):**
  * Volunteer scans coordinator's `'checkin'` QR code $\rightarrow$ calls `SELECT qr_check_in(token_hash, request.user.id)`.
  * **Branch `9.3` / `W121` (Idempotent Repeat Scan):** If `attendance.status in ('checked_in', 'completed')`, returns existing `attendance.id` immediately without consuming another QR token use.
  * **Branch `9.2` (First Scan):** Updates `attendance` to `status = 'checked_in'`, `method = 'qr_scan'`, `qr_token_id = token.id`, `checkin_at = now()`. Trigger `trg_01_attendance_guard` verifies `CanCheckIn()` and calls `consume_qr_token(qr_token_id, 'checkin')`.
* **Flow `9.6` / `W110` — Coordinator Manual / Roll-Call Check-In (`coordinator_manual`):**
  * Current Coordinator (`C10`) verifies the volunteer in person (or scans the volunteer's `users.uuid` badge) and calls `POST /api/v1/events/{id}/check-in/` with `{"user_id": volunteer.id, "note": "..."}` (note: raw QR `token` is rejected on this endpoint).
  * Service updates `attendance` with `status = 'checked_in'`, `method = 'coordinator_manual'`, `recorded_by_user_id = request.user.id`, `checkin_at = timezone.now()`. Trigger verifies `is_event_manager(event_id, recorded_by_user_id)` and `CanCheckIn()`.
* **Flow `9.11` / `W112` — Check-Out:**
  * Current Coordinator (or Volunteer) calls `POST /api/v1/events/{id}/check-out/` on a `'checked_in'` row $\rightarrow$ sets `checkout_at = timezone.now()` (`ck_attendance_checkout` enforces `checkout_at >= checkin_at`).
* **Flow `9.12` / `W111` — Coordinator Marks Volunteer Absent:**
  * Current Coordinator calls `POST /api/v1/events/{id}/mark-absent/` with `{"user_id": volunteer.id, "note": "..."}` on an `'expected'` row $\rightarrow$ sets `status = 'absent'`. (Blocked if already `'checked_in'` or `'completed'`).

---

### Domain 13: GPS Geolocation Check-In & Coordinator Confirmation Queue (Workflows `10.1`–`10.17` / `W96`–`W109`, `W113`–`W115`, `W119`)

#### 13A. State Machine & Plain-Language Formulas
1. **Geo Confirmation Status State Machine (`attendance.confirmation_status`):**
   $$\text{not\_required} \longrightarrow \text{pending} \quad (\text{On accepted Geo check-in when } \text{Event.require\_checkin\_confirmation} == \text{TRUE})$$
   $$\text{pending} \longrightarrow \text{confirmed} \;\big|\; \text{rejected}$$
   $$\text{rejected} \longrightarrow \text{pending } (\text{when volunteer retries Geo check-in}) \;\big|\; \text{not\_required } (\text{when checked in via QR/Manual})$$

2. **Server-Side Haversine Great-Circle Distance Formula (`geo_distance_m`):**
   Given event coordinates $(\phi_1, \lambda_1)$ and volunteer GPS coordinates $(\phi_2, \lambda_2)$ in degrees, with Earth radius $R = 6,371,000\text{ m}$:
   $$d = 2 R \arcsin\left(\min\left(1.0, \;\sqrt{\sin^2\left(\frac{\text{rad}(\phi_2 - \phi_1)}{2}\right) + \cos(\text{rad}(\phi_1))\cos(\text{rad}(\phi_2))\sin^2\left(\frac{\text{rad}(\lambda_2 - \lambda_1)}{2}\right)}\right)\right)$$
   $$\text{EffectiveRadius}(\text{Event}) = \text{COALESCE}\big(\text{Event.geo\_radius\_m}, \;\text{setting\_int}(\text{'geo\_default\_radius\_m'})\big) \quad (\text{Default} = 150\text{ m})$$

3. **13-Branch Geo Check-In Evaluation Pipeline Formula (`geo_check_in` stored function):**
   Evaluated in exact deterministic priority order (every branch logs an immutable row in `attendance_geo_attempts`):
   $$\text{out\_result} = \begin{cases} \text{RAISE } \text{'event\_not\_found'} & \text{if Event does not exist or } \text{deleted\_at IS NOT NULL} \\ \text{'event\_not\_active'} & \text{if } \text{Event.status} \ne \text{'active'} \\ \text{'geo\_disabled'} & \text{if } \neg\text{Event.geo\_checkin\_enabled} \;\text{OR}\; \text{Event.latitude IS NULL} \\ \text{'not\_assigned'} & \text{if no assignment in } \{\text{'assigned'}, \text{'confirmed'}\} \;\text{OR}\; \text{no attendance row} \\ \text{'not\_eligible'} & \text{if } \text{Application.source} == \text{'qr\_walkin'} \;\text{OR}\; \text{Attendance.walk\_in\_flag} == \text{TRUE} \\ \text{'already\_checked\_in'} & \text{if } \text{Attendance.status} \in \{\text{'checked\_in'}, \text{'completed'}\} \\ \text{'window\_closed'} & \text{if } \text{now}() < \text{Event.start\_at} - \text{geo\_checkin\_opens\_before\_min} \;\text{OR}\; \text{now}() > \text{Event.end\_at} \\ \text{'onboarding\_required'} & \text{if } \neg\text{HasValidOnboardingAck}(\text{User}, \text{Event}) \\ \text{'invalid\_fix'} & \text{if } \text{lat/lon IS NULL} \;\text{OR}\; \text{lat} \notin [-90, 90] \;\text{OR}\; \text{lon} \notin [-180, 180] \\ \text{'mock\_location'} & \text{if } \text{p\_is\_mocked} == \text{TRUE} \\ \text{'low\_accuracy'} & \text{if } \text{accuracy\_m IS NULL} \;\text{OR}\; \text{accuracy\_m} > \text{setting\_int}(\text{'geo\_max\_accuracy\_m'}) \; (100\text{ m}) \\ \text{'stale\_fix'} & \text{if } \text{captured\_at} < \text{now}() - 60\text{ s} \;\text{OR}\; \text{captured\_at} > \text{now}() + 60\text{ s} \\ \text{'outside\_geofence'} & \text{if } d > \text{EffectiveRadius}(\text{Event}) \\ \text{'accepted'} & \text{if } d \le \text{EffectiveRadius}(\text{Event}) \end{cases}$$

#### 13B. Step-by-Step Operational Flows
* **Flow `10.1`–`10.12` / `W96`–`W109` — Volunteer Submits Geo Check-In (`geo_check_in`):**
  * **Role:** Assigned Pre-Scheduled Volunteer.
  * **Steps:**
    1. Volunteer sends `POST /api/v1/events/{id}/geo-check-in/` with `{latitude, longitude, accuracy_m, captured_at, is_mocked}`.
    2. Service executes `SELECT * FROM geo_check_in(%s, %s, %s, %s, %s, %s, %s)` with `[event.id, request.user.id, latitude, longitude, accuracy_m, captured_at, is_mocked]`.
    3. PostgreSQL evaluates the 13-branch pipeline above, inserts the attempt into `attendance_geo_attempts`, and if `out_result == 'accepted'`, updates `attendance` (`status = 'checked_in'`, `method = 'geo'`, `geo_verified = TRUE`, `checkin_distance_m = out_distance_m`, `confirmation_status = 'pending'` if `require_checkin_confirmation` else `'not_required'`).
    4. If `out_result` is `'accepted'` or `'already_checked_in'`, BFF returns HTTP `200 OK` with `{result, attendance_id, distance_m, confirmation_status}`. If `out_result` is any of the 11 rejection codes, BFF commits the transaction (so the `attendance_geo_attempts` telemetry row is saved!) and returns HTTP `400 Bad Request` with the friendly error message and `{result, distance_m}`.

* **Flow `10.13`–`10.16` / `W113`–`W115`, `W119` — Coordinator Confirms or Rejects Pending Geo Check-In (`confirm_attendance` / `reject_attendance`):**
  * **Role:** Current Coordinator (`C10`) or Admin.
  * **Confirm (`10.13` / `W113`):** Coordinator calls `POST /api/v1/attendance/{id}/confirm/` with `{"note": "..."}` $\rightarrow$ calls `SELECT confirm_attendance(attendance_id, request.user.id, note)`.
    * Guard `10.16` / `W119`: Blocks self-confirmation (`confirmed_by_user_id <> user_id`).
    * Sets `attendance.confirmation_status = 'confirmed'` and `attendance_geo_attempts.review_status = 'confirmed'`.
  * **Reject (`10.14` / `W114`):** Coordinator calls `POST /api/v1/attendance/{id}/reject/` with `{"reason": "..."}` (non-empty reason required) $\rightarrow$ calls `SELECT reject_attendance(attendance_id, request.user.id, reason)`.
    * Resets `attendance.status = 'expected'`, `confirmation_status = 'rejected'`, and trigger `trg_01_attendance_guard` automatically clears `checkin_at`, `method`, `checkin_latitude`, `checkin_longitude`, `checkin_accuracy_m`, `checkin_distance_m`, and `geo_verified` on `attendance` (while keeping the rejected coordinates in `attendance_geo_attempts`).
  * **Volunteer Retry (`10.15` / `W115`):** Because `attendance.status` is back to `'expected'`, the volunteer can walk closer to the venue and submit a fresh `geo_check_in()` or scan the coordinator's QR code.

---

### Domain 14: Two-Way Verifiable Feedback (Workflows `13.1`–`13.10` / `W126`–`W131`)

#### 14A. Plain-Language Formula
$$\text{CanSubmitFeedback}(\text{Rater}, \text{Target}, \text{Event}, \text{Direction}) = (\text{Event.status} == \text{'completed'}) \;\text{AND}\; (\text{score} \in \{1..5\}) \;\text{AND}\; \text{IsValidTagArray}(\text{tags}) \;\text{AND}\; \begin{cases} \text{Target IS NULL} \;\text{AND}\; \text{CompletedAttendance}(\text{Rater}, \text{Event}) & \text{if } \text{Direction} == \text{'volunteer\_to\_event'} \\ \text{Target} \in \{\text{owner\_id}, \text{current\_coordinator\_id}\} \;\text{AND}\; \text{CompletedAttendance}(\text{Rater}, \text{Event}) & \text{if } \text{Direction} == \text{'volunteer\_to\_coordinator'} \\ \text{Rater} \in \{\text{owner\_id}, \text{current\_coordinator\_id}\} \;\text{AND}\; \text{HadNonCancelledAssignment}(\text{Target}, \text{Event}) & \text{if } \text{Direction} == \text{'coordinator\_to\_volunteer'} \end{cases}$$

#### 14B. Step-by-Step Operational Flows
* **Flow `13.1`–`13.9` / `W126`–`W128`, `W130`–`W131` — Submit Feedback (3 Directions & Guards):**
  * Caller submits `POST /api/v1/events/{id}/feedback/` with `{direction, target_user_id, score, tags, comment}`.
  * Service normalizes `tags` via `NormalizeTags()` and inserts into `Feedback`.
  * **Trigger `trg_01_feedback_guard` & Constraint Guards:**
    * **Guard `13.4` / `W131`:** Event must be `'completed'` (`event_not_completed`).
    * **Guard `13.6`:** `target_user_id != rater_user_id` (`ck_feedback_not_self`).
    * **Guard `13.7`–`13.8`:** Verifies rater attended (`rater_not_participant`) or target volunteer held a non-cancelled assignment (`target_not_participant`).
    * **Guard `13.5` / `W130`:** Partial unique indexes `uq_feedback_event_once` and `uq_feedback_user_once` block duplicate ratings.
    * **Guard `13.9`:** Feedback content is immutable after insert (`immutable: submitted feedback cannot be edited`).

---

### Domain 15: Admin Watchman Moderation & Governance (Workflows `14.1`–`14.14` / `W47`–`W49`, `W129`, `W132`–`W141`)

#### 15A. Plain-Language Formula (Insert-to-Apply Moderation)
$$\text{ModerationValid}(\text{Admin}, \text{Action}) = \text{is\_admin\_user}(\text{Admin.id}) \;\text{AND}\; (\text{TargetUser} \ne \text{Admin.id}) \;\text{AND}\; \big(\neg\text{is\_admin\_user}(\text{TargetUser}) \lor \text{Action} == \text{'user\_warning'}\big) \;\text{AND}\; \Big(\text{Action} \in \{\text{'account\_close'}, \text{'account\_reinstate'}, \text{'event\_delete'}, \text{'event\_restore'}\} \implies \text{Admin.is\_superuser}\Big)$$

#### 15B. Step-by-Step Operational Flows
* **Flow `14.1`–`14.14` / `W47`–`W49`, `W129`, `W132`–`W141` — Execute Moderation Action via `moderation_actions` Insert:**
  * **Role:** Admin (`A07`, `A09`: `user_warning`, `user_block`, `user_unblock`, `event_cancel`, `feedback_hide`) or Super Admin (`A08`, `A10`: `account_close`, `account_reinstate`, `event_delete`, `event_restore`).
  * **Steps:**
    1. BFF checks whether the action requires `is_superuser` (`A08`, `A10`); if a regular Admin requests a Super Admin action, return HTTP `404`.
    2. Service inserts a single row into `ModerationActions(admin_user=request.user, target_user=..., event=..., feedback=..., action_type=..., reason=..., expires_at=...)`.
    3. **Before-Insert Trigger (`trg_01_moderation_before_insert`) & Constraints:**
       * Verifies `is_admin_user(admin_user_id)` (**`14.14` / `W141`**), `target_user_id != admin_user_id` (**`14.10` / `W139`**), target is not an admin unless `action_type == 'user_warning'` (**`14.11` / `W140`**), and non-empty `reason` for destructive actions (**`14.12`**).
    4. **After-Insert Trigger (`trg_50_moderation_after_insert` — Flow `14.14`):** Sets `app.privileged_write = 'on'`, automatically applies the exact side effect on `users`, `events`, or `feedback` (syncing `users.is_active` via `trg_01_users_guard` and firing event cancellation cascades if `action_type == 'event_cancel'`), and resets `app.privileged_write = 'off'`.

---

### Domain 16: Scheduled System Maintenance Jobs (Workflows `15.1`–`15.4` / `W162`–`W165`)

| Flow ID | Stored Function Called | Schedule | Step-by-Step Action & Formula |
| :--- | :--- | :--- | :--- |
| **`15.1` / `W165`** | `SELECT release_expired_blocks()` | Every 5 mins (and lazily on auth) | Sets `app.privileged_write = 'on'`, updates `users` where `account_status = 'blocked' AND blocked_until IS NOT NULL AND blocked_until <= now()` back to `account_status = 'active', blocked_until = NULL` (which auto-syncs `is_active = TRUE`). |
| **`15.2` / `W164`** | `SELECT expire_stale_applications()` | Hourly | Updates `event_applications` where `status IN ('pending', 'waitlisted')` and `event.end_at < now()` to `status = 'expired'`. |
| **`15.3` / `W162`** | `SELECT purge_expired_otps()` | Hourly | Deletes rows from `auth_otp` where `expires_at < now() - INTERVAL '1 day'` or `created_at < now() - INTERVAL '1 day'`. |
| **`15.4` / `W163`** | `SELECT purge_geo_evidence('90 days')` | Daily | Nulls `latitude`/`longitude` on `attendance_geo_attempts` and `checkin_latitude`/`checkin_longitude` on `attendance` older than 90 days while preserving `distance_m` and `result`. |

---

### Domain 17: Automatic Audit Trail & Append-Only Compliance (Workflows `16.1`–`16.5` / `W167`–`W168`)

* **Flow `16.1`–`16.2` / `W168` — Secret- and Coordinate-Redacted Diff Auditing (`trg_audit_row`):**
  * Fires automatically `AFTER INSERT OR UPDATE` on all 13 operational tables (`users`, `volunteer_availability_rules`, `volunteer_availability_exceptions`, `coordinator_profiles`, `user_verification_images`, `events`, `event_posts`, `qr_tokens`, `event_applications`, `assignments`, `attendance`, `feedback`, `moderation_actions`).
  * Automatically strips `phone_enc`, `password`, `emergency_contact_phone_enc`, `token_hash`, `code_hash`, `checkin_latitude`, and `checkin_longitude`.
  * On `UPDATE`, ignores noise columns (`updated_at`, `last_login`), skips no-op updates (`v_old == v_new`), and stores **only** the changed key-value pairs in `before_data` and `after_data` alongside `app_user_id()` and `app_ip()`.
* **Flow `16.3`–`16.5` / `W167` — Append-Only Table Protection (`trg_block_mutation`):**
  * Blocks `UPDATE`, `DELETE`, and `TRUNCATE` on `audit_logs`, and blocks `UPDATE`/`DELETE` on `event_coordinator_history`, `moderation_actions`, `onboarding_acknowledgments`, and `attendance_geo_attempts` (except review status updates and 90-day coordinate nulling on `attendance_geo_attempts`).

---

### Domain 18: Operational Dashboards, Public Browsing & Reporting Views (Workflows `7.1`–`7.3`, `17.1`–`17.10` / `W152`–`W161`)

All 11 PostgreSQL views are queried directly by the BFF to power single-request mobile and web screens:

| Flow ID | SQL View Queried | Role & BFF Screen | Data Returned |
| :--- | :--- | :--- | :--- |
| **`7.1`, `17.10` / `W158`–`W159`** | `v_public_events` | Guest / Volunteer — Tab 1 (`Open Shifts`) | Published/active non-deleted events with aggregated `charity_fields` array, `coordinator_name`, and total `spots_remaining`. |
| **`7.3`, `17.6` / `W160`** | `v_event_post_capacity` | Guest / Volunteer / Coordinator | Per-post `required_headcount`, `assigned_count`, and `remaining` capacity (`404` if event is draft and caller is not manager). |
| **`17.2`** | `v_event_summary` | Coordinator / Owner — Tab 3 (`Shift Console`) | Fan-out-free per-event counters: `pending_count`, `accepted_count`, `waitlisted_count`, `assignment_count`, `checked_in_count`, `pending_confirmations`. |
| **`17.5`** | `v_accepted_unassigned` | Coordinator / Owner — Tab 3 (`Shift Console`) | Accepted applicants who do not yet have an active assignment, with their `skills` and capability booleans. |
| **`17.3` / `W157`** | `v_event_checkin_board` / `v_event_checkin_status` | Coordinator / Owner — Tab 3 (`Roll-Call Board`) | Live roster of assigned volunteers with `group_code`, `is_group_leader`, `attendance_status`, `method`, `walk_in_flag`, `checkin_at`, `checkin_distance_m`, and `confirmation_status`. |
| **`17.4` / `W156`** | `v_pending_confirmations` | Coordinator / Owner — Tab 3 (`Geo Queue`) | Queue of geo check-ins with `confirmation_status = 'pending'`, showing coordinates, accuracy, and distance. |
| **`17.9` / `W155`** | `v_event_coordinator_history` | Coordinator / Owner / Admin | Chronological audit log of coordinator handovers and retakes for an event. |
| **`17.1` / `W152`** | `v_admin_dashboard` | Admin / Super Admin — Admin Portal | Single-row global KPI summary across users, verifications, coordinators, events, pending geo confirmations, and 30-day warnings. |
| **`17.7` / `W153`** | `v_user_moderation_summary` | Admin / Super Admin — User Detail | Per-user `warning_count`, `last_warning_at`, `block_count`, and `last_block_at`. |
| **`17.8` / `W154`** | `v_geo_attempts_review` | Admin / Super Admin — Geo Fraud Review | Full telemetry log of all accepted and rejected GPS check-in attempts. |

---

### Domain 19: Error Handling, Concurrency & Idempotency (Workflows `18.1`–`18.7`)

1. **`404-Not-403` Resource Masking (`18.2`):**
   $$\text{HTTP Response} = \begin{cases} \text{404 Not Found} & \text{if resource is hidden (draft/deleted event, other user's private record, or admin endpoint for non-admin)} \\ \text{403 Forbidden} & \text{if resource is visible to caller (e.g., Owner-as-Monitor), but caller currently lacks write authority} \\ \text{400 / 409 / 429} & \text{if business rule, capacity, schedule conflict, or rate limit blocked the action} \end{cases}$$
2. **Friendly Error Translation (`18.1`):** `common/exceptions.py` parses the `<code_prefix>: <message>` raised by PostgreSQL triggers (`capacity_full`, `schedule_conflict`, `deadline_passed`, `onboarding_required`, `qr_token_invalid`, `event_frozen`, `publish_requires_post`, `publish_requires_future_start`, `not_verified`, `otp_rate_limited`, etc.) and maps each to a clean user-facing message without ever exposing SQL or Python stack traces.
3. **Database-Serialized Concurrency & Idempotency (`18.4`–`18.7`):**
   * Concurrent applications lock `events` (`FOR UPDATE`) inside `trg_01_applications_before_insert`.
   * Concurrent assignments lock `events` then `event_posts` (`FOR UPDATE`) in strict order to prevent deadlocks.
   * Repeat QR scans (`qr_check_in`), repeat GPS check-ins (`geo_check_in`), and repeat assignment calls (`create_assignment_from_application`) are all idempotent.

---

### Domain 20: Cross-Cutting Security & Access Control Guards (Workflows `19.1`–`19.10` / `W166`–`W168`)

* **Privilege Escalation Prevention (`19.1`–`19.5` / `W166`):** Enforced at 3 independent layers: (1) BFF allow-list serializers reject privilege fields with HTTP `400`; (2) `ck_users_admin_flags` requires `is_admin = TRUE` whenever `is_staff` or `is_superuser` is `TRUE`; (3) `trg_01_users_guard` raises `permission_denied` if a non-admin session attempts to insert or update privilege or account-status columns.
* **Zero Raw Secrets & Private Media (`19.6`–`19.10`):** Raw phone numbers, raw OTPs, and raw QR tokens are never stored in PostgreSQL; verification images are stored outside public `/media/` in `VERIFICATION_MEDIA_ROOT` and served only through the authenticated Admin review view; and unauthorized probes of admin or private-data routes write `security.red_alert.*` records into `audit_logs` before returning HTTP `404`.

---

## 5. Summary of All 7 State Machines in `v0.5.2`

| # | Entity & Column | Valid Transitions | Terminal States |
| :--- | :--- | :--- | :--- |
| 1 | **User (`account_status`)** | `active` $\leftrightarrow$ `blocked`; `active`/`blocked` $\rightarrow$ `closed`; `closed` $\rightarrow$ `active` (Super Admin reinstate) | None (all states recoverable by Admin/Super Admin) |
| 2 | **Verification Image (`status`)** | `pending` $\rightarrow$ `approved` \| `rejected` | `approved`, `rejected` |
| 3 | **Coordinator Profile (`status`)** | `pending` $\rightarrow$ `approved` \| `revoked`; `approved` $\leftrightarrow$ `suspended`; `approved`/`suspended` $\rightarrow$ `revoked` | `revoked` |
| 4 | **Event (`status`)** | `draft` $\rightarrow$ `published` \| `cancelled`; `published` $\rightarrow$ `active` \| `cancelled`; `active` $\rightarrow$ `completed` \| `cancelled` | `completed`, `cancelled` (frozen) |
| 5 | **Event Post (`status`)** | `open` $\leftrightarrow$ `full` (auto); `open`/`full` $\rightarrow$ `closed` (manual) | `closed` |
| 6 | **Application (`status`)** | `pending` $\rightarrow$ `accepted` \| `waitlisted` \| `rejected` \| `withdrawn` \| `expired`; `waitlisted` $\rightarrow$ `accepted` \| `rejected` \| `withdrawn` \| `expired`; `accepted` $\rightarrow$ `withdrawn` \| `expired` | `rejected`, `withdrawn`, `expired` |
| 7 | **Assignment (`status`)** | `assigned` $\rightarrow$ `confirmed` \| `completed` \| `cancelled`; `confirmed` $\rightarrow$ `completed` \| `cancelled` | `completed`, `cancelled` |
| 8 | **Attendance (`status` & `confirmation_status`)** | `expected` $\rightarrow$ `checked_in` \| `absent` \| `cancelled`; `absent` $\rightarrow$ `checked_in` \| `expected`; `checked_in` $\rightarrow$ `completed` \| `expected` (geo reject); `cancelled` $\rightarrow$ `expected` | `completed` (`confirmed` for geo) |

---

## 6. Eight-Phase Coding Execution Sequence

With all 214 workflows and formulas specified above, we can code the backend and BFF cleanly in 8 sequential phases:

1. **Phase P1 — Core Infrastructure & Security Context (`backend/common/` & `config/settings/`):**
   * Add `uuid = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)` to `apps/accounts/models.py:Users`.
   * Implement `common/db_context.py` + `ATOMIC_REQUESTS = True` (`SET LOCAL app.user_id` and `app.ip` in both middleware and `BlockedAwareTokenAuthentication`).
   * Implement `common/exceptions.py` (PostgreSQL error code translator + `404-not-403` masking + `security.red_alert.*` logger).
   * Implement `common/permissions.py` & `common/utils.py` (HMAC/Fernet helpers, `NormalizeTags()`, JPEG sanitizer).
2. **Phase P2 — Public Read & Browsing BFF (`backend/bff/volunteer/` — Domain 18):**
   * Wire `v_public_events`, `v_event_post_capacity`, and `CharityFields` (`W158`–`W161`) with `404` masking for draft/deleted events.
3. **Phase P3 — OTP Auth, Self Profile, Availability & Public UUID Lookup (`backend/services/otp_service.py`, `bff/auth/`, `bff/volunteer/` — Domains 1, 2, 3):**
   * Wire `request_otp()`, `verify_otp()`, logout, allow-list `/me/` update, charity interests, availability rules/exceptions (`is_user_available`), and `/users/by-uuid/{uuid}/` (`W01`–`W26`, `W150`–`W151`).
4. **Phase P4 — Verification Images & Coordinator Approval (`backend/admin_portal/` & `bff/coordinator/` — Domains 4, 5):**
   * Wire private JPEG upload, admin review, and coordinator apply/approve/suspend/revoke (`W27`–`W40`).
5. **Phase P5 — Event Lifecycle, Posts, Handover & Owner Retake (`backend/bff/coordinator/` — Domains 6, 7):**
   * Wire event CRUD, status transitions, post management, `change_event_coordinator()`, Owner-as-Monitor read-only guard, and Owner Retake (`W41`–`W63`).
6. **Phase P6 — Applications & Smart Assignment Engine (`backend/services/assignment_service.py` & `bff/` — Domains 8, 9):**
   * Wire browse/invite applications, manual accept/reject/waitlist, volunteer withdraw, `run_auto_assignment()`, `assign_manually()`, and shift confirm/cancel (`W64`–`W93`).
7. **Phase P7 — Onboarding, QR Tokens & 4-Path Check-In (`backend/services/qr_service.py`, `geo_service.py` & `bff/checkin/` — Domains 10, 11, 12, 13):**
   * Wire onboarding `app_tick`, QR generation/preview/redemption (`qr_token_status`, `qr_check_in`, `qr_walkin_apply`), GPS check-in (`geo_check_in`), coordinator confirmation queue (`confirm_attendance`, `reject_attendance`), and manual roll-call check-in/out/absent (`W94`–`W125`, `W142`–`W149`).
8. **Phase P8 — Two-Way Feedback, Admin Moderation & Maintenance Commands (`backend/admin_portal/` — Domains 14, 15, 16, 17):**
   * Wire post-completion feedback, insert-to-apply `moderation_actions`, admin dashboard views (`v_admin_dashboard`, `v_geo_attempts_review`, `v_user_moderation_summary`), and the `run_maintenance` management command (`W126`–`W141`, `W152`–`W155`, `W162`–`W168`).