-- =============================================================================
-- 07_attendance_and_onboarding.sql
-- Handles onboarding acknowledgments, event activation, check-ins, and completion
-- =============================================================================

-- 1. Onboarding Acknowledgments for events requiring acknowledgment
INSERT INTO onboarding_acknowledgments (user_id, event_id, onboarding_version, method, acknowledged_at)
SELECT a.user_id, a.event_id, 1, 'app_tick', now()
FROM attendance a
JOIN events e ON e.id = a.event_id
JOIN temp_synth_events te ON te.event_id = a.event_id
WHERE e.require_onboarding_ack
  AND e.status IN ('published', 'active')
ON CONFLICT (user_id, event_id, onboarding_version) DO NOTHING;

-- 2. Transition active and completed events from published -> active
-- Active events are retimed to current ongoing window (started 2h ago, ends in 3h)
-- ck_events_deadline requires application_deadline <= start_at
UPDATE events
SET start_at = now() - interval '2 hours',
    end_at = now() + interval '3 hours',
    application_deadline = now() - interval '3 hours',
    status = 'active'
WHERE id IN (
    SELECT event_id FROM temp_synth_events
    WHERE lifecycle = 'active'
) AND status = 'published';

UPDATE assignments asg
SET schedule_start = e.start_at,
    schedule_end = e.end_at
FROM events e
WHERE asg.event_id = e.id
  AND e.id IN (SELECT event_id FROM temp_synth_events WHERE lifecycle = 'active');

UPDATE events
SET status = 'active'
WHERE id IN (
    SELECT event_id FROM temp_synth_events
    WHERE lifecycle = 'completed'
) AND status = 'published';

-- 3. Mark check-ins for active and completed events (coordinator_manual check-in, NO false GPS)
UPDATE attendance a
SET status = 'checked_in',
    method = 'coordinator_manual',
    recorded_by_user_id = e.current_coordinator_id,
    checkin_at = now() - interval '1 hour'
FROM events e
WHERE a.event_id = e.id
  AND e.id IN (SELECT event_id FROM temp_synth_events WHERE lifecycle IN ('active', 'completed'))
  AND (a.user_id % 4 <> 0); -- ~75% checked in, ~25% expected (will become absent on completion)

-- 4. Complete the 90 completed events:
-- First retime event start/end and assignment schedules to historical occurrence dates,
-- then transition active -> completed.
-- trg_events_after_update automatically converts checked_in -> completed, expected -> absent!
UPDATE assignments asg
SET schedule_start = h.hist_start,
    schedule_end = h.hist_end
FROM temp_hist_event_dates h
WHERE asg.event_id = h.event_id;

UPDATE events e
SET start_at = h.hist_start,
    end_at = h.hist_end,
    application_deadline = h.hist_deadline,
    status = 'completed'
FROM temp_hist_event_dates h
WHERE e.id = h.event_id
  AND e.status = 'active';

-- 5. Cancel the 15 cancelled events
UPDATE events
SET status = 'cancelled',
    cancel_reason = 'Synthetic weather advisory and volunteer schedule adjustment [SYNTHETIC]'
WHERE id IN (SELECT event_id FROM temp_synth_events WHERE lifecycle = 'cancelled')
  AND status = 'published';
