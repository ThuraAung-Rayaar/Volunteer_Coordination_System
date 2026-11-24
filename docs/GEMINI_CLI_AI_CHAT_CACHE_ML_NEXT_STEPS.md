# Gemini CLI Work Order — AI Chat, Mobile Cache, and Two ML/Analytics Features

**Repository:** \`ThuraAung-Rayaar/Volunteer_Coordination_System\`  
**Working branch:** \`feature/ai-chat-cache-ml-insights\`  
**Base branch:** \`main\`  
**Core foundation commit:** \`031a7ad0fe5612f26fcea0f1ed52f4ccc7cf3e2c\`  
**Branch parent before this work:** \`743b5db1338c7a03b5a1195501c69f5059b7d04f\`  
**Status:** Prototype hardening and implementation continuation. Do not merge or open a PR.

---

## 1. Delegation goal

Continue the AI chat and the two approved ML/analytics features until they are plausible for an end-to-end prototype demonstration. Work on the existing feature branch only.

The user has asked to delegate the remaining token-consuming, implementation-heavy work to Gemini CLI. This document is the handoff specification. Start by checking the live repository state; do not assume that the commit SHAs above are still the branch head after this document is added.

The current scope is deliberately narrow:

1. A bounded, read-only, role-scoped AI assistant for the web/admin interface and React Native mobile application.
2. Explainable volunteer-to-event recommendations.
3. Event staffing-gap and coverage insights.
4. Mobile and admin UI cache/partial-refresh behavior required to make those features feel responsive and reliable.

Do not add anomaly detection, another ML feature, write-capable AI actions, or unrelated product functionality.

### Important distinction about the two techniques

The two approved V1 features are **deterministic and explainable**:

- Volunteer-to-event recommendation is a rule-based ranking technique with hard eligibility filters and weighted profile-fit signals. It is not a trained predictive model in this version.
- Staffing-gap/coverage insight is operational analytics computed from authoritative capacity, application, and assignment records. It is descriptive analytics, not a learned classifier.

Do not pretend that a trained model exists. Make these two techniques useful, measurable, explainable, and safe first. A later phase may calibrate recommendation weights or evaluate a learned ranking model from explicitly approved feedback data, but that is not permission to add a third feature or alter the frozen database.

---

## 2. Required working rules

1. **Branch safety:** work only on \`feature/ai-chat-cache-ml-insights\`. Do not commit, cherry-pick, or push to \`main\`. Do not merge this branch and do not create a PR.
2. Fetch the current remote branch head, inspect \`git status\`, and inspect the diff against \`origin/main\` before editing. Preserve any new user work.
3. The current prototype has intentional UI inconsistencies. Fix only inconsistencies that block the chat and insight workflows; do not perform a broad visual redesign.
4. Exclude \`old_doc\`. Do not spend time reading unrelated docs/reference collections. Use the source files listed below and trace any additional code path that is actually needed.
5. PostgreSQL is the source of truth for lifecycle, application eligibility, assignment, attendance, and geolocation rules.
6. **Frozen database contract:** do not add or change tables, views, functions, triggers, indexes, enums, migrations, pgvector, seed data, or other schema objects. The schema contract is v0.12.0.
7. The assistant must not connect directly to PostgreSQL, write SQL, or execute arbitrary code. All data access goes through small backend service tools, each re-authorized against the current actor.
8. Never expose or send decrypted phone numbers, phone hashes, emergency contacts, blood type, passwords, OTP/session tokens, verification images, exact coordinates, private notes, or other T3/T4 data to an LLM.
9. The recommendation engine must not create applications or assignments. Staffing insights must not mutate assignments.
10. Run tests and report actual commands/results. Do not mark a test passed because the code looks correct.

---

## 3. What the core commit has already changed

Commit \`031a7ad0fe5612f26fcea0f1ed52f4ccc7cf3e2c\` is the current foundation. Inspect its diff before building on it.

### AI/provider foundation

- Added an Ollama provider adapter using the native \`/api/chat\` endpoint; no new Python package is required.
- Added provider selection for \`mock\`, \`ollama\`, and \`gemini\`.
- Added Ollama URL, keep-alive, timeout, token, enablement, and per-user throttle configuration.
- Updated the Gemini adapter's tool-result conversation reconstruction.
- Added an Ollama provider unit-test file.
- Chat service now builds minimal role/language instructions, redacts the message before provider context, limits one request to at most three tool calls, and sends tool results to a synthesis turn without allowing an unbounded tool loop.
- Provider/tool errors should be generic to the client. Keep diagnostic logging server-side and never log sensitive prompts, tool payloads, credentials, or decrypted profile content.
- The current mobile chat request sends completed prior messages; the server appends the new message exactly once. The history guard removes a leading welcome bubble and a trailing unanswered user message.

### Security and access foundation

- Tool schemas and executed tools are now aligned to the implemented registry.
- The search tool calls \`query_service.list_public_events(params)\` using its actual signature.
- Public event detail is serialized from an explicit allow-list rather than passing a Django model instance to the model.
- Exact coordinates and private event fields are not part of the AI event-detail payload.
- Tool access is checked on the server immediately before execution.
- Since no admin-tier column or confirmed mapping exists, ordinary admins have public-only assistant tools for now. Coordinators may inspect only events they manage. Super-admins can request system-wide staffing insight. **Do not widen regular-admin access unless the owner supplies an explicit tier policy.**
- The assistant API now uses active-user permission, scoped throttling, the \`AI_ENABLED\` feature gate, and a generic provider-failure response.

### Recommendation foundation

- Database availability/schedule checking now fails closed if the authoritative PostgreSQL functions fail.
- Availability scoring is awarded only when the exact event window is covered by a matching saved weekly rule or date exception. “No conflict found” is not the same thing as a positive availability preference.
- The capacity view is consulted when identifying open posts.
- Scoring is deterministic and carries \`recommendation-v1\`.

### Mobile cache foundation

- The shared query cache uses TTL, LRU eviction, request deduplication, tag/prefix invalidation, account scopes, and request-generation protection so an old in-flight request cannot repopulate data after invalidation or logout.
- Event discovery's \`getEvents()\` path uses the cached page loader and supports forced refresh.
- Account identity changes clear account-scoped cache entries.
- Application, assignment, event, post, and staffing-related mutations invalidate relevant cached data more precisely.
- The assistant screen now sends only previous conversation messages; a regression assertion was added.
- Cache tests cover stale in-flight requests after invalidation and account-scope clearing.

These changes are a foundation, not proof that the feature is complete. Verify every behaviour below before declaring the branch plausible.

---

## 4. Small/free LLM decision and local setup

### Recommended local starting point

Use **Ollama + \`qwen3.5:4b\`** as the preferred free-to-run local prototype model. The current Ollama library lists this variant at approximately 3.3–4.0 GB model download size and advertises tool support. Actual runtime RAM/VRAM use is higher than the weight-file size and depends on quantization, context length, parallel requests, and hardware.

On the machine hosting Ollama:

\`\`\`bash
ollama pull qwen3.5:4b
ollama serve
\`\`\`

The Django backend must be able to reach the Ollama host at \`AI_OLLAMA_BASE_URL\`. For a backend running directly on the same machine, the default is:

\`\`\`dotenv
AI_ENABLED=true
AI_PROVIDER=ollama
AI_MODEL=qwen3.5:4b
AI_OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_OLLAMA_KEEP_ALIVE=5m
AI_TIMEOUT_SECONDS=45
AI_MAX_OUTPUT_TOKENS=600
AI_RATE_LIMIT_PER_MINUTE=20
\`\`\`

For a Django container, \`127.0.0.1\` refers to that container, not the host. Configure a reachable service/container hostname or the correct host-gateway address. Never hardcode a developer's machine-specific address in committed code.

Verify the service before exercising the app:

\`\`\`bash
curl http://127.0.0.1:11434/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{"model":"qwen3.5:4b","messages":[{"role":"user","content":"Reply with OK"}],"stream":false}'
\`\`\`

If the developer machine cannot comfortably run 4B, evaluate \`qwen3.5:2b\` as a lower-memory option. Do not switch the project default without comparing tool-call reliability, answer correctness, response latency, and memory use. A small local model can be weak at complex tool selection; the server-side allow-list and permission checks remain mandatory even when the model is accurate.

### Optional hosted alternative

The Gemini Developer API advertises a free tier for selected models, including free input/output tokens subject to model access and rate limits. The current pricing page states that free-tier content may be used to improve Google's products. Treat this as a prototyping option only: verify the account/model quota and current terms before use, and do not send private user data or production personal information.

Configure it only through environment variables:

\`\`\`dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-3.6-flash
AI_API_KEY=<secret-from-Google-AI-Studio>
\`\`\`

Never commit a real API key. If the Gemini model identifier is not available to the configured account, confirm the supported model in AI Studio and update the environment; do not silently fall back to the mock provider.

### Cost and privacy reality

- Local Ollama avoids per-token provider billing, but consumes the hosting computer's CPU/GPU, RAM/VRAM, storage, electricity, and maintenance time.
- A hosted free tier is quota-limited and has provider data-use terms. “Free” does not mean unlimited or suitable for all personal data.
- Do not call the model directly from React Native. The mobile/web client calls the authenticated Django assistant endpoint; the server controls context, provider choice, authorization, and tools.
- The LLM is a language interface and summarizer. Deterministic backend services remain responsible for matching, capacity, status, eligibility, and permission decisions.

Official references to verify during implementation:
- Ollama chat API: https://github.com/ollama/ollama/blob/main/docs/api.md
- Ollama tool calling: https://github.com/ollama/ollama/blob/main/docs/capabilities/tool-calling.mdx
- Qwen3.5 4B in Ollama: https://ollama.com/library/qwen3.5:4b
- Gemini Developer API pricing/terms: https://ai.google.dev/gemini-api/docs/pricing

---

## 5. Source map — inspect these code paths

### Backend assistant and provider

| Path | Purpose / review focus |
|---|---|
| \`backend/ai/services/chat_service.py\` | Prompt assembly, bounded history, provider lifecycle, at-most-three tool calls, result synthesis, sources/actions. |
| \`backend/ai/providers/base.py\` | Provider contract; keep the abstraction vendor-neutral. |
| \`backend/ai/providers/ollama_provider.py\` | Local \`/api/chat\`, schema conversion, tool-call/tool-result exchange, timeout and error handling. |
| \`backend/ai/providers/gemini_provider.py\` | Gemini REST request and function-call/result exchange. |
| \`backend/ai/providers/mock_provider.py\` | Deterministic offline/CI provider; keep it representative and clearly marked as mock. |
| \`backend/ai/tools/registry.py\` | The only approved AI data-access tool registry. Validate all model arguments, result sizes, and JSON-safe return values. |
| \`backend/ai/security/scope_policy.py\` | Current actor scope and per-tool authorization. Do not invent admin tiers. |
| \`backend/ai/security/prompt_guard.py\` | User prompt length, accepted roles, two-exchange history bound. |
| \`backend/ai/security/redaction.py\` | Recursive sensitive-field removal and Myanmar phone redaction. |
| \`backend/ai/tools/system_help.py\` | Curated workflow text; verify every policy statement against the current business services before presenting it as authoritative. |
| \`backend/bff/assistant/views.py\` | \`POST /api/v1/assistant/chat/\`, active-account requirement, throttle, feature gate, generic failure response. |
| \`backend/bff/assistant/serializers.py\` | Request/response shape and client-supplied history validation. |
| \`backend/config/settings/base.py\` | AI provider, model, timeout, output/history, enablement and throttle configuration. |

### Recommendation engine (feature 1)

| Path | Purpose / review focus |
|---|---|
| \`backend/services/recommendation_service.py\` | Hard eligibility, availability checks, feature scoring, reasons, stable ranking and policy version. |
| \`backend/services/application_service.py\` | \`check_user_availability_for_event()\`; this delegates to PostgreSQL and must stay authoritative. |
| \`backend/apps/accounts/models.py\` | Existing skill/profile, \`UserCharityInterests\`, \`VolunteerAvailabilityRules\`, and \`VolunteerAvailabilityExceptions\` mappings. |
| \`backend/apps/events/models.py\` | \`VPublicEvents\`, \`EventPosts\`, \`VEventPostCapacity\`, \`EventApplications\`. |
| \`backend/apps/coordination/models.py\` | Assignments and coordinator profile models. |
| \`backend/bff/volunteer/views.py\` | Authenticated recommendation endpoint and result shaping. |
| \`backend/bff/volunteer/serializers.py\` | API result schema. |
| \`backend/bff/volunteer/tests/test_recommendations.py\` | Current feature tests; extend for edge cases. |

Current ranking weights in \`recommendation-v1\`:
- Required skills match: 35 points.
- Charity-interest overlap: 25 points.
- Explicit event-window availability match: 25 points.
- Preferred-area fit: 10 points.
- Role/experience fit: 5 points.

Eligibility filters must run before ranking:
- User must be authenticated, active, and have active account status.
- Event must be published/active, not ended, and not beyond the application deadline.
- Event must have remaining capacity and an open post with positive remaining capacity.
- Exclude events where the volunteer has a pending/accepted application or active assignment.
- Exclude availability mismatches and schedule conflicts using the PostgreSQL functions.
- If the availability database check fails, omit the event; do not treat the error as a pass.

Review the score carefully for misleading reasons, repeated profile signals, substring matching edge cases, overnight event handling, date exceptions, empty skill lists, zero-score eligible roles, and stable tie ordering. Return concise reasons that accurately explain the score. Never return or send the volunteer's raw \`home_area\`, exact location, private contact information, or profile object to the LLM.

### Staffing insight (feature 2)

| Path | Purpose / review focus |
|---|---|
| \`backend/services/staffing_insight_service.py\` | Required/assigned/open counts, accepted-unassigned/pending counts, post breakdowns and urgency/readiness signals. |
| \`backend/apps/events/models.py\` | \`VEventSummary\`, \`VEventPostCapacity\`, Events and applications. |
| \`backend/apps/coordination/models.py\` | Assignments and assignment statuses. |
| \`backend/bff/coordinator/views.py\` | \`EventStaffingInsightView\`; manager boundary before service invocation. |
| \`backend/bff/coordinator/serializers.py\` | Staffing response schema. |
| \`backend/bff/coordinator/tests/test_staffing_insight.py\` | Manager, unrelated coordinator, volunteer, and admin test coverage. |

Validate each metric against the existing PostgreSQL views and records:
- Required headcount, assigned count, remaining slots, and coverage percentage.
- Accepted-but-unassigned applications.
- Pending and waitlisted application counts.
- Attendance/check-in and pending confirmation counts, where the schema/view exposes them.
- Per-post breakdown and the signal severity thresholds.

Do not double count assignments, count cancelled assignments as active, or describe closed/full posts as available. Treat the database view as authoritative and add read-only cross-check tests. No insight endpoint or UI action may change assignments.

### Admin web UI

| Path | Purpose / review focus |
|---|---|
| \`backend/admin_portal/templates/admin_portal/partials/assistant_chat_panel.html\` | Existing web assistant panel markup and interaction hooks. |
| \`backend/admin_portal/templates/admin_portal/base_admin.html\` | Panel placement, global layout, responsive behaviour and script dependencies. |
| \`backend/admin_portal/views.py\` | Admin partial/template endpoints and server-side access boundaries. |
| \`backend/admin_portal/urls.py\` | Route names and partial endpoints. |
| \`backend/admin_portal/templates/admin_portal/partials/event_staffing_panel.html\` | Staffing metrics and signals UI. |
| \`backend/admin_portal/templates/admin_portal/partials/event_detail_panel.html\` | Event detail refresh target. |

Check that the chat panel is loaded without forcing a full admin-page reload and that its loading, error, retry, clear-history, source and suggested-action states work. Keep the AI permission model aligned with backend tool permissions; a hidden UI control is not an authorization mechanism.

### Mobile app and query cache

| Path | Purpose / review focus |
|---|---|
| \`mobile/src/features/assistant/screens/AssistantScreen.tsx\` | Actual React Native assistant interface, messages, quick prompts, loading, error, clear, actions and keyboard behaviour. |
| \`mobile/src/features/assistant/__tests__/AssistantScreen.test.tsx\` | Assistant component test; extend for failed requests, duplicate sends, action routing and clear state. |
| \`mobile/src/data/contracts/assistantRepository.ts\` | Mobile chat contract. |
| \`mobile/src/data/endpoints/assistantApi.ts\` | API payload and endpoint. |
| \`mobile/src/data/http/HttpAssistantRepository.ts\` | Authenticated HTTP adapter; sends only prior history (not the current prompt twice). |
| \`mobile/src/data/mock/MockAssistantRepository.ts\` | Template/demo responses; do not mistake them for live AI. |
| \`mobile/src/data/cache/QueryCache.ts\` | Bounded cache, request dedupe, invalidation and stale in-flight protection. |
| \`mobile/src/data/cache/cacheKeys.ts\` | Key scope/identity and tag naming. |
| \`mobile/src/data/cache/cachePolicy.ts\` | TTL and public/account policy. |
| \`mobile/src/data/cache/__tests__/queryCache.test.ts\` | Cache tests. |
| \`mobile/src/app/UserContext.tsx\` | Logout, 401, identity changes, and account-scoped cache clearing. |
| \`mobile/src/app/RepositoryProvider.tsx\` | Mock/HTTP repository selection. |
| \`mobile/src/data/http/HttpEventRepository.ts\` | Event list/detail, applications, assignments, recommendation cache and mutation invalidation. |
| \`mobile/src/data/http/HttpCoordinatorRepository.ts\` | Coordinator event/detail, staffing insights and mutation invalidation. |
| \`mobile/src/features/events/screens/EventDiscoveryScreen.tsx\` | Discovery list, recommendation card and pull-to-refresh. |
| \`mobile/src/features/coordinator/screens/CoordinatorEventDetailScreen.tsx\` | Event detail, post editor and staffing insight panel. |
| \`mobile/src/navigation/MainDrawerNavigator.tsx\`, \`MainDrawerContent.tsx\`, \`navigationTypes.ts\`, \`routeNames.ts\` | Assistant route registration and visibility. |

Mobile checks must include both template/mock mode and HTTP mode. Verify theme consistency with the current app theme, small-screen layout, safe area, keyboard avoidance, accessibility labels, empty/error states, long assistant replies, source/action taps, and navigation for coordinator versus volunteer. Keep the current screen structure unless a real interaction problem is found.

---

## 6. Work order for Gemini CLI

### Phase A — verify repository and current runtime

1. Fetch remote refs and verify the live feature branch head.
2. Confirm clean/dirty working tree and inspect commits/diff against \`origin/main\`.
3. Inspect the current branch's source files above, including any user commits that appeared after this handoff.
4. Confirm the backend environment, PostgreSQL v0.12.0 database availability, mobile Node version, and installed packages. Do not run destructive seeding.
5. Confirm Ollama can be reached from the backend process/container if using local inference. Do not download or load the model repeatedly if it is already installed.

### Phase B — finish the mobile cache and partial-refresh behaviour

1. Confirm event discovery calls the cached repository method in every load path (initial, focus, pull-to-refresh, search/filter changes, event status changes).
2. Confirm a forced refresh bypasses a fresh cached response and does not reuse an earlier in-flight request.
3. Trace every mutation that affects a cached resource:
   - apply/withdraw/accept/reject invitation;
   - confirm/cancel assignment;
   - publish/activate/complete/cancel event;
   - create/update/close event post;
   - manual/automatic assignment;
   - attendance/geo review if the displayed dashboard/roster depends on it.
4. Invalidate only impacted keys/tags where event identity is available. Use a bounded prefix invalidation only where an action cannot identify the event from its existing contract.
5. Confirm coordinator detail and staffing insight refresh independently. Avoid re-fetching a whole event list or all coordinator events just to update one card.
6. Verify logout, 401, data-mode switch and authenticated account-id changes clear private cache entries and invalidate in-flight private requests. Public taxonomy may remain cached.
7. Add tests for cache race conditions and each mutation invalidation. Test both HTTP repository and screen behaviour.

### Phase C — finish the AI chat end-to-end

1. Exercise the Ollama provider and Gemini provider with real HTTP calls in a local development environment. The provider unit tests are not proof that either provider/model account is configured correctly.
2. Validate the actual model's tool-call output for every exposed tool. Test malformed names, unknown tools, missing/invalid args, multiple tool calls, no tool call, refusal, empty response, timeout, provider unavailable and token/output limits.
3. Confirm the current history limit is at most four prior messages plus the current message. Verify the user message is not duplicated and no chat history is persisted in PostgreSQL.
4. Verify the backend executes no more than three read tools per request. Every call must pass \`verify_tool_access\` and return an explicit allow-listed result.
5. Test that provider synthesis receives the authorized result and does not receive unrestricted Django models or ORM querysets.
6. Test sensitive input/output redaction. Include Myanmar phone formats, phone hashes, emergency contacts, exact coordinates, home-area values, verification media, OTP/session fields, and arbitrary nested keys.
7. Confirm provider, SQL, network and permission errors never get returned with raw exception text.
8. Confirm API throttling and \`AI_ENABLED=false\` behaviour.
9. Verify source cards and suggested actions route to the correct event/staffing screen on mobile and correct web panel/route on admin UI.
10. Check all mock/demo text. Label it clearly in template mode; do not present a fake recommendation or staffing result as live inference.

### Phase D — make recommendation V1 useful

1. Verify hard eligibility against PostgreSQL functions and actual test records.
2. Validate all five scoring features and weights, including empty/no preferences.
3. Ensure availability points require an explicit matching window, while hard eligibility still follows the SQL function.
4. Verify only posts with open status and positive remaining capacity are eligible.
5. Confirm a volunteer who has already applied or is assigned is excluded.
6. Confirm results have deterministic tie ordering, \`recommendation-v1\`, best matching post ID, and truthful reasons.
7. Add fixtures for: no skills; no interests; empty availability rules; weekly rule match/mismatch; available and unavailable date exceptions; date-validity boundaries; event deadline passed; event ended; no remaining spots; full/closed post; prior application; active/cancelled assignment; database availability function failure.
8. Add API/mobile tests for empty state, partial scores, score labels, reason display, refresh and stale recommendation invalidation.
9. Keep recommendations advisory only. Applying remains the normal user-driven application action; never create an application or assignment as a recommendation side effect.

### Phase E — make staffing insight V1 trustworthy

1. Cross-check required, assigned and remaining counts against \`v_event_post_capacity\` and \`v_event_summary\`.
2. Verify cancelled assignments do not inflate active assigned headcount; check the database view's actual status predicates.
3. Verify accepted-unassigned is based on accepted applications excluding applications already assigned.
4. Test pending, waitlisted, zero-required-headcount, closed posts, full posts, no capacity rows, completed/cancelled events, and past/near deadlines.
5. Confirm readiness thresholds and signal thresholds are versioned/documented in code and match the coordinator's operational needs.
6. Test volunteer/unauthorized coordinator masked 404 and correct manager access. Ordinary admins must stay public-only through the AI unless an explicit admin-tier policy is supplied. Super-admin access remains distinct.
7. Make the web and mobile insight panels explain the source counts and render empty/loading/error states.
8. Never use the insight as an auto-assignment trigger or mutate event/assignment data.

### Phase F — integration, regression and merge-readiness report

1. Run all backend and mobile test commands in Section 7.
2. Test with mock provider and at least one configured real provider.
3. Test on mobile HTTP mode against the current backend and PostgreSQL database.
4. Capture any remaining runtime, UX, model-quality or policy blockers.
5. Inspect \`git diff --check\`, \`git status\`, full diff against \`origin/main\`, and changed files. Confirm no schema/seed files changed.
6. Commit only to \`feature/ai-chat-cache-ml-insights\` with a clear message. Do not merge and do not open a PR.

---

## 7. Required test commands

Run from the repository root unless noted.

### Backend

\`\`\`bash
cd backend
python manage.py check
python manage.py test ai.tests bff.volunteer.tests.test_recommendations bff.coordinator.tests.test_staffing_insight apps.audit.tests.test_admin_card_refresh
ruff check .
\`\`\`

Also run the full backend suite if the focused suite passes:

\`\`\`bash
python manage.py test
\`\`\`

The tests use a custom SQL-file test runner. Use the project's expected PostgreSQL test environment and never point test settings at a production database.

### Mobile

\`\`\`bash
cd mobile
npm test -- --runInBand
npm run lint
npx tsc --noEmit
\`\`\`

Run the real HTTP integration suite where the required local API/database environment is configured:

\`\`\`bash
npm run test:real-http -- --runInBand
\`\`\`

### Manual acceptance

- [ ] Mobile assistant opens in mock and HTTP modes.
- [ ] Mobile assistant can request event search, recommendation, own application/assignment summary, and allowed system help.
- [ ] Coordinator can request staffing insight only for an event they manage.
- [ ] Ordinary admin cannot use the assistant to request system-wide/private staffing information until tier policy is explicitly approved.
- [ ] Super-admin can request system-wide staffing insight.
- [ ] No LLM can perform a write action or direct SQL.
- [ ] No sensitive fields/values enter model context, logs, or shared cache.
- [ ] Chat history remains bounded, is not duplicated, and is not persisted.
- [ ] Local Ollama provider returns a real answer and can call at least the recommendation and staffing tools.
- [ ] Recommendation output is explainable and respects hard eligibility.
- [ ] Staffing numbers match the database views.
- [ ] Event/post/application/assignment mutations update only affected UI panels/cards.
- [ ] Logout/account switch/401 never display prior-account private data.
- [ ] No database schema objects, migrations, or destructive seeds changed.

---

## 8. Unresolved policy and technical questions

Do not silently decide these:

1. **Admin tiers:** the current source has \`is_admin\` and \`is_superuser\`, but no confirmed configurable admin-tier field. T0–T4 privacy classifications exist but are not a mapping to admin access levels. Ordinary admin AI tools are therefore public-only in this foundation. Ask the owner if broader admin access is required.
2. **Recommendation calibration:** weights are provisional and deterministic. Do not infer that the score is a probability or a guarantee of volunteer suitability. Report the evidence and missing-profile-data limitations.
3. **Availability semantics:** PostgreSQL's availability functions decide hard eligibility. If Python ranking-feature interpretation differs from SQL at timezone, overnight, exception or validity boundaries, PostgreSQL wins; adjust ranking reasons/points to match and add regression tests.
4. **Provider choice:** Ollama is the local prototype default when explicitly configured. Gemini is optional. Record model version, provider, timeout, tool success rate, latency, failure rate, and estimated resource use in the development report; do not store personal prompts for analytics.
5. **Current status:** the foundation changes were committed through GitHub, but no local backend/mobile test execution or physical-device validation was performed in the handoff-authoring environment. Gemini CLI must run them before calling the branch complete.

---

## 9. Expected completion report

When work is finished, return:

- branch name, final HEAD SHA, and parent/base SHA;
- commits created on this feature branch;
- changed files grouped into backend, admin UI, mobile, tests;
- exact backend/mobile commands and pass/fail output;
- Ollama/Gemini provider tested, model identifier, machine/container assumptions, response latency and any limitations;
- recommendation and staffing insight test evidence;
- cache invalidation/account-isolation test evidence;
- privacy and permission review findings;
- schema/seed diff confirmation;
- unresolved decisions and concrete blockers.

Do not claim production readiness. The target is a believable, demonstrable, safe prototype that can be reviewed before the owner decides whether to merge.


## 10. Runtime audit refinements added after the first foundation commit

The follow-up runtime audit tightened a few details before Gemini CLI continues:

- The Ollama tool exchange follows the official assistant tool-call shape (type=function, indexed function name/arguments) and appends matching role=tool messages.
- The Gemini adapter preserves the exact model content turn returned with function calls (including opaque provider metadata and call IDs) and sends function responses in the following user turn. It also uses the x-goog-api-key header instead of putting the API key in the request URL.
- If a provider returns more than three parallel tool calls, the service rejects the oversized batch and asks the user to narrow the question. It must not partially answer a provider turn when the provider expects a result for every call in that turn.
- The mobile cache uses in-flight entry identity plus a cache-wide epoch to prevent stale repopulation. Per-key generation counters were removed because they could grow without bound on long-lived clients.
- The history limit is a fixed maximum of four prior messages; it is not a tunable setting in this prototype.

Gemini CLI must still execute the focused and full suites, then validate both providers against real local/configured provider instances. These source-level changes are not evidence of a passing runtime integration.
