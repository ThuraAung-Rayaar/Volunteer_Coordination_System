# AI Chat Memory and Synthetic Database Seeding Plan

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Target branch:** `feature/ai-assistant-implementation`  
**Database contract:** v0.12.0 — frozen, database-first PostgreSQL schema  
**Specification date:** 2026-11-24  
**Status:** Planning/specification only. No SQL has been run and no database records have been changed.

---

## 1. Executive decision

Build a realistic synthetic data cohort **before implementing the AI assistant**. The assistant's event discovery, user-specific answers, coordinator workflows, recommendations, and operational summaries need representative data across the whole lifecycle, not a handful of fixtures.

The recommended approach is:

1. Preserve every existing row, including the original two admin accounts, all existing users, coordinator profiles, event records, assignments, attendance, audit history, and authentication records.
2. Create a disposable local clone of the current frozen database and seed that clone. Do not seed the working database by default.
3. Add **500 new synthetic accounts** in five SQL batches of exactly 100 users each.
4. Of those 500 accounts, make 450 volunteers, 20 pending coordinator applicants, and 30 verified/approved coordinators. Do not create any new admin accounts.
5. Bring the total event count to a target of **185 events** (35 existing + 150 new on the current database snapshot), with events distributed across Yangon, Mandalay, Pyay, Bago, and Magway and future dates through **2027-03-31**.
6. Generate phone hashes and encrypted phone values with the application's existing Python cryptographic functions. Never reimplement the algorithm in SQL or Gemini-generated code.
7. Use the database's existing triggers and functions to create coordinator approvals, event history, applications, assignments, attendance state transitions, and audit rows. Do not bypass the frozen contract.
8. Keep the short-term chat memory separate from database seeding. V1 memory should be the last **two user/assistant exchanges** in the current chat, passed with each request; it should not require new database tables.

**No production schema change is required or permitted by this plan.** Do not add chat-history tables, vector tables, columns, indexes, views, functions, triggers, or migrations as part of the seed phase.

## 2. Existing repository and database facts

The implementation must use the current repository contracts, not a fresh schema imagined by a code generator.

Sources inspected:

- `docs/full_database_details.md` — current schema report, 31 base tables, 11 views, frozen v0.12.0 contract; report generated 2026-11-20 and verified 2026-11-22.
- `postgres_sql/updated_volunteer_coordination_system_Database.sql` — authoritative PostgreSQL schema, constraints, triggers, and stored procedures.
- `backend/common/security.py` — phone normalization, HMAC phone hashing, and Fernet phone encryption.
- `backend/admin_portal/phone_utils.py` — Myanmar phone normalization to `+959...`.
- `backend/services/coordinator_service.py` — coordinator application and approval workflow.
- `backend/services/assignment_service.py` — assignment operations delegated to PostgreSQL.
- `scripts/seed_integration_fixtures.py` — disposable-database safety rules for integration fixtures.
- `seeding/seed_data.sql` — legacy Yangon demonstration seed; explicitly destructive and unsuitable as the new base.

### 2.1 Current data snapshot

The repository's database report records the following existing row counts. These are a planning baseline, not a live query of the database at the time this document is executed.

| Table | Existing rows in report |
|---|---:|
| `users` | 233 |
| `coordinator_profiles` | 68 |
| `events` | 35 |
| `event_posts` | 40 |
| `event_applications` | 60 |
| `assignments` | 58 |
| `attendance` | 58 |
| `event_coordinator_history` | 37 |
| `user_charity_interests` | 80 |
| `volunteer_availability_rules` | 245 |
| `feedback` | 8 |
| `moderation_actions` | 12 |
| `audit_logs` | 1,356 |
| `user_verification_images` | 76 |

The generated seed bundle must **re-count the live disposable clone before writing**. If the baseline differs, it must calculate the remaining number of event rows needed to reach the configured target and must fail safely if the target cannot be met without exceeding 199 events.

### 2.2 Existing seed file is destructive

`seeding/seed_data.sql` begins by disabling the audit truncate guard and truncating users, events, audit logs, and many dependent tables with `RESTART IDENTITY CASCADE`. It is a full demo reset, not an append-only fixture. **Do not include it, invoke it, edit it into the new bundle, or run it for this task.**

`scripts/seed_integration_fixtures.py` is also not the 500-user seed generator. It has deliberate safety gates: `APP_ENV` must be `ci` or `test`, the target database must be in its disposable allowlist, and the host must be local. Preserve this safety posture.

## 3. Seed target, safety, and repeatability

### 3.1 Target database

Default target: a disposable local clone named `ai_seed_volunteer_coordination_db`, restored from a backup of the current local development database and using the exact same v0.12.0 schema.

Recommended preparation (operator-run, not generated into the seed SQL):

```bash
pg_dump -Fc -d volunteer_coordination_db -f pre_ai_seed_backup_20261124.dump
createdb ai_seed_volunteer_coordination_db
pg_restore --no-owner --no-privileges -d ai_seed_volunteer_coordination_db pre_ai_seed_backup_20261124.dump
```

Confirm the restored database has the expected schema version and passes the existing read-only preflight before running any seed file. The clone should not be used by the mobile app or production-like users while it is being seeded.

Do not point the seed bundle at production, a remote database, or the original `volunteer_coordination_db` by default. If the developer later elects to seed the original local database, that is a separate, explicit operation requiring a verified backup and a manual review of the target database name and counts.

### 3.2 Required protections

