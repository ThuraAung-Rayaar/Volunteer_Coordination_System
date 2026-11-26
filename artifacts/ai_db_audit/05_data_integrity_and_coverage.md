# 05 — Data Integrity and Coverage

## Table Row Counts (Redacted Aggregates)

| Table | Live Count | Snapshot Baseline | Status |
|---|---|---|---|
| `users` | 742 | 233 | Representative Live Data |
| `coordinator_profiles` | 122 | 68 | Representative Live Data |
| `events` | 189 | 35 | Representative Live Data |
| `event_posts` | 475 | 40 | Representative Live Data |
| `event_applications` | 1,078 | 60 | Representative Live Data |
| `assignments` | 1,075 | 58 | Representative Live Data |
| `attendance` | 1,075 | 58 | Representative Live Data |
| `user_charity_interests` | 1,583 | 80 | Representative Live Data |
| `volunteer_availability_rules` | 1,367 | 245 | Representative Live Data |
| `volunteer_availability_exceptions` | 298 | 0 | Representative Live Data |
| `audit_logs` | 10,795 | 1,356 | Append-Only Intact |

## Status Distributions (Zero PII)
- **Users:** `active`: 740, `blocked`: 2
- **Coordinator Profiles:** `approved`: 99, `pending`: 23
- **Events (active/non-deleted):** `completed`: 114, `published`: 33, `cancelled`: 16, `active`: 12, `draft`: 9
- **Event Posts:** `open`: 475
- **Event Applications:** `accepted`: 1,073, `expired`: 3, `withdrawn`: 2
- **Assignments:** `completed`: 681, `assigned`: 283, `cancelled`: 110, `confirmed`: 1
- **Attendance:** `completed`: 504, `expected`: 230, `absent`: 178, `cancelled`: 109, `checked_in`: 54

## Invariant Verification Table

| Invariant ID | Description | Query / Command | Count | Threshold | Verdict |
|---|---|---|---|---|:---:|
| INV-01 | Duplicate User UUIDs | `SELECT count(*) FROM (SELECT id FROM users GROUP BY id HAVING count(*) > 1)` | 0 | 0 | **PASS** |
| INV-02 | Orphaned Coordinator Profiles | `SELECT count(*) FROM coordinator_profiles cp LEFT JOIN users u ... WHERE u.id IS NULL` | 0 | 0 | **PASS** |
| INV-03 | Orphaned Event Posts | `SELECT count(*) FROM event_posts ep LEFT JOIN events e ... WHERE e.id IS NULL` | 0 | 0 | **PASS** |
| INV-04 | Orphaned Applications | `SELECT count(*) FROM event_applications ea LEFT JOIN users/events ...` | 0 | 0 | **PASS** |
| INV-05 | Orphaned Assignments | `SELECT count(*) FROM assignments a LEFT JOIN events/users/event_posts ...` | 0 | 0 | **PASS** |
| INV-06 | Orphaned Attendance | `SELECT count(*) FROM attendance att LEFT JOIN assignments a ... WHERE a.id IS NULL` | 0 | 0 | **PASS** |
| INV-07 | Challenge/OTP Expiry Invariant | Preflight check 7 | 0 | 0 | **PASS** |
| INV-08 | Empty Image Path in Verification | Preflight check 7 | 0 | 0 | **PASS** |
