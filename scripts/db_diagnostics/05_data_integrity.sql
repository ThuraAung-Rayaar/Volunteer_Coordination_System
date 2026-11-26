-- 05_data_integrity.sql
-- Strictly READ-ONLY data integrity invariants and table counts
-- ZERO PII: No phone numbers, no names, no hashes, no private tokens, no notes

-- Exact row counts per public table
SELECT
    table_name,
    (xpath('/row/cnt/text()', xml_count))[1]::text::int AS row_count
FROM (
    SELECT table_name,
           query_to_xml(format('SELECT count(*) AS cnt FROM %I', table_name), false, true, '') AS xml_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) t
ORDER BY table_name;

-- Users status distribution
SELECT account_status, is_active, is_admin, is_superuser, count(*) AS user_count
FROM users
GROUP BY account_status, is_active, is_admin, is_superuser
ORDER BY count(*) DESC;

-- Coordinator profiles status distribution
SELECT status, count(*) AS profile_count
FROM coordinator_profiles
GROUP BY status
ORDER BY count(*) DESC;

-- Events status distribution
SELECT status, count(*) AS event_count
FROM events
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY count(*) DESC;

-- Event posts status distribution
SELECT status, count(*) AS post_count
FROM event_posts
GROUP BY status
ORDER BY count(*) DESC;

-- Applications status distribution
SELECT status, count(*) AS application_count
FROM event_applications
GROUP BY status
ORDER BY count(*) DESC;

-- Assignments status distribution
SELECT status, count(*) AS assignment_count
FROM assignments
GROUP BY status
ORDER BY count(*) DESC;

-- Attendance status distribution
SELECT status, count(*) AS attendance_count
FROM attendance
GROUP BY status
ORDER BY count(*) DESC;

-- Invariant 1: Duplicate users (UUID check)
SELECT count(*) AS dup_uuid_count
FROM (SELECT id FROM users GROUP BY id HAVING count(*) > 1) s;

-- Invariant 2: Orphaned coordinator profiles
SELECT count(*) AS orphaned_coordinators
FROM coordinator_profiles cp
LEFT JOIN users u ON cp.user_id = u.id
WHERE u.id IS NULL;

-- Invariant 3: Orphaned event posts
SELECT count(*) AS orphaned_event_posts
FROM event_posts ep
LEFT JOIN events e ON ep.event_id = e.id
WHERE e.id IS NULL;

-- Invariant 4: Orphaned applications
SELECT count(*) AS orphaned_applications
FROM event_applications ea
LEFT JOIN users u ON ea.user_id = u.id
LEFT JOIN events e ON ea.event_id = e.id
WHERE u.id IS NULL OR e.id IS NULL;

-- Invariant 5: Orphaned assignments
SELECT count(*) AS orphaned_assignments
FROM assignments a
LEFT JOIN events e ON a.event_id = e.id
LEFT JOIN users u ON a.user_id = u.id
LEFT JOIN event_posts ep ON a.post_id = ep.id
WHERE e.id IS NULL OR u.id IS NULL OR ep.id IS NULL;

-- Invariant 6: Orphaned attendance
SELECT count(*) AS orphaned_attendance
FROM attendance att
LEFT JOIN assignments a ON att.assignment_id = a.id
WHERE a.id IS NULL;
