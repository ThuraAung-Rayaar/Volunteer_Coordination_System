# Master Specification & Prompt Rules for PostgreSQL Seeding Script (`seed_data.sql`)

> **Document Status:** Authoritative Technical Specification & LLM Prompt  
> **Target Database:** PostgreSQL 16+ (Docker / Local)  
> **Application:** Volunteer Coordination System (Python / Django REST Framework Stack)  
> **Output Target:** `seed_data.sql` (Raw SQL, zero ORM dependencies)

---

## 1. System Prompt Template (Copy-Paste to LLM)

```text
Act as a Principal PostgreSQL DBA and Senior Backend Systems Engineer.
Generate a comprehensive, idempotent, trigger-compliant raw SQL script named `seed_data.sql`
for the Volunteer Coordination System database.

Strict Requirements:
1. MUST be 100% pure SQL (PostgreSQL dialect). No Python or Django ORM code.
2. All insertions and updates MUST comply with all database constraints and triggers in
   `updated_volunteer_coordination_system_Database.sql`.
3. Adhere strictly to the demographic entity counts and ownership rules detailed below:
   - Exactly 2 Admins (1 Super Admin, 1 Staff Admin).
   - Exactly 5 Approved Coordinators (Distribution: 1 coordinator owns 3 events; 3 coordinators each own 2 events; 1 coordinator owns 1 event).
   - Exactly 10 Events (4 Future events, 6 Past events).
   - Exactly 35 Volunteers (3 are in pending stage to become coordinators; 32 regular volunteers across active, pending verification, warned, and blocked states).
4. Follow the required state machine sequence for transitions (e.g., drafts -> published -> active -> completed)
   so PostgreSQL trigger assertions do not fail.
5. Populate DRF auth tokens (`authtoken_token`) and password hashes for direct web portal and REST API testing.
```

---

## 2. PostgreSQL Session Context & Transaction Rules

### 2.1 Atomic Transaction & Actor Context
PostgreSQL triggers read `app_user_id()` and `app_ip()` which evaluate `current_setting('app.user_id', true)` and `current_setting('app.ip', true)`.

- The entire script MUST run inside a single transaction:
  ```sql
  BEGIN;
  -- Set system context (NULL allows privileged trigger operations during migrations/seeding)
  SELECT set_config('app.user_id', '', true);
  SELECT set_config('app.ip', '127.0.0.1', true);
  ```
- When performing user-scoped actions (e.g., volunteer submitting feedback or admin moderating a record), set the actor ID locally:
  ```sql
  SELECT set_config('app.user_id', '<user_id>', true);
  ```
- Reset to system context immediately after:
  ```sql
  SELECT set_config('app.user_id', '', true);
  ```

### 2.2 Idempotent Reset / Cleanup Strategy
To allow the script to be re-run safely without foreign key conflicts:
```sql
-- Disable triggers temporarily or truncate cascading operational tables
TRUNCATE TABLE 
    moderation_actions,
    feedback,
    attendance_geo_attempts,
    attendance,
    assignments,
    event_applications,
    qr_tokens,
    event_posts,
    event_charity_fields,
    event_coordinator_history,
    events,
    user_verification_images,
    coordinator_profiles,
    volunteer_availability_exceptions,
    volunteer_availability_rules,
    user_charity_interests,
    authtoken_token,
    users
RESTART IDENTITY CASCADE;
```
*(Note: Do NOT truncate `app_settings` or `charity_fields` as they contain core lookup definitions).*

---

## 3. Demographic & Operational Breakdown

### 3.1 Admins (Total: 2)
Both accounts have precomputed PBKDF2 password hashes for web browser login (`AdminDemo123!`) and DRF tokens.

| Name | Phone | Flags | Status | DRF Token |
| :--- | :--- | :--- | :--- | :--- |
| **System Super Admin** | `+959100000001` | `is_superuser=TRUE, is_staff=TRUE, is_admin=TRUE` | `active`, `verified` | `a000000000000000000000000000000000000001` |
| **Operations Admin** | `+959100000002` | `is_superuser=FALSE, is_staff=TRUE, is_admin=TRUE` | `active`, `verified` | `a000000000000000000000000000000000000002` |

- **Web Login Password:** `AdminDemo123!`
- **Password Hash (PBKDF2 SHA256):**  
  `pbkdf2_sha256$870000$M09a5eRThWXNk2BX35ZyGz$XfxsJiVBRAQN/9ejvAUapLc1PGY/TQfCIziZ0u0hpvM=`

---

### 3.2 Coordinators (Total: 5)
All 5 coordinators are active, verified users with **approved** coordinator profiles. They strictly divide ownership of the 10 events:

