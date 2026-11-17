# Volunteer Coordination System v0.7.1
# React Native Android-First UI-Only Implementation Plan

**Document type:** Step-by-step frontend build plan and Antigravity / Gemini Flash prompt pack  
**Project folder supplied:** `python_stack/mobile/`  
**Current project state:** React Native project already initialized and successfully run at least once  
**Current root entries supplied:** `.bundle`, `.eslintrc.js`, `.gitignore`, `.prettierrc.js`, `.watchmanconfig`, `android/`, `app.json`, `App.tsx`, `babel.config.js`, `Gemfile`, `index.js`, `ios/`, `jest.config.js`, `metro.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`, `__tests__/`  
**Primary target:** Android first; retain iOS compatibility where practical  
**Implementation phase:** UI only, backed by local mock fixtures/repositories  
**Explicitly excluded:** Live BFF/API calls, database work, SQL changes, real authentication, production file uploads, push notifications, and deployment work

---

## 0. How to use this document

This document is intended to be executed in small, controlled tasks using Antigravity with Gemini Flash. Do not paste all prompts into one request. Run the prompts in order, one phase at a time, inspect the generated diff, run the stated checks, and only then proceed.

Gemini Flash should be treated as a coding assistant operating on the existing repository, not as the authority for the business rules. It must inspect the real project files before selecting dependencies or changing build configuration.

### Global execution rules

1. Work only inside the existing `mobile/` project unless a prompt explicitly names a root file such as `App.tsx`.
2. Do not recreate the React Native project. Do not run `npx react-native init`, `npx @react-native-community/cli init`, `create-expo-app`, or a project migration.
3. Do not convert the project to Expo. The supplied structure already contains `android/`, `ios/`, `index.js`, and `App.tsx`.
4. Do not modify `updated_volunteer_coordination_system_Database.sql` or any backend code.
5. Do not call the BFF, create an Axios/fetch API layer, or add live credentials in this UI-only phase.
6. Do not invent fields, statuses, permissions, event transitions, friend relationships, or ratings that are absent from the supplied business rules/schema.
7. Inspect `package.json`, `package-lock.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `jest.config.js`, and existing tests before changing dependencies or config.
8. Reuse installed packages when possible. Do not install a package merely because it is familiar. If a dependency is required, first report the exact package, why it is needed, its React Native compatibility, and the native/Babel setup it requires. Install only in the phase where it is needed.
9. Preserve the existing `index.js` entry point and existing native project folders. Keep `App.tsx` as a thin application entry adapter.
10. Use TypeScript for all new application code (`.ts` / `.tsx`). Do not use `any` to avoid defining a type.
11. Every screen must support realistic loading, empty, error, and content states, even though the UI phase uses mock data.
12. All mock data must be clearly labelled as preview/demo data in the project documentation or development UI. Do not present fixtures as real server records.
13. After every phase, summarize changed files, commands run, results, unresolved issues, and the exact next phase. Do not silently continue to another phase.

### Authority order for product rules

| Priority | Source | Authority |
|---|---|---|
| 1 | `updated_volunteer_coordination_system_Database.sql` | Persisted tables, constraints, triggers, functions, capacity, state transitions, attendance and feedback integrity. |
| 2 | `BUSINESS_RULES_AND_PERMISSIONS.md` | Current service behavior, role derivation, permissions, privacy tiers, input allow-lists and endpoint groups. |
| 3 | v0.6.0 Mobile BFF Integration Guide | Mobile response/route examples. Treat route examples as provisional until verified against current `bff/urls.py` and OpenAPI. |
| 4 | This UI plan | Presentation, screen grouping, component boundaries, local mock fixtures and build sequence. It does not override backend rules. |

---

# Part I — Product and UX decisions for the UI phase

## 1. Core account model

The app is **Volunteer-first**. Coordinator is an approved capability attached to a volunteer account; it is not a separate account identity and must not replace the volunteer experience.

The backend documents that there is no `role` field on `users`. Coordinator capability is derived from an active user plus a `coordinator_profiles.status = 'approved'` record. The UI should model a coordinator status, not invent a `role` column or permanently save an `isCoordinator` flag.

| Mock account state | Volunteer UI | Coordinator UI |
|---|---|---|
| Active volunteer, no coordinator application | Visible | Hidden |
| Coordinator application `pending` | Visible | Hidden; show pending status in Profile |
| Coordinator `approved` | Visible | Visible |
| Coordinator `suspended` | Volunteer base UI remains governed by account status | Hide/disable management workspace and show status in Profile |
| Coordinator `revoked` | Volunteer base UI remains governed by account status | Hide management workspace and show status in Profile |
| Account `blocked` or `closed` | UI should show a mock blocked/closed state when testing; actual access is backend-controlled | No coordinator actions |

**Important:** The mobile app may hide controls based on its current profile snapshot, but the BFF must always re-check permissions. UI checks are not security controls.

## 2. Main navigation model

The requested main destinations are reached through a **side drawer**, not a bottom tab bar.

The three primary Volunteer destinations are:

- **Dashboard** — volunteer activity, completed shifts/events, aggregate rating, upcoming/active commitments and, for approved coordinators only, a Coordinator dashboard card.
- **Events** — discover published/active events, search, filters, details, posts, apply, and application/assignment status.
- **Friends** — a design shell for the proposed friend experience. Current SQL/business rules do not define a friend relationship table or friend BFF endpoints; do not show fabricated real relationships.

Additional drawer destinations:

- My Profile
- Availability
- Verification & Coordinator Status
- Coordinator Workspace (approved coordinators only)
- Settings
- Theme preference (Light / Dark / System)
- Log out (visual action only in the UI phase)

Suggested drawer structure:

```text
Volunteer Coordination
├── Main
│   ├── Dashboard
│   ├── Events
│   └── Friends                  [UI shell only until friend rules/API exist]
├── My Account
│   ├── Profile
│   ├── Availability
│   └── Verification & Coordinator Status
├── Coordinator                 [render only for approved coordinators]
│   └── Coordinator Workspace
└── Preferences
    ├── Appearance
    └── Log out                  [visual-only in UI phase]
