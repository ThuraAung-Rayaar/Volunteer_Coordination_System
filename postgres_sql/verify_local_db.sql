-- =============================================================================
-- Local Database Detailed Inspection & Verification Script
-- File: postgres_sql/verify_local_db.sql
-- Run with:
--   psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql\verify_local_db.sql -o db_verification_result.txt
-- =============================================================================

\echo '========================================================================'
\echo '1. DATABASE & SERVER INFO'
\echo '========================================================================'
SELECT current_database() AS database, current_user AS user, version();

\echo ''
\echo '========================================================================'
\echo '2. AUTH_OTP_CHALLENGE TABLE STRUCTURE'
\echo '========================================================================'
\d+ auth_otp_challenge

\echo ''
\echo '========================================================================'
\echo '3. COLUMNS & DATA TYPES (auth_otp_challenge)'
\echo '========================================================================'
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'auth_otp_challenge'
 ORDER BY ordinal_position;

\echo ''
\echo '========================================================================'
\echo '4. CONSTRAINTS (auth_otp_challenge)'
\echo '========================================================================'
SELECT conname AS constraint_name,
       contype AS constraint_type,
       pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.auth_otp_challenge'::regclass;

\echo ''
\echo '========================================================================'
\echo '5. INDEXES (auth_otp_challenge)'
\echo '========================================================================'
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'auth_otp_challenge';

\echo ''
\echo '========================================================================'
\echo '6. TRIGGERS (auth_otp_challenge)'
\echo '========================================================================'
SELECT tgname AS trigger_name,
       tgenabled AS is_enabled,
       pg_get_triggerdef(oid) AS trigger_definition
  FROM pg_trigger
 WHERE tgrelid = 'public.auth_otp_challenge'::regclass;

\echo ''
\echo '========================================================================'
\echo '7. OTP CHALLENGE STORED FUNCTIONS'
\echo '========================================================================'
SELECT proname AS function_name,
       pg_get_function_arguments(oid) AS arguments,
       prorettype::regtype AS return_type
  FROM pg_proc
 WHERE proname IN ('create_otp_challenge', 'verify_otp_challenge', 'purge_expired_otp_challenges', 'purge_expired_otps')
   AND pronamespace = 'public'::regnamespace
 ORDER BY proname;

\echo ''
\echo '========================================================================'
\echo '8. ALL PUBLIC TABLES IN DATABASE'
\echo '========================================================================'
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_type = 'BASE TABLE'
 ORDER BY table_name;

\echo ''
\echo '========================================================================'
\echo '9. END-TO-END HANDSHAKE SMOKE TEST'
\echo '========================================================================'
DO $$
DECLARE
    v_otp_id   BIGINT;
    v_chal_id  BIGINT;
    v_status   TEXT;
    v_phone_h  TEXT;
    v_bound_id BIGINT;
    c_chal_h   TEXT := repeat('e', 64);
    c_code_h   TEXT := repeat('f', 64);
    c_ph_hash  TEXT := repeat('9', 64);
BEGIN
    RAISE NOTICE 'Starting Handshake Smoke Test...';

    -- Step 1: Insert mock parent auth_otp row
    INSERT INTO auth_otp (phone_hash, code_hash, purpose, expires_at)
    VALUES (c_ph_hash, c_code_h, 'login', now() + INTERVAL '5 minutes')
    RETURNING id INTO v_otp_id;
    RAISE NOTICE '[STEP 1 PASS] Inserted mock auth_otp row: id=%', v_otp_id;

    -- Step 2: Create challenge using stored function
    v_chal_id := create_otp_challenge(
        p_otp_id               => v_otp_id,
        p_challenge_token_hash => c_chal_h,
        p_ttl_seconds          => 180,
        p_purpose              => 'login'
    );
    RAISE NOTICE '[STEP 2 PASS] Created auth_otp_challenge: id=%', v_chal_id;

    -- Step 3: Verify challenge with correct code
    SELECT status, phone_hash, otp_id
      INTO v_status, v_phone_h, v_bound_id
      FROM verify_otp_challenge(c_chal_h, c_code_h, 'login');

    RAISE NOTICE '[STEP 3 PASS] verify_otp_challenge output: status=%, phone_hash=%, otp_id=%',
        v_status, v_phone_h, v_bound_id;

    IF v_status <> 'ok' OR v_bound_id <> v_otp_id THEN
        RAISE EXCEPTION 'TEST FAILED: Verification expected status=ok, got %', v_status;
    END IF;

    -- Step 4: Replay attack prevention check
    SELECT status INTO v_status FROM verify_otp_challenge(c_chal_h, c_code_h, 'login');
    RAISE NOTICE '[STEP 4 PASS] Replay attack attempt status: % (expected: challenge_consumed)', v_status;

    IF v_status <> 'challenge_consumed' THEN
        RAISE EXCEPTION 'TEST FAILED: Replay protection expected challenge_consumed, got %', v_status;
    END IF;

    -- Step 5: Clean up mock records
    DELETE FROM auth_otp WHERE id = v_otp_id;
    RAISE NOTICE '[STEP 5 PASS] Cleaned up mock test records.';
    RAISE NOTICE '>>> ALL OTP CHALLENGE SMOKE TESTS PASSED SUCCESSFULLY! <<<';
END;
$$;
