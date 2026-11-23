# Template-First Mobile UI — Local Renderability & Completion Plan

**Target branch:** `feature/template-first-mobile-ui`  
**Branch base:** `main` at `2f63e5509d5d8a681f614cfe29c7aa40957550cd`  
**Audited branch HEAD:** `0fe1c2df0469dce1d2671ec4a6df4ff8402001e2`  
**Assessment source:** `branch_improvement_analysis_report.md` (22 November 2026)  
**Implementation environment:** Local workstation with Antigravity  
**Database policy:** Frozen — no schema changes, migrations, seeds, resets, or writes to the protected prototype database  
**Repository policy:** Do not use GitHub operations for this work. Do not push, create PRs, merge, or modify remote branches.

---

## 1. Purpose

This plan describes how to take the current `feature/template-first-mobile-ui` branch from substantial implementation and BFF contract parity to a mobile application that can be built, launched, navigated, edited, and visually reviewed in **Template Mode**, without connecting to the backend or PostgreSQL.

The goal is not to redesign the application. Preserve the existing React Native architecture, BFF contracts, domain models, DTOs, mappers, repositories, navigation, and database-first backend.

Template Mode must be a complete, local demonstration mode:

- All mobile screens render.
- All mobile forms expose the fields relevant to their BFF contract.
- Pickers use values accepted by the existing backend serializers.
- The user can navigate through the volunteer and coordinator journeys.
- Form validation and success/error states behave consistently.
- Mock repositories update the in-memory fixture data so changes are visible elsewhere in the app during the same session.
- Authentication and all other Template Mode operations remain local.
- No API request, PostgreSQL connection, migration, or database write is caused by Template Mode.
- Switching to HTTP Mode is explicit and does not silently change the behavior of Template Mode.

This work is the mobile presentation and template-renderability phase. It does not implement the deferred .NET product runtime, real SMS provider delivery, CIT, production map integration, or a database redesign.

## 2. Current improvement level

### 2.1 Quantitative change recorded by the audit

The uploaded branch audit records:

| Measure | Recorded value |
|---|---:|
| Commits ahead of the merge base | 27 |
| Repository files changed | 28 |
| Insertions | 2,027 |
| Deletions | 351 |
| Backend Django system check | Pass — 0 issues |
| Mobile Jest | 595 passed, 9 failed, 604 total |
| TypeScript compilation | Failed — approximately 10 diagnostics |
| Mobile screens represented in the parity matrix | 17 |
| PostgreSQL tables/read views mapped by the matrix | 22 |

**Important report inconsistency:** the test summary row also says `30 PASS / 7 FAIL`, while its details say `595 passed / 9 failed out of 604`. Do not silently choose one number. The first task must produce a fresh Jest run and report the actual number of test files/suites and individual tests passed/failed.

### 2.2 What has materially improved

The branch has made substantial progress in five areas:

1. **Template Mode isolation:** `UserContext` has a local OTP state machine using demo code `123456`, an in-memory challenge, and a 300-second expiration. The report says Template Mode does not call the tokenized or legacy OTP endpoints and does not write OTP rows.
2. **BFF contract parity:** unsupported event enum values were removed. `leader_strategy` now uses `none`, `first_experienced`, and `manual`; `compensation_kind` uses `unpaid` and `arranged_outside_system`.
3. **Coordinator workflows:** event-post create/edit/close, volunteer invitations, manual assignment controls, attendance notes, and QR token lifecycle controls have been added.
4. **Event configuration:** the seven-step event wizard is reused for editing. Manager-only operational configuration is loaded through a manager-scoped endpoint, and partial PATCH mapping distinguishes omitted fields from explicit `null`.
5. **Security and documentation:** manager-only event settings are not exposed through the public event serializer; owner-as-monitor restrictions have been added; the screen/BFF/database matrix and local runbook have been written.

### 2.3 What is not complete

The current branch should be described as **feature- and contract-substantially implemented, but not yet build-verified or visually accepted**.

The audit explicitly records:

- TypeScript compilation fails.
- Existing Jest tests have failures caused by stale copy, old enum values, changed form behavior, and a changed event-post return contract.
- Emulator/device visual review remains outstanding.
- The test figures in the report need to be refreshed because its summary row and detailed count disagree.

No completion percentage is assigned here. Commit count and line count measure activity, not screen quality or acceptance. The most useful measure is the number of screens that pass compile, interaction, navigation, visual, and Template Mode isolation gates.

