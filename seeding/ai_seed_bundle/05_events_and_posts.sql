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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_306'),
    'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.822905, 96.128293,
    false, '2026-11-30 14:45:20+0630'::timestamptz, '2026-11-30 18:45:20+0630'::timestamptz, '2026-11-28 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_01', id, 'Yangon', 'completed', 'u_306', 'u_306'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_01', id, '2026-10-10 05:45:20+0630'::timestamptz, '2026-10-10 09:45:20+0630'::timestamptz, '2026-10-08 05:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    'Yangon Youth Education & Tutoring #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.817183, 96.126981,
    false, '2026-12-01 11:45:20+0630'::timestamptz, '2026-12-01 15:45:20+0630'::timestamptz, '2026-11-29 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_02', id, 'Yangon', 'draft', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #2 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.81932, 96.132503,
    false, '2026-12-02 12:45:20+0630'::timestamptz, '2026-12-02 16:45:20+0630'::timestamptz, '2026-11-30 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_03', id, 'Yangon', 'completed', 'u_406', 'u_406'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_03', id, '2026-08-07 04:45:20+0630'::timestamptz, '2026-08-07 08:45:20+0630'::timestamptz, '2026-08-05 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #3 [SYNTHETIC]'
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
    'Yangon Shelter Animal Welfare & Feeding #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.811473, 96.131778,
    false, '2026-12-03 14:45:20+0630'::timestamptz, '2026-12-03 18:45:20+0630'::timestamptz, '2026-12-01 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_04', id, 'Yangon', 'completed', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_04', id, '2026-07-06 05:45:20+0630'::timestamptz, '2026-07-06 09:45:20+0630'::timestamptz, '2026-07-04 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #4 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.823749, 96.128821,
    false, '2027-02-06 11:45:20+0630'::timestamptz, '2027-02-06 15:45:20+0630'::timestamptz, '2027-02-04 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_05', id, 'Yangon', 'published', 'u_304', 'u_304'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #5 [SYNTHETIC]'
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
    'Yangon Public Health Awareness Outreach #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.825734, 96.131827,
    false, '2026-12-05 11:45:20+0630'::timestamptz, '2026-12-05 15:45:20+0630'::timestamptz, '2026-12-03 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_06', id, 'Yangon', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_06', id, '2026-05-03 06:45:20+0630'::timestamptz, '2026-05-03 10:45:20+0630'::timestamptz, '2026-05-01 06:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_205'),
    'Yangon Youth Education & Tutoring #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.822132, 96.124134,
    false, '2026-12-06 13:45:20+0630'::timestamptz, '2026-12-06 17:45:20+0630'::timestamptz, '2026-12-04 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_07', id, 'Yangon', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_07', id, '2026-04-01 08:45:20+0630'::timestamptz, '2026-04-01 12:45:20+0630'::timestamptz, '2026-03-30 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #7 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.821102, 96.12257,
    false, '2026-12-07 14:45:20+0630'::timestamptz, '2026-12-07 18:45:20+0630'::timestamptz, '2026-12-05 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_08', id, 'Yangon', 'completed', 'u_406', 'u_406'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_08', id, '2026-02-28 08:45:20+0630'::timestamptz, '2026-02-28 12:45:20+0630'::timestamptz, '2026-02-26 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #8 [SYNTHETIC]'
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
    'Yangon Elderly Care & Support Day #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.820334, 96.12664,
    false, '2026-12-08 13:45:20+0630'::timestamptz, '2026-12-08 17:45:20+0630'::timestamptz, '2026-12-06 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Elderly Care & Support Day #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_09', id, 'Yangon', 'completed', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Elderly Care & Support Day #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_09', id, '2026-01-27 08:45:20+0630'::timestamptz, '2026-01-27 12:45:20+0630'::timestamptz, '2026-01-25 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Elderly Care & Support Day #9 [SYNTHETIC]'
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
    'Yangon Shelter Animal Welfare & Feeding #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.823184, 96.123848,
    false, '2026-12-09 11:45:20+0630'::timestamptz, '2026-12-09 15:45:20+0630'::timestamptz, '2026-12-07 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_10', id, 'Yangon', 'cancelled', 'u_301', 'u_301'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Yangon Community Food Distribution #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.820976, 96.122561,
    false, '2026-12-10 12:45:20+0630'::timestamptz, '2026-12-10 16:45:20+0630'::timestamptz, '2026-12-08 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_11', id, 'Yangon', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Yangon Community Food Distribution #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_11', id, '2025-11-24 06:45:20+0630'::timestamptz, '2025-11-24 10:45:20+0630'::timestamptz, '2025-11-22 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Food Distribution #11 [SYNTHETIC]'
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
    'Yangon Community Food Distribution #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.812217, 96.127968,
    false, '2026-12-11 13:45:20+0630'::timestamptz, '2026-12-11 17:45:20+0630'::timestamptz, '2026-12-09 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_12', id, 'Yangon', 'cancelled', 'u_406', 'u_406'
FROM events WHERE title = 'Yangon Community Food Distribution #12 [SYNTHETIC]'
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
    'Yangon Shelter Animal Welfare & Feeding #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.820928, 96.132545,
    false, '2027-06-14 14:45:20+0630'::timestamptz, '2027-06-14 18:45:20+0630'::timestamptz, '2027-06-12 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_13', id, 'Yangon', 'published', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Shelter Animal Welfare & Feeding #13 [SYNTHETIC]'
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
    'Yangon Public Health Awareness Outreach #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.811972, 96.130489,
    false, '2027-06-30 14:45:20+0630'::timestamptz, '2027-06-30 18:45:20+0630'::timestamptz, '2027-06-28 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_14', id, 'Yangon', 'published', 'u_103', 'u_103'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_304'),
    'Yangon Elderly Care & Support Day #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.821257, 96.134019,
    false, '2026-12-14 14:45:20+0630'::timestamptz, '2026-12-14 18:45:20+0630'::timestamptz, '2026-12-12 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Elderly Care & Support Day #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_15', id, 'Yangon', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Yangon Elderly Care & Support Day #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_15', id, '2025-07-19 04:45:20+0630'::timestamptz, '2025-07-19 08:45:20+0630'::timestamptz, '2025-07-17 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Elderly Care & Support Day #15 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.811691, 96.130245,
    false, '2026-12-15 12:45:20+0630'::timestamptz, '2026-12-15 16:45:20+0630'::timestamptz, '2026-12-13 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_16', id, 'Yangon', 'completed', 'u_406', 'u_406'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_16', id, '2025-06-17 07:45:20+0630'::timestamptz, '2025-06-17 11:45:20+0630'::timestamptz, '2025-06-15 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #16 [SYNTHETIC]'
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
    'Yangon Monsoon Flood Preparedness #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.81835, 96.13384,
    false, '2027-08-17 13:45:20+0630'::timestamptz, '2027-08-17 17:45:20+0630'::timestamptz, '2027-08-15 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_17', id, 'Yangon', 'published', 'u_103', 'u_103'
FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #17 [SYNTHETIC]'
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
    'Yangon Public Health Awareness Outreach #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.820677, 96.129465,
    false, '2027-09-02 14:45:20+0630'::timestamptz, '2027-09-02 18:45:20+0630'::timestamptz, '2027-08-31 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_18', id, 'Yangon', 'published', 'u_406', 'u_406'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #18 [SYNTHETIC]'
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
    'Yangon Elderly Care & Support Day #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.82329, 96.121341,
    false, '2026-12-18 11:45:20+0630'::timestamptz, '2026-12-18 15:45:20+0630'::timestamptz, '2026-12-16 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Elderly Care & Support Day #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_19', id, 'Yangon', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Yangon Elderly Care & Support Day #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_19', id, '2025-03-13 07:45:20+0630'::timestamptz, '2025-03-13 11:45:20+0630'::timestamptz, '2025-03-11 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Elderly Care & Support Day #19 [SYNTHETIC]'
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
    'Yangon Community Environmental Cleanup #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.815268, 96.124538,
    false, '2026-12-19 13:45:20+0630'::timestamptz, '2026-12-19 17:45:20+0630'::timestamptz, '2026-12-17 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Environmental Cleanup #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_20', id, 'Yangon', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Community Environmental Cleanup #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_20', id, '2025-02-09 08:45:20+0630'::timestamptz, '2025-02-09 12:45:20+0630'::timestamptz, '2025-02-07 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Environmental Cleanup #20 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Bahan Youth Hall', 'Near Shwedagon West Gate', 16.815762, 96.125328,
    false, '2026-12-20 12:45:20+0630'::timestamptz, '2026-12-20 16:45:20+0630'::timestamptz, '2026-12-18 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_21', id, 'Yangon', 'active', 'u_406', 'u_406'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #21 [SYNTHETIC]'
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
    'Yangon Mobile Blood Donation Support #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Yangon Hlaing Sports Complex', 'Near Inya Lake Walkway', 16.824196, 96.12113,
    false, '2027-11-05 14:45:20+0630'::timestamptz, '2027-11-05 18:45:20+0630'::timestamptz, '2027-11-03 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Mobile Blood Donation Support #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_22', id, 'Yangon', 'published', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Mobile Blood Donation Support #22 [SYNTHETIC]'
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
    'Yangon Public Health Awareness Outreach #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.825977, 96.128741,
    false, '2026-12-22 11:45:20+0630'::timestamptz, '2026-12-22 15:45:20+0630'::timestamptz, '2026-12-20 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Public Health Awareness Outreach #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_23', id, 'Yangon', 'completed', 'u_306', 'u_306'
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_23', id, '2024-11-05 04:45:20+0630'::timestamptz, '2024-11-05 08:45:20+0630'::timestamptz, '2024-11-03 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Public Health Awareness Outreach #23 [SYNTHETIC]'
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
    'Yangon Community Food Distribution #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.816547, 96.124763,
    false, '2026-12-23 14:45:20+0630'::timestamptz, '2026-12-23 18:45:20+0630'::timestamptz, '2026-12-21 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_24', id, 'Yangon', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Community Food Distribution #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_24', id, '2024-10-04 08:45:20+0630'::timestamptz, '2024-10-04 12:45:20+0630'::timestamptz, '2024-10-02 08:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_301'),
    'Yangon Community Food Distribution #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Yangon Kamayut Community Center', 'Near Junction Square', 16.814966, 96.122436,
    false, '2026-12-24 12:45:20+0630'::timestamptz, '2026-12-24 16:45:20+0630'::timestamptz, '2026-12-22 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Food Distribution #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_25', id, 'Yangon', 'active', 'u_301', 'u_301'
