-- =============================================================================
-- 08_feedback_and_coordinator_changes.sql
-- Creates synthetic volunteer & coordinator feedback, and coordinator reassignments
-- =============================================================================

-- 1. Volunteer to Event Feedback
INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
SELECT att.event_id, att.user_id, NULL, 'volunteer_to_event', 5,
       ARRAY['well_organized', 'friendly_staff']::text[],
       'Great experience supporting community welfare! [SYNTHETIC]', 'active'
FROM attendance att
JOIN temp_synth_events te ON te.event_id = att.event_id
WHERE te.lifecycle = 'completed' AND att.status = 'completed' AND (att.user_id % 5 = 1)
ON CONFLICT DO NOTHING;

-- 2. Coordinator to Volunteer Feedback
INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
SELECT att.event_id, e.current_coordinator_id, att.user_id, 'coordinator_to_volunteer', 5,
       ARRAY['punctual', 'team_player']::text[],
       'Dedicated volunteer, arrived early and handled responsibilities reliably. [SYNTHETIC]', 'active'
FROM attendance att
JOIN events e ON e.id = att.event_id
JOIN temp_synth_events te ON te.event_id = att.event_id
WHERE te.lifecycle = 'completed' AND att.status = 'completed' AND (att.user_id % 5 = 2)
ON CONFLICT DO NOTHING;

-- 3. Volunteer to Coordinator Feedback
INSERT INTO feedback (event_id, rater_user_id, target_user_id, direction, score, tags, comment, status)
SELECT att.event_id, att.user_id, e.current_coordinator_id, 'volunteer_to_coordinator', 5,
       ARRAY['helpful', 'clear_instructions']::text[],
       'Clear guidance throughout the shift. Appreciated the support! [SYNTHETIC]', 'active'
FROM attendance att
JOIN events e ON e.id = att.event_id
JOIN temp_synth_events te ON te.event_id = att.event_id
WHERE te.lifecycle = 'completed' AND att.status = 'completed' AND (att.user_id % 5 = 3)
ON CONFLICT DO NOTHING;

-- 4. Controlled Coordinator Changes (Append-Only Event Coordinator History)
-- Reassign a published event to another approved coordinator in the same cluster
DO $$
DECLARE
    r RECORD;
    v_alt_coord BIGINT;
BEGIN
    FOR r IN (
        SELECT te.event_id, te.cluster, e.current_coordinator_id
        FROM temp_synth_events te
        JOIN events e ON e.id = te.event_id
        WHERE te.lifecycle = 'published'
        LIMIT 5
    ) LOOP
        SELECT u.user_id INTO v_alt_coord
        FROM temp_synth_users u
        WHERE u.cluster = r.cluster
          AND u.role_type = 'coordinator_approved'
          AND u.user_id <> r.current_coordinator_id
        LIMIT 1;

        IF v_alt_coord IS NOT NULL THEN
            PERFORM set_config('app.reason', 'Operational schedule rotation handover [SYNTHETIC]', true);
            UPDATE events SET current_coordinator_id = v_alt_coord WHERE id = r.event_id;
        END IF;
    END LOOP;
END;
$$;