```

Keep the drawer menu short. Use a profile header at the top showing the mock user's display name and volunteer status. Add a small `Coordinator` label only when the status is approved.

## 3. Screen inventory and build priority

### 3.1 Volunteer screens

| Screen | Priority | Main content | UI interactions in preview |
|---|---|---|---|
| Dashboard | P0 | Welcome header, activity summary, completed work, rating summary, next/upcoming shift, Coordinator card if approved | Open event/assignment details; switch demo profile to test conditional card |
| Events Discovery | P0 | Search bar, category chips, filter sheet, event list, status/availability | Search, apply local filters, open detail |
| Event Detail | P0 | Summary, date/location, charity category, support, posts/capacity, onboarding summary if eligible | Select post, tap Apply (demo-only state) |
| My Applications | P1 | Pending/accepted/waitlisted/rejected/withdrawn/expired list and statuses | Open application details; withdraw preview |
| My Assignments | P1 | Assigned/confirmed/cancelled/completed assignments | Open shift detail; confirm/cancel preview |
| Friends | P2 shell | Empty-state introduction and explanation of future friend functionality | No real friend mutations; no fake people |
| Profile | P1 | Editable profile fields, skills, charity interests, volunteer preferences | Form editing against mock profile only |
| Availability | P1 | Weekly time rules and date exceptions | Add/edit/remove preview rule |
| Verification & Coordinator Status | P1 | Verification progress, coordinator application state | Demo-only state selector; no real image upload |
| Settings | P1 | Theme, accessibility-related display preferences, app information | Theme changes immediately |

### 3.2 Coordinator screens

Coordinator screens are visible only for the mock account with `coordinatorStatus === 'approved'`.

| Screen | Priority | Main content | Backend rule reflected in UI |
|---|---|---|---|
| Coordinator Overview | P1 | My events, draft/published/active counts, pending applications, attention queue | Manager scope; do not imply every event is editable |
| My Events | P1 | Events where user owns or currently coordinates | Owner may be read-only monitor after handover |
| Create Event Wizard | P1 | Multi-step event form with allowed event fields | Initial state is draft; owner is not a user-editable field |
| Event Management Detail | P1 | Status, event summary, actions, posts, roster | Actions depend on status and manager/write scope |
| Event Posts | P2 | Post title, description, headcount, physical level, required skills, leader requirement, new-volunteer flag, priority | No moving a post to another event; headcount cannot fall below active assignments |
| Applications | P1 | Pending/accepted/waitlisted/rejected applications | T2 profile fields appear only for accepted applicants |
| Assignments | P2 | Accepted-but-unassigned and active assignments | Manual/auto assignment is manager-only; SQL remains authoritative |
| Attendance Board | P2 | Volunteer roster, check-in state, confirmation queue | Only active event managers; do not expose raw GPS to volunteer views |
| QR Tools | P2 | Create/revoke event QR tokens | Display the raw token only once in a future integrated flow; never persist it in UI state longer than necessary |
| Feedback | P2 | Feedback submission after completed event and aggregate score display | Scores 1–5; participants only; immutable after submission |

### 3.3 MVP delivery order

1. App foundation, theme, reusable components, and navigation shell.
2. Dashboard (both ordinary volunteer and approved coordinator states).
3. Event discovery and event detail.
4. Profile, availability, coordinator status.
5. Coordinator overview and event creation UI.
6. Coordinator applications / assignment / attendance UI.
7. Friends placeholder.
8. Visual QA, accessibility, responsive layout and regression test.

---

## 4. Business-rule boundaries the UI must preserve

### 4.1 Dashboard facts

- “Completed work” should be derived from completed attendance/participation evidence where available, not merely from an assignment row becoming `completed` when an event ends. The business rules explicitly distinguish assignment completion from attendance history.
- Rating should be shown as an **aggregate** (average and count/distribution if returned). Never display another user's individual feedback row or comment on a public profile. Non-admin viewers can access only their own authored feedback rows; viewing feedback about a user is aggregate-only.
- Do not create a rating from attendance, check-in count, or event count.
- If no feedback aggregate exists, show `No ratings yet`, not `0.0` stars.
- The Coordinator dashboard card must disappear completely for a normal volunteer or non-approved coordinator state. A user with `pending`, `suspended`, or `revoked` coordinator status must not see management tools.

### 4.2 Event discovery and filters

- Public discovery is limited to `published` and `active` events. Draft, completed and cancelled events are only visible to managers/admins/eligible participants according to the business rules.
- Current data supports charity-field categories, event purpose, dates, location, support/compensation attributes, status, and event-post required skills. It does **not** define a generic event-tags column.
- The UI can use charity-field codes as event-category chips and required skills as post-level chips. Do not label them generic event tags in domain contracts.
- Text search and client-side filters can be demonstrated with mock data. Do not assume exact server query parameter names or server-side filtering support until the OpenAPI contract is checked.
- Event-post capacity is authoritative in the database view. The app may display values received from the backend but must not recalculate authoritative capacity locally.

### 4.3 Friends

- No friend/relationship table or friend BFF endpoint is documented in the supplied SQL and Business Rules & Permissions reference.
- Do not infer a friend from shared attendance, a previous coordinator relationship, an event assignment, or a UUID lookup.
- Build only the screen shell and honest empty-state copy. A later feature needs explicit rules for friend requests, acceptance, removal, visibility, blocking, and privacy, followed by schema and BFF work.

### 4.4 Coordinator and event creation

- Event creation requires an approved coordinator.
- Initial event status is always `draft`, onboarding version is initialized by the database, and the owner/current coordinator fields are set by the current rules. Do not expose privileged owner/coordinator identity fields as editable inputs.
- Charity fields: 1–3 active codes are required.
- `end_at` must be later than `start_at`.
- Event status transitions are constrained: `draft → published → active → completed`; cancellation is a terminal path from non-terminal states.
- If the owner hands over coordination, the original owner becomes a read-only monitor until retaking coordination. Show a clear `Read-only monitoring` banner and disable write buttons for that state.
- Create/update forms must use the currently documented event allow-list. Do not add unsupported fields such as arbitrary tags, custom role labels, or free-form friend lists.

### 4.5 Privacy and field visibility

The backend documents T0–T4 privacy tiers. The UI should not make private fields visible merely because a screen design looks convenient.

| Tier | UI presentation rule |
|---|---|
| T0 Public | Public event fields may appear in discovery/detail. |
| T1 Minimal identity | Minimal `{uuid, display_name}` card only for general authenticated lookup. |
| T2 Event-scoped | Skills and volunteer capability fields only in an authorized event-management context after accepted application/active assignment criteria. |
| T3 Strictly private | Phone, emergency contacts, blood type and donation preferences only to self/admin, with the documented active-shift safety exception for permitted emergency access. Do not show in general rosters. |
| T4 Admin/governance | Account status, moderation, audit and geo telemetry are not coordinator/volunteer mobile UI data. |

The UI should not request, keep, log, or display `phone_hash`, `code_hash`, `token_hash`, password, raw OTP, raw private-media paths, or geo device telemetry.

---

# Part II — Repository structure and code boundaries

## 5. First repository audit (before creating `src/`)

The supplied directory list does not show the contents of `package.json` or source files. Therefore the first Antigravity task must inspect, not modify, these files:

- `package.json` and `package-lock.json`
- `App.tsx` and `index.js`
- `tsconfig.json`
- `babel.config.js`
- `metro.config.js`
- `jest.config.js`
- `.eslintrc.js` and `.prettierrc.js`
- `__tests__/`
- Any installed navigation, icon, form, storage, animation, safe-area, and testing packages

The report must include:

1. React Native version and React version.
2. TypeScript version and strictness settings.
3. Existing UI/navigation packages and exact installed versions.
4. Existing scripts (`start`, `android`, `ios`, `test`, `lint`, `typecheck`, etc.).
5. Whether a navigation library is already configured.
6. Whether Reanimated, Gesture Handler and Safe Area Context are installed and how Babel is configured.
7. Any existing conventions in `App.tsx`, tests, linting and formatting.
8. A recommended low-risk implementation path that keeps the current project runnable.

No source files should be edited in this audit task.

## 6. Proposed `src/` folder structure

Use this as the target structure. Gemini may propose a small adjustment if the existing project has a strong convention, but it must explain the reason before deviating.

```text
mobile/
├── android/                         # Existing native Android project; preserve
├── ios/                             # Existing native iOS project; preserve
├── __tests__/                       # Existing Jest test root; preserve
├── App.tsx                          # Thin adapter into src/app/AppRoot
├── index.js                         # Preserve existing RN registration entry
├── package.json                     # Existing dependency manifest
├── tsconfig.json                    # Existing TypeScript configuration
└── src/
    ├── app/
    │   ├── AppRoot.tsx
    │   ├── AppProviders.tsx
    │   └── config/
    │       └── appConfig.ts
    ├── navigation/
    │   ├── navigationTypes.ts
    │   ├── routeNames.ts
    │   ├── RootNavigator.tsx
    │   ├── MainDrawerNavigator.tsx
    │   ├── MainDrawerContent.tsx
    │   └── navigationTheme.ts
    ├── theme/
    │   ├── tokens.ts
    │   ├── lightTheme.ts
    │   ├── darkTheme.ts
    │   ├── ThemeProvider.tsx
    │   └── useAppTheme.ts
    ├── shared/
    │   ├── components/
    │   │   ├── AppText.tsx
    │   │   ├── AppButton.tsx
    │   │   ├── AppIcon.tsx
    │   │   ├── AppCard.tsx
    │   │   ├── AppInput.tsx
    │   │   ├── SearchInput.tsx
    │   │   ├── FilterChip.tsx
    │   │   ├── StatusBadge.tsx
    │   │   ├── RatingSummary.tsx
    │   │   ├── SectionHeader.tsx
    │   │   ├── EmptyState.tsx
    │   │   ├── ErrorState.tsx
    │   │   ├── LoadingState.tsx
    │   │   ├── ScreenContainer.tsx
    │   │   └── Divider.tsx
    │   ├── layout/
    │   │   ├── AppHeader.tsx
    │   │   ├── ScreenLayout.tsx
    │   │   ├── FormSection.tsx
    │   │   └── BottomActionBar.tsx
    │   ├── hooks/
    │   │   └── useDebouncedValue.ts       # Only if search interaction needs it
    │   └── utils/
    │       ├── formatDate.ts
    │       ├── formatNumber.ts
    │       ├── statusPresentation.ts
    │       └── validation.ts
    ├── domain/
    │   ├── models/
    │   │   ├── user.ts
    │   │   ├── event.ts
    │   │   ├── application.ts
    │   │   ├── assignment.ts
    │   │   ├── attendance.ts
    │   │   └── feedback.ts
    │   └── enums/
    │       └── businessStatuses.ts
    ├── data/
    │   ├── contracts/
    │   │   ├── dashboardRepository.ts
    │   │   ├── eventRepository.ts
    │   │   ├── profileRepository.ts
    │   │   └── coordinatorRepository.ts
    │   └── mock/
    │       ├── fixtures/
    │       │   ├── demoUsers.ts
    │       │   ├── dashboardFixture.ts
    │       │   ├── eventFixtures.ts
    │       │   ├── profileFixture.ts
    │       │   └── coordinatorFixtures.ts
    │       ├── MockDashboardRepository.ts
    │       ├── MockEventRepository.ts
    │       ├── MockProfileRepository.ts
    │       └── MockCoordinatorRepository.ts
    └── features/
        ├── dashboard/
        │   ├── screens/VolunteerDashboardScreen.tsx
        │   ├── components/ActivityStatCard.tsx
        │   ├── components/CompletedEventCard.tsx
        │   └── components/CoordinatorDashboardCard.tsx
        ├── events/
        │   ├── screens/EventDiscoveryScreen.tsx
        │   ├── screens/EventDetailScreen.tsx
        │   ├── screens/MyApplicationsScreen.tsx
        │   ├── screens/MyAssignmentsScreen.tsx
        │   ├── components/EventCard.tsx
        │   ├── components/EventFilterSheet.tsx
        │   ├── components/CharityCategoryChips.tsx
        │   └── components/EventPostCard.tsx
        ├── friends/
        │   └── screens/FriendsPlaceholderScreen.tsx
        ├── profile/
        │   ├── screens/ProfileScreen.tsx
        │   ├── screens/AvailabilityScreen.tsx
        │   └── screens/VerificationCoordinatorStatusScreen.tsx
        ├── coordinator/
        │   ├── screens/CoordinatorOverviewScreen.tsx
        │   ├── screens/CoordinatorEventsScreen.tsx
        │   ├── screens/CreateEventWizardScreen.tsx
        │   ├── screens/CoordinatorEventDetailScreen.tsx
        │   ├── screens/CoordinatorApplicationsScreen.tsx
        │   ├── screens/CoordinatorAssignmentsScreen.tsx
        │   ├── screens/CoordinatorAttendanceScreen.tsx
        │   └── components/
        │       ├── CoordinatorMetricCard.tsx
        │       ├── CoordinatorEventCard.tsx
        │       ├── ApplicationReviewCard.tsx
        │       ├── AssignmentRow.tsx
        │       └── AttendanceRow.tsx
        └── settings/
            └── screens/SettingsScreen.tsx
