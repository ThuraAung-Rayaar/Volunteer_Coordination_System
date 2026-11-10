# Volunteer Coordination System v0.6.0 — Live Demo & Swagger API Testing Playbook

## 1. Readiness Verdict: **100% READY FOR DEMO & API TESTING**

Based on the final codebase state (`TASK-01` through `TASK-07` completed) and your live database diagnostic (`42 Users`, `10 Events`, `20 Posts`, `25 Applications`, `23 Assignments`, `23 Attendance`, `8 Feedback`, `42 DRF Tokens`):

| Component | Status | Verification Evidence |
| :--- | :--- | :--- |
| **PostgreSQL Database & Views** | ✅ **READY** | All 22 tables, triggers, functions, and 11 operational views (`v_admin_dashboard`, `v_event_summary`, `v_geo_attempts_review`, etc.) are populated and synchronized (`40 active users`, `5 approved coordinators`, `10 events`). |
| **Admin Portal HTML UI** | ✅ **READY** | `SessionAuthentication` is enabled in `base.py`; `_guard_admin_html` redirects unauthenticated browsers to `/admin/login/?next=...`; all 3 UI pages (`dashboard.html`, `geo_monitoring.html`, `coordinator_board.html`) render live DB metrics and include the Super Admin Event Creation form and role/logout header badge. |
| **Swagger / OpenAPI (`/api/docs/`)** | ✅ **READY** | Mounted in `config/urls.py`; `python manage.py spectacular --validate` passes with **0 errors and 0 warnings**; supports both `cookieAuth` (browser session) and `tokenAuth` (`Token <key>`). |
| **New Business Rules** | ✅ **READY** | 1. **Super Admin Event Creation:** Active on `POST /api/v1/admin/events/` and the Dashboard UI form.<br>2. **Anonymous Aggregate-Only Feedback:** Enforced in `feedback_service.py` (`get_user_feedback_summary`, `get_event_feedback`, `list_feedback_for_user`). |
| **Automated Test Suite** | ✅ **READY** | **628 / 628 tests passing** (`0` `.sql` changes). |

---

## 2. Instant Demo Credentials Cheat-Sheet (Live in Database)

Your database seeded via `seed_data.sql` already has active PBKDF2 password hashes and pre-generated DRF tokens. You can immediately copy and paste these exact values:

| Role | Display Name | Browser Login Username (`phone_hash`) | Password | Swagger `tokenAuth` Header |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | System Super Admin | `c9e4cda2b1a976e3b714fb26055c158b27a83b67f161f625945b0bc6a417d537` | `AdminDemo123!` | `Token a000000000000000000000000000000000000001` |
| **Staff Admin** | Operations Admin | `d770aa2d2309c320c8e1ed236ccb8ace4c3ccbad359c7c197a0c25f4a246d356` | `AdminDemo123!` | `Token a000000000000000000000000000000000000002` |
| **Approved Coordinator** | Senior Coordinator One | `fece8db10a9459a641486aa42eb977aa6648c946560a68c02952be76e84f18c8` | — | `Token c000000000000000000000000000000000000011` |
| **Verified Volunteer** | Volunteer 04 (Kyaw Zin Oo) | `785b0e34745db38cd31147fe1d6ba221b46291658eec2d5c0d2b2ce4b0368a6a` | — | `Token v000000000000000000000000000000000000024` |

*(Optional helper: If you ever need to inspect or re-verify these in the terminal, run `python manage.py shell -c "from apps.accounts.models import Users; from rest_framework.authtoken.models import Token; [print(u.display_name, Token.objects.get(user=u).key) for u in Users.objects.filter(is_admin=True)]"`).*

---

## 3. Step-by-Step Plan: Running the Server & Admin Panel Browser Demo

### Step 3.1 — Start the Django Server
In your terminal (inside `backend/` with `.venv` activated):
```bash
python manage.py runserver 0.0.0.0:8000
```

### Step 3.2 — Demonstrate Admin Security Gate & Browser Login
1. Open your browser and visit:
   `http://127.0.0.1:8000/api/v1/admin/ui/dashboard/`
2. **What happens:** Because you are not logged in yet, `_guard_admin_html` automatically redirects your browser to:
   `http://127.0.0.1:8000/admin/login/?next=/api/v1/admin/ui/dashboard/`
3. **Log in as Super Admin:**
   * **Phone hash (Username):** `c9e4cda2b1a976e3b714fb26055c158b27a83b67f161f625945b0bc6a417d537`
   * **Password:** `AdminDemo123!`
