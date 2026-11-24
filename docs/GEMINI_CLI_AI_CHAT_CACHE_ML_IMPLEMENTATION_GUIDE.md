# Gemini CLI Implementation Guide — AI Chat, Card-Level Refresh, Mobile Caching, and Two ML Features

**Repository:** ThuraAung-Rayaar/Volunteer_Coordination_System  
**Target branch:** feature/ai-chat-cache-ml-insights  
**Base branch:** main  
**Base commit:** 6239ebf922239a0e4500edc0144d142e961d55b9  
**Database contract:** v0.12.0 — frozen  
**Guide status:** Implementation specification; application code has not yet been changed  
**Audience:** Gemini CLI implementation agent and human reviewer

---

## 0. Instructions to Gemini CLI

Read this document completely before editing files. Then inspect the current branch and the referenced source files. This guide describes the intended behavior and repository constraints; the actual source code on this branch remains the implementation authority.

Implement the work in the following order:

1. Admin web card-level refresh and detail/upload interactions.
2. Mobile repository-level query caching and card-level refresh.
3. Role-scoped AI assistant backend and mobile/admin chat interfaces.
4. Feature 1: volunteer-to-event recommendations.
5. Feature 2: event staffing gap and coverage insight.
6. Tests, security review, and final verification.

Do not attempt a one-shot rewrite. Work in small, reviewable commits, keeping the existing application usable after each phase.

### Hard implementation constraints

- Do not modify PostgreSQL schema, triggers, stored functions, views, extensions, or indexes.
- Do not create Django migrations for AI/chat/cache/recommendation data.
- Do not persist chat history in the core database.
- Do not add a trained predictive model in this task. The first recommendation version is deterministic and explainable; the staffing feature is deterministic operational analytics.
- Do not change the existing automatic assignment algorithm.
- Do not create a second availability, eligibility, capacity, or event-lifecycle rule engine.
- Do not give the LLM database credentials, direct SQL, arbitrary ORM access, unrestricted service invocation, or write tools.
- Do not expose phone numbers, emergency contacts, blood type, verification images, raw phone hashes, OTP hashes, token hashes, or passwords to the LLM.
- Do not cache private verification images or decrypted private media.
- Do not cache account-scoped data across logout, account switch, or session invalidation.
- Do not remove the existing mock/http repository separation or weaken the current API transport.
- Do not run seed scripts, especially the legacy destructive seed script.
- Do not add packages until checking the existing dependency list. Prefer the current stack and native APIs.
- Preserve the admin UI theme and responsive behavior. Follow docs/ADMIN_UI_THEME_SYNC_GEMINI_CLI_GUIDE.md.
- Preserve existing routes and non-JavaScript fallback navigation while adding partial refresh.
- Treat every event ID and user ID received from a client or model as untrusted input. Re-authorize every server-side read.

### Interpretation of the requested feature scope

This implementation includes only:

- Feature 1 — Volunteer-to-event recommendation.
- Feature 2 — Event staffing gap and coverage insight.

For Feature 1, the first implementation direction is: the signed-in volunteer receives a ranked list of public/upcoming events that fit that volunteer's own profile, interests, and availability. It does not produce a coordinator-facing list of private volunteer candidates. Existing T2 coordinator access is currently restricted to an accepted application or active assignment; exposing pre-application volunteer profile details would require an explicit privacy-policy decision. Do not silently expand T2 access.

The AI assistant can explain or retrieve the results of these two features, but it must not create assignments, accept applications, invite volunteers, or change event status.

---

## 1. Verified repository baseline

The repository was inspected on main at:

- Commit: 6239ebf922239a0e4500edc0144d142e961d55b9
- Recursive tree: 772 entries at inspection time.
- Default branch: main.
- Main commit message: “system initial part finished / finished the system”.
- New work branch: feature/ai-chat-cache-ml-insights.

The documentation and source locations below were read from that baseline. Line references are approximate navigation aids for that commit; use symbol names and current file contents if line numbers move.

### 1.1 Architecture

| Layer | Existing implementation | Relevant source |
|---|---|---|
| Mobile | React Native + TypeScript; mock/http repositories | mobile/src |
| Backend | Django + Django REST Framework | backend |
| Backend API | BFF mounted under /api/v1/ | backend/bff |
| Admin web | Django templates + vanilla JavaScript/Tailwind | backend/admin_portal |
| Database | PostgreSQL database-first contract | postgres_sql |
| Business rules | Existing services and PostgreSQL functions/triggers | backend/services |
| Permissions/privacy | Central permission helpers and T0–T4 allowlists | backend/common |

The mobile app has an established clean separation:
- UI screens call repository contracts.
- RepositoryProvider selects mock or HTTP repository implementations.
- HTTP repositories call endpoint modules through ApiClient.
- DTOs are mapped into domain models.
- Existing screen state and domain use cases should remain the client-side interface.

Do not bypass this architecture by adding direct fetch calls inside screens.

### 1.2 Important documentation already in the repository

Read these references before implementation:

- docs/backend_analysis.md
- docs/mobile_analysis.md
- docs/full_database_details.md
- docs/README.md
- docs/ADMIN_UI_THEME_SYNC_GEMINI_CLI_GUIDE.md
- old_doc/VCS_ai_plan.md
- reference/AI_CHAT_MEMORY_AND_SYNTHETIC_SEED_DATA_PLAN.md
- seeding/ai_seed_bundle/README.md

The two AI documents are background material. This guide is the current implementation specification for this branch and narrows the requested deliverables to the two features above.

### 1.3 Database contract is frozen

docs/full_database_details.md identifies the database as frozen under contract v0.12.0. Django models for database-owned tables/views use managed=False.

Use existing models, views, queries, and functions. No migrations or schema changes are part of this work.

Relevant models and views include:

- Users
- Events
- EventPosts
- EventApplications
- Assignments
- VolunteerAvailabilityRules
- VolunteerAvailabilityExceptions
- UserCharityInterests
- VPublicEvents
- VEventPostCapacity
- VEventSummary
- VAdminDashboard

Relevant source files:

- backend/apps/accounts/models.py
- backend/apps/events/models.py
- backend/apps/coordination/models.py
- backend/apps/audit/models.py
- backend/services/query_service.py
- postgres_sql/updated_volunteer_coordination_system_Database.sql
- docs/full_database_details.md

The seed cohort is considered complete by the project owner. Do not rerun it and do not use it as evidence that a predictive model is accurate. It can support local UI integration, query-load, ranking logic, and end-to-end test cases only.

---

## 2. Current code findings that drive this implementation

### 2.1 Admin web reload behavior

The admin portal is server-rendered. Navigation and detail selectors are ordinary anchors/forms, so the browser requests the whole page again.

Relevant source references:

- backend/admin_portal/templates/admin_portal/base_admin.html
  - Top-level navigation links around lines 229–352.
- backend/admin_portal/templates/admin_portal/events_detail.html
  - Event inspection link around line 117.
  - Selected-event inspector around lines 132 onward.
  - Event moderation forms around lines 188–222.
- backend/admin_portal/templates/admin_portal/users.html
  - User inspect link around line 125.
  - Selected-user inspector around line 140.
  - Verification image and review controls around lines 203–245.
- backend/admin_portal/templates/admin_portal/coordinator_board.html
  - Inspect links around lines 158 and 232.
  - Coordinator/complaint actions use POST forms.
- backend/admin_portal/views.py
  - _guard_admin_html around line 57.
  - dashboard_view around line 225.
  - events_detail_and_geo_view around line 696.
  - users_directory_view around line 821.
  - coordinator_board_view around line 1136.
  - feedback_intelligence_view around line 1252.
  - admin_settings_view around line 1368.

Observed behavior:

1. Inspecting an event navigates to /api/v1/admin/ui/events/?event_id=... and reconstructs the entire page. events_detail_and_geo_view loads the event list, geo-attempt list, and selected-event posts/applications/assignments/geo attempts before rendering.
2. Inspecting a user navigates to /api/v1/admin/ui/users/?user_id=... and reconstructs the full page. users_directory_view loads the user list and additional selected-user data.
3. Reviewing an image or submitting a moderation action posts to the full-page view and relies on the page response.
4. The dashboard view prepares many unrelated sections together rather than loading only the card being inspected or refreshed.

### 2.2 Admin dashboard query and payload concerns

