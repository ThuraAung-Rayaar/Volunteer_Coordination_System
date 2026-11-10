# Volunteer Coordination System v0.6.0 — Super Admin Control Center v2.0 Master Plan

## 1. Architectural Overview & Requirements Mapping

This plan upgrades the `admin_portal` into a complete, modular, 8-tab **Super Admin & Governance Control Center** while keeping the frozen PostgreSQL schema (`*.sql`) and existing REST API contracts 100% intact.

### 1.1 Key UX, Auth & Navigation Upgrades
| Requirement | Implementation Design |
| :--- | :--- |
| **Custom Themed Login Page on Start** | Visiting `/admin-dashboard/` or `/api/v1/admin/ui/dashboard/` while unauthenticated redirects to `/api/v1/admin/ui/login/` — a custom dark-slate/blue Tailwind login page matching the Control Center theme (replacing Django's default `/admin/login/`). |
| **Logout Redirects to Custom Login** | Clicking **Logout** posts/navigates to `/api/v1/admin/ui/logout/`, clears the session, and redirects straight back to `/api/v1/admin/ui/login/`. |
| **Myanmar Phone Auto-Hash Lookup** | Admins type a normal Myanmar phone number starting with **`+959`**, **`+9509`**, **`09`**, or **`9`** (or a raw `phone_hash`). The backend normalizes it to canonical E.164 `+959<digits>`, computes the HMAC-SHA256 `phone_hash` (with a fallback check on `phone_enc` for `psql`-seeded rows), and authenticates the session. Includes a live AJAX hash preview badge on the login form. |
| **Sticky Menu Bar & Tablet/Monitor Responsive** | Shared `base_admin.html` layout with `<header class="sticky top-0 z-50 bg-slate-900/95 backdrop-blur ...">` that stays visible on scroll and adapts cleanly from tablet (`768px+`) to ultrawide monitors (`1536px+`). |
| **Modular 8-Tab Architecture** | Every tab extends `base_admin.html`, making future feature additions plug-and-play. |

---

### 1.2 The 8 Control Center Tabs

1. **Tab 1 — Main Dashboard (`/api/v1/admin/ui/dashboard/`)**
   * **Top System Summary Metrics:** Total Users, Active Volunteers, Approved Coordinators, Live/Upcoming Events, Pending Verifications, Pending Geo Reviews.
   * **User Percentage & Coordinator/User Ratio:** Visual progress bars and exact ratio calculation (`Coordinators : Volunteers`, e.g., `1 : 7.4`, plus percentage split).
   * **Volunteer Composition by Status:** Breakdown of `active`, `blocked`, `closed` accounts + Verification tier breakdown (`verified`, `pending`, `rejected`, `none`).
   * **Coordinator Status Breakdown:** Counts and percentages for `approved`, `pending`, `suspended`, and `revoked` coordinators.
   * **Expandable / Contractible Semi-Map (Leaflet.js):** Interactive map marking **Ongoing Live (`active`)** events (emerald pulse markers) and **Future (`published`/`draft`)** events (blue markers) with two separate filter toggles and an **Expand / Contract Map** button (`h-80` $\leftrightarrow$ `h-[600px]`).
   * **Past Event Detail Summary:** Table of `completed` and `cancelled` events with attendance, headcount, and feedback metrics.
   * **Summary Feedback Dashboard:** System-wide average rating, 1–5 star distribution bars, direction breakdown (`volunteer_to_event`, `volunteer_to_coordinator`, `coordinator_to_volunteer`), and active vs. hidden counts.

2. **Tab 2 — Create Event & Browse (`/api/v1/admin/ui/event-create/`)**
   * Dedicated Super Admin Event Creation workspace with interactive map pin-picker (click map to populate latitude/longitude and preview geofence radius), charity field selector (1–3), coordinator owner selector, and a live browsable catalog of existing events alongside the form.

3. **Tab 3 — Events Detail & Visual Geo Monitoring (`/api/v1/admin/ui/events/`)**
   * Combines deep per-event inspection (posts, capacity, applications, assignments, lifecycle status actions: Cancel/Delete/Restore) with the **Visual Geo Monitoring Map** showing event geofence circles and color-coded GPS check-in attempt pins (`accepted`, `outside_geofence`, `mock_location`, `pending` review).

4. **Tab 4 — Users Directory & Detail Inspector (`/api/v1/admin/ui/users/`)**
   * Searchable, tabbed user directory (`All`, `Volunteers`, `Coordinators`, `Admins`, `Blocked/Warned`) with an expandable **User Detail Inspector** showing decrypted phone (`decrypt_phone`), skills, blood type, verification images queue (with Approve/Reject buttons), assignment history, and moderation actions.

5. **Tab 5 — Provision User & Assign Coordinator (`/api/v1/admin/ui/user-create/`)** *(Super Admin Exclusive)*
   * Create a new user account (with Myanmar phone normalization `+959`/`+9509`/`09`/`9`, display name, password, skills, blood type) and **immediately assign & approve them as a Coordinator** (or Staff Admin / Verified Volunteer) in a single atomic step.

6. **Tab 6 — Coordinator Board, Requests & Complaints (`/api/v1/admin/ui/coordinators/`)**
   * Combines Pending Coordinator Applications (Approve/Reject), Active Coordinator Roster (Suspend/Revoke), Handover History (`v_event_coordinator_history`), and a **Complaints & Low-Score Alert Queue** (reviews with score $\le 2$ or flagged items) so admins can act on complaints and issue warnings/blocks in one place.

7. **Tab 7 — Feedback Intelligence & Moderation (`/api/v1/admin/ui/feedback/`)**
   * Full T4 admin view of all feedback records across events with filters by direction, score (1–5), and status (`active`/`hidden`), displaying rater name, target name, tags, comment text, and one-click **Hide Feedback** moderation.

8. **Tab 8 — User & Admin Settings (`/api/v1/admin/ui/settings/`)**
   * **Admin Password Change / Reset:** Change own password or reset any user/admin password.
   * **User Phone Number Change:** Select a user, enter a new Myanmar phone number (`+959`/`+9509`/`09`/`9`), and atomically update `phone_hash` + `phone_enc`.
   * **System Maintenance & App Settings:** One-click execution of PostgreSQL maintenance routines (`release_expired_blocks`, `expire_stale_applications`, `purge_expired_otps`, `purge_geo_evidence`).

---

## 2. Core Formulas & Reference Logic (Give These to the Model)

### Formula 1 — Myanmar Phone Number Normalization & Resilient User Lookup
Handles `+959...`, `+9509...`, `09...`, `9...`, `959...`, `9509...`, and raw 64-char hex `phone_hash`:

```python
import re
from common.security import compute_phone_hash, encrypt_phone, decrypt_phone
from apps.accounts.models import Users

def normalize_myanmar_phone(raw_input: str) -> str:
    """
    Normalize any Myanmar phone input (+959, +9509, 09, 9) into canonical '+959<digits>'.
    """
    if not raw_input:
        raise ValueError("Phone number is required.")
    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(raw_input).strip())

    # Strip leading '+' for prefix matching
    digits = cleaned.lstrip("+")
    if not digits.isdigit():
        raise ValueError("Phone number must contain only digits and optional leading '+'.")

    if digits.startswith("9509"):
        subscriber = digits[4:]
    elif digits.startswith("959"):
        subscriber = digits[3:]
    elif digits.startswith("09"):
        subscriber = digits[2:]
    elif digits.startswith("9"):
        subscriber = digits[1:]
    else:
        raise ValueError("Myanmar phone number must start with +959, +9509, 09, or 9.")

    if not (7 <= len(subscriber) <= 10):
        raise ValueError("Myanmar subscriber number must be between 7 and 10 digits after prefix.")

    return f"+959{subscriber}"


def resolve_user_by_phone_or_hash(raw_identifier: str) -> tuple[Users | None, str]:
    """
    Resolve a Users row from either:
      1. A 64-char hex phone_hash directly
      2. A Myanmar phone number (+959, +9509, 09, 9) via HMAC compute_phone_hash
      3. Fallback scan of phone_enc (for rows seeded via raw SQL psql scripts)
    Returns (user_or_none, resolved_phone_hash).
    """
    ident = (raw_identifier or "").strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", ident):
        user = Users.objects.filter(phone_hash=ident.lower()).first()
        return user, ident.lower()

    canonical = normalize_myanmar_phone(ident)
    p_hash = compute_phone_hash(canonical)
    user = Users.objects.filter(phone_hash=p_hash).first()
    if user:
        return user, p_hash

    # Fallback for externally SQL-seeded users whose phone_enc or phone_hash used a different format
    alt_local = "09" + canonical[4:]  # e.g. 09100000001
    for candidate in Users.objects.all():
        dec = decrypt_phone(candidate.phone_enc) or candidate.phone_enc or ""
        dec_clean = re.sub(r"[\s\-\(\)\.]", "", str(dec))
        if dec_clean in (canonical, alt_local, canonical.lstrip("+")):
            return candidate, candidate.phone_hash

    return None, p_hash
```

### Formula 2 — Dashboard Percentage & Ratio Math
```python
total_users = Users.objects.count()
coord_profiles = CoordinatorProfiles.objects.all()
total_coordinators = coord_profiles.filter(status="approved").count()
pending_coordinators_count = coord_profiles.filter(status="pending").count()
suspended_coordinators_count = coord_profiles.filter(status="suspended").count()
revoked_coordinators_count = coord_profiles.filter(status="revoked").count()

regular_volunteers = max(total_users - total_coordinators, 0)
coord_percentage = round((total_coordinators / total_users) * 100, 1) if total_users else 0.0
volunteer_percentage = round(100.0 - coord_percentage, 1) if total_users else 0.0
coord_to_user_ratio = f"1 : {round(regular_volunteers / total_coordinators, 1)}" if total_coordinators else f"0 : {total_users}"
```

### Formula 3 — Super Admin Atomic User Creation + Immediate Coordinator Assignment
Respects PostgreSQL `trg_01_coordinator_guard` (which requires `status='pending'` on `INSERT`, `verification_status='verified'`, and `approved_by_id != user_id` on `UPDATE`):
```python
@transaction.atomic
def admin_provision_user(
    admin_user: Users,
    *,
    raw_phone: str,
    display_name: str,
    password: str | None = None,
    assign_role: str = "volunteer",  # "volunteer" | "coordinator" | "staff_admin"
    verification_status: str = "verified",
    blood_type: str = "unknown",
    skills: list[str] | None = None,
    notes: str = "",
) -> Users:
    if not getattr(admin_user, "is_superuser", False):
        raise ResourceMaskedNotFound()

    canonical_phone = normalize_myanmar_phone(raw_phone)
    p_hash = compute_phone_hash(canonical_phone)
    if Users.objects.filter(phone_hash=p_hash).exists():
        raise DomainError(code="duplicate_user", message="A user with this phone number already exists.", status_code=409)

    is_staff_flag = assign_role == "staff_admin"
    if assign_role == "coordinator":
        verification_status = "verified"  # Required by trg_01_coordinator_guard

    new_user = Users.objects.create(
        phone_hash=p_hash,
        phone_enc=encrypt_phone(canonical_phone),
        display_name=display_name.strip()[:150],
        is_admin=is_staff_flag,
        is_staff=is_staff_flag,
        is_superuser=False,
        is_active=True,
        account_status="active",
        verification_status=verification_status,
        blood_type=blood_type,
        skills=normalize_tags(skills or []),
    )
    if password:
        new_user.set_password(password)
        new_user.save(update_fields=["password"])

    if assign_role == "coordinator":
        # Step 1: Insert as pending (required by trg_01_coordinator_guard)
        CoordinatorProfiles.objects.create(
            user=new_user,
            status="pending",
            notes=notes or "Provisioned directly by Super Admin",
        )
        # Step 2: Transition to approved with admin_user as approver
        CoordinatorProfiles.objects.filter(user_id=new_user.id).update(
            status="approved",
            approved_by_id=admin_user.id,
            approved_at=timezone.now(),
            notes=notes or "Immediately approved by Super Admin on user creation",
        )

    return new_user
```

---

## 3. Step-by-Step Prompts for Antigravity Gemini Flash

Feed the following **6 prompts** (`UI-TASK-01` through `UI-TASK-06`) one by one to Gemini Flash in Antigravity.

---

### Prompt 1: `UI-TASK-01` — Myanmar Phone Auto-Hash Login, Logout & Sticky Base Layout

```text
You are working on Volunteer Coordination System v0.6.0 (Django + DRF + PostgreSQL).
TASK ID: UI-TASK-01 (Custom Admin Login with Myanmar Phone Auto-Hash, Logout & Sticky Base Layout)

HARD CONSTRAINTS:
- Do NOT modify any .sql file or database migration.
- Keep all existing DRF API views and test behavior in backend/admin_portal/views.py intact.
- Use Tailwind CSS (CDN) and Leaflet.js (CDN) for maps.

IMPLEMENT THE FOLLOWING CHANGES:

1. Create `backend/admin_portal/phone_utils.py`:
   Implement:
   - `normalize_myanmar_phone(raw_input: str) -> str`:
     Accepts phone numbers starting with `+959`, `+9509`, `09`, `9`, `959`, or `9509` (stripping spaces, dashes, dots, parens) and normalizes them to `"+959" + subscriber_digits`. Raises `ValueError` with a clear message if invalid.
   - `resolve_user_by_phone_or_hash(raw_identifier: str) -> tuple[Users | None, str]`:
     * If `raw_identifier` is a 64-char hex string, look up `Users.objects.filter(phone_hash=ident.lower()).first()`.
     * Otherwise call `normalize_myanmar_phone(raw_identifier)`, compute `p_hash = compute_phone_hash(canonical)`, and look up `Users.objects.filter(phone_hash=p_hash).first()`.
     * Fallback for SQL-seeded rows: if not found by hash, iterate `Users.objects.all()` and check if `decrypt_phone(u.phone_enc)` or `u.phone_enc` matches `canonical` or `"09" + canonical[4:]`.
     * Return `(user, p_hash, canonical)` (with `canonical` as `""` if raw hash was entered).

2. Update `backend/admin_portal/views.py`:
   - Update `_guard_admin_html(request)`:
     When unauthenticated (`not request.user or not request.user.is_authenticated`):
     If `"text/html" in accept and "application/json" not in accept`, redirect to `f"/api/v1/admin/ui/login/?next={request.path}"` (instead of `/admin/login/`).
     Keep raising `ResourceMaskedNotFound()` for non-HTML API test requests or authenticated non-admins so all existing tests pass.
   - Add `admin_login_view(request)` (`GET` and `POST`, `@allow_any` / standard Django view):
     * If `request.method == "GET"` and `request.user.is_authenticated` and `request.user.is_admin`:
       redirect to `request.GET.get("next") or "/api/v1/admin/ui/dashboard/"`.
     * On `POST`: read `phone_or_hash = request.POST.get("phone", "").strip()` and `password = request.POST.get("password", "")`.
       Use `resolve_user_by_phone_or_hash(phone_or_hash)` to find the user.
       Verify the user exists, `user.is_admin` and `user.is_active` and `user.account_status == "active"`.
       Check password:
       - If `user.password` starts with `"pbkdf2_"` or `"argon2"` or `"bcrypt"`, check `user.check_password(password)`.
       - If `user.password` was seeded as a raw/placeholder string or `None` via external SQL (`psql`) and `password == "AdminDemo123!"`, set `user.set_password("AdminDemo123!")`, save `user`, and allow login!
       Call `django.contrib.auth.login(request, user, backend="django.contrib.auth.backends.ModelBackend")` and redirect to `request.POST.get("next") or request.GET.get("next") or "/api/v1/admin/ui/dashboard/"`.
       On failure, render `admin_portal/login.html` with `error_message` and `entered_phone`.
   - Add `admin_logout_view(request)` (`GET` and `POST`):
     Call `django.contrib.auth.logout(request)` and `redirect("/api/v1/admin/ui/login/")`.
   - Add `admin_phone_hash_lookup_api(request)` (`GET /api/v1/admin/ui/phone-lookup/?phone=...`):
     Public helper for the login screen live preview: normalizes the Myanmar phone (`+959`, `+9509`, `09`, `9`) and returns `JsonResponse({"valid": True, "normalized_phone": canonical, "phone_hash": p_hash, "account_found": bool(user and user.is_admin)})` or `{"valid": False, "error": str(e)}`.

3. Create `backend/admin_portal/templates/admin_portal/base_admin.html`:
   - Modern dark-slate & royal-blue Tailwind CSS layout (`min-w-[768px]` responsive for tablets and all desktop monitors).
   - Include Leaflet 1.9.4 CSS & JS (`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` and `leaflet.js`) in `<head>`.
   - **Sticky Top Navigation Bar (`sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800 shadow-lg`)**:
     * Top row: VCS Logo, System Title, Logged-in Admin Role Badge (`Super Admin` amber badge or `Staff Admin` blue badge), Display Name, and `Logout` button pointing to `/api/v1/admin/ui/logout/`.
     * Second row (always visible sticky tab bar):
       1. `Dashboard` (`/api/v1/admin/ui/dashboard/`)
       2. `Create Event` (`/api/v1/admin/ui/event-create/`) — shown for Super Admin
       3. `Events & Geo Map` (`/api/v1/admin/ui/events/`)
       4. `Users Directory` (`/api/v1/admin/ui/users/`)
       5. `Provision User` (`/api/v1/admin/ui/user-create/`) — shown for Super Admin
       6. `Coordinator Board` (`/api/v1/admin/ui/coordinators/`)
       7. `Feedback` (`/api/v1/admin/ui/feedback/`)
       8. `Settings` (`/api/v1/admin/ui/settings/`)
     * Highlight the active tab using `active_tab` context variable.

4. Create `backend/admin_portal/templates/admin_portal/login.html`:
   - Matches the dark-slate/indigo Control Center theme.
   - Input field for **Myanmar Phone Number (`+959`, `+9509`, `09`, or `9...`) or Phone Hash**.
   - Live JavaScript listener on the phone input that calls `/api/v1/admin/ui/phone-lookup/?phone=...` as the admin types, displaying:
     * Normalized E.164 Phone: `+959...`
     * Auto-Computed SHA-256 HMAC Hash: `c9e4cda2...`
     * Admin Account Match badge (`Admin Account Verified` in emerald or `Not Found` in amber).
   - Password input field + "Sign In to Control Center" submit button.

5. Register the new routes in `backend/admin_portal/urls.py`:
   - `path("ui/login/", views.admin_login_view, name="admin_ui_login")`
   - `path("ui/logout/", views.admin_logout_view, name="admin_ui_logout")`
   - `path("ui/phone-lookup/", views.admin_phone_hash_lookup_api, name="admin_ui_phone_lookup")`

VERIFY:
Run `python manage.py check` and `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`.
```

---

### Prompt 2: `UI-TASK-02` — Main Dashboard Upgrade (Metrics, Ratios, Expandable Map, Past Events & Feedback Summary)

```text
You are working on Volunteer Coordination System v0.6.0.
TASK ID: UI-TASK-02 (Main Dashboard Tab Full Upgrade)

HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Keep `kpis`, `recent_events`, `pending_verifications`, `charity_fields`, `approved_coordinators`, `recent_audit_logs`, `is_superuser`, `success_message`, and `error_message` in `dashboard_view` context so all existing tests pass.

IMPLEMENT THE FOLLOWING CHANGES:

1. In `backend/admin_portal/views.py`, enrich `dashboard_view(request)` context with:
   - `active_tab`: `"dashboard"`
   - **User & Coordinator Ratio Metrics (`user_composition`)**:
     * `total_users`: total count of `Users`
     * `total_coordinators`: count of `CoordinatorProfiles` with `status='approved'`
     * `regular_volunteers`: `max(total_users - total_coordinators, 0)`
     * `coord_pct`: percentage of approved coordinators (`round(total_coordinators / total_users * 100, 1)`)
     * `vol_pct`: `round(100 - coord_pct, 1)`
     * `coord_ratio`: string `f"1 : {round(regular_volunteers / total_coordinators, 1)}"` (or `"0 : 0"`)
     * Volunteer account statuses: `vol_active`, `vol_blocked`, `vol_closed`
     * Volunteer verification breakdown: `ver_verified`, `ver_pending`, `ver_rejected`, `ver_none`
     * Coordinator status breakdown: `coord_approved`, `coord_pending`, `coord_suspended`, `coord_revoked`
   - **Map Events JSON (`map_events_json`)**:
     Serialize all non-deleted `Events` with status in `("active", "published", "draft")` into JSON containing:
     `id`, `title`, `status` (`"active"` for ongoing live vs `"published"`/`"draft"` for future), `location_name`, `latitude` (float, default `16.80528`), `longitude` (float, default `96.15611`), `geo_radius_m` (default `150`), `start_at` (formatted string), `end_at` (formatted string).
   - **Past Events Summary (`past_events`)**:
     Query `VEventSummary.objects.filter(status__in=["completed", "cancelled"]).order_by("-end_at")[:15]` and attach feedback count per event.
   - **Feedback Summary Dashboard (`feedback_overview`)**:
     Compute across `Feedback.objects.all()`:
     * `total_active`: count of `status="active"`
     * `total_hidden`: count of `status="hidden"`
     * `avg_score`: overall average score (rounded to 2 decimals, default `0.0`)
     * `by_direction`: counts and average scores for `volunteer_to_event`, `volunteer_to_coordinator`, and `coordinator_to_volunteer`
     * `star_distribution`: list of dicts for stars `5, 4, 3, 2, 1` with `star`, `count`, and `pct`.

2. Update `backend/admin_portal/templates/admin_portal/dashboard.html` (extending `base_admin.html`):
   - **Section 1: Top System Summary KPI Row** (6 cards: Total Users, Active Volunteers, Approved Coordinators, Ongoing Live Events, Pending Verifications, Pending Geo Reviews).
   - **Section 2: User Analytics & Composition Grid (3 columns)**:
     * Card A: **Coordinator vs. Volunteer Percentage & Ratio** (`{{ user_composition.coord_ratio }}` ratio badge, dual progress bar showing `{{ user_composition.coord_pct }}%` Coordinators vs `{{ user_composition.vol_pct }}%` Volunteers).
     * Card B: **Volunteer Composition by Status & Verification** (Active / Blocked / Closed pills + Verified / Pending / Rejected / Unverified progress bars).
     * Card C: **Coordinator Pipeline Status** (Approved `{{ user_composition.coord_approved }}`, Pending Review `{{ user_composition.coord_pending }}`, Suspended `{{ user_composition.coord_suspended }}`, Revoked `{{ user_composition.coord_revoked }}` with quick link to Coordinator Board).
   - **Section 3: Interactive Semi-Map with Expand/Contract & Live vs. Future Filters**:
     * Header bar with filter buttons:
       - `All Map Events`
       - `Ongoing Live Events (Active)` (Green dot)
       - `Future Events (Published / Draft)` (Blue dot)
       - **`Expand Map ⤢ / Contract Map ⤡`** button that smoothly toggles the map container height between `h-80` (`320px`) and `h-[600px]` and calls `map.invalidateSize()`.
     * Renders Leaflet map with circle perimeters (`L.circle`) and markers (`L.marker`) color-coded by `active` (emerald) vs `published`/`draft` (blue).
   - **Section 4: Past Events Detail Summary Table & Summary Feedback Dashboard (2-column split)**:
     * Left (2/3 width): **Past Events Detail Summary** (`completed` & `cancelled` events showing Event ID, Title, Status, Start/End Time, Assigned, Checked-In, and Feedback Count).
     * Right (1/3 width): **Summary Feedback Dashboard** (Overall Rating score out of 5.0, 5-star to 1-star horizontal bar chart, direction averages, and Active vs. Hidden count).
   - **Section 5: Pending Verification Queue & Recent Audit Logs** (preserving existing tables).

VERIFY:
Run `python manage.py check` and `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`.
```

---

### Prompt 3: `UI-TASK-03` — Dedicated Event Creation Tab & Combined Events + Visual Geo Monitoring Tab

```text
You are working on Volunteer Coordination System v0.6.0.
TASK ID: UI-TASK-03 (Event Creation & Browsing Tab + Detailed Events & Visual Geo Map Tab)

HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Keep `geo_monitoring_view` working at `/api/v1/admin/ui/geo-monitoring/` so existing tests pass.

IMPLEMENT THE FOLLOWING CHANGES:

1. In `backend/admin_portal/views.py`, add/update:
   - `event_create_tab_view(request)` (`GET` and `POST` at `/api/v1/admin/ui/event-create/`):
     * Guarded by `_guard_admin_html(request)`.
     * On `POST`: if `request.user.is_superuser`, create the event via `event_service.admin_create_event()` (supporting optional initial role posts if provided) and set `success_message` / `error_message`.
     * Context: `active_tab="event_create"`, `charity_fields`, `approved_coordinators`, `all_events` (from `VEventSummary.objects.all().order_by("-start_at")[:30]`), `is_superuser`.
   - `events_detail_and_geo_view(request)` (`GET` and `POST` at `/api/v1/admin/ui/events/`):
     * Guarded by `_guard_admin_html(request)`.
     * Supports optional query param `?event_id=<id>` to inspect a specific event in full detail (loading `Events` row, `EventPosts` with capacity from `VEventPostCapacity`, `EventApplications`, `Assignments`, `Attendance`, and `VGeoAttemptsReview`).
     * Supports `POST` admin moderation actions on an event (`cancel`, `delete`, `restore` via `moderation_service.record_moderation_action`).
     * Context includes `events_list` (all `Events` joined with `VEventSummary`), `selected_event`, `selected_posts`, `selected_applications`, `selected_assignments`, `geo_attempts` (`VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:100]`), and `geo_map_json` (serializing active/published events with their lat/lng/radius AND all geo check-in attempts with their lat/lng/distance/result).
   - Update `geo_monitoring_view(request)` to also pass `active_tab="events"` and `geo_map_json` so both `/api/v1/admin/ui/geo-monitoring/` and `/api/v1/admin/ui/events/` share the visual map experience.

2. Create `backend/admin_portal/templates/admin_portal/event_create.html` (extending `base_admin.html`):
   - Left 7 columns: **Super Admin Event Creation Form** with:
     * Title, Description, Purpose Type (`charity_event` / `help_wanted_event`), Acceptance Mode (`manual` / `auto`), Max Participants.
     * Start & End Date/Time, Application Deadline.
     * Assigned Owner Coordinator dropdown (`Myself` or any Approved Coordinator).
     * **Interactive Venue & Geofence Map Picker (Leaflet.js)**: Clicking anywhere on the Yangon/Myanmar map sets the Latitude & Longitude inputs and draws the live geofence radius circle (`50m`–`2000m`)!
     * Charity Fields checkboxes (1 to 3 required).
     * Briefing / Onboarding Text & Support checkboxes (`meals_provided`, `lodging_provided`, `travel_support_provided`).
   - Right 5 columns: **Live Browsable Event Catalog** with search/status filter so the admin can browse existing events while planning new ones.

3. Create `backend/admin_portal/templates/admin_portal/events_detail.html` (and update `geo_monitoring.html` to include the visual Leaflet map):
   - **Top Visual Geo Monitoring & Event Perimeter Map (Leaflet.js)**:
     * Plots all monitored events as blue/emerald geofence circles (`geo_radius_m`) and plots GPS check-in attempts as interactive markers (green = `accepted`, red = `outside_geofence` / `mock_location`, amber = `pending`).
     * Clicking an event row or attempt focuses (`map.flyTo`) on that event's perimeter!
   - **Master-Detail Event Inspector**:
     * Full searchable table of all events (Draft, Published, Active, Completed, Cancelled) with a **"View Full Details"** button.
     * Detailed drawer/panel for the selected event showing all metadata, Role Posts & capacity bars, Applications, Assignments, Geo Attempts Log, and Admin Lifecycle Moderation buttons (`Cancel Event`, `Soft Delete`, `Restore`).

4. Mount routes in `backend/admin_portal/urls.py`:
   - `path("ui/event-create/", views.event_create_tab_view, name="admin_ui_event_create")`
   - `path("ui/events/", views.events_detail_and_geo_view, name="admin_ui_events")`

VERIFY:
Run `python manage.py check` and `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`.
```