FROM events WHERE title = 'Yangon Community Food Distribution #25 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.825827, 96.131478,
    false, '2026-12-25 11:45:20+0630'::timestamptz, '2026-12-25 15:45:20+0630'::timestamptz, '2026-12-23 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_26', id, 'Yangon', 'completed', 'u_103', 'u_103'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_26', id, '2024-08-01 07:45:20+0630'::timestamptz, '2024-08-01 11:45:20+0630'::timestamptz, '2024-07-30 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Youth Education & Tutoring #26 [SYNTHETIC]'
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
    'Yangon Monsoon Flood Preparedness #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Yangon Thingangyun Civic Pavilion', 'Near AKK Shopping Mall', 16.814483, 96.125893,
    false, '2026-12-26 11:45:20+0630'::timestamptz, '2026-12-26 15:45:20+0630'::timestamptz, '2026-12-24 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_27', id, 'Yangon', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_27', id, '2024-06-30 06:45:20+0630'::timestamptz, '2024-06-30 10:45:20+0630'::timestamptz, '2024-06-28 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Monsoon Flood Preparedness #27 [SYNTHETIC]'
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
    'Yangon Youth Education & Tutoring #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.82533, 96.12477,
    false, '2026-12-27 11:45:20+0630'::timestamptz, '2026-12-27 15:45:20+0630'::timestamptz, '2026-12-25 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Youth Education & Tutoring #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_28', id, 'Yangon', 'cancelled', 'u_304', 'u_304'
FROM events WHERE title = 'Yangon Youth Education & Tutoring #28 [SYNTHETIC]'
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
    'Yangon Community Environmental Cleanup #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.814293, 96.122893,
    false, '2026-12-28 11:45:20+0630'::timestamptz, '2026-12-28 15:45:20+0630'::timestamptz, '2026-12-26 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Environmental Cleanup #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_29', id, 'Yangon', 'completed', 'u_304', 'u_304'
FROM events WHERE title = 'Yangon Community Environmental Cleanup #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_29', id, '2024-04-27 07:45:20+0630'::timestamptz, '2024-04-27 11:45:20+0630'::timestamptz, '2024-04-25 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Yangon Community Environmental Cleanup #29 [SYNTHETIC]'
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
    'Yangon Community Environmental Cleanup #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Yangon Insein Railway Welfare Ground', 'Near Insein Market', 16.812136, 96.129982,
    false, '2026-12-29 13:45:20+0630'::timestamptz, '2026-12-29 17:45:20+0630'::timestamptz, '2026-12-27 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Yangon Community Environmental Cleanup #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_yangon_30', id, 'Yangon', 'completed', 'u_205', 'u_205'
FROM events WHERE title = 'Yangon Community Environmental Cleanup #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_yangon_30', id, '2024-03-26 06:45:20+0630'::timestamptz, '2024-03-26 10:45:20+0630'::timestamptz, '2024-03-24 06:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    'Mandalay Public Health Awareness Outreach #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.958228, 96.095578,
    false, '2026-12-04 12:45:20+0630'::timestamptz, '2026-12-04 16:45:20+0630'::timestamptz, '2026-12-02 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_01', id, 'Mandalay', 'published', 'u_001', 'u_001'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #1 [SYNTHETIC]'
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
    'Mandalay Elderly Care & Support Day #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.954634, 96.089576,
    false, '2026-12-31 12:45:20+0630'::timestamptz, '2026-12-31 16:45:20+0630'::timestamptz, '2026-12-29 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_02', id, 'Mandalay', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_02', id, '2026-09-08 05:45:20+0630'::timestamptz, '2026-09-08 09:45:20+0630'::timestamptz, '2026-09-06 05:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_003'),
    'Mandalay Mobile Blood Donation Support #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.963891, 96.094553,
    false, '2027-01-01 11:45:20+0630'::timestamptz, '2027-01-01 15:45:20+0630'::timestamptz, '2026-12-30 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_03', id, 'Mandalay', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_03', id, '2026-08-07 07:45:20+0630'::timestamptz, '2026-08-07 11:45:20+0630'::timestamptz, '2026-08-05 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #3 [SYNTHETIC]'
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
    'Mandalay Youth Education & Tutoring #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.96575, 96.087633,
    false, '2027-01-02 13:45:20+0630'::timestamptz, '2027-01-02 17:45:20+0630'::timestamptz, '2026-12-31 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_04', id, 'Mandalay', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_04', id, '2026-07-06 06:45:20+0630'::timestamptz, '2026-07-06 10:45:20+0630'::timestamptz, '2026-07-04 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #4 [SYNTHETIC]'
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
    'Mandalay Youth Education & Tutoring #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.965957, 96.091653,
    false, '2027-01-03 11:45:20+0630'::timestamptz, '2027-01-03 15:45:20+0630'::timestamptz, '2027-01-01 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_05', id, 'Mandalay', 'completed', 'u_404', 'u_404'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_05', id, '2026-06-04 06:45:20+0630'::timestamptz, '2026-06-04 10:45:20+0630'::timestamptz, '2026-06-02 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #5 [SYNTHETIC]'
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
    'Mandalay Elderly Care & Support Day #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.960357, 96.083664,
    false, '2027-02-22 11:45:20+0630'::timestamptz, '2027-02-22 15:45:20+0630'::timestamptz, '2027-02-20 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_06', id, 'Mandalay', 'published', 'u_005', 'u_005'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #6 [SYNTHETIC]'
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
    'Mandalay Shelter Animal Welfare & Feeding #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.952901, 96.093158,
    false, '2027-01-05 12:45:20+0630'::timestamptz, '2027-01-05 16:45:20+0630'::timestamptz, '2027-01-03 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_07', id, 'Mandalay', 'completed', 'u_001', 'u_001'
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_07', id, '2026-04-01 04:45:20+0630'::timestamptz, '2026-04-01 08:45:20+0630'::timestamptz, '2026-03-30 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #7 [SYNTHETIC]'
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
    'Mandalay Monsoon Flood Preparedness #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.958956, 96.088951,
    false, '2027-03-26 14:45:20+0630'::timestamptz, '2027-03-26 18:45:20+0630'::timestamptz, '2027-03-24 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_08', id, 'Mandalay', 'published', 'u_206', 'u_206'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #8 [SYNTHETIC]'
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
    'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.961061, 96.096202,
    false, '2027-01-07 13:45:20+0630'::timestamptz, '2027-01-07 17:45:20+0630'::timestamptz, '2027-01-05 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_09', id, 'Mandalay', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_09', id, '2026-01-27 08:45:20+0630'::timestamptz, '2026-01-27 12:45:20+0630'::timestamptz, '2026-01-25 08:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Mobile Blood Donation Support #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.965039, 96.09646,
    false, '2027-04-27 14:45:20+0630'::timestamptz, '2027-04-27 18:45:20+0630'::timestamptz, '2027-04-25 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_10', id, 'Mandalay', 'published', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #10 [SYNTHETIC]'
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
    'Mandalay Youth Education & Tutoring #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.957767, 96.086659,
    false, '2027-01-09 13:45:20+0630'::timestamptz, '2027-01-09 17:45:20+0630'::timestamptz, '2027-01-07 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_11', id, 'Mandalay', 'draft', 'u_404', 'u_404'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #11 [SYNTHETIC]'
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
    'Mandalay Elderly Care & Support Day #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.951735, 96.085362,
    false, '2027-01-10 11:45:20+0630'::timestamptz, '2027-01-10 15:45:20+0630'::timestamptz, '2027-01-08 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_12', id, 'Mandalay', 'active', 'u_003', 'u_003'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #12 [SYNTHETIC]'
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
    'Mandalay Monsoon Flood Preparedness #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.954528, 96.096574,
    false, '2027-01-11 11:45:20+0630'::timestamptz, '2027-01-11 15:45:20+0630'::timestamptz, '2027-01-09 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_13', id, 'Mandalay', 'active', 'u_404', 'u_404'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #13 [SYNTHETIC]'
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
    'Mandalay Elderly Care & Support Day #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.95166, 96.081748,
    false, '2027-01-12 13:45:20+0630'::timestamptz, '2027-01-12 17:45:20+0630'::timestamptz, '2027-01-10 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_14', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #14 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_14', id, '2025-08-20 08:45:20+0630'::timestamptz, '2025-08-20 12:45:20+0630'::timestamptz, '2025-08-18 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #14 [SYNTHETIC]'
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
    'Mandalay Community Food Distribution #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.957279, 96.091816,
    false, '2027-01-13 12:45:20+0630'::timestamptz, '2027-01-13 16:45:20+0630'::timestamptz, '2027-01-11 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Food Distribution #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_15', id, 'Mandalay', 'completed', 'u_001', 'u_001'