backend/admin_portal/views.py — dashboard_view currently:
- Loads dashboard KPIs.
- Loads recent events.
- Loads pending verification images.
- Loads all approved coordinator profiles.
- Loads audit rows for superuser sessions.
- Builds the event map from an event queryset without an explicit result limit.
- Loads past-event summary rows.
- Materializes all feedback rows using list(Feedback.objects.all()) and calculates counts/averages in Python.

This creates avoidable database and response work on every dashboard page request.

Required correction:
- Use database aggregates for feedback counts and average scores.
- Limit or paginate lists.
- Project only fields each card uses.
- Load secondary cards on demand or independently.
- Reuse the existing admin dashboard view/query service for KPI aggregates.
- Do not load or serialize every feedback row just to display summary numbers.
- Do not render a full detail panel when the user has not selected a record.

Do not introduce N+1 queries while splitting cards. Use select_related, prefetch_related, values, annotations, and limits where justified by the actual model relationships.

### 2.3 Admin user directory currently decrypts too much data

backend/admin_portal/views.py — users_directory_view currently loops over the user list and calls decrypt_phone for each row before the user opens a detail panel.

This should be removed from the list response/context. User list cards should use non-sensitive identity/status fields only. A selected-user detail request may load only the fields that the current UI is authorized to display.

Never return decrypted phone or emergency-contact values from AI tools. The assistant is explicitly limited to public user details in the super-admin scope defined later in this document.

### 2.4 Existing private verification image behavior

Existing routes in backend/admin_portal/urls.py and views.py include:

- GET /api/v1/admin/verification-images/
- GET /api/v1/admin/verification-images/{image_id}/file/
- POST /api/v1/admin/verification-images/{image_id}/review/

AdminVerificationImageFileView decrypts in memory, verifies the stored SHA-256 when present, streams an image/jpeg response, and sets Cache-Control: private, no-store.

Preserve these protections. Do not place decrypted verification images into a general browser cache, mobile query cache, chat context, LLM prompt, or RAG index. For admin image review, load the image in a modal/preview card through the existing file endpoint and update only the verification queue/detail card after review.

### 2.5 Current mobile refresh behavior

Relevant source references:

- mobile/src/app/RepositoryProvider.tsx
- mobile/src/app/UserContext.tsx
- mobile/src/core/api/apiClient.ts
- mobile/src/data/contracts/eventRepository.ts
- mobile/src/data/http/HttpEventRepository.ts
- mobile/src/data/http/HttpProfileRepository.ts
- mobile/src/data/http/HttpCoordinatorRepository.ts
- mobile/src/data/http/HttpDashboardRepository.ts
- mobile/src/features/events/screens/EventDiscoveryScreen.tsx
- mobile/src/features/events/screens/EventDetailScreen.tsx
- mobile/src/features/events/screens/MyApplicationsScreen.tsx
- mobile/src/features/events/screens/MyAssignmentsScreen.tsx
- mobile/src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx
- mobile/src/core/storage/verificationPhotoStorage.ts

Findings:

1. EventDiscoveryScreen has a module-level DiscoveryStateCache for search text, filters, and scroll offset. This preserves screen state; it is not a reusable server-data query cache.
2. EventDiscoveryScreen refetches event data on focus.
3. EventDetailScreen initially fetches event detail and refetches on focus. Its repository call loads event detail, posts, and the signed-in user's application data in parallel.
4. MyApplicationsScreen and MyAssignmentsScreen also preserve filter/scroll UI state and refetch on focus.
5. RepositoryProvider selects repository implementations but does not provide a shared TTL query cache.
6. HttpCoordinatorRepository already has in-memory application and attendance maps for operational item lookups. Preserve useful behavior, but do not mistake these maps for a complete query cache with TTL and invalidation.
7. ApiClient already provides typed request results, token injection, timeout, AbortSignal support, request IDs, normalized errors, and redacted telemetry. Reuse it.
8. UserContext resets discovery/application/assignment UI caches on identity changes and logout. Integrate the new query-cache clear operation into the same lifecycle.
9. verificationPhotoStorage.ts uses an in-memory Map of local photo records and Keychain metadata for account association. It is not a general durable encrypted-file cache. Do not reuse it as the data-query cache or claim that it encrypts all file bytes.

### 2.6 Existing business-service boundaries

| Concern | Existing source | Rule |
|---|---|---|
| Public event search/detail/posts | backend/services/query_service.py | Use VPublicEvents and VEventPostCapacity-backed values |
| Application lifecycle | backend/services/application_service.py | Do not reimplement deadline, state, capacity, or application rules |
| Assignment lifecycle | backend/services/assignment_service.py | Auto-assignment delegates to PostgreSQL |
| Availability | backend/services/availability_service.py | Availability and schedule conflict delegate to PostgreSQL |
| Profile and charity interests | backend/services/profile_service.py | Full self-profile contains decrypted sensitive values; do not pass wholesale to LLM |
| Event lifecycle | backend/services/event_service.py | Use its transitions and permission guards |
| Coordinator access | backend/common/permissions.py | Use approved-coordinator and manager checks |
| Privacy | backend/common/privacy.py | Use existing T0–T4 field policy and helper functions |
| Admin operations | backend/admin_portal/views.py | Use ensure_admin and require_superuser checks |

Specific findings:
- assignment_service.py delegates run_auto_assignment() to PostgreSQL. Never replace it with an AI scoring algorithm.
- availability_service.py delegates is_user_available() and user_has_schedule_conflict() to PostgreSQL. Do not make the recommendation feature invent a second schedule-conflict engine.
- query_service.py uses v_public_events, v_event_post_capacity, and v_event_summary for event visibility and counts.
- application_service.py has business checks for deadline, account status, schedule conflict, capacity, and state transitions.

---

## 3. Admin web: card-by-card refresh specification

### 3.1 User-visible behavior

The admin portal should retain its current server-rendered pages and theme, but inspect/detail/upload/review actions must update only the relevant card or detail panel.

Expected behavior:

- Selecting an event updates only the event inspector panel.
- Selecting a user updates only the user inspector panel.
- Opening a verification image opens an in-page modal/preview, not a new full-page navigation.
- Reviewing/approving/rejecting a verification image updates that image card and queue counts.
- Applying filters or pagination updates only the list/table card.
- Moderation actions update the affected row/card and status banner.
- Dashboard cards load independently; one card refreshing must not reload unrelated cards.
- A user can still navigate to a deep link with JavaScript disabled or unavailable. The existing query-string full-page route can remain as a graceful fallback.
- Top-level navigation between Dashboard, Events, Users, Coordinators, Feedback, and Settings may remain normal page navigation. The required partial behavior applies to record inspection and card-level operations, not necessarily every top-level tab change.

### 3.2 Implementation pattern

Use the current Django templates and vanilla JavaScript. Do not introduce a frontend framework or HTMX solely for this.

Recommended approach:

1. Keep the page view responsible for rendering the initial page shell, list skeleton, navigation, and basic card containers.
2. Create separate read endpoints or HTML-fragment endpoints for selected cards.
3. Add stable data attributes to inspect buttons and card containers.
4. Use delegated click/submit handlers so newly rendered rows also work.
5. Use fetch with same-origin credentials and the existing session authentication.
6. Preserve CSRF protection on every POST/PATCH/DELETE operation.
7. Update only the matching DOM region after a successful server response.
8. Use a card-local loading indicator, empty state, retry action, and error message.
9. Keep the event/user ID in the URL with history.pushState/replaceState if useful for deep linking, but do not navigate the browser to a new full document for an inspect click.
10. Prevent stale responses from replacing newer selections. Track a per-card request sequence or AbortController and ignore superseded responses.

For Django-generated HTML fragments, use separate partial templates under:

- backend/admin_portal/templates/admin_portal/partials/

Return them with a small fragment view or an explicit AJAX branch. For structured metrics and paginated data, use JSON serializers and existing API response conventions.

Do not return a whole dashboard HTML page inside JSON. Do not build raw HTML from untrusted strings in JavaScript. Django template autoescaping must remain enabled.

### 3.3 Suggested admin endpoints

Reuse existing routes whenever they already return the required scoped data. Add only the missing read endpoints.

Existing API endpoints to reuse where appropriate:

| Endpoint | Purpose |
|---|---|
| GET /api/v1/admin/dashboard/ | Admin dashboard KPIs |
| GET /api/v1/admin/events/ | Admin event summaries |
| GET /api/v1/admin/verification-images/ | Verification queue |
| GET /api/v1/admin/verification-images/{id}/file/ | Private image stream; no-store |
| POST /api/v1/admin/verification-images/{id}/review/ | Review decision |
| GET /api/v1/admin/users/{id}/moderation-summary/ | User moderation summary |
| GET /api/v1/admin/feedback/ | Feedback list with filters |

