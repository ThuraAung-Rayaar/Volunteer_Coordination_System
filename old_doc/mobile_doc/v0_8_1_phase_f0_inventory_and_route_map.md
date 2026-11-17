# Phase F0: Read-Only Mobile Project Inventory, Route Map & UX Gap Analysis
**Project:** Volunteer Coordination System (React Native Mobile Client)  
**Target Directory:** `python_stack/mobile/`  
**Reference Document:** `mobile_doc/v0_8_1_mobile_frontend_ux_fix_plan_antigravity.md`  
**Authoritative Business Rules:** `docs/BUSINESS_RULES_AND_PERMISSIONS.md` (HEAD `de074af`)  
**Date:** 2026-11-11  
**Mode:** READ-ONLY AUDIT & SPECIFICATION (0 code modifications)

---

## 1. Git Repository State & Baseline Diagnostics

### 1.1 Git Status & Commit
- **Current Branch:** `mobile`
- **Latest Commit:** `de074af initial mobile state`
- **Working Tree:** Implementation from v0.7.1 present in untracked files (`mobile/src/`, `mobile/__tests__/`, `mobile_doc/`). No unstaged modifications to native project configuration or backend code.

### 1.2 Baseline Verification Command Results
All verification commands were executed within `mobile/`:
1. **TypeScript Typecheck (`npx tsc --noEmit`):** Clean run, **0 errors**.
2. **ESLint (`npm run lint`):** Clean run, **0 errors, 0 warnings**.
3. **Jest Test Suite (`npm test`):**
   - **Test Suites:** 10 passed, 10 total (`App.test.tsx`, `coordinator.test.tsx`, `coordinatorOperations.test.tsx`, `dashboard.test.tsx`, `events.test.tsx`, `friends.test.tsx`, `navigation.test.tsx`, `profile.test.tsx`, `sharedComponents.test.tsx`, `theme.test.ts`).
   - **Tests:** 109 passed, 109 total.
   - **Execution Time:** ~11.6 seconds.

---

## 2. Dependency Inspection (package.json & lockfile)

An exhaustive audit of `mobile/package.json` and `mobile/package-lock.json` reveals the following:

| Category | Declared Dependency | Installed Version | Notes & Gaps |
|---|---|---|---|
| **Navigation** | `@react-navigation/native` | `7.5.1` | Core navigation container |
| | `@react-navigation/drawer` | `7.14.4` | Single flat drawer navigator currently in use |
| | `react-native-screens` | `4.30.1` | Native screen container |
| | `react-native-safe-area-context` | `5.5.2` (resolved `5.11.1`) | Safe area insets management |
| | `react-native-gesture-handler` | `3.5.0` | Touch & gesture handling |
| | `react-native-reanimated` | `4.7.1` | Animation runtime |
| | `react-native-worklets` | `0.13.1` | Worklet execution thread |
| | *Stack Navigator* | **None** | `@react-navigation/native-stack` or `@react-navigation/stack` is **not installed**. Navigation relies solely on drawer switching. |
| **Calendar / Date / Time** | *None* | **None** | No `@react-native-community/datetimepicker`, `react-native-calendars`, or `react-native-date-picker` installed. |
| **Timezone** | *None* | **None** | Neither `date-fns-tz`, `dayjs/plugin/timezone`, `luxon`, nor `moment-timezone` is installed as a direct runtime dependency. (`dayjs@1.11.23` exists solely as a transitive CLI dependency under `logkitty`). |
| **Icon Adapter** | *None* | **None** | No vector icons library (`react-native-vector-icons`, `@expo/vector-icons`, or `react-native-svg`). `AppIcon.tsx` currently wraps 16 raw Unicode glyphs. |
| **Theme / Local Storage** | *None* | **None** | No `@react-native-async-storage/async-storage` or `react-native-mmkv`. Theme is stored strictly in memory via React `useState`. |

---

## 3. Actual Implementation File Mapping

Every feature area requested in Phase F0 has been located in the existing codebase:

