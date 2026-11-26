-- =============================================================================
-- 05_events_and_posts.sql
-- Inserts 150 events (30 per cluster), event charity links, and 2-3 posts per event
-- Follows strict lifecycle: created in draft with future dates, posts added, then published
-- =============================================================================

-- 1. Insert 150 synthetic events in draft status
INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.825543, 96.134884,
    false, '2026-12-02 22:49:17+0630'::timestamptz, '2026-12-03 02:49:17+0630'::timestamptz, '2026-11-30 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_01', id, 'Yangon', 'completed', 'u_206', 'u_206'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_01', id, '2026-10-12 17:49:17+0630'::timestamptz, '2026-10-12 21:49:17+0630'::timestamptz, '2026-10-10 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Monsoon Flood Preparedness #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.812937, 96.126873,
    false, '2026-12-22 23:49:17+0630'::timestamptz, '2026-12-23 03:49:17+0630'::timestamptz, '2026-12-20 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_02', id, 'Yangon', 'published', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    'Yangon Mobile Blood Donation Support #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.813596, 96.126261,
    false, '2026-12-04 22:49:17+0630'::timestamptz, '2026-12-05 02:49:17+0630'::timestamptz, '2026-12-02 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_03', id, 'Yangon', 'completed', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_03', id, '2026-08-09 14:49:17+0630'::timestamptz, '2026-08-09 18:49:17+0630'::timestamptz, '2026-08-07 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    'Yangon Mobile Blood Donation Support #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.816847, 96.124151,
    false, '2026-12-05 21:49:17+0630'::timestamptz, '2026-12-06 01:49:17+0630'::timestamptz, '2026-12-03 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_04', id, 'Yangon', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_04', id, '2026-07-08 14:49:17+0630'::timestamptz, '2026-07-08 18:49:17+0630'::timestamptz, '2026-07-06 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    'Yangon Shelter Animal Welfare & Feeding #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.819347, 96.128591,
    false, '2026-12-06 23:49:17+0630'::timestamptz, '2026-12-07 03:49:17+0630'::timestamptz, '2026-12-04 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_05', id, 'Yangon', 'active', 'u_206', 'u_206'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    'Yangon Public Health Awareness Outreach #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.825969, 96.13222,
    false, '2027-02-24 22:49:17+0630'::timestamptz, '2027-02-25 02:49:17+0630'::timestamptz, '2027-02-22 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_06', id, 'Yangon', 'published', 'u_306', 'u_306'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_303'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_303'),
    'Yangon Elderly Care & Support Day #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.816831, 96.125045,
    false, '2026-12-08 23:49:17+0630'::timestamptz, '2026-12-09 03:49:17+0630'::timestamptz, '2026-12-06 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Elderly Care & Support Day #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_07', id, 'Yangon', 'completed', 'u_303', 'u_303'
FROM events WHERE title = 'Yangon Elderly Care & Support Day #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_07', id, '2026-04-03 17:49:17+0630'::timestamptz, '2026-04-03 21:49:17+0630'::timestamptz, '2026-04-01 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Elderly Care & Support Day #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    'Yangon Monsoon Flood Preparedness #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.817371, 96.129407,
    false, '2026-12-09 22:49:17+0630'::timestamptz, '2026-12-10 02:49:17+0630'::timestamptz, '2026-12-07 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_08', id, 'Yangon', 'cancelled', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    'Yangon Youth Education & Tutoring #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.814643, 96.122072,
    false, '2026-12-11 00:49:17+0630'::timestamptz, '2026-12-11 04:49:17+0630'::timestamptz, '2026-12-09 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_09', id, 'Yangon', 'draft', 'u_206', 'u_206'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    'Yangon Shelter Animal Welfare & Feeding #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.821491, 96.132732,
    false, '2026-12-11 23:49:17+0630'::timestamptz, '2026-12-12 03:49:17+0630'::timestamptz, '2026-12-09 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_10', id, 'Yangon', 'completed', 'u_306', 'u_306'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_10', id, '2025-12-28 14:49:17+0630'::timestamptz, '2025-12-28 18:49:17+0630'::timestamptz, '2025-12-26 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Shelter Animal Welfare & Feeding #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.81447, 96.133143,
    false, '2026-12-12 22:49:17+0630'::timestamptz, '2026-12-13 02:49:17+0630'::timestamptz, '2026-12-10 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_11', id, 'Yangon', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_11', id, '2025-11-26 15:49:17+0630'::timestamptz, '2025-11-26 19:49:17+0630'::timestamptz, '2025-11-24 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Public Health Awareness Outreach #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.826072, 96.134693,
    false, '2026-12-13 21:49:17+0630'::timestamptz, '2026-12-14 01:49:17+0630'::timestamptz, '2026-12-11 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_12', id, 'Yangon', 'cancelled', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Youth Education & Tutoring #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.813784, 96.131236,
    false, '2026-12-14 23:49:17+0630'::timestamptz, '2026-12-15 03:49:17+0630'::timestamptz, '2026-12-12 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_13', id, 'Yangon', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_13', id, '2025-09-23 17:49:17+0630'::timestamptz, '2025-09-23 21:49:17+0630'::timestamptz, '2025-09-21 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    'Yangon Public Health Awareness Outreach #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.811323, 96.122326,
    false, '2027-07-02 21:49:17+0630'::timestamptz, '2027-07-03 01:49:17+0630'::timestamptz, '2027-06-30 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_14', id, 'Yangon', 'published', 'u_005', 'u_005'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    'Yangon Community Food Distribution #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.815634, 96.131459,
    false, '2026-12-16 23:49:17+0630'::timestamptz, '2026-12-17 03:49:17+0630'::timestamptz, '2026-12-14 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_15', id, 'Yangon', 'completed', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Community Food Distribution #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_15', id, '2025-07-21 16:49:17+0630'::timestamptz, '2025-07-21 20:49:17+0630'::timestamptz, '2025-07-19 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Food Distribution #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    'Yangon Community Food Distribution #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.815423, 96.121694,
    false, '2026-12-17 22:49:17+0630'::timestamptz, '2026-12-18 02:49:17+0630'::timestamptz, '2026-12-15 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_16', id, 'Yangon', 'completed', 'u_206', 'u_206'
FROM events WHERE title = 'Yangon Community Food Distribution #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_16', id, '2025-06-19 18:49:17+0630'::timestamptz, '2025-06-19 22:49:17+0630'::timestamptz, '2025-06-17 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Food Distribution #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    'Yangon Elderly Care & Support Day #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.821429, 96.132243,
    false, '2026-12-18 23:49:17+0630'::timestamptz, '2026-12-19 03:49:17+0630'::timestamptz, '2026-12-16 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Elderly Care & Support Day #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_17', id, 'Yangon', 'completed', 'u_306', 'u_306'
