# Mobile UI Sync — Gemini CLI Implementation Plan

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Target branch:** `mobile/ui_sync`  
**Base branch:** `main`  
**Reference main HEAD:** `ee69f0bfcc8a3637fd337afd48a677729ba39f91`  
**Branch state when this guide was prepared:** 7 commits ahead of `main`, 0 behind  
**Mobile stack:** React Native 0.88.1, React 19.3.0, TypeScript 6.0.3  
**Backend:** Django REST Framework BFF, PostgreSQL database-first  
**Mode:** Continue implementation and verify locally. Do not merge or push to main.

---

## 1. Mission and execution rules

Complete the mobile UI/template improvements needed before the controlled move from Template Mode to HTTP Mode. Work on the existing `mobile/ui_sync` branch only.

This is an implementation handoff, not permission to redesign the backend or database architecture. Use the existing screen, domain, DTO, mapper, repository, endpoint, BFF, and service layers. Extend them only when the verified contract requires it.

### Non-negotiable requirements

1. **Do not use a brown theme.** The target is blue + cream, with sage or olive green as a secondary/supporting colour. A subtle Workshift influence is acceptable in spacing, card composition, typography, and visual hierarchy. Do not apply the previously discussed brown-spectrum palette.
2. Preserve location fields, landmark fields, coordinates, geofence configuration, and the current clearly-labelled map/location placeholders. Native map, tile rendering, interactive map selection, GPS hardware integration, and routing remain a later phase.
3. Do not change PostgreSQL schema, SQL functions, triggers, constraints, views, canonical SQL files, or migrations. The prototype database is frozen.
4. Do not make a new BFF endpoint merely because a screen needs a value. Prove that no existing API/serializer/service provides it before proposing a backend contract change. For this task, prefer client-side derivation from existing read contracts.
5. Never fabricate server IDs, timestamps, counts, status, attendance state, user identity, coordinates, or permissions.
6. Never show a success state before a successful repository/API result. A failed, rejected, timed-out, or malformed request must remain a failure.
7. Template Mode must remain local and network-free. It must not call the BFF, even for a connectivity ping. HTTP failures must never fall back to demo fixtures.
8. Preserve authorization and privacy rules, including owner-as-monitor read-only access and coordinator-only/T2 profile data rules.
9. Do not remove a field or control because its native implementation is deferred. A deferred control must remain visible as an accurately labelled placeholder when it belongs in the template.
10. Do not rewrite large modules just to make stylistic changes. Prefer small, testable changes with a clear source-to-screen reason.

### Token and effort discipline

- Start with the exact files and existing branch changes listed below. Do not dump the whole repository or reread unrelated folders.
- Search exact symbols and inspect focused ranges. Avoid repeated broad searches.
- Do not generate speculative architecture options. Pick the least invasive design consistent with the verified contracts.
- When a value or backend capability cannot be proved, mark it **UNVERIFIED** and do not invent an implementation.
- Do not duplicate logic that already exists in shared components, date/time utilities, repositories, or tests.
- Do not spend time on unrelated refactors, formatting-only churn, old documentation, or database internals outside this task.

---

## 2. Branch setup and baseline verification

Run from the repository root:

```bash
git fetch origin
git switch --track origin/mobile/ui_sync
# If the local branch already exists, use: git switch mobile/ui_sync
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -10
git diff --stat origin/main...HEAD
```

Expected branch: `mobile/ui_sync`.

Expected state from the handoff: branch based on main and already contains the remote coding described in Section 3. Do not reset, rebase, or force-push. If the branch is not available or its ancestry differs, stop and report the exact branch/commit state before editing.

Before adding code, inspect only:
- `backend/services/cancellation_policy.py`
- `backend/services/assignment_service.py`
- `backend/services/application_service.py`
- `backend/apps/events/tests/test_services_application_assignment_phase6.py`
- `mobile/src/features/dashboard/screens/DashboardScreen.tsx`
- `mobile/src/data/mappers/dashboardMapper.ts`
- `mobile/src/data/mappers/__tests__/dashboardMapper.test.ts`

