# Volunteer Coordination System — BFF ↔ Mobile Connection Re-Audit

**Audit:** v0.11.1  
**Date:** 17 November 2026  
**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch:** `main`  
**Audited HEAD:** `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a`  
**Previous audit HEAD:** `65ed6d34f8c7a365a63dd616973bffeb61d165b0`

**Scope:** Django BFF routes, views, serializers, services and OpenAPI; React Native endpoint clients, DTOs, mappers, domain models, repository contracts, HTTP/mock implementations, use cases, session and location transport. UI layout and visual design are excluded.

---

## 1. Executive finding

The latest `main` is a substantial improvement. The work is no longer just BFF views: most volunteer and coordinator capabilities now have corresponding mobile endpoint methods, wire DTOs, repository operations, HTTP/mock implementations and feature-facing use cases.

The comparison from the previous audit to this HEAD contains **114 changed files**: 19 backend, 58 mobile, 15 documentation/reference and 22 other/root files. It is two commits ahead and zero behind.

The new capability evidence ledger contains **82 role capabilities** (43 volunteer and 39 coordinator). Source inspection confirms use-case methods for the major volunteer and coordinator capability families and much more complete repository interfaces than in the previous review.

However, the repository's v0.11.0 sign-off says all 82 capabilities are runtime-verified and all contracts are frozen. This re-audit does not support accepting that statement without qualification:

- BFF and mobile source coverage is now broad.
- Several capabilities are wired with incorrect or incomplete semantics.
- Some repository/use-case contracts still expose transport DTOs instead of domain models.
- Secure token storage and native geolocation packages are not declared in the mobile dependencies.
- The mobile capability test suite uses a mocked API client, not a live Django BFF.
- HTTP mode is not the default app mode.

**Overall source-level connection organization: approximately 88%.** This is a qualitative estimate based on the inspected layers, not a test pass percentage. Live end-to-end confidence is lower and has not yet been established.

## 1.1 Connection maturity scorecard

| Layer | Review estimate | Finding |
|---|---:|---|
| Database/service/BFF exposure | 95% | Invite, history, feedback, payload-completeness and geo-review work fills most previous backend gaps |
| Mobile endpoint wrappers | 93% | All five endpoint modules now cover most BFF operations; semantic mismatches and duplicate aliases remain |
| DTO and mapper correctness | 80% | Major improvements, but raw DTO leaks and fabricated/default values remain |
| Repository and HTTP/mock coverage | 95% | Core contracts have corresponding HTTP and mock implementations; behavior parity is not fully proven |
| Feature use-case coverage | 92% | Most role workflows are represented, but invite behavior and fabricated fallbacks require correction |
| Live mobile-to-BFF verification | Not established | Current mobile parity tests stub the API client; no current GitHub status/Actions evidence was returned |

## 2. Git baseline

| Item | Value |
|---|---|
| Current HEAD | `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a` |
| Previous audited HEAD | `65ed6d34f8c7a365a63dd616973bffeb61d165b0` |
| Compare status | Ahead by 2 commits; 0 behind |
| Changed files | 114 |
| Insertions / deletions | 50,470 / 416 |
| Backend / mobile / documentation paths | 19 / 58 / 15 |

The repository contains backend parity tests, updated BFF routes/views/serializers/services and OpenAPI, mobile endpoint and DTO additions, HTTP/mock repository updates, use-case layers, location/session provider work and a new capability evidence ledger.

GitHub returned no combined status entries for the current HEAD. The workflow-run query returned no runs, and there is no `.github/workflows/` directory in the inspected tree. The repository's own v0.11.0 report claims 714/714 Django tests, 40/40 backend parity tests, 32/32 Jest suites (511 tests), and zero TypeScript errors. Those are repository-authored reports, not independently confirmed CI results for this audited HEAD. This review did not execute Django, PostgreSQL, Jest, TypeScript or a physical device.

Links: [Current HEAD](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/commit/7ae7fa17c77edc055d3919ac24cdef61b7b80c3a) · [Compare against previous audit](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/compare/65ed6d34f8c7a365a63dd616973bffeb61d165b0...7ae7fa17c77edc055d3919ac24cdef61b7b80c3a)

