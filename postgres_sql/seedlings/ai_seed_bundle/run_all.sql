-- =============================================================================
-- run_all.sql
-- Master Transactional Orchestrator for Synthetic Seed Bundle
--
-- Usage:
--   psql -h 127.0.0.1 -p 5432 -U postgres -d volunteer_coordination_db -f postgres_sql/seedlings/ai_seed_bundle/run_all.sql
--   (or -d ai_seed_volunteer_coordination_db if using disposable clone)
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

\echo '>>> Phase 0: Executing preflight checks...'
\i postgres_sql/seedlings/ai_seed_bundle/00_preflight.sql

\echo '>>> Phase 1: Inserting 500 synthetic users in 5 batches...'
\i postgres_sql/seedlings/ai_seed_bundle/01_users/users_001_100.sql
\i postgres_sql/seedlings/ai_seed_bundle/01_users/users_101_200.sql
\i postgres_sql/seedlings/ai_seed_bundle/01_users/users_201_300.sql
\i postgres_sql/seedlings/ai_seed_bundle/01_users/users_301_400.sql
\i postgres_sql/seedlings/ai_seed_bundle/01_users/users_401_500.sql

\echo '>>> Phase 2: Configuring coordinator profiles (20 pending, 30 approved)...'
\i postgres_sql/seedlings/ai_seed_bundle/02_coordinator_profiles.sql

\echo '>>> Phase 3: Inserting user charity interests and availability rules...'
\i postgres_sql/seedlings/ai_seed_bundle/03_user_interests_and_availability.sql

\echo '>>> Phase 4: Staging event metadata...'
\i postgres_sql/seedlings/ai_seed_bundle/04_event_metadata.sql

\echo '>>> Phase 5: Creating 150 events and posts across 5 city clusters...'
\i postgres_sql/seedlings/ai_seed_bundle/05_events_and_posts.sql

\echo '>>> Phase 6: Submitting applications and creating assignments...'
\i postgres_sql/seedlings/ai_seed_bundle/06_applications_and_assignments.sql

\echo '>>> Phase 7: Processing onboarding, attendance, and lifecycle completions...'
\i postgres_sql/seedlings/ai_seed_bundle/07_attendance_and_onboarding.sql

\echo '>>> Phase 8: Recording feedback and coordinator changes...'
\i postgres_sql/seedlings/ai_seed_bundle/08_feedback_and_coordinator_changes.sql

\echo '>>> Phase 9: Running validation report...'
\i postgres_sql/seedlings/ai_seed_bundle/09_validation_report.sql

COMMIT;

\echo '>>> Seeding completed and committed successfully!'