---

### Prompt 4: `UI-TASK-04` — Users Directory Inspector Tab & Super Admin User Provisioning + Immediate Coordinator Tab

```text
You are working on Volunteer Coordination System v0.6.0.
TASK ID: UI-TASK-04 (Users Directory Inspector Tab + Super Admin Create User & Immediate Coordinator Tab)

HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Respect PostgreSQL triggers `trg_01_coordinator_guard` and `ck_coordinator_no_self_approval` when creating and approving a coordinator (insert `CoordinatorProfiles` with `status='pending'` first, then `.update(status='approved', approved_by_id=request.user.id, approved_at=timezone.now())`).

IMPLEMENT THE FOLLOWING CHANGES:

1. In `backend/admin_portal/views.py`, add:
   - `users_directory_view(request)` (`GET` and `POST` at `/api/v1/admin/ui/users/`):
     * Guarded by `_guard_admin_html(request)`.
     * Supports sub-tab filtering (`?role=all|volunteers|coordinators|admins|blocked`), search (`?q=...`), and user detail selection (`?user_id=<id>`).
     * For each user, decrypts `phone = decrypt_phone(u.phone_enc) or u.phone_enc` (T4 admin privilege), resolves their `CoordinatorProfiles` status if any, and loads their `VUserModerationSummary`.
     * When `user_id` is selected (or via modal), loads full user detail: profile capabilities (`skills`, `blood_type`, `home_area`, `emergency_contact_name`), `UserVerificationImages` (with inline **Approve / Reject Verification Image** form actions calling `verification_service.review_verification_image`), `Assignments`, `Attendance`, and `ModerationActions` (with inline **Warn / Block / Unblock / Close / Reinstate** buttons).
   - `user_provision_view(request)` (`GET` and `POST` at `/api/v1/admin/ui/user-create/`):
     * Guarded by `_guard_admin_html(request)`.
     * Super Admin exclusive (`request.user.is_superuser`) creation form:
       - Accepts Myanmar phone number (`+959`, `+9509`, `09`, or `9`), Display Name, Password (optional or required for admin/coord), Role Assignment (`"coordinator"` = Immediately Approved Coordinator, `"volunteer"` = Verified Volunteer, `"staff_admin"` = Operations Staff Admin), Verification Status, Blood Type, Home Area, Skills (comma-separated), and Coordinator Notes.
       - Normalizes phone via `normalize_myanmar_phone()`, computes `phone_hash` and `phone_enc`, creates the `Users` row, and if `assign_role == "coordinator"`, creates the `CoordinatorProfiles` row in `pending` and immediately transitions it to `approved` with `approved_by_id=request.user.id`!
       - Also supports a **"Promote Existing User to Approved Coordinator"** quick-action form on the same page so Super Admin can pick any existing volunteer and immediately make them an Approved Coordinator.

2. Create `backend/admin_portal/templates/admin_portal/users.html` (extending `base_admin.html`):
   - Role filter tabs (`All Users`, `Volunteers`, `Approved Coordinators`, `Pending Verification`, `Blocked / Warned`, `Admins`) + Search bar.
   - Users table showing ID, Display Name, Decrypted Phone, Role Badge, Verification Status, Account Status, and **"Inspect User"** button.
   - Comprehensive **User Detail Inspector Panel** (displays when a user is selected) with 4 sub-sections:
     1. Personal & Capability Profile (UUID, Phone, Blood Type, Skills, Emergency Contact, Donation flags).
     2. Identity Verification Documents & Review Action (shows uploaded verification images with stream preview link `/api/v1/admin/verification-images/<id>/file/` and Approve/Reject buttons).
     3. Event Participation & Attendance History.
     4. Governance & Moderation Controls (Warn, Temporary Block, Unblock, Close Account, Reinstate).

3. Create `backend/admin_portal/templates/admin_portal/user_create.html` (extending `base_admin.html`):
   - **Left Card: Provision New User & Immediate Role Assignment (Super Admin)**:
     * Myanmar Phone input (`+959`, `+9509`, `09`, `9`) with live hash preview.
     * Display Name, Initial Password, Role radio cards:
       - **Immediately Assign as Approved Coordinator** (auto-verifies identity & approves `coordinator_profiles`)
       - **Verified Volunteer**
       - **Operations Staff Admin**
     * Blood Type, Home Area, Skills tags, Coordinator Notes.
   - **Right Card: Promote Existing Volunteer to Approved Coordinator** + **Recently Provisioned Users & Coordinators Table**.

4. Mount routes in `backend/admin_portal/urls.py`:
   - `path("ui/users/", views.users_directory_view, name="admin_ui_users")`
   - `path("ui/user-create/", views.user_provision_view, name="admin_ui_user_create")`

VERIFY:
Run `python manage.py check` and `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`.
```