Suggested additions (names are design proposals; keep naming consistent with the current URL module):

| Endpoint | Intended payload |
|---|---|
| GET /api/v1/admin/ui/events/{event_id}/detail/ | Only selected-event inspector fields |
| GET /api/v1/admin/ui/users/{user_id}/detail/ | Only selected-user fields that the current admin UI is authorized to show |
| GET /api/v1/admin/ui/dashboard/cards/{card_key}/ | One independently loaded dashboard card, if existing API coverage is insufficient |
| GET /api/v1/admin/ui/coordinators/{user_id}/detail/ | Coordinator detail card, only if needed by existing UI flow |

You may instead use HTML fragment responses for these admin UI-only endpoints. Do not create both JSON and HTML APIs for the same card without a concrete use case.

### 3.4 Event inspector

Current source:
- events_detail_and_geo_view in backend/admin_portal/views.py.
- events_detail.html.

Refactor the initial page so the event list is loaded separately from the selected event inspector. When an event is selected, request only:

- Event summary/detail fields.
- Event posts and capacity rows.
- Application summary/list, paginated.
- Assignment summary/list, paginated.
- Geo-attempt preview only when an authorized admin opens that card.

Do not return all 50 applications, 50 assignments, and 50 geo attempts on every event-list request. Add independent pagination or “load more” for long lists.

A refresh of the event list must not reload the selected-event detail panel unless the selected event changed. A refresh of one event tab (for example Applications) must not reload the Posts, Assignments, or Geo cards.

### 3.5 User inspector

Current source:
- users_directory_view in backend/admin_portal/views.py.
- users.html.

Refactor the initial user list so it does not decrypt phone numbers for every result. List rows should contain only fields needed to render the list, filters, and status badges.

On inspect:
- Fetch the selected user's detail card.
- Load only the related card sections needed by the current inspector.
- Paginate assignments, attendance, and moderation history.
- Load verification image metadata separately.
- Load image bytes only after the reviewer opens a specific image preview.
- Keep the existing permission/role behavior for the human admin UI, but do not reuse this detail payload for AI context.

The assistant user-public-card tool is a separate and stricter allowlist. It must not return the detail inspector's decrypted values.

### 3.6 Verification image upload/review interaction

Current API already streams private image bytes with Cache-Control: private, no-store. Preserve that.

Admin portal behavior:
- The queue card loads image metadata, not all image bytes.
- The image preview is loaded only when the reviewer opens the specific record.
- Preview should appear in a modal/card.
- POST review uses the existing review API and CSRF protection.
- On a successful review response, update only the selected image card and queue summary.
- Do not reload the full users page, coordinator board, or dashboard.
- Do not cache decrypted image bytes in localStorage, sessionStorage, IndexedDB, or the general query cache.
- Do not expose image URLs or image bytes to the chat assistant.

### 3.7 Dashboard cards and server load

Keep KPI queries separate from long lists.

Required:
- Use query_service.get_admin_dashboard() / existing AdminDashboardView for base metrics.
- Replace Python materialization of all feedback rows with database aggregation.
- Add explicit pagination or strict limits for event/user/feedback/audit lists.
- Map markers should be separately loaded, paginated/limited, and should include only events that have valid coordinates; do not create fake coordinates for missing geodata just to populate the map.
- Do not load the map card if it is collapsed or not visible.
- Each chart/card should have its own refresh lifecycle and timestamp.
- A card error must not blank unrelated dashboard content.

### 3.8 Admin authorization and CSRF

- HTML page access continues to use _guard_admin_html(request).
- API access continues to use IsAuthenticated plus ensure_admin(request).
- Super-admin-only operations continue to use ensure_admin(request, require_superuser=True).
- Do not change a protected endpoint to AllowAny for AJAX convenience.
- Use same-origin cookies/session for the portal and send the correct CSRF token on write requests.
- Re-authorize the target object on each detail request; never assume a previously selected list row grants access forever.
- Keep 404 masking where existing permission helpers require it.
- For private endpoints, set appropriate Cache-Control headers. Browser-side memory cache must not replace server authorization.

---

## 4. Mobile: shared in-memory query cache and card refresh

### 4.1 Goal

On mobile, switching back to a screen or opening a detail card should show cached data quickly, then refresh in the background only when that cache entry is stale. A manually triggered pull-to-refresh must force a network refresh.

The cache belongs in the data/repository layer, not as another screen-specific module-level cache.

### 4.2 Proposed files

Add a small, dependency-free module, for example:

- mobile/src/data/cache/QueryCache.ts
- mobile/src/data/cache/cacheKeys.ts
- mobile/src/data/cache/cachePolicy.ts
- mobile/src/data/cache/index.ts

Integrate the cache through the existing repository classes or a repository decorator. Do not add query caching to POST/PATCH/PUT/DELETE operations or to ApiClient's raw transport path.

### 4.3 Cache entry behavior

The cache should support:

- Typed values.
- A fetched-at timestamp.
- A configurable TTL.
- A bounded maximum number of entries.
- In-flight request deduplication for identical keys.
- Key-specific invalidation.
- Prefix/tag invalidation for related records.
- Full clear on account switch, logout, session invalidation, or data-mode switch.
- Stale-while-revalidate behavior.
- Explicit force-network refresh.
- No caching of failed requests.
- No unbounded Map growth.

Suggested contract:

    get(key) -> { value, fetchedAt, isFresh } | undefined
    getOrFetch(key, loader, policy) -> value
    invalidate(key)
    invalidateTag(tag)
    clear()
    clearScope(scope)

When a stale value exists:
- Return it immediately to the screen.
- Trigger one background fetch for that key.
- Replace the cached value only if the latest request succeeds.
- Keep the stale card visible if the refresh fails and show a non-blocking stale/error indicator.
- Never let an old response overwrite a newer result after rapid filter changes or screen switches.

Use request cancellation when a component no longer needs a response and the operation can safely be cancelled. ApiClient already supports AbortSignal.

### 4.4 Cache key and identity isolation

A cache key must include:
- Repository/data source.
- Resource type.
- Normalized filters and page.
- Resource ID when applicable.
- Authenticated session/account scope for private data.

Do not place a raw access token or phone number in the cache key.

Use the app's current identity/session generation or stable authenticated user UUID as the private-data scope. When identity changes, clear all account-scoped entries before displaying the next account's data.

Public event feed data may use a public cache scope. Personal applications, assignments, profile, availability, and coordinator workspace data must be account-scoped.

### 4.5 Initial TTL policy

Use these as starting values in one centralized cache policy file. They are not permanent business rules and should be tuned from observed request timing.

| Resource | Initial TTL | Cache scope |
|---|---:|---|
| Active charity taxonomy | 60 minutes | Public |
| Public event list page | 45 seconds | Public, normalized filters/page |
| Public event detail + posts | 30 seconds | Public base + account-scoped application state |
| Volunteer applications | 20 seconds | Account |
| Volunteer assignments | 20 seconds | Account |
| Volunteer profile/interests | 60 seconds | Account |
| Volunteer availability | 60 seconds | Account |
| Volunteer dashboard summary | 30 seconds | Account |
| Coordinator event list/detail | 20 seconds | Account |
| Coordinator applications/assignments/attendance list | 10–20 seconds | Account + event |
| Staffing insight | 15–30 seconds | Account + event |
| Volunteer event recommendations | 30–60 seconds | Account |

Do not cache:
- Auth tokens or OTP challenges.
- Passwords or authentication payloads.
- Verification image bytes or decrypted media.
- Raw phone/emergency-contact data.
- Private files.
- Failed requests or permission denials.
- Admin user details in a persistent store.

### 4.6 Screen behavior changes

Update the following screens to request cached data first and refresh only when stale:

- EventDiscoveryScreen.tsx
- EventDetailScreen.tsx
- MyApplicationsScreen.tsx
- MyAssignmentsScreen.tsx
- CoordinatorEventDetailScreen.tsx
- CoordinatorEventsScreen.tsx
- CoordinatorApplicationsScreen.tsx
- CoordinatorAssignmentsScreen.tsx
- CoordinatorAttendanceScreen.tsx
- DashboardScreen.tsx
- ProfileScreen.tsx
- AvailabilityScreen.tsx
- VerificationCoordinatorStatusScreen.tsx