FROM events WHERE title = 'Mandalay Community Food Distribution #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_15', id, '2025-07-19 04:45:20+0630'::timestamptz, '2025-07-19 08:45:20+0630'::timestamptz, '2025-07-17 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Food Distribution #15 [SYNTHETIC]'
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
    'Mandalay Monsoon Flood Preparedness #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.9557, 96.089067,
    false, '2027-01-14 11:45:20+0630'::timestamptz, '2027-01-14 15:45:20+0630'::timestamptz, '2027-01-12 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_16', id, 'Mandalay', 'cancelled', 'u_005', 'u_005'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #16 [SYNTHETIC]'
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
    'Mandalay Public Health Awareness Outreach #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.960496, 96.084094,
    false, '2027-01-15 13:45:20+0630'::timestamptz, '2027-01-15 17:45:20+0630'::timestamptz, '2027-01-13 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_17', id, 'Mandalay', 'cancelled', 'u_001', 'u_001'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #17 [SYNTHETIC]'
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
    'Mandalay Shelter Animal Welfare & Feeding #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.962893, 96.088434,
    false, '2027-01-16 14:45:20+0630'::timestamptz, '2027-01-16 18:45:20+0630'::timestamptz, '2027-01-14 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_18', id, 'Mandalay', 'cancelled', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #18 [SYNTHETIC]'
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
    'Mandalay Mobile Blood Donation Support #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Mahaaungmyay Community Hub', 'Near Mahamuni Pagoda', 21.959674, 96.087012,
    false, '2027-09-18 14:45:20+0630'::timestamptz, '2027-09-18 18:45:20+0630'::timestamptz, '2027-09-16 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_19', id, 'Mandalay', 'published', 'u_003', 'u_003'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #19 [SYNTHETIC]'
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
    'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.952968, 96.092596,
    false, '2027-01-18 14:45:20+0630'::timestamptz, '2027-01-18 18:45:20+0630'::timestamptz, '2027-01-16 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_20', id, 'Mandalay', 'completed', 'u_001', 'u_001'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_20', id, '2025-02-09 08:45:20+0630'::timestamptz, '2025-02-09 12:45:20+0630'::timestamptz, '2025-02-07 08:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_002'),
    'Mandalay Mobile Blood Donation Support #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.953241, 96.086242,
    false, '2027-01-19 13:45:20+0630'::timestamptz, '2027-01-19 17:45:20+0630'::timestamptz, '2027-01-17 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_21', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_21', id, '2025-01-08 07:45:20+0630'::timestamptz, '2025-01-08 11:45:20+0630'::timestamptz, '2025-01-06 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #21 [SYNTHETIC]'
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
    'Mandalay Community Environmental Cleanup #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.957888, 96.095841,
    false, '2027-11-05 14:45:20+0630'::timestamptz, '2027-11-05 18:45:20+0630'::timestamptz, '2027-11-03 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Environmental Cleanup #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_22', id, 'Mandalay', 'published', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Community Environmental Cleanup #22 [SYNTHETIC]'
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
    'Mandalay Monsoon Flood Preparedness #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Mandalay Amarapura Artisan Pavilion', 'Near U Bein Bridge', 21.954547, 96.093893,
    false, '2027-01-21 13:45:20+0630'::timestamptz, '2027-01-21 17:45:20+0630'::timestamptz, '2027-01-19 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_23', id, 'Mandalay', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_23', id, '2024-11-05 05:45:20+0630'::timestamptz, '2024-11-05 09:45:20+0630'::timestamptz, '2024-11-03 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Monsoon Flood Preparedness #23 [SYNTHETIC]'
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
    'Mandalay Public Health Awareness Outreach #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.958383, 96.085949,
    false, '2027-01-22 11:45:20+0630'::timestamptz, '2027-01-22 15:45:20+0630'::timestamptz, '2027-01-20 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_24', id, 'Mandalay', 'completed', 'u_404', 'u_404'
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_24', id, '2024-10-04 08:45:20+0630'::timestamptz, '2024-10-04 12:45:20+0630'::timestamptz, '2024-10-02 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Public Health Awareness Outreach #24 [SYNTHETIC]'
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
    'Mandalay Youth Education & Tutoring #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.959785, 96.090589,
    false, '2027-01-23 11:45:20+0630'::timestamptz, '2027-01-23 15:45:20+0630'::timestamptz, '2027-01-21 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_25', id, 'Mandalay', 'completed', 'u_003', 'u_003'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_25', id, '2024-09-02 08:45:20+0630'::timestamptz, '2024-09-02 12:45:20+0630'::timestamptz, '2024-08-31 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #25 [SYNTHETIC]'
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
    'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.953876, 96.091353,
    false, '2027-01-24 14:45:20+0630'::timestamptz, '2027-01-24 18:45:20+0630'::timestamptz, '2027-01-22 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_26', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Elderly Care & Support Day #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_26', id, '2024-08-01 05:45:20+0630'::timestamptz, '2024-08-01 09:45:20+0630'::timestamptz, '2024-07-30 05:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_001'),
    'Mandalay Youth Education & Tutoring #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Mandalay Aungmyaythazan Civic Park', 'Near Mandalay Hill Foot', 21.962883, 96.086039,
    false, '2027-01-25 13:45:20+0630'::timestamptz, '2027-01-25 17:45:20+0630'::timestamptz, '2027-01-23 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Youth Education & Tutoring #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_27', id, 'Mandalay', 'completed', 'u_001', 'u_001'
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_27', id, '2024-06-30 06:45:20+0630'::timestamptz, '2024-06-30 10:45:20+0630'::timestamptz, '2024-06-28 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Youth Education & Tutoring #27 [SYNTHETIC]'
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
    'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.959167, 96.085483,
    false, '2027-01-26 14:45:20+0630'::timestamptz, '2027-01-26 18:45:20+0630'::timestamptz, '2027-01-24 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_28', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Shelter Animal Welfare & Feeding #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_28', id, '2024-05-29 06:45:20+0630'::timestamptz, '2024-05-29 10:45:20+0630'::timestamptz, '2024-05-27 06:45:20+0630'::timestamptz
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
    'Mandalay Community Food Distribution #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Mandalay Chanayethazan Welfare Center', 'Near Central Railway Station', 21.961987, 96.09622,
    false, '2027-01-27 13:45:20+0630'::timestamptz, '2027-01-27 17:45:20+0630'::timestamptz, '2027-01-25 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Community Food Distribution #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_29', id, 'Mandalay', 'completed', 'u_002', 'u_002'