| Coordinator | Name | Phone | Owned Events Count | Owned Event Keys | Approved By |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Coord 1** | Senior Coordinator One | `+959100000011` | **3** | Event 1, Event 2, Event 3 | Super Admin (`+959100000001`) |
| **Coord 2** | Disaster Lead Two | `+959100000012` | **2** | Event 4, Event 5 | Operations Admin (`+959100000002`) |
| **Coord 3** | Youth Lead Three | `+959100000013` | **2** | Event 6, Event 7 | Super Admin (`+959100000001`) |
| **Coord 4** | Eco Lead Four | `+959100000014` | **2** | Event 8, Event 9 | Operations Admin (`+959100000002`) |
| **Coord 5** | Community Lead Five | `+959100000015` | **1** | Event 10 | Super Admin (`+959100000001`) |

**Total Events Owned:** $3 + 2 + 2 + 2 + 1 = 10\text{ events}$.

---

### 3.3 Events (Total: 10: 4 Future, 6 Past)

All events belong to Yangon operational zones with valid coordinates, geofence radiuses (100m – 300m), and charity field bindings.

| ID / Ref | Title | Timing | Status | Owner | Mode & Feature Focus |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Event 1** | Yangon Tech Mentorship Camp | Future (+3d) | `published` | Coord 1 | Auto-accept, 2 open posts (Mentors, Lab Techs) |
| **Event 2** | Urban Flood Emergency Relief | Past (-2d) | `completed` | Coord 1 | Completed shift, 4 attendances, two-way feedback |
| **Event 3** | Inya Lake Cleanup Drive | Past (-7d) | `completed` | Coord 1 | Completed shift, 5 attendances, 1 flagged feedback hidden by admin |
| **Event 4** | First-Aid & Triage Workshop | Future (+7d) | `published` | Coord 2 | Manual acceptance, required onboarding acknowledgment |
| **Event 5** | Cyclone Response Packaging | Past (-14d) | `completed` | Coord 2 | High-headcount logistics, verified attendance |
| **Event 6** | Downtown Community Food Station | Future/Now (-1h to +3h) | `active` | Coord 3 | **Live Real-time Geo Check-in Testbed**: 1 checked-in, 1 outside geofence attempt |
| **Event 7** | School Supplies Sorting Drive | Past (-21d) | `completed` | Coord 3 | Manual coordinator check-in verification |
| **Event 8** | Mangrove Reforestation Day | Future (+14d) | `draft` | Coord 4 | Newly initialized draft, open posts, recruiting not published |
| **Event 9** | Wildlife Trail Maintenance | Past (-30d) | `completed` | Coord 4 | Multi-skill physical event with verified feedback |
| **Event 10** | Monsoon Emergency Shelter Prep | Past (-10d) | `cancelled` | Coord 5 | **Emergency Cancellation Demo**: `cancel_reason='Extreme monsoon flood warning'`, cascaded assignments |

**Summary Verification:** Exactly 4 Future (`published` x2, `active` x1, `draft` x1) and 6 Past (`completed` x5, `cancelled` x1).

---

### 3.4 Volunteers (Total: 35)
Phones: `+959100000021` to `+959100000055`.

1. **Pending Coordinator Applicants (3 Volunteers):**
   - **Volunteers 01, 02, 03** (`+959100000021` to `+959100000023`).
   - Profile in `coordinator_profiles` with `status = 'pending'`, notes: `"Applicant applied via portal, awaiting admin interview"`.
   - Verified accounts with past volunteer experience.

2. **Active Verified Regular Volunteers (20 Volunteers):**
   - **Volunteers 04 to 23** (`+959100000024` to `+959100000043`).
   - `verification_status = 'verified'`, `account_status = 'active'`.
   - Populated across Event Applications, Assignments, Geo Check-ins, and Feedbacks.
   - Varied skills: `ARRAY['first_aid', 'teaching', 'driving']`, blood donor flags, availability rules.

3. **Pending ID Verification Volunteers (5 Volunteers):**
   - **Volunteers 24 to 28** (`+959100000044` to `+959100000048`).
   - `verification_status = 'pending'`, `account_status = 'active'`.
   - Each has an unreviewed entry in `user_verification_images` with `image_type = 'id_license'`, `status = 'pending'`.
   - Appears in the Admin Verification Queue.

4. **Rejected / Unverified Volunteers (3 Volunteers):**
   - **Volunteers 29, 30, 31** (`+959100000049` to `+959100000051`).
   - `verification_status = 'rejected'` or `'none'`.
   - Test that restricted events or coordinator applications reject them.

5. **Warned Volunteers (2 Volunteers):**
   - **Volunteers 32, 33** (`+959100000052`, `+959100000053`).
   - `account_status = 'active'`.
   - Linked to `moderation_actions` with `action_type = 'user_warning'`, reason: `"Repeated unexcused absence on registered shifts"`.

