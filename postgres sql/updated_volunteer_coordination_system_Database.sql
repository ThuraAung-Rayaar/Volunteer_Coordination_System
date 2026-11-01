-- =============================================================================
-- Volunteer Coordination System: Unified PostgreSQL Schema v0.5.2 (Database-First)
--
-- Target Engine : PostgreSQL 14+ (with btree_gist)
-- Architecture  : Option A (Coordinator FKs -> coordinator_profiles.user_id)
--
-- Run on an EMPTY database. Single transaction: any error rolls everything back.
--   psql -U postgres -d volunteer_coordination_db -f volunteer_coordination_system_postgres_v0_5_2.sql
--   psql -U postgres -d volunteer_coordination_db -c "SELECT * FROM self_test();"
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- required for ex_assignments_no_overlap

-- =============================================================================
-- 0. SETTINGS AND PURE HELPER FUNCTIONS
-- =============================================================================

CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value_int   INTEGER NOT NULL,
    description TEXT,

    CONSTRAINT ck_app_settings_key CHECK (key ~ '^[a-z][a-z0-9_]*$')
);

INSERT INTO app_settings (key, value_int, description) VALUES
    ('geo_max_accuracy_m',            100, 'Reject GPS fixes less accurate than this (metres)'),
    ('geo_default_radius_m',          150, 'Geofence radius when the event does not set one (metres)'),
    ('geo_max_fix_age_sec',            60, 'Reject GPS fixes older than this (seconds)'),
    ('geo_checkin_window_before_min',  30, 'Default minutes before event.start_at when geo check-in opens'),
    ('otp_max_requests_per_hour',       5, 'OTP requests allowed per phone per hour'),
    ('otp_max_attempts',                5, 'Wrong-code attempts allowed per OTP'),
    ('otp_ttl_minutes',                 5, 'OTP lifetime (minutes)');

CREATE FUNCTION setting_int(p_key TEXT)
RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT value_int FROM app_settings WHERE key = p_key
$$;

CREATE FUNCTION app_user_id()
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::BIGINT
$$;

CREATE FUNCTION app_ip()
RETURNS INET
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.ip', true), '')::INET
$$;

-- Great-circle distance in metres (Haversine, Earth radius 6,371,000 m)
CREATE FUNCTION geo_distance_m(
    lat1 DOUBLE PRECISION, lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION, lon2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT 2 * 6371000.0 * asin(least(1.0, sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2))))
$$;

-- Tag arrays must be lowercase, trimmed, non-empty, at most 30 tags of 50 chars
CREATE FUNCTION tags_are_normalized(tags TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(cardinality(tags) <= 30, FALSE)
       AND NOT EXISTS (
            SELECT 1 FROM unnest(tags) AS t(tag)
             WHERE t.tag IS NULL
                OR t.tag = ''
                OR t.tag <> lower(btrim(t.tag))
                OR char_length(t.tag) > 50)
$$;

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 1. LOOKUP: CHARITY FIELDS
-- =============================================================================

CREATE TABLE charity_fields (
    code       TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT ck_charity_fields_code  CHECK (code ~ '^[a-z][a-z0-9_]{1,49}$'),
    CONSTRAINT ck_charity_fields_label CHECK (char_length(btrim(label)) BETWEEN 1 AND 100)
);

INSERT INTO charity_fields (code, label, sort_order) VALUES
    ('teaching',          'Teaching',            10),
    ('food_distribution', 'Food Distribution',   20),
    ('elderly_care',      'Elderly Care',        30),
    ('child_care',        'Child Care',          40),
    ('animal_welfare',    'Animal Welfare',      50),
    ('environment',       'Environment',         60),
    ('disaster_support',  'Disaster Support',    70),
    ('blood_donation',    'Blood Donation',      80),
    ('fundraising',       'Fundraising',         90),
    ('logistics',         'Logistics',          100),
    ('cleaning',          'Cleaning',           110),
    ('cooking',           'Cooking',            120),
    ('other',             'Other',              999);

-- =============================================================================
-- 2. USERS, CHARITY INTERESTS & VOLUNTEER AVAILABILITY
-- =============================================================================

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    phone_hash   TEXT NOT NULL,                 -- keyed hash (HMAC) of the phone number
    phone_enc    TEXT NOT NULL,                 -- encrypted phone number
    password     TEXT,                          -- admin web login only (hash); NULL for OTP-only users
    last_login   TIMESTAMPTZ,

    display_name TEXT NOT NULL,

    -- Privilege flags. Staff and superuser imply admin. Only admins can change them.
    is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
    is_staff     BOOLEAN NOT NULL DEFAULT FALSE,
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,

    -- is_active is kept in sync with account_status by a trigger and a check
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    account_status TEXT NOT NULL DEFAULT 'active',   -- active | blocked | closed
    blocked_until  TIMESTAMPTZ,                      -- NULL while blocked = indefinite

    preferred_language TEXT NOT NULL DEFAULT 'en',
    home_area          TEXT,

    emergency_contact_name      TEXT,
    emergency_contact_phone_enc TEXT,

    blood_type                 TEXT NOT NULL DEFAULT 'unknown',
    is_willing_to_donate       BOOLEAN NOT NULL DEFAULT FALSE,
    is_willing_to_donate_blood BOOLEAN NOT NULL DEFAULT FALSE,
    is_willing_to_donate_items BOOLEAN NOT NULL DEFAULT FALSE,

    -- Self-declared capability hints (not medical clearance)
    physical_ok           BOOLEAN NOT NULL DEFAULT FALSE,
    good_eyesight         BOOLEAN NOT NULL DEFAULT TRUE,
    needs_glasses         BOOLEAN NOT NULL DEFAULT FALSE,
    can_lift_heavy        BOOLEAN NOT NULL DEFAULT FALSE,
    can_work_outdoor      BOOLEAN NOT NULL DEFAULT FALSE,
    has_leader_experience BOOLEAN NOT NULL DEFAULT FALSE,
    new_to_volunteer      BOOLEAN NOT NULL DEFAULT TRUE,

    skills TEXT[] NOT NULL DEFAULT '{}',

    needs_meal_support   BOOLEAN NOT NULL DEFAULT FALSE,
    needs_travel_support BOOLEAN NOT NULL DEFAULT FALSE,
    accepts_unpaid       BOOLEAN NOT NULL DEFAULT TRUE,

    -- Derived from user_verification_images by trigger (never written by the app)
    verification_status TEXT NOT NULL DEFAULT 'none',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_phone_hash UNIQUE (phone_hash),

    CONSTRAINT ck_users_phone_hash_len
        CHECK (char_length(phone_hash) BETWEEN 32 AND 128),
    CONSTRAINT ck_users_display_name
        CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 150),
    CONSTRAINT ck_users_language
        CHECK (preferred_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
    CONSTRAINT ck_users_account_status
        CHECK (account_status IN ('active', 'blocked', 'closed')),
    CONSTRAINT ck_users_active_status_sync
        CHECK (is_active = (account_status = 'active')),
    CONSTRAINT ck_users_blocked_until
        CHECK (blocked_until IS NULL OR account_status = 'blocked'),
    CONSTRAINT ck_users_admin_flags
        CHECK ((NOT is_staff AND NOT is_superuser) OR is_admin),
    CONSTRAINT ck_users_blood_type
        CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')),
    CONSTRAINT ck_users_donation_consistency
        CHECK (is_willing_to_donate
               OR (NOT is_willing_to_donate_blood AND NOT is_willing_to_donate_items)),
    CONSTRAINT ck_users_emergency_pair
        CHECK ((emergency_contact_name IS NULL) = (emergency_contact_phone_enc IS NULL)),
    CONSTRAINT ck_users_skills
        CHECK (tags_are_normalized(skills)),
    CONSTRAINT ck_users_verification_status
        CHECK (verification_status IN ('none', 'pending', 'verified', 'rejected'))
);

CREATE INDEX idx_users_account_status      ON users (account_status);
CREATE INDEX idx_users_verification_status ON users (verification_status);
CREATE INDEX idx_users_is_admin            ON users (id) WHERE is_admin;
CREATE INDEX idx_users_blood_donors        ON users (blood_type) WHERE is_willing_to_donate_blood;
CREATE INDEX idx_users_skills_gin          ON users USING GIN (skills);
CREATE INDEX idx_users_blocked_until       ON users (blocked_until) WHERE account_status = 'blocked';

CREATE TABLE user_charity_interests (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    field_code TEXT   NOT NULL REFERENCES charity_fields (code) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_user_charity_interest UNIQUE (user_id, field_code)
);

CREATE INDEX idx_user_charity_interests_user  ON user_charity_interests (user_id);
CREATE INDEX idx_user_charity_interests_field ON user_charity_interests (field_code);

