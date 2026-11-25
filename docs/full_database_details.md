# Complete Database Architecture & Schema Specification

**Database Name:** `volunteer_coordination_db`  
**Engine:** PostgreSQL 18.6 with `btree_gist` and native `uuidv7()`  
**Host / Port:** `127.0.0.1:5432`  
**Canonical DDL:** `postgres_sql/VCS_db.sql`  
**Contract Status:** DATABASE FROZEN — Immutable Schema Contract as of v0.12.0 Stabilization  
**Generated At:** 2026-11-20 22:15:27 | **Audit Verified:** 2026-11-24 (Read-Only Audit & Disposable Bootstrap Parity PASS: [DB_SOURCE_OF_TRUTH_REPORT.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/audit/DB_SOURCE_OF_TRUTH_REPORT.md))  
**Safety Script:** `scripts/db_preflight_check.py` (Read-only validation of frozen contract)  

---

## 1. Database Overview & Engine Metadata

- **Server Version:** `PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit`
- **Database Disk Size:** `14 MB`
- **Encoding / Collation:** `UTF8` / `English_United States.1252`

## 2. Table Catalog & Statistics

Total Base Tables: **31**

| # | Table Name | Row Count | Total Size | Description / Role |
|:---|:---|:---|:---|:---|
| 1 | `app_settings` | 7 | 32 kB | N/A |
| 2 | `assignments` | 58 | 200 kB | N/A |
| 3 | `attendance` | 58 | 128 kB | N/A |
| 4 | `attendance_geo_attempts` | 2 | 64 kB | N/A |
| 5 | `audit_logs` | 1,356 | 968 kB | N/A |
| 6 | `auth_group` | 0 | 24 kB | N/A |
| 7 | `auth_group_permissions` | 0 | 32 kB | N/A |
| 8 | `auth_otp` | 84 | 120 kB | N/A |
| 9 | `auth_otp_challenge` | 81 | 120 kB | N/A |
| 10 | `auth_permission` | 156 | 88 kB | N/A |
| 11 | `authtoken_token` | 192 | 144 kB | N/A |
| 12 | `charity_fields` | 13 | 32 kB | N/A |
| 13 | `coordinator_profiles` | 68 | 96 kB | N/A |
| 14 | `django_admin_log` | 0 | 32 kB | N/A |
| 15 | `django_content_type` | 39 | 40 kB | N/A |
| 16 | `django_migrations` | 31 | 32 kB | N/A |
| 17 | `django_session` | 8 | 64 kB | N/A |
| 18 | `event_applications` | 60 | 160 kB | N/A |
| 19 | `event_charity_fields` | 33 | 80 kB | N/A |
| 20 | `event_coordinator_history` | 37 | 48 kB | N/A |
| 21 | `event_posts` | 40 | 160 kB | N/A |
| 22 | `events` | 35 | 144 kB | N/A |
| 23 | `feedback` | 8 | 136 kB | N/A |
| 24 | `moderation_actions` | 12 | 80 kB | N/A |
| 25 | `onboarding_acknowledgments` | 39 | 64 kB | N/A |
| 26 | `qr_tokens` | 4 | 80 kB | N/A |
| 27 | `user_charity_interests` | 80 | 80 kB | N/A |
| 28 | `user_verification_images` | 76 | 144 kB | N/A |
| 29 | `users` | 233 | 328 kB | N/A |
| 30 | `volunteer_availability_exceptions` | 0 | 32 kB | N/A |
| 31 | `volunteer_availability_rules` | 245 | 112 kB | N/A |

---

## 3. Comprehensive Table Specifications

### 3.1 Table: `app_settings`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `key` | `text` | NO | - | **YES** |
| `value_int` | `integer` | NO | - | NO |
| `description` | `text` | YES | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_app_settings_key` | `CHECK` | `CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))` |
| `app_settings_key_not_null` | `n` | `NOT NULL key` |
| `app_settings_value_int_not_null` | `n` | `NOT NULL value_int` |
| `app_settings_pkey` | `PRIMARY KEY` | `PRIMARY KEY (key)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `app_settings_pkey` | `CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (key)` |

#### Triggers

*No user triggers attached.*

---

