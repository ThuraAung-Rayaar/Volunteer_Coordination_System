# Phase 4 Report: Authentication & Session Integration

**Project:** React Native Workshift Mobile Application (v0.10.0 Backend & Django BFF Integration)  
**Execution Date:** 2026-11-15  
**Phase:** Phase 4 (Authentication & Session Integration)  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

Phase 4 established the complete **Authentication & Session Lifecycle Integration** between the React Native Workshift mobile app and the Django BFF auth endpoints (`/api/v1/auth/otp/request/`, `/api/v1/auth/otp/verify/`, `/api/v1/auth/logout/`, `/api/v1/me/`, and `/api/v1/me/coordinator/`).

In `'mock'` mode (`dataMode === 'mock'`), the application continues to boot immediately into the authenticated demo volunteer with the QA Demo Profile Switcher fully accessible, ensuring that 100% of preexisting unit tests, component tests, and preview flows function without disruption.

In `'http'` mode (`dataMode === 'http'`), the application performs an automated session bootstrap:
- Checks `sessionManager` / `defaultTokenStore`.
- If an auth token exists, loads live user profile snapshot (`GET /api/v1/me/`) and coordinator status (`GET /api/v1/me/coordinator/`), authenticating into the app.
- If no token exists (or if an HTTP 401 Unauthorized response is received), presents a purpose-built `OtpLoginScreen` constructed exclusively from existing `src/shared/` design system components.
- The QA Demo Profile Switcher is cleanly hidden from `MainDrawerContent`.
- Settings screen displays live backend status and provides an authenticated "Sign Out" action calling `logout()` which revokes the session on the backend and wipes the token store.

---

## 2. File Inventory

### Files Created:
1. `mobile/src/features/auth/screens/OtpLoginScreen.tsx` — Complete 2-step OTP login flow (Phone + Display Name -> 6-digit Code).
2. `mobile/src/features/auth/index.ts` — Barrel export for auth screens and components.
3. `mobile/src/features/auth/__tests__/authSession.test.tsx` — 17 unit and integration test cases covering UI flows, session bootstrap, 401 invalidation, 403/404/500/offline resiliency, drawer invariants, and root navigation.

### Files Modified:
1. `mobile/src/app/configuration/dataMode.ts` — Added `addDataModeListener(listener)` and reactive dispatch inside `setDataMode()` and `resetDataMode()`.
2. `mobile/src/app/UserContext.tsx` — Added full session state (`isAuthenticated`, `isBootstrapping`), actions (`requestOtp`, `verifyOtp`, `logout`, `refreshSessionUser`), 401 listener via `sessionManager.onUnauthorized`, and robust context fallback in `useCurrentUser()` to ensure compatibility with isolated screen unit tests.
3. `mobile/src/app/AppRoot.tsx` — Updated `AppNavigationRoot` to handle session states in HTTP mode: renders `LoadingState` during session bootstrap, `OtpLoginScreen` when unauthenticated, and `NavigationContainer` when authenticated or in mock mode. Exported `AppNavigationRoot` for testability.
4. `mobile/src/features/settings/screens/SettingsScreen.tsx` — Updated "Mode:" caption to reflect active mode (`live Backend` vs `Mock/Offline`) and connected "Sign Out" button to `logout()` from `useCurrentUser()`.
5. `mobile/src/navigation/MainDrawerContent.tsx` — Gated QA Demo Profile Switcher strictly on `isMockMode()`.

---

## 3. Implementation Details

### 3.1. Reactive Data Mode Listener (`dataMode.ts`)
To allow `UserContext` and UI components to respond synchronously to mode switching in tests and future runtime toggles:
```ts
const dataModeListeners = new Set<(mode: DataMode) => void>();

export function addDataModeListener(listener: (mode: DataMode) => void): () => void {
  dataModeListeners.add(listener);
  return () => {
    dataModeListeners.delete(listener);
  };
}

export function setDataMode(mode: DataMode): void {
  currentDataMode = mode;
  dataModeListeners.forEach(listener => {
    try {
      listener(mode);
    } catch {
      // Ignored
    }
  });
}
```