## 3. Current architecture

```text
Feature / screen
      |
      v
VolunteerUseCases / CoordinatorUseCases
      |
      v
Repository contract
      |
  +---+---+
  |       |
  v       v
HTTP    Mock repository
  |
  v
Endpoint modules: authApi / profileApi / eventApi /
                  coordinatorApi / checkinApi
  |
  v
DTOs and mappers
  |
  v
ApiClient (Token auth, query params, JSON, multipart,
timeout, error normalization, 401 session invalidation)
  |
  v
Django BFF /api/v1/
  |
  v
Django services / serializers / permissions
  |
  v
PostgreSQL views / functions / triggers
```

The main mobile layers are present:

- `mobile/src/core/api/` and `core/auth/` — transport and session.
- `mobile/src/core/location/` — location provider abstraction.
- `mobile/src/data/endpoints/` — five endpoint modules.
- `mobile/src/data/dto/` and `data/mappers/` — wire types and transformations.
- `mobile/src/data/contracts/` — profile, event, coordinator and dashboard repository contracts.
- `mobile/src/data/http/` and `data/mock/` — paired implementations.
- `mobile/src/domain/models/` and `domain/usecases/` — app domain and feature actions.
- `RepositoryProvider` — selects HTTP or mock adapters based on data mode.

This architecture is good enough to continue. A full rewrite is not justified.

## 4. BFF capability exposure

### 4.1 Coordinator

The current coordinator URL module exposes:

| Capability | Current route group | State |
|---|---|---|
| Managed events and event summary | `coordinator/events/`, `coordinator/events/{id}/summary/` | Present |
| Create/update event | `coordinator/events/`, `coordinator/events/{id}/` | Present |
| Publish/activate/complete/cancel | Root event lifecycle paths | Present |
| Handover/retake | Root event lifecycle paths | Present |
| Handover history | `coordinator/events/{id}/history/` | Newly exposed |
| Post list/create/update/close | `coordinator/events/{id}/posts/`, `posts/{id}/`, `posts/{id}/close/` | Present |
| Applications and decisions | `coordinator/events/{id}/applications/`, accept/reject/waitlist | Present |
| Invite volunteer | `coordinator/events/{id}/invite/` | Newly exposed |
| Auto/manual assignment | Coordinator event assignment routes | Present |
| Assignments/unassigned applicants | Coordinator event routes | Present |
| Post capacity | `coordinator/events/{id}/post-capacity/` | Present |
| Coordinator feedback summary | `coordinator/feedback/` | Newly exposed |

The invite view accepts either `volunteer_user_id` or `volunteer_uuid`, validates through `CoordinatorInviteSerializer`, calls `application_service.invite_volunteer_to_event()` and returns a created application response. The history view calls manager-scoped audit service logic. The application service now includes the complete permitted T2 fields for accepted applicants. The assignment service now returns distinct `application_id`, event metadata and `assigned_at`.

### 4.2 Volunteer

The volunteer BFF now covers public taxonomy/events/posts; self profile/interests; weekly availability and date exceptions; event/window availability checks; verification upload/status; coordinator application read/submit/update; UUID lookup; event applications and withdrawal; own assignments and confirm/cancel; and volunteer feedback summary/list.

### 4.3 Check-in and feedback

The check-in BFF covers onboarding read/acknowledge; QR resolve/redeem/check-in; coordinator QR create/revoke; geo and manual check-in; checkout; sanitized attendance history; coordinator attendance board/pending confirmations; geo-attempt review; attendance confirm/reject; event feedback submit/list; and own feedback.

### 4.4 Routing observation

The root Django URL config mounts the same BFF under `/api/v1/`, `/api/bff/mobile/` and `/api/`. The BFF URL file also includes volunteer, coordinator and check-in URL modules at root, in addition to semantic prefixes. Consequently, some mobile methods use explicit paths such as `checkin/...`, while some coordinator methods use root aliases such as `attendance/...` or `coordinator/attendance/...`.

This works with the current URL table, but it is not a clean long-term convention. Keep `/api/v1/` as the only mobile base, prefer explicit semantic namespaces for new calls, and retain root paths only as compatibility aliases. Add route-resolution tests where multiple modules declare similar `events/{id}/...` paths.

