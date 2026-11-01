-- =============================================================================
-- Self-test for updated_volunteer_coordination_system_Database.sql (v0.5.2 Unified)
-- Run AFTER the schema, on a scratch database:
--     psql -v ON_ERROR_STOP=1 -d <scratch_db> -f volunteer_coordination_system_postgres_v0_5_2_selftest.sql
-- Everything runs in one transaction and is ROLLED BACK at the end, so the
-- database is left clean. Each check prints "ok: ..."; the first failure stops
-- the script with "SELFTEST FAILED: ...".
-- =============================================================================
BEGIN;

CREATE FUNCTION pg_temp.ok(p_cond BOOLEAN, p_msg TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    IF p_cond IS NOT TRUE THEN
        RAISE EXCEPTION 'SELFTEST FAILED: %', p_msg;
    END IF;
    RAISE NOTICE 'ok: %', p_msg;
END;
$$;

-- Runs a statement that MUST fail with a message containing p_pattern
CREATE FUNCTION pg_temp.expect_error(p_sql TEXT, p_pattern TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'SELFTEST FAILED: no error raised by: %', p_sql;
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SELFTEST FAILED%' THEN RAISE; END IF;
    IF position(lower(p_pattern) IN lower(SQLERRM)) = 0 THEN
        RAISE EXCEPTION 'SELFTEST FAILED: wrong error for [%]: got [%], expected to contain [%]',
            p_sql, SQLERRM, p_pattern;
    END IF;
    RAISE NOTICE 'ok: rejected as expected (%)', p_pattern;
END;
$$;

CREATE FUNCTION pg_temp.act(p_user BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_user::TEXT, ''), true);
END;
$$;

CREATE FUNCTION pg_temp.mk_user(p_name TEXT, p_n INTEGER, p_admin BOOLEAN DEFAULT FALSE, p_leader BOOLEAN DEFAULT FALSE)
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO users (phone_hash, phone_enc, display_name, is_admin, has_leader_experience)
    VALUES (repeat('a', 31) || p_n::TEXT, 'enc', p_name, p_admin, p_leader)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE FUNCTION pg_temp.mk_coordinator(p_user BIGINT, p_admin BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO user_verification_images (user_id, image_type, image_path, file_sha256)
    VALUES (p_user, 'mock_selfie', 'v/' || p_user || '_s.jpg', repeat('a', 64)),
           (p_user, 'id_license',  'v/' || p_user || '_i.jpg', repeat('b', 64));
    PERFORM pg_temp.act(p_admin);
    UPDATE user_verification_images
       SET status = 'approved', reviewed_by_id = p_admin, reviewed_at = now()
     WHERE user_id = p_user;
    PERFORM pg_temp.ok((SELECT verification_status FROM users WHERE id = p_user) = 'verified',
                       'verification_status becomes verified from approved images');
    INSERT INTO coordinator_profiles (user_id) VALUES (p_user);
    UPDATE coordinator_profiles SET status = 'approved', approved_by_id = p_admin WHERE user_id = p_user;
    PERFORM pg_temp.act(NULL);
END;
$$;

DO $$
DECLARE
    v_admin  BIGINT; v_c1 BIGINT; v_c2 BIGINT;
    v_v1 BIGINT; v_v2 BIGINT; v_v3 BIGINT; v_v4 BIGINT; v_walkin BIGINT;
    v_event  BIGINT; v_post BIGINT;
    v_att1   BIGINT; v_att2 BIGINT;
    v_res    TEXT;
    v_n      INTEGER;
    v_token  BIGINT;
    v_walkin_token BIGINT;
    v_walkin_app   BIGINT;
    v_avail  BOOLEAN;
BEGIN
    -- ---------------------------------------------------------------- people
    v_admin := pg_temp.mk_user('Admin', 1, TRUE);
    v_c1    := pg_temp.mk_user('Coordinator One', 2);
    v_c2    := pg_temp.mk_user('Coordinator Two', 3);
    v_v1    := pg_temp.mk_user('Volunteer One', 4, FALSE, TRUE);
    v_v2    := pg_temp.mk_user('Volunteer Two', 5);
    v_v3    := pg_temp.mk_user('Volunteer Three', 6);
    v_v4    := pg_temp.mk_user('Volunteer Four', 7);
    v_walkin := pg_temp.mk_user('Walk-in Volunteer', 8);

    PERFORM pg_temp.mk_coordinator(v_c1, v_admin);
    PERFORM pg_temp.mk_coordinator(v_c2, v_admin);

    -- ============================================= AVAILABILITY TESTS (NEW)
    -- Test: availability time order enforced
    PERFORM pg_temp.expect_error(
        format('INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time) VALUES (%s, 1, TIME ''17:00'', TIME ''09:00'')', v_v1),
        'ck_availability_time_order');

    -- Test: availability weekday range enforced
    PERFORM pg_temp.expect_error(
        format('INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time) VALUES (%s, 9, TIME ''09:00'', TIME ''17:00'')', v_v1),
        'ck_availability_weekday');

    -- Test: availability exception time pair enforced
    PERFORM pg_temp.expect_error(
        format('INSERT INTO volunteer_availability_exceptions (user_id, date, is_available, start_time) VALUES (%s, CURRENT_DATE, TRUE, TIME ''09:00'')', v_v1),
        'ck_availability_exception_times');

    -- Test: duplicate availability rule rejected
    INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time)
    VALUES (v_v1, 1, TIME '09:00', TIME '17:00');
    PERFORM pg_temp.expect_error(
        format('INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time) VALUES (%s, 1, TIME ''09:00'', TIME ''18:00'')', v_v1),
        'uq_availability_rule');

    -- Test: duplicate availability exception rejected
    INSERT INTO volunteer_availability_exceptions (user_id, date, is_available)
    VALUES (v_v1, '2027-01-15', FALSE);
    PERFORM pg_temp.expect_error(
        format('INSERT INTO volunteer_availability_exceptions (user_id, date, is_available) VALUES (%s, ''2027-01-15'', TRUE)', v_v1),
        'uq_availability_exception');

    -- Test: is_user_available with no rules returns TRUE (available by default)
    v_avail := is_user_available(v_v2, now() + INTERVAL '1 day', now() + INTERVAL '1 day 2 hours');
    PERFORM pg_temp.ok(v_avail = TRUE, 'is_user_available returns TRUE when no rules exist');

    -- Test: is_user_available with matching rule returns TRUE
    -- v_v1 has a Monday 09:00-17:00 rule. Find next Monday.
    v_avail := is_user_available(v_v1,
        date_trunc('week', now()) + INTERVAL '7 days' + TIME '10:00',
        date_trunc('week', now()) + INTERVAL '7 days' + TIME '12:00');
    PERFORM pg_temp.ok(v_avail = TRUE, 'is_user_available returns TRUE for time within rule window');

    -- Test: is_user_available with exception blocking returns FALSE
    INSERT INTO volunteer_availability_exceptions (user_id, date, is_available)
    VALUES (v_v1, (date_trunc('week', now()) + INTERVAL '7 days')::DATE, FALSE);
    v_avail := is_user_available(v_v1,
        date_trunc('week', now()) + INTERVAL '7 days' + TIME '10:00',
        date_trunc('week', now()) + INTERVAL '7 days' + TIME '12:00');
    PERFORM pg_temp.ok(v_avail = FALSE, 'is_user_available returns FALSE when exception blocks');

    -- ============================================= PRIVILEGE PROTECTION
    PERFORM pg_temp.expect_error(
        format('UPDATE users SET is_staff = TRUE WHERE id = %s', v_v1), 'ck_users_admin_flags');

    PERFORM pg_temp.act(v_v1);
    PERFORM pg_temp.expect_error(
        format('UPDATE users SET is_admin = TRUE WHERE id = %s', v_v1), 'permission_denied');
    PERFORM pg_temp.act(NULL);

    -- ============================================= EVENT CREATION
    PERFORM pg_temp.act(v_c1);
    INSERT INTO events (owner_id, title, start_at, end_at, acceptance_mode, max_participants,
                        group_size, leader_strategy, latitude, longitude, geo_radius_m,
                        geo_checkin_enabled, onboarding_text, map_provider)
    VALUES (v_c1, 'Food drive', now() + INTERVAL '10 minutes', now() + INTERVAL '4 hours',
            'auto', 10, 2, 'first_experienced', 1.352100, 103.819800, 100, TRUE, 'Be kind',
            'openstreetmap')
    RETURNING id INTO v_event;

    PERFORM pg_temp.ok((SELECT status FROM events WHERE id = v_event) = 'draft', 'new event starts as draft');
    PERFORM pg_temp.ok((SELECT current_coordinator_id FROM events WHERE id = v_event) = v_c1,
                       'current coordinator defaults to the owner');
    PERFORM pg_temp.ok((SELECT map_provider FROM events WHERE id = v_event) = 'openstreetmap',
                       'map_provider defaults to openstreetmap');

    -- Test: invalid map_provider rejected
    PERFORM pg_temp.expect_error(
        format('INSERT INTO events (owner_id, title, start_at, end_at, map_provider) VALUES (%s, ''Bad Map'', now() + INTERVAL ''1 hour'', now() + INTERVAL ''2 hours'', ''mapbox'')', v_c1),
        'ck_events_map_provider');

    INSERT INTO event_posts (event_id, title, required_headcount) VALUES (v_event, 'Packers', 5)
    RETURNING id INTO v_post;

    PERFORM pg_temp.act(v_v1);
    PERFORM pg_temp.expect_error(
        format('UPDATE events SET status = ''published'' WHERE id = %s', v_event), 'permission_denied');

    PERFORM pg_temp.act(v_c1);
    UPDATE events SET status = 'published' WHERE id = v_event;
    PERFORM pg_temp.ok((SELECT published_at IS NOT NULL FROM events WHERE id = v_event), 'publish sets published_at');

    -- ============================================= APPLICATIONS (AUTO MODE)
    PERFORM pg_temp.act(v_v1);
    INSERT INTO event_applications (event_id, user_id) VALUES (v_event, v_v1);
    PERFORM pg_temp.ok((SELECT status FROM event_applications WHERE event_id = v_event AND user_id = v_v1) = 'accepted',
                       'auto mode accepts the application');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM assignments WHERE event_id = v_event AND user_id = v_v1 AND is_group_leader),
                       'auto-assignment created the assignment; experienced volunteer leads group G1');
    PERFORM pg_temp.ok((SELECT status FROM attendance WHERE event_id = v_event AND user_id = v_v1) = 'expected',
                       'attendance row created as expected');

    PERFORM pg_temp.expect_error(
        format('INSERT INTO event_applications (event_id, user_id) VALUES (%s, %s)', v_event, v_v1),
        'uq_event_application_active');

    PERFORM pg_temp.act(v_v2);
    INSERT INTO event_applications (event_id, user_id) VALUES (v_event, v_v2);
    PERFORM pg_temp.act(v_v3);
    INSERT INTO event_applications (event_id, user_id) VALUES (v_event, v_v3);
    PERFORM pg_temp.act(v_v4);
    INSERT INTO event_applications (event_id, user_id) VALUES (v_event, v_v4);

    PERFORM pg_temp.ok((SELECT group_code FROM assignments WHERE event_id = v_event AND user_id = v_v2) = 'G1'
                       AND (SELECT group_code FROM assignments WHERE event_id = v_event AND user_id = v_v3) = 'G2',
                       'groups are filled in order of group_size');

    -- ============================================= STATE MACHINE
    PERFORM pg_temp.act(v_c1);
    UPDATE events SET status = 'active' WHERE id = v_event;
    PERFORM pg_temp.expect_error(
        format('UPDATE events SET status = ''published'' WHERE id = %s', v_event), 'invalid_transition');
    PERFORM pg_temp.expect_error(
        format('UPDATE events SET owner_id = %s WHERE id = %s', v_c2, v_event), 'owner of an event');

    -- Test: lifecycle timestamps match status (ck_events_status_timestamps)
    PERFORM pg_temp.ok((SELECT activated_at IS NOT NULL FROM events WHERE id = v_event),
                       'active event has activated_at set');
    PERFORM pg_temp.ok((SELECT completed_at IS NULL FROM events WHERE id = v_event),
                       'active event has completed_at NULL');

    -- ============================================= WALK-IN QR FLOW (NEW)
    PERFORM pg_temp.act(v_c1);
    INSERT INTO qr_tokens (event_id, created_by_id, purpose, token_hash, max_uses, expires_at)
    VALUES (v_event, v_c1, 'walkin_registration', repeat('w', 64), 10, now() + INTERVAL '2 hours')
    RETURNING id INTO v_walkin_token;

    -- Walk-in volunteer applies via QR
    PERFORM pg_temp.act(v_walkin);
    v_walkin_app := qr_walkin_apply(repeat('w', 64), v_walkin);
    PERFORM pg_temp.ok((SELECT status FROM event_applications WHERE id = v_walkin_app) = 'pending',
                       'walk-in application stays pending even in auto mode');
    PERFORM pg_temp.ok((SELECT source FROM event_applications WHERE id = v_walkin_app) = 'qr_walkin',
                       'walk-in application has source qr_walkin');

    -- Coordinator accepts the walk-in
    PERFORM pg_temp.act(v_c1);
    UPDATE event_applications SET status = 'accepted', decided_by_id = v_c1, decided_at = now()
    WHERE id = v_walkin_app;

    -- Walk-in attendance should have walk_in_flag = TRUE
    PERFORM pg_temp.ok((SELECT walk_in_flag FROM attendance WHERE event_id = v_event AND user_id = v_walkin) = TRUE,
                       'walk-in attendance has walk_in_flag = TRUE');

    -- Walk-in volunteer cannot use geo check-in
    PERFORM pg_temp.act(v_walkin);
    INSERT INTO onboarding_acknowledgments (user_id, event_id) VALUES (v_walkin, v_event);
    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_walkin, 1.3522, 103.8198, 15, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'not_eligible', 'walk-in volunteer geo check-in returns not_eligible');
    PERFORM pg_temp.act(NULL);

    -- ============================================= ONBOARDING GATE
    PERFORM pg_temp.act(v_v1);
    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v1, 1.3522, 103.8198, 15, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'onboarding_required', 'geo check-in refused until onboarding is acknowledged');
    INSERT INTO onboarding_acknowledgments (user_id, event_id) VALUES (v_v1, v_event);

    -- ============================================= GEO CHECK-IN
    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v1, 1.4000, 103.8198, 15, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'outside_geofence', 'far away fix is rejected');

    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v1, 1.3522, 103.8198, 500, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'low_accuracy', 'inaccurate fix is rejected');

    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v1, 1.3522, 103.8198, 15, now(), TRUE);
    PERFORM pg_temp.ok(v_res = 'mock_location', 'mock-location flag is rejected');

    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v1, 1.3522, 103.8198, 15, now() - INTERVAL '10 minutes', FALSE);
    PERFORM pg_temp.ok(v_res = 'stale_fix', 'stale fix is rejected');

    SELECT out_result, out_attendance_id INTO v_res, v_att1 FROM geo_check_in(v_event, v_v1, 1.3522, 103.8198, 15, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'accepted', 'nearby fix is accepted');
    PERFORM pg_temp.ok((SELECT confirmation_status FROM attendance WHERE id = v_att1) = 'pending',
                       'geo check-in waits for coordinator confirmation');
    PERFORM pg_temp.ok((SELECT count(*) FROM attendance_geo_attempts WHERE event_id = v_event AND user_id = v_v1) >= 6,
                       'every attempt is logged, including failures');

    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v1, 1.3522, 103.8198, 15, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'already_checked_in', 'repeat geo check-in is idempotent');

    PERFORM pg_temp.act(v_v1);
    PERFORM pg_temp.expect_error(
        format('SELECT confirm_attendance(%s, %s)', v_att1, v_v1), 'permission_denied');
    PERFORM pg_temp.act(NULL);

    PERFORM confirm_attendance(v_att1, v_c1, 'seen on site');
    PERFORM pg_temp.ok((SELECT confirmation_status FROM attendance WHERE id = v_att1) = 'confirmed',
                       'coordinator confirms the check-in');

    -- reject path
    PERFORM pg_temp.act(v_v2);
    INSERT INTO onboarding_acknowledgments (user_id, event_id) VALUES (v_v2, v_event);
    SELECT out_result, out_attendance_id INTO v_res, v_att2 FROM geo_check_in(v_event, v_v2, 1.3521, 103.8199, 10, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'accepted', 'second volunteer checks in by geo');
    PERFORM pg_temp.act(NULL);

    PERFORM reject_attendance(v_att2, v_c1, 'not at the gate');
    PERFORM pg_temp.ok((SELECT status FROM attendance WHERE id = v_att2) = 'expected'
                       AND (SELECT confirmation_status FROM attendance WHERE id = v_att2) = 'rejected'
                       AND (SELECT checkin_latitude FROM attendance WHERE id = v_att2) IS NULL,
                       'rejection resets attendance and clears the evidence');

    PERFORM pg_temp.act(v_v2);
    SELECT out_result INTO v_res FROM geo_check_in(v_event, v_v2, 1.3521, 103.8199, 10, now(), FALSE);
    PERFORM pg_temp.ok(v_res = 'accepted', 'volunteer can try again after a rejection');
    PERFORM pg_temp.act(NULL);

    -- ============================================= QR CHECK-IN
    PERFORM pg_temp.act(v_c1);
    INSERT INTO qr_tokens (event_id, created_by_id, purpose, token_hash, max_uses, expires_at)
    VALUES (v_event, v_c1, 'checkin', repeat('b', 64), 1, now() + INTERVAL '1 hour')
    RETURNING id INTO v_token;

    PERFORM pg_temp.act(v_v3);
    INSERT INTO onboarding_acknowledgments (user_id, event_id) VALUES (v_v3, v_event);
    PERFORM qr_check_in(repeat('b', 64), v_v3);
    PERFORM qr_check_in(repeat('b', 64), v_v3);
    PERFORM pg_temp.ok((SELECT used_count FROM qr_tokens WHERE id = v_token) = 1,
                       'a repeat QR scan does not spend another use');

    PERFORM pg_temp.act(v_v4);
    INSERT INTO onboarding_acknowledgments (user_id, event_id) VALUES (v_v4, v_event);
    PERFORM pg_temp.expect_error(
        format('SELECT qr_check_in(%L, %s)', repeat('b', 64), v_v4), 'qr_token_invalid');
    PERFORM pg_temp.act(NULL);

    -- ============================================= ATTENDANCE CANCELLED STATUS (NEW)
    -- Cancel an assignment and verify attendance goes to cancelled
    PERFORM pg_temp.act(v_c1);
    UPDATE assignments SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'test cancel'
    WHERE event_id = v_event AND user_id = v_v4;
    PERFORM pg_temp.ok((SELECT status FROM attendance WHERE event_id = v_event AND user_id = v_v4) = 'cancelled',
                       'assignment cancellation sets attendance to cancelled');
    PERFORM pg_temp.act(NULL);

    -- ============================================= COORDINATOR HANDOVER
    PERFORM pg_temp.act(v_v1);
    PERFORM pg_temp.expect_error(
        format('SELECT change_event_coordinator(%s, %s, %s)', v_event, v_c2, v_v1), 'permission_denied');
    PERFORM pg_temp.act(NULL);

    PERFORM change_event_coordinator(v_event, v_c2, v_c1, 'handover');
    PERFORM pg_temp.ok((SELECT owner_id FROM events WHERE id = v_event) = v_c1
                       AND (SELECT current_coordinator_id FROM events WHERE id = v_event) = v_c2,
                       'owner is unchanged, current coordinator is handed over');
    PERFORM pg_temp.ok((SELECT count(*) FROM event_coordinator_history WHERE event_id = v_event) = 2,
                       'handover is recorded in history');

    -- ============================================= COMPLETE + FEEDBACK
    PERFORM pg_temp.act(v_c2);
    UPDATE events SET status = 'completed' WHERE id = v_event;
    PERFORM pg_temp.act(NULL);

    PERFORM pg_temp.ok((SELECT status FROM attendance WHERE event_id = v_event AND user_id = v_v1) = 'completed'
                       AND (SELECT status FROM attendance WHERE event_id = v_event AND user_id = v_v4) = 'cancelled'
                       AND (SELECT status FROM assignments WHERE event_id = v_event AND user_id = v_v1) = 'completed',
                       'completion cascades: present = completed, cancelled stays cancelled');

    -- Test: lifecycle timestamps after completion
    PERFORM pg_temp.ok((SELECT completed_at IS NOT NULL FROM events WHERE id = v_event),
                       'completed event has completed_at set');

    PERFORM pg_temp.expect_error(
        format('UPDATE events SET title = ''x'' WHERE id = %s', v_event), 'event_frozen');

    PERFORM pg_temp.act(v_v1);
    INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score)
    VALUES (v_event, v_v1, v_c2, 'volunteer_to_coordinator', 5);

    PERFORM pg_temp.act(v_v4);
    PERFORM pg_temp.expect_error(
        format('INSERT INTO feedback (event_id, rater_user_id, direction, score) VALUES (%s, %s, ''volunteer_to_event'', 4)',
               v_event, v_v4), 'rater_not_participant');

    PERFORM pg_temp.act(v_c2);
    INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score)
    VALUES (v_event, v_c2, v_v1, 'coordinator_to_volunteer', 4);
    PERFORM pg_temp.act(NULL);

    -- ============================================= MODERATION
    PERFORM pg_temp.act(v_admin);
    INSERT INTO moderation_actions (admin_user_id, target_user_id, action_type, reason)
    VALUES (v_admin, v_v4, 'user_block', 'test');
    PERFORM pg_temp.ok((SELECT account_status FROM users WHERE id = v_v4) = 'blocked'
                       AND NOT (SELECT is_active FROM users WHERE id = v_v4),
                       'moderation insert applies the block and keeps is_active in sync');

    PERFORM pg_temp.act(v_v4);
    PERFORM pg_temp.expect_error(
        format('UPDATE users SET account_status = ''active'', blocked_until = NULL WHERE id = %s', v_v4),
        'permission_denied');
    PERFORM pg_temp.act(NULL);

    -- ============================================= AUDIT
    PERFORM pg_temp.ok((SELECT count(*) FROM audit_logs) > 20, 'audit trail is written automatically');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM audit_logs WHERE after_data ? 'checkin_latitude'
                                    OR before_data ? 'checkin_latitude'),
                       'coordinates never appear in the audit trail');
    PERFORM pg_temp.expect_error('UPDATE audit_logs SET action = ''x''', 'append_only');

    RAISE NOTICE 'ALL SELFTESTS PASSED';
END;
$$;

ROLLBACK;