Do not recreate or revert work already present.

---

## 3. Work already committed on this branch

These changes were made remotely and are already in the branch. Treat them as existing implementation to review and test, not as tasks to redo.

### 3.1 Shared 48-hour policy

File: `backend/services/cancellation_policy.py`

- Defines the volunteer self-cancellation lock as 48 hours.
- Uses timezone-aware Django time.
- Implements the comparison against the scheduled shift start.
- The current implementation blocks when the shift starts **less than 48 hours from now**. Exactly 48 hours remains outside the block.

### 3.2 Direct assignment cancellation protection

File: `backend/services/assignment_service.py`

- Applies the policy when the actor is the assigned volunteer.
- Applies to active `assigned` and `confirmed` assignment states.
- A volunteer self-cancel inside the window receives a domain error with code `cancellation_window_closed` and HTTP status 409.
- An authorized event manager retains the existing cancellation override.
- Existing authorization, completed-state, idempotency, and session-context handling remain in place.

### 3.3 Accepted application withdrawal bypass protection

File: `backend/services/application_service.py`

- The accepted-application withdrawal path is guarded because the PostgreSQL application after-trigger cascades a withdrawal to active assignments.
- If the applicant attempts to withdraw an accepted application and an active assignment exists inside the 48-hour window, the service rejects the withdrawal with the same domain code/status.
- The cutoff does not block an authorized event manager's existing withdrawal override.
- If an accepted application has no active assignment, this implementation does not infer a shift schedule and therefore does not apply an assignment-based cutoff. Do not silently change this policy without evidence and an explicit product decision.

### 3.4 Backend tests added

File: `backend/apps/events/tests/test_services_application_assignment_phase6.py`

Added coverage for:
- Volunteer assignment cancellation rejected within 48 hours.
- Accepted application withdrawal cannot bypass the restriction.
- Event manager can still cancel within 48 hours.

These tests were added but **were not executed by the remote editing session**. Run them only after verifying the Django test database is isolated from the frozen prototype database (see Section 10).

### 3.5 Dashboard cancellation truthfulness

File: `mobile/src/features/dashboard/screens/DashboardScreen.tsx`

- The cancellation handler now checks `result.success`.
- Success closes the modal and reports a successful cancellation.
- A rejected cancellation displays a failure message and keeps the modal open.
- Thrown errors display an error message.
- No failure is presented as a successful cancellation.

### 3.6 Upcoming commitment time filtering

File: `mobile/src/data/mappers/dashboardMapper.ts`

- Upcoming commitments must be `assigned` or `confirmed`.
- The scheduled end timestamp must parse and must not be earlier than the supplied/current time.
- Results are sorted by scheduled start.
- The mapper accepts an optional `now: Date` argument for deterministic testing.

File: `mobile/src/data/mappers/__tests__/dashboardMapper.test.ts`

- Added a deterministic test proving assignments whose scheduled end is in the past are excluded.

---

## 4. Product direction and UI design constraints

### 4.1 Colour direction

Use the current blue/cream design as the base, with sage/olive as a secondary status/accent family.

The checked-in light theme currently includes:
- Cream background: `#FAF4E8`
- Warm-white surface: `#FFFDF8`
- Raised warm-cream surface: `#F3EAD8`
- Deep blue-black text: `#0E1A33`
- Blue primary: `#2563EB`
- Blue accent: `#0369A1`

Keep the identity recognisably blue + cream. Introduce or refine sage/olive support through central theme tokens, not scattered inline hex values. Candidate sage/olive colours may be selected by the implementer only after checking text and badge contrast against the actual surfaces. Do not use brown, bronze, tan, red-brown, gold-brown, or brown-dominant card surfaces.

Preserve the dark theme. Do not break theme switching or system preference detection.

### 4.2 Visual system

