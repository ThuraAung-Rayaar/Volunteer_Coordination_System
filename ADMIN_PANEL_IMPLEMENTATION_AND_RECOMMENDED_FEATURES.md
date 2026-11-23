# Volunteer Coordination System — Admin Panel Architecture, Current Implementation & Strategic Roadmap

**Document Status:** Comprehensive Specification & Gap Analysis  
**System Version:** v0.12.0 Stabilization (Database Frozen Contract) / Admin Portal v2.0  
**Target Roles:** Super Administrators, Operations Managers, Field Directors, System Architects  
**Accompanying Consolidated Codebase:** [ADMIN_SIDE_UI_ALL_CODE_APPENDED.html](ADMIN_SIDE_UI_ALL_CODE_APPENDED.html) | [ADMIN_SIDE_UI_ALL_CODE_APPENDED.txt](ADMIN_SIDE_UI_ALL_CODE_APPENDED.txt)

---

## Executive Summary

The **Volunteer Coordination System (VCS) Admin Portal** serves as the central mission-control operations console for managing non-profit and humanitarian volunteer human resources. Built upon a **Database-First** philosophy with PostgreSQL 18.6, Django 5.x, Tailwind CSS, Leaflet.js, and a custom offline map streaming engine, it provides administrators with complete visibility and authority over volunteer onboarding, coordinator credentialing, event logistics, real-time geofence compliance, and audit governance.

This document delivers a dual-purpose analysis:
1. **Complete Implementation Inventory:** A granular audit of every screen, view, controller, security mechanism, and database integration currently running in production.
2. **Comprehensive Enhancement Roadmap:** An exhaustive specification of operational gaps, missing human resource workflows, security additions, communication utilities, and reporting engines that should be integrated into the Admin Panel to achieve enterprise-grade maturity.

---

## 1. System Architecture & Foundation

```
+--------------------------------------------------------------------------------------------------+
|                                    SUPER ADMIN CONTROL CENTER                                    |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+  |
|  |     Dashboard      |  | Events & Geo Maps  |  |  Users Directory   |  | Coordinator Board  |  |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+  |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+  |
|  |   Geo Monitoring   |  |    Feedback Hub    |  |  Settings & Maint  |  | Map Tile Streaming |  |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+  |
+--------------------------------------------------------------------------------------------------+
                                                 |
                   +-----------------------------+-----------------------------+
                   |                                                           |
+--------------------------------------+                   +--------------------------------------+
|        Template Views (HTML)         |                   |         Administrative REST          |
| - Django Server-Side Rendering       |                   | - JSON API endpoints for HTMX/Fetch  |
| - Tailwind CSS + Leaflet 1.9.4       |                   | - In-memory AES-256-GCM Decryption   |
| - VCSMapEngine (15 ASEAN/MM regions) |                   | - Session Auth + CSRF Protection     |
+--------------------------------------+                   +--------------------------------------+
                   |                                                           |
                   +-----------------------------+-----------------------------+
                                                 |
+--------------------------------------------------------------------------------------------------+
|                            BACKEND INFRASTRUCTURE & CONTEXT INJECTION                            |
|  - DbContextMiddleware: SET LOCAL app.user_id = %s, app.ip = %s                                   |
|  - Zero-Knowledge Phone Lookup: HMAC-SHA256 search hash vs AES-256 encrypted display             |
|  - Role-Based Guards: _guard_admin_html (is_admin / is_superuser)                                |
+--------------------------------------------------------------------------------------------------+
                                                 |
+--------------------------------------------------------------------------------------------------+
|                       POSTGRESQL 18.6 FROZEN DATABASE CORE (IMMUTABLE)                           |
|  - 31 Base Tables (users, events, assignments, attendance, attendance_geo_attempts, etc.)       |
|  - 11 Optimized SQL Views (v_admin_dashboard, v_geo_attempts_review, v_event_summary, etc.)       |
|  - 63 Stored Procedures & Triggers (geo_check_in, run_auto_assignment, run_maintenance, etc.)   |
+--------------------------------------------------------------------------------------------------+
```

### 1.1 Core Technology Stack
- **Backend Framework:** Django 5.x with Django REST Framework (DRF) 3.15.
- **Database Engine:** PostgreSQL 18.6 with `btree_gist`, native `uuidv7()`, and row-level audit triggers.
- **Presentation Layer:** Server-Rendered Django Templates (11 HTML templates) styled with Tailwind CSS (CDN) and extended with dark-mode palette (`slate-850`, `slate-950`).
- **Geospatial & Mapping:** Leaflet 1.9.4 with custom client singleton `VCSMapEngine` serving 15 offline MBTiles regional databases covering Myanmar and ASEAN macro layers.
- **Security & Privacy:** 
  - Zero-Knowledge phone privacy: Normalized E.164 phone numbers are hashed with HMAC-SHA256 (`phone_hash`) for database lookups and encrypted with AES-256 (`phone_enc`) for display. Raw phone numbers are never stored in plaintext.
  - Verification image envelope encryption: KYC verification images are stored encrypted with AES-256-GCM (`VIMG` 48-byte header, AAD authenticated) and decrypted strictly in-memory during admin review sessions.
  - Database context propagation: `DbContextMiddleware` automatically injects `SET LOCAL app.user_id` and `SET LOCAL app.ip` for every transaction, binding database-level triggers directly to the active administrator session.

