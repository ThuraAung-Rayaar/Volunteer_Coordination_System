# Volunteer Coordination System v0.8.1
# Mobile Frontend UX Improvements & Stabilization Fix Plan

**Target:** Existing React Native TypeScript project (`python_stack/mobile/`)  
**Implementation tool:** Antigravity with Gemini Flash CLI  
**Current state:** UI prototype implemented with mock repositories; no live BFF integration in this phase  
**Platform priority:** Android first; preserve iOS compatibility  
**Database policy:** The current PostgreSQL SQL prototype remains the hard rule. This plan does not authorize SQL changes.  
**Scope:** Volunteer Dashboard, Events, application/assignment detail navigation, Friends, Profile, Coordinator eligibility presentation, Availability, Settings, Coordinator dashboard, event creation date/time UX, and the previously identified frontend stabilization fixes.

---

## 1. Executive decision

The existing mobile app should be **refined, not rebuilt**. It already has the principal screens, drawer navigation, theme system, mock repositories, and coordinator workspace. The required work is a focused UX and correctness pass followed by device QA.

This plan combines:

1. The additional UX changes supplied by the project owner.
2. The previous stabilization findings: wizard validation, dynamic coordinator identity in mock repositories, deterministic mock state, navigation review, theme persistence, icon consistency, demo-only feedback, profile/schema alignment, and Android runtime QA.
3. The existing Business Rules & Permissions document and SQL as the authority for current behavior.

### Critical product-rule boundary: Coordinator eligibility

The requested eligibility rule is:

- Account verification completed.
- At least **5 completed events**.
- A **good rating**.

The supplied current Business Rules document says that Coordinator application requires `verification_status == 'verified'`. It does **not** currently define a five-event threshold or a minimum rating threshold. No exact numeric definition of “good rating” was supplied.

Therefore:

- The UI can show the three eligibility checks and disable the request button when the mock eligibility data says the user is not eligible.
- The UI must not invent a minimum rating such as 4.0 or 4.5.
- The UI must not treat a local completed-event count or rating as security authorization.
- The new five-event and good-rating criteria require a deliberate business-rule/backend/SQL change before live enforcement. The existing SQL remains unchanged until that change is approved.
- Until the rule is implemented server-side, a client-side disabled button is only presentation, not a hard permission.

### Critical wording boundary: cancellation

The volunteer should cancel their **own participation / assignment**, not cancel the event itself. The current rule allows a volunteer to cancel their own `assigned` or `confirmed` assignment; completed assignments cannot be cancelled. Use UI wording such as **Cancel participation** or **Cancel shift**, never **Cancel event** for a volunteer self-service action.

---

## 2. Relevant project code references

The uploaded source snapshot should be used to confirm exact paths before editing. The following paths were visible/referenced during the previous source review; Gemini must inspect the current working tree and adapt if names have changed.

| Area | Expected code reference | Planned change |
|---|---|---|
| Drawer navigation | `src/navigation/MainDrawerNavigator.tsx` | Preserve section context, check route stack layout |
| Drawer content | `src/navigation/MainDrawerContent.tsx` | Keep demo role/profile switch only in drawer for development; remove role switch from Settings; gate out of production |
| Current demo user | `src/app/UserContext.tsx` | Keep demo identity switching distinct from real authentication; capability is mock-only |
| Coordinator route guard | `src/features/coordinator/components/CoordinatorGuard.tsx` (verify exact path) | Continue UI guard; do not mistake it for backend authorization |
| Dashboard screen | Locate under `src/features/dashboard/` | Add event history/upcoming event cards and compact Coordinator entry button |
| Event discovery | Locate under `src/features/events/` | Search + filter icon in one row; put categories in the filter sheet |
| Shared event detail | Locate `EventDetailScreen` or current equivalent | Reuse from dashboard, discovery, applications and assignments |
| Application status | Locate `MyApplicationsScreen` / application list component | Event card opens the related Event Detail and returns to the application list |
| Assignment list | Locate `MyAssignmentsScreen` / assignment list component | Event card opens Event Detail and returns to assignments |
| Friends | Locate `FriendsPlaceholderScreen` or current equivalent | Simplify to a refined, minimal placeholder; do not fabricate friends |
| Profile | Locate `ProfileScreen` and profile edit form | Summary-first profile card, rating, separate edit action, Coordinator request card |
| Availability | Locate `AvailabilityScreen` | Reduce explanatory text; keep rules editor clear |
| Settings | Locate `SettingsScreen` | Remove role switch from Settings; keep appearance settings |
| Event creation | `src/features/coordinator/screens/CreateEventWizardScreen.tsx` (verify exact path) | Separate date/time controls, calendar popup, explicit Myanmar time, strong validation |
| Mock coordinator repository | `src/data/mock/MockCoordinatorRepository.ts` | Inject current coordinator identity; deterministic IDs and clone/reset strategy |
| Theme | `src/theme/ThemeProvider.tsx` | Persist selected theme without theme flash |
| Icon adapter | Locate `AppIcon.tsx` / current icon component | Replace Unicode glyph map centrally with consistent icon library after compatibility audit |
| Tests | Existing `__tests__/` and feature tests | Add navigation, validation, eligibility, and UI regression tests |