---

## 3. Scope boundaries

### 3.1 Included

- Repair the current TypeScript compilation errors.
- Synchronize tests with the updated UI and API contracts.
- Make Template Mode reliably local and deterministic.
- Ensure every screen in the existing 17-screen matrix can be navigated to and rendered.
- Check form fields against the existing BFF serializer contracts.
- Complete missing visual states: loading, empty, validation, error, success, disabled, read-only and retry.
- Verify the volunteer and coordinator journeys using local fixtures.
- Verify screen layout on Android emulator/device; iOS simulator/device where available.
- Improve accessibility and keyboard behavior without changing the product architecture.

### 3.2 Excluded

- No database schema changes or migrations.
- No SQL edits as part of the mobile-renderability phase.
- No test seeding or writes to `volunteer_coordination_db`.
- No GitHub pushes, remote branch changes, pull requests, merges, or GitHub CI work.
- No actual SMS provider integration. Template OTP is local only.
- No CIT/JWE/HPKE identity-envelope work.
- No production image-storage redesign. Template mode may use dummy image placeholders; actual HTTP upload is a later integration concern.
- No native map feature unless it is explicitly listed as one of the current 17 screens in the existing parity matrix. A GPS placeholder is not a map renderer.
- No new navigation framework, UI library, form library, state-management library, or design-system replacement without first proving the current stack cannot meet the requirement.

---

## 4. Local working rules for Antigravity

Give Antigravity these rules at the beginning of every phase:

1. Work only in the local checkout and the existing feature branch.
2. Do not call GitHub tools, push, create a PR, merge, or modify any remote reference.
3. Do not inspect or modify `old_doc/`.
4. Preserve all uncommitted user changes. Before editing, report `git status` and the current local HEAD.
5. Do not checkout/reset/clean/rebase or discard changes.
6. Do not edit PostgreSQL SQL, Django migrations, triggers, functions, constraints, views, indexes, or the protected database.
7. Do not “fix” TypeScript by adding broad `any`, `@ts-ignore`, non-null assertions without proof, disabling strict mode, or suppressing diagnostics.
8. Do not weaken tests merely to get green. Update stale expectations to the new intended user-visible behavior and retain meaningful assertions.
9. Change only files required by the phase. Report every modified path and why.
10. Run the phase verification before starting the next phase. Stop and report blockers rather than continuing through a broken baseline.

### Required Antigravity completion report per phase

- Phase and scope completed.
- Local branch and HEAD.
- Files changed.
- Commands executed and exit codes.
- Actual test counts, including test files/suites and individual tests.
- Screens manually opened and device/emulator resolution used.
- Template Mode network-isolation result.
- Any skipped/unavailable verification.
- Remaining defects.
- Explicit PASS or BLOCKED decision for the next phase.

---

# 5. Phase T0 — Establish a reproducible local baseline

**Objective:** determine the exact local state and toolchain before changing code.

### Tasks

1. Run `git status --short` and record local branch/HEAD. Do not modify the working tree just to make it clean.
2. Confirm the checkout is the audited feature branch and that its HEAD matches the report or record the newer local commit.
3. Read `mobile/package.json`, the lockfile name, `tsconfig.json`, Jest configuration, Babel configuration, Metro configuration, and the README/local runbook. Do not assume commands or dependency versions.
4. Confirm local tools:
   - Node version required by the project.
   - npm/yarn/pnpm version matching the lockfile.
   - Java version required by the installed Android Gradle Plugin.
   - Android SDK/platform/build tools and an available emulator.
   - Xcode/iOS toolchain only if the workstation is macOS.
5. Install dependencies using the package manager represented by the committed lockfile. Prefer a reproducible lockfile install (for npm, `npm ci`) rather than changing dependency versions.
6. Capture the initial TypeScript and Jest output before editing.
7. Confirm that no backend server or database is required to start Template Mode.

### Commands

Run commands from `mobile/` after checking `package.json` scripts:

```bash
node --version
npm --version
npm run
npx tsc --noEmit
npm test -- --runInBand
```

Use the exact test command from the repository if its script differs. Do not install a second test runner or alter Jest presets in this phase.

### Deliverable

A local baseline note containing tool versions, current HEAD, current TypeScript diagnostics, full Jest totals, and whether the app can start before fixes.

### Gate T0

Pass only when the baseline is recorded and dependencies are installed reproducibly. Do not proceed on the assumption that tests pass.