FROM events WHERE title = 'Mandalay Community Food Distribution #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_29', id, '2024-04-27 07:45:20+0630'::timestamptz, '2024-04-27 11:45:20+0630'::timestamptz, '2024-04-25 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Community Food Distribution #29 [SYNTHETIC]'
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
    'Mandalay Mobile Blood Donation Support #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Mandalay Chanmyathazi Education Center', 'Near Mandalar Stadium', 21.960174, 96.083764,
    false, '2027-01-28 11:45:20+0630'::timestamptz, '2027-01-28 15:45:20+0630'::timestamptz, '2027-01-26 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_mandalay_30', id, 'Mandalay', 'completed', 'u_005', 'u_005'
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_mandalay_30', id, '2024-03-26 05:45:20+0630'::timestamptz, '2024-03-26 09:45:20+0630'::timestamptz, '2024-03-24 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Mandalay Mobile Blood Donation Support #30 [SYNTHETIC]'
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
    'Pyay Monsoon Flood Preparedness #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Paungde Rural Outreach Station', 'Near Paungde Clock Tower', 18.821002, 95.215973,
    false, '2027-01-29 14:45:20+0630'::timestamptz, '2027-01-29 18:45:20+0630'::timestamptz, '2027-01-27 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_01', id, 'Pyay', 'draft', 'u_006', 'u_006'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #1 [SYNTHETIC]'
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
    'Pyay Elderly Care & Support Day #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.826934, 95.21803,
    false, '2027-01-30 13:45:20+0630'::timestamptz, '2027-01-30 17:45:20+0630'::timestamptz, '2027-01-28 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Elderly Care & Support Day #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_02', id, 'Pyay', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Elderly Care & Support Day #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_02', id, '2026-09-08 05:45:20+0630'::timestamptz, '2026-09-08 09:45:20+0630'::timestamptz, '2026-09-06 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Elderly Care & Support Day #2 [SYNTHETIC]'
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
    'Pyay Monsoon Flood Preparedness #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.820743, 95.227544,
    false, '2027-01-31 11:45:20+0630'::timestamptz, '2027-01-31 15:45:20+0630'::timestamptz, '2027-01-29 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_03', id, 'Pyay', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_03', id, '2026-08-07 05:45:20+0630'::timestamptz, '2026-08-07 09:45:20+0630'::timestamptz, '2026-08-05 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #3 [SYNTHETIC]'
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
    'Pyay Elderly Care & Support Day #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.823085, 95.217013,
    false, '2027-02-01 12:45:20+0630'::timestamptz, '2027-02-01 16:45:20+0630'::timestamptz, '2027-01-30 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Elderly Care & Support Day #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_04', id, 'Pyay', 'completed', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Elderly Care & Support Day #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_04', id, '2026-07-06 05:45:20+0630'::timestamptz, '2026-07-06 09:45:20+0630'::timestamptz, '2026-07-04 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Elderly Care & Support Day #4 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.816609, 95.218086,
    false, '2027-02-02 14:45:20+0630'::timestamptz, '2027-02-02 18:45:20+0630'::timestamptz, '2027-01-31 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_05', id, 'Pyay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #5 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_05', id, '2026-06-04 04:45:20+0630'::timestamptz, '2026-06-04 08:45:20+0630'::timestamptz, '2026-06-02 04:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    'Pyay Monsoon Flood Preparedness #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.826733, 95.229075,
    false, '2027-02-03 13:45:20+0630'::timestamptz, '2027-02-03 17:45:20+0630'::timestamptz, '2027-02-01 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_06', id, 'Pyay', 'completed', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_06', id, '2026-05-03 08:45:20+0630'::timestamptz, '2026-05-03 12:45:20+0630'::timestamptz, '2026-05-01 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #6 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.825964, 95.217451,
    false, '2027-02-04 13:45:20+0630'::timestamptz, '2027-02-04 17:45:20+0630'::timestamptz, '2027-02-02 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_07', id, 'Pyay', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_07', id, '2026-04-01 04:45:20+0630'::timestamptz, '2026-04-01 08:45:20+0630'::timestamptz, '2026-03-30 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #7 [SYNTHETIC]'
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
    'Pyay Youth Education & Tutoring #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.817458, 95.228003,
    false, '2027-02-05 14:45:20+0630'::timestamptz, '2027-02-05 18:45:20+0630'::timestamptz, '2027-02-03 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Youth Education & Tutoring #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_08', id, 'Pyay', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Youth Education & Tutoring #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_08', id, '2026-02-28 06:45:20+0630'::timestamptz, '2026-02-28 10:45:20+0630'::timestamptz, '2026-02-26 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Youth Education & Tutoring #8 [SYNTHETIC]'
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
    'Pyay Community Food Distribution #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.822986, 95.217897,
    false, '2027-02-06 11:45:20+0630'::timestamptz, '2027-02-06 15:45:20+0630'::timestamptz, '2027-02-04 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_09', id, 'Pyay', 'completed', 'u_006', 'u_006'
FROM events WHERE title = 'Pyay Community Food Distribution #9 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_09', id, '2026-01-27 07:45:20+0630'::timestamptz, '2026-01-27 11:45:20+0630'::timestamptz, '2026-01-25 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #9 [SYNTHETIC]'
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
    'Pyay Community Food Distribution #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.820854, 95.22033,
    false, '2027-02-07 14:45:20+0630'::timestamptz, '2027-02-07 18:45:20+0630'::timestamptz, '2027-02-05 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_10', id, 'Pyay', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Community Food Distribution #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_10', id, '2025-12-26 05:45:20+0630'::timestamptz, '2025-12-26 09:45:20+0630'::timestamptz, '2025-12-24 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #10 [SYNTHETIC]'
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
    'Pyay Community Food Distribution #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.828414, 95.221471,
    false, '2027-05-13 11:45:20+0630'::timestamptz, '2027-05-13 15:45:20+0630'::timestamptz, '2027-05-11 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_11', id, 'Pyay', 'published', 'u_006', 'u_006'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_203'),
    'Pyay Mobile Blood Donation Support #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.822376, 95.222198,
    false, '2027-02-09 14:45:20+0630'::timestamptz, '2027-02-09 18:45:20+0630'::timestamptz, '2027-02-07 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Mobile Blood Donation Support #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_12', id, 'Pyay', 'completed', 'u_203', 'u_203'
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #12 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_12', id, '2025-10-23 07:45:20+0630'::timestamptz, '2025-10-23 11:45:20+0630'::timestamptz, '2025-10-21 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #12 [SYNTHETIC]'
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
    'Pyay Monsoon Flood Preparedness #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.822856, 95.218475,
    false, '2027-02-10 13:45:20+0630'::timestamptz, '2027-02-10 17:45:20+0630'::timestamptz, '2027-02-08 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_13', id, 'Pyay', 'completed', 'u_203', 'u_203'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_13', id, '2025-09-21 05:45:20+0630'::timestamptz, '2025-09-21 09:45:20+0630'::timestamptz, '2025-09-19 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #13 [SYNTHETIC]'
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
    'Pyay Community Environmental Cleanup #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.823175, 95.223979,
    false, '2027-02-11 12:45:20+0630'::timestamptz, '2027-02-11 16:45:20+0630'::timestamptz, '2027-02-09 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Environmental Cleanup #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_14', id, 'Pyay', 'active', 'u_102', 'u_102'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_006'),
    'Pyay Public Health Awareness Outreach #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.816237, 95.223292,
    false, '2027-07-16 12:45:20+0630'::timestamptz, '2027-07-16 16:45:20+0630'::timestamptz, '2027-07-14 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_15', id, 'Pyay', 'published', 'u_006', 'u_006'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #15 [SYNTHETIC]'
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
    'Pyay Mobile Blood Donation Support #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.826096, 95.217161,
    false, '2027-08-01 12:45:20+0630'::timestamptz, '2027-08-01 16:45:20+0630'::timestamptz, '2027-07-30 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Mobile Blood Donation Support #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_16', id, 'Pyay', 'published', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #16 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.828986, 95.21473,
    false, '2027-02-14 12:45:20+0630'::timestamptz, '2027-02-14 16:45:20+0630'::timestamptz, '2027-02-12 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_17', id, 'Pyay', 'completed', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #17 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_17', id, '2025-05-16 05:45:20+0630'::timestamptz, '2025-05-16 09:45:20+0630'::timestamptz, '2025-05-14 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #17 [SYNTHETIC]'
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
    'Pyay Mobile Blood Donation Support #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.828717, 95.220402,
    false, '2027-02-15 13:45:20+0630'::timestamptz, '2027-02-15 17:45:20+0630'::timestamptz, '2027-02-13 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Mobile Blood Donation Support #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_18', id, 'Pyay', 'active', 'u_102', 'u_102'
FROM events WHERE title = 'Pyay Mobile Blood Donation Support #18 [SYNTHETIC]'
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
    'Pyay Shelter Animal Welfare & Feeding #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.826764, 95.220066,
    false, '2027-09-18 14:45:20+0630'::timestamptz, '2027-09-18 18:45:20+0630'::timestamptz, '2027-09-16 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_19', id, 'Pyay', 'published', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #19 [SYNTHETIC]'
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
    'Pyay Shelter Animal Welfare & Feeding #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.824334, 95.21865,
    false, '2027-02-17 12:45:20+0630'::timestamptz, '2027-02-17 16:45:20+0630'::timestamptz, '2027-02-15 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_20', id, 'Pyay', 'completed', 'u_201', 'u_201'
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #20 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_20', id, '2025-02-09 05:45:20+0630'::timestamptz, '2025-02-09 09:45:20+0630'::timestamptz, '2025-02-07 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Shelter Animal Welfare & Feeding #20 [SYNTHETIC]'
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
    'Pyay Youth Education & Tutoring #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Pyay Pyay District Youth Stadium', 'Near Pyay University Rd', 18.817496, 95.227971,
    false, '2027-02-18 13:45:20+0630'::timestamptz, '2027-02-18 17:45:20+0630'::timestamptz, '2027-02-16 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Youth Education & Tutoring #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_21', id, 'Pyay', 'completed', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Youth Education & Tutoring #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_21', id, '2025-01-08 07:45:20+0630'::timestamptz, '2025-01-08 11:45:20+0630'::timestamptz, '2025-01-06 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Youth Education & Tutoring #21 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Shwedaung Community Center', 'Near Shwedaung Market', 18.825779, 95.220642,
    false, '2027-02-19 14:45:20+0630'::timestamptz, '2027-02-19 18:45:20+0630'::timestamptz, '2027-02-17 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_22', id, 'Pyay', 'cancelled', 'u_203', 'u_203'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #22 [SYNTHETIC]'
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
    'Pyay Elderly Care & Support Day #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.827054, 95.22003,
    false, '2027-02-20 12:45:20+0630'::timestamptz, '2027-02-20 16:45:20+0630'::timestamptz, '2027-02-18 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Elderly Care & Support Day #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_23', id, 'Pyay', 'completed', 'u_102', 'u_102'