**Important instruction:** Do not assume these filenames are exact if the working tree differs. First run a read-only inventory and map each screen to its actual path. Do not create duplicate screens because a guessed filename is missing.

---

## 3. Requested UX changes — screen-by-screen specification

## 3.1 Volunteer Dashboard

### Desired experience

The Dashboard should give the volunteer a concise view of:

- Events/shifts in which the volunteer has a confirmed assignment.
- Completed events/shifts in which participation was actually completed.
- The ability to open the event details from either section.
- The ability to cancel their own upcoming/confirmed participation where the current assignment state permits it.
- Their aggregate volunteer rating.
- A compact Coordinator entry button for approved Coordinators only.

### Layout proposal

1. Welcome/header row.
2. Small activity statistics: completed participation, upcoming/confirmed commitments, rating average/count.
3. **Coordinator Workspace**: for approved Coordinators only, a subtle full-width button immediately below activity statistics. It should look like a normal secondary navigation button, not a huge highlighted dashboard card.
4. **Upcoming / Confirmed** section: event cards for the volunteer's own `assigned` or `confirmed` assignments, with state badges and date/time.
5. **Recently Completed** section: completed participation records with event name, date, post/task name and relevant details.
6. Each event card is clickable and opens shared Event Detail.
7. For the volunteer's own `assigned` or `confirmed` assignment, show a secondary `Cancel participation` action, subject to state and confirmation.

### Data semantics — do not change the database meaning

- A completed event in the system is not proof that this volunteer participated.
- `assignments.status = completed` alone is not proof of attendance because event completion can mark remaining assignments completed while attendance distinguishes volunteers who were absent.
- Completed history should use the volunteer's attendance/participation record with `attendance.status = completed`, joined to their event and assignment/post.
- Upcoming / confirmed activity should come from the authenticated user's own assignments (`assigned` / `confirmed`) and the event details returned by the backend.
- Rating must be the aggregate volunteer rating, not an average recalculated from visible comments. If no rating exists, show `No ratings yet`, not `0 stars`.
- Do not show raw feedback comments or other users' identities.

### Cancel participation interaction

- Place the action on the upcoming/confirmed card or the Event Detail action area, not on completed history.
- Show confirmation dialog: `Cancel your participation in this event?` with event title and post/shift context.
- Optional reason can be added only if the current API contract supports it; do not invent a required reason.
- After a successful future BFF response, refresh Dashboard, My Assignments and My Applications.
- In this UI-only phase, make the action clearly `Demo only` and update only mock state.
- Do not show a coordinator-level `Cancel event` operation to a volunteer.

**Current rule reference:** `BUSINESS_RULES_AND_PERMISSIONS.md`, Assignment Rules §11.5: volunteer can cancel their own assignment or event manager can cancel one on their event; completed assignments cannot be cancelled; cancellation is idempotent.

## 3.2 Events Discovery and Event Detail

### Search/filter placement

The current category/tag chips should not be rendered in a wide horizontal scrolling row above the event list.

New top row:

```text
┌───────────────────────────────────────────────┐
│ [ Search events, locations...       ] [filter] │
└───────────────────────────────────────────────┘
```

- Search input and filter icon/button sit on the **same row**.
- No large scrollable tag row above the search bar or between the header and search.
- Tapping the filter icon opens a filter bottom sheet/modal.
- The filter sheet contains selectable/deselectable charity categories (current database charity-field taxonomy), plus supported filters such as date/purpose/support.
- Add `Clear all` and `Apply filters` actions.
- Optionally show a small selected-filter count badge on the filter icon/button. Do not dump every selected category into a large chip row on the discovery screen.
- Keep filter state when opening Event Detail and returning to discovery.

### Event Detail navigation behavior

The current behavior that returns the user to Dashboard after leaving Event Detail from Events Discovery is incorrect.

Required behavior:

- Opening a card from Events Discovery → Event Detail → Back returns to **the same filtered Events Discovery screen**, preserving search text, selected filters, scroll position and page if possible.
- Opening a card from Dashboard → Event Detail → Back returns to Dashboard.
- Opening an event from My Applications → Event Detail → Back returns to My Applications.
- Opening an event from My Assignments → Event Detail → Back returns to My Assignments.

Do not implement `goBack()` by hard-coding `navigate('Dashboard')` or `navigate('Events')`. Use real stack history / nested feature stacks so navigation naturally returns to the screen that opened the detail.

### Recommended navigation design

Either:

1. Each drawer section owns a stack and registers the shared Event Detail component within that stack; or
2. A root detail route is pushed on top of the existing drawer state and pop returns to the previous nested route.