- Keep the existing shared component layer: `AppButton`, `AppCard`, `AppText`, `AppInput`, `StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`, `SectionHeader`, and other existing shared primitives.
- Use consistent card padding, spacing, corner radii, typography, status badges, and section hierarchy.
- Use the existing theme provider/tokens. Avoid direct hard-coded colours in screens.
- Keep information density appropriate for phones. Do not make the dashboard an oversized desktop-style analytics board.
- Keep safe-area handling, scroll behaviour, keyboard visibility, touch targets, and accessibility labels correct.
- Form and modal content must remain usable when the on-screen keyboard is open. Use `KeyboardAvoidingView` only where it is appropriate for the screen/platform and verify scroll behaviour rather than wrapping every component blindly.

### 4.3 Location and map preservation

The following fields/areas must remain present:
- Location/venue name.
- Landmark and arrival instructions.
- Nullable latitude and longitude.
- Geofence radius and geo-check-in enablement.
- Geo check-in opening buffer and map provider, when the form's backend contract supports them.
- Map preview placeholder on event detail.
- Map pin selector placeholder in event creation/edit.

Keep placeholders explicitly labelled as preview/template-only. Do not generate fake device coordinates or claim GPS verification. Native map/GPS implementation is out of scope.

---

## 5. High-priority dashboard and operational status work

### 5.1 Dashboard field accuracy

Review the complete dashboard and remove misleading fixed text, especially:
- Fixed greeting such as `Good morning` when the actual time is not morning.
- Fixed `+3 this month`.
- Fixed `4 causes`.
- Fixed `Next Sunday`.
- Any claim that all upcoming commitments are confirmed when some have status `assigned`.
- Any claim that a shift is in progress based only on an event's administrative status.

All labels/subtext must be derived from real domain values or be clearly static explanatory copy. If the required field is not available, omit the metric or show a neutral empty/unavailable state.

Review date fallbacks in `UpcomingCommitmentCard.tsx`. Do not substitute a fixed month/day when a timestamp is invalid. Show an explicit unknown/invalid-date fallback that does not resemble a real schedule.

### 5.2 Volunteer Active Shift card

Add a clear Active Shift card to the volunteer dashboard. It should answer:
- Which event and volunteer role is the user assigned to?
- What is the scheduled start/end time?
- Where is the shift?
- What is the actual current operational/attendance state?
- What action is available now, if any?

Use current contracts; do not create a new endpoint just for this card.

Known contract sources:
- `GET /api/v1/me/assignments/` returns the user's assignment data, including assignment ID, event ID/title, event status, location name, post/role title, assignment status, schedule start/end, confirmation timestamp and attendance status (where present).
- The attendance history contract includes `assignment_id`, attendance `status`, `confirmation_status`, check-in and checkout timestamps. Use the assignment ID to join records when that field is present.
- `HttpDashboardRepository` already loads assignments and attendance history in parallel.
- Template fixtures must provide realistic, clearly demo-labelled examples of each renderable state.

Derive a currently running schedule using the actual schedule window:
`schedule_start <= now <= schedule_end`.

Do not conflate:
- `assignment.status` (assigned/confirmed/completed/cancelled),
- `attendance.status` (expected/checked_in/absent/completed/cancelled),
- `attendance.confirmation_status` (not_required/pending/confirmed/rejected),
- `event.status` (draft/published/active/completed/cancelled).

Show only a state that the available source fields prove. For example:
- Checked in + pending confirmation: show an awaiting-coordinator-confirmation state.
- Checked in + confirmed: show checked-in/on-duty.
- Expected or no attendance record: show that the shift window is open/attendance is not recorded; do not claim the volunteer is checked in.
- Outside the shift window: do not call it the current active shift.

The audit report proposed a 30-minute geofence buffer, but do not apply it to the Active Shift start calculation unless the volunteer-facing source actually provides the event's configured buffer. A manager-only configuration field must not be invented in the volunteer DTO.

### 5.3 Dual-role dashboard

A coordinator may also be a volunteer. Do not replace volunteer dashboard content when `isCoordinator` is true.