Do not delete the existing screen state caches for filters, tabs, or scroll position. They solve a different problem. Connect them to the new data cache rather than replacing them.

On screen focus:
- Render fresh cache immediately when available.
- If stale, render stale data then trigger one refresh.
- If no cache exists, show the current loading skeleton.
- Avoid a second duplicate fetch from both mount and focus handlers.

Pull-to-refresh:
- Forces a network fetch.
- Shows the existing RefreshControl state.
- Updates only the resource/list card.
- Does not blank the full screen while old data is available.

Detail screen:
- Cache the event detail independently by event ID.
- Keep the signed-in user's application state separately account-scoped or include it in an account-scoped detail key.
- Do not reload every screen/tab in the workspace when only one detail section has changed.

### 4.7 Mutation invalidation matrix

After successful mutations, invalidate only the related cache keys/tags.

| Mutation | Invalidate |
|---|---|
| Apply to event/post | Event detail for that ID; public/recommendation list if capacity can change; my applications; my assignments/dashboard if auto-accept may create an assignment |
| Withdraw application | My applications; my assignments; affected event detail and coordinator application/staffing cards |
| Accept/reject/waitlist application | That event's applications, assignments, post capacity, event summary, staffing insight; affected volunteer application/assignment caches if the actor is that volunteer |
| Create/update/close event post | Coordinator event detail; post capacity; staffing insight; event detail; event list where relevant |
| Publish/activate/complete/cancel event | Event detail; public event lists; coordinator list; admin event list/cards; recommendation cache |
| Assign/cancel assignment | My assignments/dashboard; coordinator event assignment/capacity/staffing cards |
| Confirm/check-in/check-out attendance | Own attendance/dashboard; affected coordinator attendance card and staffing/coverage summary |
| Change profile/skills/interests | Own profile; event recommendations |
| Change availability | Own availability; event recommendations |
| Upload verification image | Only verification status/image card; do not clear event/dashboard caches |
| Review verification image in admin | Only verification queue and inspected user/image card |
| Submit feedback | Own feedback summary and event feedback card |

Only invalidate after the server confirms success. If the request fails, retain the existing cached value and show the error.

### 4.8 Session lifecycle

In mobile/src/app/UserContext.tsx there is already cache-reset logic on identity changes and logout.

Extend that lifecycle to call the new query cache clear function:
- On successful login when the user identity changes.
- On logout.
- On a 401/session invalidation.
- On switching mock/http data mode if cached values would cross modes.
- Before replacing one signed-in account with another.

Do not store personal query-cache data in AsyncStorage, Keychain, or SecureStore for this first version. Keep it in process memory only. The security token store remains separate.

### 4.9 Upload behavior on mobile

HttpProfileRepository.uploadVerificationImage is the existing upload integration point.

Required UX:
- Upload progress/status belongs to the verification card or image slot.
- On upload success, refresh only the verification status/card.
- Do not reload the full profile, dashboard, event list, or all profile endpoints.
- Preserve the local photo slot's account ownership checks.
- Do not put image bytes or file URIs into the shared query cache.
- Do not change the private image upload crypto/storage contract without a separate design review.

---

## 5. AI assistant: target architecture

### 5.1 Integration boundary

Add a read-only assistant layer to Django. It should orchestrate:
1. Authenticated actor identity.
2. Server-side permission checks.
3. A small allowlisted tool registry.
4. Current business data retrieved through existing services.
5. Curated VCS help/system documentation.
6. A provider adapter.
7. Structured response validation and sensitive-data redaction.

Suggested package layout (adapt to current import conventions; no model is required):

    backend/ai/
        __init__.py
        providers/
            base.py
            configured_provider.py
        services/
            chat_service.py
            context_service.py
            response_validator.py
        tools/
            volunteer_tools.py
            coordinator_tools.py
            admin_tools.py
            registry.py
        security/
            prompt_guard.py
            redaction.py
            scope_policy.py
        tests/

    backend/bff/assistant/
        __init__.py
        urls.py
        views.py
        serializers.py

If the project convention is to keep all backend service modules directly under backend/services/, a smaller implementation is acceptable. The important requirement is separation of API, provider, service, tool registry, and policy boundaries.

Mount the new URL module from backend/bff/urls.py. Proposed endpoint:

    POST /api/v1/assistant/chat/

This endpoint does not currently exist in the inspected source.

### 5.2 API contract

Request:

    {
      "message": "Which upcoming events fit my interests and availability?",
      "conversation": [
        {"role": "user", "content": "I prefer environmental activities."},
        {"role": "assistant", "content": "I will check suitable events."}
      ],
      "language": "en"
    }

Rules:
- The authenticated actor is request.user.
- Do not accept actor_id, target_user_id, role, is_admin, is_superuser, coordinator_id, or event ownership from the client as authoritative.
- Validate the message length and history size.
- Accept only user/assistant history roles; reject system/developer/tool role injection.
- Server-generated system/developer instructions are never accepted from the client.
- Limit the conversation to the last two user/assistant exchanges (up to four prior messages) in the current open chat.
- Re-fetch live business data on each request; old assistant messages are not authoritative facts.
- Use a server-side language allowlist or the authenticated user's preferred_language; do not blindly trust arbitrary language strings.

Response:

    {
      "answer": "I found events that match your interests and availability.",
      "sources": [
        {"type": "event", "id": 123, "label": "Community clean-up"}
      ],
      "suggested_actions": [
        {"type": "open_event", "event_id": 123}
      ],
      "request_id": "server-generated-correlation-id"
    }

Validate response fields and suggested-action types before returning them. The model must not return arbitrary URLs, SQL, callable function names, or client commands.

### 5.3 Conversation memory

Use the agreed “last two exchanges” semantics:
- The active client conversation holds messages in in-memory component/application state.
- Send at most the last two user/assistant exchanges with each request.
- Start a new conversation or clear it when the user clears the chat.
- Clear it when the authenticated account logs out or changes.
- Do not persist it in the existing PostgreSQL database.
- Do not silently persist it to local durable storage.
- Do not reuse one user's conversation for another account.
- Backend policy and current data context are regenerated every request.
- Do not record raw prompts or completions by default. Operational logs should use request ID, actor ID, provider/model, tool names, status, duration, and token counts only where safe.

### 5.4 Provider adapter

Keep provider-specific SDK calls out of API views and domain services.

Provider interface should expose a narrow operation such as:
- receive server-created messages and allowlisted tool definitions;
- return a structured assistant response or tool call;
- report provider/model identifiers and token usage;
- respect a strict timeout and output-token budget.

Configuration belongs only in backend environment variables/settings. Add placeholders to .env.example, never a real key.

Suggested configuration names:
- AI_ENABLED
- AI_PROVIDER
- AI_MODEL
- AI_API_KEY
- AI_TIMEOUT_SECONDS
- AI_MAX_OUTPUT_TOKENS
- AI_MAX_HISTORY_MESSAGES
- AI_RATE_LIMIT_PER_MINUTE

Do not put provider keys in React Native, the admin HTML, build-time mobile config, or a client request. Do not automatically fall back to another provider without an explicitly tested policy; fail closed with a truthful error if the provider is unavailable.

### 5.5 Tool execution

The LLM is not an authorization engine.

The server owns:
- Tool allowlist.
- Tool input schema.
- Actor resolution.
- Event/user scope checks.
- Data minimization.
- Tool result validation.
- Tool invocation limit per request.

Never:
- execute model-generated SQL;
- execute arbitrary ORM filters;
- let the model import Python modules or call arbitrary functions;
- accept user IDs from model arguments without re-authorizing them;
- let the model choose a permission tier;
- let the model invoke write services.

Treat event descriptions, application notes, comments, user-generated content, and retrieved documents as untrusted data, not instructions. Prompt-injection text in a stored event description must not alter the system prompt or tool policy.

### 5.6 Read-only V1

The chat assistant may:
- answer VCS how-to questions from curated documentation;
- summarize authorized event data;
- summarize the signed-in volunteer's own applications, assignments, availability, and recommendations;
- summarize the signed-in coordinator's managed events and staffing insights;
- summarize admin metrics within the actor's allowed scope.

The chat assistant may not:
- create/update/delete/publish/cancel events;
- approve or reject coordinators;
- accept/reject/waitlist applications;
- assign volunteers;
- check in/out volunteers;
- change profile/availability;
- review verification images;
- moderate users or feedback;
- run database maintenance.