The BFF also registers `/coordinator/feedback/`, but mobile does not call that dedicated endpoint; it gets the user's feedback summary through the shared `checkin/me/feedback/` operation. That may be intentional, but the ledger should not claim a dedicated mobile connection where none exists.

## 5. Mobile endpoint and repository coverage

### 5.1 Endpoint modules

| Module | Connected operation families |
|---|---|
| `authApi` | OTP request, OTP verification, logout |
| `profileApi` | Profile, interests, availability, exceptions, availability checks, verification upload/status, coordinator application, UUID lookup, attendance history, own feedback |
| `eventApi` | Taxonomy, event list/pagination, detail, posts, application, own applications, withdraw, own assignments, confirm/cancel |
| `coordinatorApi` | Managed events, summary, event lifecycle, post CRUD, history, invite, review/decisions, assignments, capacity, roster, pending confirmations, manual check-in |
| `checkinApi` | Onboarding, QR, geo, manual check-in, checkout, feedback, geo review, event feedback list |

### 5.2 Repository interfaces

**ProfileRepository** exposes profile/update, availability and exceptions, event/window checks, verification upload/status, coordinator application notes/status/eligibility, UUID lookup, attendance history and feedback.

**EventRepository** exposes event discovery and pagination, detail/taxonomy, apply/list/withdraw, assignments/confirm/cancel, onboarding, QR resolve/redeem/check-in, geo check-in, checkout and feedback.

**CoordinatorRepository** exposes managed events, detail/create/update/lifecycle, post CRUD, history, invite, applicant decisions, auto/manual assignment, assignment cancellation, unassigned list, post capacity, UUID lookup, QR create/revoke, attendance roster/pending, geo review/confirm/reject, manual check-in and coordinator feedback submission.

HTTP and mock implementations have matching method families. This is strong source-level organization. It does not automatically prove equal semantics; mock and HTTP operations must be tested against the same scenario contract.

### 5.3 DTO-to-domain boundary still incomplete

The coordinator contract currently returns DTO types directly for:

- `CoordinatorHistoryItemDto`
- `EventPostCapacityDto`
- `UserUuidLookupDto`
- `GeoAttemptReviewDto`

The corresponding use cases expose those transport shapes as well. `EventRepository.getCharityFields()` also returns the API-style `sort_order` field rather than a domain `CharityCategory` with `sortOrder`, and there is no `mapCharityField()` function in the current event mapper.

The preferred structure remains:

```text
BFF response DTO -> mapper -> domain model -> repository contract -> use case
```

These operations work at source level, but the data layer is not fully insulated from BFF schema changes until the DTO leaks are removed.

## 6. Confirmed defects and remaining gaps

### P0 — Correctness / operational blockers

#### P0-01: Invite acceptance is not an invite-specific volunteer flow

`VolunteerUseCases.joinThroughInvite()` calls `applyToPost()`. The HTTP event repository's normal apply operation sends `source: 'browse'`. It does not consume or acknowledge the existing application row created by the coordinator invite endpoint. This can create a second browse application instead of responding to the invitation.

**Fix:** define the invite lifecycle explicitly. The volunteer action must reference the existing invite `application_id` and transition that record according to the database/business rules. Add a cross-account test that verifies the same row is updated and no duplicate application is inserted.

#### P0-02: Geo check-in drops capture metadata

`LocationProvider.LocationFix` carries latitude, longitude, accuracy, capture timestamp and mocked-location indication. But `VolunteerUseCases.submitGeoCheckIn()` and `EventRepository.submitGeoCheckIn()` pass only latitude, longitude and accuracy. `HttpEventRepository` omits `captured_at` and `is_mocked`, even though the BFF serializer accepts these fields.

**Fix:** pass a `LocationFix` through the repository contract and serialize all five fields. Add request-shape tests proving the values reach the BFF.

#### P0-03: Secure token persistence is not an installed dependency

`PluggableTokenStore` dynamically attempts `react-native-keychain`, `expo-secure-store` and AsyncStorage, then falls back to `MemoryTokenStore`. None of these packages is declared in `mobile/package.json` or present in the checked `package-lock.json` dependency scan. A memory store does not survive process termination.