Choose the option that fits the existing React Navigation structure with the least risk. Do not rewrite the whole navigator until the current route graph has been inspected and the behavior reproduced.

### Data constraints

- Public discovery shows only events visible under current T0 rules (published/active).
- Use charity-field categories as event filters. The current schema does not define generic event tags.
- Do not calculate authoritative post capacity locally.
- Event Detail should display only the fields allowed for the current user; accepted/assigned volunteers may receive specific T2 event fields from the backend.

## 3.3 Friends

The Friends page should be visually refined and minimal:

- Remove unnecessary explanatory paragraphs, placeholder tabs, redundant cards, and decorative sections.
- Keep page title and one clean empty-state illustration/icon.
- Use a short message, for example: `Your volunteer connections will appear here when this feature is available.`
- No fake people, friend requests, past coordinator records, or connections based on attendance.

The current SQL/business rules do not define friendship relationships or a Friends BFF endpoint. This screen remains a placeholder until the product and backend relationship rules exist.

## 3.4 My Applications / Application Status

- Each application row/card must display enough event information to identify the event.
- Tapping the application card or its event title opens Event Detail.
- Back returns to the same My Applications screen with previous status filter, scroll position and pagination preserved.
- Application status remains visible (`pending`, `accepted`, `waitlisted`, `rejected`, `withdrawn`, `expired` where returned).
- Do not expose T2 profile fields for pending/waitlisted/rejected applicants in coordinator-side UI.
- Application withdrawal must remain separate from event cancellation.
- In mock mode, any withdraw/decision action must say it is a preview.

## 3.5 My Assignments

- Each assignment row must include a visible event title and tap target to open Event Detail.
- Back returns to My Assignments with list state preserved.
- Show assignment status (`assigned`, `confirmed`, `completed`, `cancelled` where provided).
- Show post/shift title, date/time and group code/leader only when present and allowed.
- `Confirm` is available only for the volunteer's own `assigned` assignment.
- `Cancel participation` can be available for the user's own `assigned` or `confirmed` assignment; completed cannot be cancelled.
- A cancelled assignment should not disappear without explanation; display its status in history if the backend returns it.

## 3.6 My Profile — summary-first design

### Current requested change

Do not show the full editable form as the initial Profile screen.

New layout:

**A. Profile Summary Card**

- Avatar/initials.
- Display name.
- Concise summary information (for example preferred language, home area and a small number of skill/category summaries where available).
- Aggregate volunteer rating average and rating count.
- An edit icon button in the top-right or an `Edit profile` action.
- The edit action opens the existing full editable profile form as a separate screen.

Do not show phone hash, encrypted storage paths, OTP/token data, admin fields, or T3 private data in a summary card. The user's own profile can expose self data under the current backend policy, but the summary UI should remain concise.

**B. Coordinator Application Card below Profile Summary**

- Title: `Become a Coordinator` or `Coordinator application`.
- Show three eligibility checks:
  1. Account verified.
  2. At least 5 completed events.
  3. Good volunteer rating.
- Show met/not met status for each requirement.
- `Apply for Coordinator approval` button remains disabled while any requirement is unmet or not yet defined/verified by the current backend.
- If application is pending/approved/suspended/revoked, show the existing status and appropriate next-state information instead of an Apply button.

### Coordinator eligibility rule gap

The current backend rules say Coordinator application requires `verification_status == verified`, but do not enforce the new 5-completed-events requirement or define what numerical/qualitative rating counts as “good”.

Implementation requirements:

- UI mock state can represent `isVerified`, `completedEventCount`, `meetsGoodRatingRequirement` and `eligibilityStatus`.
- Do not hard-code a minimum rating number.
- Do not treat locally calculated stats as authorization.
- The future BFF should return a server-derived eligibility summary only after the business rule is approved and implemented server-side/SQL.
- The product owner must decide the rating threshold/definition before live enforcement.
- Until this is done, label the eligibility card as demo/preview and do not claim that the backend enforces all three conditions.

### Completed-event counting

Count unique events where the user's attendance/participation is truly `completed`, not rows merely marked completed by event lifecycle side effects. The database currently distinguishes expected/absent attendance from completed attendance.

## 3.7 Availability

The Availability screen should be more user-friendly and concise:

- Remove long explanatory paragraphs and repeated instruction cards.
- Keep one short subtitle if needed: `Choose when you are available to volunteer.`
- Use clean weekday rows/cards with current time ranges.
- Use one clear `Add availability` action.
- Separate weekly availability from date-specific exceptions.
- Use simple empty states.
- Keep validation messages next to the relevant time/date field.
- Do not calculate authoritative schedule conflict in the UI; backend/SQL remains authoritative.

## 3.8 Settings

- Remove the Volunteer/Coordinator role switch from Settings.
- Theme selector remains: Light, Dark, System (or just Light/Dark if the product explicitly chooses not to expose System).
- Settings should contain preferences only: appearance, language if already supported, app information and logout.
- The demo profile switcher may remain in the **side drawer** for development/QA as requested, but it must be gated to development/demo builds and absent from production.
- Do not confuse demo identity switching with real role assignment or authentication.