The generated master SQL entry point must:

- Use `\set ON_ERROR_STOP on` so psql exits on the first SQL error.
- Check `current_database()` against the dedicated disposable target name before any DML.
- Check the connection is local/loopback through the operator's configured connection and refuse remote targets.
- Confirm the expected frozen schema objects exist (including `users`, `coordinator_profiles`, `events`, `event_posts`, `event_applications`, `assignments`, and `attendance`).
- Confirm the seed target contains at least two active admin users before coordinator approvals are attempted.
- Acquire a transaction-scoped advisory lock to prevent two seed runs overlapping.
- Run within a single explicit transaction or a documented set of restart-safe transactions; any unhandled failure must roll back the current batch.
- Never disable triggers, constraints, audit guards, RLS/policy checks, or append-only guards.
- Never call `TRUNCATE`, `DROP`, `DELETE`, `RESTART IDENTITY`, or blanket `UPDATE` against existing data.
- Use `INSERT ... ON CONFLICT` only for the known natural/unique seed keys and never overwrite existing user profile or operational data on conflict.
- Verify existing counts and the target marker counts before and after seeding.

The user runs the final master file personally with `psql`; generated scripts must not connect to a database automatically from Python or execute SQL on the user's behalf.

### 3.3 Idempotency contract

A second run must not create duplicate synthetic users, coordinator profiles, events, interests, availability rules, applications, or feedback.

Use deterministic synthetic cohort keys in generated metadata and stable unique hashes for user identity. The generator should create a private local manifest mapping cohort keys to phone values, but raw phone numbers must not be placed in committed files. Event rows need a stable natural key in their generated metadata; because the frozen `events` table has no seed-key column, the SQL should use a stable synthetic title prefix/key and verify uniqueness before inserting. Do not add a new column just for seeding.

If a matching seed row already exists but its fields differ from the manifest, the SQL should stop and report a conflict. It must not silently rewrite the row.

## 4. User cohort: 500 synthetic users

### 4.1 Count and role split

Create 500 **additional** users. Preserve the existing users and admins.

| Synthetic user category | New users | Coordinator profile status | Notes |
|---|---:|---|---|
| Volunteers | 450 | No new coordinator profile | Main pool for event applications, assignments, attendance, interests, and availability |
| Coordinator applicants | 20 | `pending` | Active test accounts with verified test fixture status; not yet approved as coordinators |
| Qualified coordinators | 30 | `approved` | Active and verified synthetic accounts, approved by one of the original active admins |
| **Total** | **500** |  | **No synthetic admins** |

Expected total users using the report baseline: 233 + 500 = **733**. Existing coordinator profile rows remain intact; 50 new coordinator profiles are added (20 pending and 30 approved). The total coordinator profile count would be approximately 118 if the live baseline still matches the report.

The phrase “qualified coordinator” in this specification means an active user whose synthetic verification fixture is `verified` and whose coordinator profile has passed the database's `pending -> approved` transition. It does not mean that a real-world identity check was performed.

### 4.2 Five user batches

Generate exactly five user SQL files, 100 users in each:

| File | Volunteers | Pending applicants | Approved coordinators | Total |
|---|---:|---:|---:|---:|
| `users_001_100.sql` | 90 | 4 | 6 | 100 |
| `users_101_200.sql` | 90 | 4 | 6 | 100 |
| `users_201_300.sql` | 90 | 4 | 6 | 100 |
| `users_301_400.sql` | 90 | 4 | 6 | 100 |
| `users_401_500.sql` | 90 | 4 | 6 | 100 |
| **Total** | **450** | **20** | **30** | **500** |

Each batch should contain volunteers distributed evenly across the five target city clusters (18 volunteer accounts per city per batch). Coordinator roles should be allocated across batches so the global totals are exactly 20 pending applicants and 30 approved coordinators, with 4 pending and 6 approved coordinators assigned to each city overall. The extra approved coordinator per batch should rotate across the cities rather than concentrate in Yangon.

The five user files should insert the 100 base user records each. A separate role/profile script should create the coordinator profiles and perform approvals after all five user batches have been inserted. This makes dependencies and review easier to follow.

### 4.3 Synthetic identity and profile data

Use generated, clearly synthetic display names and a `TEST` or `[SYNTHETIC]` marker in display names or descriptive profile metadata. Do not use existing real users' names, phone numbers, private information, or copied profile content.

Profile attributes should be diverse enough to test matching and filtering:

- Home area distributed across the five city/region clusters and representative townships.
- Skills from the existing normalized skill vocabulary used by the project (for example logistics, first aid, teaching, cooking, cleaning, driving, crowd control, translation, inventory, food distribution, environmental cleanup, animal welfare, and disaster support). Do not invent a new database taxonomy where the app expects normalized text tags.
- Variation in physical ability, heavy lifting, outdoor work, leader experience, new-to-volunteering, meal/travel support needs, unpaid acceptance, language, and blood type.
- `preferred_language` can be English or Burmese locale values already allowed by the database language constraint.
- Avoid real emergency-contact details; default emergency contact fields to `NULL`.
- Do not create passwords, access tokens, sessions, OTP challenges, or active login credentials for the synthetic users in SQL.

### 4.4 Verification state policy

Coordinator application and approval require active, verified users. The database's coordinator trigger validates the target user's active account and `verification_status='verified'` before approval.