FROM events WHERE title = 'Pyay Elderly Care & Support Day #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_23', id, '2024-11-05 04:45:20+0630'::timestamptz, '2024-11-05 08:45:20+0630'::timestamptz, '2024-11-03 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Elderly Care & Support Day #23 [SYNTHETIC]'
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
    'Pyay Community Food Distribution #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.817365, 95.222866,
    false, '2027-02-21 11:45:20+0630'::timestamptz, '2027-02-21 15:45:20+0630'::timestamptz, '2027-02-19 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_24', id, 'Pyay', 'completed', 'u_102', 'u_102'
FROM events WHERE title = 'Pyay Community Food Distribution #24 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_24', id, '2024-10-04 06:45:20+0630'::timestamptz, '2024-10-04 10:45:20+0630'::timestamptz, '2024-10-02 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Community Food Distribution #24 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.831038, 95.220295,
    false, '2027-02-22 13:45:20+0630'::timestamptz, '2027-02-22 17:45:20+0630'::timestamptz, '2027-02-20 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_25', id, 'Pyay', 'completed', 'u_201', 'u_201'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_25', id, '2024-09-02 07:45:20+0630'::timestamptz, '2024-09-02 11:45:20+0630'::timestamptz, '2024-08-31 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #25 [SYNTHETIC]'
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
    'Pyay Elderly Care & Support Day #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Pyay Paungde Rural Outreach Station', 'Near Paungde Clock Tower', 18.82167, 95.222231,
    false, '2028-01-08 12:45:20+0630'::timestamptz, '2028-01-08 16:45:20+0630'::timestamptz, '2028-01-06 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Elderly Care & Support Day #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_26', id, 'Pyay', 'published', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Elderly Care & Support Day #26 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.827707, 95.219194,
    false, '2027-02-24 14:45:20+0630'::timestamptz, '2027-02-24 18:45:20+0630'::timestamptz, '2027-02-22 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_27', id, 'Pyay', 'cancelled', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #27 [SYNTHETIC]'
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
    'Pyay Public Health Awareness Outreach #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.824841, 95.226261,
    false, '2027-02-25 14:45:20+0630'::timestamptz, '2027-02-25 18:45:20+0630'::timestamptz, '2027-02-23 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Public Health Awareness Outreach #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_28', id, 'Pyay', 'completed', 'u_401', 'u_401'
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #28 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_pyay_28', id, '2024-05-29 07:45:20+0630'::timestamptz, '2024-05-29 11:45:20+0630'::timestamptz, '2024-05-27 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Pyay Public Health Awareness Outreach #28 [SYNTHETIC]'
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
    'Pyay Community Food Distribution #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Pyay Padaung Riverbank Pavilion', 'Near Ayeyarwady Crossing', 18.829428, 95.219835,
    false, '2027-02-26 14:45:20+0630'::timestamptz, '2027-02-26 18:45:20+0630'::timestamptz, '2027-02-24 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Community Food Distribution #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_29', id, 'Pyay', 'cancelled', 'u_006', 'u_006'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_403'),
    'Pyay Monsoon Flood Preparedness #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Pyay Pyay Town Hall Grounds', 'Near Shwesandaw Pagoda', 18.827984, 95.228339,
    false, '2028-03-12 14:45:20+0630'::timestamptz, '2028-03-12 18:45:20+0630'::timestamptz, '2028-03-10 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_pyay_30', id, 'Pyay', 'published', 'u_403', 'u_403'
FROM events WHERE title = 'Pyay Monsoon Flood Preparedness #30 [SYNTHETIC]'
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
    'Bago Shelter Animal Welfare & Feeding #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.321168, 96.478468,
    false, '2027-02-28 13:45:20+0630'::timestamptz, '2027-02-28 17:45:20+0630'::timestamptz, '2027-02-26 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_01', id, 'Bago', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #1 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_01', id, '2026-10-10 06:45:20+0630'::timestamptz, '2026-10-10 10:45:20+0630'::timestamptz, '2026-10-08 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #1 [SYNTHETIC]'
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
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.323131, 96.484364,
    false, '2027-03-01 12:45:20+0630'::timestamptz, '2027-03-01 16:45:20+0630'::timestamptz, '2027-02-27 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_02', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Community Environmental Cleanup #2 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_02', id, '2026-09-08 04:45:20+0630'::timestamptz, '2026-09-08 08:45:20+0630'::timestamptz, '2026-09-06 04:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_004'),
    'Bago Community Environmental Cleanup #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.324311, 96.478281,
    false, '2027-03-02 13:45:20+0630'::timestamptz, '2027-03-02 17:45:20+0630'::timestamptz, '2027-02-28 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_03', id, 'Bago', 'completed', 'u_004', 'u_004'
FROM events WHERE title = 'Bago Community Environmental Cleanup #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_03', id, '2026-08-07 07:45:20+0630'::timestamptz, '2026-08-07 11:45:20+0630'::timestamptz, '2026-08-05 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Community Environmental Cleanup #3 [SYNTHETIC]'
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
    'Bago Community Environmental Cleanup #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.324078, 96.477619,
    false, '2027-03-03 14:45:20+0630'::timestamptz, '2027-03-03 18:45:20+0630'::timestamptz, '2027-03-01 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_04', id, 'Bago', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Community Environmental Cleanup #4 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_04', id, '2026-07-06 06:45:20+0630'::timestamptz, '2026-07-06 10:45:20+0630'::timestamptz, '2026-07-04 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Community Environmental Cleanup #4 [SYNTHETIC]'
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
    'Bago Community Food Distribution #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.320949, 96.484677,
    false, '2027-03-04 14:45:20+0630'::timestamptz, '2027-03-04 18:45:20+0630'::timestamptz, '2027-03-02 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_05', id, 'Bago', 'cancelled', 'u_303', 'u_303'
FROM events WHERE title = 'Bago Community Food Distribution #5 [SYNTHETIC]'
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
    'Bago Community Environmental Cleanup #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.322015, 96.476787,
    false, '2027-03-05 14:45:20+0630'::timestamptz, '2027-03-05 18:45:20+0630'::timestamptz, '2027-03-03 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Environmental Cleanup #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_06', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Community Environmental Cleanup #6 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_06', id, '2026-05-03 05:45:20+0630'::timestamptz, '2026-05-03 09:45:20+0630'::timestamptz, '2026-05-01 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Community Environmental Cleanup #6 [SYNTHETIC]'
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
    'Bago Elderly Care & Support Day #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.323985, 96.476992,
    false, '2027-03-06 13:45:20+0630'::timestamptz, '2027-03-06 17:45:20+0630'::timestamptz, '2027-03-04 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_07', id, 'Bago', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Elderly Care & Support Day #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_07', id, '2026-04-01 04:45:20+0630'::timestamptz, '2026-04-01 08:45:20+0630'::timestamptz, '2026-03-30 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Elderly Care & Support Day #7 [SYNTHETIC]'
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
    'Bago Shelter Animal Welfare & Feeding #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.319026, 96.486286,
    false, '2027-03-07 12:45:20+0630'::timestamptz, '2027-03-07 16:45:20+0630'::timestamptz, '2027-03-05 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_08', id, 'Bago', 'cancelled', 'u_303', 'u_303'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #8 [SYNTHETIC]'
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
    'Bago Youth Education & Tutoring #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.319186, 96.478433,
    false, '2027-03-08 11:45:20+0630'::timestamptz, '2027-03-08 15:45:20+0630'::timestamptz, '2027-03-06 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_09', id, 'Bago', 'draft', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Youth Education & Tutoring #9 [SYNTHETIC]'
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
    'Bago Elderly Care & Support Day #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.329231, 96.482758,
    false, '2027-03-09 13:45:20+0630'::timestamptz, '2027-03-09 17:45:20+0630'::timestamptz, '2027-03-07 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_10', id, 'Bago', 'completed', 'u_302', 'u_302'