## 3.9 Coordinator Dashboard card

- The large distinctive card should be replaced by a **subtle full-width button**.
- Put it immediately below the activity statistics section.
- Use standard secondary/outlined button styling consistent with the rest of the dashboard.
- Label e.g. `Open Coordinator Workspace` with a small coordinator icon/arrow.
- Display only for active users whose coordinator status is `approved`.
- Pending/suspended/revoked states do not get this entry button.

## 3.10 Coordinator Event Creation — Schedule and Deadline page

### Required interaction

For start date, end date and application deadline:

- Date selection is separate from time entry.
- Date is displayed in a text field.
- A calendar icon button beside the date field opens a calendar/date-picker submenu/modal.
- The date-picker should behave like a familiar DOB date selector already used in the app, if such a component exists. Reuse it rather than adding a second unrelated date-picker style.
- Time is entered separately using a clear 24-hour time control (for example `09:30`).
- Every date/time group clearly says **Myanmar Time (MMT, Asia/Yangon, UTC+06:30)**.
- The review step shows the selected time in Myanmar local time.

### Required fields

- Start date + start time.
- End date + end time.
- Application deadline date + deadline time.

### Validation

- End datetime must be after start datetime.
- Application deadline must satisfy the current event rule (deadline cannot be later than event start; confirm exact serializer/service validation before live integration).
- Invalid date/time strings must show field errors.
- Do not use silent `parseFloat(...) || default` or `parseInt(...) || default` for event location/radius/capacity fields.
- Geo radius range per current BFF contract: 20–5000 meters.
- Latitude and longitude must be numeric and in legal coordinate ranges; both must be supplied together when map/geo configuration requires them.

### Timezone handling

Device timezone must not affect the meaning of event time. A user may run the app on a device configured for a timezone other than Myanmar. Do not create a local JavaScript `Date` using the device's timezone and then call `toISOString()` without first establishing the intended Myanmar wall time.

For the future BFF request, the mobile client should send a timezone-aware ISO 8601 datetime with the Myanmar offset, e.g.:

```text
2026-12-01T09:30:00+06:30
```

The server should parse the offset-aware value and normalize/store it in UTC according to Django timezone settings. Before integration, verify the actual serializer accepts offset-aware ISO 8601 values. Do not send an ambiguous local timestamp such as `2026-12-01T09:30:00` without a timezone/offset.

Prefer an explicit `Asia/Yangon` timezone-aware conversion utility or a small, unit-tested date/time adapter. Do not rely on the Android device's configured timezone. Use an already-installed compatible date picker/time picker where possible; inspect dependencies before adding one.

---

## 4. Existing stabilization fixes to include

| ID | Existing issue | Required change |
|---|---|---|
| STAB-01 | Wizard numeric fields use silent fallback values | Explicit parsing, range validation, field errors, no hidden defaults |
| STAB-02 | Mock Coordinator repository hardcodes owner/current coordinator | Inject current demo user identity |
| STAB-03 | Mock cloning uses fragile JSON clone / timestamp IDs | Typed clone or fixture factory; deterministic injected ID/clock; reset state between tests |
| STAB-04 | Detail routes may return to wrong screen | Preserve source stack and list filters/scroll state |
| STAB-05 | Theme mode is not persisted | Persist user theme preference locally; avoid initial theme flash |
| STAB-06 | Icon adapter uses Unicode glyphs | Use one maintained icon family centrally after RN compatibility check |
| STAB-07 | Demo mutation messaging may be inconsistent | Standard preview/demo labels for every local mutation |
| STAB-08 | Profile/verification form alignment needs final review | Match editable fields and enums with Business Rules/API contract; placeholders must not imply uploads |
| STAB-09 | QA profile switcher in drawer | Keep in dev/demo drawer as requested; remove from Settings; ensure production build omits it |
| STAB-10 | No physical Android QA evidence | Emulator/device regression pass before UI milestone sign-off |

---

## 5. File-by-file change map

These are target files/areas; Prompt 0 must verify exact names in the current checkout.