---

# 6. Phase T1 — Repair TypeScript compilation first

**Objective:** make the complete mobile TypeScript project compile before visual debugging.

The audit names these specific issues. Fix them one by one, then run TypeScript again because the first diagnostics can hide later errors.

### T1.1 Missing wizard draft type import

File: `mobile/src/features/coordinator/screens/CreateEventWizardScreen.tsx`

The report states that around line 426 the screen references `CreateEventWizardDraft` without importing it.

Action:

- Locate the authoritative declaration.
- Import it from the existing domain/model module.
- Do not redeclare a second, screen-specific copy.
- Confirm that the type matches both create and edit wizard state.

### T1.2 Missing `chipsRow` style

File: `mobile/src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx`

The screen references `styles.chipsRow`, but the style is absent from the `StyleSheet.create` object.

Action:

- Inspect how the chips are laid out and the surrounding design tokens.
- Add the missing style using the existing spacing, wrapping, and alignment conventions.
- Confirm that small screens wrap chips rather than overflow horizontally.

### T1.3 Missing `StatusBadge` label

File: `mobile/src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx`

The report identifies a `StatusBadge` call that omits the mandatory `label` property.

Action:

- Check the component prop contract and existing call sites.
- Supply a meaningful, localized display label derived from the actual status.
- Keep the machine status separate from the human-readable label.
- Do not make a required component prop optional solely to silence this call site.

### T1.4 `null` versus `undefined` in mock coordinator repository

File: `mobile/src/data/repositories/MockCoordinatorRepository.ts`

The report identifies nullability diagnostics around lines 255, 276 and 278.

Action:

- Read the domain model and DTO contracts.
- Preserve the distinction:
  - `undefined`: a field is absent/not supplied.
  - `null`: the field is explicitly empty/cleared where the BFF permits null.
  - concrete value: the field contains a value.
- Use the same semantics in mock and HTTP repositories.
- Do not replace all nulls with empty strings, zeros, false, or undefined without checking the field's meaning.
- Add mapper/repository tests for both omitted and explicitly cleared values.

Reference logic: TypeScript strict null checking and control-flow narrowing. Keep strict null checks enabled.

### T1.5 Complete compilation pass

After fixing the listed issues:

```bash
npx tsc --noEmit
```

Then repeat until zero diagnostics remain. Do not stop after fixing only the four named examples; the report estimates approximately ten diagnostics.

### Gate T1

- TypeScript exits with code 0.
- No `any` or ignored diagnostics were introduced to bypass real contract errors.
- No API DTO or database model was weakened just to make the view compile.

---

# 7. Phase T2 — Synchronize Jest tests with the new contracts

**Objective:** make the existing suite describe the intended Template Mode behavior.

The branch audit names several stale expectations. Fix the test data and assertions to match the new contract, not the other way around.

### T2.1 Mode wording

Update tests in:

- `coordinator.test.tsx`
- `settings.test.tsx`

Old expectations include `"Confirm (Demo)"` and `"Demo Preview"`. The updated UI uses Template Mode wording such as `"Confirm (Template)"` and `"Template Preview"`.

Tests should assert the user-visible meaning, preferably through stable accessible text/roles, not fragile implementation strings where unnecessary.

### T2.2 Event enum values

Update `coordinatorWorkspace.test.tsx` fixtures and assertions:

| Obsolete UI/test value | Supported BFF value |
|---|---|
| `first_assigned` | `first_experienced` |
| `highest_rated` | not a supported option in the reported serializer contract |
| `stipend` | not supported by the reported contract |
| `travel_reimbursement` | not supported by the reported contract |
| compensation alternatives | `unpaid`, `arranged_outside_system` |

Use the actual serializer choices and labels. Do not add an option because it seems useful unless the existing BFF accepts it.

### T2.3 Editable manual check-in note

Update `phase7UiIntegration.test.tsx`.

The previous test expected a hard-coded note. The note is now an editable, optional coordinator input.

Test at least:

- blank note is allowed if the BFF permits it;
- entered note is passed unchanged;
- trimming/length validation follows the serializer contract;
- no hidden default note is sent when the field is blank;
- a failed mutation does not display success.

### T2.4 Event-post mutation return contract

Update `capabilityUseCases.test.ts` and the corresponding repository/use-case tests.

The report states the post operation returns an operational result shaped as `{ id, status }`, not a fully populated `EventPost`.

Make the contract decision consistent across:

- repository interface;
- mock implementation;
- HTTP implementation;
- use case;
- UI handler.

After a successful mutation, refresh/refetch the event's canonical post list when the full entity is required for display. Do not fabricate a complete entity from only an ID and status.

### T2.5 Rerun and report exact counts

Run the entire suite. The uploaded report is internally inconsistent: one row says `30 PASS / 7 FAIL`, while its detailed count says `595 passed / 9 failed` out of `604`. The new result must state separately:

- test suites/files passed and failed;
- individual tests passed and failed;
- skipped/todo tests;
- command and exit code.

### Gate T2

- Every previously failing test is either corrected or has an explicitly documented genuine product defect.
- No assertions have been deleted or weakened without a replacement behavior assertion.
- Jest exits successfully for the full current suite.

---

# 8. Phase T3 — Prove Template Mode is genuinely local

**Objective:** ensure every screen and the authentication flow use local fixtures when Template Mode is selected.

### T3.1 Repository selection

Inspect the existing repository provider/context (the current project already supports `mock` and `http` modes).

Verify:

- `mock` selects mock repositories for every mobile feature repository, not only coordinator/event repositories.
- HTTP repositories are not called indirectly by a use case.
- A missing mock implementation fails visibly rather than silently falling back to HTTP.
- The app starts in the agreed Template Mode during UI design work.
- Switching modes is an explicit developer action.
- A mode switch clears or rebuilds mode-specific state so a stale authenticated session or cached HTTP object is not carried into Template Mode.

### T3.2 Authentication isolation

The report describes this Template Mode behavior:

- demo OTP: `123456`;
- in-memory challenge;
- 300-second expiry;
- no API call;
- no `auth_otp` or `auth_otp_challenge` write.

Verify all of it.

Test:

1. Request OTP in Template Mode.
2. Assert that no `fetch`/network transport call occurred.
3. Confirm local challenge is created.
4. Verify with `123456`.
5. Verify a wrong code is rejected.
6. Verify expiry is enforced.
7. Change phone/restart/cancel the challenge and confirm state is cleared as intended.
8. Confirm the screen clearly says this is a local demo and no SMS has been sent.

The demo code must never be described as a real SMS or provider delivery.

### T3.3 Network isolation tests

Add a dedicated Template Mode isolation test:

- replace or spy on the app's network transport;
- boot the app with Template Mode;
- walk through login, profile, event browsing, coordinator screens and mock mutations;
- assert zero outbound API requests;
- assert no database configuration/import is needed by the mobile process.

If image placeholders are used, keep them as fixture assets or local placeholder state; do not make an HTTP image upload call in Template Mode.

### T3.4 In-memory mutation behavior

Template Mode is described as using in-memory fixtures. Verify that a mutation is visible after navigation within the same running session:

- profile update → profile screen refresh;
- availability change → availability summary refresh;
- event create/edit → event list and detail refresh;
- post create/edit/close → post list refresh;
- invite/decision → application state refresh;
- assignment → assignment list refresh;
- check-in → attendance state refresh;
- QR create/revoke → QR list state refresh.

Document whether data resets on app restart. Unless persistent local storage is already part of the existing design, do not silently introduce it. A predictable reset is acceptable for template demonstration mode.

### Gate T3

- Zero network side effects in Template Mode.
- All mock mutations are coherent during a session.
- The UI always identifies Template Mode correctly.
- HTTP Mode remains a separate path and is not accidentally replaced by mock behavior.

---

# 9. Phase T4 — Screen-by-screen template renderability

**Objective:** every screen in the existing 17-screen parity matrix must render reliably and expose the correct fields and actions.

The file `docs/TEMPLATE_MODE_BFF_SCREEN_AND_DATABASE_MATRIX.md` is the source of truth for the exact 17 screens. Antigravity must use its exact screen names and routes. Do not create a substitute list that omits an existing screen or adds unsupported screens.

For each screen, create a checklist with these dimensions:

1. Route/navigation entry exists.
2. Screen renders with fixture data.
3. Empty/loading/error states render.
4. Every visible field has a source and correct type.
5. Every editable field has controlled state and validation.
6. Every action has an implemented callback.
7. Every mutation updates the correct mock repository.
8. Role/owner/monitor restrictions are reflected in UI.
9. Keyboard, scroll, safe-area and small-screen behavior work.
10. Accessibility labels and roles are present.
11. A component interaction test exists.
12. It has been visually inspected in the emulator.