---

## 2. Granular Inventory of What Is Currently Implemented

The Admin Portal currently comprises **11 HTML Template Views**, backed by **17 Administrative API View Controllers** in `admin_portal/views.py` and `admin_portal/map_views.py`. Below is the complete breakdown of every implemented component:

### 2.1 Master Layout & Navigation Shell (`base_admin.html`)
- **Global Sticky Header:**
  - System title: *"Volunteer Coordination System"* with version indicator `v0.6.0`.
  - Dynamic role badge: Glowing pulse indicator distinguishing `Super Admin` (amber) from `Staff Admin` (sky blue).
  - Admin identity card: Displays admin `display_name` and unique database ID (`ID #...`).
  - Session termination: Direct `Logout` button routing to `/api/v1/admin/ui/logout/`.
- **8-Tab Sticky Navigation Bar:**
  - Tab 1: **Dashboard** (`/api/v1/admin/ui/dashboard/`)
  - Tab 2: **Create Event** (`/api/v1/admin/ui/event-create/`) *(Super Admin restricted)*
  - Tab 3: **Events & Geo Map** (`/api/v1/admin/ui/events/`)
  - Tab 4: **Users Directory** (`/api/v1/admin/ui/users/`)
  - Tab 5: **Provision User** (`/api/v1/admin/ui/user-create/`) *(Super Admin restricted)*
  - Tab 6: **Coordinator Board** (`/api/v1/admin/ui/coordinators/`)
  - Tab 7: **Feedback** (`/api/v1/admin/ui/feedback/`)
  - Tab 8: **Settings** (`/api/v1/admin/ui/settings/`)
- **Global Toast Alerts:** Built-in dismissible banners for `success_message` (emerald) and `error_message` (rose).
- **VCSMapEngine Client Singleton:**
  - Pre-configured coordinate and zoom bounds for 15 administrative regions (Yangon, Mandalay, Bago, Central Dry Zone/Bagan, Ayeyarwady, Sagaing, Tanintharyi, Rakhine, Shan, Kachin, Chin, Mon/Kayin, Kayah, Naypyidaw, and ASEAN Macro).
  - Tile layer fallback logic: Auto-switches to offline SVG/tile cache on network interruptions.
  - Leaflet custom control: Interactive top-right region fly-to dropdown.

---

### 2.2 Authentication & Identity Portal (`login.html`)
- **Route:** `GET/POST /api/v1/admin/ui/login/`
- **Controller:** `admin_login_view(request)`
- **Implemented Capabilities:**
  - Form-based administrator credential verification.
  - Zero-Knowledge phone hashing: Client or backend transforms input phone number into deterministic HMAC-SHA256 for user table lookup.
  - OTP Verification Pipeline: Supports tokenized OTP authentication handshake as well as development passthrough (`OTP_CONSOLE_PASSTHROUGH=True`).
  - Strict Authorization Gate: Rejects authentication attempts if `is_admin=False` or `account_status != 'active'`.
  - Session Context Binding: Sets Django session keys `admin_user_id`, `admin_display_name`, `admin_phone_hash`, and initializes database session variables.
  - Visual Design: Dark slate branded login card with system security disclaimers and auto-focus phone input.

---

### 2.3 Super Admin Operations & Intelligence Dashboard (`dashboard.html`)
- **Route:** `GET /api/v1/admin/ui/dashboard/` & `/admin-dashboard/`
- **Controllers:** `dashboard_view(request)` & `AdminDashboardView.as_view()`
- **Backing Database View:** `v_admin_dashboard`
- **Implemented Capabilities:**
  - **6 High-Priority Metric Cards:**
    1. *Total Registered Users* (`total_users`)
    2. *Active Volunteers* (`active_volunteers`)
    3. *Active Events* (`active_events`)
    4. *Pending Coordinator Applications* (`pending_coordinators`)
    5. *Pending Verification Images* (`pending_verifications`)
    6. *Unconfirmed Check-Ins* (`unconfirmed_checkins`)
  - **Real-Time Interactive Geographic Map:** Embedded Leaflet map displaying active event coordinates and attendance density across Myanmar.
  - **Encrypted KYC Verification Review Modal:**
    - Live list of pending user verification images (`user_verification_images`).
    - Decryption on-the-fly: Streams raw JPEG bytes through `AdminVerificationImageFileView` decrypting AES-256-GCM payloads directly in RAM without writing unencrypted media to disk.
    - Quick actions: One-click *Approve* or *Reject* with mandatory administrative feedback.
  - **Recent Audit Activity Feed:** Displays the latest administrative actions from `audit_logs` (actor ID, table name, operation type, and timestamps).
  - **System Maintenance Trigger:** Direct button executing `run_maintenance()` stored procedure to purge expired OTPs and unlock expired user blocks.

---