6. **Blocked Volunteers (2 Volunteers):**
   - **Volunteers 34, 35** (`+959100000054`, `+959100000055`).
   - `account_status = 'blocked'`, `blocked_until = now() + interval '30 days'`.
   - Linked to `moderation_actions` with `action_type = 'user_block'`.
   - Test that API calls from these users return HTTP 403 Forbidden.

---

## 4. PostgreSQL Trigger Compliance Rules & Safe Sequencing

The SQL generator **must** follow these sequential stages. Any shortcut will trigger database exceptions.

### Rule 1: Inserting Users & Checking Constraints
- `is_active` MUST equal `(account_status = 'active')`.
- `skills` elements must be lowercase, trimmed, non-empty (e.g., `ARRAY['logistics', 'first_aid']::TEXT[]`).
- `ck_users_donation_consistency`: If `is_willing_to_donate_blood = TRUE`, then `is_willing_to_donate` MUST be `TRUE`.
- `ck_users_emergency_pair`: Either both `emergency_contact_name` and `emergency_contact_phone_enc` are provided, or both are `NULL`.

### Rule 2: Creating Approved Coordinators (`trg_01_coordinator_guard`)
```sql
-- Step 1: Insert profile as 'pending'
INSERT INTO coordinator_profiles (user_id, status, notes)
VALUES (coord_user_id, 'pending', 'Initial coordinator registration');

-- Step 2: Transition to 'approved' by an admin
UPDATE coordinator_profiles
   SET status = 'approved',
       approved_by_id = admin_user_id,
       approved_at = now()
 WHERE user_id = coord_user_id;
```
*(Directly inserting `status = 'approved'` will trigger `invalid_state: a new coordinator profile starts as pending`).*

### Rule 3: Event Lifecycle State Machine (`trg_events_before_insert` & `ck_events_status_timestamps`)
1. **Insert as Draft:**
   - On `INSERT INTO events`, the trigger forces `status := 'draft'` and forces all lifecycle timestamps (`published_at`, `activated_at`, `completed_at`, `cancelled_at`) to `NULL`.
   - Do NOT provide non-null lifecycle timestamps on INSERT.
2. **Add Posts Before Publishing:**
   - Trigger `trg_events_before_update` enforces that an event cannot transition to `published` unless at least one post exists in `event_posts` with `status <> 'closed'`.
   - Insert posts into `event_posts` immediately after inserting the draft event.
3. **Transition to Published:**
   - Event `start_at` MUST be in the future (`> now()`).
   - Run: `UPDATE events SET status = 'published' WHERE id = ...;` (trigger sets `published_at = now()`).
4. **Transition to Active:**
   - Run: `UPDATE events SET status = 'active' WHERE id = ...;` (trigger sets `activated_at = now()`).
5. **Handling Past / Completed Events:**
   - A completed event is **frozen**; its dates cannot be modified after status becomes `completed`.
   - **Correct Sequence:**
     1. While event is `active`, update `start_at` and `end_at` to past dates (e.g., `start_at = now() - interval '2 days 4 hours'`, `end_at = now() - interval '2 days'`).
     2. Create applications, assignments, and check-ins for the event.
     3. Update status: `UPDATE events SET status = 'completed' WHERE id = ...;`  
        *(Trigger `trg_events_after_update` will automatically cascade `checked_in` attendance to `completed`, `expected` attendance to `absent`, and `assigned` assignments to `completed`)*.
6. **Handling Cancelled Events:**
   - Update: `UPDATE events SET status = 'cancelled', cancel_reason = '...' WHERE id = ...;`  
     *(Trigger automatically cascades assignments to `cancelled` and unassigned applications to `expired`)*.

### Rule 4: Assignments & Auto-Attendance (`trg_50_assignments_after_insert`)
- Do NOT insert manually into `attendance` on initial assignment!
- Inserting a row into `assignments` automatically fires `trg_50_assignments_after_insert`, which creates an `attendance` row with `status = 'expected'`.
- To record a check-in:
  ```sql
  UPDATE attendance
     SET status = 'checked_in',
         method = 'geo',
         checkin_at = event_start_time,
         checkin_latitude = 16.841000,
         checkin_longitude = 96.173600,
         checkin_distance_m = 25.0,
         checkin_accuracy_m = 10.0,
         geo_verified = TRUE
   WHERE event_id = target_event_id AND user_id = target_volunteer_id;
  ```

### Rule 5: Two-Way Feedback (`trg_01_feedback_guard`)
- Can ONLY be inserted when event `status = 'completed'`.
- `volunteer_to_coordinator`: Rater MUST have an attendance record with `status = 'completed'`. Target MUST be `owner_id` or `current_coordinator_id`.
- `coordinator_to_volunteer`: Rater MUST be `owner_id` or `current_coordinator_id`. Target MUST have an assignment on that event.
- Set actor context to rater before insert:
  ```sql
  SELECT set_config('app.user_id', volunteer_id::text, true);
  INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
  VALUES (target_event_id, volunteer_id, coord_id, 'volunteer_to_coordinator', 5, ARRAY['supportive', 'organized']::TEXT[], 'Great leadership!', 'active');
  SELECT set_config('app.user_id', '', true);
  ```