### 3.2. Session Lifecycle & User Context (`UserContext.tsx`)
1. **State Invariants:**
   - `isAuthenticated`: Defaults to `true` in `'mock'` mode; defaults to `false` in `'http'` mode unless `initialAuthenticated` is explicitly provided.
   - `isBootstrapping`: `false` in `'mock'` mode; `true` on cold start in `'http'` mode while querying stored token and calling `/api/v1/me/`.
2. **Cold Start Bootstrap:**
   - Reads token from `sessionManager.getToken()`.
   - If missing, sets `isAuthenticated = false`, `isBootstrapping = false`.
   - If present, invokes `refreshSessionUser()` to fetch `GET /api/v1/me/` and `GET /api/v1/me/coordinator/`.
   - Converts Django profile payload to domain `UserProfileSnapshot` and sets `isAuthenticated = true`.
3. **HTTP 401 Invalidation:**
   - Subscribes to `sessionManager.onUnauthorized`:
     ```ts
     useEffect(() => {
       const unsubscribe = sessionManager.onUnauthorized(() => {
         if (getDataMode() === 'http') {
           setIsAuthenticated(false);
         }
       });
       return unsubscribe;
     }, []);
     ```
   - STRICT INVARIANT: Never invalidates token on HTTP 403, 404, 409, 500, or network offline errors.
4. **OTP Actions:**
   - `requestOtp(phone, purpose)` -> calls `authApi.requestOtp({ phone, purpose })`. Returns `{ success: true, devCode }` or `{ success: false, error }`.
   - `verifyOtp(phone, code, displayName)` -> calls `authApi.verifyOtp(...)`, stores token in `sessionManager`, calls `refreshSessionUser()`, sets `isAuthenticated = true`.
   - `logout()` -> calls `authApi.logout()`, clears token from `defaultTokenStore`, resets `currentUser` to volunteer default, sets `isAuthenticated = false`.
5. **Fallback Context for Isolated Screen Tests:**
   - `useCurrentUser()` returns a default `fallbackUserContext` when called outside `<UserProvider>`, ensuring screens rendered in legacy tests (e.g. `settings.test.tsx`) never throw errors.

### 3.3. OTP Login Screen (`OtpLoginScreen.tsx`)
Constructed strictly using `src/shared/` components (`ScreenContainer`, `AppHeader`, `AppCard`, `AppInput`, `AppButton`, `AppText`, `StatusBadge`):
- **Step 1: Phone & Display Name Input**
  - Mobile phone input formatted with Myanmar dial code prefix (`+959`).
  - Optional Display Name for first-time volunteer registration.
  - Client-side validation ensuring phone number is present beyond `+959`.
  - On submit, calls `requestOtp`.
  - Captures optional `dev_code` returned by backend development server and pre-fills OTP code for seamless testing.
- **Step 2: OTP Verification**
  - 6-digit numeric input with SMS helper text.
  - DEV TEST OTP status badge prominently displaying development bypass code when available.
  - "Verify & Continue" primary action button.
  - "Change Phone Number" button and header back button allowing the user to return to Step 1 without reload.
  - Clean error banner displaying friendly normalized error descriptions.

### 3.4. Root Navigation Flow (`AppRoot.tsx`)
- In `'mock'` mode: boots immediately into `<MainDrawerNavigator />` with all mock screens and QA switcher active.
- In `'http'` mode:
  - If `isBootstrapping`: renders centered `<LoadingState label="Connecting and restoring session..." />`.
  - If unauthenticated: renders `<OtpLoginScreen />`.
  - If authenticated: renders `<MainDrawerNavigator />`.

### 3.5. Drawer & Settings Updates
- **`MainDrawerContent.tsx`:** QA Demo Profile Switcher is conditionally rendered only when `isMockMode()` is true.
- **`SettingsScreen.tsx`:** Updated mode caption to `http (Live Backend)` or `mock (Offline Demo)`. Connected "Sign Out" button to `logout()` from `useCurrentUser()`.

---

## 4. Verification & Testing

### 4.1. TypeScript Compilation
Executed `cd mobile; npx tsc --noEmit`:
```
Exit code: 0
Errors: 0
```
All types, DTO contracts, contexts, and test files pass TypeScript compilation with zero errors under strict mode.