Provide navigation suggestions only. If a future version needs write actions, require a separate confirmation, action-specific permission checks, the existing business service, and a server-confirmed result. That is out of scope here.

---

## 6. AI role, event scope, and data privacy matrix

### 6.1 Current authorization source

The current code does not have a User.role field or a configurable admin_tier field.

Existing identity fields:
- Users.is_admin
- Users.is_superuser
- Users.is_active
- Users.account_status
- CoordinatorProfiles.status

Relevant files:
- backend/apps/accounts/models.py
- backend/apps/coordination/models.py
- backend/common/permissions.py
- backend/common/privacy.py
- backend/admin_portal/views.py

Use:
- ensure_active_user(user)
- ensure_admin(request)
- ensure_admin(request, require_superuser=True) for super-admin-only operations
- ensure_approved_coordinator(user)
- get_event_for_manager_or_404(user, event_id, require_write=False)
- can_coordinator_read_t2(actor, target_user_id, event)
- can_access_t3_data(...)
- can_access_t4_data(...)

Do not invent a user.role field or add admin_tier to the model/schema.

### 6.2 Privacy field tiers already defined

backend/common/privacy.py defines:

| Tier | Meaning in the current code |
|---|---|
| T0 | Public event fields |
| T1 | Minimal public identity card and self data |
| T2 | Event-scoped semi-private volunteer/event fields |
| T3 | Strictly private personal information |
| T4 | Admin/governance data |

The current T1 minimal public user card is only:
- uuid
- display_name

Use get_minimal_public_card(user) for another user's public identity. Do not widen it by adding home_area, phone, profile skills, attendance, or verification state.

### 6.3 Assistant scope by actor

| Actor | Assistant data scope |
|---|---|
| Volunteer | T0 public events + the authenticated volunteer's own profile, interests, availability, applications, assignments, attendance, and recommendation results. No other users' private or semi-private details. |
| Approved coordinator | Full operational detail for events where the actor is the owner/current coordinator and is an approved coordinator; volunteer detail only under the existing event-scoped T2 permission. |
| Standard admin | Must pass ensure_admin. Tool results must follow existing T0–T4 privacy allowlists and the admin endpoint's own permission contract. Default assistant behavior should favor aggregate dashboard metrics and public/minimal user cards; do not return T3 PII or raw governance records merely because the model asks. |
| Super admin | Must be active and satisfy is_admin + is_superuser. May retrieve operational data for all events, including non-public lifecycle states, and T1 public user cards. The requested assistant scope is not unrestricted access to private user PII. |

Important distinction:
- The repository implements data visibility tiers T0–T4.
- It does not implement individual administrator grades beyond is_admin and is_superuser.
- Current helpers can grant T3/T4 access to active admins in some contexts. The AI tool layer must still enforce the narrower assistant allowlists above.
- If the product owner expects multiple configurable standard-admin grades, stop and request the authoritative source for that hierarchy. Do not create an admin_tier column, migration, or guessed policy in this task.

### 6.4 Coordinator event and volunteer scope

For coordinator operations:
- Require active account and approved coordinator profile.
- Call get_event_for_manager_or_404(actor, event_id, require_write=False) for every event-scoped read.
- Do not infer access from a client-side selected event or cached previous response.
- Owner-as-Monitor read access remains read-only; the assistant is read-only regardless.
- Do not let the model enumerate events and then bypass the event manager guard.

For volunteer details:
- Existing can_coordinator_read_t2 requires an event manager, event status published/active, and accepted application or active assignment.
- get_event_applications in application_service.py returns T2 detail for accepted applicants; do not expand pending applicants into full profiles.
- The user-facing recommendation feature must use the volunteer's own profile, not disclose candidate profiles to coordinators before consent/eligibility is established.
- If a volunteer is accepted or assigned, use the existing T2 output/helper and return only the fields needed to answer the event-specific question.
- Never pass profile_service.get_user_profile() wholesale to the model: it includes decrypted phone and emergency-contact values and other private fields.

### 6.5 Sensitive information excluded from LLM context

Always exclude:
- phone, phone_enc, phone_hash;
- emergency_contact_name and emergency_contact_phone_enc;
- blood_type;
- password, OTP/code hashes, token hashes, auth credentials;
- verification image paths/bytes and decrypted image content;
- exact volunteer GPS or geo-attempt evidence unless a separately approved and minimized operational summary is required;
- raw free-text private notes unless explicitly necessary and approved;
- any field in NEVER_EXPOSE_FIELDS.

The assistant must work with allowlisted typed dictionaries, not raw model instances or full service result objects.

---

## 7. Feature 1 — Volunteer-to-event recommendation

### 7.1 Product behavior

Add a “Recommended for you” section to the volunteer event discovery/dashboard experience.

It should answer:
- Which public upcoming events fit my interests?
- Which event roles match my skills?
- Which events fit my available time?
- Why is this event recommended?
- What is missing from my profile that limits recommendation quality?

Use a deterministic, explainable compatibility score as the first baseline. Do not label it as a trained or validated predictive model.

### 7.2 Backend placement

Add a read-only service, for example:

- backend/services/recommendation_service.py

Add a volunteer API view and route in:
- backend/bff/volunteer/views.py
- backend/bff/volunteer/urls.py

Proposed endpoint:

    GET /api/v1/me/recommendations/events/?limit=10

The actor is always request.user. Do not accept a volunteer/user ID query parameter.

Suggested response:

    {
      "results": [
        {
          "event": {
            "event_id": 123,
            "title": "Community clean-up",
            "start_at": "...",
            "end_at": "...",
            "location_name": "...",
            "charity_fields": ["environment"]
          },
          "match_score": 86,
          "match_label": "strong",
          "reasons": [
            "Matches one of your selected interests",
            "Required skills overlap with your profile",
            "Your saved availability covers the event"
          ],
          "matched_post_ids": [501],
          "policy_version": "recommendation-v1"
        }
      ]
    }

The score is a relative match score, not a probability of attendance or success. Do not describe 86 as an 86% chance of volunteering.

### 7.3 Authoritative input sources

Use only data the signed-in volunteer is allowed to use:

- Own Users profile fields relevant to eligibility.
- Own UserCharityInterests.
- Own volunteer availability rules/exceptions.
- Public upcoming events from VPublicEvents.
- Event posts and capacity from VEventPostCapacity/EventPosts.
- Existing application/assignment state for the signed-in volunteer.

Relevant sources:
- backend/services/query_service.py
- backend/services/profile_service.py
- backend/services/availability_service.py
- backend/services/application_service.py
- backend/apps/accounts/models.py
- backend/apps/events/models.py

Do not use:
- another volunteer's profile;
- another volunteer's attendance history;
- another volunteer's feedback;
- blood type or donation willingness;
- phone/emergency-contact data;
- verification images;
- precise volunteer GPS or exact residential coordinates;
- invented reliability/no-show scores.

### 7.4 Hard eligibility filters before ranking

A score must never make an ineligible event eligible.

Filter out events that:
- are not returned by the public event query/view;
- are deleted, draft, cancelled, or otherwise not publicly available to volunteers;
- have already passed the application deadline;
- have ended or are not upcoming for this recommendation surface;
- have no available/open post capacity;
- conflict with the volunteer's current application/assignment state under the existing application UX;
- fail the existing PostgreSQL-backed availability/schedule-conflict checks.

Use:
- query_service.list_public_events(...)
- query_service.get_public_event(...)
- query_service.get_event_posts(...)
- availability_service.check_user_availability(...)
- availability_service.check_schedule_conflict(...)
- application_service.get_own_applications(...)
- existing event/application services for any existing eligibility condition.

Do not reimplement the PostgreSQL availability or schedule-conflict functions.

If the existing service does not expose the exact eligibility fact needed, add a small read-only wrapper around the existing authoritative function. Do not create a new rule that disagrees with application_service.apply_to_event().

### 7.5 Initial score design

Keep weights in one versioned Python configuration object, not scattered through views.

Suggested starting weights:

| Signal | Initial weight |
|---|---:|
| Skill/post requirement overlap | 35 |
| Charity-interest/category overlap | 25 |
| Availability compatibility | 25 |
| Coarse home-area/region fit | 10 |
| Experience/new-volunteer role fit | 5 |
| Total | 100 |