For this **disposable synthetic test database only**, the 50 coordinator accounts must be seeded with a test-only verified state to exercise coordinator approval and access boundaries. Their display names/manifest must identify them as synthetic test accounts. Do not insert fictitious ID/selfie/license image rows and do not place fake files in `backend/private_media/verification_images/`.

The 450 ordinary volunteer accounts should have a varied, plausible verification distribution (suggested: approximately 65% verified, 15% pending, 15% none, 5% rejected). These states are synthetic fixtures, not genuine identity decisions. The seed SQL must not modify verification state for existing users.

## 5. Myanmar phone generation and cryptographic handling

### 5.1 Required subscriber-number patterns

Every generated phone value must be in canonical `+959<subscriber>` form. The requested subscriber lengths and prefixes are:

| Subscriber digits after `+959` | Allowed first two digits | Random tail length |
|---:|---|---:|
| 7 | `40` through `52` inclusive | 5 |
| 8 | `82` through `89` inclusive | 6 |
| 9 | `90` through `99`, `66`, or `70` through `79` | 7 |

Generate length class and allowed prefix randomly, then generate the remaining digits using a cryptographically secure random source. Do not use sequential or predictable test numbers. Enforce uniqueness across all 500 generated phone values and reject any candidate whose HMAC already exists in the cloned database.

The repository's Myanmar normalizer accepts 7–10 subscriber digits after `+959`; the user's 7/8/9-digit formats fit that parser.

### 5.2 Do not implement a second hash algorithm

The application does not store a plain SHA-256 hash of the phone number. `backend/common/security.py` defines:

- `normalize_phone()` — canonicalizes the input used by the cryptographic helpers.
- `compute_phone_hash(phone)` — HMAC-SHA256 using `settings.PHONE_HASH_HMAC_SECRET`, returning a 64-character lowercase hexadecimal digest.
- `encrypt_phone(phone)` — Fernet encryption using `settings.PHONE_ENCRYPTION_KEY`.

The generator must import and call the existing application functions. It must not duplicate the HMAC algorithm, use a plain SHA-256 digest, hardcode a key, or ask Gemini to invent a compatible hash.

### 5.3 Python generator responsibilities

Gemini CLI should implement a local-only Python tool, proposed path:

`seeding/ai_seed_bundle/generate_seed_bundle.py`

It must:

1. Load Django settings using the existing project configuration and local environment variables.
2. Refuse to run when `PHONE_HASH_HMAC_SECRET` or `PHONE_ENCRYPTION_KEY` is absent or invalid.
3. Import `normalize_myanmar_phone`, `compute_phone_hash`, and `encrypt_phone` from the existing repository modules. Do not contain a replacement crypto implementation.
4. Generate 500 raw Myanmar test phone values meeting section 5.1.
5. Normalize each phone with the project's Myanmar utility, call the real HMAC helper, and encrypt with the existing Fernet helper.
6. Check generated normalized numbers and HMAC hashes for duplicates, and check candidate hashes against existing `users.phone_hash` values in the target clone or against a read-only exported hash list supplied by the operator.
7. Generate user SQL with `phone_hash` and `phone_enc`; never output raw phone values into SQL comments, stdout, logs, or Git-tracked manifests.
8. Generate the five exactly-100-user SQL files. The phone hash is the stable identity key used to resolve the generated row's database ID in later scripts; never assume the database ID sequence.
9. Write the manifest and generated SQL once. Because Fernet encryption is randomized, rerunning encryption for the same phone will create a different ciphertext. Reuse the saved generated output for repeat runs rather than silently regenerating it.
10. Produce a redacted summary (counts only; no raw phones, hashes, encrypted values, or key material).

### 5.4 Private manifest and secrets

A local, ignored manifest may retain the raw synthetic phone values for test-account lookup, for example:

`.local/ai_seed_manifest.json`

Requirements:

- Add the path to `.gitignore` before generating it.
- Restrict filesystem permissions to the current developer account (owner read/write only where supported).
- Never commit the manifest, `.env`, HMAC secrets, encryption keys, raw phone values, tokens, or generated credentials.
- Do not send raw phones or cryptographic secrets to Gemini prompts, cloud LLMs, chat context, logs, or error reports.
- Keep phone encryption and HMAC keys the same as the backend configuration for the cloned database; a different key set will make the generated values unusable by the running backend.

### 5.5 Important phone-number warning

The prefix/length rules above are formatting requirements, **not proof that the resulting numbers are reserved, non-routable test ranges**. The ITU's Myanmar National Numbering Plan documents allocated mobile number ranges. Treat generated `+959` values as potentially belonging to real subscribers: do not send OTPs or SMS to them, do not call them, and do not use a real messaging provider in seed/test mode. Use a local test OTP provider and disable outbound SMS at the environment/configuration layer. Reference: [ITU Myanmar National Numbering Plan](https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000920024PDFE.pdf).

## 6. Event population: 185 total target

### 6.1 Target and distribution

The current schema report records 35 existing events. Target a final total of **185 events**, so the current snapshot requires 150 synthetic event rows. This satisfies the strict requirement `100 < total events < 200` and leaves 14 rows of headroom below the upper bound of 200.

If the live clone has a different initial count, the generator must set `synthetic_events_to_add = 185 - existing_event_count`. Refuse to run if the existing count is already 185 or higher, or if the computed final count would be 200 or more. Do not insert a fixed 150 rows without checking the actual starting count.

Distribute the 150 planned additions evenly:

| City / region cluster | Synthetic events | Planned distribution |
|---|---:|---|
| Yangon | 30 | Yangon townships and peri-urban locations |
| Mandalay | 30 | Mandalay townships and surrounding areas |
| Pyay (Pyi) | 30 | Pyay and nearby district towns |
| Bago | 30 | Bago and nearby townships |
| Magway (Magwe) | 30 | Magway and nearby towns |
| **Total** | **150** | **30 per cluster** |

If event count adjustment is needed because the live baseline has changed, retain approximately equal city allocation; any uneven remainder should rotate across cities in the generated manifest.

### 6.2 Event lifecycle mix

For the 150-event snapshot plan:

| Final status | Count | Purpose |
|---|---:|---|
| `completed` | 90 | Historical event participation, attendance, event feedback, and volunteer experience |
| `cancelled` | 15 | Cancellation handling, status explanation, and history edge cases |
| `active` | 10 | Current operational summaries, check-in, staffing, and coordinator use cases |
| `published` | 30 | Upcoming event discovery and applications through 2027-03-31 |
| `draft` | 5 | Coordinator draft and publish workflow |
| **Total** | **150** | |

Keep the lifecycle mix approximately even across the five city clusters. For a 30-event city cohort, aim for 18 completed, 3 cancelled, 2 active, 6 published, and 1 draft.

### 6.3 Time distribution

Use `Asia/Yangon` for authored event times and store timezone-aware timestamps. Use database `now()` for lifecycle transitions and generated timestamps; do not hardcode the developer's local timezone.

- Completed events: simulated occurrence dates distributed over 2024-01-01 through 2026-10-31.
- Cancelled events: a mix of historic cancellations and upcoming cancellations; include a short non-sensitive cancellation reason.
- Active events: occurrence dates around the actual seed execution time (for example, started 1–2 hours before the run and ending 1–3 hours after). Recompute at run time rather than hardcoding 2026-11-24.
- Published events: future dates from 2026-11-25 through 2027-03-31, with application deadlines before start time. Fail preflight if the seed is run after the configured future window has expired; require updated metadata rather than quietly publishing past events.
- Draft events: a mix of future dates and no published timestamp.

**Important lifecycle sequencing for historical records:** the database rejects publishing an event whose `start_at` is already in the past. Therefore, a completed historical event cannot simply be inserted with a 2024/2025 start date and then published. Generate it initially with a safe provisional future schedule, insert its posts, publish it, and activate it through the valid transitions. While it is open, create its applications and assignments through the normal trigger/function path; supply the intended historical occurrence interval in the assignment schedule fields where the schema permits. Then, in the same controlled seed transaction, set the event's `start_at`/`end_at` to its synthetic historical occurrence dates and transition `active -> completed`. Do not set lifecycle timestamp columns directly. Validate that any assignment and attendance timestamps retained for the historical event are coherent with the final occurrence interval and are accepted by the existing guards. For a cancelled event, create/publish it with a provisional future schedule, create the desired applications/assignments if needed, then transition it through the valid `published -> cancelled` or `active -> cancelled` path.

The database sets `published_at`, `activated_at`, `completed_at`, and `cancelled_at` through event lifecycle triggers. The seed must not directly forge these columns. Because this is synthetic data, the event date (`start_at`/`end_at`) is the simulated occurrence date while trigger-managed lifecycle timestamps record the actual seed-run transition; document this limitation so downstream AI responses do not misrepresent it as a real historical audit trail. Before implementing this sequence, Gemini must inspect the exact event, application, assignment, and attendance trigger bodies in the schema SQL and prove the proposed transaction order against a disposable clone. If a transition cannot be performed without bypassing a trigger, do not work around it; report the constraint and revise the fixture target.

### 6.4 Geography and location metadata

Use realistic place labels and representative map points, but clearly label the whole cohort as synthetic. Coordinates are illustrative map markers only and are **not surveyed geofence points**. Keep `geo_checkin_enabled=false` on seeded events unless the coordinates and test configuration are explicitly reviewed. Never use generated map coordinates as proof of attendance.

Suggested area pools (rotate across the events rather than repeating one central point):

- Yangon: Kamayut, Hlaing, Bahan, Sanchaung, Insein, Thingangyun, North Okkalapa, South Okkalapa, Yankin, Tamwe, Dagon, Pazundaung, Ahlone, Lanmadaw, Botataung.
- Mandalay: Aungmyaythazan, Chanayethazan, Chanmyathazi, Mahaaungmyay, Patheingyi, Pyigyidagun.
- Pyay/Pyi: Pyay town, Shwedaung, Paungde, Padaung.
- Bago: Bago town, Waw, Thanatpin, Kawa, Daik-U.
- Magway/Magwe: Magway town, Minbu, Chauk, Yenangyaung, Pakokku.

Each event should include:

- A synthetic event title with a stable cohort key or `SYNTH` marker.
- A specific purpose and realistic description, e.g. community cleanup, flood preparedness, blood donation support (without collecting donor medical details), food distribution, elderly assistance, school support, animal welfare, public-health education, logistics, or disaster response.
- A location name and landmark description appropriate to its city cluster.
- Start/end times, application deadline, max participants, acceptance mode, onboarding text, meals/travel/lodging flags, compensation type, and event status.
- Charity field links from the existing `charity_fields` table, using valid existing `code` values only.

Descriptions should explicitly say: `Synthetic scenario for AI testing; not a real event.` Do not imply the application has a real partner charity or that a public authority has endorsed the event.