Provide two distinct operational cards when the user qualifies:
1. Volunteer Active Shift, derived from the user's own assignments and attendance.
2. Coordinator Active Event, derived from managed events and the event's schedule window.

For the coordinator card:
- Use the existing coordinator event list/repository data and schedule.
- Derive "currently in its scheduled window" from `start_at <= now <= end_at`.
- Keep the event's administrative lifecycle status separately visible.
- Do not treat `status === 'active'` as proof that the event is happening right now.
- Respect manager/owner-as-monitor read-only state for all actions.

If neither card applies, do not render an empty active card; use the upcoming/tomorrow sections instead.

### 5.4 Tomorrow's commitments / reminder content

Add a dashboard section that tells the user which accepted/assigned event shifts are scheduled for tomorrow.

- Use `Asia/Yangon` (Myanmar Time, UTC+06:30) for date-boundary decisions and display.
- Calculate tomorrow using the Yangon calendar day, not the phone's current local calendar day.
- Filter by scheduled shift start within tomorrow's Yangon day.
- Show event title, role, start time, venue/location, and assignment/attendance status where those values are actually supplied.
- Include a useful empty state when there are no commitments tomorrow.
- Include both volunteer and coordinator responsibilities where appropriate, but keep the two roles visually distinct.
- Make the reminder section refresh with the same source data as the dashboard. Do not create a static fake reminder list.

Existing utility anchor: `mobile/src/shared/utils/dateTimeUtils.ts` contains Myanmar timezone constants and date/time helpers. Inspect and reuse it; extend only if the required day-boundary operation is missing.

### 5.5 Coordinator overview accuracy

The current HTTP coordinator repository counts both `active` and `published` events as active events. Correct this: published means the event is published/open for recruitment; active is a different administrative lifecycle state. Do not relabel published events as active.

Make sure "Checked-in Today" is not substituted with an all-time count if the today-specific metric is missing. An unavailable value should be shown as unavailable/unknown or a correctly labelled all-time metric, not silently conflated.

---

## 6. Local reminder / notification implementation

### 6.1 Architecture boundary

The repository audit found no notification module, device token registration API, remote push service, or notification database table. PostgreSQL is frozen.

For this phase:
- Implement in-app tomorrow commitments first.
- Evaluate device-local scheduled notifications only.
- Do not implement FCM/APNs/server push.
- Do not add `user_device_tokens` tables or device-registration BFF routes.
- Do not add a notification inbox with fake unread counts.

### 6.2 Dependency verification before adding a package

The attached audit identified `@notifee/react-native` as a candidate, not a verified install for this exact project build.

Before adding any native notification package:
1. Check the current package's official compatibility/installation guidance against React Native 0.88.1, React 19.3.0, and the project's New Architecture setting.
2. Verify the installed Android Gradle/Java and iOS requirements from the actual project configuration.
3. Check the package version's maintenance and peer-dependency constraints.
4. Inspect the existing Android and iOS native configuration before making changes.
5. If compatibility cannot be verified, do not install it. Keep the in-app reminder working and report the blocker.

Do not use deprecated `react-native-push-notification`.

### 6.3 If a verified local-notification package is usable

Keep the notification feature behind a small service interface. UI components must not call the native package directly.

Required behaviours:
- Ask permission at a sensible point, with a clear explanation. Handle denied/restricted permission gracefully.
- Schedule a stable-ID reminder for each eligible real HTTP-mode assignment on the day before, at 20:00 Asia/Yangon, where the assignment is still upcoming.
- Include event title, role and start time in the reminder. Do not expose unnecessary personal data.
- If an eligible assignment is created/accepted after the scheduled digest time on the previous day, schedule a one-shot reminder immediately, subject to the shift still being in the future and tomorrow's date rule.
- Reconcile after dashboard/assignment refresh: update the notification if start time or location changes.
- Cancel the matching notification when the assignment is cancelled or the accepted application is withdrawn.
- Clear user-specific scheduled notifications on logout to avoid leaking private shift details on a shared device.
- Use stable IDs based on the assignment identity, not array indexes.
- Prevent duplicate scheduling on repeated app launches or refreshes.
- Permission denial must not break the dashboard; the in-app tomorrow section remains the fallback.
- Do not schedule native reminders from Template Mode demo fixtures. A mock screen must not produce a real notification that could be mistaken for a real volunteer commitment.
- Test scheduling/reconciliation/cancellation using package mocks. Do not require a physical notification to pass Jest.