**Fix:** add and configure an actual secure native storage dependency for Android and iOS. Production should not silently downgrade to memory. Test cold start, logout and revoked-token behavior on devices.

#### P0-04: Native geolocation dependency is not declared

`NativeDeviceLocationProvider` dynamically requires `@react-native-community/geolocation`, then falls back to `navigator.geolocation` or injection. The package is not declared in the mobile dependencies. Android fine/coarse permissions are now present, but permissions alone do not install a native geolocation runtime. iOS configuration was not confirmed from the attempted plist path.

**Fix:** install/configure a supported native geolocation package and verify Android/iOS runtime permissions and physical GPS acquisition. Keep the HTTP-mode no-hardcoded-coordinate rule.

### P1 — Contract and data-integrity issues

#### P1-01: Phone remains aliased into email

`VolunteerProfile` now has `phone`, but `mapUserProfile()` still sets `email` from `userDto.phone`. The previous identity defect is only partly corrected.

**Fix:** remove the compatibility alias when rebuilding the profile presentation layer. Never represent a phone number as an email address.

#### P1-02: Donation merge helper is not supplied the current profile

`mapProfileUpdateRequest()` accepts `currentProfile` and can merge donation sub-flags. `HttpProfileRepository.updateProfile()` calls it with only `updates`, so the mapper cannot access the current sub-flag values.

**Fix:** pass an authoritative current profile into the mapper, or use a partial PATCH contract backed by server-side aggregate consistency. Add all master/sub-flag transition tests.

#### P1-03: Manual assignment can synthesize a fake full assignment

After the manual assignment POST, the HTTP repository refetches assignments. If the created row cannot be found, it constructs a fallback domain assignment with empty user ID, placeholder volunteer/post labels and a local current timestamp. This can conceal stale state or a failed fetch.

**Fix:** return a minimal mutation-result domain type containing actual IDs, or return an explicit sync error if the full assignment cannot be refetched. Do not fabricate a full assignment. Also do not choose the first managed event if the application-to-event mapping is missing; resolve the event deterministically.

#### P1-04: Coordinator feedback use case can return invented metrics

`CoordinatorUseCases.getCoordinatorFeedbackSummary()` uses `ProfileRepository.getOwnFeedback()` when injected, but returns hardcoded `4.9` and `10` if the repository is absent.

**Fix:** report unavailable/error instead of fabricated metrics.

#### P1-05: DTOs leak from repositories/use cases

History, post capacity, UUID lookup and geo-attempt review return transport DTOs. Add domain types and explicit mappers for these operations. Also map charity taxonomy into a domain category type.

#### P1-06: Invite round trip is incomplete

Coordinator invite creation is now exposed. The volunteer use case does not consume the same invite application record. Fix P0-01 and add a coordinator-to-volunteer round-trip test.

#### P1-07: Mobile parity tests do not call the actual BFF

`v0_11_0_capabilityParityE2E.test.ts` builds a Jest `mockApiClient` for GET/POST/PATCH/DELETE and injects it into the HTTP repositories. It validates repository behavior against simulated responses, not actual URL resolution, DRF serializers, token authentication or multipart behavior.

**Fix:** add an integration run where Django + PostgreSQL are started and the real mobile `ApiClient`/HTTP repositories call the BFF over HTTP.

### P2 — Consistency / maintainability

- `dataMode.ts` defaults and resets to `mock`; real HTTP connectivity requires an explicit mode switch. Make build/environment mode selection explicit, and use HTTP for integration/production builds.
- Feedback read APIs exist in multiple route namespaces. Pick one canonical mobile read contract and document compatibility aliases.
- Manual check-in's repository contract accepts `attendanceId`, while the backend requires event ID and volunteer user ID. The implementation relies on a previously populated attendance-roster cache. Expose an explicit event/user operation instead of the hidden cache precondition.
- The capability evidence ledger does not fully match source. Examples include OTP route names, charity-interest method names, availability check paths, UUID path, and page-number versus cursor pagination.
- The ledger says phone/email alias was eliminated, but source still contains the alias. It says native GPS and secure persistence are complete, but the required packages are absent from `package.json`.