## 7. Event posts, applications, assignments, attendance, and related data

Use enough related data to let the assistant answer cross-entity questions: what events match a volunteer, who applied, what is staffed, what is still short, which events a volunteer attended, and what a coordinator is responsible for.

Suggested volumes for the 150-event addition:

| Entity | Target volume | Generation rule |
|---|---:|---|
| `event_posts` | 300–450 | 2–3 posts per event on average; mix operational roles and skill requirements |
| `event_applications` | 750–1,050 | 5–7 applications per event on average, varying by lifecycle/status |
| `assignments` | Derived, target roughly 450–650 | Created by existing database assignment workflow for accepted applications; do not insert arbitrary orphan assignments |
| `attendance` | Derived from assignments | Created by existing assignment/attendance triggers; then apply valid attendance transitions |
| `user_charity_interests` | 900–1,500 new links | 2–3 existing charity field codes per synthetic user, avoiding duplicates |
| `volunteer_availability_rules` | 900–1,800 new rows | 2–4 unique weekday/time rules per eligible synthetic volunteer |
| `volunteer_availability_exceptions` | 100–250 new rows | Mix available/unavailable exceptions with valid time ranges |
| `onboarding_acknowledgments` | 300–600 new rows | Only for users/events that require acknowledgment; exact event version |
| `feedback` | 100–200 new rows | Varied scores/tags/comments, synthetic text only, valid rater/target directions |

These are generation targets, not unconditional insert counts. Database capacity, application state rules, event lifecycle, and exclusion constraints take precedence. The generator must calculate and report actual inserted counts and must not violate constraints merely to hit target volumes.

### 7.1 Event posts

Create 2–3 roles per event, for example event marshal, registration support, logistics, setup/teardown, food distribution, first aid support, translation, community outreach, cleanup crew, and data entry. Vary:

- `required_headcount`
- `physical_level` (`none`, `light`, `medium`, `heavy`)
- `required_skills` (normalized lower-case unique values)
- `leader_needed`
- `new_volunteers_allowed`
- `priority`

Insert posts while events are still drafts. The event must have at least one open post before it can be published.

### 7.2 Applications and assignment generation

Applications must be created while the event is in `published` or `active` state and before its application deadline/end time. Use `browse` or `invite` sources for the initial seed; do not use `qr_walkin` unless the script also creates and consumes valid QR tokens through the existing workflow.

Application status is trigger-managed at insertion. If the event is configured for auto acceptance, the trigger may mark the application accepted or waitlisted based on post capacity. For manually accepted events, the seed should perform valid manager-driven decisions with an existing approved event owner/current coordinator and `decided_by_id` / `decided_at` values consistent with the service and trigger rules.

When an application becomes accepted and auto-assignment is enabled, PostgreSQL's `trg_applications_after` calls `create_assignment_from_application()`. The seed should rely on this path or the existing service/SQL function. Do not fabricate assignments by raw bulk insert. Respect:

- One active application per user per event.
- One active assignment per user per event and per application.
- Composite foreign keys matching application, event, user, and post.
- Post capacity.
- The GiST schedule-exclusion constraint preventing overlapping active assignments for one user.

Avoid assigning the same volunteer to overlapping events. If an assignment cannot be made, preserve the accepted/unassigned state and report it; do not bypass the function.

### 7.3 Attendance

Assignments create the expected attendance records through the current database path. Transition them using valid states: `expected`, `checked_in`, `absent`, `completed`, or `cancelled`.

For test check-ins, prefer `coordinator_manual` with `recorded_by_user_id` set to the approved current event coordinator or owner. Do not fabricate GPS latitude/longitude, accuracy, distance, or `geo_verified=true`. For non-geo methods, the geo evidence fields must remain null and `geo_verified=false`. Only use `qr_scan` if a valid QR token exists and is consumed by the database function.

For events requiring onboarding acknowledgment, insert a valid `onboarding_acknowledgments` row for the current `onboarding_version` before checking in. The table is append-only; use `app_tick` and never update or delete those records.

### 7.4 Coordinator/event history

New events automatically receive an initial `event_coordinator_history` row from `trg_events_after_insert`. A coordinator reassignment automatically appends another row. The history table is append-only. Do not insert, update, or delete history rows directly.

Use a limited number of coordinator reassignments among the still-open events to create real history examples, and record a meaningful synthetic reason through the database's supported `app.reason` session setting. Do not change the immutable event owner. Do not reassign completed or cancelled events, which are frozen.

### 7.5 Feedback and interests

Use only `charity_fields.code` values already present in the clone. Create diverse volunteer interests and event-charity links. Feedback must satisfy the allowed direction/target rules, 1–5 score bounds, normalized tags, and unique rater/event/direction constraints. All comments must be synthetic and must not describe real people or make claims about actual partners.

### 7.6 Excluded tables and records

Do not seed any of the following as part of this plan:

- `auth_otp` or `auth_otp_challenge`
- `django_session` or `authtoken_token` authentication credentials
- Real user passwords or login tokens
- `user_verification_images` or files under `backend/private_media/verification_images/`
- `attendance_geo_attempts` with fabricated coordinates
- Direct `audit_logs` rows (audit triggers generate them)
- New `charity_fields` or other reference-data taxonomy

Do not turn off append-only triggers or audit triggers to make the seed easier.

## 8. Recommended generated file layout

Gemini CLI should create the following generated bundle under `seeding/ai_seed_bundle/`:

```text
seeding/ai_seed_bundle/
  README.md
  generate_seed_bundle.py
  run_all.sql
  00_preflight.sql
  01_users/
    users_001_100.sql
    users_101_200.sql
    users_201_300.sql
    users_301_400.sql
    users_401_500.sql
  02_coordinator_profiles.sql
  03_user_interests_and_availability.sql
  04_event_metadata.sql
  05_events_and_posts.sql
  06_applications_and_assignments.sql
  07_attendance_and_onboarding.sql
  08_feedback_and_coordinator_changes.sql
  09_validation_report.sql
```

The Python generator should output five user SQL files and the data metadata files. The SQL should resolve generated IDs using `phone_hash` or other stable natural keys, never by assuming a particular identity sequence value. The event metadata should be generated once and retained with the SQL bundle so re-running SQL uses the same stable event names and natural keys.

`run_all.sql` should include files in dependency order and be the only file the operator needs to invoke for a complete run. It should not silently call Python or perform external network access. The generator is a separate local preparation step and prints only a redacted summary.

## 9. Validation report and acceptance gates

The final validation SQL should output counts and invariant checks, without printing raw phone numbers, phone hashes, ciphertext, tokens, or private user fields.

Required gates:

1. Exactly 500 synthetic users are accounted for by the manifest and five SQL batches (100 each).
2. Exactly 450 synthetic volunteer accounts, 20 pending coordinator applicants, and 30 newly approved coordinators are present.
3. No new admin account is created; the original admins still exist and remain active.
4. Every synthetic `phone_hash` is unique and matches the HMAC generated by the current application helper; raw phone values are not present in Git-tracked SQL.
5. All synthetic phones match the requested `+959` format and subscriber-length/prefix rules.
6. No existing user, coordinator, event, application, assignment, attendance, audit, OTP, or session row was deleted or rewritten by the seed.
7. Final total event count is greater than 100 and less than 200; target is 185 when the original count is 35.
8. Events exist across all five regions with the expected status distribution, and future published events do not exceed 2027-03-31.
9. Every event owner/current coordinator points to an approved coordinator profile.
10. Every event has coherent posts and its status/lifecycle timestamps satisfy database constraints.
11. Applications obey the one-active-application rules; assignments are created through the existing PostgreSQL path; there are no schedule overlaps among active assignments.
12. Attendance rows have valid assignment/event/user linkage and valid non-geo evidence fields; no false GPS data is created.
13. Event coordinator history rows were created by the existing triggers and are append-only.
14. Interests and event charity links reference existing `charity_fields.code` values.
15. The existing database preflight script still passes after seeding.
16. A second execution of the same bundle does not duplicate or mutate the cohort.

The `README.md` should document the exact command, expected database name, required environment variables, expected output counts, and rollback/recovery procedure. The rollback procedure should be restore-from-backup or recreate the disposable clone, not broad deletion of rows from the shared working database.

## 10. AI chat memory: last two exchanges

### 10.1 What memory means in this version

For V1, interpret “memory of two previous chats” as the last **two user/assistant exchanges in the currently open chat** (up to four messages: user, assistant, user, assistant). This provides lightweight continuity such as remembering that a user was asking about a particular event, skill, date, or earlier recommendation.

This is not long-term personal memory and does not mean the model permanently remembers a user across devices or separate chat sessions. If the product requirement later means “remember the last two separate sessions after logout/app restart”, that is a different feature and needs a persistent storage design and privacy/retention policy. It is not part of this schema-frozen V1.

### 10.2 Why the model needs the context resent

The model API should be treated as stateless between requests. A new request does not automatically know the previous request's messages. The backend must send the current system instructions, the validated recent conversation, and the current tool results/context on every call.

Use four distinct context layers:

1. **System instructions:** fixed, backend-controlled assistant policy and role-specific security rules; never supplied or replaced by the mobile client.
2. **Live application context:** current user identity from the authenticated request and current database facts fetched by read-only server-side services/tools on this turn.
3. **Curated system knowledge:** approved, versioned project/help content that is separate from user chat memory.
4. **Short-term chat memory:** only the last two exchanges in this open chat, sent with the current request for conversational continuity.

The database and current authorized tools are the source of truth for event statuses, user profile facts, assignments, attendance, and coordinator permissions. A prior assistant answer in the conversation is not an authoritative source for current database state.

### 10.3 V1 request contract

The proposed `POST /api/v1/assistant/chat/` request should contain:

```json
{
  "message": "Can you compare those two events?",
  "conversation": [
    {"role": "user", "content": "Find volunteer events near Bahan."},
    {"role": "assistant", "content": "I found two matching events..."},
    {"role": "user", "content": "Which one needs first-aid volunteers?"},
    {"role": "assistant", "content": "The community support event lists first aid..."}
  ],
  "language": "en"
}
```

The above is illustrative, not a guarantee that the API has been implemented. The final serializer and OpenAPI contract must be reviewed before Gemini wires the mobile UI.

Validation rules:

- `message` is required, bounded in length, and treated as untrusted user input.
- `conversation` is optional and contains no more than four prior messages.
- Only `user` and `assistant` roles are accepted. Reject `system`, `developer`, `tool`, and arbitrary role values from the client.
- Each message has a strict text-length limit and the entire conversation has a total character/token budget. A reasonable starting budget is 6,000–8,000 characters total for the four-message history, then tune from measured token use.
- Normalize empty/whitespace-only content and reject malformed structures.
- Drop older turns beyond the two-exchange limit on the server, even if the client sends more.
- Never accept client-supplied `user_id`, `is_admin`, `is_coordinator`, permissions, tool results, or system prompt fields as trusted context.
- The backend determines user identity and authorization from the validated access token/session and current database state.