### 2.4 Event Operations Directory, Detail Drawer & Geographic Map (`events_detail.html`)
- **Route:** `GET /api/v1/admin/ui/events/`
- **Controllers:** `events_detail_and_geo_view(request)`, `AdminEventListCreateView`, `AdminEventActionView`
- **Backing Database Views:** `v_event_summary`, `v_event_post_capacity`
- **Implemented Capabilities:**
  - **Lifecycle Filtering:** Tabs and dropdowns to filter events by status: `all`, `draft`, `published`, `active`, `completed`, `cancelled`.
  - **Search & Pagination:** Case-insensitive search across event titles, locations, and coordinator names.
  - **Events Operational Table:**
    - Status badges with distinct styling (`published`=emerald, `active`=blue, `draft`=amber, `cancelled`=rose).
    - Event timeframe (start/end dates with localized formatting).
    - Current Coordinator assignment with handover badge.
    - Volunteer capacity and spots remaining.
  - **Event Detail Sliding Drawer / Modal:**
    - Displays full event description, location address, and GPS coordinates.
    - Post Capacity Accordion: Breakdown of every post slot (`event_posts`), accepted count, capacity limit, and spot availability.
  - **Event Lifecycle Actions:** Direct buttons to trigger state machine transitions: *Publish*, *Activate*, *Complete*, *Cancel*, and *Soft Delete / Restore*.

---

### 2.5 Event Provisioning & Post Slot Creation Wizard (`event_create.html`)
- **Route:** `GET/POST /api/v1/admin/ui/event-create/`
- **Controller:** `event_create_tab_view(request)`
- **Access Control:** Restricted strictly to Super Administrators (`is_superuser=True`).
- **Implemented Capabilities:**
  - **Basic Event Metadata:** Title, detailed description, start date/time, and end date/time.
  - **Charity Category Selector:** Multi-select checkboxes populated dynamically from `charity_fields` table (Disaster Relief, Education, Healthcare, Environment, etc.).
  - **Interactive Geolocation Pin Picker:**
    - Integrated Leaflet map with draggable pin.
    - Clicking the map automatically populates latitude, longitude, and geofence radius in meters (default: 200m).
    - Region jump dropdown to immediately center the map on any Myanmar division.
  - **Dynamic Post Slots Builder:**
    - JavaScript repeater enabling admins to add multiple post roles (e.g. "Lead Medic", "Logistics Driver", "Crowd Marshal").
    - Individual capacity thresholds and required skill tags per post slot.
  - **Coordinator Assignment:** Dropdown selecting an approved coordinator to assign as initial event owner.

---

### 2.6 Users Directory & Volunteer Governance (`users.html`)
- **Route:** `GET /api/v1/admin/ui/users/`
- **Controllers:** `users_directory_view(request)`, `AdminUserActionView`, `AdminModerationSummaryView`
- **Backing Database Views:** `users`, `v_user_moderation_summary`
- **Implemented Capabilities:**
  - **Directory Search & Filter:** Search by display name, user ID, or role (`all`, `volunteer`, `coordinator`, `admin`).
  - **Zero-Knowledge Phone Hash Lookup Tool:** Interactive input allowing admins to input a phone number, compute its HMAC-SHA256, and locate the obfuscated account.
  - **User Governance Table:**
    - User display name and ID.
    - Role badges (Super Admin, Staff Admin, Coordinator, Volunteer).
    - Verification status indicator (`is_verified` true/false with green checkmark).
    - Account state badges (`active`=green, `blocked`=rose, `closed`=slate).
    - Moderation warning counters (`warning_count`, `block_count` from `v_user_moderation_summary`).
  - **User Moderation Action Modal:**
    - Perform actions: *Warn User*, *Block Account*, *Unblock Account*, *Close Account*, *Reinstate Account*.
    - Mandatory reason text field recorded directly into `moderation_actions` audit table.

---

### 2.7 Manual User Provisioning Form (`user_create.html`)
- **Route:** `GET/POST /api/v1/admin/ui/user-create/`
- **Controller:** `user_provision_view(request)`
- **Access Control:** Restricted strictly to Super Administrators (`is_superuser=True`).
- **Implemented Capabilities:**
  - Direct administrative onboarding of personnel.
  - Automatic Phone Normalization: Form accepts local format (e.g. `09...`) and normalizes to standard international E.164 (`+959...`).
  - Automatic HMAC & Encryption: Computes SHA-256 HMAC lookup key and AES-256 encrypted payload before inserting to `users` table.
  - Role Assignment: Option to grant `is_admin`, `is_superuser`, or initialize coordinator profile application.
  - Verification Bypass: Option to pre-verify trusted personnel without requiring document upload.

---