| Feature / Component | Existing Source Path | Existing Test Path |
|---|---|---|
| **Volunteer Dashboard** | `src/features/dashboard/screens/DashboardScreen.tsx` | `__tests__/dashboard.test.tsx` |
| **Dashboard Activity Stats Card** | `src/features/dashboard/components/ActivityStatCard.tsx` | `__tests__/dashboard.test.tsx` |
| **Dashboard Upcoming Card** | `src/features/dashboard/components/UpcomingCommitmentCard.tsx` | `__tests__/dashboard.test.tsx` |
| **Dashboard Completed Card** | `src/features/dashboard/components/CompletedEventCard.tsx` | `__tests__/dashboard.test.tsx` |
| **Dashboard Coordinator Card** | `src/features/dashboard/components/CoordinatorDashboardCard.tsx` | `__tests__/dashboard.test.tsx` |
| **Dashboard Hook & Data** | `src/features/dashboard/hooks/useDashboard.ts` | `__tests__/dashboard.test.tsx` |
| **Events Discovery Screen** | `src/features/events/screens/EventDiscoveryScreen.tsx` (wrapped by `EventsScreen.tsx`) | `__tests__/events.test.tsx` |
| **Category Chips Component** | `src/features/events/components/CharityCategoryChips.tsx` | `__tests__/events.test.tsx` |
| **Filter Bottom Sheet** | `src/features/events/components/EventFilterSheet.tsx` | `__tests__/events.test.tsx` |
| **Event Discovery Card** | `src/features/events/components/EventCard.tsx` | `__tests__/events.test.tsx` |
| **Event Detail Screen** | `src/features/events/screens/EventDetailScreen.tsx` | `__tests__/events.test.tsx` |
| **Event Post Card** | `src/features/events/components/EventPostCard.tsx` | `__tests__/events.test.tsx` |
| **My Applications Screen** | `src/features/events/screens/MyApplicationsScreen.tsx` | `__tests__/events.test.tsx` |
| **My Assignments Screen** | `src/features/events/screens/MyAssignmentsScreen.tsx` | `__tests__/events.test.tsx` |
| **Friends Screen & Placeholder** | `src/features/friends/screens/FriendsScreen.tsx`<br/>`src/features/friends/screens/FriendsPlaceholderScreen.tsx` | `__tests__/friends.test.tsx` |
| **Profile Screen (Current monolithic form)** | `src/features/profile/screens/ProfileScreen.tsx` | `__tests__/profile.test.tsx` |
| **Coordinator Verification & Status** | `src/features/profile/screens/VerificationCoordinatorStatusScreen.tsx` | `__tests__/profile.test.tsx` |
| **Availability Screen** | `src/features/profile/screens/AvailabilityScreen.tsx` | `__tests__/profile.test.tsx` |
| **Settings Screen** | `src/features/settings/screens/SettingsScreen.tsx` | `__tests__/theme.test.ts`, `__tests__/navigation.test.tsx` |
| **Coordinator Overview / Card** | `src/features/coordinator/screens/CoordinatorOverviewScreen.tsx` | `__tests__/coordinator.test.tsx` |
| **Create Event Wizard (Schedule)** | `src/features/coordinator/screens/CreateEventWizardScreen.tsx` (Step 3) | `__tests__/coordinator.test.tsx` |
| **Main Drawer Navigator** | `src/navigation/MainDrawerNavigator.tsx` | `__tests__/navigation.test.tsx` |
| **Main Drawer Content & Account Switcher** | `src/navigation/MainDrawerContent.tsx` | `__tests__/navigation.test.tsx` |
| **User Context & State** | `src/app/UserContext.tsx` | `__tests__/navigation.test.tsx`, `__tests__/dashboard.test.tsx` |
| **Coordinator Route Guard** | `src/features/coordinator/components/CoordinatorGuard.tsx` | `__tests__/coordinator.test.tsx`, `__tests__/coordinatorOperations.test.tsx` |
| **Mock Coordinator Repository** | `src/data/mock/MockCoordinatorRepository.ts` | `__tests__/coordinator.test.tsx`, `__tests__/coordinatorOperations.test.tsx` |
| **Coordinator Fixtures** | `src/data/mock/fixtures/coordinatorFixtures.ts` | `__tests__/coordinator.test.tsx` |
| **Dashboard Mock Repository & Fixtures** | `src/data/mock/MockDashboardRepository.ts`<br/>`src/data/mock/fixtures/dashboardFixture.ts` | `__tests__/dashboard.test.tsx` |
| **Event Mock Repository & Fixtures** | `src/data/mock/MockEventRepository.ts`<br/>`src/data/mock/fixtures/eventFixtures.ts` | `__tests__/events.test.tsx` |
| **Profile Mock Repository & Fixtures** | `src/data/mock/MockProfileRepository.ts`<br/>`src/data/mock/fixtures/profileFixture.ts` | `__tests__/profile.test.tsx` |
| **Theme Provider & Theme Tokens** | `src/theme/ThemeProvider.tsx`<br/>`src/theme/tokens.ts`, `lightTheme.ts`, `darkTheme.ts` | `__tests__/theme.test.ts` |
| **AppIcon Adapter** | `src/shared/components/AppIcon.tsx` | `__tests__/sharedComponents.test.tsx` |