Rules:
- Only score post roles that remain eligible after hard filters.
- If the event has multiple posts, compute the event's score from its best eligible post; return the matched post IDs.
- Availability is first a hard filter using the existing database function. The remaining availability score may distinguish full vs partial schedule coverage only if a trusted existing result supports it.
- A missing profile field is “unknown”, not a negative attribute. Mark the recommendation as lower-information and explain that more profile data would improve the match.
- Do not use age, gender, religion, race, political affiliation, health conditions, blood type, disability proxies, or donation willingness.
- Physical requirements should be treated as role eligibility based on the existing user/post fields and current rules; do not infer health status.
- Coarse region matching may use the volunteer's self-entered home_area only if it is already an allowed self-data field. Do not geocode or expose their precise home location.

The weights are initial product defaults, not learned parameters. Record policy_version so later evaluations can compare versions.

### 7.6 Explainability and UI

Each recommendation should include two to four short reasons grounded in actual matched fields.

Examples:
- “Matches your environmental interest.”
- “Your skills overlap with the event's logistics post.”
- “Your saved availability covers the shift.”
- “This role accepts new volunteers.”

Do not output a reason that is not supported by the scorer's evidence.

Mobile:
- Add the recommendation card to EventDiscoveryScreen or the volunteer dashboard.
- Use the existing EventCard/design system.
- Tapping a recommendation opens the normal EventDetail screen.
- Application still uses the existing apply endpoint and application_service.
- On an application or availability/profile mutation, invalidate recommendation cache.
- Do not add a second apply or assignment pathway.

Chat:
- A volunteer can ask for suitable events.
- The assistant should call the recommendation service and explain its returned reasons.
- Do not ask the LLM to calculate scores from an unbounded user profile.

### 7.7 Tests for Feature 1

Add unit tests for:
- Deterministic output for the same input.
- Hard exclusion of non-public/draft/cancelled/deleted events.
- Deadline expiry.
- No capacity.
- Schedule conflict.
- Availability rejection.
- Already-applied/assigned state behavior.
- Skill and interest overlap.
- New-volunteer eligibility.
- Missing profile fields.
- Score never exceeds the configured range.
- Matched post IDs actually belong to the recommended event.
- User A cannot retrieve User B's recommendations.
- No private fields occur in serialized output.
- Recommendation read path does not write applications or assignments.
- Existing application service remains authoritative.

Use the completed synthetic cohort for integration test coverage only. Do not claim a real ML accuracy score from synthetic labels.

---

## 8. Feature 2 — Event staffing gap and coverage insight

### 8.1 Product behavior

Provide an operational view to approved coordinators and authorized admins answering:

- How many positions are required?
- How many positions are currently assigned?
- How many open positions remain?
- How many accepted applications are still unassigned?
- How many applications are pending or waitlisted?
- Is the event adequately staffed relative to its start time?
- Which post/role has the largest gap?
- What should the coordinator review next?

The feature is a transparent rule-based operational insight, not a predictive model and not an automatic assignment engine.

### 8.2 Backend placement and API

Add a read-only service, for example:

- backend/services/staffing_insight_service.py

Add a coordinator-scoped route:

    GET /api/v1/coordinator/events/{event_id}/staffing-insight/

Add an admin-scoped route for authorized dashboard use:

    GET /api/v1/admin/events/{event_id}/staffing-insight/

Keep route names consistent with current BFF and admin URL patterns. Do not overload an existing POST action route.

### 8.3 Authoritative data sources

Use existing database views and services:

- VEventSummary / v_event_summary.
- VEventPostCapacity / v_event_post_capacity.
- Existing accepted-unassigned query/view already referenced by assignment_service.py, if available in the deployed contract.
- EventApplications for pending/waitlisted state counts where needed.
- Attendance for check-in and pending-confirmation summaries.
- Existing coordinator permission helper.

Relevant code:
- backend/apps/events/models.py — VEventPostCapacity and VEventSummary.
- backend/services/query_service.py — get_event_summary() and event read helpers.
- backend/services/assignment_service.py — get_post_capacity_summary() / accepted-unassigned query use.
- backend/bff/coordinator/views.py — EventPostCapacityView.
- backend/bff/coordinator/urls.py — event manager routes.
- backend/common/permissions.py — get_event_for_manager_or_404().

Do not rebuild capacity rules from raw application counts. Prefer the database's computed remaining/assigned values from v_event_post_capacity.

### 8.4 Required response shape

Suggested response:

    {
      "event_id": 123,
      "event_title": "Community clean-up",
      "event_status": "published",
      "start_at": "...",
      "summary": {
        "required_headcount": 30,
        "assigned_count": 22,
        "open_slots": 8,
        "accepted_unassigned": 2,
        "pending_applications": 7,
        "waitlisted_applications": 1,
        "checked_in_count": 0,
        "pending_confirmations": 0,
        "coverage_percent": 73.3
      },
      "posts": [
        {
          "post_id": 501,
          "title": "Logistics",
          "status": "open",
          "required_headcount": 10,
          "assigned_count": 6,
          "remaining": 4
        }
      ],
      "signals": [
        {
          "code": "STAFFING_GAP_NEAR_START",
          "severity": "high",
          "title": "Open positions remain close to event start",
          "evidence": {
            "open_slots": 8,
            "hours_until_start": 36
          }
        }
      ],
      "generated_at": "..."
    }

The exact serializer names may vary, but keep the distinction between open slots, accepted-but-unassigned, pending, and waitlisted. These are not interchangeable counts.

### 8.5 Calculation rules

- Per-post required headcount, assigned count, remaining, and status come from VEventPostCapacity.
- Event-level assigned count and application state counts come from VEventSummary or existing authoritative service queries.
- Accepted-but-unassigned should use the existing accepted-unassigned view/query if it exists in the deployed v0.12.0 contract. Do not infer it as accepted_count minus assignment_count if those totals can include cancelled or otherwise non-comparable rows.
- Open slots should be derived from the sum of the database view's remaining values for relevant open posts.
- Coverage percentage is a descriptive metric. Define the numerator and denominator clearly; return null when the denominator is zero.
- Do not report cancelled posts as active shortages.
- Distinguish accepted-but-unassigned applications from genuinely unfilled open posts.
- Include the time window used for urgency signals.

### 8.6 Deterministic signal rules

Start with explicit rules in one service/configuration module. Suggested initial rules:

| Condition | Signal |
|---|---|
| Open slots > 0 | STAFFING_GAP |
| Open slots > 0 and event starts within 72 hours | STAFFING_GAP_NEAR_START |
| Accepted-unassigned > 0 | ACCEPTED_UNASSIGNED |
| Pending applications > 0 and deadline is near/passed | APPLICATION_BACKLOG |
| A post has remaining > 0 while another post is full | POST_COVERAGE_IMBALANCE |

Thresholds must be configurable constants and covered by tests.

Use neutral, evidence-based language. Do not imply misconduct, volunteer unreliability, or a probability of event failure. Do not claim an event will fail. These are indicators to assist a human coordinator.

### 8.7 Permission boundaries

Coordinator:
- Require authenticated, active, approved coordinator.
- Re-authorize the event with get_event_for_manager_or_404(request.user, event_id, require_write=False).
- Return only the selected event's information.
- Do not let one coordinator query another coordinator's event by changing event_id.

Admin:
- Require ensure_admin(request).
- Apply the admin/super-admin AI policy from Section 6.
- Super admin may inspect any event.
- Standard admin sees only data covered by the current admin tier and endpoint policy.
- No assistant response should include individual volunteer T3 data.

Volunteer:
- Do not expose event-wide staffing rosters or other volunteers' application/assignment data.
- A volunteer may see only public event capacity already included in T0 public event data and their own participation state.

### 8.8 UI integration

Coordinator mobile:
- Add a Staffing & Coverage card to CoordinatorEventDetailScreen.
- Load it independently from the event's main summary/posts.
- Refresh the card after application decisions, post updates, assignment changes, event lifecycle changes, and attendance mutations.
- Do not reload the entire coordinator workspace.

Admin web:
- Add an independently loaded staffing card to the event inspector/dashboard.
- Refresh only the selected event staffing card after relevant actions.
- Use the admin card-refresh behavior in Section 3.

AI chat:
- Coordinators can ask for staffing gaps for their managed events.
- Admins can ask for staffing summaries within their allowed event scope.
- The LLM may explain returned values but must not invent or recalculate them.

### 8.9 Tests for Feature 2