### 3.2 Table: `assignments`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `application_id` | `bigint` | NO | - | NO |
| `user_id` | `bigint` | NO | - | NO |
| `post_id` | `bigint` | YES | - | NO |
| `group_code` | `text` | YES | - | NO |
| `is_group_leader` | `boolean` | NO | `false` | NO |
| `status` | `text` | NO | `'assigned'::text` | NO |
| `assigned_by` | `text` | NO | `'auto'::text` | NO |
| `assigned_by_user_id` | `bigint` | YES | - | NO |
| `schedule_start` | `timestamp with time zone` | NO | - | NO |
| `schedule_end` | `timestamp with time zone` | NO | - | NO |
| `confirmed_at` | `timestamp with time zone` | YES | - | NO |
| `cancelled_at` | `timestamp with time zone` | YES | - | NO |
| `cancel_reason` | `text` | YES | - | NO |
| `conditions_snapshot` | `jsonb` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_assignment_actor` | `CHECK` | `CHECK (((assigned_by = 'auto'::text) = (assigned_by_user_id IS NULL)))` |
| `ck_assignment_assigned_by` | `CHECK` | `CHECK ((assigned_by = ANY (ARRAY['auto'::text, 'coordinator'::text, 'admin'::text])))` |
| `ck_assignment_cancelled_at` | `CHECK` | `CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)))` |
| `ck_assignment_confirmed_at` | `CHECK` | `CHECK ((((status = ANY (ARRAY['confirmed'::text, 'completed'::text])) AND (confirmed_at IS NOT NULL)) OR (status = ANY (ARRAY['assigned'::text, 'cancelled'::text, 'completed'::text]))))` |
| `ck_assignment_leader_group` | `CHECK` | `CHECK (((NOT is_group_leader) OR (group_code IS NOT NULL)))` |
| `ck_assignment_schedule` | `CHECK` | `CHECK ((schedule_end > schedule_start))` |
| `ck_assignment_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['assigned'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text])))` |
| `assignments_assigned_by_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `fk_assignments_application` | `FOREIGN KEY` | `FOREIGN KEY (application_id, event_id, user_id) REFERENCES event_applications(id, event_id, user_id) ON DELETE RESTRICT` |
| `fk_assignments_post_event` | `FOREIGN KEY` | `FOREIGN KEY (post_id, event_id) REFERENCES event_posts(id, event_id) ON DELETE RESTRICT` |
| `assignments_application_id_not_null` | `n` | `NOT NULL application_id` |
| `assignments_assigned_by_not_null` | `n` | `NOT NULL assigned_by` |
| `assignments_created_at_not_null` | `n` | `NOT NULL created_at` |
| `assignments_event_id_not_null` | `n` | `NOT NULL event_id` |
| `assignments_id_not_null` | `n` | `NOT NULL id` |
| `assignments_is_group_leader_not_null` | `n` | `NOT NULL is_group_leader` |
| `assignments_schedule_end_not_null` | `n` | `NOT NULL schedule_end` |
| `assignments_schedule_start_not_null` | `n` | `NOT NULL schedule_start` |
| `assignments_status_not_null` | `n` | `NOT NULL status` |
| `assignments_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `assignments_user_id_not_null` | `n` | `NOT NULL user_id` |
| `assignments_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_assignments_id_event_user` | `UNIQUE` | `UNIQUE (id, event_id, user_id)` |
| `ex_assignments_no_overlap` | `x` | `EXCLUDE USING gist (user_id WITH =, tstzrange(schedule_start, schedule_end, '[)'::text) WITH &&) WHERE ((status <> 'cancelled'::text))` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `assignments_pkey` | `CREATE UNIQUE INDEX assignments_pkey ON public.assignments USING btree (id)` |
| `ex_assignments_no_overlap` | `CREATE INDEX ex_assignments_no_overlap ON public.assignments USING gist (user_id, tstzrange(schedule_start, schedule_end, '[)'::text)) WHERE (status <> 'cancelled'::text)` |
| `idx_assignments_event` | `CREATE INDEX idx_assignments_event ON public.assignments USING btree (event_id, status)` |
| `idx_assignments_post` | `CREATE INDEX idx_assignments_post ON public.assignments USING btree (post_id) WHERE (post_id IS NOT NULL)` |
| `idx_assignments_user` | `CREATE INDEX idx_assignments_user ON public.assignments USING btree (user_id)` |
| `uq_assignment_active` | `CREATE UNIQUE INDEX uq_assignment_active ON public.assignments USING btree (event_id, user_id) WHERE (status <> 'cancelled'::text)` |
| `uq_assignment_application` | `CREATE UNIQUE INDEX uq_assignment_application ON public.assignments USING btree (application_id) WHERE (status <> 'cancelled'::text)` |
| `uq_assignment_group_leader` | `CREATE UNIQUE INDEX uq_assignment_group_leader ON public.assignments USING btree (event_id, group_code) WHERE (is_group_leader AND (status <> 'cancelled'::text))` |
| `uq_assignments_id_event_user` | `CREATE UNIQUE INDEX uq_assignments_id_event_user ON public.assignments USING btree (id, event_id, user_id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_assignments_before_insert` | `CREATE TRIGGER trg_01_assignments_before_insert BEFORE INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION trg_assignments_before_insert()` |
| `trg_01_assignments_before_update` | `CREATE TRIGGER trg_01_assignments_before_update BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION trg_assignments_before_update()` |
| `trg_50_assignments_after_insert` | `CREATE TRIGGER trg_50_assignments_after_insert AFTER INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION trg_assignments_after_insert()` |
| `trg_50_assignments_after_update` | `CREATE TRIGGER trg_50_assignments_after_update AFTER UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION trg_assignments_after_update()` |
| `trg_90_assignments_updated_at` | `CREATE TRIGGER trg_90_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_assignments_audit` | `CREATE TRIGGER trg_95_assignments_audit AFTER INSERT OR UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.3 Table: `attendance`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `user_id` | `bigint` | NO | - | NO |
| `assignment_id` | `bigint` | NO | - | NO |
| `qr_token_id` | `bigint` | YES | - | NO |
| `status` | `text` | NO | `'expected'::text` | NO |
| `checkin_at` | `timestamp with time zone` | YES | - | NO |
| `checkout_at` | `timestamp with time zone` | YES | - | NO |
| `method` | `text` | YES | - | NO |
| `recorded_by_user_id` | `bigint` | YES | - | NO |
| `walk_in_flag` | `boolean` | NO | `false` | NO |
| `note` | `text` | YES | - | NO |
| `checkin_latitude` | `numeric` | YES | - | NO |
| `checkin_longitude` | `numeric` | YES | - | NO |
| `checkin_accuracy_m` | `numeric` | YES | - | NO |
| `checkin_distance_m` | `numeric` | YES | - | NO |
| `geo_verified` | `boolean` | NO | `false` | NO |
| `confirmation_status` | `text` | NO | `'not_required'::text` | NO |
| `confirmed_by_user_id` | `bigint` | YES | - | NO |
| `confirmed_at` | `timestamp with time zone` | YES | - | NO |
| `confirmation_note` | `text` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_attendance_checkin` | `CHECK` | `CHECK (((status <> ALL (ARRAY['checked_in'::text, 'completed'::text])) OR ((checkin_at IS NOT NULL) AND (method IS NOT NULL))))` |
| `ck_attendance_checkout` | `CHECK` | `CHECK (((checkout_at IS NULL) OR ((checkin_at IS NOT NULL) AND (checkout_at >= checkin_at))))` |
| `ck_attendance_confirmation_state` | `CHECK` | `CHECK (((confirmation_status = 'not_required'::text) OR ((confirmation_status = ANY (ARRAY['pending'::text, 'confirmed'::text])) AND (method = 'geo'::text) AND (status = ANY (ARRAY['checked_in'::text, 'completed'::text]))) OR ((confirmation_status = 'rejected'::text) AND (status = ANY (ARRAY['expected'::text, 'absent'::text, 'cancelled'::text])))))` |
| `ck_attendance_confirmation_status` | `CHECK` | `CHECK ((confirmation_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text])))` |
| `ck_attendance_decision` | `CHECK` | `CHECK (((confirmation_status = ANY (ARRAY['confirmed'::text, 'rejected'::text])) = ((confirmed_by_user_id IS NOT NULL) AND (confirmed_at IS NOT NULL))))` |
| `ck_attendance_geo_columns` | `CHECK` | `CHECK ((((method = 'geo'::text) AND geo_verified AND (checkin_accuracy_m IS NOT NULL) AND (checkin_distance_m IS NOT NULL)) OR ((method IS DISTINCT FROM 'geo'::text) AND (NOT geo_verified) AND (checkin_latitude IS NULL) AND (checkin_longitude IS NULL) AND (checkin_accuracy_m IS NULL) AND (checkin_distance_m IS NULL))))` |
| `ck_attendance_geo_pair` | `CHECK` | `CHECK (((checkin_latitude IS NULL) = (checkin_longitude IS NULL)))` |
| `ck_attendance_lat_range` | `CHECK` | `CHECK (((checkin_latitude IS NULL) OR ((checkin_latitude >= ('-90'::integer)::numeric) AND (checkin_latitude <= (90)::numeric))))` |
| `ck_attendance_lng_range` | `CHECK` | `CHECK (((checkin_longitude IS NULL) OR ((checkin_longitude >= ('-180'::integer)::numeric) AND (checkin_longitude <= (180)::numeric))))` |
| `ck_attendance_method` | `CHECK` | `CHECK (((method IS NULL) OR (method = ANY (ARRAY['qr_scan'::text, 'coordinator_manual'::text, 'geo'::text, 'system'::text]))))` |
| `ck_attendance_method_manual` | `CHECK` | `CHECK (((method IS DISTINCT FROM 'coordinator_manual'::text) OR (recorded_by_user_id IS NOT NULL)))` |
| `ck_attendance_method_qr` | `CHECK` | `CHECK (((method IS DISTINCT FROM 'qr_scan'::text) OR (qr_token_id IS NOT NULL)))` |
| `ck_attendance_no_evidence_without_checkin` | `CHECK` | `CHECK (((status = ANY (ARRAY['checked_in'::text, 'completed'::text])) OR ((checkin_at IS NULL) AND (checkout_at IS NULL) AND (method IS NULL))))` |
| `ck_attendance_no_self_confirm` | `CHECK` | `CHECK (((confirmed_by_user_id IS NULL) OR (confirmed_by_user_id <> user_id)))` |
| `ck_attendance_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['expected'::text, 'checked_in'::text, 'absent'::text, 'completed'::text, 'cancelled'::text])))` |
| `ck_attendance_walkin_method` | `CHECK` | `CHECK (((NOT walk_in_flag) OR (method IS NULL) OR (method = ANY (ARRAY['qr_scan'::text, 'coordinator_manual'::text]))))` |
| `attendance_confirmed_by_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `attendance_recorded_by_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `fk_attendance_assignment` | `FOREIGN KEY` | `FOREIGN KEY (assignment_id, event_id, user_id) REFERENCES assignments(id, event_id, user_id) ON DELETE RESTRICT` |
| `fk_attendance_qr_event` | `FOREIGN KEY` | `FOREIGN KEY (qr_token_id, event_id) REFERENCES qr_tokens(id, event_id) ON DELETE RESTRICT` |
| `attendance_assignment_id_not_null` | `n` | `NOT NULL assignment_id` |
| `attendance_confirmation_status_not_null` | `n` | `NOT NULL confirmation_status` |
| `attendance_created_at_not_null` | `n` | `NOT NULL created_at` |
| `attendance_event_id_not_null` | `n` | `NOT NULL event_id` |
| `attendance_geo_verified_not_null` | `n` | `NOT NULL geo_verified` |
| `attendance_id_not_null` | `n` | `NOT NULL id` |
| `attendance_status_not_null` | `n` | `NOT NULL status` |
| `attendance_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `attendance_user_id_not_null` | `n` | `NOT NULL user_id` |
| `attendance_walk_in_flag_not_null` | `n` | `NOT NULL walk_in_flag` |
| `attendance_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_attendance_event_user` | `UNIQUE` | `UNIQUE (event_id, user_id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `attendance_pkey` | `CREATE UNIQUE INDEX attendance_pkey ON public.attendance USING btree (id)` |
| `idx_attendance_event_status` | `CREATE INDEX idx_attendance_event_status ON public.attendance USING btree (event_id, status)` |
| `idx_attendance_pending_confirmation` | `CREATE INDEX idx_attendance_pending_confirmation ON public.attendance USING btree (event_id) WHERE (confirmation_status = 'pending'::text)` |
| `idx_attendance_user` | `CREATE INDEX idx_attendance_user ON public.attendance USING btree (user_id)` |
| `uq_attendance_event_user` | `CREATE UNIQUE INDEX uq_attendance_event_user ON public.attendance USING btree (event_id, user_id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_attendance_before_insert` | `CREATE TRIGGER trg_01_attendance_before_insert BEFORE INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION trg_attendance_before_insert()` |
| `trg_01_attendance_guard` | `CREATE TRIGGER trg_01_attendance_guard BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION trg_attendance_guard()` |
| `trg_90_attendance_updated_at` | `CREATE TRIGGER trg_90_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_attendance_audit` | `CREATE TRIGGER trg_95_attendance_audit AFTER INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION trg_audit_row('checkin_latitude', 'checkin_longitude')` |

---

### 3.4 Table: `attendance_geo_attempts`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `user_id` | `bigint` | NO | - | NO |
| `attendance_id` | `bigint` | YES | - | NO |
| `attempted_at` | `timestamp with time zone` | NO | `now()` | NO |
| `latitude` | `numeric` | YES | - | NO |
| `longitude` | `numeric` | YES | - | NO |
| `accuracy_m` | `numeric` | YES | - | NO |
| `captured_at` | `timestamp with time zone` | YES | - | NO |
| `device_mocked` | `boolean` | NO | `false` | NO |
| `distance_m` | `numeric` | YES | - | NO |
| `radius_m` | `integer` | YES | - | NO |
| `result` | `text` | NO | - | NO |
| `review_status` | `text` | NO | `'none'::text` | NO |
| `reviewed_by_user_id` | `bigint` | YES | - | NO |
| `reviewed_at` | `timestamp with time zone` | YES | - | NO |
| `review_note` | `text` | YES | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_geo_attempt_lat` | `CHECK` | `CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))))` |
| `ck_geo_attempt_lng` | `CHECK` | `CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))` |
| `ck_geo_attempt_result` | `CHECK` | `CHECK ((result = ANY (ARRAY['accepted'::text, 'already_checked_in'::text, 'invalid_fix'::text, 'low_accuracy'::text, 'stale_fix'::text, 'mock_location'::text, 'outside_geofence'::text, 'window_closed'::text, 'event_not_active'::text, 'geo_disabled'::text, 'not_assigned'::text, 'not_eligible'::text, 'onboarding_required'::text])))` |
| `ck_geo_attempt_review_status` | `CHECK` | `CHECK ((review_status = ANY (ARRAY['none'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text])))` |
| `attendance_geo_attempts_attendance_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE RESTRICT` |
| `attendance_geo_attempts_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `attendance_geo_attempts_reviewed_by_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `attendance_geo_attempts_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `attendance_geo_attempts_attempted_at_not_null` | `n` | `NOT NULL attempted_at` |
| `attendance_geo_attempts_device_mocked_not_null` | `n` | `NOT NULL device_mocked` |
| `attendance_geo_attempts_event_id_not_null` | `n` | `NOT NULL event_id` |
| `attendance_geo_attempts_id_not_null` | `n` | `NOT NULL id` |
| `attendance_geo_attempts_result_not_null` | `n` | `NOT NULL result` |
| `attendance_geo_attempts_review_status_not_null` | `n` | `NOT NULL review_status` |
| `attendance_geo_attempts_user_id_not_null` | `n` | `NOT NULL user_id` |
| `attendance_geo_attempts_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `attendance_geo_attempts_pkey` | `CREATE UNIQUE INDEX attendance_geo_attempts_pkey ON public.attendance_geo_attempts USING btree (id)` |
| `idx_geo_attempts_attendance` | `CREATE INDEX idx_geo_attempts_attendance ON public.attendance_geo_attempts USING btree (attendance_id) WHERE (attendance_id IS NOT NULL)` |
| `idx_geo_attempts_event_user` | `CREATE INDEX idx_geo_attempts_event_user ON public.attendance_geo_attempts USING btree (event_id, user_id, attempted_at DESC)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_geo_attempts_guard` | `CREATE TRIGGER trg_01_geo_attempts_guard BEFORE UPDATE ON public.attendance_geo_attempts FOR EACH ROW EXECUTE FUNCTION trg_geo_attempts_guard()` |
| `trg_01_geo_attempts_no_delete` | `CREATE TRIGGER trg_01_geo_attempts_no_delete BEFORE DELETE ON public.attendance_geo_attempts FOR EACH ROW EXECUTE FUNCTION trg_block_mutation()` |

---

### 3.5 Table: `audit_logs`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `actor_user_id` | `bigint` | YES | - | NO |
| `action` | `text` | NO | - | NO |
| `entity_type` | `text` | NO | - | NO |
| `entity_id` | `bigint` | YES | - | NO |
| `before_data` | `jsonb` | YES | - | NO |
| `after_data` | `jsonb` | YES | - | NO |
| `ip_address` | `inet` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `audit_logs_actor_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `audit_logs_action_not_null` | `n` | `NOT NULL action` |
| `audit_logs_created_at_not_null` | `n` | `NOT NULL created_at` |
| `audit_logs_entity_type_not_null` | `n` | `NOT NULL entity_type` |
| `audit_logs_id_not_null` | `n` | `NOT NULL id` |
| `audit_logs_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `audit_logs_pkey` | `CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id)` |
| `idx_audit_actor` | `CREATE INDEX idx_audit_actor ON public.audit_logs USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL)` |
| `idx_audit_created` | `CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at)` |
| `idx_audit_entity` | `CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_audit_append_only` | `CREATE TRIGGER trg_01_audit_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION trg_block_mutation()` |
| `trg_01_audit_no_truncate` | `CREATE TRIGGER trg_01_audit_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION trg_block_mutation()` |

---

### 3.6 Table: `auth_group`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `integer` | NO | - | **YES** |
| `name` | `character varying(150)` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `auth_group_id_not_null` | `n` | `NOT NULL id` |
| `auth_group_name_not_null` | `n` | `NOT NULL name` |
| `auth_group_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `auth_group_name_key` | `UNIQUE` | `UNIQUE (name)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `auth_group_name_a6ea08ec_like` | `CREATE INDEX auth_group_name_a6ea08ec_like ON public.auth_group USING btree (name varchar_pattern_ops)` |
| `auth_group_name_key` | `CREATE UNIQUE INDEX auth_group_name_key ON public.auth_group USING btree (name)` |
| `auth_group_pkey` | `CREATE UNIQUE INDEX auth_group_pkey ON public.auth_group USING btree (id)` |

#### Triggers

*No user triggers attached.*

---

### 3.7 Table: `auth_group_permissions`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `group_id` | `integer` | NO | - | NO |
| `permission_id` | `integer` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` | `FOREIGN KEY` | `FOREIGN KEY (permission_id) REFERENCES auth_permission(id) DEFERRABLE INITIALLY DEFERRED` |
| `auth_group_permissions_group_id_b120cbf9_fk_auth_group_id` | `FOREIGN KEY` | `FOREIGN KEY (group_id) REFERENCES auth_group(id) DEFERRABLE INITIALLY DEFERRED` |
| `auth_group_permissions_group_id_not_null` | `n` | `NOT NULL group_id` |
| `auth_group_permissions_id_not_null` | `n` | `NOT NULL id` |
| `auth_group_permissions_permission_id_not_null` | `n` | `NOT NULL permission_id` |
| `auth_group_permissions_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` | `UNIQUE` | `UNIQUE (group_id, permission_id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `auth_group_permissions_group_id_b120cbf9` | `CREATE INDEX auth_group_permissions_group_id_b120cbf9 ON public.auth_group_permissions USING btree (group_id)` |
| `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` | `CREATE UNIQUE INDEX auth_group_permissions_group_id_permission_id_0cd325b0_uniq ON public.auth_group_permissions USING btree (group_id, permission_id)` |
| `auth_group_permissions_permission_id_84c5c92e` | `CREATE INDEX auth_group_permissions_permission_id_84c5c92e ON public.auth_group_permissions USING btree (permission_id)` |
| `auth_group_permissions_pkey` | `CREATE UNIQUE INDEX auth_group_permissions_pkey ON public.auth_group_permissions USING btree (id)` |

#### Triggers

*No user triggers attached.*

---

### 3.8 Table: `auth_otp`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `phone_hash` | `text` | NO | - | NO |
| `code_hash` | `text` | NO | - | NO |
| `purpose` | `text` | NO | `'login'::text` | NO |
| `attempt_count` | `integer` | NO | `0` | NO |
| `expires_at` | `timestamp with time zone` | NO | - | NO |
| `consumed_at` | `timestamp with time zone` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_auth_otp_attempt_count` | `CHECK` | `CHECK (((attempt_count >= 0) AND (attempt_count <= 100)))` |
| `ck_auth_otp_consumed` | `CHECK` | `CHECK (((consumed_at IS NULL) OR (consumed_at >= created_at)))` |
| `ck_auth_otp_expiry` | `CHECK` | `CHECK ((expires_at > created_at))` |
| `ck_auth_otp_purpose` | `CHECK` | `CHECK ((purpose = ANY (ARRAY['login'::text, 'qr_registration'::text])))` |
| `auth_otp_attempt_count_not_null` | `n` | `NOT NULL attempt_count` |
| `auth_otp_code_hash_not_null` | `n` | `NOT NULL code_hash` |
| `auth_otp_created_at_not_null` | `n` | `NOT NULL created_at` |
| `auth_otp_expires_at_not_null` | `n` | `NOT NULL expires_at` |
| `auth_otp_id_not_null` | `n` | `NOT NULL id` |
| `auth_otp_phone_hash_not_null` | `n` | `NOT NULL phone_hash` |
| `auth_otp_purpose_not_null` | `n` | `NOT NULL purpose` |
| `auth_otp_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `auth_otp_pkey` | `CREATE UNIQUE INDEX auth_otp_pkey ON public.auth_otp USING btree (id)` |
| `idx_auth_otp_expires` | `CREATE INDEX idx_auth_otp_expires ON public.auth_otp USING btree (expires_at)` |
| `idx_auth_otp_open` | `CREATE INDEX idx_auth_otp_open ON public.auth_otp USING btree (phone_hash, purpose) WHERE (consumed_at IS NULL)` |
| `idx_auth_otp_phone_created` | `CREATE INDEX idx_auth_otp_phone_created ON public.auth_otp USING btree (phone_hash, created_at DESC)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_otp_rate_limit` | `CREATE TRIGGER trg_01_otp_rate_limit BEFORE INSERT ON public.auth_otp FOR EACH ROW EXECUTE FUNCTION trg_otp_rate_limit()` |

---

### 3.9 Table: `auth_otp_challenge`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `otp_id` | `bigint` | NO | - | NO |
| `challenge_token_hash` | `text` | NO | - | NO |
| `purpose` | `text` | NO | `'login'::text` | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `expires_at` | `timestamp with time zone` | NO | - | NO |
| `consumed_at` | `timestamp with time zone` | YES | - | NO |
| `request_id` | `text` | YES | - | NO |
| `identity_nonce_hash` | `text` | YES | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_auth_otp_challenge_consumed` | `CHECK` | `CHECK (((consumed_at IS NULL) OR (consumed_at >= created_at)))` |
| `ck_auth_otp_challenge_expiry` | `CHECK` | `CHECK ((expires_at > created_at))` |
| `ck_auth_otp_challenge_purpose` | `CHECK` | `CHECK ((purpose = ANY (ARRAY['login'::text, 'qr_registration'::text])))` |
| `ck_auth_otp_challenge_token_hash_len` | `CHECK` | `CHECK ((length(challenge_token_hash) = 64))` |
| `auth_otp_challenge_otp_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (otp_id) REFERENCES auth_otp(id) ON DELETE CASCADE` |
| `auth_otp_challenge_challenge_token_hash_not_null` | `n` | `NOT NULL challenge_token_hash` |
| `auth_otp_challenge_created_at_not_null` | `n` | `NOT NULL created_at` |
| `auth_otp_challenge_expires_at_not_null` | `n` | `NOT NULL expires_at` |
| `auth_otp_challenge_id_not_null` | `n` | `NOT NULL id` |
| `auth_otp_challenge_otp_id_not_null` | `n` | `NOT NULL otp_id` |
| `auth_otp_challenge_purpose_not_null` | `n` | `NOT NULL purpose` |
| `auth_otp_challenge_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `auth_otp_challenge_challenge_token_hash_key` | `UNIQUE` | `UNIQUE (challenge_token_hash)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `auth_otp_challenge_challenge_token_hash_key` | `CREATE UNIQUE INDEX auth_otp_challenge_challenge_token_hash_key ON public.auth_otp_challenge USING btree (challenge_token_hash)` |
| `auth_otp_challenge_pkey` | `CREATE UNIQUE INDEX auth_otp_challenge_pkey ON public.auth_otp_challenge USING btree (id)` |
| `idx_auth_otp_challenge_expires` | `CREATE INDEX idx_auth_otp_challenge_expires ON public.auth_otp_challenge USING btree (expires_at) WHERE (consumed_at IS NULL)` |
| `idx_auth_otp_challenge_nonce` | `CREATE UNIQUE INDEX idx_auth_otp_challenge_nonce ON public.auth_otp_challenge USING btree (identity_nonce_hash) WHERE (identity_nonce_hash IS NOT NULL)` |
| `idx_auth_otp_challenge_otp_id` | `CREATE INDEX idx_auth_otp_challenge_otp_id ON public.auth_otp_challenge USING btree (otp_id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_auth_otp_challenge_guard` | `CREATE TRIGGER trg_01_auth_otp_challenge_guard BEFORE INSERT OR UPDATE ON public.auth_otp_challenge FOR EACH ROW EXECUTE FUNCTION trg_auth_otp_challenge_before()` |

---

### 3.10 Table: `auth_permission`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `integer` | NO | - | **YES** |
| `name` | `character varying(255)` | NO | - | NO |
| `content_type_id` | `integer` | NO | - | NO |
| `codename` | `character varying(100)` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `auth_permission_content_type_id_2f476e4b_fk_django_co` | `FOREIGN KEY` | `FOREIGN KEY (content_type_id) REFERENCES django_content_type(id) DEFERRABLE INITIALLY DEFERRED` |
| `auth_permission_codename_not_null` | `n` | `NOT NULL codename` |
| `auth_permission_content_type_id_not_null` | `n` | `NOT NULL content_type_id` |
| `auth_permission_id_not_null` | `n` | `NOT NULL id` |
| `auth_permission_name_not_null` | `n` | `NOT NULL name` |
| `auth_permission_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `auth_permission_content_type_id_codename_01ab375a_uniq` | `UNIQUE` | `UNIQUE (content_type_id, codename)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `auth_permission_content_type_id_2f476e4b` | `CREATE INDEX auth_permission_content_type_id_2f476e4b ON public.auth_permission USING btree (content_type_id)` |
| `auth_permission_content_type_id_codename_01ab375a_uniq` | `CREATE UNIQUE INDEX auth_permission_content_type_id_codename_01ab375a_uniq ON public.auth_permission USING btree (content_type_id, codename)` |
| `auth_permission_pkey` | `CREATE UNIQUE INDEX auth_permission_pkey ON public.auth_permission USING btree (id)` |

#### Triggers

*No user triggers attached.*

---

### 3.11 Table: `authtoken_token`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `key` | `character varying(40)` | NO | - | **YES** |
| `created` | `timestamp with time zone` | NO | - | NO |
| `user_id` | `bigint` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `authtoken_token_user_id_35299eff_fk_users_id` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED` |
| `authtoken_token_created_not_null` | `n` | `NOT NULL created` |
| `authtoken_token_key_not_null` | `n` | `NOT NULL key` |
| `authtoken_token_user_id_not_null` | `n` | `NOT NULL user_id` |
| `authtoken_token_pkey` | `PRIMARY KEY` | `PRIMARY KEY (key)` |
| `authtoken_token_user_id_key` | `UNIQUE` | `UNIQUE (user_id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `authtoken_token_key_10f0b77e_like` | `CREATE INDEX authtoken_token_key_10f0b77e_like ON public.authtoken_token USING btree (key varchar_pattern_ops)` |
| `authtoken_token_pkey` | `CREATE UNIQUE INDEX authtoken_token_pkey ON public.authtoken_token USING btree (key)` |
| `authtoken_token_user_id_key` | `CREATE UNIQUE INDEX authtoken_token_user_id_key ON public.authtoken_token USING btree (user_id)` |

#### Triggers

*No user triggers attached.*

---

### 3.12 Table: `charity_fields`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `code` | `text` | NO | - | **YES** |
| `label` | `text` | NO | - | NO |
| `active` | `boolean` | NO | `true` | NO |
| `sort_order` | `integer` | NO | `100` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_charity_fields_code` | `CHECK` | `CHECK ((code ~ '^[a-z][a-z0-9_]{1,49}$'::text))` |
| `ck_charity_fields_label` | `CHECK` | `CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 100)))` |
| `charity_fields_active_not_null` | `n` | `NOT NULL active` |
| `charity_fields_code_not_null` | `n` | `NOT NULL code` |
| `charity_fields_label_not_null` | `n` | `NOT NULL label` |
| `charity_fields_sort_order_not_null` | `n` | `NOT NULL sort_order` |
| `charity_fields_pkey` | `PRIMARY KEY` | `PRIMARY KEY (code)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `charity_fields_pkey` | `CREATE UNIQUE INDEX charity_fields_pkey ON public.charity_fields USING btree (code)` |

#### Triggers

*No user triggers attached.*

---

### 3.13 Table: `coordinator_profiles`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `user_id` | `bigint` | NO | - | **YES** |
| `status` | `text` | NO | `'pending'::text` | NO |
| `approved_by_id` | `bigint` | YES | - | NO |
| `approved_at` | `timestamp with time zone` | YES | - | NO |
| `notes` | `text` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_coordinator_approval` | `CHECK` | `CHECK (((status = ANY (ARRAY['pending'::text, 'revoked'::text])) OR ((approved_at IS NOT NULL) AND (approved_by_id IS NOT NULL))))` |
| `ck_coordinator_no_self_approval` | `CHECK` | `CHECK (((approved_by_id IS NULL) OR (approved_by_id <> user_id)))` |
| `ck_coordinator_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'suspended'::text, 'revoked'::text])))` |
| `coordinator_profiles_approved_by_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (approved_by_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `coordinator_profiles_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `coordinator_profiles_created_at_not_null` | `n` | `NOT NULL created_at` |
| `coordinator_profiles_status_not_null` | `n` | `NOT NULL status` |
| `coordinator_profiles_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `coordinator_profiles_user_id_not_null` | `n` | `NOT NULL user_id` |
| `coordinator_profiles_pkey` | `PRIMARY KEY` | `PRIMARY KEY (user_id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `coordinator_profiles_pkey` | `CREATE UNIQUE INDEX coordinator_profiles_pkey ON public.coordinator_profiles USING btree (user_id)` |
| `idx_coordinator_profiles_approved_by` | `CREATE INDEX idx_coordinator_profiles_approved_by ON public.coordinator_profiles USING btree (approved_by_id)` |
| `idx_coordinator_profiles_status` | `CREATE INDEX idx_coordinator_profiles_status ON public.coordinator_profiles USING btree (status)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_coordinator_guard` | `CREATE TRIGGER trg_01_coordinator_guard BEFORE INSERT OR UPDATE ON public.coordinator_profiles FOR EACH ROW EXECUTE FUNCTION trg_coordinator_guard()` |
| `trg_90_coordinator_profiles_updated_at` | `CREATE TRIGGER trg_90_coordinator_profiles_updated_at BEFORE UPDATE ON public.coordinator_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_coordinator_profiles_audit` | `CREATE TRIGGER trg_95_coordinator_profiles_audit AFTER INSERT OR UPDATE ON public.coordinator_profiles FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.14 Table: `django_admin_log`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `integer` | NO | - | **YES** |
| `action_time` | `timestamp with time zone` | NO | - | NO |
| `object_id` | `text` | YES | - | NO |
| `object_repr` | `character varying(200)` | NO | - | NO |
| `action_flag` | `smallint` | NO | - | NO |
| `change_message` | `text` | NO | - | NO |
| `content_type_id` | `integer` | YES | - | NO |
| `user_id` | `bigint` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `django_admin_log_action_flag_check` | `CHECK` | `CHECK ((action_flag >= 0))` |
| `django_admin_log_content_type_id_c4bce8eb_fk_django_co` | `FOREIGN KEY` | `FOREIGN KEY (content_type_id) REFERENCES django_content_type(id) DEFERRABLE INITIALLY DEFERRED` |
| `django_admin_log_user_id_c564eba6_fk_users_id` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED` |
| `django_admin_log_action_flag_not_null` | `n` | `NOT NULL action_flag` |
| `django_admin_log_action_time_not_null` | `n` | `NOT NULL action_time` |
| `django_admin_log_change_message_not_null` | `n` | `NOT NULL change_message` |
| `django_admin_log_id_not_null` | `n` | `NOT NULL id` |
| `django_admin_log_object_repr_not_null` | `n` | `NOT NULL object_repr` |
| `django_admin_log_user_id_not_null` | `n` | `NOT NULL user_id` |
| `django_admin_log_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `django_admin_log_content_type_id_c4bce8eb` | `CREATE INDEX django_admin_log_content_type_id_c4bce8eb ON public.django_admin_log USING btree (content_type_id)` |
| `django_admin_log_pkey` | `CREATE UNIQUE INDEX django_admin_log_pkey ON public.django_admin_log USING btree (id)` |
| `django_admin_log_user_id_c564eba6` | `CREATE INDEX django_admin_log_user_id_c564eba6 ON public.django_admin_log USING btree (user_id)` |

#### Triggers

*No user triggers attached.*

---

### 3.15 Table: `django_content_type`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `integer` | NO | - | **YES** |
| `app_label` | `character varying(100)` | NO | - | NO |
| `model` | `character varying(100)` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `django_content_type_app_label_not_null` | `n` | `NOT NULL app_label` |
| `django_content_type_id_not_null` | `n` | `NOT NULL id` |
| `django_content_type_model_not_null` | `n` | `NOT NULL model` |
| `django_content_type_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `django_content_type_app_label_model_76bd3d3b_uniq` | `UNIQUE` | `UNIQUE (app_label, model)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `django_content_type_app_label_model_76bd3d3b_uniq` | `CREATE UNIQUE INDEX django_content_type_app_label_model_76bd3d3b_uniq ON public.django_content_type USING btree (app_label, model)` |
| `django_content_type_pkey` | `CREATE UNIQUE INDEX django_content_type_pkey ON public.django_content_type USING btree (id)` |

#### Triggers

*No user triggers attached.*

---

### 3.16 Table: `django_migrations`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `app` | `character varying(255)` | NO | - | NO |
| `name` | `character varying(255)` | NO | - | NO |
| `applied` | `timestamp with time zone` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `django_migrations_app_not_null` | `n` | `NOT NULL app` |
| `django_migrations_applied_not_null` | `n` | `NOT NULL applied` |
| `django_migrations_id_not_null` | `n` | `NOT NULL id` |
| `django_migrations_name_not_null` | `n` | `NOT NULL name` |
| `django_migrations_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `django_migrations_pkey` | `CREATE UNIQUE INDEX django_migrations_pkey ON public.django_migrations USING btree (id)` |

#### Triggers

*No user triggers attached.*

---

### 3.17 Table: `django_session`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `session_key` | `character varying(40)` | NO | - | **YES** |
| `session_data` | `text` | NO | - | NO |
| `expire_date` | `timestamp with time zone` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `django_session_expire_date_not_null` | `n` | `NOT NULL expire_date` |
| `django_session_session_data_not_null` | `n` | `NOT NULL session_data` |
| `django_session_session_key_not_null` | `n` | `NOT NULL session_key` |
| `django_session_pkey` | `PRIMARY KEY` | `PRIMARY KEY (session_key)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `django_session_expire_date_a5c62663` | `CREATE INDEX django_session_expire_date_a5c62663 ON public.django_session USING btree (expire_date)` |
| `django_session_pkey` | `CREATE UNIQUE INDEX django_session_pkey ON public.django_session USING btree (session_key)` |
| `django_session_session_key_c0390e0f_like` | `CREATE INDEX django_session_session_key_c0390e0f_like ON public.django_session USING btree (session_key varchar_pattern_ops)` |

#### Triggers

*No user triggers attached.*

---

### 3.18 Table: `event_applications`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `post_id` | `bigint` | YES | - | NO |
| `user_id` | `bigint` | NO | - | NO |
| `qr_token_id` | `bigint` | YES | - | NO |
| `source` | `text` | NO | `'browse'::text` | NO |
| `status` | `text` | NO | `'pending'::text` | NO |
| `applied_at` | `timestamp with time zone` | NO | `now()` | NO |
| `decided_by_id` | `bigint` | YES | - | NO |
| `decided_at` | `timestamp with time zone` | YES | - | NO |
| `conditions_acknowledged_at` | `timestamp with time zone` | YES | - | NO |
| `conditions_snapshot` | `jsonb` | YES | - | NO |
| `note` | `text` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_application_decided` | `CHECK` | `CHECK (((status <> ALL (ARRAY['accepted'::text, 'rejected'::text])) OR (decided_at IS NOT NULL)))` |
| `ck_application_decider` | `CHECK` | `CHECK (((decided_by_id IS NULL) OR (decided_at IS NOT NULL)))` |
| `ck_application_no_self_decision` | `CHECK` | `CHECK (((decided_by_id IS NULL) OR (decided_by_id <> user_id)))` |
| `ck_application_source` | `CHECK` | `CHECK ((source = ANY (ARRAY['browse'::text, 'qr_walkin'::text, 'invite'::text])))` |
| `ck_application_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'waitlisted'::text, 'rejected'::text, 'withdrawn'::text, 'expired'::text])))` |
| `ck_application_walkin_token` | `CHECK` | `CHECK (((source = 'qr_walkin'::text) = (qr_token_id IS NOT NULL)))` |
| `event_applications_decided_by_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (decided_by_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `event_applications_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `event_applications_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `fk_applications_post_event` | `FOREIGN KEY` | `FOREIGN KEY (post_id, event_id) REFERENCES event_posts(id, event_id) ON DELETE RESTRICT` |
| `fk_applications_qr_event` | `FOREIGN KEY` | `FOREIGN KEY (qr_token_id, event_id) REFERENCES qr_tokens(id, event_id) ON DELETE RESTRICT` |
| `event_applications_applied_at_not_null` | `n` | `NOT NULL applied_at` |
| `event_applications_created_at_not_null` | `n` | `NOT NULL created_at` |
| `event_applications_event_id_not_null` | `n` | `NOT NULL event_id` |
| `event_applications_id_not_null` | `n` | `NOT NULL id` |
| `event_applications_source_not_null` | `n` | `NOT NULL source` |
| `event_applications_status_not_null` | `n` | `NOT NULL status` |
| `event_applications_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `event_applications_user_id_not_null` | `n` | `NOT NULL user_id` |
| `event_applications_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_event_applications_id_event_user` | `UNIQUE` | `UNIQUE (id, event_id, user_id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `event_applications_pkey` | `CREATE UNIQUE INDEX event_applications_pkey ON public.event_applications USING btree (id)` |
| `idx_event_applications_event` | `CREATE INDEX idx_event_applications_event ON public.event_applications USING btree (event_id, status)` |
| `idx_event_applications_post` | `CREATE INDEX idx_event_applications_post ON public.event_applications USING btree (post_id) WHERE (post_id IS NOT NULL)` |
| `idx_event_applications_user` | `CREATE INDEX idx_event_applications_user ON public.event_applications USING btree (user_id)` |
| `uq_event_application_active` | `CREATE UNIQUE INDEX uq_event_application_active ON public.event_applications USING btree (event_id, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'waitlisted'::text]))` |
| `uq_event_applications_id_event_user` | `CREATE UNIQUE INDEX uq_event_applications_id_event_user ON public.event_applications USING btree (id, event_id, user_id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_applications_before_insert` | `CREATE TRIGGER trg_01_applications_before_insert BEFORE INSERT ON public.event_applications FOR EACH ROW EXECUTE FUNCTION trg_applications_before_insert()` |
| `trg_01_applications_before_update` | `CREATE TRIGGER trg_01_applications_before_update BEFORE UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION trg_applications_before_update()` |
| `trg_50_applications_after` | `CREATE TRIGGER trg_50_applications_after AFTER INSERT OR UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION trg_applications_after()` |
| `trg_90_event_applications_updated_at` | `CREATE TRIGGER trg_90_event_applications_updated_at BEFORE UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_applications_audit` | `CREATE TRIGGER trg_95_applications_audit AFTER INSERT OR UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.19 Table: `event_charity_fields`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `field_code` | `text` | NO | - | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `event_charity_fields_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE` |
| `event_charity_fields_field_code_fkey` | `FOREIGN KEY` | `FOREIGN KEY (field_code) REFERENCES charity_fields(code) ON DELETE RESTRICT` |
| `event_charity_fields_event_id_not_null` | `n` | `NOT NULL event_id` |
| `event_charity_fields_field_code_not_null` | `n` | `NOT NULL field_code` |
| `event_charity_fields_id_not_null` | `n` | `NOT NULL id` |
| `event_charity_fields_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_event_charity_field` | `UNIQUE` | `UNIQUE (event_id, field_code)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `event_charity_fields_pkey` | `CREATE UNIQUE INDEX event_charity_fields_pkey ON public.event_charity_fields USING btree (id)` |
| `idx_event_charity_fields_event` | `CREATE INDEX idx_event_charity_fields_event ON public.event_charity_fields USING btree (event_id)` |
| `idx_event_charity_fields_field` | `CREATE INDEX idx_event_charity_fields_field ON public.event_charity_fields USING btree (field_code)` |
| `uq_event_charity_field` | `CREATE UNIQUE INDEX uq_event_charity_field ON public.event_charity_fields USING btree (event_id, field_code)` |

#### Triggers

*No user triggers attached.*

---

### 3.20 Table: `event_coordinator_history`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `from_coordinator_id` | `bigint` | YES | - | NO |
| `to_coordinator_id` | `bigint` | NO | - | NO |
| `changed_by_user_id` | `bigint` | YES | - | NO |
| `reason` | `text` | YES | - | NO |
| `changed_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_coord_history_changed` | `CHECK` | `CHECK ((from_coordinator_id IS DISTINCT FROM to_coordinator_id))` |
| `event_coordinator_history_changed_by_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `event_coordinator_history_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `event_coordinator_history_from_coordinator_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (from_coordinator_id) REFERENCES coordinator_profiles(user_id) ON DELETE RESTRICT` |
| `event_coordinator_history_to_coordinator_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (to_coordinator_id) REFERENCES coordinator_profiles(user_id) ON DELETE RESTRICT` |
| `event_coordinator_history_changed_at_not_null` | `n` | `NOT NULL changed_at` |
| `event_coordinator_history_event_id_not_null` | `n` | `NOT NULL event_id` |
| `event_coordinator_history_id_not_null` | `n` | `NOT NULL id` |
| `event_coordinator_history_to_coordinator_id_not_null` | `n` | `NOT NULL to_coordinator_id` |
| `event_coordinator_history_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `event_coordinator_history_pkey` | `CREATE UNIQUE INDEX event_coordinator_history_pkey ON public.event_coordinator_history USING btree (id)` |
| `idx_coord_history_event` | `CREATE INDEX idx_coord_history_event ON public.event_coordinator_history USING btree (event_id, changed_at)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_coord_history_append_only` | `CREATE TRIGGER trg_01_coord_history_append_only BEFORE DELETE OR UPDATE ON public.event_coordinator_history FOR EACH ROW EXECUTE FUNCTION trg_block_mutation()` |

---

### 3.21 Table: `event_posts`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `title` | `text` | NO | - | NO |
| `description` | `text` | YES | - | NO |
| `required_headcount` | `integer` | NO | - | NO |
| `physical_level` | `text` | NO | `'none'::text` | NO |
| `required_skills` | `ARRAY` | NO | `'{}'::text[]` | NO |
| `leader_needed` | `boolean` | NO | `false` | NO |
| `new_volunteers_allowed` | `boolean` | NO | `true` | NO |
| `priority` | `integer` | NO | `100` | NO |
| `status` | `text` | NO | `'open'::text` | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_event_posts_headcount` | `CHECK` | `CHECK (((required_headcount >= 1) AND (required_headcount <= 100000)))` |
| `ck_event_posts_physical_level` | `CHECK` | `CHECK ((physical_level = ANY (ARRAY['none'::text, 'light'::text, 'medium'::text, 'heavy'::text])))` |
| `ck_event_posts_skills` | `CHECK` | `CHECK (tags_are_normalized(required_skills))` |
| `ck_event_posts_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'closed'::text])))` |
| `ck_event_posts_title` | `CHECK` | `CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 150)))` |
| `event_posts_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `event_posts_created_at_not_null` | `n` | `NOT NULL created_at` |
| `event_posts_event_id_not_null` | `n` | `NOT NULL event_id` |
| `event_posts_id_not_null` | `n` | `NOT NULL id` |
| `event_posts_leader_needed_not_null` | `n` | `NOT NULL leader_needed` |
| `event_posts_new_volunteers_allowed_not_null` | `n` | `NOT NULL new_volunteers_allowed` |
| `event_posts_physical_level_not_null` | `n` | `NOT NULL physical_level` |
| `event_posts_priority_not_null` | `n` | `NOT NULL priority` |
| `event_posts_required_headcount_not_null` | `n` | `NOT NULL required_headcount` |
| `event_posts_required_skills_not_null` | `n` | `NOT NULL required_skills` |
| `event_posts_status_not_null` | `n` | `NOT NULL status` |
| `event_posts_title_not_null` | `n` | `NOT NULL title` |
| `event_posts_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `event_posts_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_event_posts_event_title` | `UNIQUE` | `UNIQUE (event_id, title)` |
| `uq_event_posts_id_event` | `UNIQUE` | `UNIQUE (id, event_id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `event_posts_pkey` | `CREATE UNIQUE INDEX event_posts_pkey ON public.event_posts USING btree (id)` |
| `idx_event_posts_event` | `CREATE INDEX idx_event_posts_event ON public.event_posts USING btree (event_id)` |
| `idx_event_posts_skills_gin` | `CREATE INDEX idx_event_posts_skills_gin ON public.event_posts USING gin (required_skills)` |
| `uq_event_posts_event_title` | `CREATE UNIQUE INDEX uq_event_posts_event_title ON public.event_posts USING btree (event_id, title)` |
| `uq_event_posts_id_event` | `CREATE UNIQUE INDEX uq_event_posts_id_event ON public.event_posts USING btree (id, event_id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_posts_guard` | `CREATE TRIGGER trg_01_posts_guard BEFORE INSERT OR UPDATE ON public.event_posts FOR EACH ROW EXECUTE FUNCTION trg_posts_guard()` |
| `trg_90_event_posts_updated_at` | `CREATE TRIGGER trg_90_event_posts_updated_at BEFORE UPDATE ON public.event_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_event_posts_audit` | `CREATE TRIGGER trg_95_event_posts_audit AFTER INSERT OR UPDATE ON public.event_posts FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.22 Table: `events`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `owner_id` | `bigint` | NO | - | NO |
| `current_coordinator_id` | `bigint` | NO | - | NO |
| `title` | `text` | NO | - | NO |
| `description` | `text` | YES | - | NO |
| `purpose_type` | `text` | NO | `'charity_event'::text` | NO |
| `location_name` | `text` | YES | - | NO |
| `landmark_text` | `text` | YES | - | NO |
| `latitude` | `numeric` | YES | - | NO |
| `longitude` | `numeric` | YES | - | NO |
| `geo_radius_m` | `integer` | YES | - | NO |
| `geo_checkin_enabled` | `boolean` | NO | `false` | NO |
| `geo_checkin_opens_before_min` | `integer` | NO | `30` | NO |
| `require_checkin_confirmation` | `boolean` | NO | `true` | NO |
| `map_provider` | `text` | NO | `'openstreetmap'::text` | NO |
| `start_at` | `timestamp with time zone` | NO | - | NO |
| `end_at` | `timestamp with time zone` | NO | - | NO |
| `application_deadline` | `timestamp with time zone` | YES | - | NO |
| `status` | `text` | NO | `'draft'::text` | NO |
| `acceptance_mode` | `text` | NO | `'manual'::text` | NO |
| `auto_assign_enabled` | `boolean` | NO | `true` | NO |
| `group_size` | `integer` | YES | - | NO |
| `leader_strategy` | `text` | NO | `'none'::text` | NO |
| `max_participants` | `integer` | YES | - | NO |
| `meals_provided` | `boolean` | NO | `false` | NO |
| `lodging_provided` | `boolean` | NO | `false` | NO |
| `travel_support_provided` | `boolean` | NO | `false` | NO |
| `compensation_kind` | `text` | NO | `'unpaid'::text` | NO |
| `compensation_note` | `text` | YES | - | NO |
| `onboarding_text` | `text` | YES | - | NO |
| `onboarding_version` | `integer` | NO | `1` | NO |
| `require_onboarding_ack` | `boolean` | NO | `true` | NO |
| `qr_registration_enabled` | `boolean` | NO | `true` | NO |
| `published_at` | `timestamp with time zone` | YES | - | NO |
| `activated_at` | `timestamp with time zone` | YES | - | NO |
| `completed_at` | `timestamp with time zone` | YES | - | NO |
| `cancelled_at` | `timestamp with time zone` | YES | - | NO |
| `cancel_reason` | `text` | YES | - | NO |
| `deleted_at` | `timestamp with time zone` | YES | - | NO |
| `deleted_by_id` | `bigint` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_events_acceptance_mode` | `CHECK` | `CHECK ((acceptance_mode = ANY (ARRAY['auto'::text, 'manual'::text])))` |
| `ck_events_compensation_kind` | `CHECK` | `CHECK ((compensation_kind = ANY (ARRAY['unpaid'::text, 'arranged_outside_system'::text])))` |
| `ck_events_deadline` | `CHECK` | `CHECK (((application_deadline IS NULL) OR (application_deadline <= start_at)))` |
| `ck_events_geo_enabled_needs_point` | `CHECK` | `CHECK (((NOT geo_checkin_enabled) OR (latitude IS NOT NULL)))` |
| `ck_events_geo_pair` | `CHECK` | `CHECK (((latitude IS NULL) = (longitude IS NULL)))` |
| `ck_events_geo_radius` | `CHECK` | `CHECK (((geo_radius_m IS NULL) OR ((geo_radius_m >= 20) AND (geo_radius_m <= 5000))))` |
| `ck_events_geo_window` | `CHECK` | `CHECK (((geo_checkin_opens_before_min >= 0) AND (geo_checkin_opens_before_min <= 240)))` |
| `ck_events_group_size` | `CHECK` | `CHECK (((group_size IS NULL) OR (group_size > 0)))` |
| `ck_events_lat_range` | `CHECK` | `CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))))` |
| `ck_events_leader_strategy` | `CHECK` | `CHECK ((leader_strategy = ANY (ARRAY['none'::text, 'first_experienced'::text, 'manual'::text])))` |
| `ck_events_lng_range` | `CHECK` | `CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))` |
| `ck_events_map_provider` | `CHECK` | `CHECK ((map_provider = ANY (ARRAY['openstreetmap'::text, 'google'::text])))` |
| `ck_events_max_participants` | `CHECK` | `CHECK (((max_participants IS NULL) OR (max_participants > 0)))` |
| `ck_events_onboarding_version` | `CHECK` | `CHECK ((onboarding_version >= 1))` |
| `ck_events_purpose_type` | `CHECK` | `CHECK ((purpose_type = ANY (ARRAY['charity_event'::text, 'help_wanted_event'::text])))` |
| `ck_events_soft_delete` | `CHECK` | `CHECK (((deleted_at IS NULL) = (deleted_by_id IS NULL)))` |
| `ck_events_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))` |
| `ck_events_status_timestamps` | `CHECK` | `CHECK ((((status = 'draft'::text) AND (published_at IS NULL) AND (activated_at IS NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'published'::text) AND (published_at IS NOT NULL) AND (activated_at IS NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'active'::text) AND (published_at IS NOT NULL) AND (activated_at IS NOT NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'completed'::text) AND (published_at IS NOT NULL) AND (activated_at IS NOT NULL) AND (completed_at IS NOT NULL) AND (cancelled_at IS NULL)) OR ((status = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND (completed_at IS NULL))))` |
| `ck_events_time` | `CHECK` | `CHECK ((end_at > start_at))` |
| `ck_events_title` | `CHECK` | `CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 255)))` |
| `events_current_coordinator_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (current_coordinator_id) REFERENCES coordinator_profiles(user_id) ON DELETE RESTRICT` |
| `events_deleted_by_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (deleted_by_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `events_owner_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (owner_id) REFERENCES coordinator_profiles(user_id) ON DELETE RESTRICT` |
| `events_acceptance_mode_not_null` | `n` | `NOT NULL acceptance_mode` |
| `events_auto_assign_enabled_not_null` | `n` | `NOT NULL auto_assign_enabled` |
| `events_compensation_kind_not_null` | `n` | `NOT NULL compensation_kind` |
| `events_created_at_not_null` | `n` | `NOT NULL created_at` |
| `events_current_coordinator_id_not_null` | `n` | `NOT NULL current_coordinator_id` |
| `events_end_at_not_null` | `n` | `NOT NULL end_at` |
| `events_geo_checkin_enabled_not_null` | `n` | `NOT NULL geo_checkin_enabled` |
| `events_geo_checkin_opens_before_min_not_null` | `n` | `NOT NULL geo_checkin_opens_before_min` |
| `events_id_not_null` | `n` | `NOT NULL id` |
| `events_leader_strategy_not_null` | `n` | `NOT NULL leader_strategy` |
| `events_lodging_provided_not_null` | `n` | `NOT NULL lodging_provided` |
| `events_map_provider_not_null` | `n` | `NOT NULL map_provider` |
| `events_meals_provided_not_null` | `n` | `NOT NULL meals_provided` |
| `events_onboarding_version_not_null` | `n` | `NOT NULL onboarding_version` |
| `events_owner_id_not_null` | `n` | `NOT NULL owner_id` |
| `events_purpose_type_not_null` | `n` | `NOT NULL purpose_type` |
| `events_qr_registration_enabled_not_null` | `n` | `NOT NULL qr_registration_enabled` |
| `events_require_checkin_confirmation_not_null` | `n` | `NOT NULL require_checkin_confirmation` |
| `events_require_onboarding_ack_not_null` | `n` | `NOT NULL require_onboarding_ack` |
| `events_start_at_not_null` | `n` | `NOT NULL start_at` |
| `events_status_not_null` | `n` | `NOT NULL status` |
| `events_title_not_null` | `n` | `NOT NULL title` |
| `events_travel_support_provided_not_null` | `n` | `NOT NULL travel_support_provided` |
| `events_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `events_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `events_pkey` | `CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)` |
| `idx_events_coordinator` | `CREATE INDEX idx_events_coordinator ON public.events USING btree (current_coordinator_id)` |
| `idx_events_owner` | `CREATE INDEX idx_events_owner ON public.events USING btree (owner_id)` |
| `idx_events_start_at` | `CREATE INDEX idx_events_start_at ON public.events USING btree (start_at)` |
| `idx_events_visible` | `CREATE INDEX idx_events_visible ON public.events USING btree (status, start_at) WHERE (deleted_at IS NULL)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_events_before_insert` | `CREATE TRIGGER trg_01_events_before_insert BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION trg_events_before_insert()` |
| `trg_01_events_before_update` | `CREATE TRIGGER trg_01_events_before_update BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION trg_events_before_update()` |
| `trg_50_events_after_insert` | `CREATE TRIGGER trg_50_events_after_insert AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION trg_events_after_insert()` |
| `trg_50_events_after_update` | `CREATE TRIGGER trg_50_events_after_update AFTER UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION trg_events_after_update()` |
| `trg_90_events_updated_at` | `CREATE TRIGGER trg_90_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_events_audit` | `CREATE TRIGGER trg_95_events_audit AFTER INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.23 Table: `feedback`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `rater_user_id` | `bigint` | NO | - | NO |
| `target_user_id` | `bigint` | YES | - | NO |
| `direction` | `text` | NO | - | NO |
| `score` | `integer` | NO | - | NO |
| `tags` | `ARRAY` | NO | `'{}'::text[]` | NO |
| `comment` | `text` | YES | - | NO |
| `status` | `text` | NO | `'active'::text` | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_feedback_direction` | `CHECK` | `CHECK ((direction = ANY (ARRAY['coordinator_to_volunteer'::text, 'volunteer_to_event'::text, 'volunteer_to_coordinator'::text])))` |
| `ck_feedback_not_self` | `CHECK` | `CHECK (((target_user_id IS NULL) OR (target_user_id <> rater_user_id)))` |
| `ck_feedback_score` | `CHECK` | `CHECK (((score >= 1) AND (score <= 5)))` |
| `ck_feedback_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text])))` |
| `ck_feedback_tags` | `CHECK` | `CHECK (tags_are_normalized(tags))` |
| `ck_feedback_target` | `CHECK` | `CHECK ((((direction = 'volunteer_to_event'::text) AND (target_user_id IS NULL)) OR ((direction <> 'volunteer_to_event'::text) AND (target_user_id IS NOT NULL))))` |
| `feedback_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `feedback_rater_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (rater_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `feedback_target_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `feedback_created_at_not_null` | `n` | `NOT NULL created_at` |
| `feedback_direction_not_null` | `n` | `NOT NULL direction` |
| `feedback_event_id_not_null` | `n` | `NOT NULL event_id` |
| `feedback_id_not_null` | `n` | `NOT NULL id` |
| `feedback_rater_user_id_not_null` | `n` | `NOT NULL rater_user_id` |
| `feedback_score_not_null` | `n` | `NOT NULL score` |
| `feedback_status_not_null` | `n` | `NOT NULL status` |
| `feedback_tags_not_null` | `n` | `NOT NULL tags` |
| `feedback_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `feedback_pkey` | `CREATE UNIQUE INDEX feedback_pkey ON public.feedback USING btree (id)` |
| `idx_feedback_event` | `CREATE INDEX idx_feedback_event ON public.feedback USING btree (event_id)` |
| `idx_feedback_rater` | `CREATE INDEX idx_feedback_rater ON public.feedback USING btree (rater_user_id)` |
| `idx_feedback_tags_gin` | `CREATE INDEX idx_feedback_tags_gin ON public.feedback USING gin (tags)` |
| `idx_feedback_target` | `CREATE INDEX idx_feedback_target ON public.feedback USING btree (target_user_id) WHERE (target_user_id IS NOT NULL)` |
| `uq_feedback_event_once` | `CREATE UNIQUE INDEX uq_feedback_event_once ON public.feedback USING btree (event_id, rater_user_id, direction) WHERE (target_user_id IS NULL)` |
| `uq_feedback_user_once` | `CREATE UNIQUE INDEX uq_feedback_user_once ON public.feedback USING btree (event_id, rater_user_id, direction, target_user_id) WHERE (target_user_id IS NOT NULL)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_feedback_guard` | `CREATE TRIGGER trg_01_feedback_guard BEFORE INSERT OR UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION trg_feedback_guard()` |
| `trg_95_feedback_audit` | `CREATE TRIGGER trg_95_feedback_audit AFTER INSERT OR UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.24 Table: `moderation_actions`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `admin_user_id` | `bigint` | NO | - | NO |
| `target_user_id` | `bigint` | YES | - | NO |
| `event_id` | `bigint` | YES | - | NO |
| `feedback_id` | `bigint` | YES | - | NO |
| `action_type` | `text` | NO | - | NO |
| `reason` | `text` | YES | - | NO |
| `expires_at` | `timestamp with time zone` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_moderation_action_type` | `CHECK` | `CHECK ((action_type = ANY (ARRAY['user_warning'::text, 'user_block'::text, 'user_unblock'::text, 'account_close'::text, 'account_reinstate'::text, 'event_delete'::text, 'event_restore'::text, 'event_cancel'::text, 'feedback_hide'::text])))` |
| `ck_moderation_expiry` | `CHECK` | `CHECK (((expires_at IS NULL) OR (action_type = 'user_block'::text)))` |
| `ck_moderation_no_self` | `CHECK` | `CHECK (((target_user_id IS NULL) OR (target_user_id <> admin_user_id)))` |
| `ck_moderation_reason` | `CHECK` | `CHECK (((action_type <> ALL (ARRAY['user_block'::text, 'account_close'::text, 'event_delete'::text, 'event_cancel'::text, 'feedback_hide'::text])) OR (char_length(btrim(COALESCE(reason, ''::text))) > 0)))` |
| `ck_moderation_subject` | `CHECK` | `CHECK ((((action_type = ANY (ARRAY['user_warning'::text, 'user_block'::text, 'user_unblock'::text, 'account_close'::text, 'account_reinstate'::text])) AND (target_user_id IS NOT NULL) AND (event_id IS NULL) AND (feedback_id IS NULL)) OR ((action_type = ANY (ARRAY['event_delete'::text, 'event_restore'::text, 'event_cancel'::text])) AND (event_id IS NOT NULL) AND (target_user_id IS NULL) AND (feedback_id IS NULL)) OR ((action_type = 'feedback_hide'::text) AND (feedback_id IS NOT NULL) AND (target_user_id IS NULL) AND (event_id IS NULL))))` |
| `moderation_actions_admin_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `moderation_actions_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `moderation_actions_feedback_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE RESTRICT` |
| `moderation_actions_target_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `moderation_actions_action_type_not_null` | `n` | `NOT NULL action_type` |
| `moderation_actions_admin_user_id_not_null` | `n` | `NOT NULL admin_user_id` |
| `moderation_actions_created_at_not_null` | `n` | `NOT NULL created_at` |
| `moderation_actions_id_not_null` | `n` | `NOT NULL id` |
| `moderation_actions_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_moderation_admin` | `CREATE INDEX idx_moderation_admin ON public.moderation_actions USING btree (admin_user_id)` |
| `idx_moderation_event` | `CREATE INDEX idx_moderation_event ON public.moderation_actions USING btree (event_id) WHERE (event_id IS NOT NULL)` |
| `idx_moderation_target` | `CREATE INDEX idx_moderation_target ON public.moderation_actions USING btree (target_user_id, action_type) WHERE (target_user_id IS NOT NULL)` |
| `moderation_actions_pkey` | `CREATE UNIQUE INDEX moderation_actions_pkey ON public.moderation_actions USING btree (id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_moderation_append_only` | `CREATE TRIGGER trg_01_moderation_append_only BEFORE DELETE OR UPDATE ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION trg_block_mutation()` |
| `trg_01_moderation_before_insert` | `CREATE TRIGGER trg_01_moderation_before_insert BEFORE INSERT ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION trg_moderation_before_insert()` |
| `trg_50_moderation_after_insert` | `CREATE TRIGGER trg_50_moderation_after_insert AFTER INSERT ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION trg_moderation_after_insert()` |
| `trg_95_moderation_audit` | `CREATE TRIGGER trg_95_moderation_audit AFTER INSERT ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.25 Table: `onboarding_acknowledgments`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `user_id` | `bigint` | NO | - | NO |
| `event_id` | `bigint` | NO | - | NO |
| `onboarding_version` | `integer` | NO | - | NO |
| `method` | `text` | NO | `'app_tick'::text` | NO |
| `acknowledged_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_onboarding_ack_method` | `CHECK` | `CHECK ((method = 'app_tick'::text))` |
| `ck_onboarding_ack_version` | `CHECK` | `CHECK ((onboarding_version >= 1))` |
| `onboarding_acknowledgments_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `onboarding_acknowledgments_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `onboarding_acknowledgments_acknowledged_at_not_null` | `n` | `NOT NULL acknowledged_at` |
| `onboarding_acknowledgments_event_id_not_null` | `n` | `NOT NULL event_id` |
| `onboarding_acknowledgments_id_not_null` | `n` | `NOT NULL id` |
| `onboarding_acknowledgments_method_not_null` | `n` | `NOT NULL method` |
| `onboarding_acknowledgments_onboarding_version_not_null` | `n` | `NOT NULL onboarding_version` |
| `onboarding_acknowledgments_user_id_not_null` | `n` | `NOT NULL user_id` |
| `onboarding_acknowledgments_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_onboarding_ack_user_event_ver` | `UNIQUE` | `UNIQUE (user_id, event_id, onboarding_version)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_onboarding_ack_event` | `CREATE INDEX idx_onboarding_ack_event ON public.onboarding_acknowledgments USING btree (event_id)` |
| `onboarding_acknowledgments_pkey` | `CREATE UNIQUE INDEX onboarding_acknowledgments_pkey ON public.onboarding_acknowledgments USING btree (id)` |
| `uq_onboarding_ack_user_event_ver` | `CREATE UNIQUE INDEX uq_onboarding_ack_user_event_ver ON public.onboarding_acknowledgments USING btree (user_id, event_id, onboarding_version)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_onboarding_append_only` | `CREATE TRIGGER trg_01_onboarding_append_only BEFORE DELETE OR UPDATE ON public.onboarding_acknowledgments FOR EACH ROW EXECUTE FUNCTION trg_block_mutation()` |
| `trg_01_onboarding_before_insert` | `CREATE TRIGGER trg_01_onboarding_before_insert BEFORE INSERT ON public.onboarding_acknowledgments FOR EACH ROW EXECUTE FUNCTION trg_onboarding_before_insert()` |

---

### 3.26 Table: `qr_tokens`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `event_id` | `bigint` | NO | - | NO |
| `created_by_id` | `bigint` | NO | - | NO |
| `purpose` | `text` | NO | - | NO |
| `token_hash` | `text` | NO | - | NO |
| `max_uses` | `integer` | YES | - | NO |
| `used_count` | `integer` | NO | `0` | NO |
| `expires_at` | `timestamp with time zone` | NO | - | NO |
| `revoked_at` | `timestamp with time zone` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_qr_expiry` | `CHECK` | `CHECK ((expires_at > created_at))` |
| `ck_qr_hash_len` | `CHECK` | `CHECK (((char_length(token_hash) >= 32) AND (char_length(token_hash) <= 128)))` |
| `ck_qr_max_uses` | `CHECK` | `CHECK (((max_uses IS NULL) OR (max_uses > 0)))` |
| `ck_qr_purpose` | `CHECK` | `CHECK ((purpose = ANY (ARRAY['walkin_registration'::text, 'checkin'::text, 'join_event'::text])))` |
| `ck_qr_revoked` | `CHECK` | `CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at)))` |
| `ck_qr_used_count` | `CHECK` | `CHECK (((max_uses IS NULL) OR (used_count <= max_uses)))` |
| `ck_qr_used_count_nonnegative` | `CHECK` | `CHECK ((used_count >= 0))` |
| `qr_tokens_created_by_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `qr_tokens_event_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT` |
| `qr_tokens_created_at_not_null` | `n` | `NOT NULL created_at` |
| `qr_tokens_created_by_id_not_null` | `n` | `NOT NULL created_by_id` |
| `qr_tokens_event_id_not_null` | `n` | `NOT NULL event_id` |
| `qr_tokens_expires_at_not_null` | `n` | `NOT NULL expires_at` |
| `qr_tokens_id_not_null` | `n` | `NOT NULL id` |
| `qr_tokens_purpose_not_null` | `n` | `NOT NULL purpose` |
| `qr_tokens_token_hash_not_null` | `n` | `NOT NULL token_hash` |
| `qr_tokens_used_count_not_null` | `n` | `NOT NULL used_count` |
| `qr_tokens_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_qr_tokens_id_event` | `UNIQUE` | `UNIQUE (id, event_id)` |
| `uq_qr_tokens_token_hash` | `UNIQUE` | `UNIQUE (token_hash)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_qr_tokens_event_purpose` | `CREATE INDEX idx_qr_tokens_event_purpose ON public.qr_tokens USING btree (event_id, purpose)` |
| `qr_tokens_pkey` | `CREATE UNIQUE INDEX qr_tokens_pkey ON public.qr_tokens USING btree (id)` |
| `uq_qr_tokens_id_event` | `CREATE UNIQUE INDEX uq_qr_tokens_id_event ON public.qr_tokens USING btree (id, event_id)` |
| `uq_qr_tokens_token_hash` | `CREATE UNIQUE INDEX uq_qr_tokens_token_hash ON public.qr_tokens USING btree (token_hash)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_qr_guard` | `CREATE TRIGGER trg_01_qr_guard BEFORE INSERT OR UPDATE ON public.qr_tokens FOR EACH ROW EXECUTE FUNCTION trg_qr_guard()` |
| `trg_95_qr_tokens_audit` | `CREATE TRIGGER trg_95_qr_tokens_audit AFTER INSERT OR UPDATE ON public.qr_tokens FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.27 Table: `user_charity_interests`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `user_id` | `bigint` | NO | - | NO |
| `field_code` | `text` | NO | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `user_charity_interests_field_code_fkey` | `FOREIGN KEY` | `FOREIGN KEY (field_code) REFERENCES charity_fields(code) ON DELETE RESTRICT` |
| `user_charity_interests_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `user_charity_interests_created_at_not_null` | `n` | `NOT NULL created_at` |
| `user_charity_interests_field_code_not_null` | `n` | `NOT NULL field_code` |
| `user_charity_interests_id_not_null` | `n` | `NOT NULL id` |
| `user_charity_interests_user_id_not_null` | `n` | `NOT NULL user_id` |
| `user_charity_interests_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_user_charity_interest` | `UNIQUE` | `UNIQUE (user_id, field_code)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_user_charity_interests_field` | `CREATE INDEX idx_user_charity_interests_field ON public.user_charity_interests USING btree (field_code)` |
| `idx_user_charity_interests_user` | `CREATE INDEX idx_user_charity_interests_user ON public.user_charity_interests USING btree (user_id)` |
| `uq_user_charity_interest` | `CREATE UNIQUE INDEX uq_user_charity_interest ON public.user_charity_interests USING btree (user_id, field_code)` |
| `user_charity_interests_pkey` | `CREATE UNIQUE INDEX user_charity_interests_pkey ON public.user_charity_interests USING btree (id)` |

#### Triggers

*No user triggers attached.*

---

### 3.28 Table: `user_verification_images`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `user_id` | `bigint` | NO | - | NO |
| `image_type` | `text` | NO | - | NO |
| `image_path` | `text` | NO | - | NO |
| `file_format` | `text` | NO | `'jpeg'::text` | NO |
| `file_sha256` | `text` | YES | - | NO |
| `status` | `text` | NO | `'pending'::text` | NO |
| `comparison_status` | `text` | NO | `'pending'::text` | NO |
| `comparison_score` | `numeric` | YES | - | NO |
| `is_current` | `boolean` | NO | `true` | NO |
| `reviewed_by_id` | `bigint` | YES | - | NO |
| `reviewed_at` | `timestamp with time zone` | YES | - | NO |
| `note` | `text` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_verification_comparison_status` | `CHECK` | `CHECK ((comparison_status = ANY (ARRAY['pending'::text, 'match'::text, 'no_match'::text, 'needs_review'::text])))` |
| `ck_verification_file_format` | `CHECK` | `CHECK ((file_format = 'jpeg'::text))` |
| `ck_verification_image_path` | `CHECK` | `CHECK ((((char_length(btrim(image_path)) >= 1) AND (char_length(btrim(image_path)) <= 255)) AND (lower(image_path) ~ '\.jpe?g$'::text)))` |
| `ck_verification_image_type` | `CHECK` | `CHECK ((image_type = ANY (ARRAY['mock_selfie'::text, 'id_license'::text, 'driver_license'::text])))` |
| `ck_verification_no_self_review` | `CHECK` | `CHECK (((reviewed_by_id IS NULL) OR (reviewed_by_id <> user_id)))` |
| `ck_verification_review` | `CHECK` | `CHECK (((status = 'pending'::text) OR ((reviewed_by_id IS NOT NULL) AND (reviewed_at IS NOT NULL))))` |
| `ck_verification_score_range` | `CHECK` | `CHECK (((comparison_score IS NULL) OR ((comparison_score >= (0)::numeric) AND (comparison_score <= (1)::numeric))))` |
| `ck_verification_sha256` | `CHECK` | `CHECK (((file_sha256 IS NULL) OR (file_sha256 ~ '^[0-9a-f]{64}$'::text)))` |
| `ck_verification_status` | `CHECK` | `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))` |
| `user_verification_images_reviewed_by_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `user_verification_images_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT` |
| `user_verification_images_comparison_status_not_null` | `n` | `NOT NULL comparison_status` |
| `user_verification_images_created_at_not_null` | `n` | `NOT NULL created_at` |
| `user_verification_images_file_format_not_null` | `n` | `NOT NULL file_format` |
| `user_verification_images_id_not_null` | `n` | `NOT NULL id` |
| `user_verification_images_image_path_not_null` | `n` | `NOT NULL image_path` |
| `user_verification_images_image_type_not_null` | `n` | `NOT NULL image_type` |
| `user_verification_images_is_current_not_null` | `n` | `NOT NULL is_current` |
| `user_verification_images_status_not_null` | `n` | `NOT NULL status` |
| `user_verification_images_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `user_verification_images_user_id_not_null` | `n` | `NOT NULL user_id` |
| `user_verification_images_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_verification_images_pending` | `CREATE INDEX idx_verification_images_pending ON public.user_verification_images USING btree (id) WHERE ((status = 'pending'::text) AND is_current)` |
| `idx_verification_images_user` | `CREATE INDEX idx_verification_images_user ON public.user_verification_images USING btree (user_id)` |
| `uq_current_verification_image` | `CREATE UNIQUE INDEX uq_current_verification_image ON public.user_verification_images USING btree (user_id, image_type) WHERE is_current` |
| `user_verification_images_pkey` | `CREATE UNIQUE INDEX user_verification_images_pkey ON public.user_verification_images USING btree (id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_vimg_guard` | `CREATE TRIGGER trg_01_vimg_guard BEFORE INSERT OR UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION trg_vimg_guard()` |
| `trg_50_vimg_after` | `CREATE TRIGGER trg_50_vimg_after AFTER INSERT OR UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION trg_vimg_after()` |
| `trg_90_user_verification_images_updated_at` | `CREATE TRIGGER trg_90_user_verification_images_updated_at BEFORE UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_verification_images_audit` | `CREATE TRIGGER trg_95_verification_images_audit AFTER INSERT OR UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.29 Table: `users`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `phone_hash` | `text` | NO | - | NO |
| `phone_enc` | `text` | NO | - | NO |
| `password` | `text` | YES | - | NO |
| `last_login` | `timestamp with time zone` | YES | - | NO |
| `display_name` | `text` | NO | - | NO |
| `is_admin` | `boolean` | NO | `false` | NO |
| `is_staff` | `boolean` | NO | `false` | NO |
| `is_superuser` | `boolean` | NO | `false` | NO |
| `is_active` | `boolean` | NO | `true` | NO |
| `account_status` | `text` | NO | `'active'::text` | NO |
| `blocked_until` | `timestamp with time zone` | YES | - | NO |
| `preferred_language` | `text` | NO | `'en'::text` | NO |
| `home_area` | `text` | YES | - | NO |
| `emergency_contact_name` | `text` | YES | - | NO |
| `emergency_contact_phone_enc` | `text` | YES | - | NO |
| `blood_type` | `text` | NO | `'unknown'::text` | NO |
| `is_willing_to_donate` | `boolean` | NO | `false` | NO |
| `is_willing_to_donate_blood` | `boolean` | NO | `false` | NO |
| `is_willing_to_donate_items` | `boolean` | NO | `false` | NO |
| `physical_ok` | `boolean` | NO | `false` | NO |
| `good_eyesight` | `boolean` | NO | `true` | NO |
| `needs_glasses` | `boolean` | NO | `false` | NO |
| `can_lift_heavy` | `boolean` | NO | `false` | NO |
| `can_work_outdoor` | `boolean` | NO | `false` | NO |
| `has_leader_experience` | `boolean` | NO | `false` | NO |
| `new_to_volunteer` | `boolean` | NO | `true` | NO |
| `skills` | `ARRAY` | NO | `'{}'::text[]` | NO |
| `needs_meal_support` | `boolean` | NO | `false` | NO |
| `needs_travel_support` | `boolean` | NO | `false` | NO |
| `accepts_unpaid` | `boolean` | NO | `true` | NO |
| `verification_status` | `text` | NO | `'none'::text` | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |
| `updated_at` | `timestamp with time zone` | NO | `now()` | NO |
| `uuid` | `uuid` | NO | `uuidv7()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_users_account_status` | `CHECK` | `CHECK ((account_status = ANY (ARRAY['active'::text, 'blocked'::text, 'closed'::text])))` |
| `ck_users_active_status_sync` | `CHECK` | `CHECK ((is_active = (account_status = 'active'::text)))` |
| `ck_users_admin_flags` | `CHECK` | `CHECK ((((NOT is_staff) AND (NOT is_superuser)) OR is_admin))` |
| `ck_users_blocked_until` | `CHECK` | `CHECK (((blocked_until IS NULL) OR (account_status = 'blocked'::text)))` |
| `ck_users_blood_type` | `CHECK` | `CHECK ((blood_type = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text, 'unknown'::text])))` |
| `ck_users_display_name` | `CHECK` | `CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 150)))` |
| `ck_users_donation_consistency` | `CHECK` | `CHECK ((is_willing_to_donate OR ((NOT is_willing_to_donate_blood) AND (NOT is_willing_to_donate_items))))` |
| `ck_users_emergency_pair` | `CHECK` | `CHECK (((emergency_contact_name IS NULL) = (emergency_contact_phone_enc IS NULL)))` |
| `ck_users_language` | `CHECK` | `CHECK ((preferred_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text))` |
| `ck_users_phone_hash_len` | `CHECK` | `CHECK (((char_length(phone_hash) >= 32) AND (char_length(phone_hash) <= 128)))` |
| `ck_users_skills` | `CHECK` | `CHECK (tags_are_normalized(skills))` |
| `ck_users_verification_status` | `CHECK` | `CHECK ((verification_status = ANY (ARRAY['none'::text, 'pending'::text, 'verified'::text, 'rejected'::text])))` |
| `users_accepts_unpaid_not_null` | `n` | `NOT NULL accepts_unpaid` |
| `users_account_status_not_null` | `n` | `NOT NULL account_status` |
| `users_blood_type_not_null` | `n` | `NOT NULL blood_type` |
| `users_can_lift_heavy_not_null` | `n` | `NOT NULL can_lift_heavy` |
| `users_can_work_outdoor_not_null` | `n` | `NOT NULL can_work_outdoor` |
| `users_created_at_not_null` | `n` | `NOT NULL created_at` |
| `users_display_name_not_null` | `n` | `NOT NULL display_name` |
| `users_good_eyesight_not_null` | `n` | `NOT NULL good_eyesight` |
| `users_has_leader_experience_not_null` | `n` | `NOT NULL has_leader_experience` |
| `users_id_not_null` | `n` | `NOT NULL id` |
| `users_is_active_not_null` | `n` | `NOT NULL is_active` |
| `users_is_admin_not_null` | `n` | `NOT NULL is_admin` |
| `users_is_staff_not_null` | `n` | `NOT NULL is_staff` |
| `users_is_superuser_not_null` | `n` | `NOT NULL is_superuser` |
| `users_is_willing_to_donate_blood_not_null` | `n` | `NOT NULL is_willing_to_donate_blood` |
| `users_is_willing_to_donate_items_not_null` | `n` | `NOT NULL is_willing_to_donate_items` |
| `users_is_willing_to_donate_not_null` | `n` | `NOT NULL is_willing_to_donate` |
| `users_needs_glasses_not_null` | `n` | `NOT NULL needs_glasses` |
| `users_needs_meal_support_not_null` | `n` | `NOT NULL needs_meal_support` |
| `users_needs_travel_support_not_null` | `n` | `NOT NULL needs_travel_support` |
| `users_new_to_volunteer_not_null` | `n` | `NOT NULL new_to_volunteer` |
| `users_phone_enc_not_null` | `n` | `NOT NULL phone_enc` |
| `users_phone_hash_not_null` | `n` | `NOT NULL phone_hash` |
| `users_physical_ok_not_null` | `n` | `NOT NULL physical_ok` |
| `users_preferred_language_not_null` | `n` | `NOT NULL preferred_language` |
| `users_skills_not_null` | `n` | `NOT NULL skills` |
| `users_updated_at_not_null` | `n` | `NOT NULL updated_at` |
| `users_uuid_not_null` | `n` | `NOT NULL uuid` |
| `users_verification_status_not_null` | `n` | `NOT NULL verification_status` |
| `users_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_users_phone_hash` | `UNIQUE` | `UNIQUE (phone_hash)` |
| `uq_users_uuid` | `UNIQUE` | `UNIQUE (uuid)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_users_account_status` | `CREATE INDEX idx_users_account_status ON public.users USING btree (account_status)` |
| `idx_users_blocked_until` | `CREATE INDEX idx_users_blocked_until ON public.users USING btree (blocked_until) WHERE (account_status = 'blocked'::text)` |
| `idx_users_blood_donors` | `CREATE INDEX idx_users_blood_donors ON public.users USING btree (blood_type) WHERE is_willing_to_donate_blood` |
| `idx_users_is_admin` | `CREATE INDEX idx_users_is_admin ON public.users USING btree (id) WHERE is_admin` |
| `idx_users_skills_gin` | `CREATE INDEX idx_users_skills_gin ON public.users USING gin (skills)` |
| `idx_users_verification_status` | `CREATE INDEX idx_users_verification_status ON public.users USING btree (verification_status)` |
| `uq_users_phone_hash` | `CREATE UNIQUE INDEX uq_users_phone_hash ON public.users USING btree (phone_hash)` |
| `uq_users_uuid` | `CREATE UNIQUE INDEX uq_users_uuid ON public.users USING btree (uuid)` |
| `users_pkey` | `CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_01_users_guard` | `CREATE TRIGGER trg_01_users_guard BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trg_users_guard()` |
| `trg_90_users_updated_at` | `CREATE TRIGGER trg_90_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at()` |
| `trg_95_users_audit` | `CREATE TRIGGER trg_95_users_audit AFTER INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.30 Table: `volunteer_availability_exceptions`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `user_id` | `bigint` | NO | - | NO |
| `date` | `date` | NO | - | NO |
| `is_available` | `boolean` | NO | `false` | NO |
| `start_time` | `time without time zone` | YES | - | NO |
| `end_time` | `time without time zone` | YES | - | NO |
| `note` | `text` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_availability_exception_times` | `CHECK` | `CHECK ((((start_time IS NULL) AND (end_time IS NULL)) OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time))))` |
| `volunteer_availability_exceptions_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `volunteer_availability_exceptions_created_at_not_null` | `n` | `NOT NULL created_at` |
| `volunteer_availability_exceptions_date_not_null` | `n` | `NOT NULL date` |
| `volunteer_availability_exceptions_id_not_null` | `n` | `NOT NULL id` |
| `volunteer_availability_exceptions_is_available_not_null` | `n` | `NOT NULL is_available` |
| `volunteer_availability_exceptions_user_id_not_null` | `n` | `NOT NULL user_id` |
| `volunteer_availability_exceptions_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_availability_exception` | `UNIQUE` | `UNIQUE (user_id, date)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_availability_exceptions_user_date` | `CREATE INDEX idx_availability_exceptions_user_date ON public.volunteer_availability_exceptions USING btree (user_id, date)` |
| `uq_availability_exception` | `CREATE UNIQUE INDEX uq_availability_exception ON public.volunteer_availability_exceptions USING btree (user_id, date)` |
| `volunteer_availability_exceptions_pkey` | `CREATE UNIQUE INDEX volunteer_availability_exceptions_pkey ON public.volunteer_availability_exceptions USING btree (id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_95_availability_exceptions_audit` | `CREATE TRIGGER trg_95_availability_exceptions_audit AFTER INSERT OR UPDATE ON public.volunteer_availability_exceptions FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

### 3.31 Table: `volunteer_availability_rules`

#### Columns

| Column | Data Type | Nullable | Default | PK |
|:---|:---|:---|:---|:---|
| `id` | `bigint` | NO | - | **YES** |
| `user_id` | `bigint` | NO | - | NO |
| `weekday` | `integer` | NO | - | NO |
| `start_time` | `time without time zone` | NO | - | NO |
| `end_time` | `time without time zone` | NO | - | NO |
| `valid_from` | `date` | YES | - | NO |
| `valid_to` | `date` | YES | - | NO |
| `created_at` | `timestamp with time zone` | NO | `now()` | NO |

#### Constraints

| Constraint Name | Type | Definition |
|:---|:---|:---|
| `ck_availability_time_order` | `CHECK` | `CHECK ((end_time > start_time))` |
| `ck_availability_valid_range` | `CHECK` | `CHECK (((valid_from IS NULL) OR (valid_to IS NULL) OR (valid_to >= valid_from)))` |
| `ck_availability_weekday` | `CHECK` | `CHECK (((weekday >= 1) AND (weekday <= 7)))` |
| `volunteer_availability_rules_user_id_fkey` | `FOREIGN KEY` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `volunteer_availability_rules_created_at_not_null` | `n` | `NOT NULL created_at` |
| `volunteer_availability_rules_end_time_not_null` | `n` | `NOT NULL end_time` |
| `volunteer_availability_rules_id_not_null` | `n` | `NOT NULL id` |
| `volunteer_availability_rules_start_time_not_null` | `n` | `NOT NULL start_time` |
| `volunteer_availability_rules_user_id_not_null` | `n` | `NOT NULL user_id` |
| `volunteer_availability_rules_weekday_not_null` | `n` | `NOT NULL weekday` |
| `volunteer_availability_rules_pkey` | `PRIMARY KEY` | `PRIMARY KEY (id)` |
| `uq_availability_rule` | `UNIQUE` | `UNIQUE (user_id, weekday, start_time)` |

#### Indexes

| Index Name | Definition |
|:---|:---|
| `idx_availability_rules_user` | `CREATE INDEX idx_availability_rules_user ON public.volunteer_availability_rules USING btree (user_id, weekday)` |
| `uq_availability_rule` | `CREATE UNIQUE INDEX uq_availability_rule ON public.volunteer_availability_rules USING btree (user_id, weekday, start_time)` |
| `volunteer_availability_rules_pkey` | `CREATE UNIQUE INDEX volunteer_availability_rules_pkey ON public.volunteer_availability_rules USING btree (id)` |

#### Triggers

| Trigger Name | Definition |
|:---|:---|
| `trg_95_availability_rules_audit` | `CREATE TRIGGER trg_95_availability_rules_audit AFTER INSERT OR UPDATE ON public.volunteer_availability_rules FOR EACH ROW EXECUTE FUNCTION trg_audit_row()` |

---

## 4. Views Catalog & Definitions

Total Views: **11**

### 4.1 View: `v_accepted_unassigned`

**Output Columns:** `application_id` (bigint), `event_id` (bigint), `user_id` (bigint), `display_name` (text), `skills` (ARRAY), `physical_ok` (boolean), `can_lift_heavy` (boolean), `has_leader_experience` (boolean), `new_to_volunteer` (boolean)

```sql
SELECT ap.id AS application_id,
    ap.event_id,
    ap.user_id,
    u.display_name,
    u.skills,
    u.physical_ok,
    u.can_lift_heavy,
    u.has_leader_experience,
    u.new_to_volunteer
   FROM ((event_applications ap
     JOIN users u ON ((u.id = ap.user_id)))
     JOIN events e ON (((e.id = ap.event_id) AND (e.deleted_at IS NULL))))
  WHERE ((ap.status = 'accepted'::text) AND (NOT (EXISTS ( SELECT 1
           FROM assignments a
          WHERE ((a.application_id = ap.id) AND (a.status <> 'cancelled'::text))))));