### 6.4 Fake notification badge

Inspect `mobile/src/shared/layout/AppHeader.tsx` and all usages. The audit found a default rose unread dot without a backing notification source and a bell press callback that may be unhandled.

Do not display a fake unread indicator. Either:
- remove the dot until there is a real local/in-app unread source, or
- derive it from the new notification/reminder source and make the bell action do something real.

Do not claim a notification has been delivered merely because a schedule request was accepted by the native library. Use accurate wording such as "Reminder scheduled" only when the native service confirms scheduling.

---

## 7. Screen-by-screen template coverage review

Inspect existing screens and current BFF/DTOs. Complete supported placeholder/editable/display fields and states; do not invent new backend properties.

### Volunteer-facing screens

1. **Dashboard**
   - Hero, role badges, accurate metrics, volunteer Active Shift, coordinator Active Event for dual-role users, tomorrow's commitments, aggregate feedback, upcoming commitments, attendance-backed completed history.
   - Provide loading, refresh, empty, offline/error and role-specific states.
2. **Event discovery**
   - Search, category/status filters supported by the actual endpoint, paging, empty/loading/error, event cards and truthful capacity.
3. **Event detail**
   - Purpose, description, date/time, application deadline, organizer, venue, landmark, nullable coordinates, map preview placeholder, event support, posts/roles, capacity, application state and application note.
4. **My Applications**
   - Application status/source, event/post, applied/decision time where supplied, volunteer note, withdrawal eligibility, confirmation and server rejection states. The new 48-hour rule must be reflected after a real server response; client-side time checks are only an explanatory pre-check.
5. **My Assignments**
   - Assigned/confirmed/completed/cancelled state, schedule, role, location, check-in, attendance confirmation state, onboarding acknowledgement, QR/manual check-in, checkout and feedback. Keep GPS/QR scanner hardware integration deferred where it is not already implemented.
6. **Profile view/edit**
   - Preserve all allow-listed editable profile fields; keep account/system identity, verification state, coordinator approval and rating fields read-only. Keep Tier-2 capability visibility governed by backend authorization.
7. **Availability**
   - Weekly rules, time slots, date exceptions/blackouts, notes, validation, add/edit/delete and conflict feedback.
8. **Verification/coordinator status**
   - Status and upload placeholders must be truthful. Real native image selection/upload is separate unless current code and dependencies already support it.
9. **Settings**
   - Theme preferences and Template/HTTP mode. Ensure Template Mode is visually clear and network-free. Do not run BFF ping while in Template Mode.

### Coordinator-facing screens

10. **Coordinator overview**
    - Correct total/published/active/draft counts, checked-in semantics, managed events, Active Event card and operational navigation.
11. **Managed events**
    - Event list, filters, status, schedule, location, current coordinator, owner-as-monitor banner, read-only state.
12. **Create/edit event wizard**
    - All serializer-supported fields, exact enum choices, required/optional/null handling, validation and review.
    - Preserve venue, landmark, coordinates, radius, geo buffer and provider controls.
    - Keep the map pin selector as a template placeholder.
13. **Event detail/operations**
    - Lifecycle actions with server-confirmed result, event summary, post/role management, capacity, location, schedule and ownership states.
14. **Applications**
    - Pending/accepted/waitlisted/rejected, applicant summary, available post, accept/reject/waitlist/invite actions, permission states and T2 visibility constraints.
15. **Assignments**
    - Accepted/unassigned list, post picker, optional group code, group leader, auto/manual assignment feedback, cancellation with proper authority/reason.
