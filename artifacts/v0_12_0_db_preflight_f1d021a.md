# Database Preflight Inspection & Baseline Report

- **Execution Timestamp:** 2026-11-21
- **Git HEAD:** `f1d021a4f7449b8254b59efabdf75d933963bc14` (`feature/ai-chat-cache-ml-insights`)
- **Target Database:** `volunteer_coordination_db` on `127.0.0.1:5432`
- **Database User:** `postgres`
- **Transaction Mode:** `READ ONLY` (Strictly zero DDL/DML)

## 1. PostgreSQL Engine & Connection Identity
- **Current Database:** `volunteer_coordination_db`
- **Connected User:** `postgres`
- **Server Version:** `18.6` (num: 180006)
- **Transaction Read-Only:** `on`
- **Search Path:** `"$user", public`
- **Replica Status:** `False`

## 2. Core Extension & Function Resolution
- **`uuidv7()` Resolution:** `uuidv7()`
- **Public Base Tables Count:** `31` (Reference snapshot: 31)

## 3. Required Relation Inventory
- Table `public.users`: `FOUND` (`users`)
- Table `public.auth_otp`: `FOUND` (`auth_otp`)
- Table `public.auth_otp_challenge`: `FOUND` (`auth_otp_challenge`)
- Table `public.user_verification_images`: `FOUND` (`user_verification_images`)
- Table `public.attendance`: `FOUND` (`attendance`)
- Table `public.assignments`: `FOUND` (`assignments`)
- Table `public.events`: `FOUND` (`events`)
- Table `public.event_applications`: `FOUND` (`event_applications`)
- Table `public.event_posts`: `FOUND` (`event_posts`)

## 4. Required Stored Procedures
- Function `create_otp_challenge(bigint,text,integer,text,text,text)`: `FOUND`
- Function `verify_otp_challenge(text,text,text)`: `FOUND`
- Function `purge_expired_otp_challenges(interval)`: `FOUND`
- Function `purge_expired_otps()`: `FOUND`
- Function `request_otp(text,text,text)`: `FOUND`
- Function `release_expired_blocks()`: `FOUND`

## 5. Required Triggers
- Trigger `trg_01_otp_rate_limit` on `auth_otp`: `ACTIVE`
- Trigger `trg_01_auth_otp_challenge_guard` on `auth_otp_challenge`: `ACTIVE`
- Trigger `trg_01_attendance_guard` on `attendance`: `ACTIVE`

## 6. Required Coordinator Views
- View `v_event_summary`: `FOUND`
- View `v_event_checkin_board`: `FOUND`
- View `v_pending_confirmations`: `FOUND`
- View `v_geo_attempts_review`: `FOUND`
- View `v_event_post_capacity`: `FOUND`
- View `v_accepted_unassigned`: `FOUND`

## 7. Data Integrity Anomaly Counts (Zero PII)
- Orphaned Challenges (otp_id missing): `0`
- Challenges exceeding parent OTP expires_at: `0`
- Challenge/OTP purpose mismatches: `0`
- User verification image rows with empty image_path: `0`

## 8. Verification Media Storage Inventory (Zero PII)
- `VERIFICATION_MEDIA_ROOT` exists: `True`
- Isolated from public MEDIA_ROOT: `True`
- Total Files on Disk: `116`
- Total Bytes on Disk: `557611`
- Largest File Size: `113491` bytes

## 9. Preflight Gate Decision
- **Gate Decision:** `PASS`
- **Branch:** `Branch A — PASS`
- **Statement:** No database object or data was created, modified, or dropped during this inspection. Schema is 100% frozen.