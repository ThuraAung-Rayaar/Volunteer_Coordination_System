-- =============================================================================
-- 00_preflight.sql
-- Disposable clone validation, safety gates, and pre-conditions
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    v_db TEXT := current_database();
    v_client_ip INET := inet_client_addr();
    v_admin_count INT;
    v_event_count INT;
BEGIN
    RAISE NOTICE '[PREFLIGHT] Checking target database safety...';

    -- Safety Gate 1: Check database name against dedicated disposable allowlist
    IF v_db NOT IN ('volunteer_coordination_db',
                    'ai_seed_volunteer_coordination_db',
                    'test_volunteer_coordination_db',
                    'ci_volunteer_coordination_db',
                    'ephemeral_volunteer_coordination_db') THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Target database "%" is NOT an approved database. Seeding refused.', v_db;
    END IF;

    -- Safety Gate 2: Local loopback host only (inet_client_addr is NULL for local unix socket / loopback)
    IF v_client_ip IS NOT NULL AND v_client_ip NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Non-local client IP "%" refused. Master seeding must run locally.', v_client_ip;
    END IF;

    -- Safety Gate 3: Check at least 2 active admins exist in target clone
    SELECT count(*) INTO v_admin_count FROM users WHERE is_admin AND is_active;
    IF v_admin_count < 2 THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Expected at least 2 active admin users, found %. Aborting.', v_admin_count;
    END IF;

    -- Safety Gate 4: Event capacity headroom check (< 185, hard stop before 200)
    -- Counts original non-synthetic baseline events to support idempotent re-runs
    SELECT count(*) INTO v_event_count FROM events WHERE title NOT LIKE '%[SYNTHETIC]%';
    IF v_event_count >= 185 THEN
        RAISE EXCEPTION '[SAFETY REFUSAL] Baseline already has % events (target is 185). Aborting to prevent exceeding bounds.', v_event_count;
    END IF;

    RAISE NOTICE '[PREFLIGHT] Target clone "%" passed all preflight gates. Active admins: %, Baseline non-synth events: %',
        v_db, v_admin_count, v_event_count;
END;
$$;

-- Acquire transaction-scoped advisory lock (namespace: ai_seed)
SELECT pg_advisory_xact_lock(hashtext('ai_seed_master_lock'));

-- Temporary lookup tables for stable synthetic keys within this psql session
CREATE TEMP TABLE IF NOT EXISTS temp_synth_users (
    cohort_tag TEXT PRIMARY KEY,
    user_id BIGINT,
    phone_hash TEXT UNIQUE,
    home_area TEXT,
    cluster TEXT,
    role_type TEXT,
    verification_status TEXT
);

CREATE TEMP TABLE IF NOT EXISTS temp_synth_events (
    cohort_key TEXT PRIMARY KEY,
    event_id BIGINT,
    cluster TEXT,
    lifecycle TEXT,
    owner_tag TEXT,
    coord_tag TEXT
);