## 7. How much is connected?

| Connection stage | Current assessment |
|---|---|
| Database/service -> BFF views | Broadly present for the role capabilities reviewed |
| BFF view -> registered URL | Broadly present; root aliases and duplicated namespaces need canonicalization |
| BFF route -> mobile endpoint wrapper | Mostly present across five endpoint modules |
| Request/response -> DTO | Mostly present; some contract paths need correction and verification |
| DTO -> mapper -> domain model | Partially complete; several new coordinator operations still leak DTOs |
| Domain -> repository contract | Strong, with some return types still transport-oriented |
| HTTP and mock adapter methods | Broad method parity; semantic parity needs scenario testing |
| Repository -> use case | Broadly present; invite and feedback fallbacks are incorrect |
| Real mobile HTTP -> live BFF -> PostgreSQL | Not proven by the available mobile tests or GitHub status evidence |

The 82 capability IDs are now represented in the source inventory and the role use-case layer. That is a major step. It is not accurate yet to say all 82 are fully runtime-verified end to end.

## 8. Verification assessment

The repository contains:

- Backend phase-1 route tests and phase-2 payload-completeness tests.
- `backend/tests/test_v0_11_0_capability_parity.py` with 40 test methods: 20 volunteer and 20 coordinator scenarios.
- Mobile endpoint/DTO tests, repository bridge tests, mapper tests, location/session provider tests and capability use-case tests.
- `mobile/src/data/__tests__/v0_11_0_capabilityParityE2E.test.ts` with 43 tests described in the repository report.

Backend Django APIClient tests can provide backend/PostgreSQL evidence if reproduced against the current HEAD. Mobile mocked-ApiClient tests provide client-layer evidence only. The missing proof is one real HTTP integration run connecting the current mobile transport to the real BFF and database.

## 9. Recommended remediation order

### Batch A — Correct business semantics and data loss

1. Fix volunteer invite acceptance to use the existing invite application ID.
2. Carry `captured_at` and `is_mocked` from location provider to BFF.
3. Remove manual assignment fabricated fallback data and arbitrary event selection.
4. Remove hardcoded coordinator feedback summary metrics.
5. Fix donation patch merge so current state is available or server owns the aggregate rule.

### Batch B — Complete the domain boundary

6. Add domain models/mappers for coordinator history, post capacity, UUID lookup and geo review.
7. Map charity taxonomy into a domain type.
8. Remove false/default values where missing data should remain unknown/null.

### Batch C — Install native providers

9. Add a native geolocation dependency and verify Android/iOS.
10. Add secure Keychain/Keystore storage as a declared dependency.
11. Remove silent production fallback to in-memory token storage.

### Batch D — Canonical API and real integration

12. Canonicalize mobile route paths and retain aliases only for backward compatibility.
13. Regenerate OpenAPI and compare every mobile wrapper with its current BFF operation.
14. Regenerate the capability evidence ledger from current source.
15. Add a CI/integration harness that runs mobile HTTP repositories against Django + PostgreSQL.
16. Record exact commit SHA, environment, commands and results.

### Batch E — UI defragmentation

17. Freeze the corrected domain/repository/use-case contracts.
18. Rebuild screens against use cases only.
19. Remove any feature-level direct endpoint calls or duplicated screen state.

## 10. Definition of done for connection parity

- [ ] Every in-scope BFF route has a documented canonical path and HTTP method.
- [ ] Every mobile-required BFF route has a typed endpoint method.
- [ ] DTO request/response fields and nullability match real serializers.
- [ ] Feature-facing repository/use-case contracts return domain types, not raw transport DTOs, except explicitly documented cases.
- [ ] HTTP and mock implementations satisfy the same semantic behavior.
- [ ] Volunteer invite acceptance updates the existing invitation record.
- [ ] Geo timestamp and mocked-location metadata reach the BFF.
- [ ] Assignment mutations never fabricate full resources from minimal responses.
- [ ] Phone is not aliased to email.
- [ ] Donation master/sub-flags are updated coherently.
- [ ] No production use case returns invented identity/feedback/assignment data.
- [ ] Secure persistent token storage is installed and device-tested.
- [ ] Native location acquisition is installed and Android/iOS tested.
- [ ] A real mobile HTTP repository has been run against the actual Django BFF and PostgreSQL.
- [ ] The evidence ledger matches current routes, DTOs, methods and test evidence.