16. **Attendance**
    - Roster and attendance states, method/time, manual note, pending geo review, QR controls and checkout. Keep actual GPS/map behaviour deferred unless explicitly enabled in a later phase.
17. **Friends**
    - Keep the existing Coming Soon placeholder. Do not generate false social connections/messages.

### Navigation inventory consistency

The actual drawer navigator currently has 18 mounted entries. The audit explains why older docs cite 17:
- `ProfileEdit` is mounted in `MainDrawerNavigator.tsx` but omitted from `routeNames.ts`.
- `OtpLoginScreen` is a conditional external/root auth gate, not a drawer route.

Inspect `MainDrawerNavigator.tsx`, `navigationTypes.ts`, and `routeNames.ts`. Align route constants/types/tests with the actual mounted routes. Do not count the root OTP gate as a drawer route. Update incorrect documentation counts only where those files are in scope.

---

## 8. DTO and backend contract verification method

For every control or displayed field added/changed, trace the actual source:

`Screen -> domain model -> repository contract -> DTO -> mapper -> endpoint -> BFF serializer/view -> service -> existing DB model/view`

For derived status, document the exact inputs and derivation rule.

Known files to inspect selectively:
- `mobile/src/domain/models/dashboard.ts`
- `mobile/src/domain/models/event.ts`
- `mobile/src/domain/models/coordinator.ts`
- `mobile/src/data/dto/eventDto.ts`
- `mobile/src/data/dto/profileDto.ts`
- `mobile/src/data/dto/coordinatorDto.ts`
- `mobile/src/data/mappers/dashboardMapper.ts`
- `mobile/src/data/mappers/eventMapper.ts`
- `mobile/src/data/mappers/coordinatorMapper.ts`
- `mobile/src/data/contracts/dashboardRepository.ts`
- `mobile/src/data/contracts/eventRepository.ts`
- `mobile/src/data/contracts/coordinatorRepository.ts`
- `mobile/src/data/http/HttpDashboardRepository.ts`
- `mobile/src/data/http/HttpEventRepository.ts`
- `mobile/src/data/http/HttpCoordinatorRepository.ts`
- `mobile/src/data/mock/`
- `backend/bff/volunteer/serializers.py`
- `backend/bff/volunteer/views.py`
- `backend/bff/coordinator/serializers.py`
- `backend/bff/coordinator/views.py`
- `backend/services/assignment_service.py`
- `backend/services/application_service.py`

Do not infer a DTO property from a UI label. Verify the serializer output or request allow-list. If an optional server field may be absent, model it as optional/nullable and render a deliberate unknown/empty state.

---

## 9. Recommended implementation order

Complete the work in small stages and keep the branch in a buildable state.

### Stage A — verify existing branch work

- Check the current branch and compare it to `origin/main`.
- Review the cancellation policy/service/test and dashboard mapper changes in Section 3.
- Run the focused tests only after verifying a separate test database.
- Fix only concrete errors found by tests/typecheck; do not rewrite working policy code for stylistic preference.

### Stage B — dashboard data correctness

- Finish all dynamic/accurate metric labels.
- Ensure upcoming commitments are time-valid and sorted.
- Replace invalid date fallback values.
- Add Volunteer Active Shift and Coordinator Active Event.
- Add tomorrow's in-app commitments using Asia/Yangon day boundaries.
- Add tests for dual-role users, missing attendance, confirmed vs assigned, in-progress vs upcoming, event lifecycle vs actual schedule, and day-boundary cases.

### Stage C — coordinator metric correctness

- Separate `published` from `active`.
- Preserve today's vs all-time check-in semantics.
- Test event scheduled today while `published`, and event `active` but scheduled in the future.

### Stage D — local reminders

- Verify native package compatibility first.
- Implement an isolated reminder service, permission states, schedule reconciliation, update/cancel, logout cleanup and deduplication.
- Keep in-app reminders fully usable when notification permission is denied or a native package cannot be used.
- Do not schedule mock/demo assignments as real notifications.