| Target file/area | Intended edit |
|---|---|
| `src/features/dashboard/screens/*Dashboard*` | New summary layout, confirmed/completed event lists, cancel participation action, compact Coordinator button |
| `src/features/dashboard/components/*` | Clickable event summary cards; shared rating summary |
| `src/features/events/screens/EventDiscoveryScreen.tsx` | Search/filter row and state preservation |
| `src/features/events/components/EventFilterSheet.tsx` | Multi-select categories; clear/apply; remove chip strip from discovery header |
| `src/features/events/screens/EventDetailScreen.tsx` | Shared detail presentation and origin-preserving navigation |
| `src/features/events/screens/MyApplicationsScreen.tsx` | Event detail navigation and preserved list state |
| `src/features/events/screens/MyAssignmentsScreen.tsx` | Event detail navigation and own assignment actions |
| `src/features/friends/screens/FriendsPlaceholderScreen.tsx` | Minimal empty state, remove redundant placeholder information |
| `src/features/profile/screens/ProfileScreen.tsx` | Summary card with rating; coordinator application card |
| `src/features/profile/screens/ProfileEditScreen.tsx` or current profile edit screen | Full editable form moved behind the edit icon |
| `src/features/profile/screens/AvailabilityScreen.tsx` | Simplify copy and improve weekly/day exception layout |
| `src/features/settings/screens/SettingsScreen.tsx` | Remove role switch; retain theme and preferences |
| `src/navigation/MainDrawerContent.tsx` | Keep QA/demo account switcher only in dev/demo build; do not duplicate in Settings |
| `src/navigation/MainDrawerNavigator.tsx` | Preserve nested route stacks/source-aware back behavior |
| `src/features/coordinator/screens/CoordinatorOverviewScreen.tsx` | Compact full-width Coordinator workspace button below stats on volunteer Dashboard (if same card currently lives there) |
| `src/features/coordinator/screens/CreateEventWizardScreen.tsx` | Myanmar-local date/time controls and validation |
| `src/data/mock/MockCoordinatorRepository.ts` | Dynamic owner/current coordinator identity, stable mock state |
| `src/data/mock/*` | Eligibility fixtures, assignment/attendance fixtures, deterministic IDs |
| `src/theme/ThemeProvider.tsx` | Load/persist Light/Dark/System preference |
| `src/shared/components/AppIcon.tsx` or current icon adapter | Consistent icon library wrapper |
| `__tests__/**` | Add regression tests by feature and rule |

---

# Part II — Antigravity Gemini CLI execution plan

## 6. Global prompt preamble

Paste this before every phase prompt:

```text
You are working inside an existing React Native TypeScript project. The app
has already been initialized and run. Do not recreate it, migrate to Expo, or
replace Android/iOS native project configuration.

This is a UI/UX refinement and stabilization task. The current PostgreSQL SQL
and Business Rules & Permissions document are hard rules. Do not modify SQL or
backend code in this task. Do not add real BFF calls or API credentials.

Before editing, inspect the current file and surrounding types/navigation/tests.
Use the actual repository paths; do not create duplicate screens based on
assumed filenames. Preserve current working functionality. Make only the
requested change in this phase.

Use TypeScript with explicit types. Do not use `any`. Do not introduce a new
business rule or numeric threshold unless explicitly supplied. Keep mock
mutations labelled Demo only. Keep Coordinator UI capability derived from the
current mock user only for visual testing; this is not real authorization.

After changes:
1. List changed files and explain why each changed.
2. Run the existing typecheck, lint and Jest scripts.
3. Add or update focused regression tests.
4. Report exact commands/results.
5. Do not proceed to another phase automatically.
```

## 7. Phase F0 — Read-only repository inventory and UX route map

**Purpose:** Verify current branch/files and prevent edits against stale source.

```text
READ-ONLY ONLY. Do not edit files.

Inspect the current mobile project and map the actual implementation paths for:
- Volunteer Dashboard and Dashboard event cards
- Events Discovery, search/filter component and Event Detail
- My Applications / Application Status
- My Assignments
- Friends
- Profile and profile edit form
- Coordinator eligibility/application status
- Availability
- Settings
- Coordinator overview/card
- Create Event Wizard schedule/deadline page
- MainDrawerNavigator, MainDrawerContent, UserContext, CoordinatorGuard
- MockCoordinatorRepository and all related fixtures
- ThemeProvider and AppIcon
- current navigation tests and screen tests

Run git status and identify current branch/commit. Inspect package.json and
lockfile for calendar/date/time picker, timezone, icon, theme storage and
navigation dependencies. Do not install anything.

Produce a route graph showing where each screen is registered and how it
currently returns after Event Detail. Identify whether filter state and list
scroll state survive navigation today.

Map every requested UX change to exact existing files and tests. Identify
business-rule conflicts. In particular:
- current coordinator application requires verified status;
- the requested five completed events and good rating are new criteria;
- good rating threshold is not defined;
- event cancellation by a volunteer means cancelling their own assignment,
  not cancelling the event.

Do not change code. Return a proposed ordered fix list with exact source paths.
```

**Acceptance:** no files changed; exact paths and navigation graph documented.

## 8. Phase F1 — Volunteer Dashboard event activity and cancel participation

