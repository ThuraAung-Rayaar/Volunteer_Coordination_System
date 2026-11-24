# 10 — Disposable Database Bootstrap Comparison Report (Phase D)

- **Execution Timestamp:** 2026-11-24
- **Disposable Database Name:** `vcs_schema_bootstrap_audit_20261124`
- **Canonical DDL File:** `postgres_sql/VCS_db.sql`
- **Engine:** PostgreSQL 18.6 on `127.0.0.1:5432`
- **Bootstrap Status:** **SUCCESS (Zero Syntax Errors, Clean Transaction Commit)**
- **Cleanup Status:** **DISPOSABLE DATABASE DROPPED (Real DB Untouched)**

## 1. Catalog Object Comparison

| Object Category | Live DB (`volunteer_coordination_db`) | Bootstrap DB (`VCS_db.sql`) | Difference Analysis |
|---|:---:|:---:|---|
| **Base Tables** | 31 | 23 | Live has 8 Django framework tables (`django_*`, `auth_*`, `authtoken_*`). Domain tables: 23 in both. |
| **Views** | 11 | 11 | Exactly 11 views in both catalogs. |
| **Constraints** | 438 | 389 | Live has 438 (includes Django FKs/PKs); Bootstrap has 389 domain constraints. |
| **Triggers** | 53 | 53 | Exactly 53 domain triggers in both catalogs. |
| **Functions** | 275 | 275 | Domain functions match identically. |

## 2. Table Reconciliation
- **Tables Only in Live:** `['auth_group', 'auth_group_permissions', 'auth_permission', 'authtoken_token', 'django_admin_log', 'django_content_type', 'django_migrations', 'django_session']`
- **Tables Only in Bootstrap:** `[]`
- **Unexplained Drift Tables:** `[]` (**ZERO DRIFT**)

## 3. View Reconciliation
- **Views Only in Live:** `[]` (None)
- **Views Only in Bootstrap:** `[]` (None)
- **All 11 Domain Views Reconciled:**
  `v_accepted_unassigned`, `v_admin_dashboard`, `v_event_checkin_board`, `v_event_checkin_status`, `v_event_coordinator_history`, `v_event_post_capacity`, `v_event_summary`, `v_geo_attempts_review`, `v_pending_confirmations`, `v_public_events`, `v_user_moderation_summary`

## 4. Verdict on Canonical Bootstrap `VCS_db.sql`
1. **Syntax Integrity:** `VCS_db.sql` executes and commits cleanly in PostgreSQL 18.6 without any regex or parser workarounds.
2. **Domain Coverage:** All 23 domain tables, 11 views, trigger functions, stored procedures (`create_otp_challenge`, `assign_one_application`, `tags_are_normalized`), and constraints are 100% reproduced.
3. **Framework Separation:** The only difference between live and bootstrap is the 8 Django framework-managed tables created during Django initialization.
4. **Gate DB-02 Decision:** **PASS** (Canonical SQL parses and installs on a disposable clone).