### 10.4 Client and server responsibilities

For V1, the mobile chat screen keeps the current conversation in memory and sends the last two exchanges on each call. On each response it appends the new assistant message and trims the local history to the latest two exchanges plus the current turn. The backend independently validates and truncates the history before composing the model request.

No chat transcripts are written to PostgreSQL in V1. Closing/resetting the chat or logging out clears the in-memory conversation. This avoids adding a new chat-history table to the frozen schema and reduces retention/privacy burden.

The backend must not rely on the client history as trusted evidence. Treat all history text, including prior assistant output, as untrusted context that may contain prompt injection or stale information. It may help resolve pronouns and follow-up references, but current facts must be re-fetched through the user's authorized read-only tools.

### 10.5 Privacy and context redaction

Do not include any of the following in chat memory or prompts:

- Raw phone numbers, `phone_hash`, `phone_enc`, emergency-contact phone values
- Passwords, OTPs, OTP hashes, session tokens, challenge tokens, authentication keys
- Private verification image paths/content or identity-document data
- Raw GPS/check-in coordinates or device telemetry unless a narrowly defined authorized use case requires a derived, privacy-reviewed result
- Another user's personal profile or private event information the current user is not authorized to access

Use output allowlists per assistant tool. Never pass a full Django user/profile model or raw database row to the LLM. Summarize only the minimum approved facts and attach source/entity identifiers that the user is permitted to see.

### 10.6 Future persistent memory (not V1)

If later required to remember across separate chat sessions, evaluate an explicit server-side conversation store with:

- User ownership and strict tenant isolation
- Encryption at rest and retention limits
- User-visible clear/delete controls
- Data export and deletion handling
- Redaction before model submission
- Explicit policy on whether conversations may be reused for personalization
- Audit and access controls

That requires a separate schema/governance decision and migration approval. Do not smuggle it into this phase or add a generic JSON blob to an unrelated table.

## 11. Responsibilities: GPT, Gemini CLI, and operator

### GPT / architecture and review owner

- Validate the frozen DB contract and this seed specification.
- Review generator use of the real phone HMAC and encryption helpers.
- Review target-database safety, idempotency, and transaction design.
- Review coordinator approval/event lifecycle/assignment/attendance trigger interactions.
- Review chat memory validation, authenticated identity handling, privacy, prompt-injection boundaries, read-only tool authorization, and final API contract.
- Reject any generated code that adds schema objects or bypasses database guards.

### Gemini CLI / implementation and bulk generation owner

- Generate the Python cohort/metadata generator and five 100-user SQL batches.
- Generate event metadata for the five city clusters and lifecycle/date distribution.
- Generate the append-only SQL orchestration, validation report, and operator README.
- Generate synthetic skills, interests, availability, posts, applications, and feedback within the declared constraints.
- Generate chat UI, API DTO wiring, tests, and short-term four-message conversation-state handling after the API contract is frozen.
- Use the repository's existing functions and services rather than creating another phone crypto implementation or a second assignment engine.

### Operator / database execution owner

- Create/verify the disposable clone and backup.
- Configure the existing Django phone HMAC/encryption keys locally.
- Run the Python generator locally; inspect redacted output.
- Review all generated SQL and validation gates.
- Run `psql` manually against the disposable database.
- Review final counts and reports before treating the dataset as ready for AI testing.

## 12. Execution phases

### Phase 0 — Freeze and verify the target

- Re-check the current schema version and existing preflight.
- Create a disposable clone and backup.
- Record starting counts for all relevant tables and identify the original two admins without exposing their private details.
- Confirm that local SMS delivery is disabled.

### Phase 1 — Build user cohort and cryptographic manifest

- Gemini implements the local Python generator using the existing normalization/HMAC/encryption helpers.
- Generate 500 users, then split into five 100-user SQL files.
- Review phone format counts, HMAC uniqueness, no collision with existing hashes, and redacted logs.
- Insert users without touching existing accounts.

### Phase 2 — Coordinator profiles and volunteer metadata

- Create 20 pending and 30 approved coordinator profiles through valid status transitions.
- Use one of the existing active admins as approver; do not create an admin.
- Ensure all 50 synthetic coordinator accounts are active and carry only clearly marked test verification status.
- Insert interests and availability rows for the synthetic cohort.
- Verify role totals and active/verified prerequisites.

### Phase 3 — Events and event posts

- Generate 150 new events if the live baseline remains 35, targeting 185 total.
- Distribute 30 each across Yangon, Mandalay, Pyay, Bago, and Magway.
- Create posts before publishing.
- Initially publish/activate with a valid provisional future schedule, then populate applications/assignments before finalizing historical completed/cancelled states.
- Retiming historical occurrence dates must be validated against the exact triggers on a disposable clone; never directly forge lifecycle timestamps.
- Ensure 30 published future events extend through 2027-03-31.

### Phase 4 — Applications, assignments, and attendance

- Create varied applications while events are open and deadlines are valid.
- Let the database create assignments from accepted applications.
- Respect assignment schedule exclusion and post capacity.
- Create attendance via existing triggers and perform only valid state changes.
- Use non-GPS manual check-in fixtures; do not fabricate location evidence.

