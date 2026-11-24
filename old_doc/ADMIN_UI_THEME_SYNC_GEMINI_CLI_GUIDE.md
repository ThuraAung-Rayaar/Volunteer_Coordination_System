# Admin Portal UI Theme Synchronization — Gemini CLI Task Guide

## Objective
Finish the repetitive page-level visual cleanup of the Django admin portal so it matches the existing React Native CommonGround mobile light theme. Work only on branch `admin/ui-theme-sync`.

## Source of truth
Read these files first:
- `mobile/src/theme/lightTheme.ts`
- `mobile/src/theme/tokens.ts`
- `mobile/src/shared/` (inspect existing component conventions only where useful)
- `backend/admin_portal/templates/admin_portal/base_admin.html`
- `backend/admin_portal/templates/admin_portal/login.html`

Mobile light-theme values (do not invent a new palette):
- Background: `#FAF4E8`
- Surface: `#FFFDF8`
- Raised surface: `#F3EAD8`
- Primary text: `#0E1A33`
- Secondary text: `#56607A`
- Border: `#E7DCC4`
- Primary blue: `#2563EB`
- Accent: `#0369A1`
- Success: `#059669`
- Warning: `#C2410C`
- Danger: `#E11D48`
- Muted: `#8E92A0`

## Work split
The shared admin shell and login theme have already been updated in this branch. Your task is the repetitive page-level consistency audit and small styling corrections across:
- `dashboard.html`
- `users.html`
- `user_create.html`
- `event_create.html`
- `events_detail.html`
- `coordinator_board.html`
- `feedback.html`
- `geo_monitoring.html`
- `settings.html`

Do not redesign the information architecture. Keep existing page layouts and functionality; make their visual treatment coherent with the shared light theme.

## Required visual behavior
1. Use cream page background, white/near-white cards, pale warm raised surfaces, navy headings/body text, muted slate-blue secondary text, subtle beige borders, and blue primary actions.
2. Preserve semantic status colors: success green, warning amber/orange, danger red/rose, informational blue. Keep readable contrast on tinted status badges.
3. Inputs, selects, textareas, tables, filter controls, pagination, empty states, alerts, modals, and map controls must be legible in light mode.
4. Avoid large dark surfaces, dark table headers, white-on-white text, pale text on cream, and low-contrast borders.
5. Keep the design restrained and consistent with the mobile theme. Do not add gradients/glows as decoration unless already functionally meaningful.
6. Preserve responsive layouts; remove or correct any fixed minimum widths that cause horizontal overflow on mobile. Wide data tables may scroll inside their own container.

## Strict behavior-preservation rules
- Do not modify Python views, serializers, models, URL routes, API contracts, permissions, authentication, business rules, or database schema.
- Do not change form method/action/name attributes, CSRF tokens, hidden inputs, field names, query parameters, template context variables, Django template conditions/loops/filters, or button semantics.
- Do not remove or rename DOM IDs/classes used by page JavaScript, Leaflet, map tools, or event handlers.
- Do not change map provider behavior, map URLs, map region definitions, or tile handling.
- Do not introduce a new frontend framework, build system, npm dependency, or server dependency.
- Avoid broad regex replacement of template markup. Inspect each template and make small, intentional styling changes.
- Keep all existing data and action controls. No fake metrics, placeholder records, or hard-coded business data.

## Implementation approach
1. Inspect the complete target template and identify its existing sections and interactive controls.
2. Reuse the shared shell theme. Prefer a small set of consistent utility classes or page-scoped CSS over duplicating large style blocks.
3. Replace dark-surface and dark-input treatments with the specified light surfaces.
4. Ensure text color remains appropriate for its background. White text is reserved for sufficiently dark/strong colored buttons or badges.
5. Check every page at narrow mobile width and desktop width.
6. If a visual issue cannot be safely corrected without changing behavior, leave it untouched and report it.

## Validation
Run the lightest useful checks available:
- Django template compilation/system check if environment is configured.
- Existing admin portal tests only if they can run without touching the frozen/prototype database.
- Static inspection for broken template tags, missing IDs, duplicate IDs, and accidental changes to form actions or names.
- Browser/manual screenshot check at approximately 390px and 1440px if a local environment is available.

Do not connect to or mutate a production/prototype database. Do not run migrations.

## Deliverable
Commit only the page-level admin template styling changes to `admin/ui-theme-sync`. Provide a concise report:
- Files changed.
- Visual changes by page.
- Validation commands and actual results.
- Any remaining contrast/responsive issues.
- Explicit confirmation that Python behavior, URLs, forms, permissions, and database schema were not changed.

Do not merge the branch or open a PR.