### 4.2. Jest Test Suite Execution
Executed `cd mobile; npm test -- --watchAll=false`:
```
PASS src/data/mappers/__tests__/profileMapper.test.ts
PASS src/data/mappers/__tests__/coordinatorMapper.test.ts
PASS src/data/mappers/__tests__/eventMapper.test.ts
PASS __tests__/apiClient.test.ts
PASS __tests__/apiError.test.ts
PASS src/data/mappers/__tests__/dashboardMapper.test.ts
PASS __tests__/theme.test.tsx
PASS __tests__/apiConfig.test.ts
PASS __tests__/tokenStoreAndSession.test.ts
PASS __tests__/repositoryBridge.test.tsx
PASS __tests__/sharedComponents.test.tsx
PASS __tests__/friends.test.tsx
PASS __tests__/settings.test.tsx
PASS __tests__/coordinatorOperations.test.tsx
PASS __tests__/mockIdentityAndState.test.tsx
PASS __tests__/dashboard.test.tsx
PASS __tests__/profile.test.tsx
PASS __tests__/coordinator.test.tsx
PASS __tests__/scheduleTimezone.test.tsx
PASS __tests__/events.test.tsx
PASS __tests__/App.test.tsx
PASS __tests__/navigation.test.tsx
PASS src/features/auth/__tests__/authSession.test.tsx

Test Suites: 23 passed, 23 total
Tests:       290 passed, 290 total
Snapshots:   0 total
Time:        13.906 s
```

### 4.3. Test Cases in `authSession.test.tsx` (17 Tests)
1. **OtpLoginScreen:**
   - `renders Step 1 with phone input, optional display name, and send code button`
   - `shows validation error when attempting to send OTP with empty or default phone`
   - `submits phone to requestOtp and transitions to Step 2 with dev code banner`
   - `allows navigating back from Step 2 to Step 1 via AppHeader back button`
   - `validates OTP code and submits verifyOtp successfully`
   - `shows error banner when verifyOtp returns failure`
2. **UserProvider Session Lifecycle:**
   - `in mock mode: boots immediately into authenticated demo user`
   - `in http mode: cold start without stored token finishes unauthenticated`
   - `in http mode: cold start with stored token fetches profile and authenticates`
   - `in http mode: verifyOtp stores token in TokenStore and bootstraps session`
   - `in http mode: logout calls authApi.logout and clears TokenStore`
   - `in http mode: sessionManager.handleUnauthorized invalidates session on 401`
   - `preserves session token on 403, 404, 500 or network offline errors`
3. **UI Mode Switching & Invariants:**
   - `renders QA Demo Profile Switcher in MainDrawerContent when dataMode is mock`
   - `hides QA Demo Profile Switcher in MainDrawerContent when dataMode is http`
   - `AppNavigationRoot renders OtpLoginScreen in HTTP mode when unauthenticated`
   - `AppRoot renders correctly without throwing`

---

## 5. Architectural Guardrails & Constraints Compliance

1. **Non-Invasive Verification:**
   - Zero PostgreSQL SQL, migration, or function files modified.
   - Zero Django backend files modified (`services/`, `bff/`, `admin_portal/`, `common/`).
   - Zero new npm dependencies installed (uses native `fetch` and existing storage adapters).
2. **Security & Privacy:**
   - Sensitive tokens, raw OTP codes, phone numbers, and emergency contacts are never printed to console logs.
3. **Strict Session Invariants:**
   - Only HTTP 401 triggers `sessionManager.handleUnauthorized` and logs out the user. 403 Forbidden, 404 Not Found, 409 Conflict, 500 Server Error, and network timeouts preserve the persisted session token.
4. **Mock Default Integrity:**
   - Default mode remains `'mock'`. Existing development workflows, component previews, and demo users remain fully operational.

---

## 6. Sign-off & Next Steps

Phase 4 is complete, tested, and fully signed off.

**Ready for Phase 5:**
- Implement Volunteer Feature Slice Integration:
  - Wire `EventDiscoveryScreen`, `EventDetailScreen`, `MyApplicationsScreen`, `MyAssignmentsScreen` to the live Django BFF via `HttpEventRepository`.
  - Validate application submit/withdrawal and assignment confirmation/cancellation against live backend responses.
