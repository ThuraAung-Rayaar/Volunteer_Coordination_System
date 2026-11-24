-- =============================================================================
-- 03_user_interests_and_availability.sql
-- Synthetic charity interests, availability rules, and exceptions
-- =============================================================================

-- 1. User Charity Interests
INSERT INTO user_charity_interests (user_id, field_code)
SELECT u.user_id, c.code
FROM temp_synth_users u
CROSS JOIN LATERAL (
    SELECT code FROM charity_fields
    WHERE code <> 'other'
    ORDER BY hashtext(u.cohort_tag || code)
    LIMIT 3
) c
ON CONFLICT (user_id, field_code) DO NOTHING;

-- 2. Volunteer Availability Rules (Recurring weekly windows)
INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time, valid_from, valid_to)
SELECT u.user_id, w.day, '09:00:00'::time, '17:00:00'::time, '2026-01-01'::date, '2027-12-31'::date
FROM temp_synth_users u
CROSS JOIN (VALUES (6), (7)) AS w(day)
WHERE u.role_type = 'volunteer'
ON CONFLICT (user_id, weekday, start_time) DO NOTHING;

INSERT INTO volunteer_availability_rules (user_id, weekday, start_time, end_time, valid_from, valid_to)
SELECT u.user_id, 3, '13:00:00'::time, '18:00:00'::time, '2026-01-01'::date, '2027-12-31'::date
FROM temp_synth_users u
WHERE u.role_type = 'volunteer' AND (u.user_id % 2 = 0)
ON CONFLICT (user_id, weekday, start_time) DO NOTHING;

-- 3. Volunteer Availability Exceptions (Blackouts)
INSERT INTO volunteer_availability_exceptions (user_id, date, is_available, note)
SELECT u.user_id, '2026-12-25'::date, false, 'Christmas holiday blackout [SYNTHETIC]'
FROM temp_synth_users u
WHERE u.role_type = 'volunteer' AND (u.user_id % 3 = 0)
ON CONFLICT (user_id, date) DO NOTHING;

INSERT INTO volunteer_availability_exceptions (user_id, date, is_available, note)
SELECT u.user_id, '2027-01-01'::date, false, 'New Year holiday blackout [SYNTHETIC]'
FROM temp_synth_users u
WHERE u.role_type = 'volunteer' AND (u.user_id % 3 = 1)
ON CONFLICT (user_id, date) DO NOTHING;