### 2.8 Real-Time Geolocation & Check-In Auditing Console (`geo_monitoring.html`)
- **Route:** `GET /api/v1/admin/ui/geo-monitoring/`
- **Controllers:** `geo_monitoring_view(request)`, `AdminGeoMonitoringView.as_view()`
- **Backing Database Objects:** `attendance_geo_attempts`, `v_geo_attempts_review`, `geo_check_in()` stored procedure
- **Implemented Capabilities:**
  - **Audit Table of Geo-Attendance Attempts:**
    - Event title and volunteer display name.
    - Check-in timestamp and client device accuracy (meters).
    - Computed Haversine distance from event geofence center.
    - Spoofing Indicator: Flags check-ins where `is_mocked=True` (mock GPS detection).
  - **13 Result Code Classifications:** Displays outcome from PostgreSQL domain rules:
    - `ok` (Valid check-in within radius)
    - `outside_radius` (Exceeded geofence perimeter)
    - `accuracy_insufficient` (GPS error radius too wide)
    - `mock_location_rejected` (Fake GPS app detected)
    - `event_not_active`, `no_confirmed_assignment`, `already_checked_in`, etc.
  - **Geographic Visualizer:** Leaflet map highlighting event perimeter circle and plotting valid pins (green) vs rejected attempts (red).

---

### 2.9 Coordinator Applications & Accreditation Governance Board (`coordinator_board.html`)
- **Route:** `GET /api/v1/admin/ui/coordinators/` & `/api/v1/admin/ui/coordinator-board/`
- **Controllers:** `coordinator_board_view(request)`, `AdminPendingCoordinatorsView`, `AdminCoordinatorDecisionView`, `AdminCoordinatorHistoryView`
- **Backing Database Tables:** `coordinator_profiles`, `event_coordinator_history`
- **Implemented Capabilities:**
  - **Pending Applications Queue:**
    - Displays volunteer applications seeking coordinator status.
    - Shows application timestamp, volunteer experience statement, organization affiliations, and emergency contact details.
  - **Accreditation Action Buttons:**
    - *Approve Application*: Grants coordinator status, creates approval audit trail.
    - *Reject Application*: Rejects with documented explanation.
    - *Suspend / Revoke*: Immediately strips coordinator privileges and logs event handover requirements.
  - **Coordinator Assignment & Handover History:**
    - Historical timeline of event handovers (`event_coordinator_history`).
    - Tracks original event owner, transfer recipient, transfer reason, and handover timestamp.

---

### 2.10 360-Degree Feedback & Sentiment Intelligence Console (`feedback.html`)
- **Route:** `GET /api/v1/admin/ui/feedback/`
- **Controllers:** `feedback_intelligence_view(request)`, `AdminFeedbackListView`, `AdminHideFeedbackView`
- **Backing Database Tables:** `feedback`
- **Implemented Capabilities:**
  - **Tri-Directional Feedback Categorization:**
    1. *Volunteer &rarr; Event* (Experience, safety, logistics)
    2. *Coordinator &rarr; Volunteer* (Reliability, task execution, punctuality)
    3. *Volunteer &rarr; Coordinator* (Leadership, communication, support)
  - **Rating & Tag Breakdown:** Displays 1-to-5 star ratings, structured skill/behavior tags, and open-ended comments.
  - **Sentiment Badges:** Automated visual indicators of positive, neutral, or negative feedback tone.
  - **Feedback Moderation / Hiding:** One-click action to hide defamatory, abusive, or rule-violating feedback with mandatory audit reason logging (`AdminHideFeedbackView`).

---

### 2.11 System Parameters, Maintenance & Infrastructure Console (`settings.html`)
- **Route:** `GET /api/v1/admin/ui/settings/`
- **Controllers:** `admin_settings_view(request)`, `AdminRunMaintenanceView`
- **Backing Database Objects:** `app_settings` table, `run_maintenance()` SQL procedure
- **Implemented Capabilities:**
  - **Application Settings Key-Value Manager:**
    - View and modify system thresholds stored in `app_settings` (e.g. OTP expiry seconds, geofence radius default, auto-assignment weights, rate limits).
  - **Database Health & Size Telemetry:**
    - Total disk footprint (MB), active connection counts, live table row statistics.
  - **On-Demand Maintenance Executor:**
    - Direct button executing `SELECT run_maintenance()` to trigger automated cleanup:
      - Purges expired OTP codes and challenges (`purge_expired_otps()`).
      - Releases expired temporary account blocks (`release_expired_blocks()`).
      - Purges stale application drafts (`expire_stale_applications()`).
  - **Offline Map Cache Status:** Status of local MBTiles repositories and tile storage integrity.

---

### 2.12 Self-Hosted Offline Map Engine & Tile Server (`map_views.py`)
- **Routes:** 
  - `GET /api/v1/maps/catalog/`
  - `GET /api/v1/maps/tiles/<z>/<x>/<y>.png`
  - `GET /api/v1/maps/regions/<region_code>/download/`
  - `POST /api/v1/maps/sync/`
- **Controllers:** `map_catalog_api_view`, `map_tile_proxy_view`, `map_region_download_view`, `admin_map_sync_action_view`
- **Implemented Capabilities:**
  - **Asymmetric Offline Map Serving:** Streams OpenStreetMap vector/raster tiles directly from local `.mbtiles` SQLite files in `map/` directory.
  - **Coverage:** Complete offline coverage for Myanmar across 14 divisions and ASEAN macro view.
  - **Zero External Dependency:** When internet access is severed in disaster areas, maps continue rendering via local cache.
  - **Offline SVG Fallback:** Renders programmatic SVG grid tiles if requested coordinate is beyond local zoom boundaries.