```

### 4.2 View: `v_admin_dashboard`

**Output Columns:** `active_users` (bigint), `blocked_users` (bigint), `users_pending_verification` (bigint), `images_pending_review` (bigint), `coordinators_pending_approval` (bigint), `coordinators_approved` (bigint), `events_draft` (bigint), `events_published` (bigint), `events_active` (bigint), `events_completed` (bigint), `events_cancelled` (bigint), `events_deleted` (bigint), `pending_checkin_confirmations` (bigint), `warnings_last_30d` (bigint)

```sql
SELECT ( SELECT count(*) AS count
           FROM users
          WHERE (users.account_status = 'active'::text)) AS active_users,
    ( SELECT count(*) AS count
           FROM users
          WHERE (users.account_status = 'blocked'::text)) AS blocked_users,
    ( SELECT count(*) AS count
           FROM users
          WHERE (users.verification_status = 'pending'::text)) AS users_pending_verification,
    ( SELECT count(*) AS count
           FROM user_verification_images
          WHERE ((user_verification_images.status = 'pending'::text) AND user_verification_images.is_current)) AS images_pending_review,
    ( SELECT count(*) AS count
           FROM coordinator_profiles
          WHERE (coordinator_profiles.status = 'pending'::text)) AS coordinators_pending_approval,
    ( SELECT count(*) AS count
           FROM coordinator_profiles
          WHERE (coordinator_profiles.status = 'approved'::text)) AS coordinators_approved,
    ( SELECT count(*) AS count
           FROM events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'draft'::text))) AS events_draft,
    ( SELECT count(*) AS count
           FROM events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'published'::text))) AS events_published,
    ( SELECT count(*) AS count
           FROM events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'active'::text))) AS events_active,
    ( SELECT count(*) AS count
           FROM events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'completed'::text))) AS events_completed,
    ( SELECT count(*) AS count
           FROM events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'cancelled'::text))) AS events_cancelled,
    ( SELECT count(*) AS count
           FROM events
          WHERE (events.deleted_at IS NOT NULL)) AS events_deleted,
    ( SELECT count(*) AS count
           FROM attendance
          WHERE (attendance.confirmation_status = 'pending'::text)) AS pending_checkin_confirmations,
    ( SELECT count(*) AS count
           FROM moderation_actions
          WHERE ((moderation_actions.action_type = 'user_warning'::text) AND (moderation_actions.created_at > (now() - '30 days'::interval)))) AS warnings_last_30d;
