-- 06_ai_consumer_readiness.sql
-- Strictly READ-ONLY check for AI tools, Recommendation, and Staffing insights
-- Zero PII

-- 1. Views required by AI query service and coordinator analytics
SELECT
    table_name,
    EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = v.table_name
    ) AS view_exists
FROM (VALUES
    ('v_public_events'),
    ('v_event_summary'),
    ('v_event_post_capacity'),
    ('v_accepted_unassigned'),
    ('v_pending_confirmations'),
    ('v_event_checkin_board'),
    ('v_geo_attempts_review')
) AS v(table_name);

-- 2. Staffing insight capacity view reconciliation
SELECT
    COUNT(*) AS total_posts_in_view,
    SUM(required_headcount) AS total_required_headcount,
    SUM(assigned_count) AS total_assigned_count,
    SUM(remaining) AS total_remaining_slots
FROM v_event_post_capacity;

-- 3. Recommendation ranking availability rules count
SELECT
    (SELECT count(*) FROM volunteer_availability_rules) AS availability_rules_count,
    (SELECT count(*) FROM volunteer_availability_exceptions) AS availability_exceptions_count,
    (SELECT count(*) FROM user_charity_interests) AS user_charity_interests_count;