### Rule 6: Admin Moderation (`trg_moderation_before_insert`)
- Must set `app.user_id` to an active admin user.
- To hide a feedback entry:
  ```sql
  SELECT set_config('app.user_id', admin_id::text, true);
  INSERT INTO moderation_actions (admin_user_id, action_type, feedback_id, reason)
  VALUES (admin_id, 'feedback_hide', target_feedback_id, 'Flagged for review due to disputed remarks');
  SELECT set_config('app.user_id', '', true);
  ```
  *(Trigger `trg_moderation_after_insert` automatically updates `feedback.status = 'hidden'`)*.

---

## 5. Precomputed Cryptography Reference (All 42 Accounts)

The HMAC secret used by Django:
`PHONE_HASH_HMAC_SECRET = 'JKeyRjZIVd8QReU3n7AUpHJwzv-6JlSIS9MIsqCLSEChUagLvP0mTL6s2sS9gQReV6S7nPuPJkLgbKSSQgobgA'`

Use these exact literal strings for `phone_hash`, `phone_enc`, and `authtoken_token.key`:

| Phone | Role / Identity | `phone_hash` (HMAC-SHA256) | `phone_enc` (Fernet Ciphertext) | DRF Token Key |
| :--- | :--- | :--- | :--- | :--- |
| `+959100000001` | System Super Admin | `c9e4cda2b1a976e3b714fb26055c158b27a83b67f161f625945b0bc6a417d537` | `gAAAAABq7d-sqhthb4jye1FCoDZ0q4HVBEz9-lkrx4qCmjpB6NlXB4-SDfhOFJgPyKw49ygcl-SOiqiGu0MyRmQf_QOAXLyXYQ==` | `a000000000000000000000000000000000000001` |
| `+959100000002` | Operations Admin | `d770aa2d2309c320c8e1ed236ccb8ace4c3ccbad359c7c197a0c25f4a246d356` | `gAAAAABq7d-sfPzDRHiD67uEOd85IFv7OfzfLYDOcYVablFUMU93c3_S2j7uM6pEW6VjRccNzQZNjmiByO1LLwNZq0VyVEDGZg==` | `a000000000000000000000000000000000000002` |
| `+959100000011` | Senior Coordinator One | `fece8db10a9459a641486aa42eb977aa6648c946560a68c02952be76e84f18c8` | `gAAAAABq7d-sihVUM_cztvyluumRj0i5hcjNm37z5xmrB7dSnYXzYDoeBOOSLv3kWbHvYvZm0WWczMY3MLeHc4iyrzYnuZN9oA==` | `c000000000000000000000000000000000000011` |
| `+959100000012` | Disaster Lead Two | `d66da299dd8ffa7cfa041888442c2676dd2770accc24ea85e7e1d079bd9a7b5a` | `gAAAAABq7d-s6MQoqBKD4m7I1QxoEJy9jh0mphCz1dsRcnevcglz4IV14iWQh2JDy5QnrHF-fHkZWA2_5xrtmC7a3f84a1yHbQ==` | `c000000000000000000000000000000000000012` |
| `+959100000013` | Youth Lead Three | `19810eb9111feb8554d47ab5d9264ea2faf55cbd2d89c8f8800febf0e030c23e` | `gAAAAABq7d-sDJxPW-Is9qGm5SdV_Kt4ovBest2zVZ49N-IYoGP9dDDnG2DUv38pxfyat0f294SSybOeNHY9vftO4jB15Jm3IQ==` | `c000000000000000000000000000000000000013` |
| `+959100000014` | Eco Lead Four | `2f5609c11e734427c91157d2781c1b5fd75ddc68492e40cf01fa09cb35e79501` | `gAAAAABq7d-skVxHoKqDvGDChm0ycqNrGKGh3L7TISbaQtmqp1BUoFQW-9CzxUCsBWICAymb48I97jU3qcIkTnGxGqZuGVTQRg==` | `c000000000000000000000000000000000000014` |
| `+959100000015` | Community Lead Five | `78ec9bffc61e3584666a6ceb967bb9583af087ca479c21955b552789a51e3e63` | `gAAAAABq7d-s0ZBXEQCJMJ6sS3PlFNqbpo_q38svZfDjghDbOBU_i50hWoUDrU2oyUvy1oNJeShFNBP88nsMIRBU4G985ngxTQ==` | `c000000000000000000000000000000000000015` |
| `+959100000021` | Volunteer 01 (Pending Coord) | `e4a10f205e2cf8d11a2e439290fff9b23f48f0c6e54063b994a2191f17262ae9` | `gAAAAABq7d-stly9mEBAdU8miJqAYOpohrqNPKCODbjLCFq5XePvzP_UUwUf1uiDG6UY9O5Z75Ty0X0EXFyXKZ_dnKv49hLfew==` | `v000000000000000000000000000000000000021` |
| `+959100000022` | Volunteer 02 (Pending Coord) | `b4dd79310575ea0f34457df203ce8e650c02e01d73ad7ba970862f9ba9046b1b` | `gAAAAABq7d-sT5l2OjNG6-TksMLow0pwpc31Wj0oW1SqEzZfZSqQEFgq5fpLWrl0SBmY5Cuo53o-TggOvrE-haDPz_7ZYXK1OQ==` | `v000000000000000000000000000000000000022` |
| `+959100000023` | Volunteer 03 (Pending Coord) | `da0fd5f6a5ff7aecfbe2cc2bda2a0039e1d9053e4d06cd2d70fdfe4d91394fe9` | `gAAAAABq7d-shmV2VXxB4R-qtz70cn-jgzx-XC3Jvx1BUCyq06gsTaeibQhz7HugzWNB6Va5Jxy9GOXh-Ysav9VJMivUof-n-g==` | `v000000000000000000000000000000000000023` |
| `+959100000024` | Volunteer 04 (Active) | `785b0e34745db38cd31147fe1d6ba221b46291658eec2d5c0d2b2ce4b0368a6a` | `gAAAAABq7d-sOqQLkV8ElYJDfeHDljf63nnbuS9dlpjrungUgCk90WMK3LqCL5WUwRqrUoyN1it94Nh4tyosEedQp_a-C1eVRg==` | `v000000000000000000000000000000000000024` |
| `+959100000025` | Volunteer 05 (Active) | `e3a1f9a993bfca9854fd7a576bf485bc61f19b494a095bbca4198c76eb734589` | `gAAAAABq7d-sPKSiAVLqx_8g0Co33e7vJAS0x_XaJ_4VwQBKj99b2eyf5CZFRlGpUu1ZgVH4ooOYAqM0KybXS3i_PjVKbg9uTQ==` | `v000000000000000000000000000000000000025` |
| `+959100000026` | Volunteer 06 (Active) | `5465e150ab832da5e203c3947918cc4cfd37943a0c15fe07fca86ae0aa987218` | `gAAAAABq7d-sUP7iosCx7x06jFj_cpCHTPscAskbdQ7yiu-jM4nHhvPPUU5r1wmsG-_SWEW4VxmvIU15Ru3UEUF8YYv3TCAaww==` | `v000000000000000000000000000000000000026` |
| `+959100000027` | Volunteer 07 (Active) | `ec922ca32c502903b9a6c704535adbb26409f91a48339308d78c767a51ca9c91` | `gAAAAABq7d-sBcXsMkydp2roDJ-DanH0zQGar6cazYhTDSYtu-kFA8ZiaXXEwWc_fHALxNqh8K42SOOU569YOnGXZ5SgMIOaiw==` | `v000000000000000000000000000000000000027` |
| `+959100000028` | Volunteer 08 (Active) | `e0bb04b0b3791eb528ea8663d57cb82f77aab24c6319a74011b2cda14c558a57` | `gAAAAABq7d-sFLyQBPqGDwZgrGefW8T7KRsnMmq89qHwFiqgn8TAaDSIxjocaAlFVY0aMJV6OEJFCLy1rkg8UlLhQSYlXbaCwQ==` | `v000000000000000000000000000000000000028` |
| `+959100000029` | Volunteer 09 (Active) | `ef1bc2713db507f29ff31582e91992fb0ac917dd8c4491b903d22f799d6fe6cb` | `gAAAAABq7d-sZ71_c--ocvztV0gQFu31ygW3fTuIBV-m7uxzWdCVRnwj0NzDvU-dgTmxMaiD5DZIe4DCbvqPxb1BISCq3XjAPw==` | `v000000000000000000000000000000000000029` |
| `+959100000030` | Volunteer 10 (Active) | `fc0d5858b56d1fb01e3eb548ab03977aa783413a78523ef449c10d19c8bfd5b0` | `gAAAAABq7d-sfxWVfgym176Zz8KqYtofrOe0d8zCpOsSilFyKPgVDakoFVFnMWOUNelE14ZfymK7dnFBEBl8JLALiCWQ_wcFVQ==` | `v000000000000000000000000000000000000030` |
| `+959100000031` | Volunteer 11 (Active) | `1ac3a49da8c79d15ebd8fa62d4dfe9bde0de839e37c7cba2ec9d84586d8a4053` | `gAAAAABq7d-syqIzrltiOtyiDAPbvy0QPj3heiqu_e9hGGR-8iYpkaNasPlqBF6RSLNsNhcdZhUDY7Y8jPPXU_LYr5DP6Iv5Ug==` | `v000000000000000000000000000000000000031` |
| `+959100000032` | Volunteer 12 (Active) | `4c24e29de878dd96284c4d193ff97bdcc0965875b3b7b4d4ed79689c38225b83` | `gAAAAABq7d-sCtVmWyZNiasYq5SrAyxkBaeiIe7yFBE6XBJhwN3VS7GOKuewkil-sVmkurz1s4Dq-aI7wT2tBj8IeXLRRGvnGA==` | `v000000000000000000000000000000000000032` |
| `+959100000033` | Volunteer 13 (Active) | `30d7656c52bbd91f67698014151cfc7abcd9858db5ce440fb33ae6b2fa163539` | `gAAAAABq7d-sbiBUbKqmkfwMIbeGo5h9iKZZJ5Gbq9nL9dx55W8GLyqjA_I4M72osELk98vCUa7dAzFyEcMmYDXdLjPLNRO4eQ==` | `v000000000000000000000000000000000000033` |
| `+959100000034` | Volunteer 14 (Active) | `ba45cc5558d79ae0fc799df5d78c697b5f25f67ced49957c83730db6165506f9` | `gAAAAABq7d-sJBXbZKFX3fxRz1OC9Awit3ZvPA3ktIZ9bGSSMkRNmpKNpsxXuYiZpd9QLng9Fg9bHJ3RXWjwz1Yk7q8dGAds0w==` | `v000000000000000000000000000000000000034` |
| `+959100000035` | Volunteer 15 (Active) | `3cc6507dce81d2d8045c07e5491c8b08219c57ce0b4a2a7dcc3f15d771e02402` | `gAAAAABq7d-spNwZ4XOg6U1yEnE744Ph7rq_p8c8-V59qN3OfZrndN0nAvgo0Dmlvijo1M8vBdF9j1ViQ7d4sxMa6EPC1k0pWg==` | `v000000000000000000000000000000000000035` |
| `+959100000036` | Volunteer 16 (Active) | `327ebe08f81f4600e09e6ebd2e7254d5bc4d7a5a4afb8f86221f0a2682ac78ff` | `gAAAAABq7d-sPQp87Z0m8_yNvZYcESprDqHMeNG3IFO66_EIxcOt1JzvVAHKHWrzJrcKBjVXDAmVNzcJLb7_A-ntoJPfuUqNjA==` | `v000000000000000000000000000000000000036` |
| `+959100000037` | Volunteer 17 (Active) | `2dbc3ebd21b7f17a1b050bd8d64df89d9211ce9e7e147fd5b34b62eb1dd0cf86` | `gAAAAABq7d-sT0nNwnwpMSsaDx-7kc7kM4ktuMp-hF88F_CJDlY4v1KZ-4jveKQS-tt7ZdnfzVj-KFqqtjnKUei4rI3DQ62nuA==` | `v000000000000000000000000000000000000037` |
| `+959100000038` | Volunteer 18 (Active) | `53fb600334bb091b8d6442e0fc9507d87e7cd3f575baf8c4dbcbc175ce8b4181` | `gAAAAABq7d-sh6xzdVoyKb1fnrXvEawS1B4zxezzO3w2dEe7GVa9BT_YAzc3baCJ2tp7u-GH8QcCrhI-NHJa9PrEUVft-xF1Zg==` | `v000000000000000000000000000000000000038` |
| `+959100000039` | Volunteer 19 (Active) | `3ef855c0689cec687b7f65926d7fdb3136f8abd93ac51e7410993d1d892c8dc1` | `gAAAAABq7d-siNj4THkjAxX4wqBuqvjKtNNJjViP4ZWHUwfqt-tZ3YaB34Mq8l3hRtdcea_PyXGzke71XIGz12LiQCJ0mHijOw==` | `v000000000000000000000000000000000000039` |
| `+959100000040` | Volunteer 20 (Active) | `10f5e0b12c1217503c9540e0edc3e8fcc101c8c6053d8564b0f8620f66cff189` | `gAAAAABq7d-sVIP_xtEiP_Wqpe_bFIwhA2wVZ3azLEuf09AGt0UbYKLeFBFKJfnw86bJFaonh0XyoxOuL_c4U3QjeG5JB5zOEQ==` | `v000000000000000000000000000000000000040` |
| `+959100000041` | Volunteer 21 (Active) | `be32ecfcfb54061b0d736c2ccb0a6a5aa90fe30bde64525af4022481abaab600` | `gAAAAABq7d-sT4IyYt6nNjHCcR_fPCiochO0IJjuwo_kU2DPk2XxT19Q6O4H44mgTAaRFA-vkNxBoWaB3ScGi7Ht4O1rgEdoYg==` | `v000000000000000000000000000000000000041` |
| `+959100000042` | Volunteer 22 (Active) | `c33df089da4e0880a3d62ceae896af748b55d30c115dc9bcb21613306d0adcd4` | `gAAAAABq7d-sGWoOtNC-DWF0aO4JMwS1m8XwD7W4Z_Zq1rKkqarGe6aT0L9GPf0qP7ntTvsLMlwO6VwVIlsCXPJ-q9nAzp5bvg==` | `v000000000000000000000000000000000000042` |
| `+959100000043` | Volunteer 23 (Active) | `251aed756061a72da3cd7b998636ff42fdcfcd4903b080112812110a104e6cf5` | `gAAAAABq7d-sveRmGYM9DZl9_ydQcY_qXFxys8e8oNJR8_4fCIy6KHsPIfLBCNABQVhxdHhcgNZSnFem-sSOhYPPt5HHNVudOQ==` | `v000000000000000000000000000000000000043` |
| `+959100000044` | Volunteer 24 (Pending ID) | `24f30aab6d0a37532ef755e688b7309c078c3bb16bf67602205c9215ca2ddfc6` | `gAAAAABq7d-syAmUzXMDDU6tATMawv9ptMF-IziSN8ITmlLrNvR9OAULlcUAbLMzeauTx1ka4xktm5_RzxTTVwGRtFr3zjCTbw==` | `v000000000000000000000000000000000000044` |
| `+959100000045` | Volunteer 25 (Pending ID) | `fc0ba28431f7e1450857f2b90228ed9238ac37b7cf1408e3f064336058f29091` | `gAAAAABq7d-s_YLs5If2WfpoRVW-eola9SFihruSgeH1oruvl7Fujw0_oqWLkPCS8qBmjSQXiBCYySfmGp_G5w7BbM_OLHjokA==` | `v000000000000000000000000000000000000045` |
| `+959100000046` | Volunteer 26 (Pending ID) | `7e9f4552ad37b2470d9f2612a1330d35c415bd0e8fd0cc99025f2e19ec1a05b3` | `gAAAAABq7d-sLFzGpRvc2PMwBsUyCS9SFA9ZeD0IeEBl4POVayhfCKrWQiQQ2OAkmCWJJ7eGI1IZFGjm-65bxBIllGFpwS9jIA==` | `v000000000000000000000000000000000000046` |
| `+959100000047` | Volunteer 27 (Pending ID) | `dedb242ad1bc2adb0353b0909db4f956448abbbaea59d8956ba450ab29241357` | `gAAAAABq7d-slFcGGfA7NMB31k8dkid-aYIRxV6D1LRrA_IGQErqMvjKp9FxeNwuDPK-Ugv_dowNsWgSSV8reF1lJIjEAuttFw==` | `v000000000000000000000000000000000000047` |
| `+959100000048` | Volunteer 28 (Pending ID) | `f45f079e6f59830795f68b80cd80696a5c1574ac8a9c3608f40a08ffc3e39770` | `gAAAAABq7d-soRcdkwesEuS8Gtj4LnKG1LAKFA6m94rovN8_5viDU5F_XPuv_zANMIYhjR4GA__Di2dKSSPgRHQUeDDB6gqrBg==` | `v000000000000000000000000000000000000048` |
| `+959100000049` | Volunteer 29 (Rejected) | `edb2cef4cb92a07564ae912dfcab8467e663e997312ee169bec4584f6b2e5ce2` | `gAAAAABq7d-sH7rVpO_u1MJBL4TYfyJgRGlEa7OUWAr7GHH_9hu1d1E_r1j-yp2ifRvqiUZnJGCqG4j4pbxgn4mOo0sYkc-4sg==` | `v000000000000000000000000000000000000049` |
| `+959100000050` | Volunteer 30 (Rejected) | `f6605227dc71a2f1eecf740f0ac42fe2c1bf6c0038cb26db1e214b5972229324` | `gAAAAABq7d-skvVeEzWeOUVR2vmy1XYf65cdIlGHR8nozsFO7N4vV0_0QE89qAze776buDUSjyHyaDO4lHmdEVMCiWDTkmRnPA==` | `v000000000000000000000000000000000000050` |
| `+959100000051` | Volunteer 31 (Rejected) | `63986910d3a7a24c7722f0862308154a358982b00f523f27116bccba9c48cee5` | `gAAAAABq7d-sZdB2IVWVQcLpEqUz9HzT6H_zhQ7ghoE977-MFO5RhTg-aQNu0JH2CEmpOCbE_eLcWp9OCJxAh5wxZRtoIZmNTQ==` | `v000000000000000000000000000000000000051` |
| `+959100000052` | Volunteer 32 (Warned) | `2f155273d85293493f66ff968c316fb77953f4a25c28123d8a040bd0745c62e1` | `gAAAAABq7d-stnMKWoXb1kyfYNwjTd2cl2VR8DTAwGeLkDXvS3qvuKRkGQCBYKtgRi9VL6ENHIJXrGin2eZYSWeoIKP5p16tKQ==` | `v000000000000000000000000000000000000052` |
| `+959100000053` | Volunteer 33 (Warned) | `343a2f91bdb6b69f9e62e639cbc8ff347ae057466008f6eb8123194cd66dca1a` | `gAAAAABq7d-sueGIpGr5Lh7V7apoQwTDImi9ZuVANjxpR6nY-m6EkZm06ShzXFIodterNChEYiM58unOLu5EWGMLdRWua3N0SA==` | `v000000000000000000000000000000000000053` |
| `+959100000054` | Volunteer 34 (Blocked) | `2ac447025b82f2119039bb03cbc2f92f68db56e743e290c749ad4ad4543b6fa1` | `gAAAAABq7d-sn5O3-ATc5gz1W-phYC_5FlUk9KTRM_gqg_Wy357QxgReC-l_7uar-RMrlgjv1769Oqwg8pX8dCiEXghVKpmuew==` | `v000000000000000000000000000000000000054` |
| `+959100000055` | Volunteer 35 (Blocked) | `7edbc266e5faad9e6dca9d9235c4e002ff9c2318cc955df4e0bb2b03b5d1590a` | `gAAAAABq7d-sbFFVjBEzEhuC-iwklaAkqh4L7XM4Q0erWJb7PrkDnuex2ukvcPxRPqL8vnjCH5sXj2xb0Qoy2sigRW7kRiZ00w==` | `v000000000000000000000000000000000000055` |