```

### Structure rules

- `features/` contains product screens and feature-specific components.
- `shared/` contains reusable UI primitives that are not tied to one domain.
- `domain/` contains business-shaped types only; no React components and no API calls.
- `data/contracts/` defines repository interfaces/screens' data needs.
- `data/mock/` implements those contracts using local fixtures only. A later BFF phase can add `data/remote/` implementations without rewriting screens.
- `theme/` owns all colors, spacing, typography, radii and elevation values. Screens should not scatter arbitrary hex values.
- `navigation/` owns route names and typed navigation parameters.
- Avoid giant `components.tsx`, `screens.tsx`, or `utils.ts` files.
- Do not add empty folders with no planned use; create them when the corresponding phase starts.

## 7. Entry-point composition

Keep `App.tsx` small. The planned pattern is:

```tsx
// App.tsx
import React from 'react';
import {AppRoot} from './src/app/AppRoot';

export default function App() {
  return <AppRoot />;
}
```

`index.js` remains the existing React Native registration entry. Do not rewrite it unless the current project requires a documented change for a selected native navigation dependency.

The app root should compose global providers in one place:

```tsx
// src/app/AppRoot.tsx (conceptual composition)
export function AppRoot() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
```

The exact `AppProviders` order must be based on installed package requirements, not copied blindly from an unrelated example.

---

# Part III — UI design system and reference code

## 8. UI design direction

Use a calm, trustworthy community-service style. It should feel practical and welcoming rather than like an enterprise admin dashboard.

### Suggested visual tokens

The values below are proposed design tokens, not backend requirements. Gemini should put them in the theme files and not duplicate them throughout screens.

| Token | Suggested value / intent |
|---|---|
| Primary | Deep teal / blue-green; used for primary actions and active navigation |
| Accent | Warm amber; used sparingly for attention and selected highlights |
| Success | Green; completed / confirmed |
| Warning | Amber; pending / action required |
| Danger | Red; rejected / cancelled / destructive confirmation |
| Background | Very light neutral for light mode; deep neutral for dark mode |
| Surface | Cards and sheets; distinct from background in both themes |
| Text primary | High contrast, not pure black/white in every context |
| Text secondary | Muted but still readable |
| Border | Subtle separator / outline |
| Spacing | 4, 8, 12, 16, 20, 24, 32 dp scale |
| Radius | 8, 12, 16, 24 dp scale |
| Touch target | Aim for at least 48 dp on Android interactive controls |

These colors are a starting point. Use one coherent palette for both themes; do not create separate arbitrary colors per screen.

### Layout principles

- Design for common Android widths first (small phone through large phone); avoid fixed widths.
- Use `flex`, percentage width, `maxWidth` where appropriate, and consistent horizontal screen padding.
- Prefer `FlatList` for longer event/application/assignment lists; use `ScrollView` for short dashboard and form content.
- Use safe-area handling consistent with the existing project and selected dependency.
- Keep form actions reachable above the keyboard; use a keyboard-aware layout only if needed and compatible with installed packages.
- Make cards visually scannable: title, one-line context, key status, primary action.
- Do not overuse gradients, shadows, nested cards, or decorative charts.
- Every status must have text as well as color; never rely on color alone.
- Use loading skeletons or simple placeholders consistently; use helpful empty/error states.

## 9. Theme contract and sample code

Support three modes:

- `system` — follow Android appearance setting.
- `light` — force the light palette.
- `dark` — force the dark palette.

During the UI-only phase, theme preference may be kept in provider state. Persisting it can be added later through an already installed storage package or a separately approved dependency. Do not add a storage package simply for the first visual preview.

A suggested typed contract:

```ts
// src/theme/tokens.ts
export type ThemeMode = 'system' | 'light' | 'dark';