---

## 3. Matrix: Implemented UI Features vs Backend & Database Capabilities

| Functional Area | Database Object / View | Backend Service | Admin UI Status | Current UI Scope / Limitation |
|---|---|---|:---:|---|
| **Admin Login & Auth** | `users`, `auth_otp`, `auth_otp_challenge` | `auth_service.py` | **Implemented** | Supports phone HMAC lookup + session cookie. No MFA app (TOTP) UI. |
| **System Overview KPI** | `v_admin_dashboard` | `query_service.py` | **Implemented** | Displays 6 primary KPIs. Real-time auto-refresh requires manual page reload. |
| **Verification Images** | `user_verification_images` | `verification_service.py` | **Implemented** | Streamed in-memory AES-256-GCM decrypt modal with approve/reject actions. |
| **Event Directory** | `v_event_summary` | `event_service.py` | **Implemented** | Filters by lifecycle status, post capacity accordion, and detail modal. |
| **Event Creation** | `events`, `event_posts`, `event_charity_fields` | `event_service.py` | **Implemented** | Leaflet pin picker, dynamic posts repeater. Super Admin only. |
| **User Directory** | `users`, `v_user_moderation_summary` | `profile_service.py` | **Implemented** | Search by name, phone HMAC lookup, role badges, moderation modal. |
| **User Provisioning** | `users`, `coordinator_profiles` | `profile_service.py` | **Implemented** | E.164 phone normalization, pre-verification toggle. |
| **Geo Monitoring** | `attendance_geo_attempts`, `v_geo_attempts_review` | `geo_service.py` | **Implemented** | 13 result codes, distance check, mock GPS flags, Leaflet pins. |
| **Coordinator Board** | `coordinator_profiles`, `event_coordinator_history` | `coordinator_service.py` | **Implemented** | Application review, approve/reject/suspend, handover history. |
| **Feedback Hub** | `feedback` | `feedback_service.py` | **Implemented** | 3-way feedback list, rating stars, hide feedback action. |
| **System Settings** | `app_settings`, `run_maintenance()` | `maintenance_service.py` | **Implemented** | Key-value settings editor, DB health stats, maintenance runner. |
| **Offline Map Engine** | `map/*.mbtiles`, `map_engine.py` | `common/map_engine.py` | **Implemented** | Tile proxy, regional selector, 15 Myanmar regions. |
| **Live Check-In Board** | `v_event_checkin_board`, `v_event_checkin_status` | `attendance_service.py` | **Backend Only** | Available to coordinators on mobile BFF; **Missing in Admin Portal UI**. |
| **Auto-Assignment Engine**| `run_auto_assignment()`, `assign_manually()` | `assignment_service.py` | **Backend Only** | SQL algorithm exists; **No admin UI to run or review matching**. |
| **QR Code Lifecycle** | `qr_tokens`, `consume_qr_token()` | `qr_service.py` | **Backend Only** | Token creation exists on mobile BFF; **No Admin UI to manage QR tokens**. |
| **Audit Log Explorer** | `audit_logs` (1,350+ entries) | `audit_service.py` | **Partial** | Only 5 recent items shown on Dashboard; **No full filterable Explorer UI**. |
| **Data Retention Purge** | `purge_geo_evidence()`, `purge_expired_otps()` | `maintenance_service.py` | **Partial** | Automated in maintenance; **No dedicated UI for custom intervals**. |
| **Reporting & Export** | SQL views | N/A | **Missing** | **No CSV, Excel, or PDF report export buttons anywhere in UI**. |
| **Emergency Broadcast** | N/A | N/A | **Missing** | **No Mass SMS or Push Notification broadcast console**. |

---

## 4. Comprehensive Analysis: What SHOULD Be Included in the Admin Panel

While the current Admin Portal v2.0 establishes an impressive baseline for security, mapping, and core moderation, there are **critical operational and governance capabilities** required for enterprise-grade humanitarian operations that are currently missing.

Below is the structured, prioritized architectural specification of what should be included in future versions of the Admin Portal:

---

### Category A: Mission-Critical Field Operations (Priority 0 — Urgent)

#### 1. Central Live Check-In Board & Real-Time Attendance Control
- **The Problem:** Currently, live check-in management (`v_event_checkin_board` and `v_event_checkin_status`) is only exposed to coordinators in the mobile app. Administrators at headquarters have zero visibility into shift attendance progress during major ongoing events.
- **What Should Be Included:**
  - Dedicated **"Live Attendance & Operations"** tab.
  - Active event selector showing real-time roster:
    - Expected volunteers vs Checked-in count vs No-shows.
    - Check-in method badge: `QR Code` vs `GPS Geofence` vs `Manual by Coordinator`.
    - Elapsed shift duration timer.
  - Administrative Override Controls:
    - *Force Check-In*: Admin can manually confirm attendance when a volunteer's phone dies or GPS malfunctions on site.
    - *Force Check-Out*: Admin can record shift completion with custom checkout timestamps.
    - *Dispute Resolution*: Triage disputed check-ins with attached coordinator notes.

