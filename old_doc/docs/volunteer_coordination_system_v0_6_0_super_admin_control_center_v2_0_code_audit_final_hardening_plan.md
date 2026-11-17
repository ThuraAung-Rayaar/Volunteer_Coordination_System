# Volunteer Coordination System v0.6.0 — Super Admin Control Center v2.0 Code Audit & Final Hardening Plan

## 1. Executive Code Review Summary

**Overall Assessment:** **Good / High Quality (92% Production-Ready)**  
All 6 tasks (`UI-TASK-01` through `UI-TASK-06`) were implemented cleanly by Antigravity, all **30 Phase 8 tests (and 90 Audit tests)** pass, `python manage.py check` and `spectacular --fail-on-warn` pass with 0 warnings, and zero `.sql` files were modified.

However, a line-by-line inspection of `new_admin_panel_code_changes.txt` revealed **6 subtle bugs, security edge cases, and OpenAPI schema leaks** that should be fixed before final sign-off.

---

## 2. Identified Bugs & Edge Cases in the Current Code

### Bug 1 (Security / Auth Bypass Risk): Hardcoded `"AdminDemo123!"` Fallback in `admin_login_view` & Missing Default Password on Provisioning
* **Where:** `backend/admin_portal/views.py` (lines 142–154) and `user_create.html` (line 97).
* **The Issue:**
  1. In `user_create.html`, the password field placeholder says `"Optional (Default: AdminDemo123!)"`, but in `user_provision_view` (lines 684–686), if `password` is left blank, `new_user.set_password()` is **never called**, leaving `user.password` blank (`""`).
  2. Even worse, in `admin_login_view` (lines 148–151), any admin whose `user.password` does not start with `pbkdf2_`/`argon2`/`bcrypt` can be logged into using `"AdminDemo123!"`. If a `Staff Admin` is provisioned without typing a password, or if an account has `set_unusable_password()` (which starts with `"!"`), anyone who types `"AdminDemo123!"` can log into their account!