### T4.1 Authentication and onboarding

- Phone field: correct phone keyboard, placeholder format and validation.
- OTP field: numeric input, exact six-character validation, focus behavior and expiry message.
- Template banner: clear “local demo” meaning.
- Profile creation/complete-profile steps: display every field currently exposed by the profile BFF serializer and existing mobile DTO.
- Verification image slots: show dummy image preview/empty/remove/replace states as appropriate to the existing screen; do not pretend an image has been uploaded to the backend in Template Mode.

### T4.2 Volunteer profile

Compare every profile field in the existing mobile form against the current profile DTO/serializer. The plan is not to add all PostgreSQL columns to the UI; include every field that is part of the mobile/BFF contract and keep system/audit-only columns out of the UI.

For each field, define:

- label;
- placeholder/example;
- input component;
- allowed values;
- required/optional;
- null/clear semantics;
- validation;
- display format;
- mock fixture value.

Check long names, missing optional values and empty profile sections.

### T4.3 Volunteer availability

Verify:

- weekly/day-of-week rules;
- time ranges;
- active/inactive rules;
- date exceptions;
- add/edit/remove interactions;
- duplicate or overlapping rule behavior;
- empty availability state;
- summary reflects the mock repository state.

Use the same time and date semantics as the existing domain/BFF contract. Do not create a second date convention for the UI.

### T4.4 Event discovery and detail

For the existing event screens verify:

- event list cards;
- search/filter/sort controls if present in the matrix;
- event status and capacity display;
- location and nullable coordinate display;
- details, compensation, required capabilities and schedule;
- event-post listing;
- application action and already-applied/closed/full states;
- loading, empty and retry states.

Unknown coordinates must remain unknown; do not invent `0,0`.

### T4.5 Event create/edit wizard

Keep the existing seven-step wizard. Do not create two independent forms.

The report confirms these option contracts:

- `leader_strategy`: `none`, `first_experienced`, `manual`;
- `compensation_kind`: `unpaid`, `arranged_outside_system`;
- `geoCheckinOpensBeforeMin`: editable 0–240 minutes;
- `mapProvider`: `openstreetmap` or `google`.

For every wizard field:

- show an explicit label and unit;
- show valid placeholder/example;
- validate before advancing;
- preserve values when navigating Back/Next;
- show a clear summary before submission;
- distinguish create from edit;
- in edit mode, submit a partial PATCH;
- preserve `undefined` for untouched/omitted fields;
- send `null` only when the user explicitly clears a nullable field;
- do not turn missing numeric coordinates into zero.

Test draft navigation, validation, cancel behavior and successful local create/edit.

### T4.6 Coordinator event detail and event posts

Post form fields already reported:

- title;
- description;
- required headcount;
- physical level (`none`, `light`, `medium`, `heavy`);
- required skills;
- leader needed;
- new volunteers allowed;
- priority.

Verify create/edit/close interactions and the post list refresh. The screen must not create a fake full post entity from `{id,status}`.

Owner-as-monitor behavior must be visible and enforced in the mock repository as well as the screen:

- monitor can view;
- monitor cannot create, edit or close posts;
- missing permission context must not default to editable mode.

### T4.7 Coordinator applications and invitations

Verify:

- application list and status filters;
- application detail;
- accept/reject/decision controls supported by current BFF;
- invite by numeric user ID or canonical UUID;
- numeric ID and UUID fields are mutually exclusive;
- optional target post;
- invitation note;
- validation errors and success feedback;
- Tier-2 volunteer capabilities displayed only where the manager-authorized response permits them.

Do not make up volunteer data to fill a UI card. Use deterministic fixture records.

### T4.8 Coordinator manual assignment

The template must expose:

- accepted application/volunteer selection;
- target post selection where applicable;
- optional group code;
- group-leader flag;
- server/business validation outcomes.

Verify monitor owners cannot assign. The selected application ID must be the actual selected fixture ID, not the first item in an array by default.

### T4.9 Attendance and QR

Verify:

- roster list and status chips;
- check-in note input;
- manual check-in interaction;
- repeat/idempotent mock behavior;
- disabled/cancelled states;
- QR token purpose;
- maximum uses;
- expiration minutes;
- create/revoke lifecycle;
- no false “server saved” wording in Template Mode.

### T4.10 Settings and mode control

The mode selector must clearly identify Template Mode and HTTP Mode. Switching modes should not leave a screen showing stale values from the previous repository.