FROM events WHERE title = 'Yangon Elderly Care & Support Day #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_17', id, '2025-05-18 14:49:17+0630'::timestamptz, '2025-05-18 18:49:17+0630'::timestamptz, '2025-05-16 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Elderly Care & Support Day #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_303'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_303'),
    'Yangon Mobile Blood Donation Support #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.820212, 96.121942,
    false, '2026-12-20 00:49:17+0630'::timestamptz, '2026-12-20 04:49:17+0630'::timestamptz, '2026-12-18 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_18', id, 'Yangon', 'active', 'u_303', 'u_303'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    'Yangon Youth Education & Tutoring #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.816441, 96.129826,
    false, '2026-12-21 00:49:17+0630'::timestamptz, '2026-12-21 04:49:17+0630'::timestamptz, '2026-12-19 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_19', id, 'Yangon', 'completed', 'u_306', 'u_306'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_19', id, '2025-03-15 18:49:17+0630'::timestamptz, '2025-03-15 22:49:17+0630'::timestamptz, '2025-03-13 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    'Yangon Shelter Animal Welfare & Feeding #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.816636, 96.128734,
    false, '2026-12-21 21:49:17+0630'::timestamptz, '2026-12-22 01:49:17+0630'::timestamptz, '2026-12-19 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_20', id, 'Yangon', 'completed', 'u_206', 'u_206'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_20', id, '2025-02-11 17:49:17+0630'::timestamptz, '2025-02-11 21:49:17+0630'::timestamptz, '2025-02-09 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    'Yangon Elderly Care & Support Day #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.816666, 96.128433,
    false, '2026-12-22 23:49:17+0630'::timestamptz, '2026-12-23 03:49:17+0630'::timestamptz, '2026-12-20 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Elderly Care & Support Day #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_21', id, 'Yangon', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Yangon Elderly Care & Support Day #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_21', id, '2025-01-10 17:49:17+0630'::timestamptz, '2025-01-10 21:49:17+0630'::timestamptz, '2025-01-08 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Elderly Care & Support Day #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Community Environmental Cleanup #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.82353, 96.135282,
    false, '2027-11-07 23:49:17+0630'::timestamptz, '2027-11-08 03:49:17+0630'::timestamptz, '2027-11-05 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Environmental Cleanup #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_22', id, 'Yangon', 'published', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Community Environmental Cleanup #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_303'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_303'),
    'Yangon Youth Education & Tutoring #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.814281, 96.132006,
    false, '2026-12-24 21:49:17+0630'::timestamptz, '2026-12-25 01:49:17+0630'::timestamptz, '2026-12-22 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_23', id, 'Yangon', 'completed', 'u_303', 'u_303'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_23', id, '2024-11-07 17:49:17+0630'::timestamptz, '2024-11-07 21:49:17+0630'::timestamptz, '2024-11-05 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    'Yangon Community Food Distribution #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.817049, 96.126013,
    false, '2026-12-25 22:49:17+0630'::timestamptz, '2026-12-26 02:49:17+0630'::timestamptz, '2026-12-23 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_24', id, 'Yangon', 'cancelled', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Community Food Distribution #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Mobile Blood Donation Support #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.823441, 96.122951,
    false, '2026-12-26 23:49:17+0630'::timestamptz, '2026-12-27 03:49:17+0630'::timestamptz, '2026-12-24 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_25', id, 'Yangon', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_25', id, '2024-09-04 16:49:17+0630'::timestamptz, '2024-09-04 20:49:17+0630'::timestamptz, '2024-09-02 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_206'),
    'Yangon Shelter Animal Welfare & Feeding #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.820875, 96.130715,
    false, '2028-01-11 00:49:17+0630'::timestamptz, '2028-01-11 04:49:17+0630'::timestamptz, '2028-01-09 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_26', id, 'Yangon', 'published', 'u_206', 'u_206'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    'Yangon Community Environmental Cleanup #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.816961, 96.124549,
    false, '2026-12-28 21:49:17+0630'::timestamptz, '2026-12-29 01:49:17+0630'::timestamptz, '2026-12-26 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Environmental Cleanup #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_27', id, 'Yangon', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Yangon Community Environmental Cleanup #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_27', id, '2024-07-02 15:49:17+0630'::timestamptz, '2024-07-02 19:49:17+0630'::timestamptz, '2024-06-30 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Environmental Cleanup #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    'Yangon Public Health Awareness Outreach #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.82586, 96.132419,
    false, '2028-02-11 23:49:17+0630'::timestamptz, '2028-02-12 03:49:17+0630'::timestamptz, '2028-02-09 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_28', id, 'Yangon', 'published', 'u_005', 'u_005'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_005'),
    'Yangon Youth Education & Tutoring #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.812364, 96.123934,
    false, '2026-12-30 22:49:17+0630'::timestamptz, '2026-12-31 02:49:17+0630'::timestamptz, '2026-12-28 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_29', id, 'Yangon', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_29', id, '2024-04-29 16:49:17+0630'::timestamptz, '2024-04-29 20:49:17+0630'::timestamptz, '2024-04-27 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Yangon Community Environmental Cleanup #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.826099, 96.123878,
    false, '2026-12-31 23:49:17+0630'::timestamptz, '2027-01-01 03:49:17+0630'::timestamptz, '2026-12-29 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Environmental Cleanup #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_30', id, 'Yangon', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Yangon Community Environmental Cleanup #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_30', id, '2024-03-28 14:49:17+0630'::timestamptz, '2024-03-28 18:49:17+0630'::timestamptz, '2024-03-26 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Environmental Cleanup #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    'Mandalay Community Food Distribution #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.957281, 96.085984,
    false, '2027-01-01 22:49:17+0630'::timestamptz, '2027-01-02 02:49:17+0630'::timestamptz, '2026-12-30 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Food Distribution #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_01', id, 'Mandalay', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Mandalay Community Food Distribution #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_01', id, '2026-10-12 18:49:17+0630'::timestamptz, '2026-10-12 22:49:17+0630'::timestamptz, '2026-10-10 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Food Distribution #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Elderly Care & Support Day #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.95612, 96.090261,
    false, '2026-12-22 21:49:17+0630'::timestamptz, '2026-12-23 01:49:17+0630'::timestamptz, '2026-12-20 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_02', id, 'Mandalay', 'published', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    'Mandalay Community Food Distribution #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.95942, 96.090698,
    false, '2027-01-03 22:49:17+0630'::timestamptz, '2027-01-04 02:49:17+0630'::timestamptz, '2027-01-01 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Food Distribution #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_03', id, 'Mandalay', 'completed', 'u_403', 'u_403'