---

## 4. Route Graph & Navigation State Analysis

### 4.1 Current Navigator Structure
All screens are registered as flat peer routes in `MainDrawerNavigator.tsx` inside a single `createDrawerNavigator<MainDrawerParamList>()`:

```text
MainDrawerNavigator (createDrawerNavigator)
  ├── Dashboard                        (DashboardScreen)
  ├── Events                           (EventsScreen -> EventDiscoveryScreen)
  ├── EventDetail                      (EventDetailScreen, params: { eventId })
  ├── Friends                          (FriendsScreen -> FriendsPlaceholderScreen)
  ├── MyApplications                   (MyApplicationsScreen)
  ├── MyAssignments                    (MyAssignmentsScreen)
  ├── Profile                          (ProfileScreen)
  ├── Availability                     (AvailabilityScreen)
  ├── VerificationCoordinatorStatus    (VerificationCoordinatorStatusScreen)
  ├── CoordinatorWorkspace             (CoordinatorWorkspaceScreen)
  ├── CoordinatorEvents                (CoordinatorEventsScreen)
  ├── CreateEventWizard                (CreateEventWizardScreen)
  ├── CoordinatorEventDetail           (CoordinatorEventDetailScreen, params: { eventId })
  ├── CoordinatorApplications          (CoordinatorApplicationsScreen, params?: { eventId })
  ├── CoordinatorAssignments           (CoordinatorAssignmentsScreen, params?: { eventId })
  ├── CoordinatorAttendance            (CoordinatorAttendanceScreen, params?: { eventId })
  └── Settings                         (SettingsScreen)
```

### 4.2 How EventDetail Returns Today (The Root Cause of Nav Bug)
In `EventDetailScreen.tsx` (lines 159–165):
```typescript
const handleBack = () => {
  if (navigation && navigation.canGoBack()) {
    navigation.goBack();
  } else if (navigation) {
    navigation.navigate('Events');
  }
};
```

1. **Why `canGoBack()` returns user to `Dashboard`:**
   React Navigation's `DrawerNavigator` has default `backBehavior="firstRoute"`. In this drawer, `Dashboard` is screen index 0. Therefore, calling `navigation.goBack()` does **not** pop from a stack; it jumps back to the drawer initial route (`Dashboard`), regardless of whether the user came from `Events`, `MyApplications`, or `MyAssignments`.
2. **Hardcoded fallback:** If `canGoBack()` is false, line 163 unconditionally executes `navigation.navigate('Events')`, causing unexpected jumps if the user came from `Dashboard` or `MyApplications`.
3. **Origin obliviousness:** `EventDetailScreen` receives only `{ eventId: string }` and has no `returnRoute` parameter or nested stack context.

### 4.3 Survival of Filter & Scroll State Today
- **Filter State in `EventDiscoveryScreen`:** Stored in local component state (`searchQuery`, `selectedCategory`, `activeFilters`). While the drawer keeps screens mounted (`unmountOnBlur: false`), because the back action diverts users to `Dashboard`, re-entering `Events` requires an extra manual drawer tap.
- **Scroll State:** React Native `FlatList` does **not** persist scroll offset across route transitions. When navigating from `Events` to `EventDetail` and back, the scroll position resets to the top (`offset: 0`).
- **MyApplications & MyAssignments:** Currently render hardcoded mock views without list pagination, filter state, or tap-to-detail navigation.

