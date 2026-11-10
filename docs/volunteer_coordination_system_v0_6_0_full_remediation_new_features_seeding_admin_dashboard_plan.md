# Volunteer Coordination System v0.6.0 — Complete Backend Remediation, Feature Extension, Seeding & Admin Portal Implementation Blueprint

**Target Execution Model:** Antigravity Gemini Flash (`gemini-3-flash`)  
**Scope:** Core Backend (`common/`, `config/`, `services/`, `apps/`, `admin_portal/`) — **Excluding BFF surface Refactoring except where Feedback Privacy must be enforced**  
**Hard Constraint:** PostgreSQL SQL Prototype (`updated_volunteer_coordination_system_Database.sql`) is **100% FROZEN**. Zero edits to `.sql` files, triggers, views, or `managed = False` ORM table structures.

---

## 1. Architectural Feasibility Analysis of Your Two New Rules (Under Frozen SQL)

Before writing a single line of code, we must verify how the frozen PostgreSQL triggers in `updated_volunteer_coordination_system_Database.sql` interact with your two new requirements:

### Rule A: "Let Super Admin create events, following the event creation rules"
* **Database Constraint Analysis:**
  * In PostgreSQL (`events` table), `owner_id` and `current_coordinator_id` are `NOT NULL REFERENCES coordinator_profiles(user_id)`.
  * Furthermore, PostgreSQL trigger `trg_events_before_insert_update()` executes:
    ```sql
    SELECT cp.coordinator_status, u.account_status, u.verification_status
      INTO v_coord_status, v_user_status, v_verif_status
      FROM coordinator_profiles cp
      JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = NEW.owner_id;
    ```
    And enforces that `v_coord_status = 'approved'`, `v_user_status = 'active'`, and `v_verif_status = 'full'`.