FROM events WHERE title = 'Bago Elderly Care & Support Day #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_10', id, '2025-12-26 07:45:20+0630'::timestamptz, '2025-12-26 11:45:20+0630'::timestamptz, '2025-12-24 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Elderly Care & Support Day #10 [SYNTHETIC]'
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
    'Bago Elderly Care & Support Day #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.324706, 96.47613,
    false, '2027-03-10 12:45:20+0630'::timestamptz, '2027-03-10 16:45:20+0630'::timestamptz, '2027-03-08 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_11', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Elderly Care & Support Day #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_11', id, '2025-11-24 05:45:20+0630'::timestamptz, '2025-11-24 09:45:20+0630'::timestamptz, '2025-11-22 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Elderly Care & Support Day #11 [SYNTHETIC]'
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
    'Bago Shelter Animal Welfare & Feeding #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.318014, 96.474323,
    false, '2027-03-11 13:45:20+0630'::timestamptz, '2027-03-11 17:45:20+0630'::timestamptz, '2027-03-09 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_12', id, 'Bago', 'active', 'u_303', 'u_303'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #12 [SYNTHETIC]'
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
    'Bago Monsoon Flood Preparedness #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.318388, 96.474714,
    false, '2027-03-12 13:45:20+0630'::timestamptz, '2027-03-12 17:45:20+0630'::timestamptz, '2027-03-10 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_13', id, 'Bago', 'completed', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_13', id, '2025-09-21 05:45:20+0630'::timestamptz, '2025-09-21 09:45:20+0630'::timestamptz, '2025-09-19 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #13 [SYNTHETIC]'
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
    'Bago Youth Education & Tutoring #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.322248, 96.475791,
    false, '2027-06-30 12:45:20+0630'::timestamptz, '2027-06-30 16:45:20+0630'::timestamptz, '2027-06-28 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Youth Education & Tutoring #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_14', id, 'Bago', 'published', 'u_004', 'u_004'
FROM events WHERE title = 'Bago Youth Education & Tutoring #14 [SYNTHETIC]'
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
    'Bago Monsoon Flood Preparedness #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.323742, 96.48338,
    false, '2027-07-16 14:45:20+0630'::timestamptz, '2027-07-16 18:45:20+0630'::timestamptz, '2027-07-14 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_15', id, 'Bago', 'published', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #15 [SYNTHETIC]'
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
    'Bago Community Food Distribution #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.317857, 96.483201,
    false, '2027-03-15 11:45:20+0630'::timestamptz, '2027-03-15 15:45:20+0630'::timestamptz, '2027-03-13 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_16', id, 'Bago', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Community Food Distribution #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_16', id, '2025-06-17 05:45:20+0630'::timestamptz, '2025-06-17 09:45:20+0630'::timestamptz, '2025-06-15 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Community Food Distribution #16 [SYNTHETIC]'
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
    'Bago Public Health Awareness Outreach #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.317076, 96.475727,
    false, '2027-03-16 14:45:20+0630'::timestamptz, '2027-03-16 18:45:20+0630'::timestamptz, '2027-03-14 14:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Public Health Awareness Outreach #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_17', id, 'Bago', 'active', 'u_303', 'u_303'
FROM events WHERE title = 'Bago Public Health Awareness Outreach #17 [SYNTHETIC]'
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
    'Bago Mobile Blood Donation Support #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.328266, 96.483316,
    false, '2027-03-17 12:45:20+0630'::timestamptz, '2027-03-17 16:45:20+0630'::timestamptz, '2027-03-15 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_18', id, 'Bago', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_18', id, '2025-04-14 05:45:20+0630'::timestamptz, '2025-04-14 09:45:20+0630'::timestamptz, '2025-04-12 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Mobile Blood Donation Support #18 [SYNTHETIC]'
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
    'Bago Public Health Awareness Outreach #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.319608, 96.4817,
    false, '2027-03-18 14:45:20+0630'::timestamptz, '2027-03-18 18:45:20+0630'::timestamptz, '2027-03-16 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Public Health Awareness Outreach #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_19', id, 'Bago', 'completed', 'u_303', 'u_303'
FROM events WHERE title = 'Bago Public Health Awareness Outreach #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_19', id, '2025-03-13 08:45:20+0630'::timestamptz, '2025-03-13 12:45:20+0630'::timestamptz, '2025-03-11 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Public Health Awareness Outreach #19 [SYNTHETIC]'
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
    'Bago Community Food Distribution #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.320225, 96.477789,
    false, '2027-03-19 14:45:20+0630'::timestamptz, '2027-03-19 18:45:20+0630'::timestamptz, '2027-03-17 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Community Food Distribution #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_20', id, 'Bago', 'cancelled', 'u_302', 'u_302'
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
    'Bago Public Health Awareness Outreach #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Bago Daik-U Youth Association Hall', 'Near Daik-U Station', 17.323801, 96.488026,
    false, '2027-10-20 14:45:20+0630'::timestamptz, '2027-10-20 18:45:20+0630'::timestamptz, '2027-10-18 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Public Health Awareness Outreach #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_21', id, 'Bago', 'published', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Public Health Awareness Outreach #21 [SYNTHETIC]'
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
    'Bago Elderly Care & Support Day #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Bago Heritage Pavilion', 'Near Shwemawdaw Pagoda', 17.327295, 96.484896,
    false, '2027-03-21 13:45:20+0630'::timestamptz, '2027-03-21 17:45:20+0630'::timestamptz, '2027-03-19 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_22', id, 'Bago', 'completed', 'u_004', 'u_004'
FROM events WHERE title = 'Bago Elderly Care & Support Day #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_22', id, '2024-12-07 04:45:20+0630'::timestamptz, '2024-12-07 08:45:20+0630'::timestamptz, '2024-12-05 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Elderly Care & Support Day #22 [SYNTHETIC]'
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
    'Bago Monsoon Flood Preparedness #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.320733, 96.477704,
    false, '2027-03-22 13:45:20+0630'::timestamptz, '2027-03-22 17:45:20+0630'::timestamptz, '2027-03-20 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_23', id, 'Bago', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_23', id, '2024-11-05 08:45:20+0630'::timestamptz, '2024-11-05 12:45:20+0630'::timestamptz, '2024-11-03 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #23 [SYNTHETIC]'
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
    'Bago Elderly Care & Support Day #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.32331, 96.487155,
    false, '2027-12-07 14:45:20+0630'::timestamptz, '2027-12-07 18:45:20+0630'::timestamptz, '2027-12-05 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_24', id, 'Bago', 'published', 'u_104', 'u_104'
FROM events WHERE title = 'Bago Elderly Care & Support Day #24 [SYNTHETIC]'
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
    'Bago Shelter Animal Welfare & Feeding #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.315182, 96.480177,
    false, '2027-03-24 12:45:20+0630'::timestamptz, '2027-03-24 16:45:20+0630'::timestamptz, '2027-03-22 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_25', id, 'Bago', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_25', id, '2024-09-02 07:45:20+0630'::timestamptz, '2024-09-02 11:45:20+0630'::timestamptz, '2024-08-31 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Shelter Animal Welfare & Feeding #25 [SYNTHETIC]'
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
    'Bago Mobile Blood Donation Support #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.318848, 96.483048,
    false, '2028-01-08 13:45:20+0630'::timestamptz, '2028-01-08 17:45:20+0630'::timestamptz, '2028-01-06 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_26', id, 'Bago', 'published', 'u_302', 'u_302'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #26 [SYNTHETIC]'
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
    'Bago Elderly Care & Support Day #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.314912, 96.482503,
    false, '2027-03-26 12:45:20+0630'::timestamptz, '2027-03-26 16:45:20+0630'::timestamptz, '2027-03-24 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Elderly Care & Support Day #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_27', id, 'Bago', 'completed', 'u_305', 'u_305'
FROM events WHERE title = 'Bago Elderly Care & Support Day #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_27', id, '2024-06-30 04:45:20+0630'::timestamptz, '2024-06-30 08:45:20+0630'::timestamptz, '2024-06-28 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Elderly Care & Support Day #27 [SYNTHETIC]'
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
    'Bago Monsoon Flood Preparedness #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Thanatpin Flood Relief Post', 'Near Thanatpin Canal', 17.319527, 96.485868,
    false, '2028-02-09 13:45:20+0630'::timestamptz, '2028-02-09 17:45:20+0630'::timestamptz, '2028-02-07 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_28', id, 'Bago', 'published', 'u_004', 'u_004'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #28 [SYNTHETIC]'
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
    'Bago Monsoon Flood Preparedness #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Bago Kawa Community Center', 'Near Kawa Market', 17.329457, 96.474307,
    false, '2027-03-28 14:45:20+0630'::timestamptz, '2027-03-28 18:45:20+0630'::timestamptz, '2027-03-26 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Monsoon Flood Preparedness #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_29', id, 'Bago', 'completed', 'u_004', 'u_004'
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_29', id, '2024-04-27 05:45:20+0630'::timestamptz, '2024-04-27 09:45:20+0630'::timestamptz, '2024-04-25 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Monsoon Flood Preparedness #29 [SYNTHETIC]'
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
    'Bago Mobile Blood Donation Support #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Bago Waw Agricultural Training Hub', 'Near Waw Town Center', 17.321846, 96.486265,
    false, '2027-03-29 13:45:20+0630'::timestamptz, '2027-03-29 17:45:20+0630'::timestamptz, '2027-03-27 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Bago Mobile Blood Donation Support #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_bago_30', id, 'Bago', 'completed', 'u_204', 'u_204'
