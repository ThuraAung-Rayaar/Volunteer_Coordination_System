-- =============================================================================
-- Migration: v0.12.0 Additive Upgrade — OTP Challenge Table & Stored Functions
-- File: postgres_sql/v0_12_0_auth_otp_challenge_upgrade.sql
-- Target Database: PostgreSQL 18+ (Volunteer Coordination System)
-- Purpose:
--   Implements Phase 1 (AUTH-01, AUTH-04) of v0.12.0 Backend-Client Handshake Plan.
--   Adds auth_otp_challenge table bound to auth_otp.id with dual-clock expiry,
--   single-use consumption, deterministic row locking, and cryptographic key separation.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table: auth_otp_challenge
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_otp_challenge (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    otp_id               BIGINT NOT NULL REFERENCES auth_otp (id) ON DELETE CASCADE,
    challenge_token_hash TEXT NOT NULL UNIQUE,
    purpose              TEXT NOT NULL DEFAULT 'login',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL,
    consumed_at          TIMESTAMPTZ,
    request_id           TEXT,
    identity_nonce_hash  TEXT,

    CONSTRAINT ck_auth_otp_challenge_purpose
        CHECK (purpose IN ('login', 'qr_registration')),
    CONSTRAINT ck_auth_otp_challenge_token_hash_len
        CHECK (length(challenge_token_hash) = 64),
    CONSTRAINT ck_auth_otp_challenge_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT ck_auth_otp_challenge_consumed
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

-- Indexes for challenge lookups and expiry scans
CREATE INDEX IF NOT EXISTS idx_auth_otp_challenge_otp_id
    ON auth_otp_challenge (otp_id);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenge_expires
    ON auth_otp_challenge (expires_at)
    WHERE consumed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_otp_challenge_nonce
    ON auth_otp_challenge (identity_nonce_hash)
    WHERE identity_nonce_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Trigger Function: Enforce Challenge Expiry <= Parent auth_otp Expiry
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_auth_otp_challenge_before()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_otp auth_otp%ROWTYPE;
BEGIN
    SELECT * INTO v_otp FROM auth_otp WHERE id = NEW.otp_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_otp_reference: referenced auth_otp row (%) does not exist', NEW.otp_id;
    END IF;

    -- Invariant: Challenge expiry cannot exceed parent OTP expiry
    IF NEW.expires_at > v_otp.expires_at THEN
        RAISE EXCEPTION 'challenge_expiry_exceeds_otp: challenge expires_at (%) cannot exceed auth_otp expires_at (%)',
            NEW.expires_at, v_otp.expires_at;
    END IF;

    -- Invariant: Challenge purpose must match parent OTP purpose
    IF NEW.purpose <> v_otp.purpose THEN
        RAISE EXCEPTION 'purpose_mismatch: challenge purpose (%) must match auth_otp purpose (%)',
            NEW.purpose, v_otp.purpose;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_01_auth_otp_challenge_guard ON auth_otp_challenge;
CREATE TRIGGER trg_01_auth_otp_challenge_guard
    BEFORE INSERT OR UPDATE ON auth_otp_challenge
    FOR EACH ROW EXECUTE FUNCTION trg_auth_otp_challenge_before();

-- -----------------------------------------------------------------------------
-- 3. Stored Function: create_otp_challenge
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_otp_challenge(
    p_otp_id               BIGINT,
    p_challenge_token_hash TEXT,
    p_ttl_seconds          INTEGER DEFAULT 180,
    p_purpose              TEXT DEFAULT 'login',
    p_request_id           TEXT DEFAULT NULL,
    p_identity_nonce_hash  TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_otp          auth_otp%ROWTYPE;
    v_challenge_id BIGINT;
    v_expires_at   TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_otp FROM auth_otp WHERE id = p_otp_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_otp_reference: referenced auth_otp row (%) does not exist', p_otp_id;
    END IF;

    -- Capped at max 180s challenge TTL and parent OTP expiry: min(issued_at + 180s, otp.expires_at)
    v_expires_at := LEAST(now() + make_interval(secs => LEAST(p_ttl_seconds, 180)), v_otp.expires_at);

    INSERT INTO auth_otp_challenge (
        otp_id,
        challenge_token_hash,
        purpose,
        expires_at,
        request_id,
        identity_nonce_hash
    )
    VALUES (
        p_otp_id,
        p_challenge_token_hash,
        p_purpose,
        v_expires_at,
        p_request_id,
        p_identity_nonce_hash
    )
    RETURNING id INTO v_challenge_id;

    RETURN v_challenge_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Stored Function: verify_otp_challenge (Atomic, Deterministic Locking)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION verify_otp_challenge(
    p_challenge_token_hash TEXT,
    p_code_hash            TEXT,
    p_purpose              TEXT DEFAULT 'login'
)
RETURNS TABLE (
    status     TEXT,
    phone_hash TEXT,
    otp_id     BIGINT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_chal auth_otp_challenge%ROWTYPE;
    v_otp  auth_otp%ROWTYPE;
BEGIN
    -- Step 1: Deterministic locking order — lock challenge row first
    SELECT * INTO v_chal
      FROM auth_otp_challenge
     WHERE challenge_token_hash = p_challenge_token_hash
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'invalid_challenge'::TEXT, NULL::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Step 2: Purpose validation
    IF v_chal.purpose <> p_purpose THEN
        RETURN QUERY SELECT 'invalid_challenge'::TEXT, NULL::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Step 3: Lock linked parent auth_otp row
    SELECT * INTO v_otp
      FROM auth_otp
     WHERE id = v_chal.otp_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'invalid_challenge'::TEXT, NULL::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Step 4: Check consumption status (single-use constraint)
    IF v_chal.consumed_at IS NOT NULL OR v_otp.consumed_at IS NOT NULL THEN
        RETURN QUERY SELECT 'challenge_consumed'::TEXT, NULL::TEXT, v_chal.otp_id;
        RETURN;
    END IF;

    -- Step 5: Enforce dual expiry clocks
    IF v_chal.expires_at <= now() OR v_otp.expires_at <= now() THEN
        RETURN QUERY SELECT 'challenge_expired'::TEXT, NULL::TEXT, v_chal.otp_id;
        RETURN;
    END IF;

    -- Step 6: Enforce attempt limit
    IF v_otp.attempt_count >= setting_int('otp_max_attempts') THEN
        RETURN QUERY SELECT 'too_many_attempts'::TEXT, NULL::TEXT, v_chal.otp_id;
        RETURN;
    END IF;

    -- Step 7: Compare code hash
    IF v_otp.code_hash = p_code_hash THEN
        UPDATE auth_otp_challenge SET consumed_at = now() WHERE id = v_chal.id;
        UPDATE auth_otp SET consumed_at = now() WHERE id = v_otp.id;
        RETURN QUERY SELECT 'ok'::TEXT, v_otp.phone_hash, v_otp.id;
        RETURN;
    END IF;

    -- Wrong code: increment attempt counter on the exact bound auth_otp row
    UPDATE auth_otp SET attempt_count = attempt_count + 1 WHERE id = v_otp.id;
    RETURN QUERY SELECT 'invalid_code'::TEXT, NULL::TEXT, v_otp.id;
    RETURN;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Stored Functions: Retention & Cleanup
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION purge_expired_otp_challenges(p_retention INTERVAL DEFAULT INTERVAL '1 day')
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    -- Delete consumed or expired challenges older than retention threshold.
    -- Active challenges (unconsumed where expires_at >= now()) are never deleted.
    DELETE FROM auth_otp_challenge
     WHERE (consumed_at IS NOT NULL AND consumed_at < now() - p_retention)
        OR (expires_at < now() - p_retention);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION purge_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_n INTEGER;
BEGIN
    PERFORM purge_expired_otp_challenges(INTERVAL '1 day');
    DELETE FROM auth_otp
     WHERE expires_at < now() - INTERVAL '1 day'
        OR created_at < now() - INTERVAL '1 day';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

COMMIT;

-- =============================================================================
-- ROLLBACK SCRIPT (Execute only if rollback is required)
-- =============================================================================
/*
BEGIN;
DROP TRIGGER IF EXISTS trg_01_auth_otp_challenge_guard ON auth_otp_challenge;
DROP FUNCTION IF EXISTS trg_auth_otp_challenge_before();
DROP FUNCTION IF EXISTS verify_otp_challenge(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_otp_challenge(BIGINT, TEXT, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS purge_expired_otp_challenges(INTERVAL);
DROP TABLE IF EXISTS auth_otp_challenge CASCADE;
COMMIT;
*/