* **How to Support Super Admin Event Creation Without Touching SQL:**
  1. **Option A1 (Super Admin creates on behalf of an Approved Coordinator):** The Admin Portal event creation endpoint (`POST /api/v1/admin/events/`) accepts an optional `owner_id` (an approved coordinator's user ID) or defaults to the Super Admin's own `user.id`.
  2. **Option A2 (Super Admin is Auto-Provisioned as an Approved Coordinator):** When a Super Admin creates an event and does not pass an explicit `owner_id` (or chooses themselves as owner/coordinator), the service (`event_service.admin_create_event`) ensures the Super Admin user has `verification_status='full'`, `account_status='active'`, and an `approved` row in `coordinator_profiles` (auto-creating/approving `CoordinatorProfiles` in the same transaction before inserting into `Events`), and then calls `event_service.create_event(...)` so **all existing event creation rules** (time windows, check-in window bounds, coordinate ranges, required 1–3 charity fields, initial `EventCoordinatorHistory` row) are strictly enforced!

### Rule B: "Neither Coordinator nor Volunteer can see who gave feedback or individual feedback rows — only the overall feedback summary in their dashboard"
* **Current Leak in Codebase:**
  * `backend/services/feedback_service.py` has `list_feedback_for_user(viewer, target_user_id, event_id)`:
    * Currently returns individual `Feedback` rows (ratings + comments + `event_id` + `created_at`).
    * Worse, if `viewer.id == row.from_user_id` or `viewer.is_staff`, line 179 attaches `item["from_user_id"] = row.from_user_id`!
    * Even when `from_user_id` is omitted, returning individual per-event comments/ratings allows a volunteer or coordinator who only worked with one coordinator/volunteer on an event to immediately deduce who rated them.
* **How to Enforce Strict Aggregate-Only Feedback Summary:**
  1. **Add `get_user_feedback_summary(user_id)` in `backend/services/feedback_service.py`:**
     * Computes only aggregate metrics across visible (`is_hidden=False`) feedback targeting `user_id`:
       * `total_feedback_count`
       * `overall_avg_rating` (rounded to 2 decimals)
       * `volunteer_to_coordinator` summary (`count`, `avg_overall`, `avg_communication`, `avg_support`, `avg_organization`)
       * `coordinator_to_volunteer` summary (`count`, `avg_overall`, `avg_punctuality`, `avg_attitude`, `avg_task_completion`)
       * `rating_distribution` (`{"5": n, "4": n, "3": n, "2": n, "1": n}`)
     * **Zero individual comments, zero `from_user_id`, zero `event_id` breakdown** exposed to volunteers or coordinators.
  2. **Lock down `list_feedback_for_user()` in `backend/services/feedback_service.py`:**
     * Non-admin users (volunteers and coordinators) calling `list_feedback_for_user()` or the feedback endpoint no longer receive individual rows or `from_user_id`; they receive **only** the aggregate summary object (or `list_feedback_for_user` is restricted strictly to `is_staff`/`is_superuser` for moderation, while the dashboard/feedback view returns `get_user_feedback_summary()`).

---

## 2. Master Execution Sequence for Antigravity Gemini Flash

Because Gemini Flash works best with **small, explicit, deterministic file scopes and exact code blocks**, feed the work to Antigravity in **6 sequential tasks (`TASK-01` through `TASK-06`)**. Never combine more than one task in a single prompt.

| Task ID | Name | Files Touched | Goal |
| :--- | :--- | :--- | :--- |
| **TASK-01** | **P0 Hygiene, Dependencies & Test Runner Hardening** | `.gitignore`, `backend/requirements/base.txt`, `backend/config/test_runner.py` | Fix P0-01, P0-02, and deterministic SQL test runner resolution |
| **TASK-02** | **Core Backend Stabilization (Settings, OTP, Route Cleanup, Maintenance)** | `backend/config/settings/base.py`, `backend/config/settings/production.py`, `backend/config/urls.py`, `backend/admin_portal/urls.py`, `backend/services/auth_service.py`, `backend/services/maintenance_service.py` | Fix P0-03, P1-01, P1-02, P1-03, P1-07, P1-08, P2-04 |
| **TASK-03** | **Anonymous Aggregate-Only Feedback Rule** | `backend/services/feedback_service.py`, `backend/bff/volunteer/views.py`, `backend/bff/coordinator/views.py` | Enforce that volunteers & coordinators only see overall feedback summary; never `from_user_id` or raw rows |
| **TASK-04** | **Super Admin Event Creation Rule** | `backend/services/event_service.py`, `backend/admin_portal/serializers.py`, `backend/admin_portal/views.py`, `backend/admin_portal/urls.py` | Allow Super Admin to create events following all event creation rules (`1..3` charity fields, valid windows, coordinator profile auto-provision) |
| **TASK-05** | **Database Seeding Management Command (`seed_demo_data`)** | `backend/apps/audit/management/commands/seed_demo_data.py` | Idempotent, trigger-compliant seed command populating Super Admin, Admin, Approved Coordinators, Verified Volunteers, Charity Fields, Events, Posts, Attendance, Geo Attempts, and Feedback |
| **TASK-06** | **Admin Portal Guards & Live HTML Dashboard Implementation** | `backend/admin_portal/views.py`, `backend/admin_portal/templates/admin_portal/dashboard.html`, `backend/admin_portal/templates/admin_portal/geo_monitoring.html`, `backend/admin_portal/templates/admin_portal/coordinator_board.html` | Fix P0-04: protect Admin HTML views, wire real database KPIs/tables into templates, and add Super Admin "Create Event" modal/form on the Admin Portal |

---

## 3. Detailed Step-by-Step Prompts for Antigravity Gemini Flash

Copy and paste each prompt below **one at a time** into Antigravity. Wait for verification before moving to the next prompt.

---

### PROMPT 1: `TASK-01` — Repo Hygiene, Dependencies & Test Runner Hardening

```text
You are working on Volunteer Coordination System v0.6.0 (Task ID: TASK-01).
HARD CONSTRAINTS:
- Do NOT modify any .sql file or database schema.
- Do NOT delete any existing files in backend/private_media/ (Rule 10: they are synthetic fixtures).
- Only modify the 3 files listed below.

STEP 1: Edit `.gitignore` at the repository root
Append the following rule under `# Django Media & Static`:
backend/private_media/
private_media/

STEP 2: Edit `backend/requirements/base.txt`
Add the two missing runtime dependencies at the end of `backend/requirements/base.txt`:
django-filter>=24.3,<25
cryptography>=43.0,<51

STEP 3: Edit `backend/config/test_runner.py`
Update `SqlFileTestRunner.setup_databases` so that:
1. `candidates` checks:
   - `Path(settings.BASE_DIR).parent / "postgres sql" / "updated_volunteer_coordination_system_Database.sql"`
   - `Path(settings.BASE_DIR).parent / "prompt code" / "spec" / "updated_volunteer_coordination_system_Database.sql"`
2. In the fallback glob, sort the files deterministically and exclude `self_test.sql`:
   `sql_files = [p for p in sorted(sql_dir.glob("*.sql")) if p.name != "self_test.sql"]`
3. If `sql_file` is still `None` or does not exist, raise `RuntimeError("SqlFileTestRunner: could not find updated_volunteer_coordination_system_Database.sql")` instead of silently skipping schema load.

VERIFY:
Run `python manage.py check` from `backend/` and report `git diff` on those 3 files. Confirm no `.sql` file was changed.
```

---

### PROMPT 2: `TASK-02` — Core Backend Stabilization (OTP, Settings, Admin URL Deduplication & Maintenance)

```text
You are working on Volunteer Coordination System v0.6.0 (Task ID: TASK-02).
HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Do NOT modify BFF routes or domain models.
- Only modify the exact files listed below.

STEP 1: Fix double-prefixed routes in `backend/admin_portal/urls.py` and mount OpenAPI routes in `backend/config/urls.py` (P1-07, P1-08)
1. In `backend/admin_portal/urls.py`:
   Remove lines 53–65 (the duplicate `path('api/v1/admin/...', ...)` entries that cause `/api/v1/admin/api/v1/admin/...` double paths when `admin_portal.urls` is included at `api/v1/admin/`). Keep all standard relative paths (`dashboard/`, `verifications/`, `coordinators/`, `moderation/`, `feedback/<int:feedback_id>/hide/`, `audit/`, `events/<int:event_id>/geo-attempts/`, `events/<int:event_id>/handover-history/`, `maintenance/run/`).
2. In `backend/config/urls.py`:
   Mount `drf_spectacular.views.SpectacularAPIView` at `api/schema/` and `SpectacularSwaggerView` at `api/docs/`.

STEP 2: Fix OTP Delivery Adapter status honesty in `backend/services/auth_service.py` (P0-03)
1. In `ConsoleOtpDeliveryAdapter.deliver()`, check `getattr(settings, "OTP_CONSOLE_PASSTHROUGH", settings.DEBUG)`:
   - In local/debug mode (`True`), log a dev message (without logging raw plaintext OTP in production) and return `{"delivered": True, "method": "console", "provider_configured": True}`.
   - In production when no SMS provider is configured (`False`), return `{"delivered": False, "method": "console", "provider_configured": False}`.
2. In `request_login_otp()`, include `"delivery": delivery_result` in the returned dictionary so callers and tests can inspect delivery state without breaking existing `"status": "sent"` contract.

STEP 3: Harden Settings & Throttling in `backend/config/settings/base.py` and `backend/config/settings/production.py` (P1-01, P1-02, P1-03, P1-05)
1. In `backend/config/settings/base.py`:
   - Change `CORS_ALLOW_ALL_ORIGINS = True` to read from env: `CORS_ALLOW_ALL_ORIGINS = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'True' if DEBUG else 'False').lower() in ('true', '1')` and add `CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]`.
   - In `REST_FRAMEWORK`, add rate configurations under `'DEFAULT_THROTTLE_RATES': {'anon': '60/min', 'user': '300/min'}`.
2. In `backend/config/settings/production.py`:
   - Enforce fail-fast validation if `SECRET_KEY`, `PHONE_HASH_HMAC_SECRET`, or `PHONE_ENCRYPTION_KEY` is missing or equals the insecure fallback string from `base.py` (raise `ImproperlyConfigured`).
   - Add `SECURE_CONTENT_TYPE_NOSNIFF = True`, `X_FRAME_OPTIONS = 'DENY'`, `SESSION_COOKIE_HTTPONLY = True`, and env-configurable `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE`.

STEP 4: Implement `execute_refresh_coordinator_aggregates` in `backend/services/maintenance_service.py` (P2-04)
Replace the no-op `return 0` in `execute_refresh_coordinator_aggregates()` with a query that counts active `CoordinatorProfiles` and verifies their aggregate rating/attendance fields against the database, returning the count of inspected coordinator profiles.

VERIFY:
Run `python manage.py check` and `python manage.py test common.tests.test_common_infrastructure`. Confirm exit code 0 and zero SQL changes.
```

---

### PROMPT 3: `TASK-03` — Anonymous Aggregate-Only Feedback Summary Rule

```text
You are working on Volunteer Coordination System v0.6.0 (Task ID: TASK-03).
HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Preserve existing feedback submission (`submit_feedback`) and admin moderation (`hide_feedback`) logic.

BUSINESS RULE TO IMPLEMENT:
Neither a Coordinator nor a Volunteer may see who gave feedback (`from_user_id`) or view individual feedback rows/comments about themselves. The only thing a Volunteer or Coordinator can see is their overall aggregate feedback summary on their dashboard.

STEP 1: Edit `backend/services/feedback_service.py`
1. Add a new function `get_user_feedback_summary(target_user_id: int) -> dict`:
   - Query `Feedback.objects.filter(to_user_id=target_user_id, is_hidden=False)`.
   - Use Django `aggregate(Count, Avg)` to compute:
     - `user_id`: `target_user_id`
     - `total_count`: total visible feedback count
     - `overall_avg_rating`: rounded `Avg("overall_rating")` (or `None` if 0 rows)
     - `as_volunteer`: stats for `feedback_type="coordinator_to_volunteer"` (`count`, `avg_overall`, `avg_punctuality`, `avg_attitude`, `avg_task_completion`)
     - `as_coordinator`: stats for `feedback_type="volunteer_to_coordinator"` (`count`, `avg_overall`, `avg_communication`, `avg_support`, `avg_organization`)
     - `rating_distribution`: counts for ratings 1 through 5 (`{"1": c1, "2": c2, "3": c3, "4": c4, "5": c5}`)
   - Ensure NO `from_user_id`, NO `event_id`, and NO individual `comment` strings are included in this summary.
2. Update `list_feedback_for_user(viewer, target_user_id: int, event_id: int | None = None)`:
   - Never expose `from_user_id` to non-admin users under any condition.
   - If `not (getattr(viewer, "is_staff", False) or getattr(viewer, "is_superuser", False))`:
     do NOT return individual `Feedback` rows or comments; return `[get_user_feedback_summary(target_user_id)]` or restrict raw row listing strictly to admins.

STEP 2: Update Volunteer & Coordinator Feedback/Dashboard Views
1. Inspect `backend/bff/volunteer/views.py` and `backend/bff/coordinator/views.py` where feedback is fetched for the logged-in user or target user.
2. Ensure that GET requests for feedback by a volunteer or coordinator return the aggregate summary from `feedback_service.get_user_feedback_summary(request.user.id)` under `"summary"` and never leak `from_user_id` or individual reviewer identities.

STEP 3: Add Focused Unit/Service Tests
In `backend/apps/audit/tests/test_unit_feedback_moderation.py` (or `test_services_phase8.py`), add a test verifying:
- `get_user_feedback_summary` returns accurate averages and counts without `from_user_id` or comments.
- Neither a volunteer nor a coordinator can see `from_user_id` when querying feedback.

VERIFY:
Run `python manage.py test apps.audit.tests` and report full output.
```

---

### PROMPT 4: `TASK-04` — Super Admin Event Creation Feature

```text
You are working on Volunteer Coordination System v0.6.0 (Task ID: TASK-04).
HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Super Admin event creation MUST follow all PostgreSQL and service-layer event creation rules:
  1. `owner_id` and `current_coordinator_id` must reference an `approved` row in `coordinator_profiles` whose user is `active` and has `verification_status = 'full'` (enforced by SQL trigger `trg_events_before_insert_update`).
  2. `1..3` valid active `charity_field_ids` must be linked before recruitment/publication.
  3. Event time bounds (`end_time > start_time`, valid `checkin_open_minutes_before` and `checkin_close_minutes_after`, valid `venue_lat`/`venue_lng` and `geofence_radius_m` between 50 and 2000) must be validated.
  4. Initial `EventCoordinatorHistory` row must be recorded.

STEP 1: Add `admin_create_event` in `backend/services/event_service.py`
Create a function `admin_create_event(admin_user, *, data: dict, owner_user_id: int | None = None) -> Events`:
1. Verify `admin_user.is_superuser` (raise `InsufficientPrivilegeError("Only a Super Admin can create events via the Admin Portal.")` if not).
2. Determine the target `owner_user`:
   - If `owner_user_id` is provided, fetch `Users.objects.get(pk=owner_user_id)`. Verify they have an `approved` `CoordinatorProfiles` record, `account_status == "active"`, and `verification_status == "full"`.
   - If `owner_user_id` is `None` (Super Admin is creating the event under their own ownership):
     Ensure `admin_user` satisfies the SQL trigger prerequisites inside the transaction:
     - If `admin_user.verification_status != "full"`, update `Users.objects.filter(pk=admin_user.pk).update(verification_status="full", account_status="active")` and refresh `admin_user`.
     - Ensure `CoordinatorProfiles.objects.update_or_create(user_id=admin_user.pk, defaults={"coordinator_status": "approved", "approved_by_id": admin_user.pk, "approved_at": timezone.now()})`.
3. Delegate to the canonical `create_event(user=owner_user, data=data)` function so every single event creation validation rule, `EventCharityFields` creation (`1..3` charity fields), and `EventCoordinatorHistory` logging is executed identically to standard event creation.
4. Write an audit log entry (`action_type="admin.event_create"`, `target_type="event"`, `target_id=event.id`) recording that `admin_user.id` created the event.

STEP 2: Add Serializer and View in `backend/admin_portal/`
1. In `backend/admin_portal/serializers.py`:
   Add `AdminEventCreateSerializer(AllowListSerializerMixin, serializers.Serializer)` with fields:
   - `title` (`CharField(max_length=200)`)
   - `description` (`CharField(required=False, allow_blank=True, allow_null=True)`)
   - `category` (`CharField(required=False, allow_blank=True, allow_null=True)`)
   - `start_time` (`DateTimeField()`)
   - `end_time` (`DateTimeField()`)
   - `venue_name` (`CharField(required=False, allow_blank=True, allow_null=True)`)
   - `venue_address` (`CharField(required=False, allow_blank=True, allow_null=True)`)
   - `venue_lat` (`DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)`)
   - `venue_lng` (`DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)`)
   - `geofence_radius_m` (`IntegerField(required=False, min_value=50, max_value=2000, default=150)`)
   - `checkin_open_minutes_before` (`IntegerField(required=False, min_value=0, max_value=720, default=30)`)
   - `checkin_close_minutes_after` (`IntegerField(required=False, min_value=0, max_value=720, default=60)`)
   - `Waitlist_enabled` / `waitlist_enabled` (`BooleanField(required=False, default=True)`)
   - `auto_assign_enabled` (`BooleanField(required=False, default=False)`)
   - `Minimum_verification_tier` / `minimum_verification_tier` (`ChoiceField(choices=["none", "light", "full"], default="none")`)
   - `briefing_text` (`CharField(required=False, allow_blank=True, allow_null=True)`)
   - `safety_notes` (`CharField(required=False, allow_blank=True, allow_null=True)`)
   - `skill_tags` (`ListField(child=serializers.CharField(), required=False, default=list)`)
   - `charity_field_ids` (`ListField(child=serializers.IntegerField(), min_length=1, max_length=3)`)
   - `owner_user_id` (`IntegerField(required=False, allow_null=True)`)
2. In `backend/admin_portal/views.py`:
   Add `AdminEventListCreateView(APIView)`:
   - `GET`: calls `ensure_admin(request)` and lists events from `VEventSummary` (ordered by `-start_time`).
   - `POST`: calls `ensure_admin(request, require_superuser=True)`, validates `AdminEventCreateSerializer`, calls `event_service.admin_create_event(...)`, and returns HTTP 201 with the created event data.
3. In `backend/admin_portal/urls.py`:
   Mount `path('events/', views.AdminEventListCreateView.as_view(), name='api_events_list_create')`.

STEP 3: Add Tests
In `backend/apps/audit/tests/test_api_admin_portal_phase8.py`, add tests confirming:
- Super Admin (`is_superuser=True`) can `POST /api/v1/admin/events/` with valid charity fields and time bounds and receives `201 Created`.
- Regular staff (`is_staff=True, is_superuser=False`) is rejected with `404` (per `ensure_admin(require_superuser=True)` masking).
- Invalid charity field count (`0` or `4`) or `end_time <= start_time` is rejected with `400 Bad Request`.

VERIFY:
Run `python manage.py test apps.audit.tests.test_api_admin_portal_phase8` and report full output.
```

---

### PROMPT 5: `TASK-05` — Comprehensive Database Seeding Command (`seed_demo_data`)

```text
You are working on Volunteer Coordination System v0.6.0 (Task ID: TASK-05).
HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- All seeded data MUST respect PostgreSQL triggers, constraints, and `set_db_session_context` / `set_system_actor_context` so `audit_logs` and trigger checks succeed without errors.

TASK:
Create a Django management command `backend/apps/audit/management/commands/seed_demo_data.py` so running `python manage.py seed_demo_data` populates a rich, realistic dataset for the Admin Portal and API testing.

REQUIREMENTS FOR `seed_demo_data.py`:
1. Wrap execution in `service_transaction()` and call `set_system_actor_context()`. Make it idempotent (use `get_or_create` / `update_or_create` keyed by deterministic phone hashes or slugs so running it twice does not crash).
2. Seed Users (`apps.accounts.models.Users`) using `compute_phone_hash` and `encrypt_phone` from `common.security`:
   - 1 Super Admin (`+959100000001`, `full_name="System Super Admin"`, `is_staff=True`, `is_superuser=True`, `verification_status="full"`, `account_status="active"`) + DRF `Token`.
   - 1 Staff Admin (`+959100000002`, `full_name="Operations Admin"`, `is_staff=True`, `is_superuser=False`, `verification_status="full"`, `account_status="active"`) + DRF `Token`.
   - 3 Coordinators:
     - 2 Approved Coordinators (`+959100000011`, `+959100000012`, `verification_status="full"`, `CoordinatorProfiles.coordinator_status="approved"`).
     - 1 Pending Coordinator applicant (`+959100000013`, `verification_status="full"`, `CoordinatorProfiles.coordinator_status="pending"`).
   - 6 Volunteers (`+959100000021` to `+959100000026`):
     - 4 with `verification_status="full"`, 1 with `verification_status="light"` and a `pending` `UserVerificationImages` row (so Admin Verification Queue has items to review), and 1 with a warning/moderation record.
3. Verify `CharityFields` exist (the SQL schema already seeds 10 charity fields; verify or ensure at least 3 active `CharityFields` exist).
4. Seed 4 Events (`Events` + `EventCharityFields` + `EventCoordinatorHistory` + `EventPosts`):
   - Event 1: `active` event happening now (with `venue_lat=16.8409`, `venue_lng=96.1735`, `geofence_radius_m=200`), 2 posts, confirmed assignments, attendance records, and 2 `AttendanceGeoAttempts` rows (1 within geofence, 1 outside geofence with `review_status="pending"` so the Admin Geo Monitoring view has live data).
   - Event 2: `published` upcoming event (`start_time` in +3 days) with open posts and pending volunteer applications.
   - Event 3: `completed` past event with checked-out attendance and two-way `Feedback` rows (`volunteer_to_coordinator` and `coordinator_to_volunteer`) so aggregate feedback summaries and Admin moderation queues have live data.
   - Event 4: `draft` event created by Super Admin via `event_service.admin_create_event`.
5. Print a clean summary table to stdout at the end of `seed_demo_data` showing:
   - Created user roles, phone numbers, and DRF Auth Tokens for instant API testing
   - Counts of Events, Posts, Applications, Assignments, Geo Attempts, Verification Queue items, and Feedback rows.

VERIFY:
Run `python manage.py seed_demo_data` twice in a row to prove idempotency and report full command output.
```

---

### PROMPT 6: `TASK-06` — Admin Portal Security Guards, Live Data Context & Super Admin Event Creation UI

```text
You are working on Volunteer Coordination System v0.6.0 (Task ID: TASK-06).
HARD CONSTRAINTS:
- Do NOT modify any .sql file.
- Fix P0-04 (Admin HTML views unguarded & static templates) and wire the new Super Admin Event Creation feature into the Admin Dashboard UI.

STEP 1: Secure and Populate HTML Views in `backend/admin_portal/views.py`
Update `dashboard_view`, `geo_monitoring_view`, and `coordinator_board_view` in `backend/admin_portal/views.py`:
1. Guard all 3 views with `ensure_admin(request)` (or redirect unauthenticated browser requests to Django admin login `/django-admin/login/?next=...` if not authenticated, and call `ensure_admin(request)` once authenticated so non-admin users receive 404).
2. Populate real database context in `dashboard_view(request)`:
   - `kpis`: `query_service.get_admin_dashboard_kpis()` (from `v_admin_dashboard`)
   - `recent_events`: `VEventSummary.objects.all().order_by("-start_time")[:10]`
   - `pending_verifications`: `verification_service.list_pending_verifications()[:10]`
   - `charity_fields`: `CharityFields.objects.filter(is_active=True).order_by("display_order", "name")`
   - `approved_coordinators`: `CoordinatorProfiles.objects.select_related("user").filter(coordinator_status="approved")`
   - `recent_audit_logs`: `AuditLogs.objects.all().order_by("-created_at")[:15]` if `request.user.is_superuser` else `[]`
   - `is_superuser`: `bool(request.user.is_superuser)`
3. Handle `POST` in `dashboard_view(request)` (or via fetch to `/api/v1/admin/events/`) so a Super Admin can submit the "Create Event" form directly from the dashboard, calling `event_service.admin_create_event(request.user, data=..., owner_user_id=...)` and showing a success message.
4. Populate real database context in `geo_monitoring_view(request)`:
   - `geo_attempts`: `VGeoAttemptsReview.objects.all().order_by("-attempted_at")[:50]`
   - `active_events`: `Events.objects.filter(status__in=["published", "active"]).order_by("-start_time")`
5. Populate real database context in `coordinator_board_view(request)`:
   - `pending_coordinators`: `coordinator_service.list_coordinator_applications(status_filter="pending")`
   - `approved_coordinators`: `coordinator_service.list_coordinator_applications(status_filter="approved")`
   - `handover_history`: `VEventCoordinatorHistory.objects.all().order_by("-assigned_at")[:25]`

STEP 2: Update Templates (`dashboard.html`, `geo_monitoring.html`, `coordinator_board.html`)
1. In `backend/admin_portal/templates/admin_portal/dashboard.html`:
   - Replace hardcoded numbers (`12`, `480`, `24`) with live template variables from `kpis` (`{{ kpis.active_events|default:0 }}`, `{{ kpis.active_volunteers|default:0 }}`, `{{ kpis.pending_verifications|default:0 }}`, `{{ kpis.pending_coordinators|default:0 }}`, `{{ kpis.pending_geo_reviews|default:0 }}`).
   - Add a live "Events Overview" table rendering `recent_events`.
   - If `is_superuser` is true, render a "Create New Event (Super Admin)" form/modal that posts all required fields (`title`, `start_time`, `end_time`, `venue_name`, `venue_lat`, `venue_lng`, `geofence_radius_m`, `charity_field_ids` checkboxes 1..3, and optional `owner_user_id` selector) and validates them via `admin_create_event`.
   - Add a live "Pending Verification Reviews" section rendering `pending_verifications`.
2. In `backend/admin_portal/templates/admin_portal/geo_monitoring.html`:
   - Render a live table of `geo_attempts` showing volunteer name, event ID, distance in meters vs geofence radius, failure reason, review status, and timestamp.
3. In `backend/admin_portal/templates/admin_portal/coordinator_board.html`:
   - Render live tables for `pending_coordinators` (with Approve/Reject actions), `approved_coordinators`, and recent `handover_history`.

STEP 3: Add Tests for Admin HTML Views
In `backend/apps/audit/tests/test_api_admin_portal_phase8.py`, add tests verifying:
- Anonymous or non-admin requests to `/api/v1/admin/ui/dashboard/`, `/api/v1/admin/ui/geo-monitoring/`, and `/api/v1/admin/ui/coordinators/` are blocked (404 or redirect to login).
- Authenticated admin requests receive `200 OK` with live context keys (`kpis`, `recent_events`, `geo_attempts`, `pending_coordinators`).

VERIFY:
Run `python manage.py test apps.audit.tests.test_api_admin_portal_phase8` and report full output.
```

---

## 4. Verification & Acceptance Checklist (Final Gate)

Before marking the backend & admin portal sprint complete, run this final verification command suite in Antigravity:

1. **Frozen SQL Integrity Check:**
   ```powershell
   git status -- "postgres sql/" "prompt code/spec/"
   git diff -- "postgres sql/" "prompt code/spec/"
   ```
   *Expected:* Zero output (SQL prototype is 100% untouched).
2. **System Check & OpenAPI Schema Check:**
   ```powershell
   python manage.py check
   python manage.py spectacular --file schema_check.yml
   ```
   *Expected:* Zero double-prefixed `/api/v1/admin/api/v1/admin/` routes in `schema_check.yml`.
3. **Database Seeding Verification:**
   ```powershell
   python manage.py seed_demo_data
   ```
   *Expected:* Clean creation of Super Admin, Coordinators, Volunteers, Events, Posts, Attendance, Geo Attempts, and Feedback without trigger violations.
4. **Full Automated Test Suite:**
   ```powershell
   python manage.py test
   ```
   *Expected:* All unit, service, DB trigger, and Admin Portal tests pass.