### 4.4 Recommended Smallest Safe Navigation Architecture
Rather than introducing `@react-navigation/native-stack` (which would require installing new native pods/dependencies and changing Gradle/Babel setups), we can make `EventDetail` **origin-aware** with minimal risk:
1. Extend `MainDrawerParamList['EventDetail']` to accept `{ eventId: string; returnTo?: 'Events' | 'Dashboard' | 'MyApplications' | 'MyAssignments' }`.
2. In `EventDetailScreen`, `handleBack` inspects `route.params?.returnTo` first:
   ```typescript
   const handleBack = () => {
     const returnTo = route?.params?.returnTo;
     if (returnTo && navigation) {
       navigation.navigate(returnTo);
     } else if (navigation?.canGoBack()) {
       navigation.goBack();
     } else if (navigation) {
       navigation.navigate('Events');
     }
   };
   ```
3. Set `backBehavior="history"` on `Drawer.Navigator` so Android hardware back button and standard drawer history naturally honor navigation order.
4. Lift or cache `EventDiscoveryScreen` filter parameters and list scroll offset so returning restores exact filter and scroll position.

---

## 5. Critical Business-Rule Conflicts & Policy Boundaries

### 5.1 Coordinator Eligibility Rule Gap
- **Backend Rule (§7.2):** `services/coordinator_service.py` requires only that `verification_status == 'verified'`. The SQL schema and backend service have **no check** for completed event count or rating average.
- **Requested UX:** Requires 3 criteria: (1) Account verified, (2) At least 5 completed events, (3) A good rating.
- **Gap 1: Undefined "Good Rating":** No numerical threshold (e.g. 4.0 or 4.5) exists in the backend or documentation. The mobile client **must not invent a numeric threshold**.
- **Gap 2: Completed Event Semantics:** Completed event count must be based on attendance records with `attendance.status = 'completed'` (attendance-backed), not merely `assignments.status = 'completed'` (which can be set by bulk event lifecycle completion even if absent).
- **Enforcement Boundary:** The mobile client cannot treat local event counts or mock ratings as authoritative security permissions. The UI must present the checks as mock presentation, label them `Demo only`, and disable the Apply button when unmet without claiming backend enforcement.

### 5.2 Event Cancellation Semantics: Own Participation vs Event Cancellation
- **Backend Distinction (§8.1 vs §11.5):**
  - **Coordinator:** Cancels the entire event (`events.status -> 'cancelled'`).
  - **Volunteer:** Cancels their own assignment (`assignments.status -> 'cancelled'`).
- **UI Requirement:** A volunteer action must be labelled **"Cancel participation"** or **"Cancel shift"**, NEVER **"Cancel event"**. Completed assignments (`status = 'completed'`) cannot be cancelled.

---

## 6. UX Change Mapping to Existing Source Files & Tests