```text
Refine the existing Volunteer Dashboard only.

Requirements:
- Show the volunteer's own upcoming/confirmed assignments and completed
  participation history.
- Every event card opens the shared Event Detail screen.
- Completed participation must be based on attendance/participation status
  `completed`, not merely assignment.status=`completed`.
- Show event title, post/shift title, date/time and assignment/attendance state.
- Show a concise aggregate volunteer rating; empty state says `No ratings yet`.
- For the user's own `assigned` or `confirmed` assignment, show a secondary
  `Cancel participation` action. Do not call it Cancel Event.
- Ask for confirmation before preview cancellation.
- In mock mode update only mock repository state and show `Demo only` feedback.
- Completed participation cannot be cancelled.
- Coordinator entry below activity stats must be a subtle full-width button,
  only visible for approved coordinator fixture; do not use the large card.

Do not add BFF calls. Preserve the current dashboard layout style and reusable
components. Add tests for completed attendance filtering, confirmed activity,
Coordinator button visibility, cancel eligibility and completed cancellation
being disabled. Run typecheck/lint/Jest.
```

## 9. Phase F2 — Event discovery search/filter layout and source-aware details

```text
Refine Event Discovery and Event Detail navigation.

Search row:
- Search input and filter icon/button must be on the same horizontal row.
- Remove the large horizontal scrolling charity/tag chip row from the discovery
  header/menu area.
- Tapping the filter icon opens a bottom sheet or modal containing selectable
  and deselectable charity categories and the currently supported filters.
- Include Clear all and Apply filters.
- A small selected-filter count badge is acceptable; do not render all selected
  categories as a large chip row on the discovery page.
- Preserve query/filter state after opening and returning from Event Detail.

Navigation:
- Event card from Events Discovery -> Event Detail -> Back must return to the
  same Events Discovery screen, not Dashboard.
- Preserve search text, filters, list scroll position and pagination if the
  existing navigation architecture allows it.
- Do not hard-code navigate('Dashboard') in the detail back action.
- Use the smallest safe nested-stack/root-stack solution based on the current
  route graph from F0. Do not rewrite navigation unnecessarily.

Business rules:
- Filter categories are current charity-field codes, not invented generic tags.
- Public discovery shows only published/active events.
- Do not recompute capacity locally.

Add navigation/filter tests and run typecheck/lint/Jest.
```

## 10. Phase F3 — Event detail from Applications and Assignments

```text
Update My Applications / Application Status and My Assignments.

Requirements:
- Each application row/card has a clear event title and event detail tap target.
- Tapping opens the shared Event Detail for that event.
- Back returns to the exact Application Status screen and preserves current
  status filter/list position.
- Each assignment row/card similarly opens Event Detail.
- Back returns to My Assignments and preserves list position.
- Keep application status and assignment status separate.
- Keep actions separate: withdraw application vs cancel own assignment.
- Volunteer may cancel own assigned/confirmed assignment; completed cannot be
  cancelled. Do not show a Cancel Event action.
- Keep every mock mutation labelled Demo only.

Use the actual eventId in navigation params. Do not duplicate Event Detail UI.
Add tests for eventId routing, back destination and preserved filter/scroll
state. Run checks.
```

## 11. Phase F4 — Simplify Friends screen

```text
Refine the Friends screen into a clean, minimal placeholder.

Remove redundant paragraphs, unnecessary cards, decorative blocks, inactive
sub-tabs and repeated empty-state messaging. Keep:
- Page title `Friends`
- One clean empty-state illustration/icon
- One short sentence that connections will be available when the feature is
  implemented

Do not show fake friends, past coordinators, friend requests or people derived
from shared events. The current SQL/business rules do not define friendship
relationships. Do not add new mock person fixtures or endpoints.
Match the existing theme and spacing. Add a simple render/accessibility test.
```

## 12. Phase F5 — Profile summary, edit screen and Coordinator eligibility card

```text
Refactor Profile to be summary-first.

Initial Profile screen:
- Render a concise Profile Summary Card with avatar/initials, display name,
  selected summary fields, and aggregate volunteer rating average/count.
- Add an edit icon button in the card header.
- Tapping edit opens the full existing editable profile form on a separate
  Profile Edit screen. Do not display all editable inputs on the summary screen.
- Do not show phone hash, password, OTP/token values, admin fields or private
  storage paths.

Below the summary card add a `Become a Coordinator` card with checks:
1. Account verified.
2. At least 5 completed events.
3. Good rating.
The Apply button is disabled until all checks are met. If the user already has
pending/approved/suspended/revoked status, show that status instead of a new
Apply action.

CRITICAL RULE GAP:
The existing backend rule only requires verification for Coordinator
application. The five-event and good-rating rules are new. No rating threshold
was specified. Do not invent a number. Represent `meetsGoodRatingRequirement`
as an explicit mock eligibility field and show the rule as pending server
confirmation. Do not treat local counts/ratings as authoritative permission.
Do not change SQL or backend in this UI task.

Count completed events from completed attendance/participation, not assignment
status alone. Add tests for all eligibility combinations, missing rating-rule
configuration, profile summary navigation and rating empty state.
```

## 13. Phase F6 — Availability simplification and Settings cleanup