FROM events WHERE title = 'Mandalay Community Food Distribution #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_03', id, '2026-08-09 17:49:17+0630'::timestamptz, '2026-08-09 21:49:17+0630'::timestamptz, '2026-08-07 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Food Distribution #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Community Environmental Cleanup #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.958746, 96.091974,
    false, '2027-01-04 21:49:17+0630'::timestamptz, '2027-01-05 01:49:17+0630'::timestamptz, '2027-01-02 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Environmental Cleanup #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_04', id, 'Mandalay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_04', id, '2026-07-08 15:49:17+0630'::timestamptz, '2026-07-08 19:49:17+0630'::timestamptz, '2026-07-06 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    'Mandalay Community Environmental Cleanup #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.952671, 96.095945,
    false, '2027-01-05 21:49:17+0630'::timestamptz, '2027-01-06 01:49:17+0630'::timestamptz, '2027-01-03 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Environmental Cleanup #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_05', id, 'Mandalay', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_05', id, '2026-06-06 18:49:17+0630'::timestamptz, '2026-06-06 22:49:17+0630'::timestamptz, '2026-06-04 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    'Mandalay Community Environmental Cleanup #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.965782, 96.093362,
    false, '2027-02-24 23:49:17+0630'::timestamptz, '2027-02-25 03:49:17+0630'::timestamptz, '2027-02-22 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Environmental Cleanup #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_06', id, 'Mandalay', 'published', 'u_103', 'u_103'
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    'Mandalay Mobile Blood Donation Support #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.960651, 96.083628,
    false, '2027-01-07 21:49:17+0630'::timestamptz, '2027-01-08 01:49:17+0630'::timestamptz, '2027-01-05 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_07', id, 'Mandalay', 'cancelled', 'u_305', 'u_305'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    'Mandalay Mobile Blood Donation Support #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.954633, 96.089109,
    false, '2027-01-08 22:49:17+0630'::timestamptz, '2027-01-09 02:49:17+0630'::timestamptz, '2027-01-06 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_08', id, 'Mandalay', 'completed', 'u_103', 'u_103'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_08', id, '2026-03-02 14:49:17+0630'::timestamptz, '2026-03-02 18:49:17+0630'::timestamptz, '2026-02-28 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.95632, 96.085105,
    false, '2027-01-10 00:49:17+0630'::timestamptz, '2027-01-10 04:49:17+0630'::timestamptz, '2027-01-08 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_09', id, 'Mandalay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_09', id, '2026-01-29 14:49:17+0630'::timestamptz, '2026-01-29 18:49:17+0630'::timestamptz, '2026-01-27 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    'Mandalay Public Health Awareness Outreach #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.957553, 96.083491,
    false, '2027-04-29 23:49:17+0630'::timestamptz, '2027-04-30 03:49:17+0630'::timestamptz, '2027-04-27 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_10', id, 'Mandalay', 'published', 'u_305', 'u_305'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    'Mandalay Monsoon Flood Preparedness #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.963637, 96.086744,
    false, '2027-01-12 00:49:17+0630'::timestamptz, '2027-01-12 04:49:17+0630'::timestamptz, '2027-01-10 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_11', id, 'Mandalay', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_11', id, '2025-11-26 18:49:17+0630'::timestamptz, '2025-11-26 22:49:17+0630'::timestamptz, '2025-11-24 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Community Food Distribution #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.952218, 96.082073,
    false, '2027-01-12 22:49:17+0630'::timestamptz, '2027-01-13 02:49:17+0630'::timestamptz, '2027-01-10 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Food Distribution #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_12', id, 'Mandalay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Community Food Distribution #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_12', id, '2025-10-25 15:49:17+0630'::timestamptz, '2025-10-25 19:49:17+0630'::timestamptz, '2025-10-23 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Food Distribution #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_406'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_406'),
    'Mandalay Shelter Animal Welfare & Feeding #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.966033, 96.09214,
    false, '2027-06-17 00:49:17+0630'::timestamptz, '2027-06-17 04:49:17+0630'::timestamptz, '2027-06-15 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_13', id, 'Mandalay', 'published', 'u_406', 'u_406'
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Public Health Awareness Outreach #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.953597, 96.086085,
    false, '2027-01-14 21:49:17+0630'::timestamptz, '2027-01-15 01:49:17+0630'::timestamptz, '2027-01-12 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_14', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_14', id, '2025-08-22 17:49:17+0630'::timestamptz, '2025-08-22 21:49:17+0630'::timestamptz, '2025-08-20 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_406'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_406'),
    'Mandalay Public Health Awareness Outreach #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.961566, 96.085269,
    false, '2027-01-16 00:49:17+0630'::timestamptz, '2027-01-16 04:49:17+0630'::timestamptz, '2027-01-14 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_15', id, 'Mandalay', 'cancelled', 'u_406', 'u_406'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    'Mandalay Youth Education & Tutoring #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.961913, 96.087453,
    false, '2027-01-16 21:49:17+0630'::timestamptz, '2027-01-17 01:49:17+0630'::timestamptz, '2027-01-14 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_16', id, 'Mandalay', 'active', 'u_403', 'u_403'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    'Mandalay Monsoon Flood Preparedness #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.955951, 96.087827,
    false, '2027-01-17 22:49:17+0630'::timestamptz, '2027-01-18 02:49:17+0630'::timestamptz, '2027-01-15 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_17', id, 'Mandalay', 'completed', 'u_103', 'u_103'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_17', id, '2025-05-18 17:49:17+0630'::timestamptz, '2025-05-18 21:49:17+0630'::timestamptz, '2025-05-16 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Elderly Care & Support Day #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.958375, 96.087633,
    false, '2027-01-18 22:49:17+0630'::timestamptz, '2027-01-19 02:49:17+0630'::timestamptz, '2027-01-16 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_18', id, 'Mandalay', 'active', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Elderly Care & Support Day #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.951471, 96.08728,
    false, '2027-01-19 23:49:17+0630'::timestamptz, '2027-01-20 03:49:17+0630'::timestamptz, '2027-01-17 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_19', id, 'Mandalay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_19', id, '2025-03-15 18:49:17+0630'::timestamptz, '2025-03-15 22:49:17+0630'::timestamptz, '2025-03-13 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.952209, 96.095863,
    false, '2027-01-20 23:49:17+0630'::timestamptz, '2027-01-21 03:49:17+0630'::timestamptz, '2027-01-18 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_20', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_20', id, '2025-02-11 17:49:17+0630'::timestamptz, '2025-02-11 21:49:17+0630'::timestamptz, '2025-02-09 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_103'),
    'Mandalay Community Food Distribution #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.955075, 96.08516,
    false, '2027-01-21 22:49:17+0630'::timestamptz, '2027-01-22 02:49:17+0630'::timestamptz, '2027-01-19 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Food Distribution #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_21', id, 'Mandalay', 'completed', 'u_103', 'u_103'
FROM events WHERE title = 'Mandalay Community Food Distribution #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_21', id, '2025-01-10 14:49:17+0630'::timestamptz, '2025-01-10 18:49:17+0630'::timestamptz, '2025-01-08 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Food Distribution #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    'Mandalay Youth Education & Tutoring #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.959349, 96.085257,
    false, '2027-01-22 21:49:17+0630'::timestamptz, '2027-01-23 01:49:17+0630'::timestamptz, '2027-01-20 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_22', id, 'Mandalay', 'cancelled', 'u_403', 'u_403'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Public Health Awareness Outreach #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.955348, 96.088449,
    false, '2027-01-23 21:49:17+0630'::timestamptz, '2027-01-24 01:49:17+0630'::timestamptz, '2027-01-21 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_23', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_23', id, '2024-11-07 14:49:17+0630'::timestamptz, '2024-11-07 18:49:17+0630'::timestamptz, '2024-11-05 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_305'),
    'Mandalay Community Environmental Cleanup #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.954654, 96.087209,
    false, '2027-01-24 23:49:17+0630'::timestamptz, '2027-01-25 03:49:17+0630'::timestamptz, '2027-01-22 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Environmental Cleanup #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_24', id, 'Mandalay', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_24', id, '2024-10-06 16:49:17+0630'::timestamptz, '2024-10-06 20:49:17+0630'::timestamptz, '2024-10-04 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.95227, 96.086281,
    false, '2027-12-26 00:49:17+0630'::timestamptz, '2027-12-26 04:49:17+0630'::timestamptz, '2027-12-24 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_25', id, 'Mandalay', 'published', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.954281, 96.083295,
    false, '2027-01-26 21:49:17+0630'::timestamptz, '2027-01-27 01:49:17+0630'::timestamptz, '2027-01-24 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_26', id, 'Mandalay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_26', id, '2024-08-03 14:49:17+0630'::timestamptz, '2024-08-03 18:49:17+0630'::timestamptz, '2024-08-01 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_406'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_406'),
    'Mandalay Monsoon Flood Preparedness #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.958988, 96.088955,
    false, '2027-01-27 23:49:17+0630'::timestamptz, '2027-01-28 03:49:17+0630'::timestamptz, '2027-01-25 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_27', id, 'Mandalay', 'completed', 'u_406', 'u_406'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_27', id, '2024-07-02 18:49:17+0630'::timestamptz, '2024-07-02 22:49:17+0630'::timestamptz, '2024-06-30 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.959257, 96.092445,
    false, '2027-01-28 23:49:17+0630'::timestamptz, '2027-01-29 03:49:17+0630'::timestamptz, '2027-01-26 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_28', id, 'Mandalay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_28', id, '2024-05-31 16:49:17+0630'::timestamptz, '2024-05-31 20:49:17+0630'::timestamptz, '2024-05-29 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Public Health Awareness Outreach #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.953823, 96.089429,
    false, '2028-02-27 21:49:17+0630'::timestamptz, '2028-02-28 01:49:17+0630'::timestamptz, '2028-02-25 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_29', id, 'Mandalay', 'published', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Public Health Awareness Outreach #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.959213, 96.090099,
    false, '2027-01-30 22:49:17+0630'::timestamptz, '2027-01-31 02:49:17+0630'::timestamptz, '2027-01-28 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_30', id, 'Mandalay', 'draft', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    'Pyay Public Health Awareness Outreach #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Paungde Rural Outreach Station', 'Near Paungde Clock Tower', 18.826321, 95.22757,
    false, '2027-01-31 21:49:17+0630'::timestamptz, '2027-02-01 01:49:17+0630'::timestamptz, '2027-01-29 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_01', id, 'Pyay', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_01', id, '2026-10-12 15:49:17+0630'::timestamptz, '2026-10-12 19:49:17+0630'::timestamptz, '2026-10-10 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Pyay Mobile Blood Donation Support #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.824474, 95.222953,
    false, '2027-02-01 22:49:17+0630'::timestamptz, '2027-02-02 02:49:17+0630'::timestamptz, '2027-01-30 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Mobile Blood Donation Support #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_02', id, 'Pyay', 'completed', 'u_105', 'u_105'
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_02', id, '2026-09-10 17:49:17+0630'::timestamptz, '2026-09-10 21:49:17+0630'::timestamptz, '2026-09-08 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Pyay Community Environmental Cleanup #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.829322, 95.226924,
    false, '2027-01-08 00:49:17+0630'::timestamptz, '2027-01-08 04:49:17+0630'::timestamptz, '2027-01-06 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Environmental Cleanup #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_03', id, 'Pyay', 'published', 'u_105', 'u_105'