-- Volunteer recurring weekly availability windows
CREATE TABLE volunteer_availability_rules (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    weekday    INTEGER NOT NULL,
    start_time TIME    NOT NULL,
    end_time   TIME    NOT NULL,
    valid_from DATE,
    valid_to   DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_availability_rule
        UNIQUE (user_id, weekday, start_time),
    CONSTRAINT ck_availability_weekday
        CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT ck_availability_time_order
        CHECK (end_time > start_time),
    CONSTRAINT ck_availability_valid_range
        CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX idx_availability_rules_user ON volunteer_availability_rules (user_id, weekday);

-- Date-specific availability overrides / blackouts
CREATE TABLE volunteer_availability_exceptions (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date         DATE    NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT FALSE,
    start_time   TIME,
    end_time     TIME,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_availability_exception
        UNIQUE (user_id, date),
    CONSTRAINT ck_availability_exception_times
        CHECK (
            (start_time IS NULL AND end_time IS NULL)
            OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
        )
);

CREATE INDEX idx_availability_exceptions_user_date ON volunteer_availability_exceptions (user_id, date);

-- =============================================================================
-- 3. COORDINATOR PROFILES
-- A user can own or coordinate events only while status = 'approved'.
-- =============================================================================

CREATE TABLE coordinator_profiles (
    user_id        BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,

    status         TEXT NOT NULL DEFAULT 'pending',
    approved_by_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    approved_at    TIMESTAMPTZ,
    notes          TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_coordinator_status
        CHECK (status IN ('pending', 'approved', 'suspended', 'revoked')),
    CONSTRAINT ck_coordinator_approval
        CHECK (status IN ('pending', 'revoked')
               OR (approved_at IS NOT NULL AND approved_by_id IS NOT NULL)),
    CONSTRAINT ck_coordinator_no_self_approval
        CHECK (approved_by_id IS NULL OR approved_by_id <> user_id)
);

CREATE INDEX idx_coordinator_profiles_status      ON coordinator_profiles (status);
CREATE INDEX idx_coordinator_profiles_approved_by ON coordinator_profiles (approved_by_id);

-- =============================================================================
-- 4. USER VERIFICATION IMAGES (JPEG only; the database stores the server path)
-- =============================================================================

CREATE TABLE user_verification_images (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    image_type  TEXT NOT NULL,
    image_path  TEXT NOT NULL,
    file_format TEXT NOT NULL DEFAULT 'jpeg',
    file_sha256 TEXT,

    status            TEXT NOT NULL DEFAULT 'pending',
    comparison_status TEXT NOT NULL DEFAULT 'pending',
    comparison_score  NUMERIC(5,4),

    is_current BOOLEAN NOT NULL DEFAULT TRUE,

    reviewed_by_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    reviewed_at    TIMESTAMPTZ,
    note           TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_verification_image_type
        CHECK (image_type IN ('mock_selfie', 'id_license', 'driver_license')),
    CONSTRAINT ck_verification_file_format
        CHECK (file_format = 'jpeg'),
    CONSTRAINT ck_verification_image_path
        CHECK (char_length(btrim(image_path)) BETWEEN 1 AND 255
               AND lower(image_path) ~ '\.jpe?g$'),
    CONSTRAINT ck_verification_sha256
        CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_verification_status
        CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT ck_verification_comparison_status
        CHECK (comparison_status IN ('pending', 'match', 'no_match', 'needs_review')),
    CONSTRAINT ck_verification_score_range
        CHECK (comparison_score IS NULL OR (comparison_score >= 0 AND comparison_score <= 1)),
    CONSTRAINT ck_verification_review
        CHECK (status = 'pending' OR (reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT ck_verification_no_self_review
        CHECK (reviewed_by_id IS NULL OR reviewed_by_id <> user_id)
);

CREATE INDEX idx_verification_images_user    ON user_verification_images (user_id);
CREATE INDEX idx_verification_images_pending ON user_verification_images (id)
    WHERE status = 'pending' AND is_current;

-- One current image per type per user
CREATE UNIQUE INDEX uq_current_verification_image
    ON user_verification_images (user_id, image_type)
    WHERE is_current;

-- =============================================================================
-- 5. AUTH OTP
-- =============================================================================

CREATE TABLE auth_otp (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    phone_hash    TEXT NOT NULL,
    code_hash     TEXT NOT NULL,                -- never the raw code
    purpose       TEXT NOT NULL DEFAULT 'login',
    attempt_count INTEGER NOT NULL DEFAULT 0,

    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_auth_otp_purpose
        CHECK (purpose IN ('login', 'qr_registration')),
    CONSTRAINT ck_auth_otp_attempt_count
        CHECK (attempt_count BETWEEN 0 AND 100),
    CONSTRAINT ck_auth_otp_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT ck_auth_otp_consumed
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX idx_auth_otp_phone_created ON auth_otp (phone_hash, created_at DESC);
CREATE INDEX idx_auth_otp_open          ON auth_otp (phone_hash, purpose) WHERE consumed_at IS NULL;
CREATE INDEX idx_auth_otp_expires       ON auth_otp (expires_at);

-- =============================================================================
-- 6. EVENTS
--   owner_id               : the coordinator who created the event. NEVER changes.
--   current_coordinator_id : the coordinator running it now. Can be handed over
--                            (see change_event_coordinator and event_coordinator_history).
-- =============================================================================

CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    owner_id               BIGINT NOT NULL REFERENCES coordinator_profiles (user_id) ON DELETE RESTRICT,
    current_coordinator_id BIGINT NOT NULL REFERENCES coordinator_profiles (user_id) ON DELETE RESTRICT,

    title         TEXT NOT NULL,
    description   TEXT,
    purpose_type  TEXT NOT NULL DEFAULT 'charity_event',

    location_name TEXT,
    landmark_text TEXT,

    -- Geo check-in & map provider
    latitude                     NUMERIC(9,6),
    longitude                    NUMERIC(9,6),
    geo_radius_m                 INTEGER,                      -- NULL = app_settings.geo_default_radius_m
    geo_checkin_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    geo_checkin_opens_before_min INTEGER NOT NULL DEFAULT 30,  -- window opens this long before start_at
    require_checkin_confirmation BOOLEAN NOT NULL DEFAULT TRUE, -- coordinator must confirm geo check-ins
    map_provider                 TEXT NOT NULL DEFAULT 'openstreetmap',

    start_at             TIMESTAMPTZ NOT NULL,
    end_at               TIMESTAMPTZ NOT NULL,
    application_deadline TIMESTAMPTZ,

    status              TEXT NOT NULL DEFAULT 'draft',
    acceptance_mode     TEXT NOT NULL DEFAULT 'manual',
    auto_assign_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    group_size          INTEGER,
    leader_strategy     TEXT NOT NULL DEFAULT 'none',
    max_participants    INTEGER,

    -- Recruiting conditions (informational only; no payroll in this system)
    meals_provided          BOOLEAN NOT NULL DEFAULT FALSE,
    lodging_provided        BOOLEAN NOT NULL DEFAULT FALSE,
    travel_support_provided BOOLEAN NOT NULL DEFAULT FALSE,
    compensation_kind       TEXT NOT NULL DEFAULT 'unpaid',
    compensation_note       TEXT,

    -- Onboarding (version is bumped by trigger when the text changes)
    onboarding_text        TEXT,
    onboarding_version     INTEGER NOT NULL DEFAULT 1,
    require_onboarding_ack BOOLEAN NOT NULL DEFAULT TRUE,

    qr_registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Lifecycle timestamps (set by trigger on each transition)
    published_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,

    -- Admin soft delete
    deleted_at    TIMESTAMPTZ,
    deleted_by_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_events_title
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 255),
    CONSTRAINT ck_events_purpose_type
        CHECK (purpose_type IN ('charity_event', 'help_wanted_event')),
    CONSTRAINT ck_events_status
        CHECK (status IN ('draft', 'published', 'active', 'completed', 'cancelled')),
    CONSTRAINT ck_events_acceptance_mode
        CHECK (acceptance_mode IN ('auto', 'manual')),
    CONSTRAINT ck_events_leader_strategy
        CHECK (leader_strategy IN ('none', 'first_experienced', 'manual')),
    CONSTRAINT ck_events_compensation_kind
        CHECK (compensation_kind IN ('unpaid', 'arranged_outside_system')),
    CONSTRAINT ck_events_map_provider
        CHECK (map_provider IN ('openstreetmap', 'google')),
    CONSTRAINT ck_events_group_size
        CHECK (group_size IS NULL OR group_size > 0),
    CONSTRAINT ck_events_max_participants
        CHECK (max_participants IS NULL OR max_participants > 0),
    CONSTRAINT ck_events_onboarding_version
        CHECK (onboarding_version >= 1),
    CONSTRAINT ck_events_time
        CHECK (end_at > start_at),
    CONSTRAINT ck_events_deadline
        CHECK (application_deadline IS NULL OR application_deadline <= start_at),
    CONSTRAINT ck_events_soft_delete
        CHECK ((deleted_at IS NULL) = (deleted_by_id IS NULL)),

    -- Geo
    CONSTRAINT ck_events_geo_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT ck_events_lat_range
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_events_lng_range
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT ck_events_geo_radius
        CHECK (geo_radius_m IS NULL OR geo_radius_m BETWEEN 20 AND 5000),
    CONSTRAINT ck_events_geo_window
        CHECK (geo_checkin_opens_before_min BETWEEN 0 AND 240),
    CONSTRAINT ck_events_geo_enabled_needs_point
        CHECK (NOT geo_checkin_enabled OR latitude IS NOT NULL),

    -- Lifecycle timestamps must match the status
    CONSTRAINT ck_events_status_timestamps
        CHECK (
            (status = 'draft'
                AND published_at IS NULL AND activated_at IS NULL
                AND completed_at IS NULL AND cancelled_at IS NULL)
         OR (status = 'published'
                AND published_at IS NOT NULL AND activated_at IS NULL
                AND completed_at IS NULL AND cancelled_at IS NULL)
         OR (status = 'active'
                AND published_at IS NOT NULL AND activated_at IS NOT NULL
                AND completed_at IS NULL AND cancelled_at IS NULL)
         OR (status = 'completed'
                AND published_at IS NOT NULL AND activated_at IS NOT NULL
                AND completed_at IS NOT NULL AND cancelled_at IS NULL)
         OR (status = 'cancelled'
                AND cancelled_at IS NOT NULL AND completed_at IS NULL)
        )
);

CREATE INDEX idx_events_owner       ON events (owner_id);
CREATE INDEX idx_events_coordinator ON events (current_coordinator_id);
CREATE INDEX idx_events_start_at    ON events (start_at);
CREATE INDEX idx_events_visible     ON events (status, start_at) WHERE deleted_at IS NULL;

CREATE TABLE event_coordinator_history (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id   BIGINT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,

    from_coordinator_id BIGINT REFERENCES coordinator_profiles (user_id) ON DELETE RESTRICT, -- NULL = first assignment
    to_coordinator_id   BIGINT NOT NULL REFERENCES coordinator_profiles (user_id) ON DELETE RESTRICT,

    changed_by_user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    reason             TEXT,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_coord_history_changed
        CHECK (from_coordinator_id IS DISTINCT FROM to_coordinator_id)
);

CREATE INDEX idx_coord_history_event ON event_coordinator_history (event_id, changed_at);

CREATE TABLE event_charity_fields (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id   BIGINT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    field_code TEXT   NOT NULL REFERENCES charity_fields (code) ON DELETE RESTRICT,

    CONSTRAINT uq_event_charity_field UNIQUE (event_id, field_code)
);

CREATE INDEX idx_event_charity_fields_event ON event_charity_fields (event_id);
CREATE INDEX idx_event_charity_fields_field ON event_charity_fields (field_code);

-- =============================================================================
-- 7. EVENT POSTS (roles needed at an event)
-- =============================================================================

CREATE TABLE event_posts (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,

    title       TEXT NOT NULL,
    description TEXT,

    required_headcount INTEGER NOT NULL,
    physical_level     TEXT NOT NULL DEFAULT 'none',
    required_skills    TEXT[] NOT NULL DEFAULT '{}',

    leader_needed          BOOLEAN NOT NULL DEFAULT FALSE,
    new_volunteers_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    priority               INTEGER NOT NULL DEFAULT 100,      -- lower = filled first

    status TEXT NOT NULL DEFAULT 'open',                      -- open/full maintained by trigger; closed set by coordinator

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_event_posts_event_title UNIQUE (event_id, title),
    CONSTRAINT uq_event_posts_id_event    UNIQUE (id, event_id),   -- target of composite foreign keys

    CONSTRAINT ck_event_posts_title
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 150),
    CONSTRAINT ck_event_posts_headcount
        CHECK (required_headcount BETWEEN 1 AND 100000),
    CONSTRAINT ck_event_posts_physical_level
        CHECK (physical_level IN ('none', 'light', 'medium', 'heavy')),
    CONSTRAINT ck_event_posts_skills
        CHECK (tags_are_normalized(required_skills)),
    CONSTRAINT ck_event_posts_status
        CHECK (status IN ('open', 'full', 'closed'))
);

CREATE INDEX idx_event_posts_event      ON event_posts (event_id);
CREATE INDEX idx_event_posts_skills_gin ON event_posts USING GIN (required_skills);

-- =============================================================================
-- 8. QR TOKENS (only the hash is stored)
-- =============================================================================

CREATE TABLE qr_tokens (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id      BIGINT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    created_by_id BIGINT NOT NULL REFERENCES users (id)  ON DELETE RESTRICT,

    purpose    TEXT NOT NULL,
    token_hash TEXT NOT NULL,

    max_uses   INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,

    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_qr_tokens_token_hash UNIQUE (token_hash),
    CONSTRAINT uq_qr_tokens_id_event   UNIQUE (id, event_id),

    CONSTRAINT ck_qr_purpose
        CHECK (purpose IN ('walkin_registration', 'checkin', 'join_event')),
    CONSTRAINT ck_qr_hash_len
        CHECK (char_length(token_hash) BETWEEN 32 AND 128),
    CONSTRAINT ck_qr_max_uses
        CHECK (max_uses IS NULL OR max_uses > 0),
    CONSTRAINT ck_qr_used_count_nonnegative
        CHECK (used_count >= 0),
    CONSTRAINT ck_qr_used_count
        CHECK (max_uses IS NULL OR used_count <= max_uses),
    CONSTRAINT ck_qr_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT ck_qr_revoked
        CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX idx_qr_tokens_event_purpose ON qr_tokens (event_id, purpose);

-- =============================================================================
-- 9. EVENT APPLICATIONS
-- =============================================================================

CREATE TABLE event_applications (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id    BIGINT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    post_id     BIGINT,
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    qr_token_id BIGINT,

    source TEXT NOT NULL DEFAULT 'browse',
    status TEXT NOT NULL DEFAULT 'pending',

    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- decided_by_id NULL with decided_at set = decided automatically by the system
    decided_by_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    decided_at    TIMESTAMPTZ,

    conditions_acknowledged_at TIMESTAMPTZ,
    conditions_snapshot        JSONB,
    note                       TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_event_applications_id_event_user UNIQUE (id, event_id, user_id),

    -- The post and the QR token must belong to the same event as the application
    CONSTRAINT fk_applications_post_event
        FOREIGN KEY (post_id, event_id) REFERENCES event_posts (id, event_id) ON DELETE RESTRICT,
    CONSTRAINT fk_applications_qr_event
        FOREIGN KEY (qr_token_id, event_id) REFERENCES qr_tokens (id, event_id) ON DELETE RESTRICT,

    CONSTRAINT ck_application_source
        CHECK (source IN ('browse', 'qr_walkin', 'invite')),
    CONSTRAINT ck_application_status
        CHECK (status IN ('pending', 'accepted', 'waitlisted', 'rejected', 'withdrawn', 'expired')),
    CONSTRAINT ck_application_walkin_token
        CHECK ((source = 'qr_walkin') = (qr_token_id IS NOT NULL)),
    CONSTRAINT ck_application_decided
        CHECK (status NOT IN ('accepted', 'rejected') OR decided_at IS NOT NULL),
    CONSTRAINT ck_application_decider
        CHECK (decided_by_id IS NULL OR decided_at IS NOT NULL),
    CONSTRAINT ck_application_no_self_decision
        CHECK (decided_by_id IS NULL OR decided_by_id <> user_id)
);

CREATE INDEX idx_event_applications_event  ON event_applications (event_id, status);
CREATE INDEX idx_event_applications_user   ON event_applications (user_id);
CREATE INDEX idx_event_applications_post   ON event_applications (post_id) WHERE post_id IS NOT NULL;

-- One active application per user per event
CREATE UNIQUE INDEX uq_event_application_active
    ON event_applications (event_id, user_id)
    WHERE status IN ('pending', 'accepted', 'waitlisted');

-- =============================================================================
-- 10. ASSIGNMENTS
-- =============================================================================

CREATE TABLE assignments (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id       BIGINT NOT NULL,
    application_id BIGINT NOT NULL,
    user_id        BIGINT NOT NULL,
    post_id        BIGINT,

    group_code      TEXT,
    is_group_leader BOOLEAN NOT NULL DEFAULT FALSE,

    status              TEXT NOT NULL DEFAULT 'assigned',
    assigned_by         TEXT NOT NULL DEFAULT 'auto',
    assigned_by_user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,

    schedule_start TIMESTAMPTZ NOT NULL,       -- filled from the event by trigger when omitted
    schedule_end   TIMESTAMPTZ NOT NULL,

    confirmed_at  TIMESTAMPTZ,
    cancelled_at  TIMESTAMPTZ,
    cancel_reason TEXT,

    conditions_snapshot JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_assignments_id_event_user UNIQUE (id, event_id, user_id),

    -- Event and user must match the application; post must belong to the event
    CONSTRAINT fk_assignments_application
        FOREIGN KEY (application_id, event_id, user_id)
        REFERENCES event_applications (id, event_id, user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignments_post_event
        FOREIGN KEY (post_id, event_id) REFERENCES event_posts (id, event_id) ON DELETE RESTRICT,

    CONSTRAINT ck_assignment_status
        CHECK (status IN ('assigned', 'confirmed', 'completed', 'cancelled')),
    CONSTRAINT ck_assignment_assigned_by
        CHECK (assigned_by IN ('auto', 'coordinator', 'admin')),
    CONSTRAINT ck_assignment_actor
        CHECK ((assigned_by = 'auto') = (assigned_by_user_id IS NULL)),
    CONSTRAINT ck_assignment_schedule
        CHECK (schedule_end > schedule_start),
    CONSTRAINT ck_assignment_leader_group
        CHECK (NOT is_group_leader OR group_code IS NOT NULL),
    CONSTRAINT ck_assignment_confirmed_at
        CHECK ((status IN ('confirmed', 'completed') AND confirmed_at IS NOT NULL)
               OR status IN ('assigned', 'cancelled', 'completed')),
    CONSTRAINT ck_assignment_cancelled_at
        CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),

    -- A volunteer cannot hold two overlapping active assignments
    CONSTRAINT ex_assignments_no_overlap
        EXCLUDE USING gist (
            user_id WITH =,
            tstzrange(schedule_start, schedule_end, '[)') WITH &&
        ) WHERE (status <> 'cancelled')
);

CREATE INDEX idx_assignments_event ON assignments (event_id, status);
CREATE INDEX idx_assignments_user  ON assignments (user_id);
CREATE INDEX idx_assignments_post  ON assignments (post_id) WHERE post_id IS NOT NULL;

-- One active assignment per user per event, and per application
CREATE UNIQUE INDEX uq_assignment_active
    ON assignments (event_id, user_id) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX uq_assignment_application
    ON assignments (application_id) WHERE status <> 'cancelled';
-- At most one active leader per group within an event
CREATE UNIQUE INDEX uq_assignment_group_leader
    ON assignments (event_id, group_code) WHERE is_group_leader AND status <> 'cancelled';

-- =============================================================================
-- 11. ATTENDANCE (presence evidence only; no payroll or timing calculation)
-- =============================================================================

CREATE TABLE attendance (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id      BIGINT NOT NULL,
    user_id       BIGINT NOT NULL,
    assignment_id BIGINT NOT NULL,
    qr_token_id   BIGINT,

    status TEXT NOT NULL DEFAULT 'expected',

    checkin_at  TIMESTAMPTZ,
    checkout_at TIMESTAMPTZ,

    method              TEXT,
    recorded_by_user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    walk_in_flag        BOOLEAN NOT NULL DEFAULT FALSE,
    note                TEXT,

    -- Geo evidence of the CURRENT check-in (cleared if the coordinator rejects it;
    -- every attempt is kept in attendance_geo_attempts)
    checkin_latitude    NUMERIC(9,6),
    checkin_longitude   NUMERIC(9,6),
    checkin_accuracy_m  NUMERIC(7,1),
    checkin_distance_m  NUMERIC(10,1),
    geo_verified        BOOLEAN NOT NULL DEFAULT FALSE,

    -- Coordinator confirmation of geo check-ins
    confirmation_status  TEXT NOT NULL DEFAULT 'not_required',
    confirmed_by_user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    confirmed_at         TIMESTAMPTZ,
    confirmation_note    TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_attendance_event_user UNIQUE (event_id, user_id),

    CONSTRAINT fk_attendance_assignment
        FOREIGN KEY (assignment_id, event_id, user_id)
        REFERENCES assignments (id, event_id, user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_attendance_qr_event
        FOREIGN KEY (qr_token_id, event_id) REFERENCES qr_tokens (id, event_id) ON DELETE RESTRICT,

    CONSTRAINT ck_attendance_status
        CHECK (status IN ('expected', 'checked_in', 'absent', 'completed', 'cancelled')),
    CONSTRAINT ck_attendance_method
        CHECK (method IS NULL OR method IN ('qr_scan', 'coordinator_manual', 'geo', 'system')),
    CONSTRAINT ck_attendance_walkin_method
        CHECK (NOT walk_in_flag OR method IS NULL OR method IN ('qr_scan', 'coordinator_manual')),
    CONSTRAINT ck_attendance_checkin
        CHECK (status NOT IN ('checked_in', 'completed')
               OR (checkin_at IS NOT NULL AND method IS NOT NULL)),
    CONSTRAINT ck_attendance_no_evidence_without_checkin
        CHECK (status IN ('checked_in', 'completed')
               OR (checkin_at IS NULL AND checkout_at IS NULL AND method IS NULL)),
    CONSTRAINT ck_attendance_checkout
        CHECK (checkout_at IS NULL OR (checkin_at IS NOT NULL AND checkout_at >= checkin_at)),
    CONSTRAINT ck_attendance_method_qr
        CHECK (method IS DISTINCT FROM 'qr_scan' OR qr_token_id IS NOT NULL),
    CONSTRAINT ck_attendance_method_manual
        CHECK (method IS DISTINCT FROM 'coordinator_manual' OR recorded_by_user_id IS NOT NULL),

    -- Geo evidence exists exactly when the method is 'geo'
    -- (coordinates may later be nulled by purge_geo_evidence(); distance stays)
    CONSTRAINT ck_attendance_geo_columns
        CHECK (
            (method = 'geo' AND geo_verified
                AND checkin_accuracy_m IS NOT NULL AND checkin_distance_m IS NOT NULL)
         OR (method IS DISTINCT FROM 'geo' AND NOT geo_verified
                AND checkin_latitude IS NULL AND checkin_longitude IS NULL
                AND checkin_accuracy_m IS NULL AND checkin_distance_m IS NULL)
        ),
    CONSTRAINT ck_attendance_geo_pair
        CHECK ((checkin_latitude IS NULL) = (checkin_longitude IS NULL)),
    CONSTRAINT ck_attendance_lat_range
        CHECK (checkin_latitude IS NULL OR checkin_latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_attendance_lng_range
        CHECK (checkin_longitude IS NULL OR checkin_longitude BETWEEN -180 AND 180),

    -- Confirmation
    CONSTRAINT ck_attendance_confirmation_status
        CHECK (confirmation_status IN ('not_required', 'pending', 'confirmed', 'rejected')),
    CONSTRAINT ck_attendance_confirmation_state
        CHECK (
            confirmation_status = 'not_required'
         OR (confirmation_status IN ('pending', 'confirmed')
                AND method = 'geo' AND status IN ('checked_in', 'completed'))
         OR (confirmation_status = 'rejected'
                AND status IN ('expected', 'absent', 'cancelled'))
        ),
    CONSTRAINT ck_attendance_decision
        CHECK ((confirmation_status IN ('confirmed', 'rejected'))
               = (confirmed_by_user_id IS NOT NULL AND confirmed_at IS NOT NULL)),
    CONSTRAINT ck_attendance_no_self_confirm
        CHECK (confirmed_by_user_id IS NULL OR confirmed_by_user_id <> user_id)
);

CREATE INDEX idx_attendance_event_status ON attendance (event_id, status);
CREATE INDEX idx_attendance_user         ON attendance (user_id);
CREATE INDEX idx_attendance_pending_confirmation
    ON attendance (event_id) WHERE confirmation_status = 'pending';

-- Every geo check-in attempt, accepted or not (anti-fraud evidence)
CREATE TABLE attendance_geo_attempts (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id      BIGINT NOT NULL REFERENCES events (id)     ON DELETE RESTRICT,
    user_id       BIGINT NOT NULL REFERENCES users (id)      ON DELETE RESTRICT,
    attendance_id BIGINT REFERENCES attendance (id)          ON DELETE RESTRICT,

    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    latitude      NUMERIC(9,6),
    longitude     NUMERIC(9,6),
    accuracy_m    NUMERIC(7,1),
    captured_at   TIMESTAMPTZ,
    device_mocked BOOLEAN NOT NULL DEFAULT FALSE,
    distance_m    NUMERIC(10,1),
    radius_m      INTEGER,

    result TEXT NOT NULL,

    review_status       TEXT NOT NULL DEFAULT 'none',
    reviewed_by_user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,
    reviewed_at         TIMESTAMPTZ,
    review_note         TEXT,

    CONSTRAINT ck_geo_attempt_result
        CHECK (result IN ('accepted', 'already_checked_in', 'invalid_fix', 'low_accuracy',
                          'stale_fix', 'mock_location', 'outside_geofence', 'window_closed',
                          'event_not_active', 'geo_disabled', 'not_assigned', 'not_eligible',
                          'onboarding_required')),
    CONSTRAINT ck_geo_attempt_review_status
        CHECK (review_status IN ('none', 'pending', 'confirmed', 'rejected')),
    CONSTRAINT ck_geo_attempt_lat
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_geo_attempt_lng
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_geo_attempts_event_user ON attendance_geo_attempts (event_id, user_id, attempted_at DESC);
CREATE INDEX idx_geo_attempts_attendance ON attendance_geo_attempts (attendance_id) WHERE attendance_id IS NOT NULL;

-- =============================================================================
-- 12. ONBOARDING ACKNOWLEDGMENTS (append-only)
-- =============================================================================

CREATE TABLE onboarding_acknowledgments (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id  BIGINT NOT NULL REFERENCES users (id)  ON DELETE RESTRICT,
    event_id BIGINT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,

    onboarding_version INTEGER NOT NULL,
    method             TEXT NOT NULL DEFAULT 'app_tick',
    acknowledged_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_onboarding_ack_user_event_ver UNIQUE (user_id, event_id, onboarding_version),
    CONSTRAINT ck_onboarding_ack_method  CHECK (method IN ('app_tick')),
    CONSTRAINT ck_onboarding_ack_version CHECK (onboarding_version >= 1)
);

CREATE INDEX idx_onboarding_ack_event ON onboarding_acknowledgments (event_id);

-- =============================================================================
-- 13. FEEDBACK / RATINGS
-- =============================================================================

CREATE TABLE feedback (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id       BIGINT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
    rater_user_id  BIGINT NOT NULL REFERENCES users (id)  ON DELETE RESTRICT,
    target_user_id BIGINT REFERENCES users (id)           ON DELETE RESTRICT,

    direction TEXT NOT NULL,
    score     INTEGER NOT NULL,
    tags      TEXT[] NOT NULL DEFAULT '{}',
    comment   TEXT,

    status TEXT NOT NULL DEFAULT 'active',          -- hidden only by an admin moderation action

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_feedback_direction
        CHECK (direction IN ('coordinator_to_volunteer', 'volunteer_to_event', 'volunteer_to_coordinator')),
    CONSTRAINT ck_feedback_score
        CHECK (score BETWEEN 1 AND 5),
    CONSTRAINT ck_feedback_status
        CHECK (status IN ('active', 'hidden')),
    CONSTRAINT ck_feedback_tags
        CHECK (tags_are_normalized(tags)),
    CONSTRAINT ck_feedback_target
        CHECK ((direction = 'volunteer_to_event' AND target_user_id IS NULL)
            OR (direction <> 'volunteer_to_event' AND target_user_id IS NOT NULL)),
    CONSTRAINT ck_feedback_not_self
        CHECK (target_user_id IS NULL OR target_user_id <> rater_user_id)
);

CREATE INDEX idx_feedback_event    ON feedback (event_id);
CREATE INDEX idx_feedback_rater    ON feedback (rater_user_id);
CREATE INDEX idx_feedback_target   ON feedback (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX idx_feedback_tags_gin ON feedback USING GIN (tags);

-- One feedback per rater, per event, per direction (and per target when there is one)
CREATE UNIQUE INDEX uq_feedback_event_once
    ON feedback (event_id, rater_user_id, direction) WHERE target_user_id IS NULL;
CREATE UNIQUE INDEX uq_feedback_user_once
    ON feedback (event_id, rater_user_id, direction, target_user_id) WHERE target_user_id IS NOT NULL;

-- =============================================================================
-- 14. ADMIN MODERATION ACTIONS
-- Inserting a row here APPLIES the action (trigger) and is the only supported
-- way to block users, delete events, or hide feedback.
-- =============================================================================

CREATE TABLE moderation_actions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

    target_user_id BIGINT REFERENCES users (id)    ON DELETE RESTRICT,
    event_id       BIGINT REFERENCES events (id)   ON DELETE RESTRICT,
    feedback_id    BIGINT REFERENCES feedback (id) ON DELETE RESTRICT,

    action_type TEXT NOT NULL,
    reason      TEXT,
    expires_at  TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_moderation_action_type
        CHECK (action_type IN ('user_warning', 'user_block', 'user_unblock',
                               'account_close', 'account_reinstate',
                               'event_delete', 'event_restore', 'event_cancel',
                               'feedback_hide')),
    CONSTRAINT ck_moderation_subject
        CHECK (
            (action_type IN ('user_warning', 'user_block', 'user_unblock',
                             'account_close', 'account_reinstate')
                AND target_user_id IS NOT NULL AND event_id IS NULL AND feedback_id IS NULL)
         OR (action_type IN ('event_delete', 'event_restore', 'event_cancel')
                AND event_id IS NOT NULL AND target_user_id IS NULL AND feedback_id IS NULL)
         OR (action_type = 'feedback_hide'
                AND feedback_id IS NOT NULL AND target_user_id IS NULL AND event_id IS NULL)
        ),
    CONSTRAINT ck_moderation_expiry
        CHECK (expires_at IS NULL OR action_type = 'user_block'),
    CONSTRAINT ck_moderation_no_self
        CHECK (target_user_id IS NULL OR target_user_id <> admin_user_id),
    CONSTRAINT ck_moderation_reason
        CHECK (action_type NOT IN ('user_block', 'account_close', 'event_delete', 'event_cancel', 'feedback_hide')
               OR char_length(btrim(COALESCE(reason, ''))) > 0)
);

CREATE INDEX idx_moderation_admin  ON moderation_actions (admin_user_id);
CREATE INDEX idx_moderation_target ON moderation_actions (target_user_id, action_type) WHERE target_user_id IS NOT NULL;
CREATE INDEX idx_moderation_event  ON moderation_actions (event_id) WHERE event_id IS NOT NULL;

-- =============================================================================
-- 15. AUDIT LOGS (append-only; filled automatically by triggers, plus app calls)
-- =============================================================================

CREATE TABLE audit_logs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users (id) ON DELETE RESTRICT,

    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   BIGINT,

    before_data JSONB,
    after_data  JSONB,
    ip_address  INET,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity  ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_actor   ON audit_logs (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_created ON audit_logs (created_at);

-- =============================================================================
-- 16. HELPER FUNCTIONS THAT READ TABLES
-- =============================================================================

CREATE FUNCTION is_admin_user(p_user BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT u.is_admin AND u.is_active FROM users u WHERE u.id = p_user), FALSE)
$$;

CREATE FUNCTION is_approved_coordinator(p_user BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
          FROM coordinator_profiles cp
          JOIN users u ON u.id = cp.user_id
         WHERE cp.user_id = p_user AND cp.status = 'approved' AND u.is_active)
$$;

-- Manager = admin, or the owner / current coordinator while still an approved coordinator
CREATE FUNCTION is_event_manager(p_event BIGINT, p_user BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT is_admin_user(p_user)
        OR EXISTS (
            SELECT 1 FROM events ev
             WHERE ev.id = p_event
               AND p_user IN (ev.owner_id, ev.current_coordinator_id)
               AND is_approved_coordinator(p_user))
$$;

CREATE FUNCTION user_has_schedule_conflict(
    p_user BIGINT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_except_event BIGINT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql VOLATILE AS $$
    SELECT EXISTS (
        SELECT 1 FROM assignments a
         WHERE a.user_id = p_user
           AND a.status <> 'cancelled'
           AND a.event_id <> COALESCE(p_except_event, -1)
           AND tstzrange(a.schedule_start, a.schedule_end, '[)') && tstzrange(p_start, p_end, '[)'))
$$;

-- Check volunteer availability against date exceptions and weekly recurring rules
CREATE FUNCTION is_user_available(p_user BIGINT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_date    DATE    := p_start::DATE;
    v_weekday INTEGER := EXTRACT(ISODOW FROM p_start)::INTEGER;
    v_st      TIME    := p_start::TIME;
    v_et      TIME    := p_end::TIME;
    v_exc     volunteer_availability_exceptions%ROWTYPE;
BEGIN
    SELECT * INTO v_exc
      FROM volunteer_availability_exceptions
     WHERE user_id = p_user AND date = v_date;

    IF FOUND THEN
        IF NOT v_exc.is_available THEN
            IF v_exc.start_time IS NULL THEN
                RETURN FALSE;
            END IF;
            RETURN NOT (v_st < v_exc.end_time AND v_et > v_exc.start_time);
        ELSE
            IF v_exc.start_time IS NULL THEN
                RETURN TRUE;
            END IF;
            RETURN (v_st >= v_exc.start_time AND v_et <= v_exc.end_time);
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM volunteer_availability_rules WHERE user_id = p_user) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM volunteer_availability_rules r
         WHERE r.user_id = p_user
           AND r.weekday = v_weekday
           AND (r.valid_from IS NULL OR r.valid_from <= v_date)
           AND (r.valid_to IS NULL OR r.valid_to >= v_date)
           AND v_st >= r.start_time
           AND v_et <= r.end_time
    );
END;
$$;

-- Acting-user guard for the workflow functions below
CREATE FUNCTION assert_actor(p_actor BIGINT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'permission_denied: an acting user is required' USING ERRCODE = '42501';
    END IF;
    IF app_user_id() IS NOT NULL AND app_user_id() <> p_actor THEN
        RAISE EXCEPTION 'permission_denied: actor does not match the session user' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('app.user_id', p_actor::TEXT, true);
END;
$$;

-- Remaining places for an application: NULL = unlimited.
-- Counts the post (headcount minus assignments minus accepted-but-unassigned applications)
-- and the event ceiling (max_participants minus accepted applications); the lower one wins.
CREATE FUNCTION application_remaining_capacity(p_event BIGINT, p_post BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_max       INTEGER;
    v_event_rem INTEGER;
    v_post_rem  INTEGER;
BEGIN
    SELECT ev.max_participants INTO v_max FROM events ev WHERE ev.id = p_event;

    IF v_max IS NOT NULL THEN
        SELECT v_max - COUNT(*) INTO v_event_rem
          FROM event_applications ap
         WHERE ap.event_id = p_event AND ap.status = 'accepted';
    END IF;

    IF p_post IS NOT NULL THEN
        SELECT ep.required_headcount
               - (SELECT COUNT(*) FROM assignments asg
                   WHERE asg.post_id = ep.id AND asg.status <> 'cancelled')
               - (SELECT COUNT(*) FROM event_applications ap2
                   WHERE ap2.post_id = ep.id AND ap2.status = 'accepted'
                     AND NOT EXISTS (SELECT 1 FROM assignments a3
                                      WHERE a3.application_id = ap2.id AND a3.status <> 'cancelled'))
          INTO v_post_rem
          FROM event_posts ep
         WHERE ep.id = p_post;
    END IF;

    IF v_event_rem IS NULL AND v_post_rem IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN GREATEST(LEAST(COALESCE(v_event_rem, v_post_rem), COALESCE(v_post_rem, v_event_rem)), 0);
END;
$$;

-- Atomically spends one use of a QR token or raises qr_token_invalid.
-- Called by triggers, so a use is spent only when the guarded action really happens.
CREATE FUNCTION consume_qr_token(p_token BIGINT, p_purpose TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE qr_tokens
       SET used_count = used_count + 1
     WHERE id = p_token
       AND purpose = p_purpose
       AND revoked_at IS NULL
       AND expires_at > now()
       AND (max_uses IS NULL OR used_count < max_uses);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'qr_token_invalid: token is unknown, for another purpose, revoked, expired or used up';
    END IF;
END;
$$;

-- Read-only preview of a token (nothing is consumed)
CREATE FUNCTION qr_token_status(p_token_hash TEXT)
RETURNS TABLE (token_id BIGINT, token_event_id BIGINT, token_purpose TEXT, is_valid BOOLEAN, reason TEXT)
LANGUAGE sql STABLE AS $$
    SELECT t.id,
           t.event_id,
           t.purpose,
           (e.deleted_at IS NULL
            AND e.status IN ('published', 'active')
            AND t.revoked_at IS NULL
            AND t.expires_at > now()
            AND (t.max_uses IS NULL OR t.used_count < t.max_uses)),
           CASE WHEN e.deleted_at IS NOT NULL THEN 'event_deleted'
                WHEN e.status NOT IN ('published', 'active') THEN 'event_not_open'
                WHEN t.revoked_at IS NOT NULL THEN 'revoked'
                WHEN t.expires_at <= now() THEN 'expired'
                WHEN t.max_uses IS NOT NULL AND t.used_count >= t.max_uses THEN 'max_uses_reached'
                ELSE 'ok' END
      FROM qr_tokens t
      JOIN events e ON e.id = t.event_id
     WHERE t.token_hash = p_token_hash
$$;

-- verification_status of a user, derived from the CURRENT images
--   none     : no current image
--   rejected : any current image rejected
--   verified : an approved selfie AND an approved ID or driver licence
--   pending  : anything else
CREATE FUNCTION recompute_user_verification(p_user BIGINT)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM user_verification_images i
                          WHERE i.user_id = p_user AND i.is_current) THEN 'none'
        WHEN EXISTS (SELECT 1 FROM user_verification_images i
                      WHERE i.user_id = p_user AND i.is_current AND i.status = 'rejected') THEN 'rejected'
        WHEN EXISTS (SELECT 1 FROM user_verification_images i
                      WHERE i.user_id = p_user AND i.is_current AND i.status = 'approved'
                        AND i.image_type = 'mock_selfie')
         AND EXISTS (SELECT 1 FROM user_verification_images i
                      WHERE i.user_id = p_user AND i.is_current AND i.status = 'approved'
                        AND i.image_type IN ('id_license', 'driver_license')) THEN 'verified'
        ELSE 'pending'
    END INTO v_status;

    UPDATE users SET verification_status = v_status
     WHERE id = p_user AND verification_status IS DISTINCT FROM v_status;
END;
$$;

-- =============================================================================
-- 17. WORKFLOW FUNCTIONS
-- =============================================================================

-- ---- OTP --------------------------------------------------------------------

CREATE FUNCTION request_otp(p_phone_hash TEXT, p_code_hash TEXT, p_purpose TEXT DEFAULT 'login')
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO auth_otp (phone_hash, code_hash, purpose, expires_at)
    VALUES (p_phone_hash, p_code_hash, p_purpose,
            now() + make_interval(mins => setting_int('otp_ttl_minutes')))
    RETURNING id INTO v_id;                      -- rate limit is enforced by trigger
    RETURN v_id;
END;
$$;

-- Returns a result code (never raises for a wrong code, so the attempt counter persists):
-- 'ok' | 'invalid_code' | 'expired' | 'too_many_attempts' | 'no_otp'
CREATE FUNCTION verify_otp(p_phone_hash TEXT, p_code_hash TEXT, p_purpose TEXT DEFAULT 'login')
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    v auth_otp%ROWTYPE;
BEGIN
    SELECT * INTO v
      FROM auth_otp
     WHERE phone_hash = p_phone_hash AND purpose = p_purpose AND consumed_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'no_otp';
    END IF;
    IF v.expires_at <= now() THEN
        RETURN 'expired';
    END IF;
    IF v.attempt_count >= setting_int('otp_max_attempts') THEN
        RETURN 'too_many_attempts';
    END IF;

    IF v.code_hash = p_code_hash THEN
        UPDATE auth_otp SET consumed_at = now() WHERE id = v.id;
        RETURN 'ok';
    END IF;

    UPDATE auth_otp SET attempt_count = attempt_count + 1 WHERE id = v.id;
    RETURN 'invalid_code';
END;
$$;

-- ---- Assignment -------------------------------------------------------------

-- The ONLY automatic path that creates assignments. Returns the new (or existing)
-- assignment id, or NULL when no open post fits the volunteer or there is a clash.
CREATE FUNCTION create_assignment_from_application(p_application BIGINT, p_actor BIGINT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_app      event_applications%ROWTYPE;
    v_ev       events%ROWTYPE;
    v_usr      users%ROWTYPE;
    v_existing BIGINT;
    v_post     BIGINT;
    v_n        INTEGER;
    v_group_no INTEGER;
    v_group    TEXT;
    v_leader   BOOLEAN := FALSE;
    v_new      BIGINT;
BEGIN
    SELECT * INTO v_app FROM event_applications WHERE id = p_application;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'application_not_found: application % does not exist', p_application;
    END IF;
    IF v_app.status <> 'accepted' THEN
        RAISE EXCEPTION 'invalid_state: only accepted applications can be assigned';
    END IF;

    SELECT a.id INTO v_existing
      FROM assignments a
     WHERE a.application_id = v_app.id AND a.status <> 'cancelled';
    IF FOUND THEN
        RETURN v_existing;
    END IF;

    SELECT * INTO v_ev  FROM events WHERE id = v_app.event_id FOR UPDATE;   -- lock order: event, post
    SELECT * INTO v_usr FROM users  WHERE id = v_app.user_id;

    IF user_has_schedule_conflict(v_app.user_id, v_ev.start_at, v_ev.end_at, v_app.event_id) THEN
        RETURN NULL;
    END IF;

    SELECT ep.id INTO v_post
      FROM event_posts ep
     WHERE ep.event_id = v_app.event_id
       AND ep.status = 'open'
       AND (v_app.post_id IS NULL OR ep.id = v_app.post_id)
       AND (cardinality(ep.required_skills) = 0 OR ep.required_skills && v_usr.skills)
       AND (ep.physical_level IN ('none', 'light')
            OR (ep.physical_level = 'medium' AND v_usr.physical_ok)
            OR (ep.physical_level = 'heavy'  AND v_usr.can_lift_heavy))
       AND (ep.new_volunteers_allowed OR NOT v_usr.new_to_volunteer)
       AND (SELECT COUNT(*) FROM assignments x
             WHERE x.post_id = ep.id AND x.status <> 'cancelled') < ep.required_headcount
     ORDER BY ep.priority ASC, ep.id ASC
     LIMIT 1
       FOR UPDATE OF ep;

    IF v_post IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_ev.group_size IS NOT NULL THEN
        SELECT COUNT(*) INTO v_n
          FROM assignments a WHERE a.event_id = v_app.event_id AND a.status <> 'cancelled';

        SELECT g INTO v_group_no
          FROM generate_series(1, v_n + 1) AS g
         WHERE (SELECT COUNT(*) FROM assignments a2
                 WHERE a2.event_id = v_app.event_id
                   AND a2.group_code = 'G' || g
                   AND a2.status <> 'cancelled') < v_ev.group_size
         ORDER BY g
         LIMIT 1;
        v_group := 'G' || v_group_no;

        IF v_usr.has_leader_experience
           AND (v_ev.leader_strategy = 'first_experienced'
                OR (SELECT ep2.leader_needed FROM event_posts ep2 WHERE ep2.id = v_post))
           AND NOT EXISTS (SELECT 1 FROM assignments a3
                            WHERE a3.event_id = v_app.event_id AND a3.group_code = v_group
                              AND a3.is_group_leader AND a3.status <> 'cancelled') THEN
            v_leader := TRUE;
        END IF;
    END IF;

    INSERT INTO assignments (event_id, application_id, user_id, post_id,
                             group_code, is_group_leader,
                             assigned_by, assigned_by_user_id, conditions_snapshot)
    VALUES (v_app.event_id, v_app.id, v_app.user_id, v_post,
            v_group, v_leader,
            CASE WHEN p_actor IS NULL THEN 'auto' ELSE 'coordinator' END, p_actor,
            v_app.conditions_snapshot)
    RETURNING id INTO v_new;

    RETURN v_new;
END;
$$;

-- Assign every accepted-but-unassigned application of an event
CREATE FUNCTION run_auto_assignment(p_event BIGINT, p_actor BIGINT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_app BIGINT;
    v_n   INTEGER := 0;
BEGIN
    IF p_actor IS NOT NULL THEN
        PERFORM assert_actor(p_actor);
        IF NOT is_event_manager(p_event, p_actor) THEN
            RAISE EXCEPTION 'permission_denied: only event managers can run auto-assignment' USING ERRCODE = '42501';
        END IF;
    END IF;

    FOR v_app IN
        SELECT ap.id
          FROM event_applications ap
         WHERE ap.event_id = p_event AND ap.status = 'accepted'
           AND NOT EXISTS (SELECT 1 FROM assignments a
                            WHERE a.application_id = ap.id AND a.status <> 'cancelled')
         ORDER BY ap.decided_at, ap.id
    LOOP
        IF create_assignment_from_application(v_app, NULL) IS NOT NULL THEN
            v_n := v_n + 1;
        END IF;
    END LOOP;
    RETURN v_n;
END;
$$;

-- Coordinator places (or moves) an accepted volunteer. Capacity is enforced by trigger.
CREATE FUNCTION assign_manually(
    p_application BIGINT, p_post BIGINT, p_actor BIGINT,
    p_group_code TEXT DEFAULT NULL, p_leader BOOLEAN DEFAULT FALSE)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_app      event_applications%ROWTYPE;
    v_existing BIGINT;
    v_by       TEXT;
    v_new      BIGINT;
BEGIN
    PERFORM assert_actor(p_actor);

    SELECT * INTO v_app FROM event_applications WHERE id = p_application;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'application_not_found: application % does not exist', p_application;
    END IF;
    IF NOT is_event_manager(v_app.event_id, p_actor) THEN
        RAISE EXCEPTION 'permission_denied: only event managers can assign volunteers' USING ERRCODE = '42501';
    END IF;
    IF v_app.status <> 'accepted' THEN
        RAISE EXCEPTION 'invalid_state: only accepted applications can be assigned';
    END IF;

    SELECT a.id INTO v_existing
      FROM assignments a
     WHERE a.application_id = p_application AND a.status <> 'cancelled';

    IF FOUND THEN
        UPDATE assignments
           SET post_id = p_post, group_code = p_group_code, is_group_leader = p_leader
         WHERE id = v_existing;
        RETURN v_existing;
    END IF;

    v_by := CASE
              WHEN is_admin_user(p_actor)
               AND NOT EXISTS (SELECT 1 FROM events ev
                                WHERE ev.id = v_app.event_id
                                  AND p_actor IN (ev.owner_id, ev.current_coordinator_id))
              THEN 'admin' ELSE 'coordinator' END;

    INSERT INTO assignments (event_id, application_id, user_id, post_id,
                             group_code, is_group_leader, assigned_by, assigned_by_user_id,
                             conditions_snapshot)
    VALUES (v_app.event_id, p_application, v_app.user_id, p_post,
            p_group_code, p_leader, v_by, p_actor, v_app.conditions_snapshot)
    RETURNING id INTO v_new;
    RETURN v_new;
END;
$$;

-- ---- Coordinator handover ---------------------------------------------------

-- The owner never changes. The current coordinator can be handed over by the owner,
-- the current coordinator, or an admin. Each handover is written to
-- event_coordinator_history by trigger.
CREATE FUNCTION change_event_coordinator(
    p_event BIGINT, p_new_coordinator BIGINT, p_actor BIGINT, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_ev events%ROWTYPE;
BEGIN
    PERFORM assert_actor(p_actor);

    SELECT * INTO v_ev FROM events WHERE id = p_event AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'event_not_found: event % does not exist', p_event;
    END IF;
    IF NOT (p_actor IN (v_ev.owner_id, v_ev.current_coordinator_id) OR is_admin_user(p_actor)) THEN
        RAISE EXCEPTION 'permission_denied: only the owner, the current coordinator or an admin can hand over an event'
              USING ERRCODE = '42501';
    END IF;
    IF v_ev.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'event_frozen: the coordinator of a finished event cannot change';
    END IF;
    IF v_ev.current_coordinator_id = p_new_coordinator THEN
        RETURN;
    END IF;

    PERFORM set_config('app.reason', COALESCE(p_reason, ''), true);
    UPDATE events SET current_coordinator_id = p_new_coordinator WHERE id = p_event;
END;
$$;

-- ---- Check-in ---------------------------------------------------------------

-- Volunteer check-in by scanning the coordinator's check-in QR.
-- Idempotent: a repeat scan returns the same attendance and spends no QR use
-- (the use is spent by the attendance trigger only when the status really changes).
CREATE FUNCTION qr_check_in(p_token_hash TEXT, p_user BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_t   qr_tokens%ROWTYPE;
    v_att attendance%ROWTYPE;
BEGIN
    SELECT * INTO v_t FROM qr_tokens WHERE token_hash = p_token_hash;
    IF NOT FOUND OR v_t.purpose <> 'checkin' THEN
        RAISE EXCEPTION 'qr_token_invalid: unknown check-in token';
    END IF;

    SELECT * INTO v_att FROM attendance
     WHERE event_id = v_t.event_id AND user_id = p_user FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_assigned: you have no shift in this event';
    END IF;
    IF v_att.status IN ('checked_in', 'completed') THEN
        RETURN v_att.id;
    END IF;

    UPDATE attendance
       SET status = 'checked_in', method = 'qr_scan', qr_token_id = v_t.id, checkin_at = now()
     WHERE id = v_att.id;
    RETURN v_att.id;
END;
$$;

-- Walk-in volunteer applies by scanning the walk-in QR (application stays pending
-- until a coordinator accepts it).
CREATE FUNCTION qr_walkin_apply(p_token_hash TEXT, p_user BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_t  qr_tokens%ROWTYPE;
    v_id BIGINT;
BEGIN
    SELECT * INTO v_t FROM qr_tokens WHERE token_hash = p_token_hash;
    IF NOT FOUND OR v_t.purpose <> 'walkin_registration' THEN
        RAISE EXCEPTION 'qr_token_invalid: unknown walk-in token';
    END IF;

    INSERT INTO event_applications (event_id, user_id, source, qr_token_id)
    VALUES (v_t.event_id, p_user, 'qr_walkin', v_t.id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Geo check-in for pre-scheduled volunteers.
-- The server measures the distance itself. Business failures are RETURNED as a result
-- code (and logged in attendance_geo_attempts) rather than raised.
--   out_result: accepted | already_checked_in | invalid_fix | low_accuracy | stale_fix |
--               mock_location | outside_geofence | window_closed | event_not_active |
--               geo_disabled | not_assigned | not_eligible | onboarding_required
CREATE FUNCTION geo_check_in(
    p_event BIGINT, p_user BIGINT,
    p_lat DOUBLE PRECISION, p_lon DOUBLE PRECISION, p_accuracy_m DOUBLE PRECISION,
    p_captured_at TIMESTAMPTZ DEFAULT NULL, p_is_mocked BOOLEAN DEFAULT FALSE)
RETURNS TABLE (out_result TEXT, out_attendance_id BIGINT, out_distance_m NUMERIC, out_confirmation TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_ev        events%ROWTYPE;
    v_asg       assignments%ROWTYPE;
    v_att       attendance%ROWTYPE;
    v_event_ok  BOOLEAN;
    v_att_ok    BOOLEAN := FALSE;
    v_source    TEXT;
    v_result    TEXT := NULL;
    v_valid     BOOLEAN;
    v_lat       NUMERIC(9,6);
    v_lon       NUMERIC(9,6);
    v_acc       NUMERIC(7,1);
    v_dist      DOUBLE PRECISION;
    v_dist_n    NUMERIC(10,1);
    v_radius    INTEGER;
    v_conf      TEXT := 'not_required';
BEGIN
    IF app_user_id() IS NOT NULL AND app_user_id() <> p_user THEN
        RAISE EXCEPTION 'permission_denied: volunteers check themselves in' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_ev FROM events WHERE id = p_event AND deleted_at IS NULL;
    v_event_ok := FOUND;

    v_valid := COALESCE(p_lat IS NOT NULL AND p_lon IS NOT NULL
                        AND p_lat BETWEEN -90 AND 90 AND p_lon BETWEEN -180 AND 180, FALSE);
    IF v_valid THEN
        v_lat := round(p_lat::NUMERIC, 6);
        v_lon := round(p_lon::NUMERIC, 6);
    END IF;
    IF p_accuracy_m IS NOT NULL AND p_accuracy_m >= 0 AND p_accuracy_m < 100000 THEN
        v_acc := round(p_accuracy_m::NUMERIC, 1);
    END IF;

    IF NOT v_event_ok THEN
        RAISE EXCEPTION 'event_not_found: event % does not exist', p_event;
    END IF;

    IF v_ev.status <> 'active' THEN
        v_result := 'event_not_active';
    ELSIF NOT v_ev.geo_checkin_enabled OR v_ev.latitude IS NULL THEN
        v_result := 'geo_disabled';
    END IF;

    IF v_result IS NULL THEN
        SELECT * INTO v_asg FROM assignments
         WHERE event_id = p_event AND user_id = p_user AND status IN ('assigned', 'confirmed');
        IF NOT FOUND THEN
            v_result := 'not_assigned';
        ELSE
            SELECT ap.source INTO v_source FROM event_applications ap WHERE ap.id = v_asg.application_id;
            IF v_source = 'qr_walkin' THEN
                v_result := 'not_eligible';
            END IF;
        END IF;
    END IF;

    IF v_result IS NULL THEN
        SELECT * INTO v_att FROM attendance
         WHERE event_id = p_event AND user_id = p_user FOR UPDATE;
        v_att_ok := FOUND;
        IF NOT v_att_ok THEN
            v_result := 'not_assigned';
        ELSIF v_att.walk_in_flag THEN
            v_result := 'not_eligible';
        ELSIF v_att.status IN ('checked_in', 'completed') THEN
            v_result := 'already_checked_in';
        END IF;
    END IF;

    IF v_result IS NULL THEN
        IF now() < v_ev.start_at - make_interval(mins => v_ev.geo_checkin_opens_before_min)
           OR now() > v_ev.end_at THEN
            v_result := 'window_closed';
        ELSIF v_ev.require_onboarding_ack
              AND NOT EXISTS (SELECT 1 FROM onboarding_acknowledgments o
                               WHERE o.user_id = p_user AND o.event_id = p_event
                                 AND o.onboarding_version = v_ev.onboarding_version) THEN
            v_result := 'onboarding_required';
        ELSIF NOT v_valid THEN
            v_result := 'invalid_fix';
        ELSIF COALESCE(p_is_mocked, FALSE) THEN
            v_result := 'mock_location';
        ELSIF v_acc IS NULL OR v_acc > setting_int('geo_max_accuracy_m') THEN
            v_result := 'low_accuracy';
        ELSIF p_captured_at IS NOT NULL
              AND (now() - p_captured_at > make_interval(secs => setting_int('geo_max_fix_age_sec'))
                   OR p_captured_at > now() + INTERVAL '60 seconds') THEN
            v_result := 'stale_fix';
        ELSE
            v_dist   := geo_distance_m(v_ev.latitude::DOUBLE PRECISION, v_ev.longitude::DOUBLE PRECISION,
                                       v_lat::DOUBLE PRECISION, v_lon::DOUBLE PRECISION);
            v_dist_n := round(v_dist::NUMERIC, 1);
            v_radius := COALESCE(v_ev.geo_radius_m, setting_int('geo_default_radius_m'));
            IF v_dist > v_radius THEN
                v_result := 'outside_geofence';
            ELSE
                v_result := 'accepted';
            END IF;
        END IF;
    END IF;

    INSERT INTO attendance_geo_attempts
        (event_id, user_id, attendance_id, latitude, longitude, accuracy_m, captured_at,
         device_mocked, distance_m, radius_m, result, review_status)
    VALUES
        (p_event, p_user, CASE WHEN v_att_ok THEN v_att.id END, v_lat, v_lon, v_acc, p_captured_at,
         COALESCE(p_is_mocked, FALSE), v_dist_n, v_radius, v_result,
         CASE WHEN v_result = 'accepted' AND v_ev.require_checkin_confirmation THEN 'pending' ELSE 'none' END);

    IF v_result = 'accepted' THEN
        v_conf := CASE WHEN v_ev.require_checkin_confirmation THEN 'pending' ELSE 'not_required' END;
        UPDATE attendance
           SET status = 'checked_in', method = 'geo', checkin_at = now(),
               checkin_latitude = v_lat, checkin_longitude = v_lon,
               checkin_accuracy_m = v_acc, checkin_distance_m = v_dist_n,
               geo_verified = TRUE, confirmation_status = v_conf
         WHERE id = v_att.id;
    ELSIF v_result = 'already_checked_in' THEN
        v_conf := v_att.confirmation_status;
    END IF;

    RETURN QUERY SELECT v_result, CASE WHEN v_att_ok THEN v_att.id END, v_dist_n, v_conf;
END;
$$;

-- Coordinator confirms a pending geo check-in
CREATE FUNCTION confirm_attendance(p_attendance BIGINT, p_actor BIGINT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_att attendance%ROWTYPE;
BEGIN
    PERFORM assert_actor(p_actor);

    SELECT * INTO v_att FROM attendance WHERE id = p_attendance FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'attendance_not_found: attendance % does not exist', p_attendance;
    END IF;
    IF v_att.confirmation_status <> 'pending' THEN
        RAISE EXCEPTION 'invalid_state: this check-in is not waiting for confirmation';
    END IF;
    IF NOT is_event_manager(v_att.event_id, p_actor) THEN
        RAISE EXCEPTION 'permission_denied: only event managers can confirm check-ins' USING ERRCODE = '42501';
    END IF;

    UPDATE attendance
       SET confirmation_status = 'confirmed', confirmed_by_user_id = p_actor,
           confirmed_at = now(), confirmation_note = p_note
     WHERE id = p_attendance;

    UPDATE attendance_geo_attempts
       SET review_status = 'confirmed', reviewed_by_user_id = p_actor,
           reviewed_at = now(), review_note = p_note
     WHERE id = (SELECT max(g.id) FROM attendance_geo_attempts g
                  WHERE g.attendance_id = p_attendance AND g.result = 'accepted'
                    AND g.review_status = 'pending');
END;
$$;

-- Coordinator rejects a pending geo check-in. The attendance goes back to 'expected'
-- (the trigger clears the check-in evidence) and the volunteer may try again.
CREATE FUNCTION reject_attendance(p_attendance BIGINT, p_actor BIGINT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_att attendance%ROWTYPE;
BEGIN
    PERFORM assert_actor(p_actor);

    IF char_length(btrim(COALESCE(p_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'reason_required: a reason is required to reject a check-in';
    END IF;

    SELECT * INTO v_att FROM attendance WHERE id = p_attendance FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'attendance_not_found: attendance % does not exist', p_attendance;
    END IF;
    IF v_att.confirmation_status <> 'pending' THEN
        RAISE EXCEPTION 'invalid_state: this check-in is not waiting for confirmation';
    END IF;
    IF NOT is_event_manager(v_att.event_id, p_actor) THEN
        RAISE EXCEPTION 'permission_denied: only event managers can reject check-ins' USING ERRCODE = '42501';
    END IF;

    UPDATE attendance
       SET status = 'expected', confirmation_status = 'rejected',
           confirmed_by_user_id = p_actor, confirmed_at = now(), confirmation_note = p_reason
     WHERE id = p_attendance;

    UPDATE attendance_geo_attempts
       SET review_status = 'rejected', reviewed_by_user_id = p_actor,
           reviewed_at = now(), review_note = p_reason
     WHERE id = (SELECT max(g.id) FROM attendance_geo_attempts g
                  WHERE g.attendance_id = p_attendance AND g.result = 'accepted'
                    AND g.review_status = 'pending');
END;
$$;

-- ---- Maintenance (run from a scheduler) ------------------------------------

CREATE FUNCTION release_expired_blocks()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    PERFORM set_config('app.privileged_write', 'on', true);
    UPDATE users
       SET account_status = 'active', blocked_until = NULL
     WHERE account_status = 'blocked' AND blocked_until IS NOT NULL AND blocked_until <= now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.privileged_write', 'off', true);
    RETURN v_n;
END;
$$;

CREATE FUNCTION expire_stale_applications()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE event_applications
       SET status = 'expired'
     WHERE status IN ('pending', 'waitlisted')
       AND event_id IN (SELECT ev.id FROM events ev WHERE ev.end_at < now());
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE FUNCTION purge_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    DELETE FROM auth_otp
     WHERE expires_at < now() - INTERVAL '1 day'
        OR created_at < now() - INTERVAL '1 day';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Privacy: null the coordinates of old geo check-ins (distances and results stay)
CREATE FUNCTION purge_geo_evidence(p_older_than INTERVAL DEFAULT INTERVAL '90 days')
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE attendance_geo_attempts
       SET latitude = NULL, longitude = NULL
     WHERE attempted_at < now() - p_older_than
       AND (latitude IS NOT NULL OR longitude IS NOT NULL);
    GET DIAGNOSTICS v_n = ROW_COUNT;

    UPDATE attendance
       SET checkin_latitude = NULL, checkin_longitude = NULL
     WHERE checkin_at < now() - p_older_than
       AND (checkin_latitude IS NOT NULL OR checkin_longitude IS NOT NULL);
    RETURN v_n;
END;
$$;

-- =============================================================================
-- 18. TRIGGER FUNCTIONS
-- Triggers of one kind fire in alphabetical order, hence the numeric prefixes:
--   trg_01_* guards and state machines, trg_50_* cascades, trg_90_* updated_at, trg_95_* audit
-- =============================================================================

-- ---- Generic ----------------------------------------------------------------

CREATE FUNCTION trg_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'append_only: rows in % cannot be %d', TG_TABLE_NAME, lower(TG_OP)
        USING ERRCODE = '42501';
    RETURN NULL;
END;
$$;

-- Automatic audit trail. Secrets and noise columns are removed; only changed
-- columns are stored for updates. Extra columns to hide are passed as trigger arguments.
CREATE FUNCTION trg_audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_hide   TEXT[] := ARRAY['phone_enc', 'password', 'emergency_contact_phone_enc', 'token_hash', 'code_hash'];
    v_noise  TEXT[] := ARRAY['updated_at', 'last_login'];
    v_old    JSONB;
    v_new    JSONB;
    v_before JSONB;
    v_after  JSONB;
    v_id     BIGINT;
BEGIN
    IF TG_NARGS > 0 THEN
        v_hide := v_hide || TG_ARGV;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW) - v_hide;
        v_id  := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'user_id')::BIGINT;
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, ip_address)
        VALUES (app_user_id(), TG_TABLE_NAME || '.insert', TG_TABLE_NAME, v_id, NULL, v_new, app_ip());
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD) - v_hide - v_noise;
        v_new := to_jsonb(NEW) - v_hide - v_noise;
        IF v_old = v_new THEN
            RETURN NULL;
        END IF;
        SELECT jsonb_object_agg(n.key, o.value), jsonb_object_agg(n.key, n.value)
          INTO v_before, v_after
          FROM jsonb_each(v_new) AS n
          JOIN jsonb_each(v_old) AS o ON o.key = n.key
         WHERE n.value IS DISTINCT FROM o.value;
        v_id := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'user_id')::BIGINT;
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, ip_address)
        VALUES (app_user_id(), TG_TABLE_NAME || '.update', TG_TABLE_NAME, v_id, v_before, v_after, app_ip());
    END IF;
    RETURN NULL;
END;
$$;

-- ---- users ------------------------------------------------------------------

CREATE FUNCTION trg_users_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor BIGINT := app_user_id();
BEGIN
    NEW.is_active := (NEW.account_status = 'active');

    IF TG_OP = 'INSERT' THEN
        IF (NEW.is_admin OR NEW.is_staff OR NEW.is_superuser)
           AND v_actor IS NOT NULL AND NOT is_admin_user(v_actor) THEN
            RAISE EXCEPTION 'permission_denied: only an admin can create privileged accounts' USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NEW.phone_hash IS DISTINCT FROM OLD.phone_hash THEN
            RAISE EXCEPTION 'immutable: phone_hash cannot be changed';
        END IF;
        IF (NEW.is_admin, NEW.is_staff, NEW.is_superuser, NEW.account_status, NEW.blocked_until)
           IS DISTINCT FROM
           (OLD.is_admin, OLD.is_staff, OLD.is_superuser, OLD.account_status, OLD.blocked_until) THEN
            IF v_actor IS NOT NULL
               AND COALESCE(current_setting('app.privileged_write', true), '') <> 'on'
               AND NOT is_admin_user(v_actor) THEN
                RAISE EXCEPTION 'permission_denied: only an admin can change privilege or account-status fields'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ---- coordinator_profiles ---------------------------------------------------

CREATE FUNCTION trg_coordinator_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_was_approved BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'invalid_state: a new coordinator profile starts as pending';
        END IF;
    ELSE
        v_was_approved := (OLD.status = 'approved');
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
               (OLD.status = 'pending'   AND NEW.status IN ('approved', 'revoked'))
            OR (OLD.status = 'approved'  AND NEW.status IN ('suspended', 'revoked'))
            OR (OLD.status = 'suspended' AND NEW.status IN ('approved', 'revoked'))) THEN
            RAISE EXCEPTION 'invalid_transition: coordinator status % -> %', OLD.status, NEW.status;
        END IF;
    END IF;

    IF NEW.status = 'approved' AND NOT v_was_approved THEN
        IF NOT is_admin_user(NEW.approved_by_id) THEN
            RAISE EXCEPTION 'permission_denied: the approver must be an active admin' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM users u
                        WHERE u.id = NEW.user_id AND u.is_active AND u.verification_status = 'verified') THEN
            RAISE EXCEPTION 'not_verified: only active, verified users can become coordinators';
        END IF;
        NEW.approved_at := COALESCE(NEW.approved_at, now());
    END IF;
    RETURN NEW;
END;
$$;

-- ---- user_verification_images -----------------------------------------------

CREATE FUNCTION trg_vimg_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor BIGINT := app_user_id();
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status := 'pending';
        NEW.reviewed_by_id := NULL;
        NEW.reviewed_at := NULL;
        IF NEW.is_current THEN
            UPDATE user_verification_images
               SET is_current = FALSE
             WHERE user_id = NEW.user_id AND image_type = NEW.image_type AND is_current;
        END IF;
    ELSE
        IF (NEW.user_id, NEW.image_type, NEW.image_path, NEW.file_sha256)
           IS DISTINCT FROM (OLD.user_id, OLD.image_type, OLD.image_path, OLD.file_sha256) THEN
            RAISE EXCEPTION 'immutable: an uploaded image cannot be altered; upload a new one';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF OLD.status <> 'pending' THEN
                RAISE EXCEPTION 'invalid_transition: a reviewed image cannot be reviewed again';
            END IF;
            NEW.reviewed_by_id := COALESCE(NEW.reviewed_by_id, v_actor);
            NEW.reviewed_at    := COALESCE(NEW.reviewed_at, now());
            IF NOT is_admin_user(NEW.reviewed_by_id) THEN
                RAISE EXCEPTION 'permission_denied: only an admin can review verification images' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_vimg_after()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM recompute_user_verification(NEW.user_id);
    RETURN NULL;
END;
$$;

-- ---- auth_otp ---------------------------------------------------------------

CREATE FUNCTION trg_otp_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.attempt_count := 0;
    NEW.consumed_at := NULL;
    IF (SELECT COUNT(*) FROM auth_otp o
         WHERE o.phone_hash = NEW.phone_hash
           AND o.created_at > now() - INTERVAL '1 hour') >= setting_int('otp_max_requests_per_hour') THEN
        RAISE EXCEPTION 'otp_rate_limited: too many OTP requests, try again later';
    END IF;
    RETURN NEW;
END;
$$;

-- ---- events -----------------------------------------------------------------

CREATE FUNCTION trg_events_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor BIGINT := app_user_id();
BEGIN
    NEW.current_coordinator_id := COALESCE(NEW.current_coordinator_id, NEW.owner_id);

    IF NOT is_approved_coordinator(NEW.owner_id) THEN
        RAISE EXCEPTION 'coordinator_not_approved: the owner must be an approved coordinator';
    END IF;
    IF NOT is_approved_coordinator(NEW.current_coordinator_id) THEN
        RAISE EXCEPTION 'coordinator_not_approved: the coordinator must be an approved coordinator';
    END IF;
    IF v_actor IS NOT NULL AND v_actor <> NEW.owner_id AND NOT is_admin_user(v_actor) THEN
        RAISE EXCEPTION 'permission_denied: you can only create events that you own' USING ERRCODE = '42501';
    END IF;

    NEW.status := 'draft';
    NEW.published_at := NULL;
    NEW.activated_at := NULL;
    NEW.completed_at := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancel_reason := NULL;
    NEW.deleted_at := NULL;
    NEW.deleted_by_id := NULL;
    NEW.onboarding_version := 1;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_events_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor BIGINT := app_user_id();
BEGIN
    IF NEW.owner_id <> OLD.owner_id THEN
        RAISE EXCEPTION 'immutable: the owner of an event can never be changed';
    END IF;
    NEW.created_at := OLD.created_at;

    -- Finished events are frozen; only the soft-delete columns may change
    IF OLD.status IN ('completed', 'cancelled') THEN
        IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by_id' - 'updated_at')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'deleted_at' - 'deleted_by_id' - 'updated_at') THEN
            RAISE EXCEPTION 'event_frozen: a % event can no longer be changed', OLD.status;
        END IF;
        RETURN NEW;
    END IF;

    IF v_actor IS NOT NULL
       AND COALESCE(current_setting('app.privileged_write', true), '') <> 'on'
       AND NOT is_event_manager(OLD.id, v_actor) THEN
        RAISE EXCEPTION 'permission_denied: only the owner, the current coordinator or an admin can change this event'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT ((OLD.status = 'draft'     AND NEW.status IN ('published', 'cancelled'))
             OR (OLD.status = 'published' AND NEW.status IN ('active', 'cancelled'))
             OR (OLD.status = 'active'    AND NEW.status IN ('completed', 'cancelled'))) THEN
            RAISE EXCEPTION 'invalid_transition: event status % -> %', OLD.status, NEW.status;
        END IF;
        IF NEW.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'event_deleted: a deleted event cannot change status';
        END IF;

        IF NEW.status = 'published' THEN
            IF NOT EXISTS (SELECT 1 FROM event_posts p WHERE p.event_id = NEW.id AND p.status <> 'closed') THEN
                RAISE EXCEPTION 'publish_requires_post: add at least one open post before publishing';
            END IF;
            IF NEW.start_at <= now() THEN
                RAISE EXCEPTION 'publish_requires_future_start: the start time must be in the future';
            END IF;
            NEW.published_at := now();
        ELSIF NEW.status = 'active' THEN
            NEW.activated_at := now();
        ELSIF NEW.status = 'completed' THEN
            NEW.completed_at := now();
        ELSIF NEW.status = 'cancelled' THEN
            NEW.cancelled_at := now();
        END IF;
    END IF;

    IF NEW.current_coordinator_id <> OLD.current_coordinator_id
       AND NOT is_approved_coordinator(NEW.current_coordinator_id) THEN
        RAISE EXCEPTION 'coordinator_not_approved: the new coordinator must be an approved coordinator';
    END IF;

    -- The version follows the text; nobody can set it by hand
    IF NEW.onboarding_text IS DISTINCT FROM OLD.onboarding_text THEN
        NEW.onboarding_version := OLD.onboarding_version + 1;
    ELSE
        NEW.onboarding_version := OLD.onboarding_version;
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_events_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO event_coordinator_history (event_id, from_coordinator_id, to_coordinator_id, changed_by_user_id, reason)
    VALUES (NEW.id, NULL, NEW.current_coordinator_id, app_user_id(), 'initial coordinator');
    RETURN NULL;
END;
$$;

CREATE FUNCTION trg_events_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.current_coordinator_id <> OLD.current_coordinator_id THEN
        INSERT INTO event_coordinator_history
            (event_id, from_coordinator_id, to_coordinator_id, changed_by_user_id, reason)
        VALUES (NEW.id, OLD.current_coordinator_id, NEW.current_coordinator_id, app_user_id(),
                NULLIF(current_setting('app.reason', true), ''));
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'cancelled' THEN
            UPDATE assignments
               SET status = 'cancelled', cancel_reason = COALESCE(NEW.cancel_reason, 'event cancelled')
             WHERE event_id = NEW.id AND status IN ('assigned', 'confirmed');
            UPDATE event_applications SET status = 'expired'
             WHERE event_id = NEW.id AND status IN ('pending', 'waitlisted');
            UPDATE qr_tokens SET revoked_at = now()
             WHERE event_id = NEW.id AND revoked_at IS NULL;
        ELSIF NEW.status = 'completed' THEN
            UPDATE attendance SET status = 'absent'
             WHERE event_id = NEW.id AND status = 'expected';
            UPDATE attendance SET status = 'completed'
             WHERE event_id = NEW.id AND status = 'checked_in';
            UPDATE assignments SET status = 'completed'
             WHERE event_id = NEW.id AND status IN ('assigned', 'confirmed');
            UPDATE event_applications SET status = 'expired'
             WHERE event_id = NEW.id AND status IN ('pending', 'waitlisted');
            UPDATE qr_tokens SET revoked_at = now()
             WHERE event_id = NEW.id AND revoked_at IS NULL;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- ---- event_posts ------------------------------------------------------------

CREATE FUNCTION trg_posts_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor    BIGINT := app_user_id();
    v_status   TEXT;
    v_deleted  TIMESTAMPTZ;
    v_active   INTEGER := 0;
    v_changed  BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_changed := TRUE;
    ELSE
        IF NEW.event_id <> OLD.event_id THEN
            RAISE EXCEPTION 'immutable: a post cannot move to another event';
        END IF;
        v_changed := (NEW.title, NEW.description, NEW.required_headcount, NEW.physical_level,
                      NEW.required_skills, NEW.leader_needed, NEW.new_volunteers_allowed, NEW.priority)
                     IS DISTINCT FROM
                     (OLD.title, OLD.description, OLD.required_headcount, OLD.physical_level,
                      OLD.required_skills, OLD.leader_needed, OLD.new_volunteers_allowed, OLD.priority);
    END IF;

    IF v_changed THEN
        SELECT ev.status, ev.deleted_at INTO v_status, v_deleted FROM events ev WHERE ev.id = NEW.event_id;
        IF v_deleted IS NOT NULL OR v_status IS NULL OR v_status NOT IN ('draft', 'published', 'active') THEN
            RAISE EXCEPTION 'event_not_editable: posts can only change while the event is open';
        END IF;
        IF v_actor IS NOT NULL AND NOT is_event_manager(NEW.event_id, v_actor) THEN
            RAISE EXCEPTION 'permission_denied: only event managers can change posts' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT COUNT(*) INTO v_active FROM assignments a
         WHERE a.post_id = NEW.id AND a.status <> 'cancelled';
        IF NEW.required_headcount < v_active THEN
            RAISE EXCEPTION 'capacity_conflict: headcount cannot drop below the % volunteers already assigned', v_active;
        END IF;
    END IF;

    -- open/full follow the assignments; only 'closed' is set by hand
    IF NEW.status <> 'closed' THEN
        NEW.status := CASE WHEN v_active >= NEW.required_headcount THEN 'full' ELSE 'open' END;
    END IF;
    RETURN NEW;
END;
$$;

-- ---- qr_tokens --------------------------------------------------------------

CREATE FUNCTION trg_qr_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_status   TEXT;
    v_deleted  TIMESTAMPTZ;
    v_walkin   BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT ev.status, ev.deleted_at, ev.qr_registration_enabled
          INTO v_status, v_deleted, v_walkin
          FROM events ev WHERE ev.id = NEW.event_id;
        IF v_status IS NULL OR v_deleted IS NOT NULL OR v_status IN ('completed', 'cancelled') THEN
            RAISE EXCEPTION 'event_not_open: QR tokens can only be created for open events';
        END IF;
        IF NOT is_event_manager(NEW.event_id, NEW.created_by_id) THEN
            RAISE EXCEPTION 'permission_denied: only event managers can create QR tokens' USING ERRCODE = '42501';
        END IF;
        IF NEW.purpose = 'walkin_registration' AND NOT v_walkin THEN
            RAISE EXCEPTION 'walkin_disabled: walk-in registration is switched off for this event';
        END IF;
        NEW.used_count := 0;
        NEW.revoked_at := NULL;
    ELSE
        IF (NEW.event_id, NEW.purpose, NEW.token_hash, NEW.created_by_id, NEW.expires_at, NEW.max_uses)
           IS DISTINCT FROM
           (OLD.event_id, OLD.purpose, OLD.token_hash, OLD.created_by_id, OLD.expires_at, OLD.max_uses) THEN
            RAISE EXCEPTION 'immutable: only used_count and revoked_at of a QR token can change';
        END IF;
        IF NEW.used_count < OLD.used_count THEN
            RAISE EXCEPTION 'immutable: used_count can only increase';
        END IF;
        IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
            RAISE EXCEPTION 'immutable: a revoked QR token stays revoked';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ---- event_applications -----------------------------------------------------

CREATE FUNCTION trg_applications_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_ev        events%ROWTYPE;
    v_acct      TEXT;
    v_actor     BIGINT := app_user_id();
    v_remaining INTEGER;
BEGIN
    SELECT * INTO v_ev FROM events WHERE id = NEW.event_id FOR UPDATE;   -- serialises capacity decisions
    IF NOT FOUND OR v_ev.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'event_not_found: event % does not exist', NEW.event_id;
    END IF;
    IF v_ev.status NOT IN ('published', 'active') THEN
        RAISE EXCEPTION 'event_not_open: this event is not accepting applications';
    END IF;
    IF v_ev.application_deadline IS NOT NULL AND now() > v_ev.application_deadline THEN
        RAISE EXCEPTION 'deadline_passed: the application deadline has passed';
    END IF;
    IF now() > v_ev.end_at THEN
        RAISE EXCEPTION 'event_ended: this event has already ended';
    END IF;

    SELECT u.account_status INTO v_acct FROM users u WHERE u.id = NEW.user_id;
    IF v_acct IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'account_blocked: only active accounts can apply' USING ERRCODE = '42501';
    END IF;
    IF v_actor IS NOT NULL AND v_actor <> NEW.user_id AND NOT is_event_manager(NEW.event_id, v_actor) THEN
        RAISE EXCEPTION 'permission_denied: you can only apply for yourself' USING ERRCODE = '42501';
    END IF;
    IF NEW.source = 'invite' AND v_actor IS NOT NULL AND NOT is_event_manager(NEW.event_id, v_actor) THEN
        RAISE EXCEPTION 'permission_denied: only event managers can invite' USING ERRCODE = '42501';
    END IF;

    IF NEW.post_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM event_posts p WHERE p.id = NEW.post_id AND p.status <> 'closed') THEN
        RAISE EXCEPTION 'post_closed: this post is not open';
    END IF;
    IF user_has_schedule_conflict(NEW.user_id, v_ev.start_at, v_ev.end_at, NEW.event_id) THEN
        RAISE EXCEPTION 'schedule_conflict: you already have an overlapping shift';
    END IF;

    IF NEW.source = 'qr_walkin' THEN
        IF NOT v_ev.qr_registration_enabled THEN
            RAISE EXCEPTION 'walkin_disabled: walk-in registration is switched off for this event';
        END IF;
        PERFORM consume_qr_token(NEW.qr_token_id, 'walkin_registration');
    END IF;

    NEW.conditions_snapshot := COALESCE(NEW.conditions_snapshot, jsonb_build_object(
        'meals_provided', v_ev.meals_provided,
        'lodging_provided', v_ev.lodging_provided,
        'travel_support_provided', v_ev.travel_support_provided,
        'compensation_kind', v_ev.compensation_kind,
        'compensation_note', v_ev.compensation_note,
        'onboarding_version', v_ev.onboarding_version));

    NEW.status := 'pending';
    NEW.decided_by_id := NULL;
    NEW.decided_at := NULL;

    IF v_ev.acceptance_mode = 'auto' AND NEW.source <> 'qr_walkin' THEN
        v_remaining := application_remaining_capacity(NEW.event_id, NEW.post_id);
        IF v_remaining IS NULL OR v_remaining > 0 THEN
            NEW.status := 'accepted';
            NEW.decided_at := now();
        ELSE
            NEW.status := 'waitlisted';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_applications_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_ev        events%ROWTYPE;
    v_actor     BIGINT := app_user_id();
    v_remaining INTEGER;
BEGIN
    IF (NEW.event_id, NEW.user_id, NEW.source, NEW.qr_token_id, NEW.applied_at)
       IS DISTINCT FROM
       (OLD.event_id, OLD.user_id, OLD.source, OLD.qr_token_id, OLD.applied_at) THEN
        RAISE EXCEPTION 'immutable: event, applicant, source and QR token of an application cannot change';
    END IF;

    IF NEW.post_id IS DISTINCT FROM OLD.post_id AND OLD.status IN ('rejected', 'withdrawn', 'expired') THEN
        RAISE EXCEPTION 'immutable: a closed application cannot change post';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT ((OLD.status = 'pending'    AND NEW.status IN ('accepted', 'rejected', 'waitlisted', 'withdrawn', 'expired'))
             OR (OLD.status = 'waitlisted' AND NEW.status IN ('accepted', 'rejected', 'withdrawn', 'expired'))
             OR (OLD.status = 'accepted'   AND NEW.status IN ('withdrawn', 'expired'))) THEN
            RAISE EXCEPTION 'invalid_transition: application status % -> %', OLD.status, NEW.status;
        END IF;

        IF NEW.status IN ('accepted', 'rejected', 'waitlisted') THEN
            IF v_actor IS NOT NULL AND NOT is_event_manager(NEW.event_id, v_actor) THEN
                RAISE EXCEPTION 'permission_denied: only event managers can decide applications' USING ERRCODE = '42501';
            END IF;
            NEW.decided_by_id := COALESCE(NEW.decided_by_id, v_actor);
            NEW.decided_at    := COALESCE(NEW.decided_at, now());
        ELSIF NEW.status = 'withdrawn' THEN
            IF v_actor IS NOT NULL AND v_actor <> NEW.user_id AND NOT is_event_manager(NEW.event_id, v_actor) THEN
                RAISE EXCEPTION 'permission_denied: only the applicant or an event manager can withdraw' USING ERRCODE = '42501';
            END IF;
        END IF;

        IF NEW.status = 'accepted' THEN
            SELECT * INTO v_ev FROM events WHERE id = NEW.event_id FOR UPDATE;
            IF v_ev.deleted_at IS NOT NULL OR v_ev.status NOT IN ('published', 'active') THEN
                RAISE EXCEPTION 'event_not_open: this event is not accepting volunteers';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.account_status = 'active') THEN
                RAISE EXCEPTION 'account_blocked: this volunteer account is not active';
            END IF;
            v_remaining := application_remaining_capacity(NEW.event_id, NEW.post_id);
            IF v_remaining IS NOT NULL AND v_remaining <= 0 THEN
                RAISE EXCEPTION 'capacity_full: no places left';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_applications_after()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_became_accepted BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_became_accepted := (NEW.status = 'accepted');
    ELSE
        v_became_accepted := (NEW.status = 'accepted' AND OLD.status <> 'accepted');
    END IF;

    IF v_became_accepted THEN
        IF (SELECT ev.auto_assign_enabled FROM events ev WHERE ev.id = NEW.event_id) THEN
            PERFORM create_assignment_from_application(NEW.id, NULL);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IN ('withdrawn', 'expired') AND OLD.status <> NEW.status THEN
            UPDATE assignments
               SET status = 'cancelled', cancel_reason = 'application ' || NEW.status
             WHERE application_id = NEW.id AND status IN ('assigned', 'confirmed');
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- ---- assignments ------------------------------------------------------------

CREATE FUNCTION trg_assignments_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_ev events%ROWTYPE;
    v_p  event_posts%ROWTYPE;
BEGIN
    SELECT * INTO v_ev FROM events WHERE id = NEW.event_id FOR UPDATE;   -- lock order: event, post
    IF NOT FOUND OR v_ev.deleted_at IS NOT NULL OR v_ev.status NOT IN ('published', 'active') THEN
        RAISE EXCEPTION 'event_not_open: assignments can only be created for open events';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM event_applications ap WHERE ap.id = NEW.application_id AND ap.status = 'accepted') THEN
        RAISE EXCEPTION 'invalid_state: only accepted applications can be assigned';
    END IF;
    IF NEW.assigned_by_user_id IS NOT NULL AND NOT is_event_manager(NEW.event_id, NEW.assigned_by_user_id) THEN
        RAISE EXCEPTION 'permission_denied: only event managers can assign volunteers' USING ERRCODE = '42501';
    END IF;

    NEW.status := 'assigned';
    NEW.confirmed_at := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancel_reason := NULL;
    NEW.schedule_start := COALESCE(NEW.schedule_start, v_ev.start_at);
    NEW.schedule_end   := COALESCE(NEW.schedule_end, v_ev.end_at);

    IF NEW.post_id IS NOT NULL THEN
        SELECT * INTO v_p FROM event_posts WHERE id = NEW.post_id FOR UPDATE;
        IF v_p.status = 'closed' THEN
            RAISE EXCEPTION 'post_closed: this post is not open';
        END IF;
        IF (SELECT COUNT(*) FROM assignments a
             WHERE a.post_id = NEW.post_id AND a.status <> 'cancelled') >= v_p.required_headcount THEN
            RAISE EXCEPTION 'capacity_full: this post is full';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_assignments_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor        BIGINT := app_user_id();
    v_event_status TEXT;
    v_p            event_posts%ROWTYPE;
BEGIN
    IF (NEW.event_id, NEW.application_id, NEW.user_id)
       IS DISTINCT FROM (OLD.event_id, OLD.application_id, OLD.user_id) THEN
        RAISE EXCEPTION 'immutable: event, application and volunteer of an assignment cannot change';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT ((OLD.status = 'assigned'  AND NEW.status IN ('confirmed', 'cancelled', 'completed'))
             OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))) THEN
            RAISE EXCEPTION 'invalid_transition: assignment status % -> %', OLD.status, NEW.status;
        END IF;

        IF NEW.status = 'confirmed' THEN
            IF v_actor IS NOT NULL AND v_actor <> NEW.user_id AND NOT is_admin_user(v_actor) THEN
                RAISE EXCEPTION 'permission_denied: only the volunteer confirms their own shift' USING ERRCODE = '42501';
            END IF;
            NEW.confirmed_at := now();
        ELSIF NEW.status = 'cancelled' THEN
            IF v_actor IS NOT NULL AND v_actor <> NEW.user_id AND NOT is_event_manager(NEW.event_id, v_actor) THEN
                RAISE EXCEPTION 'permission_denied: only the volunteer or an event manager can cancel' USING ERRCODE = '42501';
            END IF;
            NEW.cancelled_at := now();
        ELSIF NEW.status = 'completed' THEN
            SELECT ev.status INTO v_event_status FROM events ev WHERE ev.id = NEW.event_id;
            IF v_event_status IS DISTINCT FROM 'completed' THEN
                RAISE EXCEPTION 'invalid_state: assignments complete only when the event completes';
            END IF;
        END IF;
    END IF;

    IF (NEW.post_id, NEW.group_code, NEW.is_group_leader, NEW.schedule_start, NEW.schedule_end)
       IS DISTINCT FROM
       (OLD.post_id, OLD.group_code, OLD.is_group_leader, OLD.schedule_start, OLD.schedule_end) THEN
        IF v_actor IS NOT NULL AND NOT is_event_manager(NEW.event_id, v_actor) THEN
            RAISE EXCEPTION 'permission_denied: only event managers can move or regroup volunteers' USING ERRCODE = '42501';
        END IF;
        IF NEW.post_id IS NOT NULL AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
            SELECT * INTO v_p FROM event_posts WHERE id = NEW.post_id FOR UPDATE;
            IF v_p.status = 'closed' THEN
                RAISE EXCEPTION 'post_closed: this post is not open';
            END IF;
            IF (SELECT COUNT(*) FROM assignments a
                 WHERE a.post_id = NEW.post_id AND a.status <> 'cancelled' AND a.id <> NEW.id)
               >= v_p.required_headcount THEN
                RAISE EXCEPTION 'capacity_full: this post is full';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_assignments_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_is_walkin BOOLEAN := FALSE;
BEGIN
    SELECT (ap.source = 'qr_walkin') INTO v_is_walkin
      FROM event_applications ap WHERE ap.id = NEW.application_id;

    INSERT INTO attendance (event_id, user_id, assignment_id, status, walk_in_flag)
    VALUES (NEW.event_id, NEW.user_id, NEW.id, 'expected', COALESCE(v_is_walkin, FALSE))
    ON CONFLICT (event_id, user_id) DO UPDATE
       SET assignment_id = EXCLUDED.assignment_id,
           status = 'expected',
           walk_in_flag = EXCLUDED.walk_in_flag,
           confirmation_status = 'not_required',
           confirmed_by_user_id = NULL,
           confirmed_at = NULL,
           confirmation_note = NULL
     WHERE attendance.status IN ('expected', 'cancelled');

    IF NEW.post_id IS NOT NULL THEN
        UPDATE event_posts SET updated_at = now() WHERE id = NEW.post_id;   -- re-evaluates open/full
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION trg_assignments_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
        UPDATE attendance SET status = 'cancelled'
         WHERE assignment_id = NEW.id AND status = 'expected';
    END IF;

    IF NEW.status <> OLD.status OR NEW.post_id IS DISTINCT FROM OLD.post_id THEN
        IF OLD.post_id IS NOT NULL THEN
            UPDATE event_posts SET updated_at = now() WHERE id = OLD.post_id;
        END IF;
        IF NEW.post_id IS NOT NULL AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
            UPDATE event_posts SET updated_at = now() WHERE id = NEW.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- ---- attendance -------------------------------------------------------------

CREATE FUNCTION trg_attendance_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status <> 'expected' THEN
        RAISE EXCEPTION 'invalid_state: attendance is created as expected when a volunteer is assigned';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_attendance_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor     BIGINT := app_user_id();
    v_ev        events%ROWTYPE;
    v_asg_stat  TEXT;
    v_asg_app   BIGINT;
    v_source    TEXT;
    v_dist      DOUBLE PRECISION;
    v_radius    INTEGER;
BEGIN
    IF (NEW.event_id, NEW.user_id) IS DISTINCT FROM (OLD.event_id, OLD.user_id) THEN
        RAISE EXCEPTION 'immutable: event and volunteer of an attendance row cannot change';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT ((OLD.status = 'expected'   AND NEW.status IN ('checked_in', 'absent', 'cancelled'))
             OR (OLD.status = 'absent'     AND NEW.status IN ('checked_in', 'expected'))
             OR (OLD.status = 'checked_in' AND NEW.status = 'completed')
             OR (OLD.status = 'checked_in' AND NEW.status = 'expected' AND NEW.confirmation_status = 'rejected')
             OR (OLD.status = 'cancelled'  AND NEW.status = 'expected')) THEN
            RAISE EXCEPTION 'invalid_transition: attendance status % -> %', OLD.status, NEW.status;
        END IF;

        IF NEW.status = 'absent' AND v_actor IS NOT NULL AND NOT is_event_manager(NEW.event_id, v_actor) THEN
            RAISE EXCEPTION 'permission_denied: only event managers can mark absence' USING ERRCODE = '42501';
        END IF;

        IF NEW.status = 'checked_in' THEN
            SELECT * INTO v_ev FROM events WHERE id = NEW.event_id;
            IF v_ev.deleted_at IS NOT NULL OR v_ev.status <> 'active' THEN
                RAISE EXCEPTION 'event_not_active: check-in is only possible while the event is active';
            END IF;
            SELECT a.status, a.application_id INTO v_asg_stat, v_asg_app
              FROM assignments a WHERE a.id = NEW.assignment_id;
            IF v_asg_stat IS NULL OR v_asg_stat NOT IN ('assigned', 'confirmed') THEN
                RAISE EXCEPTION 'not_assigned: only volunteers with an active assignment can check in';
            END IF;
            SELECT ap.source INTO v_source FROM event_applications ap WHERE ap.id = v_asg_app;
            IF v_source = 'qr_walkin' THEN
                NEW.walk_in_flag := TRUE;
            END IF;
            IF v_ev.require_onboarding_ack
               AND NOT EXISTS (SELECT 1 FROM onboarding_acknowledgments o
                                WHERE o.user_id = NEW.user_id AND o.event_id = NEW.event_id
                                  AND o.onboarding_version = v_ev.onboarding_version) THEN
                RAISE EXCEPTION 'onboarding_required: acknowledge the current onboarding before checking in';
            END IF;
            IF NEW.method IS NULL THEN
                RAISE EXCEPTION 'checkin_method_required: a check-in method is required';
            END IF;
            IF NEW.method IN ('qr_scan', 'geo') AND v_actor IS NOT NULL AND v_actor <> NEW.user_id THEN
                RAISE EXCEPTION 'permission_denied: volunteers check themselves in' USING ERRCODE = '42501';
            END IF;

            NEW.checkin_at := COALESCE(NEW.checkin_at, now());
            NEW.confirmed_by_user_id := NULL;
            NEW.confirmed_at := NULL;
            NEW.confirmation_note := NULL;
            NEW.confirmation_status := 'not_required';

            IF NEW.method = 'coordinator_manual' THEN
                IF NOT is_event_manager(NEW.event_id, NEW.recorded_by_user_id) THEN
                    RAISE EXCEPTION 'permission_denied: only event managers can check volunteers in manually'
                        USING ERRCODE = '42501';
                END IF;
            ELSIF NEW.method = 'qr_scan' THEN
                PERFORM consume_qr_token(NEW.qr_token_id, 'checkin');   -- a use is spent only on a real status change
            ELSIF NEW.method = 'geo' THEN
                IF NOT v_ev.geo_checkin_enabled OR v_ev.latitude IS NULL THEN
                    RAISE EXCEPTION 'geo_checkin_unavailable: geo check-in is not enabled for this event';
                END IF;
                IF v_source = 'qr_walkin' OR NEW.walk_in_flag THEN
                    RAISE EXCEPTION 'geo_checkin_unavailable: walk-in volunteers check in by QR';
                END IF;
                IF now() < v_ev.start_at - make_interval(mins => v_ev.geo_checkin_opens_before_min)
                   OR now() > v_ev.end_at THEN
                    RAISE EXCEPTION 'checkin_window_closed: geo check-in is not open now';
                END IF;
                IF NEW.checkin_latitude IS NULL OR NEW.checkin_longitude IS NULL THEN
                    RAISE EXCEPTION 'invalid_geo_fix: coordinates are required for geo check-in';
                END IF;
                IF NEW.checkin_accuracy_m IS NULL OR NEW.checkin_accuracy_m > setting_int('geo_max_accuracy_m') THEN
                    RAISE EXCEPTION 'low_accuracy: the location fix is not accurate enough';
                END IF;
                -- the caller's distance is ignored; the database measures it
                v_dist := geo_distance_m(v_ev.latitude::DOUBLE PRECISION, v_ev.longitude::DOUBLE PRECISION,
                                         NEW.checkin_latitude::DOUBLE PRECISION, NEW.checkin_longitude::DOUBLE PRECISION);
                v_radius := COALESCE(v_ev.geo_radius_m, setting_int('geo_default_radius_m'));
                IF v_dist > v_radius THEN
                    RAISE EXCEPTION 'outside_geofence: you are % m from the event point (limit % m)',
                        round(v_dist::NUMERIC, 0), v_radius;
                END IF;
                NEW.checkin_distance_m := round(v_dist::NUMERIC, 1);
                NEW.geo_verified := TRUE;
                NEW.confirmation_status :=
                    CASE WHEN v_ev.require_checkin_confirmation THEN 'pending' ELSE 'not_required' END;
            END IF;

        ELSIF OLD.status = 'checked_in' AND NEW.status = 'expected' THEN
            -- the coordinator rejected a geo check-in: clear the evidence (kept in the attempts log)
            NEW.checkin_at := NULL;
            NEW.checkout_at := NULL;
            NEW.method := NULL;
            NEW.qr_token_id := NULL;
            NEW.checkin_latitude := NULL;
            NEW.checkin_longitude := NULL;
            NEW.checkin_accuracy_m := NULL;
            NEW.checkin_distance_m := NULL;
            NEW.geo_verified := FALSE;
        END IF;
    END IF;

    -- Confirmation changes
    IF NEW.confirmation_status IS DISTINCT FROM OLD.confirmation_status THEN
        IF OLD.confirmation_status = 'pending' AND NEW.confirmation_status IN ('confirmed', 'rejected') THEN
            NEW.confirmed_by_user_id := COALESCE(NEW.confirmed_by_user_id, v_actor);
            IF NEW.confirmed_by_user_id IS NULL
               OR NOT is_event_manager(NEW.event_id, NEW.confirmed_by_user_id) THEN
                RAISE EXCEPTION 'permission_denied: only the owner, the current coordinator or an admin can decide check-ins'
                    USING ERRCODE = '42501';
            END IF;
            NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
        ELSIF NEW.status = 'checked_in' AND OLD.status <> 'checked_in' THEN
            NULL;   -- set by the check-in block above
        ELSIF NEW.confirmation_status = 'not_required' AND OLD.confirmation_status = 'rejected' THEN
            NULL;   -- reset when the volunteer is placed again
        ELSE
            RAISE EXCEPTION 'invalid_transition: confirmation status % -> %',
                OLD.confirmation_status, NEW.confirmation_status;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_geo_attempts_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.event_id, NEW.user_id, NEW.attendance_id, NEW.attempted_at, NEW.accuracy_m, NEW.captured_at,
        NEW.device_mocked, NEW.distance_m, NEW.radius_m, NEW.result)
       IS DISTINCT FROM
       (OLD.event_id, OLD.user_id, OLD.attendance_id, OLD.attempted_at, OLD.accuracy_m, OLD.captured_at,
        OLD.device_mocked, OLD.distance_m, OLD.radius_m, OLD.result) THEN
        RAISE EXCEPTION 'append_only: only the review fields and a coordinate purge can change a geo attempt'
            USING ERRCODE = '42501';
    END IF;
    IF (NEW.latitude IS NOT NULL AND NEW.latitude IS DISTINCT FROM OLD.latitude)
       OR (NEW.longitude IS NOT NULL AND NEW.longitude IS DISTINCT FROM OLD.longitude) THEN
        RAISE EXCEPTION 'append_only: coordinates can be removed but never changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- ---- onboarding_acknowledgments --------------------------------------------

CREATE FUNCTION trg_onboarding_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_ev events%ROWTYPE;
BEGIN
    SELECT * INTO v_ev FROM events WHERE id = NEW.event_id;
    IF NOT FOUND OR v_ev.deleted_at IS NOT NULL OR v_ev.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'event_not_open: this event no longer needs onboarding';
    END IF;
    NEW.onboarding_version := COALESCE(NEW.onboarding_version, v_ev.onboarding_version);
    IF NEW.onboarding_version <> v_ev.onboarding_version THEN
        RAISE EXCEPTION 'stale_onboarding_version: the current onboarding version is %', v_ev.onboarding_version;
    END IF;
    IF app_user_id() IS NOT NULL AND app_user_id() <> NEW.user_id THEN
        RAISE EXCEPTION 'permission_denied: you can only acknowledge for yourself' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM event_applications ap
                    WHERE ap.event_id = NEW.event_id AND ap.user_id = NEW.user_id
                      AND ap.status IN ('pending', 'accepted', 'waitlisted')) THEN
        RAISE EXCEPTION 'not_applicant: only applicants of this event can acknowledge its onboarding';
    END IF;
    RETURN NEW;
END;
$$;

-- ---- feedback ---------------------------------------------------------------

CREATE FUNCTION trg_feedback_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_ev events%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO v_ev FROM events WHERE id = NEW.event_id;
        IF NOT FOUND OR v_ev.status <> 'completed' THEN
            RAISE EXCEPTION 'event_not_completed: feedback is only possible after the event is completed';
        END IF;
        IF app_user_id() IS NOT NULL AND app_user_id() <> NEW.rater_user_id THEN
            RAISE EXCEPTION 'permission_denied: you can only leave feedback as yourself' USING ERRCODE = '42501';
        END IF;

        IF NEW.direction = 'coordinator_to_volunteer' THEN
            IF NEW.rater_user_id NOT IN (v_ev.owner_id, v_ev.current_coordinator_id) THEN
                RAISE EXCEPTION 'permission_denied: only the owner or current coordinator can rate volunteers'
                    USING ERRCODE = '42501';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM assignments a
                            WHERE a.event_id = NEW.event_id AND a.user_id = NEW.target_user_id
                              AND a.status <> 'cancelled') THEN
                RAISE EXCEPTION 'target_not_participant: that volunteer did not take part in this event';
            END IF;
        ELSE
            IF NOT EXISTS (SELECT 1 FROM attendance t
                            WHERE t.event_id = NEW.event_id AND t.user_id = NEW.rater_user_id
                              AND t.status = 'completed') THEN
                RAISE EXCEPTION 'rater_not_participant: only volunteers who attended can leave this feedback';
            END IF;
            IF NEW.direction = 'volunteer_to_coordinator'
               AND NEW.target_user_id NOT IN (v_ev.owner_id, v_ev.current_coordinator_id) THEN
                RAISE EXCEPTION 'invalid_target: the target must be the owner or current coordinator of the event';
            END IF;
        END IF;
        NEW.status := 'active';
    ELSE
        IF (NEW.event_id, NEW.rater_user_id, NEW.target_user_id, NEW.direction, NEW.score, NEW.tags, NEW.comment)
           IS DISTINCT FROM
           (OLD.event_id, OLD.rater_user_id, OLD.target_user_id, OLD.direction, OLD.score, OLD.tags, OLD.comment) THEN
            RAISE EXCEPTION 'immutable: submitted feedback cannot be edited';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status
           AND COALESCE(current_setting('app.privileged_write', true), '') <> 'on' THEN
            RAISE EXCEPTION 'permission_denied: feedback is hidden only through an admin moderation action'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ---- moderation_actions -----------------------------------------------------

CREATE FUNCTION trg_moderation_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT is_admin_user(NEW.admin_user_id) THEN
        RAISE EXCEPTION 'permission_denied: only active admins can moderate' USING ERRCODE = '42501';
    END IF;
    IF app_user_id() IS NOT NULL AND app_user_id() <> NEW.admin_user_id THEN
        RAISE EXCEPTION 'permission_denied: moderation must be recorded by the acting admin' USING ERRCODE = '42501';
    END IF;
    IF NEW.target_user_id IS NOT NULL AND is_admin_user(NEW.target_user_id)
       AND NEW.action_type <> 'user_warning' THEN
        RAISE EXCEPTION 'permission_denied: an admin account cannot be blocked or closed through moderation'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION trg_moderation_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.privileged_write', 'on', true);

    IF NEW.action_type = 'user_block' THEN
        UPDATE users SET account_status = 'blocked', blocked_until = NEW.expires_at
         WHERE id = NEW.target_user_id AND account_status = 'active';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: only active users can be blocked';
        END IF;
    ELSIF NEW.action_type = 'user_unblock' THEN
        UPDATE users SET account_status = 'active', blocked_until = NULL
         WHERE id = NEW.target_user_id AND account_status = 'blocked';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: the user is not blocked';
        END IF;
    ELSIF NEW.action_type = 'account_close' THEN
        UPDATE users SET account_status = 'closed', blocked_until = NULL
         WHERE id = NEW.target_user_id AND account_status IN ('active', 'blocked');
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: the account is already closed';
        END IF;
    ELSIF NEW.action_type = 'account_reinstate' THEN
        UPDATE users SET account_status = 'active', blocked_until = NULL
         WHERE id = NEW.target_user_id AND account_status = 'closed';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: the account is not closed';
        END IF;
    ELSIF NEW.action_type = 'event_delete' THEN
        UPDATE events SET deleted_at = now(), deleted_by_id = NEW.admin_user_id
         WHERE id = NEW.event_id AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: the event is already deleted';
        END IF;
    ELSIF NEW.action_type = 'event_restore' THEN
        UPDATE events SET deleted_at = NULL, deleted_by_id = NULL
         WHERE id = NEW.event_id AND deleted_at IS NOT NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: the event is not deleted';
        END IF;
    ELSIF NEW.action_type = 'event_cancel' THEN
        UPDATE events SET status = 'cancelled', cancel_reason = NEW.reason
         WHERE id = NEW.event_id AND status IN ('draft', 'published', 'active') AND deleted_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: only open, undeleted events can be cancelled';
        END IF;
    ELSIF NEW.action_type = 'feedback_hide' THEN
        UPDATE feedback SET status = 'hidden'
         WHERE id = NEW.feedback_id AND status = 'active';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'invalid_state: the feedback is not active';
        END IF;
    END IF;

    PERFORM set_config('app.privileged_write', 'off', true);
    RETURN NULL;
END;
$$;

-- =============================================================================
-- 19. TRIGGERS
-- =============================================================================

-- users
CREATE TRIGGER trg_01_users_guard
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trg_users_guard();

-- coordinator_profiles
CREATE TRIGGER trg_01_coordinator_guard
    BEFORE INSERT OR UPDATE ON coordinator_profiles
    FOR EACH ROW EXECUTE FUNCTION trg_coordinator_guard();

-- user_verification_images
CREATE TRIGGER trg_01_vimg_guard
    BEFORE INSERT OR UPDATE ON user_verification_images
    FOR EACH ROW EXECUTE FUNCTION trg_vimg_guard();
CREATE TRIGGER trg_50_vimg_after
    AFTER INSERT OR UPDATE ON user_verification_images
    FOR EACH ROW EXECUTE FUNCTION trg_vimg_after();

-- auth_otp
CREATE TRIGGER trg_01_otp_rate_limit
    BEFORE INSERT ON auth_otp
    FOR EACH ROW EXECUTE FUNCTION trg_otp_rate_limit();

-- events
CREATE TRIGGER trg_01_events_before_insert
    BEFORE INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION trg_events_before_insert();
CREATE TRIGGER trg_01_events_before_update
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION trg_events_before_update();
CREATE TRIGGER trg_50_events_after_insert
    AFTER INSERT ON events
    FOR EACH ROW EXECUTE FUNCTION trg_events_after_insert();
CREATE TRIGGER trg_50_events_after_update
    AFTER UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION trg_events_after_update();

-- event_posts
CREATE TRIGGER trg_01_posts_guard
    BEFORE INSERT OR UPDATE ON event_posts
    FOR EACH ROW EXECUTE FUNCTION trg_posts_guard();

-- qr_tokens
CREATE TRIGGER trg_01_qr_guard
    BEFORE INSERT OR UPDATE ON qr_tokens
    FOR EACH ROW EXECUTE FUNCTION trg_qr_guard();

-- event_applications
CREATE TRIGGER trg_01_applications_before_insert
    BEFORE INSERT ON event_applications
    FOR EACH ROW EXECUTE FUNCTION trg_applications_before_insert();
CREATE TRIGGER trg_01_applications_before_update
    BEFORE UPDATE ON event_applications
    FOR EACH ROW EXECUTE FUNCTION trg_applications_before_update();
CREATE TRIGGER trg_50_applications_after
    AFTER INSERT OR UPDATE ON event_applications
    FOR EACH ROW EXECUTE FUNCTION trg_applications_after();

-- assignments
CREATE TRIGGER trg_01_assignments_before_insert
    BEFORE INSERT ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_assignments_before_insert();
CREATE TRIGGER trg_01_assignments_before_update
    BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_assignments_before_update();
CREATE TRIGGER trg_50_assignments_after_insert
    AFTER INSERT ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_assignments_after_insert();
CREATE TRIGGER trg_50_assignments_after_update
    AFTER UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_assignments_after_update();

-- attendance
CREATE TRIGGER trg_01_attendance_before_insert
    BEFORE INSERT ON attendance
    FOR EACH ROW EXECUTE FUNCTION trg_attendance_before_insert();
CREATE TRIGGER trg_01_attendance_guard
    BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION trg_attendance_guard();

-- attendance_geo_attempts
CREATE TRIGGER trg_01_geo_attempts_guard
    BEFORE UPDATE ON attendance_geo_attempts
    FOR EACH ROW EXECUTE FUNCTION trg_geo_attempts_guard();
CREATE TRIGGER trg_01_geo_attempts_no_delete
    BEFORE DELETE ON attendance_geo_attempts
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();

-- onboarding_acknowledgments
CREATE TRIGGER trg_01_onboarding_before_insert
    BEFORE INSERT ON onboarding_acknowledgments
    FOR EACH ROW EXECUTE FUNCTION trg_onboarding_before_insert();
CREATE TRIGGER trg_01_onboarding_append_only
    BEFORE UPDATE OR DELETE ON onboarding_acknowledgments
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();

-- feedback
CREATE TRIGGER trg_01_feedback_guard
    BEFORE INSERT OR UPDATE ON feedback
    FOR EACH ROW EXECUTE FUNCTION trg_feedback_guard();

-- moderation_actions (insert applies the action; rows are never edited)
CREATE TRIGGER trg_01_moderation_before_insert
    BEFORE INSERT ON moderation_actions
    FOR EACH ROW EXECUTE FUNCTION trg_moderation_before_insert();
CREATE TRIGGER trg_50_moderation_after_insert
    AFTER INSERT ON moderation_actions
    FOR EACH ROW EXECUTE FUNCTION trg_moderation_after_insert();
CREATE TRIGGER trg_01_moderation_append_only
    BEFORE UPDATE OR DELETE ON moderation_actions
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();

-- append-only history tables
CREATE TRIGGER trg_01_audit_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();
CREATE TRIGGER trg_01_audit_no_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION trg_block_mutation();
CREATE TRIGGER trg_01_coord_history_append_only
    BEFORE UPDATE OR DELETE ON event_coordinator_history
    FOR EACH ROW EXECUTE FUNCTION trg_block_mutation();

-- updated_at on every table that has the column
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'coordinator_profiles', 'user_verification_images', 'events',
        'event_posts', 'event_applications', 'assignments', 'attendance']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_90_%1$s_updated_at BEFORE UPDATE ON %1$I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    END LOOP;
END;
$$;

-- automatic audit trail (coordinates and secrets are never copied into audit_logs)
CREATE TRIGGER trg_95_users_audit
    AFTER INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_availability_rules_audit
    AFTER INSERT OR UPDATE ON volunteer_availability_rules FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_availability_exceptions_audit
    AFTER INSERT OR UPDATE ON volunteer_availability_exceptions FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_coordinator_profiles_audit
    AFTER INSERT OR UPDATE ON coordinator_profiles FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_verification_images_audit
    AFTER INSERT OR UPDATE ON user_verification_images FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_events_audit
    AFTER INSERT OR UPDATE ON events FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_event_posts_audit
    AFTER INSERT OR UPDATE ON event_posts FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_qr_tokens_audit
    AFTER INSERT OR UPDATE ON qr_tokens FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_applications_audit
    AFTER INSERT OR UPDATE ON event_applications FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_assignments_audit
    AFTER INSERT OR UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_attendance_audit
    AFTER INSERT OR UPDATE ON attendance FOR EACH ROW
    EXECUTE FUNCTION trg_audit_row('checkin_latitude', 'checkin_longitude');
CREATE TRIGGER trg_95_feedback_audit
    AFTER INSERT OR UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
CREATE TRIGGER trg_95_moderation_audit
    AFTER INSERT ON moderation_actions FOR EACH ROW EXECUTE FUNCTION trg_audit_row();

-- =============================================================================
-- 20. VIEWS (11 Operational, Public & Admin Views)
-- =============================================================================

-- 20.1 Remaining places per post
CREATE VIEW v_event_post_capacity AS
SELECT p.id AS post_id,
       p.event_id,
       p.title,
       p.status,
       p.required_headcount,
       COUNT(a.id) AS assigned_count,
       GREATEST(p.required_headcount - COUNT(a.id), 0) AS remaining
  FROM event_posts p
  LEFT JOIN assignments a
         ON a.post_id = p.id AND a.status <> 'cancelled'
 GROUP BY p.id;

-- 20.2 What volunteers browse: published or active, not deleted
CREATE VIEW v_public_events AS
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
       COALESCE((SELECT array_agg(f.field_code ORDER BY f.field_code)
                   FROM event_charity_fields f WHERE f.event_id = e.id), '{}'::TEXT[]) AS charity_fields,
       COALESCE((SELECT sum(c.remaining)
                   FROM v_event_post_capacity c
                  WHERE c.event_id = e.id AND c.status <> 'closed'), 0) AS spots_remaining
  FROM events e
  JOIN users cu ON cu.id = e.current_coordinator_id
 WHERE e.deleted_at IS NULL
   AND e.status IN ('published', 'active');

-- 20.3 Per-event counters for the coordinator board (subqueries avoid join fan-out)
CREATE VIEW v_event_summary AS
SELECT e.id AS event_id,
       e.title,
       e.status,
       e.owner_id,
       e.current_coordinator_id,
       e.start_at,
       e.end_at,
       e.acceptance_mode,
       e.auto_assign_enabled,
       e.max_participants,
       e.geo_checkin_enabled,
       e.map_provider,
       (SELECT COUNT(*) FROM event_applications x WHERE x.event_id = e.id AND x.status = 'pending')    AS pending_count,
       (SELECT COUNT(*) FROM event_applications x WHERE x.event_id = e.id AND x.status = 'accepted')   AS accepted_count,
       (SELECT COUNT(*) FROM event_applications x WHERE x.event_id = e.id AND x.status = 'waitlisted') AS waitlisted_count,
       (SELECT COUNT(*) FROM assignments x WHERE x.event_id = e.id AND x.status <> 'cancelled')        AS assignment_count,
       (SELECT COUNT(*) FROM attendance x WHERE x.event_id = e.id AND x.status IN ('checked_in', 'completed')) AS checked_in_count,
       (SELECT COUNT(*) FROM attendance x WHERE x.event_id = e.id AND x.confirmation_status = 'pending')       AS pending_confirmations
  FROM events e
 WHERE e.deleted_at IS NULL;

-- 20.4 Accepted applications that still have no assignment
CREATE VIEW v_accepted_unassigned AS
SELECT ap.id AS application_id,
       ap.event_id,
       ap.user_id,
       u.display_name,
       u.skills,
       u.physical_ok,
       u.can_lift_heavy,
       u.has_leader_experience,
       u.new_to_volunteer
  FROM event_applications ap
  JOIN users  u ON u.id = ap.user_id
  JOIN events e ON e.id = ap.event_id AND e.deleted_at IS NULL
 WHERE ap.status = 'accepted'
   AND NOT EXISTS (SELECT 1 FROM assignments a
                    WHERE a.application_id = ap.id AND a.status <> 'cancelled');

-- 20.5 Worker list with live check-in state
CREATE VIEW v_event_checkin_board AS
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
  FROM assignments a
  JOIN users u ON u.id = a.user_id
  LEFT JOIN event_posts ep ON ep.id = a.post_id
  LEFT JOIN attendance t ON t.event_id = a.event_id AND t.user_id = a.user_id
 WHERE a.status <> 'cancelled';

-- 20.6 Alias view for check-in status compatibility
CREATE VIEW v_event_checkin_status AS
SELECT event_id,
       user_id,
       display_name,
       post_id,
       post_title,
       group_code,
       is_group_leader,
       COALESCE(attendance_status, 'expected') AS attendance_status,
       checkin_at,
       method AS checkin_method,
       walk_in_flag,
       confirmation_status,
       checkin_distance_m
  FROM v_event_checkin_board;

-- 20.7 The coordinator's queue of geo check-ins waiting for a decision
CREATE VIEW v_pending_confirmations AS
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
  FROM attendance t
  JOIN events e ON e.id = t.event_id AND e.deleted_at IS NULL
  JOIN users  u ON u.id = t.user_id
 WHERE t.confirmation_status = 'pending';

-- 20.8 Geo check-in attempt log (for fraud & telemetry review)
CREATE VIEW v_geo_attempts_review AS
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
  FROM attendance_geo_attempts ga
  JOIN events e ON e.id = ga.event_id
  JOIN users  u ON u.id = ga.user_id
 ORDER BY ga.attempted_at DESC;

-- 20.9 Coordinator handover history
CREATE VIEW v_event_coordinator_history AS
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
  FROM event_coordinator_history h
  JOIN events e  ON e.id  = h.event_id
  LEFT JOIN users fu ON fu.id = h.from_coordinator_id
  JOIN users tu  ON tu.id = h.to_coordinator_id
  LEFT JOIN users cu ON cu.id = h.changed_by_user_id
 ORDER BY h.changed_at DESC;

-- 20.10 Per-user moderation summary
CREATE VIEW v_user_moderation_summary AS
SELECT m.target_user_id AS user_id,
       COUNT(*) FILTER (WHERE m.action_type = 'user_warning')  AS warning_count,
       max(m.created_at) FILTER (WHERE m.action_type = 'user_warning') AS last_warning_at,
       COUNT(*) FILTER (WHERE m.action_type = 'user_block')    AS block_count,
       max(m.created_at) FILTER (WHERE m.action_type = 'user_block')   AS last_block_at
  FROM moderation_actions m
 WHERE m.target_user_id IS NOT NULL
 GROUP BY m.target_user_id;

-- 20.11 Admin dashboard (one row)
CREATE VIEW v_admin_dashboard AS
SELECT
    (SELECT COUNT(*) FROM users WHERE account_status = 'active')   AS active_users,
    (SELECT COUNT(*) FROM users WHERE account_status = 'blocked')  AS blocked_users,
    (SELECT COUNT(*) FROM users WHERE verification_status = 'pending') AS users_pending_verification,
    (SELECT COUNT(*) FROM user_verification_images WHERE status = 'pending' AND is_current) AS images_pending_review,
    (SELECT COUNT(*) FROM coordinator_profiles WHERE status = 'pending')  AS coordinators_pending_approval,
    (SELECT COUNT(*) FROM coordinator_profiles WHERE status = 'approved') AS coordinators_approved,
    (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'draft')     AS events_draft,
    (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'published') AS events_published,
    (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'active')    AS events_active,
    (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'completed') AS events_completed,
    (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL AND status = 'cancelled') AS events_cancelled,
    (SELECT COUNT(*) FROM events WHERE deleted_at IS NOT NULL) AS events_deleted,
    (SELECT COUNT(*) FROM attendance WHERE confirmation_status = 'pending') AS pending_checkin_confirmations,
    (SELECT COUNT(*) FROM moderation_actions
      WHERE action_type = 'user_warning' AND created_at > now() - INTERVAL '30 days') AS warnings_last_30d;

-- =============================================================================
-- 21. SELF-TEST SUITE (Zero-Pollution Verification)
--     Run `SELECT * FROM self_test();` after loading to verify constraints,
--     triggers, composite FKs, EXCLUDE rules, and audit immutability.
--     All temporary rows (including audit_logs) are rolled back automatically.
-- =============================================================================

CREATE OR REPLACE FUNCTION self_test()
RETURNS TABLE (test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_pass      BOOLEAN;
    v_detail    TEXT;
    v_admin_id  BIGINT;
    v_coord_id  BIGINT;
    v_vol_id    BIGINT;
    v_event_id  BIGINT;
    v_event2_id BIGINT;
    v_post_id   BIGINT;
    v_post2_id  BIGINT;
    v_qr_id     BIGINT;
    v_app_id    BIGINT;
    v_app2_id   BIGINT;
BEGIN
    -- All tests run inside a single cleanup subtransaction so zero rows
    -- (including automatic audit_logs rows) remain after execution.
    BEGIN
        -- Test 1: Invalid blood type rejected
        BEGIN
            INSERT INTO users (phone_hash, phone_enc, display_name, blood_type)
            VALUES (repeat('1', 64), 'test_enc_1', 'Test User 1', 'O_POS');
            v_pass := FALSE; v_detail := 'Should have raised ck_users_blood_type';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_users_blood_type'::TEXT, v_pass, v_detail;

        -- Test 2: Invalid account status rejected
        BEGIN
            INSERT INTO users (phone_hash, phone_enc, display_name, account_status)
            VALUES (repeat('2', 64), 'test_enc_2', 'Test User 2', 'banana');
            v_pass := FALSE; v_detail := 'Should have raised ck_users_account_status';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_users_account_status'::TEXT, v_pass, v_detail;

        -- Test 3: Donation consistency enforced
        BEGIN
            INSERT INTO users (phone_hash, phone_enc, display_name,
                               is_willing_to_donate, is_willing_to_donate_blood)
            VALUES (repeat('3', 64), 'test_enc_3', 'Test User 3', FALSE, TRUE);
            v_pass := FALSE; v_detail := 'Should have raised ck_users_donation_consistency';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_users_donation_consistency'::TEXT, v_pass, v_detail;

        -- Setup temporary admin, verified coordinator, and volunteer
        INSERT INTO users (phone_hash, phone_enc, display_name, is_admin, verification_status)
        VALUES (repeat('a', 64), 'enc_admin', 'SelfTest Admin', TRUE, 'verified')
        RETURNING id INTO v_admin_id;

        INSERT INTO users (phone_hash, phone_enc, display_name, is_admin, verification_status)
        VALUES (repeat('c', 64), 'enc_coord', 'SelfTest Coordinator', FALSE, 'verified')
        RETURNING id INTO v_coord_id;

        INSERT INTO users (phone_hash, phone_enc, display_name, is_admin, verification_status)
        VALUES (repeat('b', 64), 'enc_vol', 'SelfTest Volunteer', FALSE, 'verified')
        RETURNING id INTO v_vol_id;

        -- Coordinator profile starts as pending and is approved by admin
        INSERT INTO coordinator_profiles (user_id) VALUES (v_coord_id);
        UPDATE coordinator_profiles
           SET status = 'approved', approved_by_id = v_admin_id, approved_at = now()
         WHERE user_id = v_coord_id;

        -- Test 4: Availability time order enforced
        BEGIN
            INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time)
            VALUES (v_vol_id, 1, TIME '17:00', TIME '09:00');
            v_pass := FALSE; v_detail := 'Should have raised ck_availability_time_order';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_availability_time_order'::TEXT, v_pass, v_detail;

        -- Test 5: Event time order enforced
        BEGIN
            INSERT INTO events (owner_id, current_coordinator_id, title, start_at, end_at)
            VALUES (v_coord_id, v_coord_id, 'Bad Time Event',
                    now() + INTERVAL '2 hours', now() + INTERVAL '1 hour');
            v_pass := FALSE; v_detail := 'Should have raised ck_events_time';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_events_time'::TEXT, v_pass, v_detail;

        -- Test 6: Map provider enum enforced
        BEGIN
            INSERT INTO events (owner_id, current_coordinator_id, title, start_at, end_at, map_provider)
            VALUES (v_coord_id, v_coord_id, 'Bad Map Provider Event',
                    now() + INTERVAL '1 hour', now() + INTERVAL '4 hours', 'mapbox');
            v_pass := FALSE; v_detail := 'Should have raised ck_events_map_provider';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_events_map_provider'::TEXT, v_pass, v_detail;

        -- Create a valid event and open post
        INSERT INTO events (owner_id, current_coordinator_id, title, start_at, end_at,
                            acceptance_mode, auto_assign_enabled, require_onboarding_ack)
        VALUES (v_coord_id, v_coord_id, 'Valid SelfTest Event',
                now() + INTERVAL '1 hour', now() + INTERVAL '4 hours',
                'auto', TRUE, FALSE)
        RETURNING id INTO v_event_id;

        INSERT INTO event_posts (event_id, title, required_headcount)
        VALUES (v_event_id, 'General Support', 2)
        RETURNING id INTO v_post_id;

        -- Test 7: QR used_count cannot exceed max_uses
        INSERT INTO qr_tokens (event_id, created_by_id, purpose, token_hash, max_uses, expires_at)
        VALUES (v_event_id, v_coord_id, 'checkin', repeat('d', 64), 2, now() + INTERVAL '5 hours')
        RETURNING id INTO v_qr_id;

        BEGIN
            UPDATE qr_tokens SET used_count = 3 WHERE id = v_qr_id;
            v_pass := FALSE; v_detail := 'Should have raised ck_qr_used_count';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_qr_used_count'::TEXT, v_pass, v_detail;

        -- Publish and activate event, auto-assign volunteer, and test overlapping shift exclusion
        UPDATE events SET status = 'published' WHERE id = v_event_id;
        UPDATE events SET status = 'active'    WHERE id = v_event_id;

        INSERT INTO event_applications (event_id, post_id, user_id, source)
        VALUES (v_event_id, v_post_id, v_vol_id, 'browse')
        RETURNING id INTO v_app_id;

        -- Test 8: Overlapping assignment at a second concurrent event is rejected
        INSERT INTO events (owner_id, current_coordinator_id, title, start_at, end_at,
                            acceptance_mode, auto_assign_enabled)
        VALUES (v_coord_id, v_coord_id, 'Overlapping Event',
                now() + INTERVAL '2 hours', now() + INTERVAL '5 hours',
                'manual', FALSE)
        RETURNING id INTO v_event2_id;

        INSERT INTO event_posts (event_id, title, required_headcount)
        VALUES (v_event2_id, 'Overlap Post', 2)
        RETURNING id INTO v_post2_id;

        UPDATE events SET status = 'published' WHERE id = v_event2_id;

        BEGIN
            INSERT INTO event_applications (event_id, post_id, user_id, source)
            VALUES (v_event2_id, v_post2_id, v_vol_id, 'browse')
            RETURNING id INTO v_app2_id;
            v_pass := FALSE; v_detail := 'Should have raised schedule_conflict';
        EXCEPTION WHEN raise_exception THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'schedule_conflict_guard'::TEXT, v_pass, v_detail;

        -- Check in volunteer at Event 1 and transition Event 1 to completed
        PERFORM qr_check_in(repeat('d', 64), v_vol_id);
        UPDATE events SET status = 'completed' WHERE id = v_event_id;

        -- Test 9: Feedback score range enforced (volunteer attended & event completed)
        BEGIN
            INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score)
            VALUES (v_event_id, v_vol_id, NULL, 'volunteer_to_event', 9);
            v_pass := FALSE; v_detail := 'Should have raised ck_feedback_score';
        EXCEPTION WHEN check_violation THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'ck_feedback_score'::TEXT, v_pass, v_detail;

        -- Test 10: Audit logs are immutable (runs inside cleanup block so no row persists)
        BEGIN
            INSERT INTO audit_logs (action, entity_type, entity_id)
            VALUES ('__selftest_audit__', 'test', 1);
            UPDATE audit_logs SET action = 'modified'
             WHERE action = '__selftest_audit__' AND entity_type = 'test';
            v_pass := FALSE; v_detail := 'Should have raised append_only';
        EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
            v_pass := TRUE; v_detail := SQLERRM;
        END;
        RETURN QUERY SELECT 'audit_logs_immutable'::TEXT, v_pass, v_detail;

        -- Roll back all temporary setup and audit_logs rows while keeping RETURN QUERY rows
        RAISE EXCEPTION '__selftest_cleanup__';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> '__selftest_cleanup__' THEN
            RETURN QUERY SELECT 'selftest_setup'::TEXT, FALSE, SQLERRM;
        END IF;
    END;

    RETURN;
END;
$$;

COMMIT;

-- =============================================================================
-- POST-LOAD VERIFICATION QUERIES (Run manually to inspect object counts)
-- =============================================================================
-- SELECT * FROM self_test();
--
-- SELECT 'check_constraints' AS what, COUNT(*) FROM pg_constraint
--   WHERE connamespace='public'::regnamespace AND contype='c' AND conname LIKE 'ck_%'
-- UNION ALL SELECT 'unique_constraints', COUNT(*) FROM pg_constraint
--   WHERE connamespace='public'::regnamespace AND contype='u' AND conname LIKE 'uq_%'
-- UNION ALL SELECT 'uq_indexes', COUNT(*) FROM pg_indexes
--   WHERE schemaname='public' AND indexname LIKE 'uq_%'
-- UNION ALL SELECT 'gin_indexes', COUNT(*) FROM pg_indexes
--   WHERE schemaname='public' AND indexdef LIKE '%USING gin%'
-- UNION ALL SELECT 'exclude_constraints', COUNT(*) FROM pg_constraint
--   WHERE connamespace='public'::regnamespace AND contype='x'
-- UNION ALL SELECT 'triggers', COUNT(*) FROM pg_trigger
--   WHERE tgname LIKE 'trg_%'
-- UNION ALL SELECT 'functions', COUNT(*) FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
-- UNION ALL SELECT 'views', COUNT(*) FROM pg_views
--   WHERE schemaname = 'public';
-- =============================================================================