```text
Refine Availability and Settings.

Availability:
- Remove long unnecessary explanation blocks and repeated help text.
- Use concise title/subtitle and clean weekday availability rows.
- Make Add availability and Add date exception actions obvious.
- Keep validation close to the relevant time/date controls.
- Preserve current weekly-rule and exception semantics; do not calculate
  authoritative schedule conflicts in the UI.

Settings:
- Remove the Volunteer/Coordinator role switch from Settings.
- Keep appearance (Light/Dark/System), language only if already implemented,
  app information and logout placeholder.
- Keep the development/demo profile switcher in the side drawer only, as the
  agreed demo workflow, but ensure it is excluded from production builds.
- Do not let demo identity switching become real account role mutation.

Add/update tests. Run typecheck/lint/Jest.
```

## 14. Phase F7 — Coordinator Dashboard button and Myanmar date/time picker

```text
Refine Coordinator entry and Create Event Wizard schedule/deadline page.

Coordinator entry:
- Replace the large Coordinator dashboard card with a subtle full-width
  button placed immediately below activity statistics.
- Only render for an active approved Coordinator.

Schedule/deadline UI:
- Separate date and time controls for start, end and application deadline.
- Date appears in a text field; calendar icon beside it opens a date-picker
  submenu/modal.
- Reuse the existing DOB/calendar date-selection component if the project has
  one. First inspect installed packages; do not add a second date picker style.
- Time input is 24-hour and explicitly labelled `Myanmar Time (MMT)`.
- Show timezone helper `Asia/Yangon · UTC+06:30` next to the schedule controls.
- The selected date and time are displayed separately and clearly on the review
  screen.
- Validate end datetime > start datetime and deadline <= start datetime.
- Preserve event state/owner/coordinator/onboarding version as server-owned;
  do not add them as editable fields.
- Remove silent numeric defaults for latitude/longitude/geo radius/capacity.
  Invalid values need field-level errors.
- Current geo radius contract is 20–5000 metres; validate it explicitly.

Timezone correctness:
- Device timezone must not change the meaning of Myanmar time.
- Do not construct a device-local Date and blindly call toISOString().
- Convert from date/time input components using an explicit Asia/Yangon-aware
  utility or produce an ISO value with explicit +06:30 offset after tests.
- Example serialized timestamp: `2026-12-01T09:30:00+06:30`.
- Before live BFF use, verify the backend DateTimeField accepts offset-aware ISO
  timestamps and converts them to UTC under USE_TZ.
- Do not submit an ambiguous timezone-free local timestamp.

Add tests for date picker open/select, date/time combination, invalid time,
end-before-start, deadline-after-start, offset serialization and device timezone
independence. Do not call the backend.
```

## 15. Phase F8 — Mock repository correctness and demo feedback

```text
Fix mock repository identity and deterministic state handling.

MockCoordinatorRepository:
- Remove hard-coded ownerId/currentCoordinatorId/coordinatorName.
- Inject the current mock Coordinator identity through a constructor or factory.
- When switching demo profile, draft ownership must use that current fixture.

Mock state:
- Review JSON.parse(JSON.stringify(...)) cloning.
- Use typed fixture factories or a clone method safe for the actual model shape.
- Inject ID generation/clock for deterministic tests; do not rely on Date.now()
  collisions in rapid repeated creation.
- Provide reset/seed methods so tests do not leak state.

Demo feedback:
- Audit every local mutation in Dashboard, Events, Applications, Assignments,
  Coordinator event creation/lifecycle, Attendance, QR and Profile.
- Use consistent `Demo only — not submitted to server` messaging.
- Do not display success wording implying server persistence.

Add tests for current mock identity, stable IDs, isolated test state and demo
messaging. No network/API code.
```

## 16. Phase F9 — Theme persistence, icon consistency, profile alignment

```text
Polish theme persistence, icons and profile form alignment.

Theme:
- Persist Light/Dark/System preference using an already-installed suitable
  local preference package if present. Otherwise report the minimal compatible
  dependency needed before installing.
- Load preference before rendering the main screen to prevent theme flash.
- System mode follows Android appearance changes.
- Persist only the theme preference; do not use this storage for auth tokens.

Icons:
- Inspect React Native version and icon dependencies.
- Replace Unicode glyphs centrally in AppIcon adapter with one maintained,
  compatible icon set. Do not import icon pack directly into feature screens.
- Use decorative accessibility hiding or meaningful labels appropriately.

Profile:
- Match profile editable fields, enum values, nullability and emergency-contact
  pair validation to the supplied Business Rules and current mobile types.
- Do not make privileged fields editable.
- Verification image UI remains a placeholder; do not implement upload here.

Add/update tests, run checks, report any dependency/native configuration change.
```

## 17. Phase F10 — Android device regression QA