FROM events WHERE title = 'Bago Mobile Blood Donation Support #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_bago_30', id, '2024-03-26 07:45:20+0630'::timestamptz, '2024-03-26 11:45:20+0630'::timestamptz, '2024-03-24 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Bago Mobile Blood Donation Support #30 [SYNTHETIC]'
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
    'Magway Shelter Animal Welfare & Feeding #1 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.159824, 94.949985,
    false, '2026-12-04 12:45:20+0630'::timestamptz, '2026-12-04 16:45:20+0630'::timestamptz, '2026-12-02 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #1 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_01', id, 'Magway', 'published', 'u_105', 'u_105'
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #1 [SYNTHETIC]'
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
    'Magway Monsoon Flood Preparedness #2 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.151218, 94.945388,
    false, '2026-12-20 14:45:20+0630'::timestamptz, '2026-12-20 18:45:20+0630'::timestamptz, '2026-12-18 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #2 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_02', id, 'Magway', 'published', 'u_405', 'u_405'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #2 [SYNTHETIC]'
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
    'Magway Youth Education & Tutoring #3 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.155294, 94.952172,
    false, '2027-04-01 12:45:20+0630'::timestamptz, '2027-04-01 16:45:20+0630'::timestamptz, '2027-03-30 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Youth Education & Tutoring #3 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_03', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Youth Education & Tutoring #3 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_03', id, '2026-08-07 07:45:20+0630'::timestamptz, '2026-08-07 11:45:20+0630'::timestamptz, '2026-08-05 07:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Public Health Awareness Outreach #4 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.149133, 94.948694,
    false, '2027-01-21 13:45:20+0630'::timestamptz, '2027-01-21 17:45:20+0630'::timestamptz, '2027-01-19 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #4 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_04', id, 'Magway', 'published', 'u_202', 'u_202'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Magway Community Food Distribution #5 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.156203, 94.949983,
    false, '2027-02-06 11:45:20+0630'::timestamptz, '2027-02-06 15:45:20+0630'::timestamptz, '2027-02-04 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #5 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_05', id, 'Magway', 'published', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Community Food Distribution #5 [SYNTHETIC]'
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
    'Magway Public Health Awareness Outreach #6 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.155597, 94.949552,
    false, '2027-04-04 11:45:20+0630'::timestamptz, '2027-04-04 15:45:20+0630'::timestamptz, '2027-04-02 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #6 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_06', id, 'Magway', 'cancelled', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #6 [SYNTHETIC]'
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
    'Magway Elderly Care & Support Day #7 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.156745, 94.94222,
    false, '2027-04-05 14:45:20+0630'::timestamptz, '2027-04-05 18:45:20+0630'::timestamptz, '2027-04-03 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Elderly Care & Support Day #7 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_07', id, 'Magway', 'completed', 'u_106', 'u_106'
FROM events WHERE title = 'Magway Elderly Care & Support Day #7 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_07', id, '2026-04-01 08:45:20+0630'::timestamptz, '2026-04-01 12:45:20+0630'::timestamptz, '2026-03-30 08:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_405'),
    'Magway Mobile Blood Donation Support #8 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.147079, 94.949855,
    false, '2027-04-06 14:45:20+0630'::timestamptz, '2027-04-06 18:45:20+0630'::timestamptz, '2027-04-04 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #8 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_08', id, 'Magway', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #8 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_08', id, '2026-02-28 04:45:20+0630'::timestamptz, '2026-02-28 08:45:20+0630'::timestamptz, '2026-02-26 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Mobile Blood Donation Support #8 [SYNTHETIC]'
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
    'Magway Shelter Animal Welfare & Feeding #9 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.161104, 94.945122,
    false, '2027-04-07 12:45:20+0630'::timestamptz, '2027-04-07 16:45:20+0630'::timestamptz, '2027-04-05 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #9 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_09', id, 'Magway', 'active', 'u_106', 'u_106'
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #9 [SYNTHETIC]'
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
    'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.160256, 94.952405,
    false, '2027-04-08 11:45:20+0630'::timestamptz, '2027-04-08 15:45:20+0630'::timestamptz, '2027-04-06 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_10', id, 'Magway', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #10 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_10', id, '2025-12-26 08:45:20+0630'::timestamptz, '2025-12-26 12:45:20+0630'::timestamptz, '2025-12-24 08:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Community Environmental Cleanup #11 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.156929, 94.946507,
    false, '2027-04-09 12:45:20+0630'::timestamptz, '2027-04-09 16:45:20+0630'::timestamptz, '2027-04-07 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Environmental Cleanup #11 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_11', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Community Environmental Cleanup #11 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_11', id, '2025-11-24 05:45:20+0630'::timestamptz, '2025-11-24 09:45:20+0630'::timestamptz, '2025-11-22 05:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Community Environmental Cleanup #11 [SYNTHETIC]'
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
    'Magway Monsoon Flood Preparedness #12 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.147843, 94.942873,
    false, '2027-05-29 11:45:20+0630'::timestamptz, '2027-05-29 15:45:20+0630'::timestamptz, '2027-05-27 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #12 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_12', id, 'Magway', 'published', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #12 [SYNTHETIC]'
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
    'Magway Mobile Blood Donation Support #13 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.16108, 94.939688,
    false, '2027-04-11 14:45:20+0630'::timestamptz, '2027-04-11 18:45:20+0630'::timestamptz, '2027-04-09 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #13 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_13', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #13 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_13', id, '2025-09-21 07:45:20+0630'::timestamptz, '2025-09-21 11:45:20+0630'::timestamptz, '2025-09-19 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Mobile Blood Donation Support #13 [SYNTHETIC]'
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
    'Magway Shelter Animal Welfare & Feeding #14 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.14839, 94.941058,
    false, '2027-04-12 11:45:20+0630'::timestamptz, '2027-04-12 15:45:20+0630'::timestamptz, '2027-04-10 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #14 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_14', id, 'Magway', 'draft', 'u_405', 'u_405'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_101'),
    'Magway Public Health Awareness Outreach #15 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.154902, 94.952183,
    false, '2027-04-13 12:45:20+0630'::timestamptz, '2027-04-13 16:45:20+0630'::timestamptz, '2027-04-11 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #15 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_15', id, 'Magway', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #15 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_15', id, '2025-07-19 06:45:20+0630'::timestamptz, '2025-07-19 10:45:20+0630'::timestamptz, '2025-07-17 06:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Public Health Awareness Outreach #15 [SYNTHETIC]'
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
    'Magway Elderly Care & Support Day #16 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Providing companion visits, meal delivery, and mobility support for senior citizens.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.149749, 94.939337,
    false, '2027-04-14 11:45:20+0630'::timestamptz, '2027-04-14 15:45:20+0630'::timestamptz, '2027-04-12 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Elderly Care & Support Day #16 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_16', id, 'Magway', 'completed', 'u_402', 'u_402'