4. Click **Log in**. You will land directly on the **Admin Control Center & Governance Portal**.

### Step 3.3 — Tour the 3 Live Admin Portal Pages
1. **Main Dashboard (`http://127.0.0.1:8000/api/v1/admin/ui/dashboard/`):**
   * **Top Right Header:** Shows the amber **`Super Admin`** badge, the admin's display name, and the **`Logout`** button.
   * **Core Operational Metrics (Live from `v_admin_dashboard`):**
     * **Active Events:** `1`
     * **Active Volunteers:** `40`
     * **Pending Verifications:** `5`
     * **Pending Coordinators:** `3`
     * **Pending Geo Reviews:** `1` (or `2` depending on review status)
   * **Super Admin Exclusive — Create New Event Form:**
     * Fill in:
       * **Event Title:** `Yangon Flood Emergency Supply Drive`
       * **Assigned Event Owner:** Leave as `Myself (Super Admin Self-Owned)` or pick one of the 5 approved coordinators from the dropdown.
       * **Start Date & Time:** Pick tomorrow at `09:00`
       * **End Date & Time:** Pick tomorrow at `15:00`
       * **Geofence Radius:** `200`
       * **Venue Name:** `Bahan Community Center`
       * **Charity Fields:** Check `1` to `3` boxes (e.g., `Teaching` or `Environmental Conservation`).
     * Click **Create Event as Super Admin →**.
     * **Result:** Green banner appears at the top (`Event 'Yangon Flood Emergency Supply Drive' (ID: ...) successfully created by Super Admin!`), the new event appears in the **Events Overview** table below in `Draft` status, and a new `admin.event_create` row appears in the **Recent Audit Logs** table at the bottom right!

2. **Real-Time Geo Monitoring (`http://127.0.0.1:8000/api/v1/admin/ui/geo-monitoring/`):**
   * Click **Geo Monitoring** in the top navigation bar.
   * **Geofence Check-In Attempts Log:** Displays the 2 seeded GPS check-in attempts from `v_geo_attempts_review`—one `Accepted` inside the radius (green) and one `Outside Geofence` (red) showing exact distance vs. perimeter radius.
   * **Active Monitored Event Perimeter Details:** Lists the published/active events with their GPS coordinates and radius in meters.

3. **Coordinator Governance & Handover Board (`http://127.0.0.1:8000/api/v1/admin/ui/coordinators/`):**
   * Click **Coordinator Board** in the top navigation bar.
   * **Pending Coordinator Applications:** Shows the `3 pending` coordinator applicants.
   * **Live Interactive Action:** Click the green **Approve** button on one of the pending applicants and confirm the prompt.
   * **Result:** The page calls `POST /api/v1/admin/coordinators/{user_id}/approve/` using your session + CSRF token, triggers `trg_01_coordinator_guard` in PostgreSQL, and reloads with `2 pending review` and `6 approved coordinators`!
   * **Event Coordinator Handover History:** Displays the audit trail from `v_event_coordinator_history`.

---

## 4. Step-by-Step Plan: Swagger / OpenAPI Interactive API Testing (`/api/docs/`)

Open `http://127.0.0.1:8000/api/docs/` in your browser.

### Tip: How to Authenticate in Swagger UI
> **Important Note on Browser Sessions vs. Token Auth in Swagger:**
> If you are logged into `/admin/login/` in the same browser window, Swagger will automatically send your Super Admin session cookie (`cookieAuth`).
> * To test **Admin endpoints** in Swagger, you don't even need to paste a token if you're already logged in via the browser!
> * To test **Coordinator** or **Volunteer** endpoints in Swagger (or to test unauthenticated `401`/`404` responses), either click **Logout** on the Admin Dashboard first (or open `/api/docs/` in an **Incognito / Private window**), click the green **Authorize** button at the top right of Swagger, and in the **`tokenAuth` (`apiKey`)** box enter:
>   ```text
>   Token <paste_40_char_token_key_here>
>   ```
>   *(Make sure to include the word `Token ` followed by a space before the key!)*

---

### Test Scenario A: Public Discovery (No Auth Needed)
1. **`GET /api/v1/charity-fields/`** $\rightarrow$ Click **Try it out** $\rightarrow$ **Execute**.
   * **Expected:** `200 OK` with active charity taxonomy (`code`, `label`, `sort_order`).
2. **`GET /api/v1/events/`** $\rightarrow$ Click **Try it out** $\rightarrow$ **Execute**.
   * **Expected:** `200 OK` paginated list of public (`published` and `active`) events from `v_public_events` with `spots_remaining` and `charity_fields`. Draft, completed, and cancelled events are automatically hidden.