```

### 4.3 View: `v_event_checkin_board`

**Output Columns:** `event_id` (bigint), `assignment_id` (bigint), `user_id` (bigint), `display_name` (text), `post_id` (bigint), `post_title` (text), `group_code` (text), `is_group_leader` (boolean), `assignment_status` (text), `attendance_id` (bigint), `attendance_status` (text), `method` (text), `walk_in_flag` (boolean), `checkin_at` (timestamp with time zone), `checkin_distance_m` (numeric), `confirmation_status` (text)

```sql
SELECT a.event_id,
    a.id AS assignment_id,
    u.id AS user_id,
    u.display_name,
    a.post_id,
    ep.title AS post_title,
    a.group_code,
    a.is_group_leader,
    a.status AS assignment_status,
    t.id AS attendance_id,
    t.status AS attendance_status,
    t.method,
    t.walk_in_flag,
    t.checkin_at,
    t.checkin_distance_m,
    t.confirmation_status
   FROM (((assignments a
     JOIN users u ON ((u.id = a.user_id)))
     LEFT JOIN event_posts ep ON ((ep.id = a.post_id)))
     LEFT JOIN attendance t ON (((t.event_id = a.event_id) AND (t.user_id = a.user_id))))
  WHERE (a.status <> 'cancelled'::text);