---

### Prompt 5: `UI-TASK-05` — Upgraded Coordinator Board (with Complaints) & Feedback Intelligence Tab

```text
You are working on Volunteer Coordination System v0.6.0.
TASK ID: UI-TASK-05 (Coordinator Governance + Complaints Board & Detailed Feedback Tab)

HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Keep `pending_coordinators`, `approved_coordinators`, `handover_history`, and `is_superuser` in `coordinator_board_view` context so existing tests pass.

IMPLEMENT THE FOLLOWING CHANGES:

1. Update `coordinator_board_view(request)` in `backend/admin_portal/views.py` and `backend/admin_portal/templates/admin_portal/coordinator_board.html` (extending `base_admin.html`):
   - Add `active_tab="coordinators"`.
   - Include `suspended_coordinators` (`status="suspended"` or `"revoked"`).
   - Include `complaints_and_alerts`: low-rated feedback rows (`score <= 2`) and recent `ModerationActions` so admins can review complaints against coordinators or volunteers right on the board.
   - Support inline action buttons for:
     * **Pending Coordinator Requests:** `Approve` / `Reject (Revoke)`
     * **Active Coordinator Roster:** `Inspect Details`, `Suspend Coordinator`, `Revoke Coordinator`
     * **Suspended Coordinators:** `Reactivate (Approve)`
     * **Complaints & Escalations Queue:** `Hide Feedback`, `Warn User`, `Block User`.

2. Add `feedback_intelligence_view(request)` in `backend/admin_portal/views.py` (`GET` and `POST` at `/api/v1/admin/ui/feedback/`) and create `backend/admin_portal/templates/admin_portal/feedback.html` (extending `base_admin.html`):
   - Guarded by `_guard_admin_html(request)`.
   - On `POST`: allows hiding a feedback item via `moderation_service.record_moderation_action(request.user, action_type="feedback_hide", feedback_id=..., reason=...)`.
   - Displays:
     * **Top Feedback Analytics Strip:** Overall Average Score, Total Active Reviews, Hidden/Moderated Reviews, Low-Score Alerts ($\le 2$ stars), and Direction Averages (`Volunteer -> Event`, `Volunteer -> Coordinator`, `Coordinator -> Volunteer`).
     * **Filter Bar:** Filter by Direction, Star Score (`1`–`5`), Status (`active` / `hidden`), and Event.
     * **Detailed Feedback Table (Admin T4 View):** Shows Feedback ID, Event Title, Direction badge, Rater Name & ID, Target User Name & ID, Star Rating visual stars, Normalized Tags, Full Comment Text, Status badge, Timestamp, and **"Hide Review"** moderation button with reason prompt.

3. Mount route in `backend/admin_portal/urls.py`:
   - `path("ui/feedback/", views.feedback_intelligence_view, name="admin_ui_feedback")`

VERIFY:
Run `python manage.py check` and `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`.
```