export type AppTheme = {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    surfaceRaised: string;
    textPrimary: string;
    textSecondary: string;
    border: string;
    primary: string;
    onPrimary: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
    muted: string;
  };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; '2xl': number };
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
};
```

Use React Native's `useColorScheme` hook as the system preference source. It subscribes to system appearance changes. If the app supports an explicit mode, resolve `system` to the hook result and use the chosen theme for all app components. See the official Appearance documentation in Section 20.

Do not import `useColorScheme` separately in every screen. Centralize theme resolution in `ThemeProvider` and expose a `useAppTheme()` hook.

## 10. Component contracts and UI references

### 10.1 Shared components

| Component | Responsibility | Expected props / notes |
|---|---|---|
| `AppText` | Typography variants | `variant`, `color`, `weight`, children |
| `AppButton` | Consistent button | `label`, `onPress`, `variant`, `disabled`, `loading`, `leftIcon` |
| `AppIcon` | Single icon adapter | Use existing installed icon set; do not assume an icon package exists |
| `AppCard` | Surface container | `padding`, `onPress?`, children |
| `AppInput` | Labelled text input | `label`, `value`, `onChangeText`, `error`, `placeholder` |
| `SearchInput` | Search field with clear action | `value`, `onChangeText`, `onClear` |
| `FilterChip` | Selectable filter | `label`, `selected`, `onPress` |
| `StatusBadge` | State label | `status`, `label`; consistent status mapping |
| `RatingSummary` | Aggregate score | `average`, `count`; empty state if count is zero |
| `SectionHeader` | Section title + optional action | `title`, `actionLabel`, `onActionPress` |
| `EmptyState` | No data state | `title`, `description`, `action?` |
| `ErrorState` | Recoverable error state | `title`, `description`, `onRetry` |
| `LoadingState` | Loading indicator/skeleton | `label?` |
| `ScreenContainer` | Standard screen inset/background | scroll mode, content padding, children |
| `AppHeader` | Screen title and drawer action | title, subtitle, menu button |

Avoid one generic component with dozens of optional props. Keep each component's API narrow.

### 10.2 Example role/capability contract

```ts
// src/domain/models/user.ts
export type CoordinatorStatus =
  | 'pending'
  | 'approved'
  | 'suspended'
  | 'revoked';

export type DemoUser = {
  id: string;
  displayName: string;
  accountStatus: 'active' | 'blocked' | 'closed';
  verificationStatus: 'none' | 'pending' | 'verified' | 'rejected';
  coordinatorStatus: CoordinatorStatus | null;
};

export function hasCoordinatorAccess(user: DemoUser): boolean {
  return user.accountStatus === 'active' && user.coordinatorStatus === 'approved';
}
```

Do not store both `role: 'volunteer' | 'coordinator'` and `coordinatorStatus` as competing sources of truth.

### 10.3 Example Dashboard view-model contract

```ts
// src/domain/models/dashboard.ts
export type CompletedActivity = {
  id: string;
  eventId: string;
  eventTitle: string;
  completedAt: string;
  attendanceStatus: 'completed';
  hours?: number;
};

export type DashboardSummary = {
  completedShiftCount: number;
  completedEventCount: number;
  upcomingEventCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  recentCompletedActivities: CompletedActivity[];
};
```

The UI may render `ratingAverage === null` as `No ratings yet`. Do not manufacture score data.

### 10.4 Example repository contract

```ts
// src/data/contracts/dashboardRepository.ts
import type {DashboardSummary} from '../../domain/models/dashboard';