```

### 4.4 View: `v_event_checkin_status`

**Output Columns:** `event_id` (bigint), `user_id` (bigint), `display_name` (text), `post_id` (bigint), `post_title` (text), `group_code` (text), `is_group_leader` (boolean), `attendance_status` (text), `checkin_at` (timestamp with time zone), `checkin_method` (text), `walk_in_flag` (boolean), `confirmation_status` (text), `checkin_distance_m` (numeric)

```sql
SELECT event_id,
    user_id,
    display_name,
    post_id,
    post_title,
    group_code,
    is_group_leader,
    COALESCE(attendance_status, 'expected'::text) AS attendance_status,
    checkin_at,
    method AS checkin_method,
    walk_in_flag,
    confirmation_status,
    checkin_distance_m
   FROM v_event_checkin_board;
```

### 4.5 View: `v_event_coordinator_history`

**Output Columns:** `event_id` (bigint), `event_title` (text), `from_coordinator_id` (bigint), `from_name` (text), `to_coordinator_id` (bigint), `to_name` (text), `changed_by_user_id` (bigint), `changed_by_name` (text), `reason` (text), `changed_at` (timestamp with time zone)

```sql
SELECT h.event_id,
    e.title AS event_title,
    h.from_coordinator_id,
    fu.display_name AS from_name,
    h.to_coordinator_id,
    tu.display_name AS to_name,
    h.changed_by_user_id,
    cu.display_name AS changed_by_name,
    h.reason,
    h.changed_at
   FROM ((((event_coordinator_history h
     JOIN events e ON ((e.id = h.event_id)))
     LEFT JOIN users fu ON ((fu.id = h.from_coordinator_id)))
     JOIN users tu ON ((tu.id = h.to_coordinator_id)))
     LEFT JOIN users cu ON ((cu.id = h.changed_by_user_id)))
  ORDER BY h.changed_at DESC;