The app must not expose live backend credentials, provider secrets or hidden production configuration as editable mobile settings.

### T4.11 Other screens in the 17-screen matrix

Antigravity must inspect the exact matrix and verify every remaining screen by name. For screens whose backend capabilities are deferred or admin-only, show a deliberate disabled/coming-soon/information state rather than a dead button or fabricated data.

### Gate T4

All 17 matrix screens have a recorded renderability result. No screen is considered complete just because its TypeScript file exists.

---

# 10. Phase T5 — Shared UI behavior and visual polish

**Objective:** make screens usable on real device dimensions, not only renderable by React.

### Layout checks

- Respect safe areas at the top and bottom.
- Keep content scrollable when it exceeds viewport height.
- Use `KeyboardAvoidingView` or the existing keyboard-aware pattern for forms.
- Verify submit buttons are not hidden behind the keyboard.
- Ensure long forms do not trap the user at the last field.
- Avoid nested vertical scroll containers unless intentionally designed.
- Ensure lists use stable keys and appropriate virtualized list components for long data.
- Test portrait orientation first; test landscape only where the design supports it.
- Check small and large font scales.

### Input checks

Use the right native keyboard:

- phone: phone-pad;
- OTP/numeric IDs: numeric/number-pad;
- email: email-address;
- multiline descriptions/notes: multiline;
- date/time: existing picker component where available.

Every input should have:

- a persistent label (not placeholder-only);
- placeholder example;
- required/optional indicator;
- validation text;
- disabled/read-only state if permission requires it;
- clear focus order;
- maximum length where defined by the backend contract.

### Interaction checks

- Buttons have disabled/loading states.
- Destructive actions have confirmation.
- Repeated submit taps do not duplicate mutations.
- Success messages are shown only after the mock operation completes.
- Error messages are human-readable and do not expose stack traces.
- Empty states explain the next action.
- Loading indicators do not replace the entire screen unnecessarily.

### Accessibility checks

- Buttons and inputs have accessibility labels.
- Selection state is announced.
- Error messages are associated with their fields.
- Status is not conveyed by color alone.
- Touch targets should be comfortably tappable; follow current React Native UX guidance.
- Verify VoiceOver/TalkBack navigation on at least one platform if device time permits.

### Theme and consistency

Use the project's existing design tokens and reusable controls. Do not introduce a second color/spacing system. Standardize:

- page title and back navigation;
- section headings;
- form fields;
- primary/secondary/destructive buttons;
- status badges;
- cards and list rows;
- modal/bottom-sheet behavior;
- empty/loading/error components.

---

# 11. Phase T6 — Local emulator and visual acceptance

**Objective:** verify the actual native application can launch and each screen is visually usable.

### 11.1 Launch

Use the scripts already defined in `mobile/package.json`. Do not invent new scripts or update native project configuration just to match a generic tutorial.

Typical React Native development sequence, subject to the project's scripts:

```bash
# terminal 1 — Metro
npm start

# terminal 2 — use the repository's existing Android run script
npm run android
```

If the repo uses a custom command, follow that command instead. For iOS, use the existing script/workspace on macOS.

### 11.2 Minimum visual passes

Test:

1. Small Android emulator viewport.
2. Common Android phone viewport.
3. Larger viewport/tablet if the app supports it.
4. Large accessibility font scale.
5. Keyboard open with the bottom-most form field focused.
6. Long event title and long description.
7. Empty list and long list.
8. Slow/blocked image fixture if the screen includes images.

For each of the 17 screens, capture:

- initial render;
- scrolled state if relevant;
- form validation state;
- modal/expanded state;
- success or empty state.

Screenshots are evidence of rendering, not proof of backend integration.

### 11.3 Required user journeys

Run these entirely in Template Mode:

**Volunteer journey**
1. Open app.
2. Complete local demo OTP using `123456`.
3. Open profile and edit fields.
4. Edit availability.
5. Browse events.
6. Open event detail and posts.
7. Apply to an event using a fixture.
8. Return and confirm the mock state updated.

**Coordinator journey**
1. Use a coordinator fixture account/mode.
2. Open coordinator workspace.
3. Create an event.
4. Open event detail.
5. Edit the event through the shared seven-step wizard.
6. Create/edit/close a post.
7. Invite a volunteer using numeric ID and then UUID in separate tests.
8. Review an application.
9. Create a manual assignment using explicit post/group/leader values.
10. Open attendance and record a manual check-in note.
11. Create and revoke an event QR token.