export interface DashboardRepository {
  getDashboardSummary(): Promise<DashboardSummary>;
}
```

During this phase, only `MockDashboardRepository` implements it. Later a BFF repository can implement the same interface. Screens should depend on the contract or a feature hook, not import fixture arrays directly.

### 10.5 Example drawer route contract

```ts
// src/navigation/navigationTypes.ts
export type MainDrawerParamList = {
  Dashboard: undefined;
  Events: undefined;
  Friends: undefined;
  MyApplications: undefined;
  MyAssignments: undefined;
  Profile: undefined;
  Availability: undefined;
  VerificationCoordinatorStatus: undefined;
  CoordinatorWorkspace: undefined;
  Settings: undefined;
};
```

The route can exist in the type map while its drawer item is conditionally omitted for unapproved users. If nested stacks are used, define typed params for `EventDetail`, `CreateEvent`, `CoordinatorEventDetail`, and other detail screens as well.

### 10.6 Example conditional Coordinator card

```tsx
{hasCoordinatorAccess(currentUser) ? (
  <CoordinatorDashboardCard
    onPress={() => navigation.navigate('CoordinatorWorkspace')}
  />
) : null}
```

The condition is for presentation only. A real backend must still verify coordinator permission on every management endpoint.

---

# Part IV — Screen requirements in detail

## 11. Dashboard UI

### Layout order

1. Header: greeting, display name, drawer menu icon, optional avatar placeholder.
2. Summary row/cards:
   - Completed shifts
   - Completed events
   - Upcoming commitments
3. Rating summary:
   - Average score
   - Number of ratings
   - No-ratings state
4. Upcoming / active event section:
   - Event title, date, post/role, assignment status
5. Recent completed activities:
   - Event name, date, attendance/completion indicator, hours if supplied
6. Conditional Coordinator card:
   - Coordinator overview entry and concise pending-work/event counts only for approved coordinator

### UI behavior

- Keep dashboard readable on a small phone; use a two-column stat grid only when there is enough width.
- Show empty states for no activities, no upcoming events and no ratings.
- Do not create a fake chart until meaningful values and aggregation rules are defined.
- Coordinator card is not rendered at all for ordinary volunteers and non-approved coordinator states.
- Include at least two demo users: ordinary volunteer and approved coordinator. Add pending/suspended fixtures for permission-state testing.

## 12. Events discovery and detail UI

### Discovery screen sections

- Search input: event title, description and location in the mock dataset.
- Category chips sourced from the charity-field taxonomy fixture.
- Filter sheet sections:
  - Event state: Published / Active
  - Date window
  - Charity category
  - Location area (mock display only until location flow is implemented)
  - Support attributes (meals, lodging, travel support)
  - Compensation kind, if supported by current field definitions
- Event cards:
  - Title
  - Charity/category chips
  - Date and location
  - Short description
  - Available/open status from fixture
  - Optional capacity summary only when provided by the data contract

### Event detail screen

- Event overview and purpose.
- Date/time/location and landmark.
- Charity fields (1–3 per current creation rule).
- Support / compensation information.
- Map preview placeholder (no real map SDK in this phase unless already installed and intentionally selected).
- Event posts with physical level, required skills, headcount/capacity, open/full/closed state.
- Apply CTA only for mock-eligible signed-in volunteer state.
- Application status or assignment status panel for the user's own application/assignment.

### Filter implementation rules

- Implement search and filters against fixtures only.
- Store filter state in the screen or feature hook, not scattered across card components.
- Add a clear-all action and selected-filter count.
- Show a no-results state with a reset button.
- Keep the filter model typed so the later BFF mapping can be explicit.

Suggested UI filter model:

```ts
export type EventFilters = {
  query: string;
  charityFieldCodes: string[];
  statuses: Array<'published' | 'active'>;
  mealsProvided?: boolean;
  lodgingProvided?: boolean;
  travelSupportProvided?: boolean;
  startAfter?: string;
  endBefore?: string;
};
```

This is a frontend filter model, not a promise that the server accepts all these query parameters.

## 13. Friends UI shell

Build a polished but honest placeholder:

- Page title: `Friends`.
- Introductory text: `Your volunteer connections will appear here when the connections feature is available.`
- Empty-state illustration/icon from existing assets or an icon adapter.
- Optional subheadings for future `Friends`, `Requests`, `Past coordinators` concepts can appear only as disabled/coming-soon labels; do not show actual people or request buttons.

Do not source people from shared events or UUID lookup. The product definition and privacy rules for that need to be approved first.

## 14. Profile, availability and coordinator application UI

### Profile sections

- Basic profile: display name, preferred language, home area.
- Skills and volunteer suitability/preferences: skills, physical capability and work preferences documented in the profile allow-list.
- Charity interests: choose from active charity-field fixtures.
- Emergency contact name + phone pair must be both entered or both cleared.
- Never show privileged fields such as `is_admin`, `is_superuser`, `account_status` as editable profile controls.

### Availability screen

- Weekly rules: weekday, start time, end time, optional valid date range.
- Date exceptions: unavailable full day or available partial-day slot.
- Empty state when no availability has been set.
- Use a local mock form state; actual schedule-conflict evaluation remains in SQL.

### Verification / Coordinator status screen

- Display verification state (`none`, `pending`, `verified`, `rejected`).
- Display coordinator state (`not applied`, `pending`, `approved`, `suspended`, `revoked`).
- Explain that the Coordinator application requires verified status.
- UI can show upload slots for `mock_selfie` and an identity document type as a visual preview only. Do not add actual device file access, network upload or local private-image persistence in this phase.

## 15. Coordinator workspace and event creation

### Coordinator overview

- My event cards with event title, status and date.
- Summary metrics for pending applications, accepted applicants, assignments and checked-in participants only when fixture data supplies those values.
- Action-needed list (e.g. review applications or confirm attendance) using fixture states.
- Event creation CTA.

### Create Event Wizard

Use a multi-step form to avoid one very long mobile form.

| Step | UI group | Current documented fields / considerations |
|---|---|---|
| 1. Basics | Title, description, purpose, charity categories | `title`, `description`, `purpose_type`, `charity_field_codes`; 1–3 active charity codes |
| 2. Location | Location name, landmark, map coordinates/radius and geo options | `location_name`, `landmark_text`, `latitude`, `longitude`, `geo_radius_m`, `geo_checkin_enabled`, `geo_checkin_opens_before_min`, `require_checkin_confirmation`, `map_provider` |
| 3. Schedule | Start, end, application deadline | `start_at`, `end_at`, `application_deadline`; end must be after start |
| 4. Capacity & acceptance | Acceptance mode, auto assignment, group sizing, leader strategy, max participants | `acceptance_mode`, `auto_assign_enabled`, `group_size`, `leader_strategy`, `max_participants` |
| 5. Volunteer support | Meals, lodging, travel support, compensation | `meals_provided`, `lodging_provided`, `travel_support_provided`, `compensation_kind`, `compensation_note` |
| 6. Onboarding & QR | Briefing text, acknowledgment requirement, QR registration | `onboarding_text`, `require_onboarding_ack`, `qr_registration_enabled` |
| 7. Review | Summary and draft creation preview | Save draft preview; publishing is a separate, status-gated action |

Do not expose `status`, `owner_id`, `current_coordinator_id`, `onboarding_version`, or generated identifiers as user-editable inputs. The database/services own those values.

### Coordinator event detail actions

Render action buttons only when the relevant current state and manager/write capability permit them:

- Draft: edit / publish / cancel.
- Published: activate / edit / cancel.
- Active: complete / cancel / manage posts / applications / assignments / attendance.
- Completed / cancelled: read-only summary, with no invalid transitions.
- Owner-as-monitor: read-only banner and disabled writes until retake.

The UI should show confirmation dialogs for consequential actions. In the mock phase, the dialog may update only demo state and must be identified as a preview.

## 16. Applications, assignments, attendance and QR screens

### Applications

- Segment by pending, accepted, waitlisted, rejected, withdrawn, expired.
- For pending/waitlisted/rejected applicants, show only minimal identity data supported by the rules.
- Show T2 volunteer capability fields only for accepted applicants in the event-manager context.
- Accept/reject/waitlist actions are UI previews only at this stage.

### Assignments

- Show post, group code, group leader flag and assignment state.
- Volunteer self-view may confirm their own `assigned` assignment.
- Volunteer may cancel their own active assignment; manager can cancel on their event; completed assignments cannot be cancelled.
- The client does not allocate posts, resolve schedule conflicts or enforce capacity.

### Attendance

- Coordinator attendance board: assigned roster, assignment state, attendance state, check-in method and confirmation state.
- A manager can visually review pending geolocation confirmations and show Confirm / Reject controls in demo mode.
- Volunteer attendance history must omit raw coordinates, accuracy and device telemetry.
- Geo eligibility, geofence distance, mocked-location rejection and onboarding prerequisites are server/SQL decisions.

### QR

- UI-only QR preview may use a static sample visual or placeholder.
- Do not generate a pretend valid token or call a QR endpoint in this phase.
- In the integrated app, raw QR token is returned once and must never be retrievable from local logs/history; revocation is manager-only and idempotent.

---

# Part V — Data, state and test strategy for UI-only development

## 17. Mock data architecture

### Rules

- Screens never import fixture objects directly.
- Feature hooks call typed repository interfaces.
- Mock repositories return deterministic fixture objects.
- Mock mutation methods update in-memory demo state only and use names such as `previewApply`, `previewConfirmAssignment`, or `previewPublishEvent` to make their non-persistent nature obvious.
- Keep fixtures separate for ordinary volunteer, approved coordinator, pending coordinator and read-only owner monitor scenarios.
- Do not use real user phone numbers, real IDs, real emergency contacts or private images in fixtures.

### Suggested fixture examples

`demoUsers.ts`:

- `ordinaryVolunteerUser`
- `approvedCoordinatorUser`
- `pendingCoordinatorUser`
- `ownerMonitorCoordinatorUser`

`dashboardFixture.ts`:

- Completed attendance-backed activities
- Upcoming assignment
- Aggregate rating sample
- No-rating sample

`eventFixtures.ts`:

- Published event with open posts
- Active event with active post
- Full event post
- Closed post
- Event with meal/travel support
- Event with no rating / no applications

`coordinatorFixtures.ts`:

- Draft event
- Published event
- Active event
- Completed event
- Event in owner-as-monitor state
- Pending applications and accepted applicants
- Assigned and unassigned records
- Attendance confirmation queue

## 18. Loading, empty, error and preview states

Each major screen must demonstrate these states through fixture selection or local developer state:

| State | Example |
|---|---|
| Loading | Skeleton cards / inline activity indicator |
| Content | Normal fixture records |
| Empty | No events, no applications, no completed activity, no availability |
| Error | Error state with Retry button; retry re-reads mock repository |
| Disabled/forbidden | Coordinator workspace unavailable when not approved; owner-as-monitor writes disabled |
| Preview mutation | `Demo only` confirmation / status label after local action |

Do not introduce fake network delay unless needed for visual testing. If a loading demo is built, keep it controlled and deterministic.

## 19. UI testing and acceptance criteria

### Per-phase checks

Use commands that already exist in the project scripts. If no typecheck script exists, run `npx tsc --noEmit` only if TypeScript is configured for no emit. Do not invent a lint command; inspect `package.json` first.

### UI acceptance criteria

- App launches on Android after the new `src/` structure is introduced.
- Existing `index.js`, Android native project and package entry name remain intact.
- Navigation opens Dashboard, Events and Friends from the side drawer.
- Coordinator Workspace and Dashboard card are visible only for approved coordinator fixture.
- Pending/suspended/revoked coordinator fixtures do not get coordinator management access.
- Event search, category chips, filters and clear-all operate against mock fixtures.
- Event detail, application and assignment preview actions provide visible but explicitly non-persistent feedback.
- Create Event Wizard uses only documented fields and validates required inputs locally.
- Owner-as-monitor fixture renders read-only state and disables write CTAs.
- Light, dark and system themes work without screen-specific color overrides.
- All screens have usable small-screen layouts and scroll correctly.
- No UI displays individual feedback rows/comments for another user, T3/T4 data, phone hashes, OTP hashes, QR token hashes, passwords or raw geo telemetry.
- Friends screen does not fabricate actual connections.
- Tests and app launch checks pass after each phase.

### Suggested manual Android QA matrix

| Device/layout | Check |
|---|---|
| Small Android phone width | No clipped cards, buttons or form controls |
| Large Android phone | Content does not stretch awkwardly |
| Light theme | Text and status contrast |
| Dark theme | Surfaces, borders, icons and inputs remain legible |
| Keyboard open | Input and submit action remain reachable |
| Drawer open | Correct menu, selected item and close behavior |
| Ordinary volunteer | No Coordinator card or workspace entry |
| Approved coordinator | Coordinator card and workspace visible |
| Owner-as-monitor | Read-only banner and no write actions |
| Empty fixtures | Empty state with clear next action |

---

# Part VI — Antigravity / Gemini Flash prompt pack

## 20. Common prompt preamble

Paste this preamble at the beginning of each phase prompt. Then paste the phase-specific prompt below it.

```text
You are working inside an existing React Native TypeScript project for the
Volunteer Coordination System. The app has already been initialized and run.
Do not recreate the project, migrate it to Expo, or replace its build setup.