```

### 4.6 View: `v_event_post_capacity`

**Output Columns:** `post_id` (bigint), `event_id` (bigint), `title` (text), `status` (text), `required_headcount` (integer), `assigned_count` (bigint), `remaining` (bigint)

```sql
SELECT p.id AS post_id,
    p.event_id,
    p.title,
    p.status,
    p.required_headcount,
    count(a.id) AS assigned_count,
    GREATEST((p.required_headcount - count(a.id)), (0)::bigint) AS remaining
   FROM (event_posts p
     LEFT JOIN assignments a ON (((a.post_id = p.id) AND (a.status <> 'cancelled'::text))))
  GROUP BY p.id;
```

### 4.7 View: `v_event_summary`

**Output Columns:** `event_id` (bigint), `title` (text), `status` (text), `owner_id` (bigint), `current_coordinator_id` (bigint), `start_at` (timestamp with time zone), `end_at` (timestamp with time zone), `acceptance_mode` (text), `auto_assign_enabled` (boolean), `max_participants` (integer), `geo_checkin_enabled` (boolean), `map_provider` (text), `pending_count` (bigint), `accepted_count` (bigint), `waitlisted_count` (bigint), `assignment_count` (bigint), `checked_in_count` (bigint), `pending_confirmations` (bigint)

```sql
SELECT id AS event_id,
    title,
    status,
    owner_id,
    current_coordinator_id,
    start_at,
    end_at,
    acceptance_mode,
    auto_assign_enabled,
    max_participants,
    geo_checkin_enabled,
    map_provider,
    ( SELECT count(*) AS count
           FROM event_applications x
          WHERE ((x.event_id = e.id) AND (x.status = 'pending'::text))) AS pending_count,
    ( SELECT count(*) AS count
           FROM event_applications x
          WHERE ((x.event_id = e.id) AND (x.status = 'accepted'::text))) AS accepted_count,
    ( SELECT count(*) AS count
           FROM event_applications x
          WHERE ((x.event_id = e.id) AND (x.status = 'waitlisted'::text))) AS waitlisted_count,
    ( SELECT count(*) AS count
           FROM assignments x
          WHERE ((x.event_id = e.id) AND (x.status <> 'cancelled'::text))) AS assignment_count,
    ( SELECT count(*) AS count
           FROM attendance x
          WHERE ((x.event_id = e.id) AND (x.status = ANY (ARRAY['checked_in'::text, 'completed'::text])))) AS checked_in_count,
    ( SELECT count(*) AS count
           FROM attendance x
          WHERE ((x.event_id = e.id) AND (x.confirmation_status = 'pending'::text))) AS pending_confirmations
   FROM events e
  WHERE (deleted_at IS NULL);