---

### Prompt 6: `UI-TASK-06` — User & Admin Settings Tab (Password Reset, Phone Change, Maintenance) & Tests

```text
You are working on Volunteer Coordination System v0.6.0.
TASK ID: UI-TASK-06 (User & Admin Settings Tab: Password Change/Reset, Phone Number Change & System Maintenance)

HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- When changing a user's phone number, normalize via `normalize_myanmar_phone()` (`+959`, `+9509`, `09`, `9`), compute both `phone_hash = compute_phone_hash(canonical)` and `phone_enc = encrypt_phone(canonical)`, verify no other user has `phone_hash`, and update atomically.

IMPLEMENT THE FOLLOWING CHANGES:

1. Add `admin_settings_view(request)` in `backend/admin_portal/views.py` (`GET` and `POST` at `/api/v1/admin/ui/settings/`):
   - Guarded by `_guard_admin_html(request)`.
   - Supports 4 `POST` form actions (`form_action = request.POST.get("form_action")`):
     1. `"change_own_password"`:
        Admin changes their own password (`new_password`, `confirm_password`). Calls `request.user.set_password(new_password)`, saves `password`, and calls `update_session_auth_hash(request, request.user)` so they stay logged in!
     2. `"reset_user_password"`:
        Admin selects any user (by `target_user_id` or Myanmar phone number) and sets a new password on that account (`target_user.set_password(new_password)`).
     3. `"change_user_phone"`:
        Admin selects a user (`target_user_id`) and enters `new_phone` (accepting `+959`, `+9509`, `09`, or `9`).
        Normalizes to `+959<digits>`, computes new `phone_hash` and `phone_enc`, checks for duplicates, updates `Users.objects.filter(id=target_user.id).update(phone_hash=new_hash, phone_enc=new_enc, updated_at=timezone.now())`, and logs an audit entry!
     4. `"run_maintenance"` (Super Admin only):
        Executes `maintenance_service.run_all_maintenance()` and displays the results (`released_expired_blocks`, `expired_stale_applications`, `purged_expired_otps`, `purged_geo_evidence`).
   - Context includes: `active_tab="settings"`, `all_users` (with decrypted phones for the selector dropdown), `app_settings` (`AppSettings.objects.all().order_by("key")`), `maintenance_result`, `success_message`, `error_message`.

2. Create `backend/admin_portal/templates/admin_portal/settings.html` (extending `base_admin.html`):
   - **Card 1: Change My Admin Password** (New Password + Confirm Password).
   - **Card 2: Reset User / Admin Password** (User selector dropdown or Myanmar phone search + New Password).
   - **Card 3: Change User Phone Number (Auto-Hash & Re-Encrypt)** (User selector displaying current decrypted phone + New Myanmar Phone input supporting `+959`, `+9509`, `09`, `9` with live hash preview).
   - **Card 4: Database Maintenance & System Settings (`app_settings`)** (Run All Maintenance button for Super Admin + live table of PostgreSQL `app_settings` thresholds).

3. Mount route in `backend/admin_portal/urls.py`:
   - `path("ui/settings/", views.admin_settings_view, name="admin_ui_settings")`

4. Add automated tests in `backend/apps/audit/tests/test_api_admin_portal_phase8.py`:
   - `test_myanmar_phone_normalization_variants`: verifies `+959100000001`, `+9509100000001`, `09100000001`, and `9100000001` all normalize to `+959100000001` and produce the exact same `phone_hash`.
   - `test_custom_admin_login_with_myanmar_phone_and_logout`: verifies logging into `/api/v1/admin/ui/login/` using `09...` or `+9509...` authenticates the session and `/api/v1/admin/ui/logout/` redirects back to `/api/v1/admin/ui/login/`.
   - `test_super_admin_provision_user_and_immediate_coordinator`: verifies `POST /api/v1/admin/ui/user-create/` creates a user and immediately approves them as a coordinator without triggering `trg_01_coordinator_guard` errors.
   - `test_admin_settings_change_phone_and_password`: verifies changing a user's phone number and password via `/api/v1/admin/ui/settings/`.

VERIFY:
1. Run `python manage.py check`
2. Run `python manage.py spectacular --file schema.yml --fail-on-warn`
3. Run `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`
4. Confirm `git diff --name-only -- "*.sql"` is empty.
```