The current backend business rules and SQL database are hard constraints, but
this task is UI-only. Do not connect to the backend, call an API, create an
Axios/fetch client, change SQL, or modify server code.

Before editing, inspect the relevant existing files and current package versions.
Preserve the existing app entry point and native Android/iOS folders. Use the
existing project's conventions. Do not add dependencies unless they are truly
required and compatible with the installed React Native version. Explain any
required dependency and native/Babel configuration before adding it.

Use TypeScript, small files, typed props, reusable components, and accessible
React Native controls. No `any`, no giant all-in-one components, no arbitrary
business rules. Screens use typed mock repository contracts and clearly marked
preview fixtures only.

Make only the changes requested in this phase. After editing:
1. List every file created/changed.
2. Explain the implementation briefly.
3. Run the relevant existing typecheck/lint/test command(s).
4. State the exact command results.
5. Do not proceed to the next phase automatically.
```

## Prompt 0 — Read-only project discovery

**Objective:** Learn the exact initialized environment before creating the structure.

```text
READ-ONLY AUDIT. Do not create, edit, rename or delete any files.

Inspect the existing mobile project. Review package.json, package-lock.json,
App.tsx, index.js, tsconfig.json, babel.config.js, metro.config.js,
jest.config.js, ESLint/Prettier config and __tests__.

Report:
- React Native, React, TypeScript and Node versions where discoverable.
- Installed navigation, icon, safe-area, gesture, animation, form, storage and
  UI testing packages with exact versions.
- Package scripts and existing test setup.
- Whether navigation is already installed/configured.
- Whether Reanimated/Gesture Handler need any config changes for a drawer.
- Existing App.tsx and index.js responsibilities.
- Any current code conventions we should preserve.

Then recommend the smallest safe plan for adding src/ and a side-drawer
navigation shell. Do not install packages. Do not modify any files.
```

**Done when:** You have a version/dependency report and a proposed change list, with no working-tree changes.

## Prompt 1 — Create the `src/` architecture and connect the entry point

**Objective:** Add only the structural foundation and a minimal renderable app root.

```text
Use the findings from the read-only audit. Create the initial src/ structure
needed for a feature-based React Native TypeScript app.

Create only these initial areas:
- src/app/
- src/navigation/
- src/theme/
- src/shared/components/
- src/shared/layout/
- src/shared/utils/
- src/domain/models/
- src/data/contracts/
- src/data/mock/
- src/features/dashboard/screens/
- src/features/events/screens/
- src/features/friends/screens/
- src/features/settings/screens/

Create AppRoot.tsx and AppProviders.tsx with a minimal valid composition.
Update the existing App.tsx to be a thin adapter that renders AppRoot.
Preserve index.js exactly unless the audit proved a required change.

Do not create empty placeholder files for every future screen. Add only files
needed to keep the app compiling. Do not add navigation or UI dependencies in
this task unless they are already installed. Add a simple temporary root screen
with a clear title so we can verify the new structure.

Run the existing typecheck/test/build checks available from package.json.
```

**Done when:** Android still launches and new application code is rooted under `src/`.

## Prompt 2 — Build theme foundation (Light / Dark / System)

**Objective:** Implement theme tokens and a central theme provider.

```text
Implement the theme system under src/theme/.

Requirements:
- ThemeMode is 'system' | 'light' | 'dark'.
- Provide complete light and dark AppTheme values for background, surface,
  raised surface, primary text, secondary text, border, primary, onPrimary,
  accent, success, warning, danger and muted colors.
- Centralize spacing, radius and typography tokens.
- Use React Native useColorScheme for system appearance.
- Add ThemeProvider and useAppTheme hook.
- Expose setThemeMode() so Settings can switch theme immediately.
- Do not add persistence or a storage dependency in this phase.
- Do not use raw color values in screen files.
- Ensure StatusBar styling is consistent with the active theme.

Add a small temporary theme preview screen or update the existing root preview
so we can inspect both modes. Add tests for theme-mode resolution if the current
Jest setup supports them.
```

**Done when:** theme changes at runtime and both palettes are visually distinct and readable.

## Prompt 3 — Implement shared UI building blocks

**Objective:** Make the components needed by every screen before building the screens.

```text
Create the shared UI components under src/shared/components and layout files
under src/shared/layout.

At minimum implement:
AppText, AppButton, AppCard, AppInput, SearchInput, FilterChip,
StatusBadge, RatingSummary, SectionHeader, EmptyState, ErrorState,
LoadingState, ScreenContainer and AppHeader.

Rules:
- Use the central theme hook for every color and spacing value.
- Define typed props; avoid large prop bags and `any`.
- Buttons must support disabled and loading states.
- Inputs must support label, value, onChangeText, placeholder and validation
  message.
- Status badges must show text plus color/icon; never color alone.
- RatingSummary must show an empty state for null average or zero count.
- Add accessibilityRole, accessibilityLabel and accessibilityState where
  applicable.
- Use an already-installed icon package if one exists. If not, create a narrow
  AppIcon adapter with a temporary text/glyph fallback; do not install an icon
  library without reporting the compatibility reason first.

Create a ComponentGalleryScreen or update the temporary preview screen to show
all components in light and dark modes. Keep this as a development preview,
not a production route unless the existing app already has a preview pattern.
```

**Done when:** components render consistently in both themes and can be imported without circular dependencies.

## Prompt 4 — Side drawer and typed navigation shell

**Objective:** Add the requested side-menu navigation and screen placeholders.

```text
Implement the app navigation shell using the navigation library already
installed, if one exists. If none exists, first check the installed React Native
version and choose a compatible React Navigation major version. Do not install
@next blindly. For a drawer, verify and configure all required peer dependencies
and Babel/native setup according to that exact version's official guide.