FROM events WHERE title = 'Pyay Community Environmental Cleanup #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Pyay Community Food Distribution #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.824854, 95.219129,
    false, '2027-02-04 00:49:17+0630'::timestamptz, '2027-02-04 04:49:17+0630'::timestamptz, '2027-02-02 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_04', id, 'Pyay', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Pyay Community Food Distribution #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_04', id, '2026-07-08 17:49:17+0630'::timestamptz, '2026-07-08 21:49:17+0630'::timestamptz, '2026-07-06 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.825421, 95.220284,
    false, '2027-02-04 23:49:17+0630'::timestamptz, '2027-02-05 03:49:17+0630'::timestamptz, '2027-02-02 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_05', id, 'Pyay', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_05', id, '2026-06-06 18:49:17+0630'::timestamptz, '2026-06-06 22:49:17+0630'::timestamptz, '2026-06-04 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Community Environmental Cleanup #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.816225, 95.226105,
    false, '2027-02-05 23:49:17+0630'::timestamptz, '2027-02-06 03:49:17+0630'::timestamptz, '2027-02-03 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Environmental Cleanup #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_06', id, 'Pyay', 'active', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Community Environmental Cleanup #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Mobile Blood Donation Support #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.827245, 95.227024,
    false, '2027-02-06 22:49:17+0630'::timestamptz, '2027-02-07 02:49:17+0630'::timestamptz, '2027-02-04 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Mobile Blood Donation Support #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_07', id, 'Pyay', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_07', id, '2026-04-03 18:49:17+0630'::timestamptz, '2026-04-03 22:49:17+0630'::timestamptz, '2026-04-01 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Elderly Care & Support Day #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.826625, 95.227554,
    false, '2027-02-08 00:49:17+0630'::timestamptz, '2027-02-08 04:49:17+0630'::timestamptz, '2027-02-06 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Elderly Care & Support Day #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_08', id, 'Pyay', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Elderly Care & Support Day #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_08', id, '2026-03-02 14:49:17+0630'::timestamptz, '2026-03-02 18:49:17+0630'::timestamptz, '2026-02-28 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Elderly Care & Support Day #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Pyay Shelter Animal Welfare & Feeding #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.819258, 95.229074,
    false, '2027-02-08 22:49:17+0630'::timestamptz, '2027-02-09 02:49:17+0630'::timestamptz, '2027-02-06 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_09', id, 'Pyay', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_09', id, '2026-01-29 15:49:17+0630'::timestamptz, '2026-01-29 19:49:17+0630'::timestamptz, '2026-01-27 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Pyay Youth Education & Tutoring #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.817914, 95.228714,
    false, '2027-04-29 23:49:17+0630'::timestamptz, '2027-04-30 03:49:17+0630'::timestamptz, '2027-04-27 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Youth Education & Tutoring #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_10', id, 'Pyay', 'published', 'u_105', 'u_105'
FROM events WHERE title = 'Pyay Youth Education & Tutoring #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    'Pyay Community Food Distribution #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.824937, 95.228167,
    false, '2027-02-11 00:49:17+0630'::timestamptz, '2027-02-11 04:49:17+0630'::timestamptz, '2027-02-09 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_11', id, 'Pyay', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Pyay Community Food Distribution #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_11', id, '2025-11-26 16:49:17+0630'::timestamptz, '2025-11-26 20:49:17+0630'::timestamptz, '2025-11-24 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    'Pyay Monsoon Flood Preparedness #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.829302, 95.229039,
    false, '2027-02-11 23:49:17+0630'::timestamptz, '2027-02-12 03:49:17+0630'::timestamptz, '2027-02-09 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_12', id, 'Pyay', 'completed', 'u_001', 'u_001'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_12', id, '2025-10-25 14:49:17+0630'::timestamptz, '2025-10-25 18:49:17+0630'::timestamptz, '2025-10-23 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    'Pyay Public Health Awareness Outreach #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.821829, 95.216205,
    false, '2027-06-16 22:49:17+0630'::timestamptz, '2027-06-17 02:49:17+0630'::timestamptz, '2027-06-14 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_13', id, 'Pyay', 'published', 'u_204', 'u_204'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    'Pyay Community Environmental Cleanup #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.817884, 95.223736,
    false, '2027-02-14 00:49:17+0630'::timestamptz, '2027-02-14 04:49:17+0630'::timestamptz, '2027-02-12 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Environmental Cleanup #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_14', id, 'Pyay', 'cancelled', 'u_302', 'u_302'
FROM events WHERE title = 'Pyay Community Environmental Cleanup #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Shelter Animal Welfare & Feeding #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Paungde Rural Outreach Station', 'Near Paungde Clock Tower', 18.825284, 95.229092,
    false, '2027-02-14 23:49:17+0630'::timestamptz, '2027-02-15 03:49:17+0630'::timestamptz, '2027-02-12 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_15', id, 'Pyay', 'draft', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    'Pyay Monsoon Flood Preparedness #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Paungde Rural Outreach Station', 'Near Paungde Clock Tower', 18.818996, 95.228617,
    false, '2027-08-04 00:49:17+0630'::timestamptz, '2027-08-04 04:49:17+0630'::timestamptz, '2027-08-02 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_16', id, 'Pyay', 'published', 'u_001', 'u_001'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Youth Education & Tutoring #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.816746, 95.224391,
    false, '2027-02-16 23:49:17+0630'::timestamptz, '2027-02-17 03:49:17+0630'::timestamptz, '2027-02-14 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Youth Education & Tutoring #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_17', id, 'Pyay', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Youth Education & Tutoring #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_17', id, '2025-05-18 16:49:17+0630'::timestamptz, '2025-05-18 20:49:17+0630'::timestamptz, '2025-05-16 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Youth Education & Tutoring #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Pyay Public Health Awareness Outreach #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.818482, 95.217384,
    false, '2027-09-04 21:49:17+0630'::timestamptz, '2027-09-05 01:49:17+0630'::timestamptz, '2027-09-02 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_18', id, 'Pyay', 'published', 'u_304', 'u_304'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_204'),
    'Pyay Public Health Awareness Outreach #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.827492, 95.217771,
    false, '2027-02-18 21:49:17+0630'::timestamptz, '2027-02-19 01:49:17+0630'::timestamptz, '2027-02-16 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_19', id, 'Pyay', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_19', id, '2025-03-15 14:49:17+0630'::timestamptz, '2025-03-15 18:49:17+0630'::timestamptz, '2025-03-13 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Pyay Youth Education & Tutoring #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.827524, 95.222799,
    false, '2027-02-19 23:49:17+0630'::timestamptz, '2027-02-20 03:49:17+0630'::timestamptz, '2027-02-17 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Youth Education & Tutoring #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_20', id, 'Pyay', 'completed', 'u_105', 'u_105'