FROM events WHERE title = 'Magway Elderly Care & Support Day #16 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_16', id, '2025-06-17 08:45:20+0630'::timestamptz, '2025-06-17 12:45:20+0630'::timestamptz, '2025-06-15 08:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_105'),
    'Magway Mobile Blood Donation Support #17 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.158705, 94.949707,
    false, '2027-04-15 11:45:20+0630'::timestamptz, '2027-04-15 15:45:20+0630'::timestamptz, '2027-04-13 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #17 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_17', id, 'Magway', 'cancelled', 'u_105', 'u_105'
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_202'),
    'Magway Community Food Distribution #18 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.151207, 94.949224,
    false, '2027-04-16 14:45:20+0630'::timestamptz, '2027-04-16 18:45:20+0630'::timestamptz, '2027-04-14 14:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #18 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_18', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Community Food Distribution #18 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_18', id, '2025-04-14 08:45:20+0630'::timestamptz, '2025-04-14 12:45:20+0630'::timestamptz, '2025-04-12 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Community Food Distribution #18 [SYNTHETIC]'
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
    'Magway Community Food Distribution #19 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.153798, 94.94731,
    false, '2027-04-17 12:45:20+0630'::timestamptz, '2027-04-17 16:45:20+0630'::timestamptz, '2027-04-15 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, true,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #19 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_19', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Community Food Distribution #19 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_19', id, '2025-03-13 07:45:20+0630'::timestamptz, '2025-03-13 11:45:20+0630'::timestamptz, '2025-03-11 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Community Food Distribution #19 [SYNTHETIC]'
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
    'Magway Mobile Blood Donation Support #20 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Non-donor volunteer support for donor registration, queue guidance, and refreshment station.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.1555, 94.939581,
    false, '2027-04-18 12:45:20+0630'::timestamptz, '2027-04-18 16:45:20+0630'::timestamptz, '2027-04-16 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Mobile Blood Donation Support #20 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_20', id, 'Magway', 'active', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Mobile Blood Donation Support #20 [SYNTHETIC]'
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
    'Magway Community Environmental Cleanup #21 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.151768, 94.951457,
    false, '2027-04-19 12:45:20+0630'::timestamptz, '2027-04-19 16:45:20+0630'::timestamptz, '2027-04-17 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', false
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Environmental Cleanup #21 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_21', id, 'Magway', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Magway Community Environmental Cleanup #21 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_21', id, '2025-01-08 07:45:20+0630'::timestamptz, '2025-01-08 11:45:20+0630'::timestamptz, '2025-01-06 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Community Environmental Cleanup #21 [SYNTHETIC]'
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
    'Magway Monsoon Flood Preparedness #22 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting local drainage clearance, barrier preparation, and emergency supply staging.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.159852, 94.952788,
    false, '2027-04-20 11:45:20+0630'::timestamptz, '2027-04-20 15:45:20+0630'::timestamptz, '2027-04-18 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Monsoon Flood Preparedness #22 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_22', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #22 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_22', id, '2024-12-07 04:45:20+0630'::timestamptz, '2024-12-07 08:45:20+0630'::timestamptz, '2024-12-05 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Monsoon Flood Preparedness #22 [SYNTHETIC]'
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
    'Magway Community Environmental Cleanup #23 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Public park, street, and canal bank waste collection and sorting.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.155835, 94.946158,
    false, '2027-04-21 13:45:20+0630'::timestamptz, '2027-04-21 17:45:20+0630'::timestamptz, '2027-04-19 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Environmental Cleanup #23 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_23', id, 'Magway', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Community Environmental Cleanup #23 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_23', id, '2024-11-05 05:45:20+0630'::timestamptz, '2024-11-05 09:45:20+0630'::timestamptz, '2024-11-03 05:45:20+0630'::timestamptz
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
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    (SELECT user_id FROM temp_synth_users WHERE cohort_tag = 'u_106'),
    'Magway Shelter Animal Welfare & Feeding #24 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.159067, 94.941496,
    false, '2027-12-07 11:45:20+0630'::timestamptz, '2027-12-07 15:45:20+0630'::timestamptz, '2027-12-05 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #24 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_24', id, 'Magway', 'published', 'u_106', 'u_106'
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #24 [SYNTHETIC]'
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
    'Magway Youth Education & Tutoring #25 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Weekend basic English, mathematics, and reading assistance for primary school children.', 'charity_event',
    'Magway Chauk Solar Resource Center', 'Near Chauk Bridge', 20.152138, 94.944306,
    false, '2027-04-23 13:45:20+0630'::timestamptz, '2027-04-23 17:45:20+0630'::timestamptz, '2027-04-21 13:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Youth Education & Tutoring #25 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_25', id, 'Magway', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Youth Education & Tutoring #25 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_25', id, '2024-09-02 08:45:20+0630'::timestamptz, '2024-09-02 12:45:20+0630'::timestamptz, '2024-08-31 08:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Youth Education & Tutoring #25 [SYNTHETIC]'
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
    'Magway Community Food Distribution #26 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Magway Riverside Outreach Station', 'Near Mya Tha Lun Pagoda', 20.159089, 94.945566,
    false, '2027-04-24 12:45:20+0630'::timestamptz, '2027-04-24 16:45:20+0630'::timestamptz, '2027-04-22 12:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #26 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_26', id, 'Magway', 'completed', 'u_405', 'u_405'
FROM events WHERE title = 'Magway Community Food Distribution #26 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_26', id, '2024-08-01 04:45:20+0630'::timestamptz, '2024-08-01 08:45:20+0630'::timestamptz, '2024-07-30 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Community Food Distribution #26 [SYNTHETIC]'
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
    'Magway Public Health Awareness Outreach #27 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Pakokku Community Center', 'Near Pakokku River Port', 20.15472, 94.939656,
    false, '2027-04-25 13:45:20+0630'::timestamptz, '2027-04-25 17:45:20+0630'::timestamptz, '2027-04-23 13:45:20+0630'::timestamptz,
    'draft', 'manual', true, true,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #27 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_27', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #27 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_27', id, '2024-06-30 04:45:20+0630'::timestamptz, '2024-06-30 08:45:20+0630'::timestamptz, '2024-06-28 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Public Health Awareness Outreach #27 [SYNTHETIC]'
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
    'Magway Public Health Awareness Outreach #28 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Distributing water purification supplies, hygiene kits, and health guidelines.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.151446, 94.944103,
    false, '2027-04-26 12:45:20+0630'::timestamptz, '2027-04-26 16:45:20+0630'::timestamptz, '2027-04-24 12:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, false, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Public Health Awareness Outreach #28 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_28', id, 'Magway', 'cancelled', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Public Health Awareness Outreach #28 [SYNTHETIC]'
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
    'Magway Shelter Animal Welfare & Feeding #29 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Assisting community dog and cat shelters with cleaning, feeding, and care.', 'charity_event',
    'Magway Yenangyaung Youth Hall', 'Near College Road', 20.157139, 94.948734,
    false, '2027-04-27 11:45:20+0630'::timestamptz, '2027-04-27 15:45:20+0630'::timestamptz, '2027-04-25 11:45:20+0630'::timestamptz,
    'draft', 'auto', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #29 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_29', id, 'Magway', 'completed', 'u_101', 'u_101'
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #29 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_29', id, '2024-04-27 04:45:20+0630'::timestamptz, '2024-04-27 08:45:20+0630'::timestamptz, '2024-04-25 04:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Shelter Animal Welfare & Feeding #29 [SYNTHETIC]'
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
    'Magway Community Food Distribution #30 [SYNTHETIC]', 'Synthetic scenario for AI testing; not a real event. Food relief package sorting, packing, and distribution to local households in need.', 'charity_event',
    'Magway Minbu Civic Relief Center', 'Near Nagapusat Mud Volcano', 20.159837, 94.942801,
    false, '2027-04-28 11:45:20+0630'::timestamptz, '2027-04-28 15:45:20+0630'::timestamptz, '2027-04-26 11:45:20+0630'::timestamptz,
    'draft', 'manual', true, false,
    false, true, 'unpaid',
    'Please arrive 15 minutes before shift start. Coordinate directly with your team coordinator.', true
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Magway Community Food Distribution #30 [SYNTHETIC]');

INSERT INTO temp_synth_events (cohort_key, event_id, cluster, lifecycle, owner_tag, coord_tag)
SELECT 'ev_magway_30', id, 'Magway', 'completed', 'u_202', 'u_202'
FROM events WHERE title = 'Magway Community Food Distribution #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;

INSERT INTO temp_hist_event_dates (cohort_key, event_id, hist_start, hist_end, hist_deadline)
SELECT 'ev_magway_30', id, '2024-03-26 07:45:20+0630'::timestamptz, '2024-03-26 11:45:20+0630'::timestamptz, '2024-03-24 07:45:20+0630'::timestamptz
FROM events WHERE title = 'Magway Community Food Distribution #30 [SYNTHETIC]'
ON CONFLICT (cohort_key) DO UPDATE SET event_id = EXCLUDED.event_id;


-- 2. Link Event Charity Fields
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_yangon_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_01'
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
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_08'
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
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_mandalay_30'
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
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_12'
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
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_pyay_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_03'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_04'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_bago_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_06'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_07'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_bago_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_15'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_bago_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_16'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_17'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_19'
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
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_bago_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_bago_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_26'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'elderly_care' FROM temp_synth_events WHERE cohort_key = 'ev_bago_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cooking' FROM temp_synth_events WHERE cohort_key = 'ev_bago_27'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_bago_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_bago_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_bago_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_01'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_02'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_02'
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
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_05'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_06'
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
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_08'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_09'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_10'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_magway_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_11'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_12'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_13'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_14'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_15'
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
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_18'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_19'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'blood_donation' FROM temp_synth_events WHERE cohort_key = 'ev_magway_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_20'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_magway_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_21'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_22'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'environment' FROM temp_synth_events WHERE cohort_key = 'ev_magway_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_23'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_24'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'teaching' FROM temp_synth_events WHERE cohort_key = 'ev_magway_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'child_care' FROM temp_synth_events WHERE cohort_key = 'ev_magway_25'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_26'
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
SELECT event_id, 'disaster_support' FROM temp_synth_events WHERE cohort_key = 'ev_magway_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_28'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'animal_welfare' FROM temp_synth_events WHERE cohort_key = 'ev_magway_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'cleaning' FROM temp_synth_events WHERE cohort_key = 'ev_magway_29'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'food_distribution' FROM temp_synth_events WHERE cohort_key = 'ev_magway_30'
ON CONFLICT (event_id, field_code) DO NOTHING;
INSERT INTO event_charity_fields (event_id, field_code)
SELECT event_id, 'logistics' FROM temp_synth_events WHERE cohort_key = 'ev_magway_30'
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