Required destinations:
- Dashboard
- Events
- Friends
- My Applications
- My Assignments
- Profile
- Availability
- Verification & Coordinator Status
- Coordinator Workspace (approved coordinator only)
- Settings

Use typed navigation route parameter lists. The three primary Volunteer
sections must be opened from the side drawer; do not introduce a bottom tab bar.
Create simple placeholder screens for routes that are not implemented yet.

Add mock current-user context with at least ordinaryVolunteerUser and
approvedCoordinatorUser fixtures. Drawer content must conditionally include
Coordinator Workspace only when account is active and coordinator status is
approved. Keep volunteer destinations visible for approved coordinators too.

Add a development-only profile switcher (for example in Settings) so QA can
switch between ordinary volunteer and approved coordinator fixture. Clearly
mark it as demo-only. Do not connect authentication.

Test drawer open/close, navigation, selected route styling, Android back button,
and conditional menu visibility.
```

**Done when:** all main destinations navigate, Coordinator is conditionally visible, and Android back behavior works.

## Prompt 5 — Volunteer Dashboard

**Objective:** Build the first complete feature screen with mock repository data.

```text
Implement the Volunteer Dashboard.

Create typed domain types, DashboardRepository interface, MockDashboardRepository,
fixtures and a useDashboard hook or equivalent feature data hook.

Dashboard sections:
1. Welcome header.
2. Completed shifts, completed events and upcoming commitments stats.
3. Aggregate rating average and rating count.
4. Upcoming / active commitments.
5. Recent completed attendance-backed activities.
6. Coordinator dashboard card only for an active approved coordinator.

Business constraints:
- Do not use assignment.status=completed alone as proof that the volunteer
  attended/completed the work. Base completed activity fixtures on completed
  attendance/participation evidence.
- Rating is aggregate-only; never render other people's individual feedback or
  comments. Show 'No ratings yet' if aggregate data is absent.
- Hide the Coordinator card entirely for ordinary, pending, suspended and
  revoked coordinator states.
- Coordinator card is a navigation entry, not a second account role.

Add loading, content, empty and error states. Use FlatList for activity lists
if the list can grow; avoid nested scroll containers. Include tests for ordinary
volunteer vs approved coordinator visibility and no-rating display.
```

**Done when:** Dashboard looks complete for both ordinary volunteer and approved coordinator demo profiles.

## Prompt 6 — Event discovery, filtering and event details

**Objective:** Build the event browsing flow using fixtures only.

```text
Implement Event Discovery and Event Detail using typed mock repositories.

Discovery screen:
- Search field.
- Charity category chips (not generic event tags).
- Filter sheet with published/active status, date, charity categories and
  support attributes supported by the supplied data model.
- Event cards with title, purpose, date, location, category and status.
- Clear-all and no-results state.

Detail screen:
- Event summary, date/location/landmark, charity categories, support and
  compensation sections.
- Event posts showing required skills, physical level, headcount/capacity and
  open/full/closed status.
- Application state panel for the current demo user.
- Apply CTA with a visible 'Demo only — not submitted to server' confirmation.

Business constraints:
- Public discovery fixtures contain only published/active events.
- Do not invent generic event tags; use charity-field codes and post required
  skills in their correct contexts.
- Do not recompute authoritative post capacity locally; display fixture values.
- Filters are local fixture filters. Do not assume backend query parameter names.

Use reusable EventCard, EventPostCard, CharityCategoryChips and EventFilterSheet.
Add tests for search, category filter, status filter, clear-all and empty results.
```

**Done when:** discovery filters work locally, event details navigate, and all apply behavior is clearly marked preview-only.

## Prompt 7 — Friends placeholder screen

**Objective:** Provide the requested destination without inventing an unsupported data model.

```text
Implement FriendsPlaceholderScreen.

The supplied SQL and Business Rules & Permissions reference do not define a
friendship table or friend endpoints. Therefore:
- Do not add actual friend records, requests, contacts or APIs.
- Do not infer friends from past coordinators, shared events, UUID lookup or
  attendance history.
- Build an intentional empty/coming-soon screen explaining that volunteer
  connections will appear after the feature's relationship rules and backend
  support are implemented.
- Any future sections such as Friends, Requests or Past Coordinators must be
  disabled labels only, not populated with fixture people.

Match the shared theme and screen layout and add an accessible empty state.
```

**Done when:** Friends is reachable from the drawer and transparently communicates its current availability.

## Prompt 8 — Profile, availability and coordinator status UI

**Objective:** Build the volunteer account screens with local form state only.

```text
Implement ProfileScreen, AvailabilityScreen and
VerificationCoordinatorStatusScreen.

Profile fields must align with the documented editable profile allow-list:
display_name, preferred_language, home_area, emergency contact pair, skills,
volunteer capability/preferences and charity interests. Do not render privileged
fields as editable controls.

Validation:
- Emergency contact name and phone must both be provided or both empty.
- Skills are trimmed, lowercased, deduplicated and sorted for preview display.
- Charity-interest selections must use known active fixture codes.
- All edits stay in mock state and show a Demo-only save confirmation.

Availability:
- Weekly rules by weekday/start/end and optional date range.
- Date exceptions for full-day unavailable or partial availability.
- Do not calculate authoritative schedule conflicts; display a placeholder
  note that the server/database evaluates conflicts.

Verification/Coordinator status:
- Show verification and coordinator statuses.
- Explain that coordinator application requires verified status.
- Include visual upload placeholders only; do not access camera/gallery or
  upload files in this phase.

Add form error, read-only and empty states. Add unit tests for emergency
contact pairing and skills normalization.
```

**Done when:** account screens match the documented editable fields and all editing is mock-only.

## Prompt 9 — Coordinator overview and Create Event Wizard

**Objective:** Implement the approved coordinator workspace and event form.

```text
Implement CoordinatorOverviewScreen, CoordinatorEventsScreen,
CreateEventWizardScreen and CoordinatorEventDetailScreen using mock fixtures.

Access:
- Only active approved coordinator fixture can enter the workspace.
- Non-approved states must not access management screens by tapping a hidden
  route. Add a route-level UI guard as well as hiding the drawer item.
- Include owner-as-monitor fixture and a visible read-only banner. Disable all
  write actions for this state.

Create Event Wizard:
1. Basics: title, description, purpose_type, 1-3 charity_field_codes.
2. Location: location_name, landmark_text, coordinates/radius and geo options.
3. Schedule: start_at, end_at, application_deadline.
4. Capacity & acceptance: acceptance_mode, auto_assign_enabled, group_size,
   leader_strategy, max_participants.
5. Support: meals, lodging, travel support, compensation_kind and note.
6. Onboarding & QR: onboarding_text, require_onboarding_ack,
   qr_registration_enabled.
7. Review: summary and Save Draft preview.

Do not add status, owner_id, current_coordinator_id or onboarding_version as
editable fields. Do not add generic event tags. Validate charity selections
(1-3) and end time later than start time. The creation action must be labelled
Demo-only and create only a local draft fixture.

Coordinator event detail:
- Render event actions according to valid state: draft, published, active,
  completed, cancelled.
- Use confirm dialogs for publish, activate, complete and cancel previews.
- Owner-as-monitor can view only and cannot edit or transition.

Add tests for coordinator route guard, field allow-list, required charity count,
end-after-start and owner-as-monitor disabled actions.
```

**Done when:** approved coordinator can navigate the workspace and create a local draft preview; other states cannot manage events.

## Prompt 10 — Coordinator applications, assignments and attendance UI

**Objective:** Complete the core coordinator operational views.

```text
Implement CoordinatorApplicationsScreen, CoordinatorAssignmentsScreen and
CoordinatorAttendanceScreen with fixture data and shared components.