FROM events WHERE title = 'Pyay Youth Education & Tutoring #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_20', id, '2025-02-11 14:49:17+0630'::timestamptz, '2025-02-11 18:49:17+0630'::timestamptz, '2025-02-09 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Youth Education & Tutoring #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Elderly Care & Support Day #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.817696, 95.221398,
    false, '2027-02-21 00:49:17+0630'::timestamptz, '2027-02-21 04:49:17+0630'::timestamptz, '2027-02-19 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Elderly Care & Support Day #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_21', id, 'Pyay', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Elderly Care & Support Day #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_21', id, '2025-01-10 17:49:17+0630'::timestamptz, '2025-01-10 21:49:17+0630'::timestamptz, '2025-01-08 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Elderly Care & Support Day #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    'Pyay Shelter Animal Welfare & Feeding #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.830162, 95.220056,
    false, '2027-02-22 00:49:17+0630'::timestamptz, '2027-02-22 04:49:17+0630'::timestamptz, '2027-02-20 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_22', id, 'Pyay', 'completed', 'u_302', 'u_302'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_22', id, '2024-12-09 18:49:17+0630'::timestamptz, '2024-12-09 22:49:17+0630'::timestamptz, '2024-12-07 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Pyay Community Environmental Cleanup #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.824723, 95.218957,
    false, '2027-02-22 22:49:17+0630'::timestamptz, '2027-02-23 02:49:17+0630'::timestamptz, '2027-02-20 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Environmental Cleanup #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_23', id, 'Pyay', 'cancelled', 'u_105', 'u_105'
FROM events WHERE title = 'Pyay Community Environmental Cleanup #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    'Pyay Mobile Blood Donation Support #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.817137, 95.219559,
    false, '2027-02-23 23:49:17+0630'::timestamptz, '2027-02-24 03:49:17+0630'::timestamptz, '2027-02-21 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Mobile Blood Donation Support #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_24', id, 'Pyay', 'active', 'u_001', 'u_001'
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    'Pyay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.823308, 95.219182,
    false, '2027-02-25 00:49:17+0630'::timestamptz, '2027-02-25 04:49:17+0630'::timestamptz, '2027-02-23 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_25', id, 'Pyay', 'completed', 'u_302', 'u_302'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_25', id, '2024-09-04 15:49:17+0630'::timestamptz, '2024-09-04 19:49:17+0630'::timestamptz, '2024-09-02 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Pyay Youth Education & Tutoring #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Pyay Paungde Rural Outreach Station', 'Near Paungde Clock Tower', 18.822398, 95.21672,
    false, '2028-01-10 23:49:17+0630'::timestamptz, '2028-01-11 03:49:17+0630'::timestamptz, '2028-01-08 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Youth Education & Tutoring #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_26', id, 'Pyay', 'published', 'u_304', 'u_304'
FROM events WHERE title = 'Pyay Youth Education & Tutoring #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Pyay Monsoon Flood Preparedness #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.818755, 95.219914,
    false, '2027-02-26 23:49:17+0630'::timestamptz, '2027-02-27 03:49:17+0630'::timestamptz, '2027-02-24 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_27', id, 'Pyay', 'cancelled', 'u_105', 'u_105'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    'Pyay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.819696, 95.220755,
    false, '2027-02-28 00:49:17+0630'::timestamptz, '2027-02-28 04:49:17+0630'::timestamptz, '2027-02-26 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_28', id, 'Pyay', 'completed', 'u_001', 'u_001'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_28', id, '2024-05-31 14:49:17+0630'::timestamptz, '2024-05-31 18:49:17+0630'::timestamptz, '2024-05-29 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_302'),
    'Pyay Community Food Distribution #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.828217, 95.226515,
    false, '2027-03-01 00:49:17+0630'::timestamptz, '2027-03-01 04:49:17+0630'::timestamptz, '2027-02-27 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_29', id, 'Pyay', 'completed', 'u_302', 'u_302'
FROM events WHERE title = 'Pyay Community Food Distribution #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_29', id, '2024-04-29 18:49:17+0630'::timestamptz, '2024-04-29 22:49:17+0630'::timestamptz, '2024-04-27 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Pyay Community Food Distribution #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.81864, 95.219165,
    false, '2027-03-01 23:49:17+0630'::timestamptz, '2027-03-02 03:49:17+0630'::timestamptz, '2027-02-27 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_30', id, 'Pyay', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Pyay Community Food Distribution #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_30', id, '2024-03-28 18:49:17+0630'::timestamptz, '2024-03-28 22:49:17+0630'::timestamptz, '2024-03-26 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    'Bago Community Food Distribution #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.328024, 96.477173,
    false, '2026-12-06 23:49:17+0630'::timestamptz, '2026-12-07 03:49:17+0630'::timestamptz, '2026-12-04 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_01', id, 'Bago', 'published', 'u_106', 'u_106'
FROM events WHERE title = 'Bago Community Food Distribution #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    'Bago Community Environmental Cleanup #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.319742, 96.487374,
    false, '2027-03-03 21:49:17+0630'::timestamptz, '2027-03-04 01:49:17+0630'::timestamptz, '2027-03-01 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_02', id, 'Bago', 'cancelled', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Community Environmental Cleanup #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Shelter Animal Welfare & Feeding #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.327223, 96.485171,
    false, '2027-03-04 22:49:17+0630'::timestamptz, '2027-03-05 02:49:17+0630'::timestamptz, '2027-03-02 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_03', id, 'Bago', 'active', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Elderly Care & Support Day #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.325275, 96.487972,
    false, '2027-03-06 00:49:17+0630'::timestamptz, '2027-03-06 04:49:17+0630'::timestamptz, '2027-03-04 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_04', id, 'Bago', 'draft', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Elderly Care & Support Day #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    'Bago Youth Education & Tutoring #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.324811, 96.474136,
    false, '2027-03-06 22:49:17+0630'::timestamptz, '2027-03-07 02:49:17+0630'::timestamptz, '2027-03-04 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_05', id, 'Bago', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Bago Youth Education & Tutoring #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_05', id, '2026-06-06 17:49:17+0630'::timestamptz, '2026-06-06 21:49:17+0630'::timestamptz, '2026-06-04 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Youth Education & Tutoring #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    'Bago Public Health Awareness Outreach #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.327895, 96.476332,
    false, '2027-03-07 22:49:17+0630'::timestamptz, '2027-03-08 02:49:17+0630'::timestamptz, '2027-03-05 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Public Health Awareness Outreach #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_06', id, 'Bago', 'completed', 'u_203', 'u_203'
FROM events WHERE title = 'Bago Public Health Awareness Outreach #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_06', id, '2026-05-05 18:49:17+0630'::timestamptz, '2026-05-05 22:49:17+0630'::timestamptz, '2026-05-03 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Public Health Awareness Outreach #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    'Bago Shelter Animal Welfare & Feeding #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.316944, 96.474096,
    false, '2027-03-08 22:49:17+0630'::timestamptz, '2027-03-09 02:49:17+0630'::timestamptz, '2027-03-06 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_07', id, 'Bago', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_07', id, '2026-04-03 14:49:17+0630'::timestamptz, '2026-04-03 18:49:17+0630'::timestamptz, '2026-04-01 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    'Bago Mobile Blood Donation Support #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.316569, 96.478379,
    false, '2027-03-28 21:49:17+0630'::timestamptz, '2027-03-29 01:49:17+0630'::timestamptz, '2027-03-26 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_08', id, 'Bago', 'published', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    'Bago Monsoon Flood Preparedness #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.321437, 96.483607,
    false, '2027-04-13 22:49:17+0630'::timestamptz, '2027-04-14 02:49:17+0630'::timestamptz, '2027-04-11 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_09', id, 'Bago', 'published', 'u_404', 'u_404'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    'Bago Shelter Animal Welfare & Feeding #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.327637, 96.486936,
    false, '2027-03-11 23:49:17+0630'::timestamptz, '2027-03-12 03:49:17+0630'::timestamptz, '2027-03-09 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_10', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_10', id, '2025-12-28 16:49:17+0630'::timestamptz, '2025-12-28 20:49:17+0630'::timestamptz, '2025-12-26 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    'Bago Community Environmental Cleanup #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.319694, 96.479248,
    false, '2027-03-12 22:49:17+0630'::timestamptz, '2027-03-13 02:49:17+0630'::timestamptz, '2027-03-10 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_11', id, 'Bago', 'completed', 'u_106', 'u_106'