| Ref | Requested UX Refinement | Exact Source Files to Edit | Existing / New Tests |
|---|---|---|---|
| **UX-01** | **Volunteer Dashboard:** Confirmed & completed event cards with clickable detail nav; rating summary empty state ("No ratings yet"); cancel participation confirmation; subtle full-width coordinator button below stats. | `src/features/dashboard/screens/DashboardScreen.tsx`<br/>`src/features/dashboard/components/UpcomingCommitmentCard.tsx`<br/>`src/features/dashboard/components/CompletedEventCard.tsx`<br/>`src/features/dashboard/components/CoordinatorDashboardCard.tsx` | `__tests__/dashboard.test.tsx` (add tests for cancel participation, card tap, subtle button styling & rating empty state) |
| **UX-02** | **Events Discovery Search/Filter:** Search input and filter button on same row; category chips moved inside filter bottom sheet; filter count badge; origin-preserving EventDetail navigation. | `src/features/events/screens/EventDiscoveryScreen.tsx`<br/>`src/features/events/components/EventFilterSheet.tsx`<br/>`src/features/events/screens/EventDetailScreen.tsx` | `__tests__/events.test.tsx` (add tests for single-row search, filter sheet category selection, and return-route navigation) |
| **UX-03** | **My Applications & Assignments:** Real card data from mock repository; tapping card navigates to EventDetail; back returns to source screen; volunteer can cancel own assignment; withdraw application separated from cancel assignment. | `src/features/events/screens/MyApplicationsScreen.tsx`<br/>`src/features/events/screens/MyAssignmentsScreen.tsx` | `__tests__/events.test.tsx` (add tests for application/assignment detail routing and preserved back destination) |
| **UX-04** | **Friends Screen Simplification:** Remove redundant tabs, fake coordinator cards, and long explanations; clean empty state with single concise message. | `src/features/friends/screens/FriendsPlaceholderScreen.tsx` | `__tests__/friends.test.tsx` (update snapshot / render expectations) |
| **UX-05** | **Profile Summary-First & Eligibility Card:** Summary card with avatar, rating, concise info, and Edit action; full editable form moved to separate `ProfileEditScreen`; Coordinator eligibility card with 3 checks (verified, 5 completed events, good rating); no invented numeric threshold; disabled Apply button when ineligible. | `src/features/profile/screens/ProfileScreen.tsx`<br/>Create `src/features/profile/screens/ProfileEditScreen.tsx`<br/>`src/features/profile/screens/VerificationCoordinatorStatusScreen.tsx` | `__tests__/profile.test.tsx` (add tests for summary card, edit transition, eligibility check evaluations, and disabled button state) |
| **UX-06** | **Availability & Settings Cleanup:** Remove verbose explanatory cards in Availability; clean weekday rows; remove role switcher from Settings; retain Light/Dark/System theme options. | `src/features/profile/screens/AvailabilityScreen.tsx`<br/>`src/features/settings/screens/SettingsScreen.tsx` | `__tests__/profile.test.tsx`, `__tests__/navigation.test.tsx` |
| **UX-07** | **Coordinator Dashboard Button & Myanmar Timezone Picker:** Subtle full-width coordinator button below stats; Create Event Wizard Step 3 date/time controls separated; Myanmar Time (MMT / UTC+06:30) explicit labelling and timezone-aware offset serialization; remove silent numeric fallback defaults. | `src/features/dashboard/components/CoordinatorDashboardCard.tsx`<br/>`src/features/coordinator/screens/CreateEventWizardScreen.tsx`<br/>`src/shared/utils/dateTimeUtils.ts` (new timezone utility) | `__tests__/coordinator.test.tsx` (add tests for separate date/time parsing, validation, timezone offset serialization, and numeric field error handling) |
| **UX-08** | **Mock Repository Stabilization & Demo Labels:** Inject current coordinator identity dynamically; replace unsafe `JSON.parse(JSON.stringify(...))` with typed fixture factories; deterministic IDs; audit all mutations for consistent "Demo only" messaging. | `src/data/mock/MockCoordinatorRepository.ts`<br/>`src/data/mock/fixtures/coordinatorFixtures.ts`<br/>`src/data/mock/MockDashboardRepository.ts`<br/>`src/data/mock/MockEventRepository.ts`<br/>`src/data/mock/MockProfileRepository.ts` | `__tests__/coordinatorOperations.test.tsx`, `__tests__/dashboard.test.tsx`, `__tests__/events.test.tsx` |
| **UX-09** | **Theme Persistence & Icon Consistency:** Safe in-memory/fallback persistence for theme selection without crash; AppIcon maintained glyph set review. | `src/theme/ThemeProvider.tsx`<br/>`src/shared/components/AppIcon.tsx` | `__tests__/theme.test.ts`, `__tests__/sharedComponents.test.tsx` |

---

## 7. Proposed Ordered Fix List with Exact Source Paths

Execution must proceed in strictly isolated, test-verified phases as laid out in the Antigravity plan:

1. **Phase F1 — Volunteer Dashboard Event Activity & Cancel Participation**
   - *Target files:* `src/features/dashboard/screens/DashboardScreen.tsx`, `src/features/dashboard/components/UpcomingCommitmentCard.tsx`, `src/features/dashboard/components/CompletedEventCard.tsx`, `src/features/dashboard/components/CoordinatorDashboardCard.tsx`, `src/domain/models/dashboard.ts`, `src/data/mock/fixtures/dashboardFixture.ts`
   - *Regression tests:* `__tests__/dashboard.test.tsx`
