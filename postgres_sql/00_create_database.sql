-- =============================================================================
-- Volunteer Coordination System — Local Database Creation Script
-- File: postgres_sql/00_create_database.sql
--
-- Purpose:
--   Creates the local PostgreSQL database on localhost if it does not exist.
--   Run connected to the maintenance 'postgres' database as a PostgreSQL user
--   with CREATEDB / superuser privileges:
--     psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -f postgres_sql/00_create_database.sql
--
-- Next steps (automated end-to-end by scripts/setup_local_db.py):
--   1. Apply schema DDL:        postgres_sql/VCS_db.sql
--   2. Apply Django tables:     python backend/manage.py migrate --noinput
--   3. Apply seedling data:     postgres_sql/seedlings/01_yangon_demo_seed.sql
-- =============================================================================

SELECT 'CREATE DATABASE volunteer_coordination_db WITH ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'volunteer_coordination_db'
)\gexec