FROM events WHERE title = 'Bago Community Environmental Cleanup #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_11', id, '2025-11-26 15:49:17+0630'::timestamptz, '2025-11-26 19:49:17+0630'::timestamptz, '2025-11-24 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Community Environmental Cleanup #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    'Bago Community Food Distribution #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.327209, 96.474277,
    false, '2027-03-13 22:49:17+0630'::timestamptz, '2027-03-14 02:49:17+0630'::timestamptz, '2027-03-11 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_12', id, 'Bago', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Bago Community Food Distribution #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_12', id, '2025-10-25 18:49:17+0630'::timestamptz, '2025-10-25 22:49:17+0630'::timestamptz, '2025-10-23 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Community Food Distribution #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Mobile Blood Donation Support #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.318135, 96.484053,
    false, '2027-03-15 00:49:17+0630'::timestamptz, '2027-03-15 04:49:17+0630'::timestamptz, '2027-03-13 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_13', id, 'Bago', 'active', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Shelter Animal Welfare & Feeding #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.324339, 96.475894,
    false, '2027-03-15 21:49:17+0630'::timestamptz, '2027-03-16 01:49:17+0630'::timestamptz, '2027-03-13 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_14', id, 'Bago', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_14', id, '2025-08-22 18:49:17+0630'::timestamptz, '2025-08-22 22:49:17+0630'::timestamptz, '2025-08-20 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Mobile Blood Donation Support #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.323487, 96.478183,
    false, '2027-07-18 22:49:17+0630'::timestamptz, '2027-07-19 02:49:17+0630'::timestamptz, '2027-07-16 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_15', id, 'Bago', 'published', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    'Bago Youth Education & Tutoring #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.329147, 96.487572,
    false, '2027-03-17 21:49:17+0630'::timestamptz, '2027-03-18 01:49:17+0630'::timestamptz, '2027-03-15 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_16', id, 'Bago', 'cancelled', 'u_404', 'u_404'
FROM events WHERE title = 'Bago Youth Education & Tutoring #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    'Bago Shelter Animal Welfare & Feeding #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.32039, 96.482674,
    false, '2027-03-18 22:49:17+0630'::timestamptz, '2027-03-19 02:49:17+0630'::timestamptz, '2027-03-16 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_17', id, 'Bago', 'completed', 'u_203', 'u_203'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_17', id, '2025-05-18 14:49:17+0630'::timestamptz, '2025-05-18 18:49:17+0630'::timestamptz, '2025-05-16 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    'Bago Community Environmental Cleanup #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.31522, 96.480734,
    false, '2027-03-19 23:49:17+0630'::timestamptz, '2027-03-20 03:49:17+0630'::timestamptz, '2027-03-17 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_18', id, 'Bago', 'completed', 'u_203', 'u_203'
FROM events WHERE title = 'Bago Community Environmental Cleanup #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_18', id, '2025-04-16 15:49:17+0630'::timestamptz, '2025-04-16 19:49:17+0630'::timestamptz, '2025-04-14 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Community Environmental Cleanup #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    'Bago Community Food Distribution #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.318196, 96.481265,
    false, '2027-03-20 23:49:17+0630'::timestamptz, '2027-03-21 03:49:17+0630'::timestamptz, '2027-03-18 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_19', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Community Food Distribution #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_19', id, '2025-03-15 16:49:17+0630'::timestamptz, '2025-03-15 20:49:17+0630'::timestamptz, '2025-03-13 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Community Food Distribution #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Community Food Distribution #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.316054, 96.481798,
    false, '2027-03-22 00:49:17+0630'::timestamptz, '2027-03-22 04:49:17+0630'::timestamptz, '2027-03-20 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_20', id, 'Bago', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Community Food Distribution #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_20', id, '2025-02-11 17:49:17+0630'::timestamptz, '2025-02-11 21:49:17+0630'::timestamptz, '2025-02-09 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Community Food Distribution #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    'Bago Youth Education & Tutoring #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.328135, 96.48084,
    false, '2027-03-22 21:49:17+0630'::timestamptz, '2027-03-23 01:49:17+0630'::timestamptz, '2027-03-20 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_21', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Youth Education & Tutoring #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_21', id, '2025-01-10 17:49:17+0630'::timestamptz, '2025-01-10 21:49:17+0630'::timestamptz, '2025-01-08 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Youth Education & Tutoring #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Mobile Blood Donation Support #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.318117, 96.487982,
    false, '2027-03-24 00:49:17+0630'::timestamptz, '2027-03-24 04:49:17+0630'::timestamptz, '2027-03-22 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_22', id, 'Bago', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_22', id, '2024-12-09 16:49:17+0630'::timestamptz, '2024-12-09 20:49:17+0630'::timestamptz, '2024-12-07 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Mobile Blood Donation Support #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    'Bago Mobile Blood Donation Support #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.326176, 96.475864,
    false, '2027-03-24 23:49:17+0630'::timestamptz, '2027-03-25 03:49:17+0630'::timestamptz, '2027-03-22 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_23', id, 'Bago', 'completed', 'u_404', 'u_404'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_23', id, '2024-11-07 14:49:17+0630'::timestamptz, '2024-11-07 18:49:17+0630'::timestamptz, '2024-11-05 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Mobile Blood Donation Support #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    'Bago Monsoon Flood Preparedness #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.328391, 96.482447,
    false, '2027-03-25 23:49:17+0630'::timestamptz, '2027-03-26 03:49:17+0630'::timestamptz, '2027-03-23 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_24', id, 'Bago', 'completed', 'u_106', 'u_106'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_24', id, '2024-10-06 18:49:17+0630'::timestamptz, '2024-10-06 22:49:17+0630'::timestamptz, '2024-10-04 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Community Food Distribution #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.322445, 96.479634,
    false, '2027-03-26 21:49:17+0630'::timestamptz, '2027-03-27 01:49:17+0630'::timestamptz, '2027-03-24 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_25', id, 'Bago', 'cancelled', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Community Food Distribution #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_104'),
    'Bago Youth Education & Tutoring #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.324615, 96.488202,
    false, '2027-03-28 00:49:17+0630'::timestamptz, '2027-03-28 04:49:17+0630'::timestamptz, '2027-03-26 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_26', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Youth Education & Tutoring #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_26', id, '2024-08-03 18:49:17+0630'::timestamptz, '2024-08-03 22:49:17+0630'::timestamptz, '2024-08-01 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Youth Education & Tutoring #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    'Bago Shelter Animal Welfare & Feeding #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.323506, 96.478682,
    false, '2027-03-28 23:49:17+0630'::timestamptz, '2027-03-29 03:49:17+0630'::timestamptz, '2027-03-26 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_27', id, 'Bago', 'completed', 'u_404', 'u_404'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_27', id, '2024-07-02 14:49:17+0630'::timestamptz, '2024-07-02 18:49:17+0630'::timestamptz, '2024-06-30 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_404'),
    'Bago Public Health Awareness Outreach #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.319778, 96.476737,
    false, '2028-02-11 22:49:17+0630'::timestamptz, '2028-02-12 02:49:17+0630'::timestamptz, '2028-02-09 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Public Health Awareness Outreach #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_28', id, 'Bago', 'published', 'u_404', 'u_404'