2. **Phase F2 — Event Discovery Search/Filter Layout & Source-Aware EventDetail**
   - *Target files:* `src/features/events/screens/EventDiscoveryScreen.tsx`, `src/features/events/components/EventFilterSheet.tsx`, `src/features/events/screens/EventDetailScreen.tsx`, `src/navigation/navigationTypes.ts`, `src/navigation/MainDrawerNavigator.tsx`
   - *Regression tests:* `__tests__/events.test.tsx`, `__tests__/navigation.test.tsx`
3. **Phase F3 — Event Detail Navigation from Applications & Assignments**
   - *Target files:* `src/features/events/screens/MyApplicationsScreen.tsx`, `src/features/events/screens/MyAssignmentsScreen.tsx`, `src/features/events/screens/EventDetailScreen.tsx`
   - *Regression tests:* `__tests__/events.test.tsx`
4. **Phase F4 — Simplify Friends Screen**
   - *Target files:* `src/features/friends/screens/FriendsPlaceholderScreen.tsx`
   - *Regression tests:* `__tests__/friends.test.tsx`
5. **Phase F5 — Profile Summary, Edit Screen & Coordinator Eligibility Presentation**
   - *Target files:* `src/features/profile/screens/ProfileScreen.tsx`, `src/features/profile/screens/ProfileEditScreen.tsx`, `src/navigation/navigationTypes.ts`, `src/navigation/MainDrawerNavigator.tsx`, `src/domain/models/verification.ts`, `src/data/mock/MockProfileRepository.ts`
   - *Regression tests:* `__tests__/profile.test.tsx`
6. **Phase F6 — Availability Simplification & Settings Cleanup**
   - *Target files:* `src/features/profile/screens/AvailabilityScreen.tsx`, `src/features/settings/screens/SettingsScreen.tsx`
   - *Regression tests:* `__tests__/profile.test.tsx`, `__tests__/navigation.test.tsx`
7. **Phase F7 — Coordinator Dashboard Button & Myanmar Date/Time Picker**
   - *Target files:* `src/features/coordinator/screens/CreateEventWizardScreen.tsx`, `src/features/dashboard/components/CoordinatorDashboardCard.tsx`, `src/shared/utils/dateTimeUtils.ts`
   - *Regression tests:* `__tests__/coordinator.test.tsx`
8. **Phase F8 — Mock Repository Identity, Deterministic IDs & Demo Feedback Consistency**
   - *Target files:* `src/data/mock/MockCoordinatorRepository.ts`, `src/data/mock/fixtures/coordinatorFixtures.ts`, `src/data/mock/MockEventRepository.ts`, `src/data/mock/MockDashboardRepository.ts`, `src/data/mock/MockProfileRepository.ts`
   - *Regression tests:* `__tests__/coordinatorOperations.test.tsx`, `__tests__/dashboard.test.tsx`, `__tests__/events.test.tsx`
9. **Phase F9 — Theme Persistence Review, Icon Adapter & Profile Schema Alignment**
   - *Target files:* `src/theme/ThemeProvider.tsx`, `src/shared/components/AppIcon.tsx`, `src/features/profile/screens/ProfileEditScreen.tsx`
   - *Regression tests:* `__tests__/theme.test.ts`, `__tests__/sharedComponents.test.tsx`
10. **Phase F10 — Android Device Regression QA Suite**
    - *Scope:* Emulator / device verification across all updated screens, back navigation, keyboard overlap, drawer gestures, and theme switching.

---

## 8. Audit Sign-Off
- **Code modifications in `mobile/src/` or `mobile/__tests__/`:** None (0 lines changed).
- **New dependencies installed:** None (0 packages installed).
- **TypeScript, ESLint, and Jest suite status:** 100% passing (109/109 tests green).
- **Audit status:** Complete and documented in `mobile_doc/v0_8_1_phase_f0_inventory_and_route_map.md`. Ready for Phase F1 on user instruction.
