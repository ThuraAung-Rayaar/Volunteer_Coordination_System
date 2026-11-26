--
-- PostgreSQL database dump
--

\restrict bLgVRfrwM4S4tzCu7wsiLoLWIFIIpnRmslKWxJCJi2uj8abYMWdU7fp3t1vGpBS

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: app_ip(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_ip() RETURNS inet
    LANGUAGE sql STABLE
    AS $$
    SELECT NULLIF(current_setting('app.ip', true), '')::INET
$$;


--
-- Name: app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_user_id() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::BIGINT
$$;


--
-- Name: application_remaining_capacity(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.application_remaining_capacity(p_event bigint, p_post bigint) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: assert_actor(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_actor(p_actor bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: assign_manually(bigint, bigint, bigint, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_manually(p_application bigint, p_post bigint, p_actor bigint, p_group_code text DEFAULT NULL::text, p_leader boolean DEFAULT false) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: change_event_coordinator(bigint, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_event_coordinator(p_event bigint, p_new_coordinator bigint, p_actor bigint, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: confirm_attendance(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_attendance(p_attendance bigint, p_actor bigint, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: consume_qr_token(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_qr_token(p_token bigint, p_purpose text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: create_assignment_from_application(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_assignment_from_application(p_application bigint, p_actor bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: create_otp_challenge(bigint, text, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_otp_challenge(p_otp_id bigint, p_challenge_token_hash text, p_ttl_seconds integer DEFAULT 180, p_purpose text DEFAULT 'login'::text, p_request_id text DEFAULT NULL::text, p_identity_nonce_hash text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: expire_stale_applications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_stale_applications() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: geo_check_in(bigint, bigint, double precision, double precision, double precision, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.geo_check_in(p_event bigint, p_user bigint, p_lat double precision, p_lon double precision, p_accuracy_m double precision, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_mocked boolean DEFAULT false) RETURNS TABLE(out_result text, out_attendance_id bigint, out_distance_m numeric, out_confirmation text)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: geo_distance_m(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.geo_distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) RETURNS double precision
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
    SELECT 2 * 6371000.0 * asin(least(1.0, sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2))))
$$;


--
-- Name: is_admin_user(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin_user(p_user bigint) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT COALESCE((SELECT u.is_admin AND u.is_active FROM users u WHERE u.id = p_user), FALSE)
$$;


--
-- Name: is_approved_coordinator(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_approved_coordinator(p_user bigint) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
          FROM coordinator_profiles cp
          JOIN users u ON u.id = cp.user_id
         WHERE cp.user_id = p_user AND cp.status = 'approved' AND u.is_active)
$$;


--
-- Name: is_event_manager(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_event_manager(p_event bigint, p_user bigint) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT is_admin_user(p_user)
        OR EXISTS (
            SELECT 1 FROM events ev
             WHERE ev.id = p_event
               AND p_user IN (ev.owner_id, ev.current_coordinator_id)
               AND is_approved_coordinator(p_user))
$$;


--
-- Name: is_user_available(bigint, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_available(p_user bigint, p_start timestamp with time zone, p_end timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
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


--
-- Name: purge_expired_otp_challenges(interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_otp_challenges(p_retention interval DEFAULT '1 day'::interval) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: purge_expired_otps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_otps() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: purge_geo_evidence(interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_geo_evidence(p_older_than interval DEFAULT '90 days'::interval) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: qr_check_in(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_check_in(p_token_hash text, p_user bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: qr_token_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_token_status(p_token_hash text) RETURNS TABLE(token_id bigint, token_event_id bigint, token_purpose text, is_valid boolean, reason text)
    LANGUAGE sql STABLE
    AS $$
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


--
-- Name: qr_walkin_apply(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.qr_walkin_apply(p_token_hash text, p_user bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: recompute_user_verification(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_user_verification(p_user bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: reject_attendance(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_attendance(p_attendance bigint, p_actor bigint, p_reason text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: release_expired_blocks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_expired_blocks() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: request_otp(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_otp(p_phone_hash text, p_code_hash text, p_purpose text DEFAULT 'login'::text) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: run_auto_assignment(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_auto_assignment(p_event bigint, p_actor bigint DEFAULT NULL::bigint) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: self_test(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.self_test() RETURNS TABLE(test_name text, passed boolean, detail text)
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


--
-- Name: setting_int(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.setting_int(p_key text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT value_int FROM app_settings WHERE key = p_key
$$;


--
-- Name: tags_are_normalized(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tags_are_normalized(tags text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT COALESCE(cardinality(tags) <= 30, FALSE)
       AND NOT EXISTS (
            SELECT 1 FROM unnest(tags) AS t(tag)
             WHERE t.tag IS NULL
                OR t.tag = ''
                OR t.tag <> lower(btrim(t.tag))
                OR char_length(t.tag) > 50)
$$;


--
-- Name: trg_applications_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_applications_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_applications_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_applications_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_applications_before_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_applications_before_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_assignments_after_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_assignments_after_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_assignments_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_assignments_after_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_assignments_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_assignments_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_assignments_before_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_assignments_before_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_attendance_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_attendance_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status <> 'expected' THEN
        RAISE EXCEPTION 'invalid_state: attendance is created as expected when a volunteer is assigned';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_attendance_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_attendance_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_audit_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_audit_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_auth_otp_challenge_before(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_auth_otp_challenge_before() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_block_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_block_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'append_only: rows in % cannot be %d', TG_TABLE_NAME, lower(TG_OP)
        USING ERRCODE = '42501';
    RETURN NULL;
END;
$$;


--
-- Name: trg_coordinator_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_coordinator_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_events_after_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_events_after_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO event_coordinator_history (event_id, from_coordinator_id, to_coordinator_id, changed_by_user_id, reason)
    VALUES (NEW.id, NULL, NEW.current_coordinator_id, app_user_id(), 'initial coordinator');
    RETURN NULL;
END;
$$;


--
-- Name: trg_events_after_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_events_after_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_events_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_events_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_events_before_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_events_before_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_feedback_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_feedback_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_geo_attempts_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_geo_attempts_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_moderation_after_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_moderation_after_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_moderation_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_moderation_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_onboarding_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_onboarding_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_otp_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_otp_rate_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_posts_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_posts_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_qr_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_qr_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_users_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_users_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: trg_vimg_after(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_vimg_after() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM recompute_user_verification(NEW.user_id);
    RETURN NULL;
END;
$$;


--
-- Name: trg_vimg_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_vimg_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: user_has_schedule_conflict(bigint, timestamp with time zone, timestamp with time zone, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_schedule_conflict(p_user bigint, p_start timestamp with time zone, p_end timestamp with time zone, p_except_event bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE sql
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM assignments a
         WHERE a.user_id = p_user
           AND a.status <> 'cancelled'
           AND a.event_id <> COALESCE(p_except_event, -1)
           AND tstzrange(a.schedule_start, a.schedule_end, '[)') && tstzrange(p_start, p_end, '[)'))
$$;


--
-- Name: verify_otp(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_otp(p_phone_hash text, p_code_hash text, p_purpose text DEFAULT 'login'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: verify_otp_challenge(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_otp_challenge(p_challenge_token_hash text, p_code_hash text, p_purpose text DEFAULT 'login'::text) RETURNS TABLE(status text, phone_hash text, otp_id bigint)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_chal auth_otp_challenge%ROWTYPE;
    v_otp  auth_otp%ROWTYPE;
BEGIN
    -- Step 1: Deterministic locking order â€” lock challenge row first
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value_int integer NOT NULL,
    description text,
    CONSTRAINT ck_app_settings_key CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))
);


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    application_id bigint NOT NULL,
    user_id bigint NOT NULL,
    post_id bigint,
    group_code text,
    is_group_leader boolean DEFAULT false NOT NULL,
    status text DEFAULT 'assigned'::text NOT NULL,
    assigned_by text DEFAULT 'auto'::text NOT NULL,
    assigned_by_user_id bigint,
    schedule_start timestamp with time zone NOT NULL,
    schedule_end timestamp with time zone NOT NULL,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    conditions_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_assignment_actor CHECK (((assigned_by = 'auto'::text) = (assigned_by_user_id IS NULL))),
    CONSTRAINT ck_assignment_assigned_by CHECK ((assigned_by = ANY (ARRAY['auto'::text, 'coordinator'::text, 'admin'::text]))),
    CONSTRAINT ck_assignment_cancelled_at CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL))),
    CONSTRAINT ck_assignment_confirmed_at CHECK ((((status = ANY (ARRAY['confirmed'::text, 'completed'::text])) AND (confirmed_at IS NOT NULL)) OR (status = ANY (ARRAY['assigned'::text, 'cancelled'::text, 'completed'::text])))),
    CONSTRAINT ck_assignment_leader_group CHECK (((NOT is_group_leader) OR (group_code IS NOT NULL))),
    CONSTRAINT ck_assignment_schedule CHECK ((schedule_end > schedule_start)),
    CONSTRAINT ck_assignment_status CHECK ((status = ANY (ARRAY['assigned'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.assignments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    user_id bigint NOT NULL,
    assignment_id bigint NOT NULL,
    qr_token_id bigint,
    status text DEFAULT 'expected'::text NOT NULL,
    checkin_at timestamp with time zone,
    checkout_at timestamp with time zone,
    method text,
    recorded_by_user_id bigint,
    walk_in_flag boolean DEFAULT false NOT NULL,
    note text,
    checkin_latitude numeric(9,6),
    checkin_longitude numeric(9,6),
    checkin_accuracy_m numeric(7,1),
    checkin_distance_m numeric(10,1),
    geo_verified boolean DEFAULT false NOT NULL,
    confirmation_status text DEFAULT 'not_required'::text NOT NULL,
    confirmed_by_user_id bigint,
    confirmed_at timestamp with time zone,
    confirmation_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_attendance_checkin CHECK (((status <> ALL (ARRAY['checked_in'::text, 'completed'::text])) OR ((checkin_at IS NOT NULL) AND (method IS NOT NULL)))),
    CONSTRAINT ck_attendance_checkout CHECK (((checkout_at IS NULL) OR ((checkin_at IS NOT NULL) AND (checkout_at >= checkin_at)))),
    CONSTRAINT ck_attendance_confirmation_state CHECK (((confirmation_status = 'not_required'::text) OR ((confirmation_status = ANY (ARRAY['pending'::text, 'confirmed'::text])) AND (method = 'geo'::text) AND (status = ANY (ARRAY['checked_in'::text, 'completed'::text]))) OR ((confirmation_status = 'rejected'::text) AND (status = ANY (ARRAY['expected'::text, 'absent'::text, 'cancelled'::text]))))),
    CONSTRAINT ck_attendance_confirmation_status CHECK ((confirmation_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text]))),
    CONSTRAINT ck_attendance_decision CHECK (((confirmation_status = ANY (ARRAY['confirmed'::text, 'rejected'::text])) = ((confirmed_by_user_id IS NOT NULL) AND (confirmed_at IS NOT NULL)))),
    CONSTRAINT ck_attendance_geo_columns CHECK ((((method = 'geo'::text) AND geo_verified AND (checkin_accuracy_m IS NOT NULL) AND (checkin_distance_m IS NOT NULL)) OR ((method IS DISTINCT FROM 'geo'::text) AND (NOT geo_verified) AND (checkin_latitude IS NULL) AND (checkin_longitude IS NULL) AND (checkin_accuracy_m IS NULL) AND (checkin_distance_m IS NULL)))),
    CONSTRAINT ck_attendance_geo_pair CHECK (((checkin_latitude IS NULL) = (checkin_longitude IS NULL))),
    CONSTRAINT ck_attendance_lat_range CHECK (((checkin_latitude IS NULL) OR ((checkin_latitude >= ('-90'::integer)::numeric) AND (checkin_latitude <= (90)::numeric)))),
    CONSTRAINT ck_attendance_lng_range CHECK (((checkin_longitude IS NULL) OR ((checkin_longitude >= ('-180'::integer)::numeric) AND (checkin_longitude <= (180)::numeric)))),
    CONSTRAINT ck_attendance_method CHECK (((method IS NULL) OR (method = ANY (ARRAY['qr_scan'::text, 'coordinator_manual'::text, 'geo'::text, 'system'::text])))),
    CONSTRAINT ck_attendance_method_manual CHECK (((method IS DISTINCT FROM 'coordinator_manual'::text) OR (recorded_by_user_id IS NOT NULL))),
    CONSTRAINT ck_attendance_method_qr CHECK (((method IS DISTINCT FROM 'qr_scan'::text) OR (qr_token_id IS NOT NULL))),
    CONSTRAINT ck_attendance_no_evidence_without_checkin CHECK (((status = ANY (ARRAY['checked_in'::text, 'completed'::text])) OR ((checkin_at IS NULL) AND (checkout_at IS NULL) AND (method IS NULL)))),
    CONSTRAINT ck_attendance_no_self_confirm CHECK (((confirmed_by_user_id IS NULL) OR (confirmed_by_user_id <> user_id))),
    CONSTRAINT ck_attendance_status CHECK ((status = ANY (ARRAY['expected'::text, 'checked_in'::text, 'absent'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT ck_attendance_walkin_method CHECK (((NOT walk_in_flag) OR (method IS NULL) OR (method = ANY (ARRAY['qr_scan'::text, 'coordinator_manual'::text]))))
);


--
-- Name: attendance_geo_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_geo_attempts (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    user_id bigint NOT NULL,
    attendance_id bigint,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    accuracy_m numeric(7,1),
    captured_at timestamp with time zone,
    device_mocked boolean DEFAULT false NOT NULL,
    distance_m numeric(10,1),
    radius_m integer,
    result text NOT NULL,
    review_status text DEFAULT 'none'::text NOT NULL,
    reviewed_by_user_id bigint,
    reviewed_at timestamp with time zone,
    review_note text,
    CONSTRAINT ck_geo_attempt_lat CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT ck_geo_attempt_lng CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),
    CONSTRAINT ck_geo_attempt_result CHECK ((result = ANY (ARRAY['accepted'::text, 'already_checked_in'::text, 'invalid_fix'::text, 'low_accuracy'::text, 'stale_fix'::text, 'mock_location'::text, 'outside_geofence'::text, 'window_closed'::text, 'event_not_active'::text, 'geo_disabled'::text, 'not_assigned'::text, 'not_eligible'::text, 'onboarding_required'::text]))),
    CONSTRAINT ck_geo_attempt_review_status CHECK ((review_status = ANY (ARRAY['none'::text, 'pending'::text, 'confirmed'::text, 'rejected'::text])))
);


--
-- Name: attendance_geo_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attendance_geo_attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_geo_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.attendance ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    actor_user_id bigint,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint,
    before_data jsonb,
    after_data jsonb,
    ip_address inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_group (
    id integer NOT NULL,
    name character varying(150) NOT NULL
);


--
-- Name: auth_group_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_group ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_group_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_group_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_group_permissions (
    id bigint NOT NULL,
    group_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_group_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_group_permissions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_group_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_otp (
    id bigint NOT NULL,
    phone_hash text NOT NULL,
    code_hash text NOT NULL,
    purpose text DEFAULT 'login'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_auth_otp_attempt_count CHECK (((attempt_count >= 0) AND (attempt_count <= 100))),
    CONSTRAINT ck_auth_otp_consumed CHECK (((consumed_at IS NULL) OR (consumed_at >= created_at))),
    CONSTRAINT ck_auth_otp_expiry CHECK ((expires_at > created_at)),
    CONSTRAINT ck_auth_otp_purpose CHECK ((purpose = ANY (ARRAY['login'::text, 'qr_registration'::text])))
);


--
-- Name: auth_otp_challenge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_otp_challenge (
    id bigint NOT NULL,
    otp_id bigint NOT NULL,
    challenge_token_hash text NOT NULL,
    purpose text DEFAULT 'login'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    request_id text,
    identity_nonce_hash text,
    CONSTRAINT ck_auth_otp_challenge_consumed CHECK (((consumed_at IS NULL) OR (consumed_at >= created_at))),
    CONSTRAINT ck_auth_otp_challenge_expiry CHECK ((expires_at > created_at)),
    CONSTRAINT ck_auth_otp_challenge_purpose CHECK ((purpose = ANY (ARRAY['login'::text, 'qr_registration'::text]))),
    CONSTRAINT ck_auth_otp_challenge_token_hash_len CHECK ((length(challenge_token_hash) = 64))
);


--
-- Name: auth_otp_challenge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_otp_challenge ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auth_otp_challenge_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_otp ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auth_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_permission (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    content_type_id integer NOT NULL,
    codename character varying(100) NOT NULL
);


--
-- Name: auth_permission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auth_permission ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.auth_permission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: authtoken_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authtoken_token (
    key character varying(40) NOT NULL,
    created timestamp with time zone NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: charity_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.charity_fields (
    code text NOT NULL,
    label text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    CONSTRAINT ck_charity_fields_code CHECK ((code ~ '^[a-z][a-z0-9_]{1,49}$'::text)),
    CONSTRAINT ck_charity_fields_label CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 100)))
);


--
-- Name: coordinator_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coordinator_profiles (
    user_id bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by_id bigint,
    approved_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_coordinator_approval CHECK (((status = ANY (ARRAY['pending'::text, 'revoked'::text])) OR ((approved_at IS NOT NULL) AND (approved_by_id IS NOT NULL)))),
    CONSTRAINT ck_coordinator_no_self_approval CHECK (((approved_by_id IS NULL) OR (approved_by_id <> user_id))),
    CONSTRAINT ck_coordinator_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: django_admin_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_admin_log (
    id integer NOT NULL,
    action_time timestamp with time zone NOT NULL,
    object_id text,
    object_repr character varying(200) NOT NULL,
    action_flag smallint NOT NULL,
    change_message text NOT NULL,
    content_type_id integer,
    user_id bigint NOT NULL,
    CONSTRAINT django_admin_log_action_flag_check CHECK ((action_flag >= 0))
);


--
-- Name: django_admin_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.django_admin_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.django_admin_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_content_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_content_type (
    id integer NOT NULL,
    app_label character varying(100) NOT NULL,
    model character varying(100) NOT NULL
);


--
-- Name: django_content_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.django_content_type ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.django_content_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_migrations (
    id bigint NOT NULL,
    app character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    applied timestamp with time zone NOT NULL
);


--
-- Name: django_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.django_migrations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.django_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.django_session (
    session_key character varying(40) NOT NULL,
    session_data text NOT NULL,
    expire_date timestamp with time zone NOT NULL
);


--
-- Name: event_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_applications (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    post_id bigint,
    user_id bigint NOT NULL,
    qr_token_id bigint,
    source text DEFAULT 'browse'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by_id bigint,
    decided_at timestamp with time zone,
    conditions_acknowledged_at timestamp with time zone,
    conditions_snapshot jsonb,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_application_decided CHECK (((status <> ALL (ARRAY['accepted'::text, 'rejected'::text])) OR (decided_at IS NOT NULL))),
    CONSTRAINT ck_application_decider CHECK (((decided_by_id IS NULL) OR (decided_at IS NOT NULL))),
    CONSTRAINT ck_application_no_self_decision CHECK (((decided_by_id IS NULL) OR (decided_by_id <> user_id))),
    CONSTRAINT ck_application_source CHECK ((source = ANY (ARRAY['browse'::text, 'qr_walkin'::text, 'invite'::text]))),
    CONSTRAINT ck_application_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'waitlisted'::text, 'rejected'::text, 'withdrawn'::text, 'expired'::text]))),
    CONSTRAINT ck_application_walkin_token CHECK (((source = 'qr_walkin'::text) = (qr_token_id IS NOT NULL)))
);


--
-- Name: event_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.event_applications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.event_applications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: event_charity_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_charity_fields (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    field_code text NOT NULL
);


--
-- Name: event_charity_fields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.event_charity_fields ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.event_charity_fields_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: event_coordinator_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_coordinator_history (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    from_coordinator_id bigint,
    to_coordinator_id bigint NOT NULL,
    changed_by_user_id bigint,
    reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_coord_history_changed CHECK ((from_coordinator_id IS DISTINCT FROM to_coordinator_id))
);


--
-- Name: event_coordinator_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.event_coordinator_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.event_coordinator_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: event_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_posts (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    title text NOT NULL,
    description text,
    required_headcount integer NOT NULL,
    physical_level text DEFAULT 'none'::text NOT NULL,
    required_skills text[] DEFAULT '{}'::text[] NOT NULL,
    leader_needed boolean DEFAULT false NOT NULL,
    new_volunteers_allowed boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_event_posts_headcount CHECK (((required_headcount >= 1) AND (required_headcount <= 100000))),
    CONSTRAINT ck_event_posts_physical_level CHECK ((physical_level = ANY (ARRAY['none'::text, 'light'::text, 'medium'::text, 'heavy'::text]))),
    CONSTRAINT ck_event_posts_skills CHECK (public.tags_are_normalized(required_skills)),
    CONSTRAINT ck_event_posts_status CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'closed'::text]))),
    CONSTRAINT ck_event_posts_title CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 150)))
);


--
-- Name: event_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.event_posts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.event_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id bigint NOT NULL,
    owner_id bigint NOT NULL,
    current_coordinator_id bigint NOT NULL,
    title text NOT NULL,
    description text,
    purpose_type text DEFAULT 'charity_event'::text NOT NULL,
    location_name text,
    landmark_text text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    geo_radius_m integer,
    geo_checkin_enabled boolean DEFAULT false NOT NULL,
    geo_checkin_opens_before_min integer DEFAULT 30 NOT NULL,
    require_checkin_confirmation boolean DEFAULT true NOT NULL,
    map_provider text DEFAULT 'openstreetmap'::text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    application_deadline timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    acceptance_mode text DEFAULT 'manual'::text NOT NULL,
    auto_assign_enabled boolean DEFAULT true NOT NULL,
    group_size integer,
    leader_strategy text DEFAULT 'none'::text NOT NULL,
    max_participants integer,
    meals_provided boolean DEFAULT false NOT NULL,
    lodging_provided boolean DEFAULT false NOT NULL,
    travel_support_provided boolean DEFAULT false NOT NULL,
    compensation_kind text DEFAULT 'unpaid'::text NOT NULL,
    compensation_note text,
    onboarding_text text,
    onboarding_version integer DEFAULT 1 NOT NULL,
    require_onboarding_ack boolean DEFAULT true NOT NULL,
    qr_registration_enabled boolean DEFAULT true NOT NULL,
    published_at timestamp with time zone,
    activated_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    deleted_at timestamp with time zone,
    deleted_by_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_events_acceptance_mode CHECK ((acceptance_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
    CONSTRAINT ck_events_compensation_kind CHECK ((compensation_kind = ANY (ARRAY['unpaid'::text, 'arranged_outside_system'::text]))),
    CONSTRAINT ck_events_deadline CHECK (((application_deadline IS NULL) OR (application_deadline <= start_at))),
    CONSTRAINT ck_events_geo_enabled_needs_point CHECK (((NOT geo_checkin_enabled) OR (latitude IS NOT NULL))),
    CONSTRAINT ck_events_geo_pair CHECK (((latitude IS NULL) = (longitude IS NULL))),
    CONSTRAINT ck_events_geo_radius CHECK (((geo_radius_m IS NULL) OR ((geo_radius_m >= 20) AND (geo_radius_m <= 5000)))),
    CONSTRAINT ck_events_geo_window CHECK (((geo_checkin_opens_before_min >= 0) AND (geo_checkin_opens_before_min <= 240))),
    CONSTRAINT ck_events_group_size CHECK (((group_size IS NULL) OR (group_size > 0))),
    CONSTRAINT ck_events_lat_range CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT ck_events_leader_strategy CHECK ((leader_strategy = ANY (ARRAY['none'::text, 'first_experienced'::text, 'manual'::text]))),
    CONSTRAINT ck_events_lng_range CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),
    CONSTRAINT ck_events_map_provider CHECK ((map_provider = ANY (ARRAY['openstreetmap'::text, 'google'::text]))),
    CONSTRAINT ck_events_max_participants CHECK (((max_participants IS NULL) OR (max_participants > 0))),
    CONSTRAINT ck_events_onboarding_version CHECK ((onboarding_version >= 1)),
    CONSTRAINT ck_events_purpose_type CHECK ((purpose_type = ANY (ARRAY['charity_event'::text, 'help_wanted_event'::text]))),
    CONSTRAINT ck_events_soft_delete CHECK (((deleted_at IS NULL) = (deleted_by_id IS NULL))),
    CONSTRAINT ck_events_status CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT ck_events_status_timestamps CHECK ((((status = 'draft'::text) AND (published_at IS NULL) AND (activated_at IS NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'published'::text) AND (published_at IS NOT NULL) AND (activated_at IS NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'active'::text) AND (published_at IS NOT NULL) AND (activated_at IS NOT NULL) AND (completed_at IS NULL) AND (cancelled_at IS NULL)) OR ((status = 'completed'::text) AND (published_at IS NOT NULL) AND (activated_at IS NOT NULL) AND (completed_at IS NOT NULL) AND (cancelled_at IS NULL)) OR ((status = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND (completed_at IS NULL)))),
    CONSTRAINT ck_events_time CHECK ((end_at > start_at)),
    CONSTRAINT ck_events_title CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 255)))
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    rater_user_id bigint NOT NULL,
    target_user_id bigint,
    direction text NOT NULL,
    score integer NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    comment text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_feedback_direction CHECK ((direction = ANY (ARRAY['coordinator_to_volunteer'::text, 'volunteer_to_event'::text, 'volunteer_to_coordinator'::text]))),
    CONSTRAINT ck_feedback_not_self CHECK (((target_user_id IS NULL) OR (target_user_id <> rater_user_id))),
    CONSTRAINT ck_feedback_score CHECK (((score >= 1) AND (score <= 5))),
    CONSTRAINT ck_feedback_status CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text]))),
    CONSTRAINT ck_feedback_tags CHECK (public.tags_are_normalized(tags)),
    CONSTRAINT ck_feedback_target CHECK ((((direction = 'volunteer_to_event'::text) AND (target_user_id IS NULL)) OR ((direction <> 'volunteer_to_event'::text) AND (target_user_id IS NOT NULL))))
);


--
-- Name: feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.feedback ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: moderation_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_actions (
    id bigint NOT NULL,
    admin_user_id bigint NOT NULL,
    target_user_id bigint,
    event_id bigint,
    feedback_id bigint,
    action_type text NOT NULL,
    reason text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_moderation_action_type CHECK ((action_type = ANY (ARRAY['user_warning'::text, 'user_block'::text, 'user_unblock'::text, 'account_close'::text, 'account_reinstate'::text, 'event_delete'::text, 'event_restore'::text, 'event_cancel'::text, 'feedback_hide'::text]))),
    CONSTRAINT ck_moderation_expiry CHECK (((expires_at IS NULL) OR (action_type = 'user_block'::text))),
    CONSTRAINT ck_moderation_no_self CHECK (((target_user_id IS NULL) OR (target_user_id <> admin_user_id))),
    CONSTRAINT ck_moderation_reason CHECK (((action_type <> ALL (ARRAY['user_block'::text, 'account_close'::text, 'event_delete'::text, 'event_cancel'::text, 'feedback_hide'::text])) OR (char_length(btrim(COALESCE(reason, ''::text))) > 0))),
    CONSTRAINT ck_moderation_subject CHECK ((((action_type = ANY (ARRAY['user_warning'::text, 'user_block'::text, 'user_unblock'::text, 'account_close'::text, 'account_reinstate'::text])) AND (target_user_id IS NOT NULL) AND (event_id IS NULL) AND (feedback_id IS NULL)) OR ((action_type = ANY (ARRAY['event_delete'::text, 'event_restore'::text, 'event_cancel'::text])) AND (event_id IS NOT NULL) AND (target_user_id IS NULL) AND (feedback_id IS NULL)) OR ((action_type = 'feedback_hide'::text) AND (feedback_id IS NOT NULL) AND (target_user_id IS NULL) AND (event_id IS NULL))))
);


--
-- Name: moderation_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.moderation_actions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.moderation_actions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: onboarding_acknowledgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_acknowledgments (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    event_id bigint NOT NULL,
    onboarding_version integer NOT NULL,
    method text DEFAULT 'app_tick'::text NOT NULL,
    acknowledged_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_onboarding_ack_method CHECK ((method = 'app_tick'::text)),
    CONSTRAINT ck_onboarding_ack_version CHECK ((onboarding_version >= 1))
);


--
-- Name: onboarding_acknowledgments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_acknowledgments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.onboarding_acknowledgments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: qr_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_tokens (
    id bigint NOT NULL,
    event_id bigint NOT NULL,
    created_by_id bigint NOT NULL,
    purpose text NOT NULL,
    token_hash text NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_qr_expiry CHECK ((expires_at > created_at)),
    CONSTRAINT ck_qr_hash_len CHECK (((char_length(token_hash) >= 32) AND (char_length(token_hash) <= 128))),
    CONSTRAINT ck_qr_max_uses CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT ck_qr_purpose CHECK ((purpose = ANY (ARRAY['walkin_registration'::text, 'checkin'::text, 'join_event'::text]))),
    CONSTRAINT ck_qr_revoked CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT ck_qr_used_count CHECK (((max_uses IS NULL) OR (used_count <= max_uses))),
    CONSTRAINT ck_qr_used_count_nonnegative CHECK ((used_count >= 0))
);


--
-- Name: qr_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.qr_tokens ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.qr_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_charity_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_charity_interests (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    field_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_charity_interests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_charity_interests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_charity_interests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_verification_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_verification_images (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    image_type text NOT NULL,
    image_path text NOT NULL,
    file_format text DEFAULT 'jpeg'::text NOT NULL,
    file_sha256 text,
    status text DEFAULT 'pending'::text NOT NULL,
    comparison_status text DEFAULT 'pending'::text NOT NULL,
    comparison_score numeric(5,4),
    is_current boolean DEFAULT true NOT NULL,
    reviewed_by_id bigint,
    reviewed_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_verification_comparison_status CHECK ((comparison_status = ANY (ARRAY['pending'::text, 'match'::text, 'no_match'::text, 'needs_review'::text]))),
    CONSTRAINT ck_verification_file_format CHECK ((file_format = 'jpeg'::text)),
    CONSTRAINT ck_verification_image_path CHECK ((((char_length(btrim(image_path)) >= 1) AND (char_length(btrim(image_path)) <= 255)) AND (lower(image_path) ~ '\.jpe?g$'::text))),
    CONSTRAINT ck_verification_image_type CHECK ((image_type = ANY (ARRAY['mock_selfie'::text, 'id_license'::text, 'driver_license'::text]))),
    CONSTRAINT ck_verification_no_self_review CHECK (((reviewed_by_id IS NULL) OR (reviewed_by_id <> user_id))),
    CONSTRAINT ck_verification_review CHECK (((status = 'pending'::text) OR ((reviewed_by_id IS NOT NULL) AND (reviewed_at IS NOT NULL)))),
    CONSTRAINT ck_verification_score_range CHECK (((comparison_score IS NULL) OR ((comparison_score >= (0)::numeric) AND (comparison_score <= (1)::numeric)))),
    CONSTRAINT ck_verification_sha256 CHECK (((file_sha256 IS NULL) OR (file_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT ck_verification_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: user_verification_images_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_verification_images ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_verification_images_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    phone_hash text NOT NULL,
    phone_enc text NOT NULL,
    password text,
    last_login timestamp with time zone,
    display_name text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    is_staff boolean DEFAULT false NOT NULL,
    is_superuser boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    account_status text DEFAULT 'active'::text NOT NULL,
    blocked_until timestamp with time zone,
    preferred_language text DEFAULT 'en'::text NOT NULL,
    home_area text,
    emergency_contact_name text,
    emergency_contact_phone_enc text,
    blood_type text DEFAULT 'unknown'::text NOT NULL,
    is_willing_to_donate boolean DEFAULT false NOT NULL,
    is_willing_to_donate_blood boolean DEFAULT false NOT NULL,
    is_willing_to_donate_items boolean DEFAULT false NOT NULL,
    physical_ok boolean DEFAULT false NOT NULL,
    good_eyesight boolean DEFAULT true NOT NULL,
    needs_glasses boolean DEFAULT false NOT NULL,
    can_lift_heavy boolean DEFAULT false NOT NULL,
    can_work_outdoor boolean DEFAULT false NOT NULL,
    has_leader_experience boolean DEFAULT false NOT NULL,
    new_to_volunteer boolean DEFAULT true NOT NULL,
    skills text[] DEFAULT '{}'::text[] NOT NULL,
    needs_meal_support boolean DEFAULT false NOT NULL,
    needs_travel_support boolean DEFAULT false NOT NULL,
    accepts_unpaid boolean DEFAULT true NOT NULL,
    verification_status text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    uuid uuid DEFAULT uuidv7() NOT NULL,
    CONSTRAINT ck_users_account_status CHECK ((account_status = ANY (ARRAY['active'::text, 'blocked'::text, 'closed'::text]))),
    CONSTRAINT ck_users_active_status_sync CHECK ((is_active = (account_status = 'active'::text))),
    CONSTRAINT ck_users_admin_flags CHECK ((((NOT is_staff) AND (NOT is_superuser)) OR is_admin)),
    CONSTRAINT ck_users_blocked_until CHECK (((blocked_until IS NULL) OR (account_status = 'blocked'::text))),
    CONSTRAINT ck_users_blood_type CHECK ((blood_type = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text, 'unknown'::text]))),
    CONSTRAINT ck_users_display_name CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 150))),
    CONSTRAINT ck_users_donation_consistency CHECK ((is_willing_to_donate OR ((NOT is_willing_to_donate_blood) AND (NOT is_willing_to_donate_items)))),
    CONSTRAINT ck_users_emergency_pair CHECK (((emergency_contact_name IS NULL) = (emergency_contact_phone_enc IS NULL))),
    CONSTRAINT ck_users_language CHECK ((preferred_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text)),
    CONSTRAINT ck_users_phone_hash_len CHECK (((char_length(phone_hash) >= 32) AND (char_length(phone_hash) <= 128))),
    CONSTRAINT ck_users_skills CHECK (public.tags_are_normalized(skills)),
    CONSTRAINT ck_users_verification_status CHECK ((verification_status = ANY (ARRAY['none'::text, 'pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: v_accepted_unassigned; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_accepted_unassigned AS
 SELECT ap.id AS application_id,
    ap.event_id,
    ap.user_id,
    u.display_name,
    u.skills,
    u.physical_ok,
    u.can_lift_heavy,
    u.has_leader_experience,
    u.new_to_volunteer
   FROM ((public.event_applications ap
     JOIN public.users u ON ((u.id = ap.user_id)))
     JOIN public.events e ON (((e.id = ap.event_id) AND (e.deleted_at IS NULL))))
  WHERE ((ap.status = 'accepted'::text) AND (NOT (EXISTS ( SELECT 1
           FROM public.assignments a
          WHERE ((a.application_id = ap.id) AND (a.status <> 'cancelled'::text))))));


--
-- Name: v_admin_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_admin_dashboard AS
 SELECT ( SELECT count(*) AS count
           FROM public.users
          WHERE (users.account_status = 'active'::text)) AS active_users,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE (users.account_status = 'blocked'::text)) AS blocked_users,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE (users.verification_status = 'pending'::text)) AS users_pending_verification,
    ( SELECT count(*) AS count
           FROM public.user_verification_images
          WHERE ((user_verification_images.status = 'pending'::text) AND user_verification_images.is_current)) AS images_pending_review,
    ( SELECT count(*) AS count
           FROM public.coordinator_profiles
          WHERE (coordinator_profiles.status = 'pending'::text)) AS coordinators_pending_approval,
    ( SELECT count(*) AS count
           FROM public.coordinator_profiles
          WHERE (coordinator_profiles.status = 'approved'::text)) AS coordinators_approved,
    ( SELECT count(*) AS count
           FROM public.events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'draft'::text))) AS events_draft,
    ( SELECT count(*) AS count
           FROM public.events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'published'::text))) AS events_published,
    ( SELECT count(*) AS count
           FROM public.events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'active'::text))) AS events_active,
    ( SELECT count(*) AS count
           FROM public.events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'completed'::text))) AS events_completed,
    ( SELECT count(*) AS count
           FROM public.events
          WHERE ((events.deleted_at IS NULL) AND (events.status = 'cancelled'::text))) AS events_cancelled,
    ( SELECT count(*) AS count
           FROM public.events
          WHERE (events.deleted_at IS NOT NULL)) AS events_deleted,
    ( SELECT count(*) AS count
           FROM public.attendance
          WHERE (attendance.confirmation_status = 'pending'::text)) AS pending_checkin_confirmations,
    ( SELECT count(*) AS count
           FROM public.moderation_actions
          WHERE ((moderation_actions.action_type = 'user_warning'::text) AND (moderation_actions.created_at > (now() - '30 days'::interval)))) AS warnings_last_30d;


--
-- Name: v_event_checkin_board; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_checkin_board AS
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
   FROM (((public.assignments a
     JOIN public.users u ON ((u.id = a.user_id)))
     LEFT JOIN public.event_posts ep ON ((ep.id = a.post_id)))
     LEFT JOIN public.attendance t ON (((t.event_id = a.event_id) AND (t.user_id = a.user_id))))
  WHERE (a.status <> 'cancelled'::text);


--
-- Name: v_event_checkin_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_checkin_status AS
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
   FROM public.v_event_checkin_board;


--
-- Name: v_event_coordinator_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_coordinator_history AS
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
   FROM ((((public.event_coordinator_history h
     JOIN public.events e ON ((e.id = h.event_id)))
     LEFT JOIN public.users fu ON ((fu.id = h.from_coordinator_id)))
     JOIN public.users tu ON ((tu.id = h.to_coordinator_id)))
     LEFT JOIN public.users cu ON ((cu.id = h.changed_by_user_id)))
  ORDER BY h.changed_at DESC;


--
-- Name: v_event_post_capacity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_post_capacity AS
SELECT
    NULL::bigint AS post_id,
    NULL::bigint AS event_id,
    NULL::text AS title,
    NULL::text AS status,
    NULL::integer AS required_headcount,
    NULL::bigint AS assigned_count,
    NULL::bigint AS remaining;


--
-- Name: v_event_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_event_summary AS
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
           FROM public.event_applications x
          WHERE ((x.event_id = e.id) AND (x.status = 'pending'::text))) AS pending_count,
    ( SELECT count(*) AS count
           FROM public.event_applications x
          WHERE ((x.event_id = e.id) AND (x.status = 'accepted'::text))) AS accepted_count,
    ( SELECT count(*) AS count
           FROM public.event_applications x
          WHERE ((x.event_id = e.id) AND (x.status = 'waitlisted'::text))) AS waitlisted_count,
    ( SELECT count(*) AS count
           FROM public.assignments x
          WHERE ((x.event_id = e.id) AND (x.status <> 'cancelled'::text))) AS assignment_count,
    ( SELECT count(*) AS count
           FROM public.attendance x
          WHERE ((x.event_id = e.id) AND (x.status = ANY (ARRAY['checked_in'::text, 'completed'::text])))) AS checked_in_count,
    ( SELECT count(*) AS count
           FROM public.attendance x
          WHERE ((x.event_id = e.id) AND (x.confirmation_status = 'pending'::text))) AS pending_confirmations
   FROM public.events e
  WHERE (deleted_at IS NULL);


--
-- Name: v_geo_attempts_review; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_geo_attempts_review AS
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
   FROM ((public.attendance_geo_attempts ga
     JOIN public.events e ON ((e.id = ga.event_id)))
     JOIN public.users u ON ((u.id = ga.user_id)))
  ORDER BY ga.attempted_at DESC;


--
-- Name: v_pending_confirmations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_pending_confirmations AS
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
   FROM ((public.attendance t
     JOIN public.events e ON (((e.id = t.event_id) AND (e.deleted_at IS NULL))))
     JOIN public.users u ON ((u.id = t.user_id)))
  WHERE (t.confirmation_status = 'pending'::text);


--
-- Name: v_public_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_public_events AS
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
           FROM public.event_charity_fields f
          WHERE (f.event_id = e.id)), '{}'::text[]) AS charity_fields,
    COALESCE(( SELECT sum(c.remaining) AS sum
           FROM public.v_event_post_capacity c
          WHERE ((c.event_id = e.id) AND (c.status <> 'closed'::text))), (0)::numeric) AS spots_remaining
   FROM (public.events e
     JOIN public.users cu ON ((cu.id = e.current_coordinator_id)))
  WHERE ((e.deleted_at IS NULL) AND (e.status = ANY (ARRAY['published'::text, 'active'::text])));


--
-- Name: v_user_moderation_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_user_moderation_summary AS
 SELECT target_user_id AS user_id,
    count(*) FILTER (WHERE (action_type = 'user_warning'::text)) AS warning_count,
    max(created_at) FILTER (WHERE (action_type = 'user_warning'::text)) AS last_warning_at,
    count(*) FILTER (WHERE (action_type = 'user_block'::text)) AS block_count,
    max(created_at) FILTER (WHERE (action_type = 'user_block'::text)) AS last_block_at
   FROM public.moderation_actions m
  WHERE (target_user_id IS NOT NULL)
  GROUP BY target_user_id;


--
-- Name: volunteer_availability_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_availability_exceptions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    date date NOT NULL,
    is_available boolean DEFAULT false NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_availability_exception_times CHECK ((((start_time IS NULL) AND (end_time IS NULL)) OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time))))
);


--
-- Name: volunteer_availability_exceptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.volunteer_availability_exceptions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.volunteer_availability_exceptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: volunteer_availability_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_availability_rules (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    weekday integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_availability_time_order CHECK ((end_time > start_time)),
    CONSTRAINT ck_availability_valid_range CHECK (((valid_from IS NULL) OR (valid_to IS NULL) OR (valid_to >= valid_from))),
    CONSTRAINT ck_availability_weekday CHECK (((weekday >= 1) AND (weekday <= 7)))
);


--
-- Name: volunteer_availability_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.volunteer_availability_rules ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.volunteer_availability_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: attendance_geo_attempts attendance_geo_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_geo_attempts
    ADD CONSTRAINT attendance_geo_attempts_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_group auth_group_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group
    ADD CONSTRAINT auth_group_name_key UNIQUE (name);


--
-- Name: auth_group_permissions auth_group_permissions_group_id_permission_id_0cd325b0_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_permission_id_0cd325b0_uniq UNIQUE (group_id, permission_id);


--
-- Name: auth_group_permissions auth_group_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_group auth_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group
    ADD CONSTRAINT auth_group_pkey PRIMARY KEY (id);


--
-- Name: auth_otp_challenge auth_otp_challenge_challenge_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp_challenge
    ADD CONSTRAINT auth_otp_challenge_challenge_token_hash_key UNIQUE (challenge_token_hash);


--
-- Name: auth_otp_challenge auth_otp_challenge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp_challenge
    ADD CONSTRAINT auth_otp_challenge_pkey PRIMARY KEY (id);


--
-- Name: auth_otp auth_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp
    ADD CONSTRAINT auth_otp_pkey PRIMARY KEY (id);


--
-- Name: auth_permission auth_permission_content_type_id_codename_01ab375a_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_codename_01ab375a_uniq UNIQUE (content_type_id, codename);


--
-- Name: auth_permission auth_permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_pkey PRIMARY KEY (id);


--
-- Name: authtoken_token authtoken_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authtoken_token
    ADD CONSTRAINT authtoken_token_pkey PRIMARY KEY (key);


--
-- Name: authtoken_token authtoken_token_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authtoken_token
    ADD CONSTRAINT authtoken_token_user_id_key UNIQUE (user_id);


--
-- Name: charity_fields charity_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charity_fields
    ADD CONSTRAINT charity_fields_pkey PRIMARY KEY (code);


--
-- Name: coordinator_profiles coordinator_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_profiles
    ADD CONSTRAINT coordinator_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: django_admin_log django_admin_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_pkey PRIMARY KEY (id);


--
-- Name: django_content_type django_content_type_app_label_model_76bd3d3b_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type
    ADD CONSTRAINT django_content_type_app_label_model_76bd3d3b_uniq UNIQUE (app_label, model);


--
-- Name: django_content_type django_content_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_content_type
    ADD CONSTRAINT django_content_type_pkey PRIMARY KEY (id);


--
-- Name: django_migrations django_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_migrations
    ADD CONSTRAINT django_migrations_pkey PRIMARY KEY (id);


--
-- Name: django_session django_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_session
    ADD CONSTRAINT django_session_pkey PRIMARY KEY (session_key);


--
-- Name: event_applications event_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT event_applications_pkey PRIMARY KEY (id);


--
-- Name: event_charity_fields event_charity_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_charity_fields
    ADD CONSTRAINT event_charity_fields_pkey PRIMARY KEY (id);


--
-- Name: event_coordinator_history event_coordinator_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_coordinator_history
    ADD CONSTRAINT event_coordinator_history_pkey PRIMARY KEY (id);


--
-- Name: event_posts event_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_posts
    ADD CONSTRAINT event_posts_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: assignments ex_assignments_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT ex_assignments_no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(schedule_start, schedule_end, '[)'::text) WITH &&) WHERE ((status <> 'cancelled'::text));


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: moderation_actions moderation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_pkey PRIMARY KEY (id);


--
-- Name: onboarding_acknowledgments onboarding_acknowledgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_acknowledgments
    ADD CONSTRAINT onboarding_acknowledgments_pkey PRIMARY KEY (id);


--
-- Name: qr_tokens qr_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT qr_tokens_pkey PRIMARY KEY (id);


--
-- Name: assignments uq_assignments_id_event_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT uq_assignments_id_event_user UNIQUE (id, event_id, user_id);


--
-- Name: attendance uq_attendance_event_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT uq_attendance_event_user UNIQUE (event_id, user_id);


--
-- Name: volunteer_availability_exceptions uq_availability_exception; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_availability_exceptions
    ADD CONSTRAINT uq_availability_exception UNIQUE (user_id, date);


--
-- Name: volunteer_availability_rules uq_availability_rule; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_availability_rules
    ADD CONSTRAINT uq_availability_rule UNIQUE (user_id, weekday, start_time);


--
-- Name: event_applications uq_event_applications_id_event_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT uq_event_applications_id_event_user UNIQUE (id, event_id, user_id);


--
-- Name: event_charity_fields uq_event_charity_field; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_charity_fields
    ADD CONSTRAINT uq_event_charity_field UNIQUE (event_id, field_code);


--
-- Name: event_posts uq_event_posts_event_title; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_posts
    ADD CONSTRAINT uq_event_posts_event_title UNIQUE (event_id, title);


--
-- Name: event_posts uq_event_posts_id_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_posts
    ADD CONSTRAINT uq_event_posts_id_event UNIQUE (id, event_id);


--
-- Name: onboarding_acknowledgments uq_onboarding_ack_user_event_ver; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_acknowledgments
    ADD CONSTRAINT uq_onboarding_ack_user_event_ver UNIQUE (user_id, event_id, onboarding_version);


--
-- Name: qr_tokens uq_qr_tokens_id_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT uq_qr_tokens_id_event UNIQUE (id, event_id);


--
-- Name: qr_tokens uq_qr_tokens_token_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT uq_qr_tokens_token_hash UNIQUE (token_hash);


--
-- Name: user_charity_interests uq_user_charity_interest; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_charity_interests
    ADD CONSTRAINT uq_user_charity_interest UNIQUE (user_id, field_code);


--
-- Name: users uq_users_phone_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_phone_hash UNIQUE (phone_hash);


--
-- Name: users uq_users_uuid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT uq_users_uuid UNIQUE (uuid);


--
-- Name: user_charity_interests user_charity_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_charity_interests
    ADD CONSTRAINT user_charity_interests_pkey PRIMARY KEY (id);


--
-- Name: user_verification_images user_verification_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_verification_images
    ADD CONSTRAINT user_verification_images_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: volunteer_availability_exceptions volunteer_availability_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_availability_exceptions
    ADD CONSTRAINT volunteer_availability_exceptions_pkey PRIMARY KEY (id);


--
-- Name: volunteer_availability_rules volunteer_availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_availability_rules
    ADD CONSTRAINT volunteer_availability_rules_pkey PRIMARY KEY (id);


--
-- Name: auth_group_name_a6ea08ec_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_name_a6ea08ec_like ON public.auth_group USING btree (name varchar_pattern_ops);


--
-- Name: auth_group_permissions_group_id_b120cbf9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_permissions_group_id_b120cbf9 ON public.auth_group_permissions USING btree (group_id);


--
-- Name: auth_group_permissions_permission_id_84c5c92e; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_group_permissions_permission_id_84c5c92e ON public.auth_group_permissions USING btree (permission_id);


--
-- Name: auth_permission_content_type_id_2f476e4b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_permission_content_type_id_2f476e4b ON public.auth_permission USING btree (content_type_id);


--
-- Name: authtoken_token_key_10f0b77e_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX authtoken_token_key_10f0b77e_like ON public.authtoken_token USING btree (key varchar_pattern_ops);


--
-- Name: django_admin_log_content_type_id_c4bce8eb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_admin_log_content_type_id_c4bce8eb ON public.django_admin_log USING btree (content_type_id);


--
-- Name: django_admin_log_user_id_c564eba6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_admin_log_user_id_c564eba6 ON public.django_admin_log USING btree (user_id);


--
-- Name: django_session_expire_date_a5c62663; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_session_expire_date_a5c62663 ON public.django_session USING btree (expire_date);


--
-- Name: django_session_session_key_c0390e0f_like; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX django_session_session_key_c0390e0f_like ON public.django_session USING btree (session_key varchar_pattern_ops);


--
-- Name: idx_assignments_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_event ON public.assignments USING btree (event_id, status);


--
-- Name: idx_assignments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_post ON public.assignments USING btree (post_id) WHERE (post_id IS NOT NULL);


--
-- Name: idx_assignments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_user ON public.assignments USING btree (user_id);


--
-- Name: idx_attendance_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_event_status ON public.attendance USING btree (event_id, status);


--
-- Name: idx_attendance_pending_confirmation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_pending_confirmation ON public.attendance USING btree (event_id) WHERE (confirmation_status = 'pending'::text);


--
-- Name: idx_attendance_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_user ON public.attendance USING btree (user_id);


--
-- Name: idx_audit_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_actor ON public.audit_logs USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_auth_otp_challenge_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_challenge_expires ON public.auth_otp_challenge USING btree (expires_at) WHERE (consumed_at IS NULL);


--
-- Name: idx_auth_otp_challenge_nonce; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_auth_otp_challenge_nonce ON public.auth_otp_challenge USING btree (identity_nonce_hash) WHERE (identity_nonce_hash IS NOT NULL);


--
-- Name: idx_auth_otp_challenge_otp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_challenge_otp_id ON public.auth_otp_challenge USING btree (otp_id);


--
-- Name: idx_auth_otp_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_expires ON public.auth_otp USING btree (expires_at);


--
-- Name: idx_auth_otp_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_open ON public.auth_otp USING btree (phone_hash, purpose) WHERE (consumed_at IS NULL);


--
-- Name: idx_auth_otp_phone_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otp_phone_created ON public.auth_otp USING btree (phone_hash, created_at DESC);


--
-- Name: idx_availability_exceptions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_exceptions_user_date ON public.volunteer_availability_exceptions USING btree (user_id, date);


--
-- Name: idx_availability_rules_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_rules_user ON public.volunteer_availability_rules USING btree (user_id, weekday);


--
-- Name: idx_coord_history_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coord_history_event ON public.event_coordinator_history USING btree (event_id, changed_at);


--
-- Name: idx_coordinator_profiles_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coordinator_profiles_approved_by ON public.coordinator_profiles USING btree (approved_by_id);


--
-- Name: idx_coordinator_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coordinator_profiles_status ON public.coordinator_profiles USING btree (status);


--
-- Name: idx_event_applications_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_applications_event ON public.event_applications USING btree (event_id, status);


--
-- Name: idx_event_applications_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_applications_post ON public.event_applications USING btree (post_id) WHERE (post_id IS NOT NULL);


--
-- Name: idx_event_applications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_applications_user ON public.event_applications USING btree (user_id);


--
-- Name: idx_event_charity_fields_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_charity_fields_event ON public.event_charity_fields USING btree (event_id);


--
-- Name: idx_event_charity_fields_field; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_charity_fields_field ON public.event_charity_fields USING btree (field_code);


--
-- Name: idx_event_posts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_posts_event ON public.event_posts USING btree (event_id);


--
-- Name: idx_event_posts_skills_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_posts_skills_gin ON public.event_posts USING gin (required_skills);


--
-- Name: idx_events_coordinator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_coordinator ON public.events USING btree (current_coordinator_id);


--
-- Name: idx_events_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_owner ON public.events USING btree (owner_id);


--
-- Name: idx_events_start_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_start_at ON public.events USING btree (start_at);


--
-- Name: idx_events_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_visible ON public.events USING btree (status, start_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_feedback_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_event ON public.feedback USING btree (event_id);


--
-- Name: idx_feedback_rater; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_rater ON public.feedback USING btree (rater_user_id);


--
-- Name: idx_feedback_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_tags_gin ON public.feedback USING gin (tags);


--
-- Name: idx_feedback_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_target ON public.feedback USING btree (target_user_id) WHERE (target_user_id IS NOT NULL);


--
-- Name: idx_geo_attempts_attendance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geo_attempts_attendance ON public.attendance_geo_attempts USING btree (attendance_id) WHERE (attendance_id IS NOT NULL);


--
-- Name: idx_geo_attempts_event_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geo_attempts_event_user ON public.attendance_geo_attempts USING btree (event_id, user_id, attempted_at DESC);


--
-- Name: idx_moderation_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_admin ON public.moderation_actions USING btree (admin_user_id);


--
-- Name: idx_moderation_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_event ON public.moderation_actions USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_moderation_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_target ON public.moderation_actions USING btree (target_user_id, action_type) WHERE (target_user_id IS NOT NULL);


--
-- Name: idx_onboarding_ack_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_ack_event ON public.onboarding_acknowledgments USING btree (event_id);


--
-- Name: idx_qr_tokens_event_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_tokens_event_purpose ON public.qr_tokens USING btree (event_id, purpose);


--
-- Name: idx_user_charity_interests_field; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_charity_interests_field ON public.user_charity_interests USING btree (field_code);


--
-- Name: idx_user_charity_interests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_charity_interests_user ON public.user_charity_interests USING btree (user_id);


--
-- Name: idx_users_account_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_account_status ON public.users USING btree (account_status);


--
-- Name: idx_users_blocked_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_blocked_until ON public.users USING btree (blocked_until) WHERE (account_status = 'blocked'::text);


--
-- Name: idx_users_blood_donors; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_blood_donors ON public.users USING btree (blood_type) WHERE is_willing_to_donate_blood;


--
-- Name: idx_users_is_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_admin ON public.users USING btree (id) WHERE is_admin;


--
-- Name: idx_users_skills_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_skills_gin ON public.users USING gin (skills);


--
-- Name: idx_users_verification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_verification_status ON public.users USING btree (verification_status);


--
-- Name: idx_verification_images_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_images_pending ON public.user_verification_images USING btree (id) WHERE ((status = 'pending'::text) AND is_current);


--
-- Name: idx_verification_images_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_images_user ON public.user_verification_images USING btree (user_id);


--
-- Name: uq_assignment_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_assignment_active ON public.assignments USING btree (event_id, user_id) WHERE (status <> 'cancelled'::text);


--
-- Name: uq_assignment_application; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_assignment_application ON public.assignments USING btree (application_id) WHERE (status <> 'cancelled'::text);


--
-- Name: uq_assignment_group_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_assignment_group_leader ON public.assignments USING btree (event_id, group_code) WHERE (is_group_leader AND (status <> 'cancelled'::text));


--
-- Name: uq_current_verification_image; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_current_verification_image ON public.user_verification_images USING btree (user_id, image_type) WHERE is_current;


--
-- Name: uq_event_application_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_event_application_active ON public.event_applications USING btree (event_id, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'waitlisted'::text]));


--
-- Name: uq_feedback_event_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_feedback_event_once ON public.feedback USING btree (event_id, rater_user_id, direction) WHERE (target_user_id IS NULL);


--
-- Name: uq_feedback_user_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_feedback_user_once ON public.feedback USING btree (event_id, rater_user_id, direction, target_user_id) WHERE (target_user_id IS NOT NULL);


--
-- Name: v_event_post_capacity _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_event_post_capacity AS
 SELECT p.id AS post_id,
    p.event_id,
    p.title,
    p.status,
    p.required_headcount,
    count(a.id) AS assigned_count,
    GREATEST((p.required_headcount - count(a.id)), (0)::bigint) AS remaining
   FROM (public.event_posts p
     LEFT JOIN public.assignments a ON (((a.post_id = p.id) AND (a.status <> 'cancelled'::text))))
  GROUP BY p.id;


--
-- Name: event_applications trg_01_applications_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_applications_before_insert BEFORE INSERT ON public.event_applications FOR EACH ROW EXECUTE FUNCTION public.trg_applications_before_insert();


--
-- Name: event_applications trg_01_applications_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_applications_before_update BEFORE UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION public.trg_applications_before_update();


--
-- Name: assignments trg_01_assignments_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_assignments_before_insert BEFORE INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.trg_assignments_before_insert();


--
-- Name: assignments trg_01_assignments_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_assignments_before_update BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.trg_assignments_before_update();


--
-- Name: attendance trg_01_attendance_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_attendance_before_insert BEFORE INSERT ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.trg_attendance_before_insert();


--
-- Name: attendance trg_01_attendance_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_attendance_guard BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.trg_attendance_guard();


--
-- Name: audit_logs trg_01_audit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_audit_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.trg_block_mutation();


--
-- Name: audit_logs trg_01_audit_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_audit_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.trg_block_mutation();


--
-- Name: auth_otp_challenge trg_01_auth_otp_challenge_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_auth_otp_challenge_guard BEFORE INSERT OR UPDATE ON public.auth_otp_challenge FOR EACH ROW EXECUTE FUNCTION public.trg_auth_otp_challenge_before();


--
-- Name: event_coordinator_history trg_01_coord_history_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_coord_history_append_only BEFORE DELETE OR UPDATE ON public.event_coordinator_history FOR EACH ROW EXECUTE FUNCTION public.trg_block_mutation();


--
-- Name: coordinator_profiles trg_01_coordinator_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_coordinator_guard BEFORE INSERT OR UPDATE ON public.coordinator_profiles FOR EACH ROW EXECUTE FUNCTION public.trg_coordinator_guard();


--
-- Name: events trg_01_events_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_events_before_insert BEFORE INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.trg_events_before_insert();


--
-- Name: events trg_01_events_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_events_before_update BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.trg_events_before_update();


--
-- Name: feedback trg_01_feedback_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_feedback_guard BEFORE INSERT OR UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.trg_feedback_guard();


--
-- Name: attendance_geo_attempts trg_01_geo_attempts_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_geo_attempts_guard BEFORE UPDATE ON public.attendance_geo_attempts FOR EACH ROW EXECUTE FUNCTION public.trg_geo_attempts_guard();


--
-- Name: attendance_geo_attempts trg_01_geo_attempts_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_geo_attempts_no_delete BEFORE DELETE ON public.attendance_geo_attempts FOR EACH ROW EXECUTE FUNCTION public.trg_block_mutation();


--
-- Name: moderation_actions trg_01_moderation_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_moderation_append_only BEFORE DELETE OR UPDATE ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION public.trg_block_mutation();


--
-- Name: moderation_actions trg_01_moderation_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_moderation_before_insert BEFORE INSERT ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION public.trg_moderation_before_insert();


--
-- Name: onboarding_acknowledgments trg_01_onboarding_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_onboarding_append_only BEFORE DELETE OR UPDATE ON public.onboarding_acknowledgments FOR EACH ROW EXECUTE FUNCTION public.trg_block_mutation();


--
-- Name: onboarding_acknowledgments trg_01_onboarding_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_onboarding_before_insert BEFORE INSERT ON public.onboarding_acknowledgments FOR EACH ROW EXECUTE FUNCTION public.trg_onboarding_before_insert();


--
-- Name: auth_otp trg_01_otp_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_otp_rate_limit BEFORE INSERT ON public.auth_otp FOR EACH ROW EXECUTE FUNCTION public.trg_otp_rate_limit();


--
-- Name: event_posts trg_01_posts_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_posts_guard BEFORE INSERT OR UPDATE ON public.event_posts FOR EACH ROW EXECUTE FUNCTION public.trg_posts_guard();


--
-- Name: qr_tokens trg_01_qr_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_qr_guard BEFORE INSERT OR UPDATE ON public.qr_tokens FOR EACH ROW EXECUTE FUNCTION public.trg_qr_guard();


--
-- Name: users trg_01_users_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_users_guard BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.trg_users_guard();


--
-- Name: user_verification_images trg_01_vimg_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_01_vimg_guard BEFORE INSERT OR UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION public.trg_vimg_guard();


--
-- Name: event_applications trg_50_applications_after; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_applications_after AFTER INSERT OR UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION public.trg_applications_after();


--
-- Name: assignments trg_50_assignments_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_assignments_after_insert AFTER INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.trg_assignments_after_insert();


--
-- Name: assignments trg_50_assignments_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_assignments_after_update AFTER UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.trg_assignments_after_update();


--
-- Name: events trg_50_events_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_events_after_insert AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.trg_events_after_insert();


--
-- Name: events trg_50_events_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_events_after_update AFTER UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.trg_events_after_update();


--
-- Name: moderation_actions trg_50_moderation_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_moderation_after_insert AFTER INSERT ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION public.trg_moderation_after_insert();


--
-- Name: user_verification_images trg_50_vimg_after; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_50_vimg_after AFTER INSERT OR UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION public.trg_vimg_after();


--
-- Name: assignments trg_90_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: attendance trg_90_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: coordinator_profiles trg_90_coordinator_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_coordinator_profiles_updated_at BEFORE UPDATE ON public.coordinator_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: event_applications trg_90_event_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_event_applications_updated_at BEFORE UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: event_posts trg_90_event_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_event_posts_updated_at BEFORE UPDATE ON public.event_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: events trg_90_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_verification_images trg_90_user_verification_images_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_user_verification_images_updated_at BEFORE UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_90_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_90_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: event_applications trg_95_applications_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_applications_audit AFTER INSERT OR UPDATE ON public.event_applications FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: assignments trg_95_assignments_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_assignments_audit AFTER INSERT OR UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: attendance trg_95_attendance_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_attendance_audit AFTER INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row('checkin_latitude', 'checkin_longitude');


--
-- Name: volunteer_availability_exceptions trg_95_availability_exceptions_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_availability_exceptions_audit AFTER INSERT OR UPDATE ON public.volunteer_availability_exceptions FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: volunteer_availability_rules trg_95_availability_rules_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_availability_rules_audit AFTER INSERT OR UPDATE ON public.volunteer_availability_rules FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: coordinator_profiles trg_95_coordinator_profiles_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_coordinator_profiles_audit AFTER INSERT OR UPDATE ON public.coordinator_profiles FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: event_posts trg_95_event_posts_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_event_posts_audit AFTER INSERT OR UPDATE ON public.event_posts FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: events trg_95_events_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_events_audit AFTER INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: feedback trg_95_feedback_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_feedback_audit AFTER INSERT OR UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: moderation_actions trg_95_moderation_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_moderation_audit AFTER INSERT ON public.moderation_actions FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: qr_tokens trg_95_qr_tokens_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_qr_tokens_audit AFTER INSERT OR UPDATE ON public.qr_tokens FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: users trg_95_users_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_users_audit AFTER INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: user_verification_images trg_95_verification_images_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_95_verification_images_audit AFTER INSERT OR UPDATE ON public.user_verification_images FOR EACH ROW EXECUTE FUNCTION public.trg_audit_row();


--
-- Name: assignments assignments_assigned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: attendance attendance_confirmed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_confirmed_by_user_id_fkey FOREIGN KEY (confirmed_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: attendance_geo_attempts attendance_geo_attempts_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_geo_attempts
    ADD CONSTRAINT attendance_geo_attempts_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE RESTRICT;


--
-- Name: attendance_geo_attempts attendance_geo_attempts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_geo_attempts
    ADD CONSTRAINT attendance_geo_attempts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: attendance_geo_attempts attendance_geo_attempts_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_geo_attempts
    ADD CONSTRAINT attendance_geo_attempts_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: attendance_geo_attempts attendance_geo_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_geo_attempts
    ADD CONSTRAINT attendance_geo_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: attendance attendance_recorded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: auth_group_permissions auth_group_permissio_permission_id_84c5c92e_fk_auth_perm; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissio_permission_id_84c5c92e_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES public.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_group_permissions auth_group_permissions_group_id_b120cbf9_fk_auth_group_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_b120cbf9_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES public.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_otp_challenge auth_otp_challenge_otp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otp_challenge
    ADD CONSTRAINT auth_otp_challenge_otp_id_fkey FOREIGN KEY (otp_id) REFERENCES public.auth_otp(id) ON DELETE CASCADE;


--
-- Name: auth_permission auth_permission_content_type_id_2f476e4b_fk_django_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_2f476e4b_fk_django_co FOREIGN KEY (content_type_id) REFERENCES public.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: authtoken_token authtoken_token_user_id_35299eff_fk_users_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authtoken_token
    ADD CONSTRAINT authtoken_token_user_id_35299eff_fk_users_id FOREIGN KEY (user_id) REFERENCES public.users(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coordinator_profiles coordinator_profiles_approved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_profiles
    ADD CONSTRAINT coordinator_profiles_approved_by_id_fkey FOREIGN KEY (approved_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: coordinator_profiles coordinator_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_profiles
    ADD CONSTRAINT coordinator_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: django_admin_log django_admin_log_content_type_id_c4bce8eb_fk_django_co; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_content_type_id_c4bce8eb_fk_django_co FOREIGN KEY (content_type_id) REFERENCES public.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: django_admin_log django_admin_log_user_id_c564eba6_fk_users_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.django_admin_log
    ADD CONSTRAINT django_admin_log_user_id_c564eba6_fk_users_id FOREIGN KEY (user_id) REFERENCES public.users(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: event_applications event_applications_decided_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT event_applications_decided_by_id_fkey FOREIGN KEY (decided_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_applications event_applications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT event_applications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: event_applications event_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT event_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_charity_fields event_charity_fields_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_charity_fields
    ADD CONSTRAINT event_charity_fields_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_charity_fields event_charity_fields_field_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_charity_fields
    ADD CONSTRAINT event_charity_fields_field_code_fkey FOREIGN KEY (field_code) REFERENCES public.charity_fields(code) ON DELETE RESTRICT;


--
-- Name: event_coordinator_history event_coordinator_history_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_coordinator_history
    ADD CONSTRAINT event_coordinator_history_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_coordinator_history event_coordinator_history_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_coordinator_history
    ADD CONSTRAINT event_coordinator_history_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: event_coordinator_history event_coordinator_history_from_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_coordinator_history
    ADD CONSTRAINT event_coordinator_history_from_coordinator_id_fkey FOREIGN KEY (from_coordinator_id) REFERENCES public.coordinator_profiles(user_id) ON DELETE RESTRICT;


--
-- Name: event_coordinator_history event_coordinator_history_to_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_coordinator_history
    ADD CONSTRAINT event_coordinator_history_to_coordinator_id_fkey FOREIGN KEY (to_coordinator_id) REFERENCES public.coordinator_profiles(user_id) ON DELETE RESTRICT;


--
-- Name: event_posts event_posts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_posts
    ADD CONSTRAINT event_posts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: events events_current_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_current_coordinator_id_fkey FOREIGN KEY (current_coordinator_id) REFERENCES public.coordinator_profiles(user_id) ON DELETE RESTRICT;


--
-- Name: events events_deleted_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_deleted_by_id_fkey FOREIGN KEY (deleted_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: events events_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.coordinator_profiles(user_id) ON DELETE RESTRICT;


--
-- Name: feedback feedback_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: feedback feedback_rater_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_rater_user_id_fkey FOREIGN KEY (rater_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: feedback feedback_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: event_applications fk_applications_post_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT fk_applications_post_event FOREIGN KEY (post_id, event_id) REFERENCES public.event_posts(id, event_id) ON DELETE RESTRICT;


--
-- Name: event_applications fk_applications_qr_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_applications
    ADD CONSTRAINT fk_applications_qr_event FOREIGN KEY (qr_token_id, event_id) REFERENCES public.qr_tokens(id, event_id) ON DELETE RESTRICT;


--
-- Name: assignments fk_assignments_application; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT fk_assignments_application FOREIGN KEY (application_id, event_id, user_id) REFERENCES public.event_applications(id, event_id, user_id) ON DELETE RESTRICT;


--
-- Name: assignments fk_assignments_post_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT fk_assignments_post_event FOREIGN KEY (post_id, event_id) REFERENCES public.event_posts(id, event_id) ON DELETE RESTRICT;


--
-- Name: attendance fk_attendance_assignment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_assignment FOREIGN KEY (assignment_id, event_id, user_id) REFERENCES public.assignments(id, event_id, user_id) ON DELETE RESTRICT;


--
-- Name: attendance fk_attendance_qr_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_qr_event FOREIGN KEY (qr_token_id, event_id) REFERENCES public.qr_tokens(id, event_id) ON DELETE RESTRICT;


--
-- Name: moderation_actions moderation_actions_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: moderation_actions moderation_actions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: moderation_actions moderation_actions_feedback_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.feedback(id) ON DELETE RESTRICT;


--
-- Name: moderation_actions moderation_actions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: onboarding_acknowledgments onboarding_acknowledgments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_acknowledgments
    ADD CONSTRAINT onboarding_acknowledgments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: onboarding_acknowledgments onboarding_acknowledgments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_acknowledgments
    ADD CONSTRAINT onboarding_acknowledgments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: qr_tokens qr_tokens_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT qr_tokens_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: qr_tokens qr_tokens_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_tokens
    ADD CONSTRAINT qr_tokens_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;


--
-- Name: user_charity_interests user_charity_interests_field_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_charity_interests
    ADD CONSTRAINT user_charity_interests_field_code_fkey FOREIGN KEY (field_code) REFERENCES public.charity_fields(code) ON DELETE RESTRICT;


--
-- Name: user_charity_interests user_charity_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_charity_interests
    ADD CONSTRAINT user_charity_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_verification_images user_verification_images_reviewed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_verification_images
    ADD CONSTRAINT user_verification_images_reviewed_by_id_fkey FOREIGN KEY (reviewed_by_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: user_verification_images user_verification_images_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_verification_images
    ADD CONSTRAINT user_verification_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: volunteer_availability_exceptions volunteer_availability_exceptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_availability_exceptions
    ADD CONSTRAINT volunteer_availability_exceptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: volunteer_availability_rules volunteer_availability_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_availability_rules
    ADD CONSTRAINT volunteer_availability_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict bLgVRfrwM4S4tzCu7wsiLoLWIFIIpnRmslKWxJCJi2uj8abYMWdU7fp3t1vGpBS