FROM events WHERE title = 'Bago Public Health Awareness Outreach #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Bago Youth Education & Tutoring #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.319828, 96.480306,
    false, '2027-03-30 23:49:17+0630'::timestamptz, '2027-03-31 03:49:17+0630'::timestamptz, '2027-03-28 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_29', id, 'Bago', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Bago Youth Education & Tutoring #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_29', id, '2024-04-29 14:49:17+0630'::timestamptz, '2024-04-29 18:49:17+0630'::timestamptz, '2024-04-27 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Bago Youth Education & Tutoring #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    'Bago Elderly Care & Support Day #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.322562, 96.479828,
    false, '2028-03-14 21:49:17+0630'::timestamptz, '2028-03-15 01:49:17+0630'::timestamptz, '2028-03-12 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_30', id, 'Bago', 'published', 'u_106', 'u_106'
FROM events WHERE title = 'Bago Elderly Care & Support Day #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    'Magway Mobile Blood Donation Support #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.157745, 94.950648,
    false, '2026-12-06 21:49:17+0630'::timestamptz, '2026-12-07 01:49:17+0630'::timestamptz, '2026-12-04 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_01', id, 'Magway', 'published', 'u_401', 'u_401'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Youth Education & Tutoring #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.153403, 94.952438,
    false, '2027-04-02 23:49:17+0630'::timestamptz, '2027-04-03 03:49:17+0630'::timestamptz, '2027-03-31 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Youth Education & Tutoring #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_02', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Youth Education & Tutoring #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_02', id, '2026-09-10 18:49:17+0630'::timestamptz, '2026-09-10 22:49:17+0630'::timestamptz, '2026-09-08 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Youth Education & Tutoring #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    'Magway Youth Education & Tutoring #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.155551, 94.939913,
    false, '2027-04-03 22:49:17+0630'::timestamptz, '2027-04-04 02:49:17+0630'::timestamptz, '2027-04-01 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Youth Education & Tutoring #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_03', id, 'Magway', 'cancelled', 'u_102', 'u_102'
FROM events WHERE title = 'Magway Youth Education & Tutoring #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_201'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_201'),
    'Magway Public Health Awareness Outreach #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.150582, 94.948553,
    false, '2027-01-23 22:49:17+0630'::timestamptz, '2027-01-24 02:49:17+0630'::timestamptz, '2027-01-21 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_04', id, 'Magway', 'published', 'u_201', 'u_201'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    'Magway Elderly Care & Support Day #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.147477, 94.944161,
    false, '2027-04-06 00:49:17+0630'::timestamptz, '2027-04-06 04:49:17+0630'::timestamptz, '2027-04-04 00:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Elderly Care & Support Day #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_05', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Elderly Care & Support Day #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_05', id, '2026-06-06 15:49:17+0630'::timestamptz, '2026-06-06 19:49:17+0630'::timestamptz, '2026-06-04 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Elderly Care & Support Day #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Magway Community Food Distribution #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.160396, 94.947462,
    false, '2027-02-24 22:49:17+0630'::timestamptz, '2027-02-25 02:49:17+0630'::timestamptz, '2027-02-22 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_06', id, 'Magway', 'published', 'u_004', 'u_004'
FROM events WHERE title = 'Magway Community Food Distribution #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Elderly Care & Support Day #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.158916, 94.94519,
    false, '2027-03-13 00:49:17+0630'::timestamptz, '2027-03-13 04:49:17+0630'::timestamptz, '2027-03-11 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Elderly Care & Support Day #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_07', id, 'Magway', 'published', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Elderly Care & Support Day #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Shelter Animal Welfare & Feeding #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.149457, 94.952197,
    false, '2027-04-09 00:49:17+0630'::timestamptz, '2027-04-09 04:49:17+0630'::timestamptz, '2027-04-07 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_08', id, 'Magway', 'draft', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    'Magway Elderly Care & Support Day #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.147084, 94.942989,
    false, '2027-04-09 22:49:17+0630'::timestamptz, '2027-04-10 02:49:17+0630'::timestamptz, '2027-04-07 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Elderly Care & Support Day #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_09', id, 'Magway', 'cancelled', 'u_401', 'u_401'
FROM events WHERE title = 'Magway Elderly Care & Support Day #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.161199, 94.948761,
    false, '2027-04-10 22:49:17+0630'::timestamptz, '2027-04-11 02:49:17+0630'::timestamptz, '2027-04-08 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_10', id, 'Magway', 'completed', 'u_004', 'u_004'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_10', id, '2025-12-28 17:49:17+0630'::timestamptz, '2025-12-28 21:49:17+0630'::timestamptz, '2025-12-26 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    'Magway Public Health Awareness Outreach #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.151866, 94.952189,
    false, '2027-04-11 22:49:17+0630'::timestamptz, '2027-04-12 02:49:17+0630'::timestamptz, '2027-04-09 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_11', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_11', id, '2025-11-26 16:49:17+0630'::timestamptz, '2025-11-26 20:49:17+0630'::timestamptz, '2025-11-24 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Public Health Awareness Outreach #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Magway Public Health Awareness Outreach #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.147097, 94.941312,
    false, '2027-04-12 21:49:17+0630'::timestamptz, '2027-04-13 01:49:17+0630'::timestamptz, '2027-04-10 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_12', id, 'Magway', 'active', 'u_004', 'u_004'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    'Magway Community Environmental Cleanup #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.146969, 94.944567,
    false, '2027-04-13 23:49:17+0630'::timestamptz, '2027-04-14 03:49:17+0630'::timestamptz, '2027-04-11 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Environmental Cleanup #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_13', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Community Environmental Cleanup #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_13', id, '2025-09-23 16:49:17+0630'::timestamptz, '2025-09-23 20:49:17+0630'::timestamptz, '2025-09-21 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Community Environmental Cleanup #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    'Magway Shelter Animal Welfare & Feeding #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.147759, 94.943114,
    false, '2027-04-14 22:49:17+0630'::timestamptz, '2027-04-15 02:49:17+0630'::timestamptz, '2027-04-12 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_14', id, 'Magway', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_14', id, '2025-08-22 16:49:17+0630'::timestamptz, '2025-08-22 20:49:17+0630'::timestamptz, '2025-08-20 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Mobile Blood Donation Support #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.148811, 94.946821,
    false, '2027-07-18 21:49:17+0630'::timestamptz, '2027-07-19 01:49:17+0630'::timestamptz, '2027-07-16 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_15', id, 'Magway', 'published', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    'Magway Elderly Care & Support Day #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.150639, 94.945974,
    false, '2027-04-16 21:49:17+0630'::timestamptz, '2027-04-17 01:49:17+0630'::timestamptz, '2027-04-14 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Elderly Care & Support Day #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_16', id, 'Magway', 'completed', 'u_102', 'u_102'