**Owner-as-monitor journey**
1. Load an owner who has delegated coordination.
2. Confirm the page renders.
3. Confirm permitted reads remain visible.
4. Confirm post/event/assignment write controls are hidden or disabled.
5. Attempt the mutation through the mock repository and confirm it is rejected. UI hiding alone is not sufficient.

### Gate T6

- App launches without a red screen or fatal render error.
- All 17 screens open and render.
- Main user journeys are usable.
- No clipped/hidden primary controls.
- Keyboard and scroll behavior are acceptable.
- No Template Mode network calls occur.

---

# 12. Required test strategy and acceptance gates

Use a layered verification approach:

| Layer | What it proves | Required result |
|---|---|---|
| TypeScript | Types, imports, props, nullability | 0 errors |
| Mapper tests | DTO/domain and enum/null mapping | All pass |
| Repository tests | Mock state and HTTP contract shape | All pass |
| Use-case tests | Business interaction contract | All pass |
| Component tests | Render and user interactions | All pass |
| Navigation tests | Routes and role-specific paths | All pass |
| Template isolation | Mock mode has no network side effects | 0 outbound requests |
| Emulator review | Native rendering, layout and keyboard | All 17 screens inspected |
| Database freeze audit | No database work occurred | No DDL/migration/seed/write |

### Specific tests to add or repair

- `CreateEventWizardDraft` import/type and create/edit behavior.
- `chipsRow` rendering and wrapping.
- `StatusBadge` required label.
- Mock repository null/undefined semantics.
- Template wording in coordinator/settings tests.
- New event enum fixtures.
- Editable check-in note.
- `createEventPost` result `{id,status}` contract and follow-up read.
- Partial PATCH with omitted field vs explicit `null`.
- Template OTP 123456, wrong code, expiry and no fetch.
- Mock repository mutations survive navigation within the same app session.
- Owner-as-monitor write refusal.
- Invite numeric ID/UUID validation.
- QR lifecycle mock behavior.
- All 17 screens render with fixture data.

### Do not use snapshot-only approval

Snapshots can catch unexpected render-tree changes but cannot prove usable layout on device. Prefer user-visible queries and interactions for tests; use a limited number of snapshots for stable reusable components only.

---

# 13. Recommended Antigravity execution sequence

Do not give Antigravity one enormous instruction to rewrite the entire app. Use a prompt per phase and require a stop report after each.

| Prompt | Scope | Completion gate |
|---|---|---|
| `T0 — Local Baseline` | Inspect local branch, package scripts, toolchain, initial compiler/tests | Reproducible baseline recorded |
| `T1 — TypeScript Repair` | Fix named diagnostics and all remaining compile errors | `tsc --noEmit` passes |
| `T2 — Jest Synchronization` | Update stale assertions/fixtures/return contracts | Full Jest suite passes |
| `T3 — Template Isolation` | Prove mock provider and local auth have zero network side effects | Isolation tests pass |
| `T4 — Screen Parity Audit` | Walk all 17 screens and field matrix | Every screen has a pass/defect list |
| `T5 — Missing UI/Field Completion` | Implement only confirmed missing UI fields/states | No unmatched BFF field/action without a documented reason |
| `T6 — Visual QA` | Run emulator journeys and repair layout defects | All 17 screens visually accepted |
| `T7 — Final Local Handoff` | Consolidate screenshots, test outputs, coverage and known limitations | Local template-mode sign-off |

If T1 or T2 fails, do not jump to visual polish. Rendering broken TypeScript screens wastes time and makes UI bugs harder to distinguish from compilation problems.

---

# 14. Final definition of “Template UI renderable”

The branch is ready for the next local HTTP-integration stage only when all conditions hold:

- [x] The mobile project compiles with zero TypeScript diagnostics.
- [x] Full Jest suite passes, with exact counts recorded.
- [x] Template Mode can authenticate locally using demo code `123456`.
- [x] Template Mode produces zero network requests.
- [x] Template Mode does not connect to PostgreSQL or require backend startup.
- [x] All 17 screens in the parity matrix render.
- [x] Every BFF-supported mobile field is either present in the UI or explicitly classified as hidden/system-only/deferred.
- [x] All editable fields have correct type, choices, nullable semantics and validation.
- [x] Every visible button has a real template-mode action or a clearly explained disabled/deferred state.
- [x] Mock mutations update local fixtures consistently across navigation.
- [x] Owner-as-monitor is read-only in both UI and mock repository.
- [x] All primary volunteer/coordinator journeys complete on emulator.
- [x] No screen has blocking overflow, keyboard obstruction, inaccessible primary controls or fatal empty-state rendering.
- [x] Database remains frozen and untouched.
- [x] Local report records screenshots, commands, test results and remaining limitations.