```

### 4.8 View: `v_geo_attempts_review`

**Output Columns:** `id` (bigint), `event_id` (bigint), `event_title` (text), `user_id` (bigint), `display_name` (text), `attempted_at` (timestamp with time zone), `result` (text), `distance_m` (numeric), `radius_m` (integer), `accuracy_m` (numeric), `device_mocked` (boolean), `review_status` (text), `reviewed_by_user_id` (bigint), `reviewed_at` (timestamp with time zone), `review_note` (text)

```sql
SELECT ga.id,
    ga.event_id,
    e.title AS event_title,
    ga.user_id,
    u.display_name,
    ga.attempted_at,
    ga.result,
    ga.distance_m,
    ga.radius_m,
    ga.accuracy_m,
    ga.device_mocked,
    ga.review_status,
    ga.reviewed_by_user_id,
    ga.reviewed_at,
    ga.review_note
   FROM ((attendance_geo_attempts ga
     JOIN events e ON ((e.id = ga.event_id)))
     JOIN users u ON ((u.id = ga.user_id)))
  ORDER BY ga.attempted_at DESC;
```

### 4.9 View: `v_pending_confirmations`

**Output Columns:** `attendance_id` (bigint), `event_id` (bigint), `event_title` (text), `owner_id` (bigint), `current_coordinator_id` (bigint), `user_id` (bigint), `volunteer_name` (text), `checkin_at` (timestamp with time zone), `checkin_latitude` (numeric), `checkin_longitude` (numeric), `checkin_accuracy_m` (numeric), `checkin_distance_m` (numeric)

```sql
SELECT t.id AS attendance_id,
    t.event_id,
    e.title AS event_title,
    e.owner_id,
    e.current_coordinator_id,
    t.user_id,
    u.display_name AS volunteer_name,
    t.checkin_at,
    t.checkin_latitude,
    t.checkin_longitude,
    t.checkin_accuracy_m,
    t.checkin_distance_m
   FROM ((attendance t
     JOIN events e ON (((e.id = t.event_id) AND (e.deleted_at IS NULL))))
     JOIN users u ON ((u.id = t.user_id)))
  WHERE (t.confirmation_status = 'pending'::text);
