# 03 — Schema Fingerprint vs Frozen v0.12.0 Contract

## Catalog Summary
- **Base Tables Count:** `31` (Matches frozen contract snapshot `31`)
- **Views Count:** `11` (Matches frozen contract snapshot `11`)
- **Materialized Views:** `0`
- **Constraints Count:** `438`
- **Triggers Count:** `53`

## Base Tables (31)
`app_settings`, `assignments`, `attendance`, `attendance_geo_attempts`, `audit_logs`, `auth_group`, `auth_group_permissions`, `auth_otp`, `auth_otp_challenge`, `auth_permission`, `authtoken_token`, `charity_fields`, `coordinator_profiles`, `django_admin_log`, `django_content_type`, `django_migrations`, `django_session`, `event_applications`, `event_charity_fields`, `event_coordinator_history`, `event_posts`, `events`, `feedback`, `moderation_actions`, `onboarding_acknowledgments`, `qr_tokens`, `user_charity_interests`, `user_verification_images`, `users`, `volunteer_availability_exceptions`, `volunteer_availability_rules`.

## Views (11)
`v_accepted_unassigned`, `v_admin_dashboard`, `v_event_checkin_board`, `v_event_checkin_status`, `v_event_coordinator_history`, `v_event_post_capacity`, `v_event_summary`, `v_geo_attempts_review`, `v_pending_confirmations`, `v_public_events`, `v_user_moderation_summary`.

## Key Function Verification: `tags_are_normalized`
- Source file: Corrupted at line 72 with literal dot sequence.
- Live database: CLEAN definition confirmed:
  `SELECT COALESCE(cardinality(tags) <= 30, FALSE) AND NOT EXISTS (SELECT 1 FROM unnest(tags) AS t(tag) WHERE ...)`

## Schema Drift Verdict
**ZERO DRIFT**. Live database matches `docs/full_database_details.md` and `v0_12_0_db_preflight_99db25a.md` exactly.
