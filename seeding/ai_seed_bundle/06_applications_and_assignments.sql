-- =============================================================================
-- 06_applications_and_assignments.sql
-- Generates applications and delegates assignment creation to PostgreSQL triggers/functions
-- Target volume: 750-1,050 applications (5-7 per event) within post headcounts
-- =============================================================================

-- 1. General Support Volunteer applications (4 applicants per event, post headcount is 6)
-- When acceptance_mode = 'auto', trg_applications_after calls create_assignment_from_application()
-- For concurrent active events, volunteer pools are strictly partitioned by parity (odd vs even ev_rank)
-- guaranteeing zero overlap and satisfying the GiST exclusion constraint ex_assignments_no_overlap.
WITH ranked_events AS (
    SELECT te.event_id, te.cohort_key, te.cluster, te.lifecycle,
           ROW_NUMBER() OVER (PARTITION BY te.cluster, te.lifecycle ORDER BY te.cohort_key) AS ev_rank
    FROM temp_synth_events te
)
INSERT INTO event_applications (event_id, post_id, user_id, source, note)
SELECT re.event_id, p.id, u.user_id, 'browse', 'Ready to assist in community project [SYNTHETIC]'
FROM ranked_events re
JOIN event_posts p ON p.event_id = re.event_id AND p.title = 'General Support Volunteer'
JOIN LATERAL (
    SELECT u.user_id
    FROM temp_synth_users u
    WHERE u.cluster = re.cluster AND u.role_type = 'volunteer'
      AND (re.lifecycle <> 'active' OR (u.user_id % 2 = (re.ev_rank % 2)))
    ORDER BY hashtext(re.cohort_key || u.cohort_tag)
    LIMIT 4
) u ON true
WHERE re.lifecycle IN ('published', 'active', 'completed', 'cancelled')
ON CONFLICT DO NOTHING;

-- 2. Logistics & Distribution Crew applications (3 distinct applicants per event, post headcount is 4)
WITH ranked_events AS (
    SELECT te.event_id, te.cohort_key, te.cluster, te.lifecycle,
           ROW_NUMBER() OVER (PARTITION BY te.cluster, te.lifecycle ORDER BY te.cohort_key) AS ev_rank
    FROM temp_synth_events te
)
INSERT INTO event_applications (event_id, post_id, user_id, source, note)
SELECT re.event_id, p.id, u.user_id, 'browse', 'Experienced logistics volunteer ready to help [SYNTHETIC]'
FROM ranked_events re
JOIN event_posts p ON p.event_id = re.event_id AND p.title = 'Logistics & Distribution Crew'
JOIN LATERAL (
    SELECT u.user_id
    FROM temp_synth_users u
    WHERE u.cluster = re.cluster AND u.role_type = 'volunteer'
      AND u.user_id NOT IN (SELECT ap.user_id FROM event_applications ap WHERE ap.event_id = re.event_id)
      AND (re.lifecycle <> 'active' OR (u.user_id % 2 = (re.ev_rank % 2)))
    ORDER BY hashtext(re.cohort_key || u.cohort_tag || 'logistics')
    LIMIT 3
) u ON true
WHERE re.lifecycle IN ('published', 'active', 'completed', 'cancelled')
ON CONFLICT DO NOTHING;

-- 3. For manually accepted events, update pending applications to accepted
UPDATE event_applications ap
SET status = 'accepted',
    decided_by_id = e.current_coordinator_id,
    decided_at = now()
FROM events e
WHERE e.id = ap.event_id
  AND e.acceptance_mode = 'manual'
  AND ap.status = 'pending';