#### 2. Visual Volunteer Auto-Assignment & Allocation Console
- **The Problem:** The database contains an advanced matching engine (`run_auto_assignment()` stored function and `assign_manually()`), but administrators currently cannot trigger or inspect auto-assignment from the web portal.
- **What Should Be Included:**
  - **"Volunteer Allocation & Matching"** screen for each published event.
  - One-click button to trigger `SELECT run_auto_assignment(event_id, actor_id)`.
  - Visual Drag-and-Drop Assignment Board:
    - Left column: Accepted applicants awaiting post assignment (`v_accepted_unassigned`).
    - Right columns: Available Event Posts (`event_posts`) showing remaining capacity bars.
    - Drag volunteers directly into post slots with instant DB assignment via `assign_manually()`.
  - Schedule Conflict Detection: Real-time badge highlighting volunteers who have conflicting commitments (`user_has_schedule_conflict()`).

#### 3. QR Token Master Management Console
- **The Problem:** Mobile coordinators can generate QR codes, but if a venue coordinator loses network access or leaves the event, administrators have no mechanism to generate a backup master check-in QR code or invalidate leaked QR tokens.
- **What Should Be Included:**
  - Dynamic QR Generator: Generate event check-in and walk-in application QR codes with customizable validity windows (e.g. 15 mins, 2 hours, 24 hours).
  - Live Token Monitor: View active tokens in `qr_tokens` table, current redemption counts, and expiration countdowns.
  - Emergency Revocation: One-click button to immediately revoke compromised tokens (`consume_qr_token()`).
  - Printable PDF Sheet: Formatted printable QR poster with event branding and instructions for on-site registration desks.

#### 4. Emergency Capacity Surge & Post Reallocation
- **The Problem:** In crisis response (e.g. disaster triage), volunteer demands surge unexpectedly. Admins currently have no fast way to increase post capacities or shift volunteer quotas between roles without recreating events.
- **What Should Be Included:**
  - Fast inline capacity editor for `v_event_post_capacity`.
  - Surge capacity toggle: Allows temporary over-subscription by a defined percentage (+10%, +25%).
  - Post migration tool: Move assigned volunteers from an overstaffed post (e.g. "General Logistics") to an urgent post (e.g. "Medical Triage") with automated notification dispatch.

---

### Category B: Security, Governance & Auditing Enhancements (Priority 1 — High)

#### 5. Granular Role-Based Access Control (RBAC) Console
- **The Problem:** The portal currently relies on a binary permission scheme: `is_superuser` vs `is_admin`. In real non-profit organizations, different team members have specialized responsibilities and should not have unrestricted access.
- **What Should Be Included:**
  - Define 5 granular administrative roles:
    1. **Super Administrator:** Unrestricted access, system settings, database maintenance, user provisioning.
    2. **Event Operations Manager:** Create/edit events, manage post capacity, execute auto-assignments, live check-in overrides.
    3. **Trust & Safety / KYC Officer:** Review verification images, moderate user accounts, manage feedback hiding.
    4. **Regional Coordinator Lead:** Review coordinator applications, oversee geo-attendance violations.
    5. **Compliance & Internal Auditor:** Read-only access to audit logs, feedback summaries, and reports.
  - Admin Role Management screen in Settings to assign and audit role permissions.

#### 6. Dedicated Interactive Audit Log Visual Explorer
- **The Problem:** The `audit_logs` table contains over 1,350+ immutable audit records, but the Admin Portal only shows a brief 5-row preview on the dashboard. There is no way to search or filter audit logs.
- **What Should Be Included:**
  - Full-featured **"Audit Trail Explorer"** page.
  - Multi-dimensional filters:
    - Filter by Table Name (`users`, `events`, `assignments`, `attendance`, `coordinator_profiles`, etc.).
    - Filter by Action (`INSERT`, `UPDATE`, `DELETE`).
    - Filter by Actor ID or IP address (`app_user_id`, `app_ip`).
    - Date & time range picker.
  - Visual Diff Viewer: Clicking an audit entry opens a side-by-side modal displaying `old_values` vs `new_values` with highlighted character changes.

#### 7. Session & Active Bearer Token Revocation Console
- **The Problem:** If an administrator or coordinator's mobile device is stolen or lost, administrators cannot view or revoke active authentication sessions from the UI.
- **What Should Be Included:**
  - Active Sessions Table: Query `authtoken_token` and `django_session` linked to user records.
  - Displays device user agent, IP address, creation date, and last active timestamp.
  - Action buttons: *Revoke Session*, *Revoke All User Tokens*, and *Force Password/OTP Re-authentication*.