Cover:
- Event not found returns the expected masked error.
- Coordinator cannot inspect an event outside their manager scope.
- Pending coordinator cannot use coordinator tools.
- Owner-as-monitor read access remains read-only.
- Superadmin can inspect all events within its explicit policy.
- Standard admin is limited by the configured tool policy.
- Capacity values match VEventPostCapacity.
- Accepted-unassigned is distinct from open slots.
- Cancelled/full/closed posts are not incorrectly reported as open shortages.
- Zero headcount avoids divide-by-zero.
- Near-start thresholds use timezone-aware event times.
- No volunteer PII appears in the response.
- Read-only behavior: no assignments or applications are created/changed.

---

## 9. Admin and mobile chat UI integration

### 9.1 Admin portal

Add a reusable assistant launcher/panel from the shared admin base template:

- backend/admin_portal/templates/admin_portal/base_admin.html

Behavior:
- Visible only to authenticated admins after the existing admin shell guard.
- Super-admin and standard-admin messages use the same endpoint, but server-side tool capabilities differ by actor.
- Clear conversation action.
- Loading, retry, provider-unavailable, and rate-limit states.
- Source links navigate to existing event/user pages through allowlisted action types.
- No arbitrary model-generated URL execution.
- The assistant must not block other admin page functions.

Do not send server-rendered page context, all rows, or hidden DOM data into the chat prompt. The browser sends only the user's message and the bounded conversation history.

### 9.2 Mobile

Suggested feature structure:

    mobile/src/features/assistant/
        screens/AssistantScreen.tsx
        components/ChatMessage.tsx
        components/ChatComposer.tsx
        components/SourceReference.tsx

Add:
- mobile/src/data/contracts/assistantRepository.ts
- mobile/src/data/endpoints/assistantApi.ts
- mobile/src/data/dto/assistantDto.ts
- mobile/src/data/http/HttpAssistantRepository.ts
- mobile/src/data/mock/MockAssistantRepository.ts

Update:
- mobile/src/data/contracts/index.ts
- mobile/src/data/http/index.ts
- mobile/src/data/mock/index.ts
- mobile/src/app/RepositoryProvider.tsx
- mobile/src/navigation/routeNames.ts
- mobile/src/navigation/navigationTypes.ts
- mobile/src/navigation/MainDrawerNavigator.tsx
- mobile/src/navigation/MainDrawerContent.tsx

Keep the feature behind an assistant feature flag until the backend/provider is configured. Mock mode must remain usable without a provider key.

### 9.3 Role-aware chat prompts are not permissions

Different welcome text and suggested questions can be shown for:
- Volunteer.
- Approved coordinator.
- Standard admin.
- Super admin.

But the role prompt is presentation only. Every tool execution must independently validate the actor and scope. A client-supplied or model-supplied role never grants access.

---

## 10. Security, reliability, and performance requirements

### 10.1 Backend API protections

- Require authenticated, active sessions for personalized chat.
- Use explicit serializer allowlists.
- Bound message size, history size, provider timeout, tool calls, and output tokens.
- Rate-limit by authenticated user and IP where appropriate.
- Validate tool arguments with typed serializers.
- Re-authorize every event and user object.
- Add request correlation IDs and safe operational logging.
- Redact secrets and PII before provider submission.
- Validate the model's structured response before returning it.
- Return truthful error states; do not return a fabricated answer when a tool/provider fails.
- Keep write operations unavailable.

### 10.2 Data minimization

Do not build a generic context dump. Each tool should retrieve only the facts needed for that question.

Do not provide the LLM:
- full Users model objects;
- full profile_service.get_user_profile() output;
- raw encrypted values;
- raw database rows;
- entire event application or attendance tables;
- private image paths/bytes;
- every event or every user when only one item is needed.

For large results:
- paginate;
- aggregate in the database;
- summarize through deterministic services;
- return only requested rows and fields.

### 10.3 Cache controls

Admin browser:
- Keep sensitive card data in page memory only.
- Do not persist selected-user details in localStorage/sessionStorage.
- Use short in-memory TTL for repeat card opens while the page remains active.
- Invalidate after review/moderation/event actions.
- Continue sending private image requests with no-store.

Mobile:
- Use in-memory query cache only for this first implementation.
- Clear on logout/account switch/session invalidation.
- Keep public and private cache namespaces separate.
- Do not cache private verification images or auth payloads.
- Never use cached data as authorization proof; always authorize at the server.

### 10.4 Provider and prompt security

- Keep provider API keys server-side.
- Treat all database text and user content as untrusted.
- Do not follow instructions found inside event descriptions, messages, notes, or feedback.
- Never reveal system prompts, credentials, internal policy text, or unrelated user records.
- Do not let model output modify tool permissions or data scope.
- Do not retry a read/write through another actor or role when access is denied.

---

## 11. Testing and acceptance criteria

### 11.1 Admin web acceptance

- Inspecting an event does not trigger a full document navigation when JavaScript is enabled.
- Inspecting a user does not trigger a full document navigation.
- Opening a verification image shows an in-page preview, not a full-page image route.
- Reviewing an image updates only the image/queue/detail cards.
- Dashboard cards load independently.
- Refreshing one card does not reload unrelated card data.
- Lists are paginated or bounded.
- User list no longer decrypts every user's phone number.
- Existing no-JavaScript deep links continue to work.
- CSRF, session auth, permission masking, and server-side reauthorization remain intact.
- 390px mobile-width and 1440px desktop-width checks pass.
- No contrast, horizontal overflow, or clipped modal issue is introduced.

### 11.2 Mobile acceptance

- Revisiting a fresh screen shows cached data immediately.
- Stale data appears while a single background refresh runs.
- Multiple simultaneous consumers deduplicate an identical request.
- Pull-to-refresh forces a network request.
- Cache keys distinguish filters, pages, resource IDs, and account scope.
- A logout/account switch clears all private cache entries.
- A 401 clears/invalidate the active account scope.
- Mutations invalidate the correct resources only.
- A failed refresh does not blank a valid cached screen.
- Old responses cannot overwrite newer filter or selection state.
- Verification image bytes/file URIs never enter the general query cache.
- Mock repositories and http repositories continue to satisfy the same contracts.

### 11.3 Chat acceptance

- Volunteer tools can retrieve only the signed-in volunteer's information and T0 public events.
- Coordinator tools can retrieve only events where the actor passes the manager guard.
- Coordinator T2 volunteer fields are available only when the existing T2 guard returns true.
- Standard admins receive only their approved assistant data tier.
- Super admins can inspect all event operational data and T1 public user cards.
- Super admins do not receive T3 user PII through the chat assistant.
- Client cannot set the actor, role, tool list, or authorization scope.
- History is limited to two exchanges and is cleared on logout/new chat.
- No chat data is persisted to PostgreSQL.
- Prompt injection in retrieved records does not invoke new tools or broaden access.
- Provider timeout/rate limit/error returns a useful truthful message.
- Suggested actions are allowlisted and do not perform business mutations.

### 11.4 Feature 1 acceptance

- Recommendation output is deterministic for the same source facts and policy version.
- Eligibility rules run before scoring.
- Scores and reasons are explainable and bounded.
- Event capacity/deadline/schedule values match authoritative service results.
- The volunteer can open the existing event detail and application workflow.
- The recommendation endpoint does not create applications or assignments.
- No other volunteer's private information is used or returned.

### 11.5 Feature 2 acceptance

- Capacity numbers match v_event_post_capacity.
- Event summaries match v_event_summary.
- Accepted-unassigned, pending, waitlisted, assigned, and open-slot counts remain distinct.
- Coordinator cannot retrieve a non-managed event.
- Admin access follows the current policy matrix.
- No automatic assignments or state changes happen.
- All signals show metric evidence and the applied threshold/window.
- Zero denominators, empty events, cancelled posts, and events near start are tested.

### 11.6 Suggested verification commands

Run from the relevant project directories and adapt only if current package scripts differ.

Mobile:

    cd mobile
    npx tsc --noEmit
    npm test -- --watchAll=false

Backend:
- Run the focused tests for each modified BFF/service/admin module using the repository's configured Django test runner.
- Run python backend/manage.py check.
- Validate the OpenAPI schema using the existing drf-spectacular project command/configuration.
- Run the relevant existing backend test suite after the focused tests.

Do not run database seed scripts or migrations. Do not change the local/prod database to make tests pass. Use isolated test DB/fixtures consistent with the current repository.

---

## 12. Suggested execution checklist for Gemini CLI

### Phase 0 — Branch and baseline

- Confirm current branch is feature/ai-chat-cache-ml-insights.
- Confirm HEAD descends from main commit 6239ebf922239a0e4500edc0144d142e961d55b9.
- Read this guide plus the source references in Sections 1–2.
- Record current focused test baseline before edits.
- Confirm no pending unrelated user changes are present in the working tree.
- Do not touch database schema or seed data.