```text
Run the app on an Android emulator or physical device. Do not claim device QA
passed if no device is connected.

Test:
- Volunteer Dashboard confirmed/completed event cards and cancellation confirm.
- Dashboard event detail -> Back returns to Dashboard.
- Events search/filter -> Detail -> Back returns to same filtered discovery.
- Application Status -> Event Detail -> Back returns to Applications.
- My Assignments -> Event Detail -> Back returns to Assignments.
- Filter modal select/deselect/Clear all/Apply.
- Profile summary/edit navigation and Coordinator eligibility card disabled
  states.
- Settings has no role switch; development drawer switcher remains dev-only.
- Availability concise layout.
- Coordinator button placement/visibility.
- Event wizard calendar submenu and Myanmar time labels/validation.
- Small-screen layout, keyboard overlap, Android back, drawer gesture and themes.

Record Android version/API, device size, screenshots and any defects. Fix only
reproducible issues. Run typecheck/lint/Jest/Gradle assembleDebug after fixes.
```

---

## 6. Acceptance checklist

### Volunteer Dashboard
- [ ] Confirmed/assigned participation appears in upcoming section.
- [ ] Completed section uses actual completed participation/attendance.
- [ ] Both event card types open Event Detail.
- [ ] Cancel participation appears only for eligible own assignments.
- [ ] Completed participation cannot be cancelled.
- [ ] Aggregate rating and no-rating state work.
- [ ] Coordinator workspace button is subtle, full-width and below stats.

### Events
- [ ] Search and filter icon appear on one row.
- [ ] Category selection happens inside filter modal/sheet.
- [ ] No large horizontal tag strip remains in discovery header.
- [ ] Event Detail back preserves filtered discovery state.
- [ ] Dashboard/application/assignment origins return to their correct source.

### Friends
- [ ] Minimal, polished empty state.
- [ ] No fake friend/previous coordinator data.

### Profile and account
- [ ] Initial screen is a summary card with aggregate rating.
- [ ] Edit icon opens full profile edit screen.
- [ ] Coordinator application card appears below summary.
- [ ] Eligibility checks include verified, five completed events and good rating.
- [ ] No numeric “good rating” threshold invented.
- [ ] Unmet eligibility disables the button.
- [ ] Existing coordinator status replaces the new Apply action.

### Availability / Settings
- [ ] Availability text is concise and user-friendly.
- [ ] Settings no longer contains role switch.
- [ ] Demo profile switch remains in the development side drawer only.
- [ ] Demo switch is absent from production build.

### Coordinator
- [ ] Dashboard entry is a subtle full-width button below stats.
- [ ] Schedule date and time are separate controls.
- [ ] Date field has calendar icon and date-picker submenu.
- [ ] Time is labelled Myanmar Time / Asia/Yangon / UTC+06:30.
- [ ] End time and deadline validation are correct.
- [ ] Time serialization is timezone-aware and independent of device timezone.
- [ ] Invalid numeric input does not silently default.
- [ ] Mock event owner identity matches active demo coordinator.

### Engineering quality
- [ ] Mock repository state is deterministic and isolated in tests.
- [ ] Theme preference survives app restart.
- [ ] Icons render consistently on Android.
- [ ] Demo feedback is consistent and non-misleading.
- [ ] Profile fields match allowed schema fields.
- [ ] TypeScript, lint and Jest pass.
- [ ] Android emulator/device smoke test passes.

---

## 7. Required decisions before live BFF integration

1. **Good rating definition:** What is the minimum average rating, rating count requirement, or other quality rule? Do not invent this value.
2. **Five completed events:** Confirm unique event count based on `attendance.status = completed` for the volunteer, rather than assignment completion alone.
3. **Coordinator eligibility enforcement:** Approve the rule change and update backend/SQL/service permission checks before claiming it is a hard rule. Current supplied backend documentation only guarantees verification prerequisite.
4. **Date/time wire contract:** Confirm `Asia/Yangon` offset-aware ISO 8601 accepted by the current event serializer; the UI should send `+06:30` or a formally agreed timezone-aware representation.
5. **Event cancellation semantics:** UI wording/action is cancellation of the volunteer's assignment/participation. The event itself remains unchanged.

---

## 8. Recommended implementation order

1. F0 — read-only inventory and route map.
2. F1 — Dashboard participation/history/cancel flow.
3. F2 — Event search/filter and return navigation.
4. F3 — Event detail from Applications and Assignments.
5. F4 — Friends cleanup.
6. F5 — Profile summary, edit form, Coordinator eligibility presentation.
7. F6 — Availability and Settings cleanup.
8. F7 — Coordinator dashboard button and Myanmar date/time picker.
9. F8 — dynamic coordinator identity, deterministic mock data, demo feedback.
10. F9 — theme persistence, icon consistency, profile contract alignment.
11. F10 — Android device QA and regression suite.

Use one Antigravity prompt at a time. Review the diff and tests after each phase. Do not ask Gemini to “fix everything” in one pass.

**Final recommendation:** Complete this UI stabilization plan before live BFF integration. Keep the SQL prototype unchanged unless the new five-event and good-rating Coordinator eligibility rule is formally approved as a business-rule change.