#### 8. Privacy & Data Retention Management Console
- **The Problem:** Under privacy regulations and humanitarian data standards, GPS evidence and stale OTP challenges must be purged periodically. The procedures exist (`purge_geo_evidence()`), but admins have no interface to configure retention schedules or run targeted purges.
- **What Should Be Included:**
  - Retention Slider: Configure retention window for GPS coordinates (default: 90 days).
  - Manual Purge Trigger: One-click button to execute `SELECT purge_geo_evidence('30 days'::interval)`.
  - Right-to-be-Forgotten / Data Anonymization Pipeline: Safe workflow to anonymize closed volunteer accounts while preserving historical aggregate attendance statistics.

---

### Category C: Communication, Alerting & Crisis Management (Priority 2 — Medium-High)

#### 9. Emergency Broadcast & Mass Notification Hub
- **The Problem:** In urgent situations (severe storm warnings, sudden venue changes, urgent blood drive needs), administrators need to contact all volunteers assigned to an event simultaneously.
- **What Should Be Included:**
  - **"Communications Center"** in Admin Portal.
  - Audience Selector:
    - All volunteers assigned to a specific event or region.
    - All approved coordinators.
    - Specific volunteer skill groups (e.g. "Certified EMTs", "Licensed Drivers", "Burmese-English Translators").
  - Dispatch Channels: SMS dispatch (via pluggable Twilio/SMS gateway) and mobile in-app push notifications.
  - Pre-approved Crisis Templates: "Event Delayed", "Emergency Venue Relocation", "Immediate Evacuation", "Urgent Standby Request".

#### 10. Automated Alerting & Operational Watchdogs
- **The Problem:** Administrators must manually check dashboards to notice problems such as staffing deficits or geolocation spoofing attacks.
- **What Should Be Included:**
  - Top Navigation Notification Bell with dynamic badge count.
  - Automated Alert Triggers:
    - *Understaffing Warning:* An event starting within 24 hours has <50% assigned volunteer capacity.
    - *Spoofing Anomaly:* More than 3 mock GPS attempts detected at a single event venue.
    - *Coordinator Absence:* Event is within 15 minutes of kickoff with zero coordinator check-ins recorded.
    - *KYC Backlog:* More than 10 verification images pending review for >48 hours.

---

### Category D: HR Analytics, Certification & Reporting (Priority 3 — Medium)

#### 11. Comprehensive Data Export Engine (CSV / Excel / PDF)
- **The Problem:** Administrators currently have no export buttons. Sharing attendance sheets with funding agencies or local authorities requires raw database queries.
- **What Should Be Included:**
  - One-click Export Buttons on all primary directories:
    - *Export Event Roster (CSV/Excel):* Volunteer list, assigned posts, phone hashes/encrypted contacts, check-in status.
    - *Export Attendance Timesheet (CSV/Excel):* Check-in timestamps, check-out timestamps, verified hours.
    - *Export Audit Trail (CSV):* Compliance export for internal and external auditors.
    - *Export Feedback Summary (PDF):* Visual feedback report with charts for donor review.

#### 12. Automated Volunteer Hours Certification Generator
- **The Problem:** Volunteers frequently require formal certificates of community service hours for universities, employers, or visa applications.
- **What Should Be Included:**
  - Certificate Generation Module:
    - Select Volunteer & Date Range.
    - Aggregates verified completed hours from `attendance` table.
    - Generates a PDF Certificate of Service featuring organization logo, volunteer name, total verified hours, event highlights, and a cryptographic verification QR code / hash.

#### 13. Volunteer Impact, Retention & Churn Analytics
- **The Problem:** The current dashboard focuses strictly on operational counts. It provides no long-term human resource analytics.
- **What Should Be Included:**
  - Dedicated **"Analytics & Impact"** tab:
    - *Retention Curves:* Percentage of volunteers who return after their 1st, 3rd, and 5th event.
    - *Reliability Scoring:* Ratio of confirmed assignments vs actual attendance vs unexcused no-shows.
    - *Charity Category Heatmap:* Visual breakdown of volunteer interest distribution across sectors (Health, Education, Disaster, Environment).
    - *Volunteer Leaderboard / Milestones:* Recognition list for volunteers crossing 50, 100, and 500 service hours.

#### 14. On-Site Incident & Grievance Ticketing System
- **The Problem:** During field operations, incidents happen (injuries, property damage, harassment complaints). There is currently no structured system to document, investigate, or resolve on-site incidents.
- **What Should Be Included:**
  - Incident Log Form: Incident category (Medical, Safety, Conduct, Equipment), severity (Low, Medium, Severe, Critical), involved parties, narrative description, and photo upload.
  - Incident Workflow: Status pipeline (`reported` &rarr; `under_investigation` &rarr; `resolved` &rarr; `escalated`).
  - Action Linking: Link incidents directly to user moderation actions (e.g. blocking a violator).

---

### Category E: UI/UX & Modern Architecture Upgrades (Priority 4 — Usability)

#### 15. Reactive State Updates (HTMX / WebSockets)
- **The Problem:** Current actions (approving an image, blocking a user) trigger full-page reloads, causing map re-initialization and jarring user experience.
- **What Should Be Included:**
  - Integrate HTMX or modern reactive component swapping:
    - Approving/rejecting verification images updates the modal and table asynchronously without reloading the page.
    - Changing event status swaps the badge in-place.
  - Server-Sent Events (SSE) or WebSockets for live attendance counters on the dashboard and geo-monitoring map.