### Phase 5 — Rich history and validation

- Add onboarding acknowledgments, feedback, and controlled coordinator changes.
- Run all invariant queries and the existing preflight.
- Verify repeat-run idempotency on the disposable clone.
- Mark dataset ready only after all acceptance gates pass.

### Phase 6 — Begin AI implementation

- Freeze the chat API contract and tool registry.
- Implement short-term memory as two exchanges in active chat state.
- Implement backend retrieval through existing authorized services and curated knowledge.
- Test the assistant against volunteer, pending coordinator, approved coordinator, and admin roles across all five regions and every event status.

## 13. AI test scenarios enabled by this data

At minimum, the new dataset should support tests for:

- Volunteer asks for events in their home city matching a skill or availability window.
- Volunteer asks which events they applied to, were assigned to, checked into, or completed.
- Follow-up question resolves “that event” or “the second one” using the two-exchange chat memory.
- Assistant refreshes current event data from the DB rather than relying on stale history.
- Pending coordinator applicant asks what they can do; answer must not grant approved-coordinator tools.
- Approved coordinator asks for staffing/attendance summaries for their own events only.
- Coordinator attempts to query another coordinator's private event; permission must be denied/masked by backend authorization.
- Admin asks for aggregate counts across all five regions and a summary of completed/cancelled/upcoming events.
- Event discovery includes future published events but does not expose drafts to unauthorized users.
- Assistant distinguishes synthetic test scenarios from real-world events and never represents test attendance/GPS as verified facts.
- Assistant has no ability to accept/reject applications, assign volunteers, alter events, or mutate accounts in V1.

## 14. Explicit non-goals and hard stops

- Do not rewrite all existing users or their phone numbers.
- Do not truncate or reset identities, audit logs, OTPs, or event history.
- Do not seed 500 fake users on top of the existing database without first using the disposable clone.
- Do not add persistent chat memory or vector tables to the frozen schema.
- Do not fabricate verification images, emergency contacts, OTPs, tokens, passwords, or GPS evidence.
- Do not generate new database roles or admin accounts.
- Do not directly insert assignment/attendance/history records in a way that bypasses database functions and triggers.
- Do not use the generated Myanmar numbers for real SMS/OTP delivery.
- Do not use this synthetic dataset to claim real volunteer participation, real charity activity, or verified identity.
- Do not begin AI model/tool implementation until the seed data and validation report are accepted.

---

## 15. Implementation prompt for Gemini CLI

Use this section as the task brief when asking Gemini CLI to implement the seed bundle.

> Read `docs/full_database_details.md`, `postgres_sql/updated_volunteer_coordination_system_Database.sql`, `backend/common/security.py`, `backend/admin_portal/phone_utils.py`, `backend/services/coordinator_service.py`, `backend/services/assignment_service.py`, `scripts/seed_integration_fixtures.py`, and this specification before editing code.
>
> Implement the synthetic seed bundle exactly as specified in `docs/AI_CHAT_MEMORY_AND_SYNTHETIC_SEED_DATA_PLAN.md`. Do not alter the database schema or any existing records. Do not reuse `seeding/seed_data.sql`; it is destructive. Generate 500 additional synthetic users split into five SQL files of exactly 100 each (90 volunteers, 4 pending coordinator applicants, 6 approved coordinators per file). Preserve all existing users and admins. Generate 150 additional events only when the live baseline requires it to reach 185 total, with a hard stop before 200 total; distribute 30 per region across Yangon, Mandalay, Pyay, Bago, and Magway. Create varied event posts, applications, valid assignments via the PostgreSQL workflow, attendance, interests, availability, acknowledgments, feedback, and coordinator history via existing triggers.
>
> Implement phone generation in Python. Import and call the project's existing Myanmar normalization, `compute_phone_hash`, and `encrypt_phone` helpers. Do not implement a new hash algorithm and do not hardcode secrets. Generate random subscriber portions using the exact 7/8/9-digit prefixes defined in the specification. Never print or commit raw phone numbers, hashes, ciphertext, keys, tokens, or private manifest contents. Add the local manifest path to `.gitignore`.
>
> The SQL master file must be psql-runnable by the operator, guarded to the disposable local clone, idempotent, transactional, and fail-fast. It must not truncate, delete, drop, disable triggers, reset sequences, or mutate existing rows. It must use valid state transitions and let database triggers/functions generate history, assignments, attendance, and audit rows. Include a redacted validation report and a README with exact operator commands. Do not run the SQL or connect to the user's database.
>
> Before declaring completion, run static checks and tests against a disposable local database or a schema-faithful test fixture. Report any behavior you could not verify. Ask GPT to review security-sensitive phone handling, DB safety, and trigger interactions before the operator runs `psql`.

## 16. Definition of done

The seeding phase is complete only when:

- The five user SQL files contain exactly 100 users each.
- The 500 synthetic users are split 450/20/30 as specified.
- All user phone hashes and phone encryption values are generated by the existing application helpers.
- The target is the disposable clone and existing records are preserved.
- Event count is 101–199 (target 185), with the specified five-region spread and future horizon.
- Related event workflow data is generated through the schema's existing constraints/triggers/functions.
- All validation gates pass, including the existing DB preflight and repeat-run idempotency test.
- The generator and SQL files contain no secrets, raw phone values, real personal information, or destructive operations.
- The operator has reviewed the SQL and personally executed it against the disposable clone.

Only after these conditions are met should AI chat implementation move from planning to coding.