### Stage E — UI consistency and form usability

- Apply blue/cream/sage-or-olive tokens centrally.
- Preserve both light and dark theme.
- Remove fake unread dot or connect it to a real source.
- Improve shared card/status/form/modal consistency.
- Add KeyboardAvoidingView/scroll handling to screens/modals where tested necessary.
- Preserve map/location placeholders.
- Complete the screen-by-screen supported field coverage from Section 7.

### Stage F — contract and quality verification

- Add/update tests for every new mapper derivation, status state, cancellation failure state, reminder service behaviour and screen branch.
- Run the local verification checklist in Section 10.
- Update the relevant mobile analysis/parity documentation to reflect actual completed work, not intended work.

---

## 10. Self-check and safety checklist

### 10.1 Source-of-truth checks

Before each implementation slice:
- [ ] Confirm current branch is `mobile/ui_sync`.
- [ ] Confirm worktree status and inspect the exact source files to change.
- [ ] Read actual serializer and service contracts before adding or changing DTO fields.
- [ ] Confirm whether an existing mapper/repository already exposes the required field.
- [ ] Use only fields returned by actual API responses or clearly labelled Template Mode fixture data.
- [ ] Keep a note for any unverified behaviour instead of guessing.

### 10.2 Cancellation policy checks

- [ ] Direct volunteer assignment cancellation at 47h59m is rejected.
- [ ] Direct volunteer assignment cancellation at exactly 48h is allowed by the current strict-less-than rule.
- [ ] Direct volunteer assignment cancellation beyond 48h is allowed.
- [ ] Accepted application withdrawal cannot bypass the active-assignment cutoff.
- [ ] Accepted application with no active assignment follows the documented current behaviour; do not silently invent a schedule.
- [ ] Authorized coordinator cancellation remains possible inside 48h.
- [ ] Owner-as-monitor cannot use write overrides.
- [ ] Unrelated users remain denied/masked according to existing permission policy.
- [ ] Completed/cancelled states preserve existing state rules.
- [ ] HTTP 409/domain errors are displayed as failure, never success.
- [ ] No SQL trigger/schema change is made.

### 10.3 Dashboard and status checks

- [ ] No hardcoded date, time, "this week", monthly count, next weekday or cause-count subtext is presented as live data.
- [ ] Old assignments do not remain in upcoming lists solely because their status is stale.
- [ ] Current shift is derived from schedule window, not `event.status === 'active'`.
- [ ] Attendance state is derived from actual attendance fields.
- [ ] An assigned/unconfirmed volunteer is not shown as checked in.
- [ ] Coordinator and volunteer cards remain separate for dual-role accounts.
- [ ] Published and active events are distinct.
- [ ] Missing schedule/attendance data produces an honest unknown/empty state.

### 10.4 Tomorrow/reminder checks

- [ ] Tomorrow boundaries use `Asia/Yangon`, independent of device timezone.
- [ ] Shifts just before/after Yangon midnight are tested.
- [ ] In-app tomorrow section works without notification permission.
- [ ] Template fixtures never create real system notifications.
- [ ] HTTP-mode reminder scheduling uses only real assignment IDs and server-backed schedules.
- [ ] Schedule changes update reminders.
- [ ] Cancellation/withdrawal removes reminders.
- [ ] Logout clears private scheduled reminders.
- [ ] Repeated refresh/app launch does not duplicate reminders.
- [ ] Permission denial is graceful.
- [ ] No remote push/device-token/database implementation is added.

### 10.5 Theme and map checks

- [ ] Primary remains blue.
- [ ] Page background remains cream.
- [ ] Sage/olive is supporting, not dominant.
- [ ] No brown-spectrum palette or brown card theme is introduced.
- [ ] Existing dark mode still works.
- [ ] Status text contrast and accessible labels are checked.
- [ ] Venue, landmark, nullable coordinate and geofence fields remain present.
- [ ] Map preview and map pin placeholders remain labelled as preview/template.
- [ ] No fake current location or verified GPS is shown.