---

### Test Scenario B: Anonymous Aggregate-Only Feedback Rule (Volunteer & Coordinator Privacy)
1. Click **Authorize** in Swagger (in an Incognito window or after logging out of `/admin/logout/`) and authorize as the **Approved Coordinator** (`Token c000000000000000000000000000000000000011`) or **Verified Volunteer** (`Token v000000000000000000000000000000000000024`).
2. Execute **`GET /api/v1/me/feedback/`**:
   * **Expected (`200 OK`):**
     ```json
     {
       "results": [
         // ONLY feedback rows that THIS user authored themselves (no comments/ratings from others)
       ],
       "summary": {
         "user_id": 3,
         "total_count": 3,
         "overall_avg_rating": 5.0,
         "as_volunteer": {
           "count": 0,
           "avg_overall": null,
           "avg_punctuality": null,
           "avg_attitude": null,
           "avg_task_completion": null
         },
         "as_coordinator": {
           "count": 3,
           "avg_overall": 5.0,
           "avg_communication": 5.0,
           "avg_support": 5.0,
           "avg_organization": 5.0
         },
         "rating_distribution": {
           "1": 0, "2": 0, "3": 0, "4": 0, "5": 3
         }
       }
     }
     ```
   * **Verify Privacy Rule:** Notice that `summary` contains **zero `from_user_id`**, **zero `rater_user_id`**, and **zero `comment` strings**. Neither the coordinator nor the volunteer can see who rated them!
3. Now execute **`GET /api/v1/events/2/feedback/`** (Event 2: Urban Flood Emergency Relief, a completed event) as the **Coordinator**:
   * **Expected (`200 OK`):** `results` only lists feedback authored by the coordinator themselves—it **never** exposes individual `volunteer_to_coordinator` or `volunteer_to_event` rows submitted by volunteers.

---

### Test Scenario C: Super Admin Event Creation & 404 Masking via Swagger API
1. Authorize in Swagger using the **Staff Admin** token (`Token a000000000000000000000000000000000000002`).
2. Try **`POST /api/v1/admin/events/`** with body:
   ```json
   {
     "title": "Staff Admin Attempt",
     "start_time": "2026-12-01T09:00:00Z",
     "end_time": "2026-12-01T14:00:00Z",
     "charity_field_ids": [1]
   }
   ```
   * **Expected:** **`404 Not Found`** (`{"error": {"code": "not_found", "message": "The requested resource was not found."}}`) and a `security.red_alert.admin_route_denied` row logged in `audit_logs`!
3. Now switch **Authorize** to the **Super Admin** token (`Token a000000000000000000000000000000000000001`).
4. Execute **`POST /api/v1/admin/events/`** with body:
   ```json
   {
     "title": "Super Admin API Relief Event",
     "description": "Created via Swagger API by Super Admin",
     "start_time": "2026-12-01T09:00:00Z",
     "end_time": "2026-12-01T14:00:00Z",
     "venue_name": "Yangon Central Hall",
     "venue_lat": "16.805280",
     "venue_lng": "96.156110",
     "geofence_radius_m": 200,
     "charity_field_ids": [1, 2]
   }
   ```
   * **Expected:** **`201 Created`** returning the new event (`status: "draft"`, `owner_id`, `current_coordinator_id`).

---

### Test Scenario D: Admin Governance, Verification Queue & Maintenance via Swagger API
While authorized as **Super Admin** (`Token a000000000000000000000000000000000000001`):
1. **`GET /api/v1/admin/dashboard/`** $\rightarrow$ Returns live JSON KPIs from `v_admin_dashboard`.
2. **`GET /api/v1/admin/verification-images/`** $\rightarrow$ Lists the 5 pending verification images.
3. **`GET /api/v1/admin/coordinators/`** $\rightarrow$ Lists the pending coordinator applications.
4. **`GET /api/v1/admin/feedback/`** $\rightarrow$ Lists all 8 feedback rows (Admins—and only Admins—can see `rater_user_id`, `target_user_id`, and `comment` for moderation).
5. **`GET /api/v1/admin/audit-logs/`** $\rightarrow$ Returns the append-only PostgreSQL trigger audit trail (Super Admin exclusive).
6. **`POST /api/v1/admin/maintenance/run/`** $\rightarrow$ Runs all 4 PostgreSQL maintenance functions (`release_expired_blocks`, `expire_stale_applications`, `purge_expired_otps`, `purge_geo_evidence`) and returns the counts.