```

### 4.10 View: `v_public_events`

**Output Columns:** `event_id` (bigint), `title` (text), `description` (text), `purpose_type` (text), `location_name` (text), `landmark_text` (text), `latitude` (numeric), `longitude` (numeric), `geo_radius_m` (integer), `geo_checkin_enabled` (boolean), `map_provider` (text), `start_at` (timestamp with time zone), `end_at` (timestamp with time zone), `application_deadline` (timestamp with time zone), `status` (text), `acceptance_mode` (text), `max_participants` (integer), `meals_provided` (boolean), `lodging_provided` (boolean), `travel_support_provided` (boolean), `compensation_kind` (text), `current_coordinator_id` (bigint), `coordinator_name` (text), `charity_fields` (ARRAY), `spots_remaining` (numeric)

```sql
SELECT e.id AS event_id,
    e.title,
    e.description,
    e.purpose_type,
    e.location_name,
    e.landmark_text,
    e.latitude,
    e.longitude,
    e.geo_radius_m,
    e.geo_checkin_enabled,
    e.map_provider,
    e.start_at,
    e.end_at,
    e.application_deadline,
    e.status,
    e.acceptance_mode,
    e.max_participants,
    e.meals_provided,
    e.lodging_provided,
    e.travel_support_provided,
    e.compensation_kind,
    e.current_coordinator_id,
    cu.display_name AS coordinator_name,
    COALESCE(( SELECT array_agg(f.field_code ORDER BY f.field_code) AS array_agg
           FROM event_charity_fields f
          WHERE (f.event_id = e.id)), '{}'::text[]) AS charity_fields,
    COALESCE(( SELECT sum(c.remaining) AS sum
           FROM v_event_post_capacity c
          WHERE ((c.event_id = e.id) AND (c.status <> 'closed'::text))), (0)::numeric) AS spots_remaining
   FROM (events e
     JOIN users cu ON ((cu.id = e.current_coordinator_id)))
  WHERE ((e.deleted_at IS NULL) AND (e.status = ANY (ARRAY['published'::text, 'active'::text])));
```

### 4.11 View: `v_user_moderation_summary`

**Output Columns:** `user_id` (bigint), `warning_count` (bigint), `last_warning_at` (timestamp with time zone), `block_count` (bigint), `last_block_at` (timestamp with time zone)

```sql
SELECT target_user_id AS user_id,
    count(*) FILTER (WHERE (action_type = 'user_warning'::text)) AS warning_count,
    max(created_at) FILTER (WHERE (action_type = 'user_warning'::text)) AS last_warning_at,
    count(*) FILTER (WHERE (action_type = 'user_block'::text)) AS block_count,
    max(created_at) FILTER (WHERE (action_type = 'user_block'::text)) AS last_block_at
   FROM moderation_actions m
  WHERE (target_user_id IS NOT NULL)
  GROUP BY target_user_id;
```

---

## 5. Domain Stored Procedures & Security Functions

Total Domain Functions: **63**

| Function Name | Arguments | Return Type | Language |
|:---|:---|:---|:---|
| `app_ip` | `none` | `inet` | `sql` |
| `app_user_id` | `none` | `bigint` | `sql` |
| `application_remaining_capacity` | `p_event bigint, p_post bigint` | `integer` | `plpgsql` |
| `assert_actor` | `p_actor bigint` | `void` | `plpgsql` |
| `assign_manually` | `p_application bigint, p_post bigint, p_actor bigint, p_group_code text DEFAULT NULL::text, p_leader boolean DEFAULT false` | `bigint` | `plpgsql` |
| `change_event_coordinator` | `p_event bigint, p_new_coordinator bigint, p_actor bigint, p_reason text DEFAULT NULL::text` | `void` | `plpgsql` |
| `confirm_attendance` | `p_attendance bigint, p_actor bigint, p_note text DEFAULT NULL::text` | `void` | `plpgsql` |
| `consume_qr_token` | `p_token bigint, p_purpose text` | `void` | `plpgsql` |
| `create_assignment_from_application` | `p_application bigint, p_actor bigint DEFAULT NULL::bigint` | `bigint` | `plpgsql` |
| `create_otp_challenge` | `p_otp_id bigint, p_challenge_token_hash text, p_ttl_seconds integer DEFAULT 180, p_purpose text DEFAULT 'login'::text, p_request_id text DEFAULT NULL::text, p_identity_nonce_hash text DEFAULT NULL::text` | `bigint` | `plpgsql` |
| `expire_stale_applications` | `none` | `integer` | `plpgsql` |
| `geo_check_in` | `p_event bigint, p_user bigint, p_lat double precision, p_lon double precision, p_accuracy_m double precision, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_mocked boolean DEFAULT false` | `record` | `plpgsql` |
| `geo_distance_m` | `lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision` | `double precision` | `sql` |
| `is_admin_user` | `p_user bigint` | `boolean` | `sql` |
| `is_approved_coordinator` | `p_user bigint` | `boolean` | `sql` |
| `is_event_manager` | `p_event bigint, p_user bigint` | `boolean` | `sql` |
| `is_user_available` | `p_user bigint, p_start timestamp with time zone, p_end timestamp with time zone` | `boolean` | `plpgsql` |
| `purge_expired_otp_challenges` | `p_retention interval DEFAULT '1 day'::interval` | `integer` | `plpgsql` |
| `purge_expired_otps` | `none` | `integer` | `plpgsql` |
| `purge_geo_evidence` | `p_older_than interval DEFAULT '90 days'::interval` | `integer` | `plpgsql` |
| `qr_check_in` | `p_token_hash text, p_user bigint` | `bigint` | `plpgsql` |
| `qr_token_status` | `p_token_hash text` | `record` | `sql` |
| `qr_walkin_apply` | `p_token_hash text, p_user bigint` | `bigint` | `plpgsql` |
| `recompute_user_verification` | `p_user bigint` | `void` | `plpgsql` |
| `reject_attendance` | `p_attendance bigint, p_actor bigint, p_reason text` | `void` | `plpgsql` |
| `release_expired_blocks` | `none` | `integer` | `plpgsql` |
| `request_otp` | `p_phone_hash text, p_code_hash text, p_purpose text DEFAULT 'login'::text` | `bigint` | `plpgsql` |
| `run_auto_assignment` | `p_event bigint, p_actor bigint DEFAULT NULL::bigint` | `integer` | `plpgsql` |
| `self_test` | `none` | `record` | `plpgsql` |
| `set_updated_at` | `none` | `trigger` | `plpgsql` |
| `setting_int` | `p_key text` | `integer` | `sql` |
| `tags_are_normalized` | `tags text[]` | `boolean` | `sql` |
| `trg_applications_after` | `none` | `trigger` | `plpgsql` |
| `trg_applications_before_insert` | `none` | `trigger` | `plpgsql` |
| `trg_applications_before_update` | `none` | `trigger` | `plpgsql` |
| `trg_assignments_after_insert` | `none` | `trigger` | `plpgsql` |
| `trg_assignments_after_update` | `none` | `trigger` | `plpgsql` |
| `trg_assignments_before_insert` | `none` | `trigger` | `plpgsql` |
| `trg_assignments_before_update` | `none` | `trigger` | `plpgsql` |
| `trg_attendance_before_insert` | `none` | `trigger` | `plpgsql` |
| `trg_attendance_guard` | `none` | `trigger` | `plpgsql` |
| `trg_audit_row` | `none` | `trigger` | `plpgsql` |
| `trg_auth_otp_challenge_before` | `none` | `trigger` | `plpgsql` |
| `trg_block_mutation` | `none` | `trigger` | `plpgsql` |
| `trg_coordinator_guard` | `none` | `trigger` | `plpgsql` |
| `trg_events_after_insert` | `none` | `trigger` | `plpgsql` |
| `trg_events_after_update` | `none` | `trigger` | `plpgsql` |
| `trg_events_before_insert` | `none` | `trigger` | `plpgsql` |
| `trg_events_before_update` | `none` | `trigger` | `plpgsql` |
| `trg_feedback_guard` | `none` | `trigger` | `plpgsql` |
| `trg_geo_attempts_guard` | `none` | `trigger` | `plpgsql` |
| `trg_moderation_after_insert` | `none` | `trigger` | `plpgsql` |
| `trg_moderation_before_insert` | `none` | `trigger` | `plpgsql` |
| `trg_onboarding_before_insert` | `none` | `trigger` | `plpgsql` |
| `trg_otp_rate_limit` | `none` | `trigger` | `plpgsql` |
| `trg_posts_guard` | `none` | `trigger` | `plpgsql` |
| `trg_qr_guard` | `none` | `trigger` | `plpgsql` |
| `trg_users_guard` | `none` | `trigger` | `plpgsql` |
| `trg_vimg_after` | `none` | `trigger` | `plpgsql` |
| `trg_vimg_guard` | `none` | `trigger` | `plpgsql` |
| `user_has_schedule_conflict` | `p_user bigint, p_start timestamp with time zone, p_end timestamp with time zone, p_except_event bigint DEFAULT NULL::bigint` | `boolean` | `sql` |
| `verify_otp` | `p_phone_hash text, p_code_hash text, p_purpose text DEFAULT 'login'::text` | `text` | `plpgsql` |
| `verify_otp_challenge` | `p_challenge_token_hash text, p_code_hash text, p_purpose text DEFAULT 'login'::text` | `record` | `plpgsql` |