Applications:
- Filter by status: pending, accepted, waitlisted, rejected.
- Pending/waitlisted/rejected applicants show only minimal identity fields.
- T2 capabilities appear only for accepted applicants in the manager's event
  context.
- Accept/reject/waitlist actions are demo-only local previews.

Assignments:
- Display post, assignment status, group code and group leader label.
- Show unassigned accepted applicants and existing assignments separately.
- Do not compute capacity, grouping, schedule overlap or auto-assignment locally.
- Buttons for auto/manual assignment must be demo-only previews.

Attendance:
- Show attendance roster and status.
- Show a pending geo confirmation queue with confirm/reject preview actions.
- Do not expose GPS raw coordinates, accuracy or device telemetry to volunteer
  views; only coordinator-specific fixture context may include operational
  review metadata if the supplied permission rules permit it.
- Do not implement real location permission, GPS capture or geofence logic yet.

Add clear status labels, empty states, filters and event context header. Add
unit tests for T2 visibility and disabled actions when owner-as-monitor.
```

**Done when:** coordinator can inspect the complete operational screens in demo mode without any real API call.

## Prompt 11 — Final UI integration, accessibility and regression QA

**Objective:** Stabilize the UI before the later BFF integration phase.

```text
Perform a UI-only quality pass across the entire mobile/src implementation.
Do not add new product features and do not connect the backend.

Check:
- TypeScript correctness and strict typing.
- Existing lint and Jest setup.
- No duplicate theme values or screen-specific raw hex colors.
- No broken navigation or unguarded Coordinator routes.
- Ordinary, pending, approved, suspended and revoked demo profiles.
- Owner-as-monitor read-only behavior.
- Light/dark/system theme consistency.
- Small Android width layout, keyboard overlap, scroll behavior and status bar.
- Empty/error/loading states.
- Accessibility labels/roles/state on interactive controls.
- No fake Friends data or unsupported event tags.
- No private T3/T4 information or raw secrets/telemetry in UI.
- No API client, backend URL, SQL or server changes.

Run the existing package scripts and Android launch/build command from the
project's README. Fix only issues found in this pass. Report any test that cannot
run and why. Finish with a list of UI features completed and a separate list of
items deliberately deferred to BFF integration.
```

**Done when:** app builds and launches on Android, all UI acceptance criteria in Section 19 pass, and the agent provides a clear deferred-work list.

---

# Part VII — Later integration boundary (not part of these prompts)

## 21. How the UI will connect to BFF later without redesign

When the UI phase is accepted, the next phase should add remote repository implementations, not rewrite screens.

```text
Screen
  ↓
Feature hook / ViewModel
  ↓
Repository interface (src/data/contracts)
  ├── MockRepository (current UI phase)
  └── BffRepository (future integration phase)
        ↓
     API client + route manifest
        ↓
     Django BFF
        ↓
     Django service layer
        ↓
     PostgreSQL functions / triggers / constraints
```

Future integration requirements:

- Verify the canonical mobile base path and exact endpoint paths from the live `bff/urls.py` and generated OpenAPI schema. Do not rely solely on older handoff examples.
- Define DTOs from actual serializer/OpenAPI response shapes. Do not use mock fixture types as an assumed wire contract without validation.
- Centralize base URL, authentication token injection, error parsing, pagination and timeouts.
- Store credentials only using an approved secure-storage solution; do not use ordinary mock fixtures or logs for secrets.
- Handle HTTP 401/403/404/409/429 and field validation responses distinctly.
- Treat SQL as authoritative for transitions, application eligibility, capacity, schedule conflicts, attendance and geo decisions.
- Reconcile the Dashboard through a BFF aggregation response or multiple verified read endpoints. Do not create a client-side metric that contradicts server facts.
- Add idempotency/concurrency-safe UX where the backend exposes it; disable duplicate taps while a mutation is pending.
- Implement QR, location, offline map packs, identity verification upload and encrypted file transport only in separately scoped integration tasks.

### Current capability gaps to keep visible

| Capability | UI phase | Requirement before production integration |
|---|---|---|
| Friends / friend requests | Placeholder only | Product rules, schema/table, privacy policy and BFF endpoints |
| Generic event tags | Charity category and post-skill chips only | Confirm whether current schema should remain as-is or support a new tag taxonomy |
| Unified volunteer Dashboard | Mock aggregation contract | Verify existing source endpoints or implement a BFF read aggregation |
| Push notification inbox | Omitted | Notification model, provider, consent, delivery and endpoints |
| Theme persistence | In-memory preference initially | Choose existing/approved local preference storage |
| Real image upload | Visual placeholder only | Android picker, secure transport, server-side encrypted storage and authorized streaming |
| Real map/geofence/QR | UI placeholders | Verified map/QR contracts, Android permissions and security testing |

---

# Part VIII — References

## 22. Project source references

Use the uploaded project sources as the product contract during implementation:

- `BUSINESS_RULES_AND_PERMISSIONS.md` — role derivation, permissions, T0–T4 privacy, profile allow-list, event lifecycle, applications, assignments, attendance, feedback, availability and BFF route groups.
- `updated_volunteer_coordination_system_Database.sql` — primary database hard rules and persisted state/constraint behavior.
- `volunteer_coordination_system_v0_6_0_complete_session_summary_mobile_bff_integration_guide.md` — mobile-oriented BFF route/response guide; verify against current backend routing before live integration.
- `v0_7_0_mobile_app_architecture_and_bff_implementation_plan.md` — mobile product architecture and BFF plan that this document turns into a concrete UI-only work sequence.

## 23. Official technical references

These references are for React Native implementation details only. Dependency versions must still be matched to the existing project.

1. React Native TypeScript guide: https://reactnative.dev/docs/typescript
2. React Native navigation guidance: https://reactnative.dev/docs/navigation
3. React Native Appearance / `useColorScheme`: https://reactnative.dev/docs/appearance
4. React Native accessibility: https://reactnative.dev/docs/accessibility
5. React Navigation drawer guide: https://reactnavigation.org/docs/drawer-navigator/
6. React Navigation getting started / peer dependencies: https://reactnavigation.org/docs/getting-started/

---

# Final execution checklist

Before beginning Prompt 1:

- [ ] Prompt 0 read-only audit completed.
- [ ] Existing project runs before any edits.
- [ ] React Native and dependency versions documented.
- [ ] Navigation dependency decision confirmed against installed version.
- [ ] Existing root entry files and native folders preserved.

Before declaring UI phase complete:

- [ ] `src/` structure is in place and App.tsx remains a thin adapter.
- [ ] Side drawer contains Dashboard, Events and Friends.
- [ ] Coordinator card/workspace is conditional on approved coordinator status.
- [ ] Dashboard is based on attendance-backed completion and aggregate rating fixtures.
- [ ] Event search/filter/detail screens work with mock data.
- [ ] Friends screen is an honest placeholder, not fabricated data.
- [ ] Profile, availability and verification/coordinator status screens exist.
- [ ] Coordinator event creation and operations screens exist.
- [ ] Theme supports light, dark and system modes.
- [ ] Loading, empty, error, preview and read-only states are present.
- [ ] T0–T4 privacy boundaries are respected in the mock UI.
- [ ] Typecheck/tests and Android launch/build checks pass.
- [ ] No backend, BFF, SQL or production authentication work was introduced.

**UI phase exit condition:** The app is a navigable, Android-tested, volunteer-first UI prototype using typed local mock repositories. The screen architecture is ready for a later BFF repository implementation, but no screen makes a real server request yet.