---

## 6. Demo Test Coverage Matrix

Running this SQL seed creates a complete, testable platform across all user journeys:

### 6.1 Admin Web Dashboard (`/api/v1/admin/ui/dashboard/`)
- **Total Users:** 42 users (2 Admins, 5 Approved Coordinators, 35 Volunteers).
- **KPI Counters:**
  - Events: 10 Total (4 Future, 6 Past).
  - Coordinators: 5 Approved, 3 Pending.
  - Verification Queue: 5 pending ID license images to review.
  - Moderation Flagged Feedbacks: 1 hidden feedback to inspect and moderate.

### 6.2 Coordinator Management Board (`/api/v1/admin/ui/coordinators/`)
- Shows the 5 approved coordinators and their assigned events.
- Shows the 3 applicant coordinators (Volunteers 01, 02, 03) in the approval queue ready for 1-click approval or rejection.

### 6.3 Geo-Monitoring & Map View (`/api/v1/admin/ui/geo-monitoring/`)
- Live event: **Event 6 (Downtown Community Food Station)**.
- 1 Inside-Geofence check-in attempt (`result = 'accepted'`, distance 25m, accuracy 10m).
- 1 Outside-Geofence attempt (`result = 'outside_geofence'`, distance 450m, review status `'pending'`).

### 6.4 Two-Way Feedback & Moderation Queue
- Rating score averages and normalized tag counts (`organized`, `punctual`, `communication`).
- Demonstrates hidden review filtering: 1 review hidden via `moderation_actions` (`feedback_hide`) remains invisible to public endpoints while visible in the audit view.