Only after this gate should the team move from Template Mode to controlled HTTP Mode testing.

---

# 15. References

## 15.1 Repository-specific sources

Use these as the authoritative project references before making code changes:

1. `docs/TEMPLATE_MODE_MOBILE_UI_AND_BFF_PARITY_PLAN.md` — T0–T4 intent, architecture rules and scope.
2. `docs/TEMPLATE_MODE_BFF_SCREEN_AND_DATABASE_MATRIX.md` — exact 17-screen inventory, BFF serializers/routes and 22 database tables/read views.
3. `reference/v0_12_0_local_demonstration_runbook.md` — local Windows/PostgreSQL 18.6 setup and database freeze rules.
4. `mobile/src/app/UserContext.tsx` — Template Mode authentication state machine.
5. `mobile/src/features/auth/screens/OtpLoginScreen.tsx` — local OTP display and user interaction.
6. `mobile/src/features/coordinator/screens/CreateEventWizardScreen.tsx` — shared create/edit wizard.
7. `mobile/src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx` — event and post management.
8. `mobile/src/features/coordinator/screens/CoordinatorApplicationsScreen.tsx` — invite/application workflow.
9. `mobile/src/features/coordinator/screens/CoordinatorAssignmentsScreen.tsx` — assignment parameters.
10. `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx` — attendance note and QR workflow.
11. `mobile/src/data/mappers/coordinatorMapper.ts` — BFF/domain mapping and partial PATCH semantics.
12. `mobile/src/data/repositories/MockCoordinatorRepository.ts` — template fixture mutation semantics.
13. `mobile/src/data/repositories/HttpCoordinatorRepository.ts` — HTTP contract counterpart; use for parity comparison, not Template Mode execution.
14. `backend/bff/coordinator/serializers.py` and `backend/bff/coordinator/views.py` — actual BFF choices, fields and authorization scope.
15. `backend/services/query_service.py` — coordinator event/post read projection.

Before editing a path, inspect its current local contents and current callers. Line numbers in the audit report may have shifted since the report was generated.

## 15.2 Official external references

These are implementation guidance, not replacement specifications for the project's existing architecture:

- React Native testing overview: https://reactnative.dev/docs/testing-overview
  - Covers static analysis, unit tests, component rendering/interactions and device end-to-end testing. It also explains why JS component tests do not replace native-device checks.
- React Native Testing Library introduction: https://testing-library.com/docs/react-native-testing-library/intro/
  - Use its user-centric query and interaction approach; avoid relying on internal component state or implementation details.
- Jest — React Native testing: https://jestjs.io/docs/tutorial-react-native/
  - Use the React Native Jest preset and mock only native modules that cannot run in the Node test environment.
- React Native TextInput: https://reactnative.dev/docs/textinput
  - Keyboard types, multiline input, `onChangeText` and focus behavior.
- React Native improving UX: https://reactnative.dev/docs/improvingux
  - Keyboard management, form input usability and touch target guidance.
- React Native accessibility: https://reactnative.dev/docs/accessibility
  - Accessible roles, labels and state for VoiceOver/TalkBack.
- TypeScript narrowing: https://www.typescriptlang.org/docs/handbook/2/narrowing
  - Use explicit control-flow narrowing for nullable values.
- TypeScript strict null checks: https://www.typescriptlang.org/tsconfig/strictNullChecks.html
  - Preserve the distinction between `null`, `undefined`, and concrete values.

**Version rule:** follow the versions already recorded in the local `package.json` and lockfile. Do not copy configuration snippets from a different major version without checking compatibility.

---

## Final recommendation

The branch has already delivered substantial improvements to Template Mode and BFF parity. The remaining work is not a broad redesign. It is a controlled progression from **compile → tests → mock isolation → field/screen completeness → emulator rendering → local sign-off**.

The first Antigravity task should be T0 followed immediately by T1. Do not begin by adding more UI. Get the existing 17-screen implementation compiling, then make its tests accurately represent the new contracts. Once that baseline is green, use the parity matrix to drive the visual review screen by screen.
