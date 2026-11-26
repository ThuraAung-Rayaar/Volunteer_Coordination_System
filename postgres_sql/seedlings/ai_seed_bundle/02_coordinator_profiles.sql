-- =============================================================================
-- 02_coordinator_profiles.sql
-- Creates 20 pending coordinator applicants and 30 approved coordinators
-- =============================================================================

-- Step 1: Insert all 50 synthetic coordinators as 'pending' (per trg_coordinator_guard)
INSERT INTO coordinator_profiles (user_id, status, notes)
SELECT u.user_id, 'pending', 'Synthetic coordinator application [SYNTHETIC]'
FROM temp_synth_users u
WHERE u.role_type IN ('coordinator_pending', 'coordinator_approved')
ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Transition the 30 approved coordinators from pending -> approved
-- Using one of the existing active admins as approver
UPDATE coordinator_profiles cp
SET status = 'approved',
    approved_by_id = (SELECT id FROM users WHERE is_admin AND is_active ORDER BY id LIMIT 1),
    approved_at = now(),
    notes = 'Synthetic approved coordinator profile [SYNTHETIC]'
FROM temp_synth_users u
WHERE cp.user_id = u.user_id
  AND u.role_type = 'coordinator_approved'
  AND cp.status = 'pending';