---

## 7. Verification Query (Run After Seeding)

The generated `seed_data.sql` script should conclude with this diagnostic query to confirm data integrity:

```sql
SELECT 
    (SELECT count(*) FROM users) AS total_users,
    (SELECT count(*) FROM users WHERE is_admin) AS total_admins,
    (SELECT count(*) FROM coordinator_profiles WHERE status = 'approved') AS approved_coordinators,
    (SELECT count(*) FROM coordinator_profiles WHERE status = 'pending') AS pending_coordinators,
    (SELECT count(*) FROM events) AS total_events,
    (SELECT count(*) FROM events WHERE start_at > now()) AS future_events,
    (SELECT count(*) FROM events WHERE start_at <= now()) AS past_events,
    (SELECT count(*) FROM event_posts) AS total_posts,
    (SELECT count(*) FROM event_applications) AS total_applications,
    (SELECT count(*) FROM assignments) AS total_assignments,
    (SELECT count(*) FROM attendance) AS total_attendance,
    (SELECT count(*) FROM attendance_geo_attempts) AS total_geo_attempts,
    (SELECT count(*) FROM feedback) AS total_feedback,
    (SELECT count(*) FROM moderation_actions) AS total_moderation_actions;
```

**Expected Diagnostic Output:**
```text
 total_users | total_admins | approved_coordinators | pending_coordinators | total_events | future_events | past_events | total_posts | total_applications | total_assignments | total_attendance | total_geo_attempts | total_feedback | total_moderation_actions 
-------------+--------------+-----------------------+----------------------+--------------+---------------+-------------+-------------+--------------------+-------------------+------------------+--------------------+----------------+--------------------------
          42 |            2 |                     5 |                    3 |           10 |             4 |           6 |         ~20 |                ~25 |               ~18 |              ~18 |                  2 |             ~8 |                        4
```