### Phase 1 — Admin card refresh

- Add partial/card endpoints and partial templates.
- Refactor event inspector into list and selected-detail requests.
- Refactor user inspector into list and selected-detail requests.
- Remove decrypted phone from the user list context.
- Make verification preview modal-based; retain private no-store file streaming.
- Convert verification review/moderation actions to card-level fetch submissions.
- Split dashboard data loading and aggregate feedback at the database.
- Keep progressive-enhancement links/forms.
- Add/adjust backend tests.
- Manual check at 390px and 1440px.

### Phase 2 — Mobile query cache

- Implement bounded in-memory QueryCache.
- Add TTL and key policy.
- Add single-flight request deduplication.
- Add stale-while-revalidate and force refresh.
- Add account/session/data-mode clearing.
- Wrap/extend HTTP repositories, not screens with direct fetch.
- Update screen focus and pull-to-refresh behavior.
- Add precise invalidation after each relevant successful mutation.
- Test mock and HTTP mode parity.

### Phase 3 — Read-only AI backend

- Add assistant API route and serializers.
- Add provider abstraction and environment configuration.
- Add bounded conversation validation.
- Add role-scope policy and read-only tool registry.
- Add safe redaction and structured response validation.
- Add tests for role boundaries, event boundaries, injection, history cap, PII, timeouts, and no writes.

### Phase 4 — Chat UIs

- Add admin floating panel in base_admin.html.
- Add mobile assistant screen and navigation.
- Extend RepositoryProvider with assistant repository.
- Keep mock mode provider-independent.
- Add loading/error/empty/clear states.
- Add allowlisted navigation actions.

### Phase 5 — Feature 1

- Add recommendation service and endpoint.
- Implement eligibility using existing query/application/availability services.
- Add versioned deterministic scoring weights.
- Add mobile “Recommended for you” card.
- Reuse EventDetail and existing apply flow.
- Add explanation and deterministic tests.

### Phase 6 — Feature 2

- Add staffing insight service and coordinator/admin read endpoints.
- Read authoritative views and existing accepted-unassigned query.
- Add coordinator staffing card and admin event card.
- Connect to chat tools.
- Add event-scope and metric consistency tests.

### Phase 7 — Final review

- Run backend and mobile verification.
- Review every new endpoint for authentication, object-scope checks, field allowlists, pagination, and cache headers.
- Review every new tool for read-only behavior.
- Verify no new DB migration/schema file was added.
- Verify no verification image or PII entered the cache or LLM context.
- Summarize files changed, tests run, test results, and any unresolved policy decisions.
- Do not merge the branch without the project owner's approval.

---

## 13. Core file reference index

### Admin web

| Path | Existing responsibility / likely change |
|---|---|
| backend/admin_portal/views.py | Server-rendered pages and admin API views; split detail/card retrieval |
| backend/admin_portal/urls.py | Add specific card/detail routes |
| backend/admin_portal/templates/admin_portal/base_admin.html | Shared shell, nav, add chat panel |
| backend/admin_portal/templates/admin_portal/dashboard.html | Independent dashboard cards |
| backend/admin_portal/templates/admin_portal/events_detail.html | Event inspector AJAX behavior |
| backend/admin_portal/templates/admin_portal/users.html | User inspector and verification preview |
| backend/admin_portal/templates/admin_portal/coordinator_board.html | Partial actions/inspect details |
| backend/admin_portal/templates/admin_portal/partials/ | New card fragments |

### Backend permission/privacy/business logic

| Path | Existing responsibility / required reuse |
|---|---|
| backend/common/permissions.py | ensure_active_user, ensure_admin, ensure_approved_coordinator, event manager scope, T2 scope |
| backend/common/privacy.py | T0–T4 field allowlists and public/T2 cards |
| backend/services/query_service.py | Public events, event posts, event summaries, dashboard aggregates |
| backend/services/profile_service.py | Self-profile and charity interests; contains decrypted sensitive self data |
| backend/services/application_service.py | Application rules and authorized application views |
| backend/services/availability_service.py | PostgreSQL-backed availability/conflict checks |
| backend/services/assignment_service.py | PostgreSQL-backed assignment lifecycle and existing capacity/unassigned queries |
| backend/services/event_service.py | Event creation/lifecycle |
| backend/services/staffing_insight_service.py | New deterministic read-only staffing summary |
| backend/services/recommendation_service.py | New volunteer-to-event ranking service |
| backend/ai/ | New provider, chat, tool registry, prompt/data security modules |
| backend/bff/urls.py | Mount assistant route |
| backend/bff/volunteer/urls.py | Mount volunteer recommendations |
| backend/bff/volunteer/views.py | Recommendation API view |
| backend/bff/coordinator/urls.py | Mount staffing insight endpoint |
| backend/bff/coordinator/views.py | Coordinator staffing view |
| backend/config/settings/base.py | Only required app/config registration; no secret literals |
| .env.example | Non-secret provider/config placeholders |

### Mobile

| Path | Existing responsibility / likely change |
|---|---|
| mobile/src/app/RepositoryProvider.tsx | Add assistant repository; integrate cache-aware implementations |
| mobile/src/app/UserContext.tsx | Clear private caches on identity/logout/session changes |
| mobile/src/core/api/apiClient.ts | Existing transport; retain timeout/AbortSignal/request ID/redaction |
| mobile/src/data/contracts/ | Repository contracts |
| mobile/src/data/endpoints/ | API endpoint modules |
| mobile/src/data/dto/ | API DTOs |
| mobile/src/data/http/ | HTTP repository implementations |
| mobile/src/data/mock/ | Mock repository implementations |
| mobile/src/data/cache/ | New in-memory query cache |
| mobile/src/features/events/screens/EventDiscoveryScreen.tsx | Recommended events card and cache-aware refresh |
| mobile/src/features/events/screens/EventDetailScreen.tsx | Cached detail and application-state refresh |
| mobile/src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx | Staffing & coverage card |
| mobile/src/features/assistant/ | New chat UI |
| mobile/src/navigation/MainDrawerNavigator.tsx | Assistant route |
| mobile/src/navigation/MainDrawerContent.tsx | Role-appropriate assistant navigation item |
| mobile/src/core/storage/verificationPhotoStorage.ts | Keep photo slot storage separate from query cache |

### Database and tests

| Path | Rule |
|---|---|
| docs/full_database_details.md | Frozen schema reference |
| postgres_sql/updated_volunteer_coordination_system_Database.sql | Authoritative SQL; do not modify in this task |
| postgres_sql/self_test.sql | Existing DB verification reference; do not modify |
| backend/apps/events/tests/ | Event/application/assignment test conventions |
| backend/apps/accounts/tests/ | Auth/profile/permission test conventions |
| backend/apps/audit/tests/ | Admin/dashboard/privacy-related test conventions |
| mobile/__tests__/ | Mobile unit/integration test conventions |
| mobile/src/data/http/__tests__/ | HTTP repository contract tests |

---

## 14. Explicit non-goals

Do not implement these in this branch:

- Predictive staffing demand model.
- Volunteer churn/reliability/no-show prediction.
- Volunteer fraud or misconduct prediction.
- Automated moderation decisions.
- Automated verification-image/ID review.
- Automated assignment or application approval.
- Chat transcript persistence.
- Vector database/pgvector/RAG database schema.
- New database tables, columns, functions, triggers, views, indexes, or migrations.
- A configurable multi-grade admin role model without an approved source-of-truth.
- A coordinator-facing pre-application private volunteer candidate recommender.
- Replacing the existing event/availability/application/assignment business logic.

These may be evaluated separately after the two requested features are stable and measured.

---

## 15. Final delivery report format

When implementation is complete, Gemini CLI should report:

1. Branch name and final HEAD commit.
2. Files changed grouped by Admin Web, Mobile, Backend AI, Feature 1, Feature 2, Tests.
3. Any API paths added or changed.
4. Cache policy and invalidation rules implemented.
5. Role/privacy matrix implemented.
6. Confirmation that the database schema and SQL files were not changed.
7. Backend test commands and results.
8. Mobile typecheck/test commands and results.
9. Manual admin responsive checks.
10. Any failures, limitations, or unresolved admin-tier decisions.

A feature is not complete merely because the UI renders. Completion requires server-side authorization, cache isolation, tests, and confirmation that no existing VCS business invariant was bypassed.