FROM events WHERE title = 'Magway Elderly Care & Support Day #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_16', id, '2025-06-19 16:49:17+0630'::timestamptz, '2025-06-19 20:49:17+0630'::timestamptz, '2025-06-17 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Elderly Care & Support Day #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Magway Mobile Blood Donation Support #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.161813, 94.941115,
    false, '2027-04-17 21:49:17+0630'::timestamptz, '2027-04-18 01:49:17+0630'::timestamptz, '2027-04-15 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_17', id, 'Magway', 'completed', 'u_004', 'u_004'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_17', id, '2025-05-18 17:49:17+0630'::timestamptz, '2025-05-18 21:49:17+0630'::timestamptz, '2025-05-16 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Mobile Blood Donation Support #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    'Magway Monsoon Flood Preparedness #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.159221, 94.938175,
    false, '2027-04-18 23:49:17+0630'::timestamptz, '2027-04-19 03:49:17+0630'::timestamptz, '2027-04-16 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_18', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_18', id, '2025-04-16 14:49:17+0630'::timestamptz, '2025-04-16 18:49:17+0630'::timestamptz, '2025-04-14 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Magway Monsoon Flood Preparedness #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.149241, 94.951,
    false, '2027-04-19 22:49:17+0630'::timestamptz, '2027-04-20 02:49:17+0630'::timestamptz, '2027-04-17 22:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_19', id, 'Magway', 'completed', 'u_004', 'u_004'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_19', id, '2025-03-15 17:49:17+0630'::timestamptz, '2025-03-15 21:49:17+0630'::timestamptz, '2025-03-13 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    'Magway Youth Education & Tutoring #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.147454, 94.945955,
    false, '2027-10-06 21:49:17+0630'::timestamptz, '2027-10-07 01:49:17+0630'::timestamptz, '2027-10-04 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Youth Education & Tutoring #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_20', id, 'Magway', 'published', 'u_401', 'u_401'
FROM events WHERE title = 'Magway Youth Education & Tutoring #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    'Magway Community Food Distribution #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.15775, 94.942194,
    false, '2027-04-21 22:49:17+0630'::timestamptz, '2027-04-22 02:49:17+0630'::timestamptz, '2027-04-19 22:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_21', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Community Food Distribution #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_21', id, '2025-01-10 14:49:17+0630'::timestamptz, '2025-01-10 18:49:17+0630'::timestamptz, '2025-01-08 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Community Food Distribution #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_402'),
    'Magway Community Environmental Cleanup #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.157669, 94.938935,
    false, '2027-04-23 00:49:17+0630'::timestamptz, '2027-04-23 04:49:17+0630'::timestamptz, '2027-04-21 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Environmental Cleanup #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_22', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Community Environmental Cleanup #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_22', id, '2024-12-09 16:49:17+0630'::timestamptz, '2024-12-09 20:49:17+0630'::timestamptz, '2024-12-07 16:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Community Environmental Cleanup #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    'Magway Community Environmental Cleanup #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.147349, 94.948865,
    false, '2027-04-23 21:49:17+0630'::timestamptz, '2027-04-24 01:49:17+0630'::timestamptz, '2027-04-21 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Environmental Cleanup #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_23', id, 'Magway', 'cancelled', 'u_401', 'u_401'
FROM events WHERE title = 'Magway Community Environmental Cleanup #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    'Magway Public Health Awareness Outreach #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.149297, 94.939326,
    false, '2027-04-24 23:49:17+0630'::timestamptz, '2027-04-25 03:49:17+0630'::timestamptz, '2027-04-22 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_24', id, 'Magway', 'completed', 'u_102', 'u_102'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_24', id, '2024-10-06 15:49:17+0630'::timestamptz, '2024-10-06 19:49:17+0630'::timestamptz, '2024-10-04 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Public Health Awareness Outreach #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Mobile Blood Donation Support #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.148233, 94.946412,
    false, '2027-04-25 21:49:17+0630'::timestamptz, '2027-04-26 01:49:17+0630'::timestamptz, '2027-04-23 21:49:17+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_25', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_25', id, '2024-09-04 14:49:17+0630'::timestamptz, '2024-09-04 18:49:17+0630'::timestamptz, '2024-09-02 14:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Mobile Blood Donation Support #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_401'),
    'Magway Mobile Blood Donation Support #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.154442, 94.938282,
    false, '2027-04-26 23:49:17+0630'::timestamptz, '2027-04-27 03:49:17+0630'::timestamptz, '2027-04-24 23:49:17+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_26', id, 'Magway', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_26', id, '2024-08-03 17:49:17+0630'::timestamptz, '2024-08-03 21:49:17+0630'::timestamptz, '2024-08-01 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Mobile Blood Donation Support #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Magway Monsoon Flood Preparedness #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.150309, 94.950458,
    false, '2027-04-28 00:49:17+0630'::timestamptz, '2027-04-28 04:49:17+0630'::timestamptz, '2027-04-26 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_27', id, 'Magway', 'active', 'u_004', 'u_004'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_201'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_201'),
    'Magway Community Food Distribution #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.156842, 94.951917,
    false, '2027-04-29 00:49:17+0630'::timestamptz, '2027-04-29 04:49:17+0630'::timestamptz, '2027-04-27 00:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_28', id, 'Magway', 'completed', 'u_201', 'u_201'
FROM events WHERE title = 'Magway Community Food Distribution #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_28', id, '2024-05-31 18:49:17+0630'::timestamptz, '2024-05-31 22:49:17+0630'::timestamptz, '2024-05-29 18:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Community Food Distribution #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_201'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_201'),
    'Magway Public Health Awareness Outreach #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.152437, 94.942057,
    false, '2027-04-29 21:49:17+0630'::timestamptz, '2027-04-30 01:49:17+0630'::timestamptz, '2027-04-27 21:49:17+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_29', id, 'Magway', 'completed', 'u_201', 'u_201'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_29', id, '2024-04-29 17:49:17+0630'::timestamptz, '2024-04-29 21:49:17+0630'::timestamptz, '2024-04-27 17:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Public Health Awareness Outreach #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO events (
    owner_id, current_coordinator_id, title, description, purpose_type,
    location_name, landmark_text, latitude, longitude,
    geo_checkin_enabled, start_at, end_at, application_deadline,
    status, acceptance_mode, auto_assign_enabled, meals_provided,
    lodging_provided, travel_support_provided, compensation_kind,
    onboarding_text, require_onboarding_ack
)
SELECT
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_102'),
    'Magway Youth Education & Tutoring #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.155717, 94.946307,
    false, '2027-04-30 23:49:17+0630'::timestamptz, '2027-05-01 03:49:17+0630'::timestamptz, '2027-04-28 23:49:17+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Youth Education & Tutoring #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_30', id, 'Magway', 'completed', 'u_102', 'u_102'
FROM events WHERE title = 'Magway Youth Education & Tutoring #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_30', id, '2024-03-28 15:49:17+0630'::timestamptz, '2024-03-28 19:49:17+0630'::timestamptz, '2024-03-26 15:49:17+0630'::timestamptz
FROM events WHERE title = 'Magway Youth Education & Tutoring #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;


-- 2. Link Event Charity Fields
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_magway_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_magway_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_magway_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_magway_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_magway_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_magway_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_magway_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_magway_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_magway_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_magway_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_magway_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_30'
ON CONFLICT (event_id, field_code) DO NOTHING;

-- 3. Create Event Posts (Required before publishing)
INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority, status)
SELECT te.event_id, 'General Support Volunteer', 'General venue setup, ushering, and queue support.', 6, 'light', '{}'::text[], false, true, 10, 'open'
FROM temp_synth_events te
ON CONFLICT (event_id, title) DO NOTHING;

INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority, status)
SELECT te.event_id, 'Logistics & Distribution Crew', 'Loading, unloading, inventory counts, and packaging materials.', 4, 'light', '{}'::text[], false, true, 20, 'open'
FROM temp_synth_events te
ON CONFLICT (event_id, title) DO NOTHING;

INSERT INTO event_posts (event_id, title, description, required_headcount, physical_level, required_skills, leader_needed, new_volunteers_allowed, priority, status)
SELECT te.event_id, 'Team Lead & Field Support', 'Overseeing volunteer check-ins and coordinating field stations.', 2, 'none', '{}'::text[], true, false, 5, 'open'
FROM temp_synth_events te
WHERE te.lifecycle IN ('completed', 'published', 'active')
ON CONFLICT (event_id, title) DO NOTHING;

-- 4. Publish events through database transition draft -> published
UPDATE events
SET status = 'published'
WHERE id IN (
    SELECT event_id FROM temp_synth_events
    WHERE lifecycle IN ('published', 'active', 'completed', 'cancelled')
) AND status = 'draft';