## 11. Source references

All links refer to the audited `main` tree at HEAD `7ae7fa17c77edc055d3919ac24cdef61b7b80c3a` (subject to later branch changes).

### Git and evidence
- [Current HEAD](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/commit/7ae7fa17c77edc055d3919ac24cdef61b7b80c3a)
- [Compare against previous audit](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/compare/65ed6d34f8c7a365a63dd616973bffeb61d165b0...7ae7fa17c77edc055d3919ac24cdef61b7b80c3a)
- [Capability evidence ledger](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/docs/baseline/v0_11_0_capability_evidence_ledger.md)
- [Final milestone summary](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/reference/prompt_log/v0_11_0_final_completion_summary.md)
- [Phase 8 report](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/reference/log/phase_8_report.md)
- [Phase 9 report](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/reference/log/phase_9_report.md)

### BFF
- [BFF URL router](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/urls.py)
- [Coordinator URLs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/coordinator/urls.py)
- [Volunteer URLs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/volunteer/urls.py)
- [Check-in URLs](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/checkin/urls.py)
- [Coordinator views](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/coordinator/views.py)
- [Volunteer views](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/volunteer/views.py)
- [Check-in views](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/checkin/views.py)
- [Coordinator serializers](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/coordinator/serializers.py)
- [Volunteer serializers](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/bff/volunteer/serializers.py)
- [OpenAPI schema](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/schema.yml)
- [Application service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/application_service.py)
- [Assignment service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/assignment_service.py)
- [Attendance service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/attendance_service.py)
- [Feedback service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/feedback_service.py)
- [Auth service](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/services/auth_service.py)

### Mobile
- [Repository provider](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/app/RepositoryProvider.tsx)
- [Data mode](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/app/configuration/dataMode.ts)
- [API client](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/core/api/apiClient.ts)
- [API config](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/core/api/apiConfig.ts)
- [Token store](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/core/auth/tokenStore.ts)
- [Location provider](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/core/location/locationProvider.ts)
- [Profile repository contract](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/contracts/profileRepository.ts)
- [Event repository contract](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/contracts/eventRepository.ts)
- [Coordinator repository contract](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/contracts/coordinatorRepository.ts)
- [Profile API](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/profileApi.ts)
- [Event API](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/eventApi.ts)
- [Coordinator API](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/coordinatorApi.ts)
- [Check-in API](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/endpoints/checkinApi.ts)
- [Profile HTTP repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/http/HttpProfileRepository.ts)
- [Event HTTP repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/http/HttpEventRepository.ts)
- [Coordinator HTTP repository](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/http/HttpCoordinatorRepository.ts)
- [Profile mapper](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/mappers/profileMapper.ts)
- [Event mapper](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/mappers/eventMapper.ts)
- [Coordinator mapper](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/mappers/coordinatorMapper.ts)
- [Volunteer use cases](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/domain/usecases/volunteerUseCases.ts)
- [Coordinator use cases](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/domain/usecases/coordinatorUseCases.ts)
- [Mobile capability test](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/src/data/__tests__/v0_11_0_capabilityParityE2E.test.ts)
- [Backend capability test](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/backend/tests/test_v0_11_0_capability_parity.py)
- [Mobile package manifest](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/package.json)
- [Android manifest](https://github.com/ThuraAung-Rayaar/Volunteer_Coordination_System/blob/main/mobile/android/app/src/main/AndroidManifest.xml)

---

## Final recommendation

**Do not restart the BFF or the mobile data architecture.** The structure is now broadly complete. The next milestone should be a focused connection-hardening pass: correct invite and geo semantics, remove fabricated fallbacks, close the DTO/domain boundary, install secure/native dependencies, synchronize the evidence ledger, and prove the mobile HTTP layer against the actual BFF and PostgreSQL.

The source-level connection is approximately **88% organized**. The outstanding work is concentrated in correctness, native dependency installation, domain-contract cleanup and live integration proof—not in rebuilding the entire connection layer.