### 10.6 Template/HTTP mode checks

- [ ] Template Mode starts without a network request.
- [ ] Mode label clearly says it is local/demo content.
- [ ] No BFF connectivity ping runs in Template Mode.
- [ ] HTTP Mode uses the HTTP repositories only.
- [ ] HTTP error never falls back to mock fixture values.
- [ ] Server-owned status/count/rating/permission values are not editable in the form.
- [ ] Mock actions update the intended local state consistently across screens.

### 10.7 Navigation and accessibility checks

- [ ] 18 drawer entries are accurately represented in route constants/types/tests.
- [ ] Root OTP auth gate is not counted as a drawer entry.
- [ ] Every visible action has a working handler.
- [ ] Loading, empty, retry, permission, validation and conflict states are reachable.
- [ ] Inputs and modal actions remain visible with the keyboard open.
- [ ] Touch targets and accessibility labels are adequate.

---

## 11. Local verification commands

Do not run a command until its environment and target are understood.

### Mobile

From `mobile/`:

```bash
npx tsc --noEmit
npm test -- --watchAll=false
```

Run the relevant focused tests first while iterating, then the full suite.

### Backend

From `backend/`, first inspect Django settings/environment and confirm the configured test database is isolated from the frozen prototype database. Do not infer safety from a database name alone; inspect host/name/settings and confirm that Django's test runner will use a separate test database.

Only then run:

```bash
python manage.py test apps.events.tests.test_services_application_assignment_phase6
```

If the test runner would connect to or modify the frozen `volunteer_coordination_db`, do not run it. Report the blocker instead.

### Native build

Run a local Android build only if the required SDK/JDK and the exact package/native setup are already available. For notification dependency work, verify the package's actual native setup instructions before attempting a build. Do not change Gradle, Android manifest, iOS Podfile, or native settings by guesswork.

### Strictly prohibited

- No migrations against the frozen database.
- No schema creation/alteration or SQL execution against the frozen database.
- No seed scripts or test fixtures against the frozen database.
- No live API mutations for verification.
- No OTP/SMS dispatch tests to a real phone number.
- No destructive production/dev database operations.

---

## 12. Completion report required from Gemini CLI

At completion, provide a concise factual report with:

1. Branch name and exact final commit SHA.
2. Whether the worktree is clean.
3. Files changed, grouped by dashboard, reminders, theme/shared UI, forms/navigation, tests and docs.
4. Exact implementation delivered for Active Shift, Active Event, tomorrow commitments and local notifications.
5. Confirmation that map/location placeholders remain and native maps/GPS are deferred.
6. Confirmation that no SQL/schema/migration/database changes were made.
7. Commands actually run and exact pass/fail totals.
8. Commands not run and the concrete reason.
9. Any unverified contract or unresolved issue, with file/line/symbol references.
10. Any package added and evidence for its React Native/New Architecture compatibility.

Do not say "all tests pass" unless the commands ran and completed successfully. Do not report a feature as implemented if it is only planned or if its main action is a placeholder.

---

## 13. Definition of done

This handoff is complete only when:
- The mobile dashboard gives a truthful view of the volunteer's current shift and the coordinator's current event without confusing lifecycle status and schedule time.
- Tomorrow's commitments are shown using Yangon day boundaries.
- Local reminders are safely implemented only if the native dependency is verified; otherwise, the in-app reminder remains complete and the limitation is documented.
- The UI consistently uses blue/cream with sage or olive support, not brown.
- All location/map placeholders and their editable fields remain.
- Existing template and HTTP repository modes remain isolated and contract-aligned.
- The 48-hour cancellation service changes in this branch are verified by safe tests.
- The UI never reports a rejected cancellation as success.
- The typecheck and applicable tests have been executed, with honest results.
- The implementation report contains exact evidence and no guessed claims.

**Do not merge into `main`.** Leave the completed work on `mobile/ui_sync` for the repository owner to review and pull.