#### 16. Field-Tablet & Mobile Responsive Optimization
- **The Problem:** While the CSS uses responsive Tailwind classes, tables and dense forms become cumbersome when accessed by field managers on iPads or Android tablets in tents.
- **What Should Be Included:**
  - Tablet Mode Toggle: Card-based view alternative for event and user tables.
  - Touch-optimized tap targets for check-in confirmation and quick approvals.
  - Offline-first Service Worker to allow field admins to review rosters even when intermittent 4G/LTE drops.

#### 17. High-Contrast Light / Dark Theme Switcher
- **The Problem:** The portal is currently hardcoded into a deep dark slate theme (`slate-950`). In outdoor field environments under bright sunlight, dark themes suffer from severe glare.
- **What Should Be Included:**
  - Quick theme toggle in top header: `Dark Mode` / `Light Mode` / `System Default`.
  - Tailored high-contrast outdoor theme for bright ambient daylight readability.

---

## 5. Strategic Phased Implementation Roadmap

```
+--------------------------------------------------------------------------------------------------+
| PHASE 1: FIELD OPERATIONS PARITY (Sprint 1-2)                                                    |
| - Live Check-In Board & Real-Time Shift Control (/ui/live-attendance/)                          |
| - Volunteer Allocation & Auto-Assignment Console (/ui/allocations/)                              |
| - Emergency Master QR Token Generator & Lifecycle Manager (/ui/qr-management/)                  |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| PHASE 2: AUDIT & GOVERNANCE EXPANSION (Sprint 3-4)                                               |
| - Dedicated Visual Audit Log Explorer with Diff Viewer (/ui/audit-explorer/)                     |
| - Granular Role-Based Access Control (RBAC) System with 5 Admin Personas                         |
| - Active Session & Bearer Token Revocation Console                                               |
| - One-Click CSV/Excel Data Exporters for Roster & Attendance                                     |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| PHASE 3: CRISIS COMMUNICATIONS & NOTIFICATIONS (Sprint 5-6)                                      |
| - Emergency Broadcast Hub (Targeted SMS & In-App Push)                                           |
| - Automated Watchdog Alerting System (Staffing Deficit, Spoofing Spikes)                         |
| - Incident & Grievance Management Workflow                                                       |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
+--------------------------------------------------------------------------------------------------+
| PHASE 4: HR ANALYTICS & VOLUNTEER RECOGNITION (Sprint 7-8)                                       |
| - Automated Volunteer Hours Certificate PDF Generator with QR Verification                       |
| - Volunteer Retention, Reliability & Churn Analytics Dashboard                                   |
| - Light/Dark Theme Switcher & Field Tablet Optimization                                          |
+--------------------------------------------------------------------------------------------------+
```

---

## 6. Summary Comparison Table: Current vs Future State

| Capability Dimension | Current Implementation (v2.0) | Target Future State (v3.0) |
|---|---|---|
| **Live Attendance** | Coordinator Mobile App only | Central Live Check-In Board with Headquarters Override Controls |
| **Volunteer Assignment** | Backend SQL stored function only | Interactive Drag-and-Drop Allocation Board with Conflict Detection |
| **QR Code Management**| Coordinator Mobile App only | Master QR Generator, Dynamic Validity TTL, Printable Poster PDF |
| **Audit Logs** | Preview of 5 recent logs on Dashboard | Full Audit Log Explorer with Diff Inspector & Multi-Field Filters |
| **Access Control (RBAC)**| Binary (`is_superuser` vs `is_admin`) | 5 Granular Roles (Super Admin, Ops Manager, Safety, Regional, Auditor) |
| **Reporting & Export**| Zero export options (raw SQL required) | One-Click CSV/Excel/PDF Exports for Rosters, Timesheets, Audits |
| **Emergency Alerts** | None | Targeted Mass SMS & In-App Push Broadcast Hub |
| **Incident Logging** | None | Formal Incident & Grievance Tracking Pipeline with Severity Levels |
| **Certificates** | None | Automated PDF Volunteer Hours Certificate with Verification Hash |
| **Reactive UI** | Full-page browser reloads | HTMX in-place component updates + Real-Time Live Feed |
| **Visual Themes** | Locked Dark Slate (`slate-950`) | Outdoor High-Contrast Light Mode + Dark Mode Switcher |

---

## 7. Referencing the Codebase Bundle

All current source code referenced in this specification is compiled in full into the single consolidated artifact:
- **Interactive HTML Bundle:** [ADMIN_SIDE_UI_ALL_CODE_APPENDED.html](ADMIN_SIDE_UI_ALL_CODE_APPENDED.html)
- **Plain Text Bundle:** [ADMIN_SIDE_UI_ALL_CODE_APPENDED.txt](ADMIN_SIDE_UI_ALL_CODE_APPENDED.txt)

Both files contain complete, verbatim code for all 11 Django presentation templates, the URL routing module, and the administrative backend controllers with zero omissions.