* **The Fix:**
  * In `user_provision_view`, if `not password`, default to `"AdminDemo123!"` and always call `new_user.set_password(password_to_set)` so every provisioned user has a valid PBKDF2 password hash stored.
  * In `admin_login_view`, only allow the `"AdminDemo123!"` bootstrap upgrade when `raw_user_pw` is a non-empty SQL-seeded placeholder that does **not** start with `"!"` (Django's unusable password prefix) or standard hash prefixes.

### Bug 2 (Data Integrity / Trigger Safety): `ALTER TABLE users DISABLE TRIGGER` vs. `SET LOCAL session_replication_role`
* **Where:** `backend/admin_portal/views.py` (`admin_settings_view`, lines 985–995).
* **The Issue:**
  To update `phone_hash` on the `users` table (which `trg_01_users_guard` normally blocks with `phone_hash cannot be changed`), the code runs:
  ```python
  cursor.execute("ALTER TABLE users DISABLE TRIGGER trg_01_users_guard")
  ```
  In PostgreSQL, `ALTER TABLE ... DISABLE TRIGGER` acquires an **`ACCESS EXCLUSIVE` lock** on the entire `users` table and disables the trigger globally across concurrent connections until `ENABLE TRIGGER` runs. Furthermore, if the database user is not the table owner in production, `ALTER TABLE` can fail or cause lock contention.
* **The Fix:**
  Keep the `try / finally` block inside `transaction.atomic()`, or ensure `LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE` / safe trigger restoration so it never leaves the trigger disabled even if a database error occurs (note: in PostgreSQL, `ALTER TABLE` is transactional, so if an exception is raised inside `finally` or before commit, it rolls back cleanly, which is good—but we should also verify `new_phone` format and uniqueness *before* touching the trigger, which the current code does, and ensure `target_user.refresh_from_db()` is called).

### Bug 3 (Privilege Escalation / Self-Target Guard): Standard Admin Resetting Super Admin's Password or Phone, or Self-Approving Coordinator
* **Where:** `backend/admin_portal/views.py` (`admin_settings_view` lines 935–1004, `user_provision_view` lines 710–736).
* **The Issue:**
  1. In `admin_settings_view`, a regular **Staff Admin (`is_superuser=False`)** can select a **Super Admin (`is_superuser=True`)** in the `"Reset User Password"` or `"Change User Phone Number"` dropdown and overwrite the Super Admin's password or phone number!
  2. In `user_provision_view` (`promote_coordinator`), if the Super Admin selects **their own account** (`target_user.id == request.user.id`), `CoordinatorProfiles.objects.filter(user_id=target_user.id).update(status="approved", approved_by_id=request.user.id)` will crash with PostgreSQL `IntegrityError` because of the database constraint `ck_coordinator_no_self_approval` (`approved_by_id <> user_id`)!
* **The Fix:**
  * In `admin_settings_view`, forbid a non-superuser (`not request.user.is_superuser`) from resetting the password or changing the phone number of any `is_superuser=True` account (raise `ResourceMaskedNotFound()` or display a clear error).
  * In `user_provision_view`, exclude `request.user.id` from `eligible_volunteers` and check `if target_user.id == request.user.id:` before promoting.

### Bug 4 (DateTime Timezone Bug): Naive `expires_at` String Passed to `moderation_service` in `users_directory_view`
* **Where:** `backend/admin_portal/views.py` (`users_directory_view`, lines 555–565).
* **The Issue:**
  When an admin submits the **"Temporary Account Block"** form in `users.html` with a `<input type="datetime-local" name="expires_at">`, the browser sends a string like `"2026-11-10T14:30"` (or `""` if left blank).
  `users_directory_view` passes that raw string (`expires_at=""` or `"2026-11-10T14:30"`) directly into `moderation_service.record_moderation_action(..., expires_at=expires_at)`.
  * If `expires_at == ""`, Django/PostgreSQL raises `ValidationError: ['“” value has an invalid format. It must be in YYYY-MM-DD HH:MM[:ss[.uuuuuu]][TZ] format.']`!
  * If `expires_at == "2026-11-10T14:30"`, it is a naive datetime string and triggers a timezone warning or error.
* **The Fix:**
  Parse `expires_at` using `parse_datetime(expires_at)` and `timezone.make_aware()` if non-empty, or set `expires_at = None` if empty!

### Bug 5 (UX / Map Crash Bug): `events_detail.html` Map Does Not Fly To Selected Event & Null Coordinates Handling
* **Where:** `backend/admin_portal/templates/admin_portal/events_detail.html` (lines 319–395) and `views.py` (`_build_geo_map_json`, lines 346–350).
* **The Issue:**
  1. In `_build_geo_map_json()`, `events_qs` defaults to `status__in=["published", "active"]`. If the admin clicks **Inspect** on a `draft`, `completed`, or `cancelled` event in `/api/v1/admin/ui/events/?event_id=<id>`, that `selected_event` is **not** included in `geo_map_json`, and the map does not center/zoom onto the selected event!
  2. In `dashboard_view` (line 289), `feedback_overview` calculates `avg_score` across **all** feedback (`[f.score for f in all_feedback if f.score is not None]`), including `hidden` (moderated/abusive) reviews, whereas `feedback_intelligence_view` (line 840) calculates `avg_score` across only `active` reviews (`f.status == "active"`). Thus, the average rating on the Dashboard tab and the Feedback tab can disagree!
* **The Fix:**
  * In `dashboard_view`, filter `active_scores` and `d_scores` by `f.status == "active"` so hidden/abusive reviews do not skew the Dashboard rating (matching the Feedback tab).
  * In `events_detail_and_geo_view`, pass `selected_event` into `_build_geo_map_json` (or fly the Leaflet map directly to `selected_event`'s coordinates when `?event_id=` is active).

### Bug 6 (OpenAPI Schema Hygiene): HTML Template Views Leaking into `schema.yml`
* **Where:** `backend/admin_portal/views.py` and `schema.yml`.
* **The Issue:**
  Notice that `admin_settings_view` has `@extend_schema(exclude=True)`, so `/api/v1/admin/ui/settings/` was cleanly excluded from `schema.yml`. However, the other HTML template views (`admin_login_view`, `admin_logout_view`, `admin_phone_hash_lookup_api`, `dashboard_view`, `event_create_tab_view`, `events_detail_and_geo_view`, `geo_monitoring_view`, `users_directory_view`, `user_provision_view`, `coordinator_board_view`, `feedback_intelligence_view`) do **not** have `@extend_schema(exclude=True)`, causing `/api/v1/admin/ui/*` HTML routes to appear in `schema.yml` with `EmptyResponse`.
* **The Fix:**
  Decorate all HTML UI template views (`admin_login_view`, `admin_logout_view`, `admin_phone_hash_lookup_api`, `dashboard_view`, `event_create_tab_view`, `events_detail_and_geo_view`, `geo_monitoring_view`, `users_directory_view`, `user_provision_view`, `coordinator_board_view`, `feedback_intelligence_view`) with `@extend_schema(exclude=True)` and regenerate `schema.yml`.

---

## 3. Copy-Paste Prompt for Antigravity Gemini Flash (`UI-TASK-07`)

Copy and paste the following prompt into Antigravity to fix all 6 issues and verify the entire test suite:

```text
You are working on Volunteer Coordination System v0.6.0 (Django + DRF + PostgreSQL).
TASK ID: UI-TASK-07 (Final Security, Edge-Case & Schema Hardening for Admin Control Center v2.0)

HARD CONSTRAINTS:
- Do NOT modify any .sql file or database migration.
- Keep all existing 30 tests in `backend/apps/audit/tests/test_api_admin_portal_phase8.py` passing and add regression tests for these fixes.

IMPLEMENT THE FOLLOWING 6 FIXES:

1. Fix Default Password & Bootstrap Login Hardening (`backend/admin_portal/views.py`):
   - In `user_provision_view` (`form_action == "provision_user"`):
     If `not password` (empty string or None), default to `"AdminDemo123!"` so every provisioned account gets a valid PBKDF2 password hash via `new_user.set_password(password_to_set)` and `new_user.save(update_fields=["password"])`.
   - In `admin_login_view`:
     Tighten the password check:
     ```python
     password_valid = False
     raw_user_pw = (user.password or "").strip()
     if raw_user_pw.startswith(("pbkdf2_", "argon2", "bcrypt")):
         password_valid = user.check_password(password)
     elif raw_user_pw and not raw_user_pw.startswith("!"):
         # Only allow AdminDemo123! bootstrap upgrade for non-empty SQL-seeded placeholder hashes
         if password == "AdminDemo123!":
             user.set_password("AdminDemo123!")
             user.save(update_fields=["password"])
             password_valid = True
     ```

2. Fix Naive/Empty `expires_at` Parsing in `users_directory_view` (`backend/admin_portal/views.py`):
   - In `users_directory_view` when `action == "moderation_action"`:
     `expires_at` from `<input type="datetime-local" name="expires_at">` may be `""` (empty string) or an ISO string `"YYYY-MM-DDTHH:MM"`.
     Parse it safely before calling `moderation_service.record_moderation_action`:
     ```python
     from django.utils.dateparse import parse_datetime
     parsed_expires_at = None
     if expires_at and str(expires_at).strip():
         dt = parse_datetime(str(expires_at).strip())
         if dt is None:
             raise DomainError(code="invalid_expires_at", message="Invalid expiry date/time format.", status_code=400)
         parsed_expires_at = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
     ```
     Pass `expires_at=parsed_expires_at` to `moderation_service.record_moderation_action(...)`.

3. Prevent Privilege Escalation & Self-ApprovalTrigger Crash (`backend/admin_portal/views.py`):
   - In `admin_settings_view` (`reset_user_password` and `change_user_phone`):
     If `target_user.is_superuser and not request.user.is_superuser`:
     raise `DomainError(code="insufficient_privilege", message="Only a Super Admin can modify a Super Admin account.", status_code=403)`.
   - In `user_provision_view`:
     * Exclude `request.user.id` from `eligible_volunteers` query (`exclude(id=request.user.id)`).
     * In `promote_coordinator`, if `target_user.id == request.user.id`:
       raise `DomainError(code="self_approval_forbidden", message="You cannot self-approve your own account as a coordinator (ck_coordinator_no_self_approval).", status_code=400)`.

4. Align Dashboard Feedback Average Score with Active Reviews (`backend/admin_portal/views.py`):
   - In `dashboard_view`:
     Ensure `active_scores`, `d_feedbacks`, and `star_counts` only count reviews where `f.status == "active"` so hidden/moderated reviews do not skew the Dashboard rating (matching `feedback_intelligence_view`).

5. Include `selected_event` on the Geo Map in `events_detail_and_geo_view` (`backend/admin_portal/views.py` & `events_detail.html`):
   - In `_build_geo_map_json(events_qs=None, attempts_qs=None, selected_event=None)`:
     If `selected_event` is provided and its ID is not already in `map_events_data`, append `selected_event` to `map_events_data` and include `"selected_event_lat"` and `"selected_event_lng"` in the returned JSON object.
   - In `events_detail.html` script:
     If `geoData.selected_event_lat` and `geoData.selected_event_lng` are present, call `map.setView([geoData.selected_event_lat, geoData.selected_event_lng], 15)` so inspecting an event automatically focuses the map on that event's geofence!

6. Exclude HTML UI Views from OpenAPI Schema (`backend/admin_portal/views.py` & `schema.yml`):
   - Add `@extend_schema(exclude=True)` above:
     `admin_login_view`, `admin_logout_view`, `admin_phone_hash_lookup_api`, `dashboard_view`, `event_create_tab_view`, `events_detail_and_geo_view`, `geo_monitoring_view`, `users_directory_view`, `user_provision_view`, `coordinator_board_view`, and `feedback_intelligence_view`.
   - Regenerate `schema.yml`.

7. Add Regression Tests in `backend/apps/audit/tests/test_api_admin_portal_phase8.py`:
   - `test_users_directory_block_with_empty_and_valid_expires_at`: verifies submitting `moderation_action` (`user_block`) from `/api/v1/admin/ui/users/` with `expires_at=""` and `expires_at="2026-12-31T23:59"` both succeed without datetime validation errors.
   - `test_standard_admin_cannot_reset_super_admin_password_or_phone`: verifies a standard admin (`is_superuser=False`) cannot reset the password or change the phone number of a `super_admin` in `/api/v1/admin/ui/settings/`.

VERIFY:
1. Run `python manage.py check`
2. Run `python manage.py spectacular --file ../schema.yml --fail-on-warn` (or update root `schema.yml`)
3. Run `python manage.py test apps.audit.tests --keepdb`
4. Confirm `git diff --name-only -- "*.sql"` is empty.
```