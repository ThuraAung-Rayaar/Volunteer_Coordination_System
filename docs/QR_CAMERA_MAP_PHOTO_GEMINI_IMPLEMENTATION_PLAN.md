# QR, Camera, GPS, Maps & Verification Photo — Gemini CLI Implementation Plan

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Target branch:** `mobile/ui_sync`  
**Base branch:** `main`  
**Main HEAD at handoff:** `695d4930bcc12855604fbc4e409fb887c98217dc`  
**Source-code HEAD at handoff review:** `621126c9fc06cfa0d40ef3c5ff759e2e3b392ebf`  
**Branch state:** expected to be ahead of `main` and not behind; always re-check the live comparison before editing.  
**Mobile stack:** React Native 0.88.1, React 19.3.0, TypeScript 6.0.3, New Architecture enabled  
**Backend:** Django REST Framework BFF, PostgreSQL/database-first  
**Document purpose:** Continue implementation locally after the GPT-owned cross-layer fixes. This is an implementation task, not a fresh architecture proposal.

---

## 1. Mission

Finish the native mobile integrations required to make the current QR, location, maps and verification-photo workflows usable on real Android/iOS devices.

The GPT-owned branch changes already cover the cross-layer correctness work listed in Section 3. Do not redo or revert those changes. Gemini owns the native dependencies, device permissions, screen integration, offline-map client lifecycle, local encrypted photo retention, and device verification.

The project is currently **not ready to be called fully workable** until real-device checks are complete. Source code compiling is not proof that camera, GPS, photo persistence or offline maps work.

## 2. Hard execution rules

### Repository and branch safety

1. Start on `mobile/ui_sync`. Confirm branch name, HEAD and `git status --short`.
2. The expected handoff HEAD is `60053fca884d73440c95bce3726dd94e93c47891`; if it differs, inspect the commits and current diffs before continuing.
3. Preserve all existing local changes. Do not reset, clean, stash, force-checkout, rebase or force-push.
4. Do not edit `main`, merge the branch, create a PR, or change remote branch refs.
5. Do not amend or rewrite the GPT-owned commits.
6. Make small commits grouped by working feature (QR, GPS, photo, map UI, native configuration). Record each commit SHA in the final report.

### Evidence and anti-hallucination rules

1. Every implementation decision must be supported by a current source file, API contract, official dependency documentation, or reproducible build/test result.
2. Before editing a field or route, trace it through:
   `screen → repository contract → HTTP/mock repository → endpoint → DTO → BFF serializer/view → service → database model/function`.
3. Do not invent API fields, endpoint paths, permission states, database columns, map regions, map coverage, provider licences, user UUID fields or test results.
4. If a needed value is absent, identify the missing source and report it. Do not silently add an assumed property.
5. Do not claim a feature is complete because a button renders. A feature is complete only when its real device path and failure states work.
6. If a dependency's compatibility or API is unclear, inspect its current official documentation and the actual installed package types before writing code. Do not use outdated VisionCamera v4 examples for v5.
7. If a build/test cannot be run on the available machine, state exactly what was not run and why. Never manufacture a pass.
8. Use the smallest change that completes the verified requirement. Do not refactor unrelated screens, architecture, state management, theme or API layers.
9. Do not read `old_doc/` or unrelated historical archives unless an exact current source cannot answer a specific question.

### Database, privacy and mode boundaries

- **No database schema changes.** Do not edit SQL, migrations, triggers, functions, constraints, views, canonical SQL, or run migrations/seeds/resets.
- Do not connect to or write to the protected prototype database.
- Template Mode stays fully local and must not call the BFF.
- HTTP Mode must not silently fall back to mock data on any failure.
- Do not log QR raw tokens, image bytes, private paths, session tokens, phone numbers, or GPS coordinates unnecessarily.
- Preserve role authorization; coordinator owner-as-monitor remains read-only.
- Keep the existing blue + cream design with sage/olive as a restrained supporting accent. Do not apply the brown palette.

---

## 3. GPT-owned changes already committed — do not repeat

The branch includes the following four GPT-owned commits after the merged `main` baseline:

1. `42c16550b1481fccfc1a87ba1e2f75918ae1ee94` — preserve full GPS telemetry and use the dedicated check-in-only QR path.
2. `0510957f72e5f2a33693f4be01d3f3c06cbc329e` — generate region-filtered MBTiles exports from real raster cache entries.
3. `37fb28681b8b797e25a5a04ac27b3eeeb7e29141` — expose a MapLibre raster style and use the region-specific archive endpoint.
4. `60053fca884d73440c95bce3726dd94e93c47891` — expose per-region real raster/placeholder coverage in the map catalog.

Two small follow-up consistency fixes were committed after the initial handoff draft:
- `07cf036749b1f3a5a8dba0a618eb700dfcfc276b` — preserve literal MapLibre tile URL placeholders in the style URL and keep map preview behavior explicit.
- `621126c9fc06cfa0d40ef3c5ff759e2e3b392ebf` — correct the PNG byte fixture in the SQLite-only map export test.

### 3.1 Mobile GPS contract is corrected

Files changed:

- `mobile/src/data/contracts/eventRepository.ts`
- `mobile/src/data/http/HttpEventRepository.ts`
- `mobile/src/data/mock/MockEventRepository.ts`
- `mobile/src/features/events/screens/MyAssignmentsScreen.tsx`
- `mobile/src/data/http/__tests__/checkinAttendance.test.tsx`

The repository now accepts a complete `GeoCheckInLocationFix` object:

- `latitude`
- `longitude`
- `accuracyM`
- `capturedAt`
- `isMocked`

The HTTP repository maps those values to `latitude`, `longitude`, `accuracy_m`, `captured_at`, and `is_mocked`. The assignment screen passes the full native fix. Keep this shape; do not revert to positional parameters or discard timestamp/mock telemetry.

### 3.2 Volunteer attendance now calls the dedicated QR check-in operation

`MyAssignmentsScreen` now calls `repository.qrCheckIn(token)`, not the generic `redeemQrToken(token)`.

The existing generic redemption endpoint dispatches multiple QR purposes. The volunteer attendance action must remain purpose-restricted through:

- Mobile endpoint: `checkin/attendance/qr-checkin/`
- BFF view: `AttendanceQrCheckinView`
- Server service: `qr_service.qr_check_in(...)`

Do not change the volunteer attendance scanner back to generic redemption.

### 3.3 Backend regional map export and style support

Files changed:

- `backend/common/map_engine.py`
- `backend/admin_portal/map_views.py`
- `backend/bff/urls.py`
- `backend/apps/events/tests/test_map_region_exports.py`

New/updated server contracts:

- `GET /api/v1/maps/catalog/` — region catalog and readiness metadata, including provider/offline flags and per-region real raster vs placeholder tile counts.
- `GET /api/v1/maps/style.json` — MapLibre-compatible raster style.
- `GET /api/v1/maps/tiles/{z}/{x}/{y}.png` — tile proxy.
- `GET /api/v1/maps/regions/{region_code}/download/` — a real region-filtered MBTiles archive, gated by explicit provider/offline permission.

The archive builder reads only records assigned to the requested region, excludes SVG preview placeholders, converts source XYZ y to MBTiles TMS `tile_row`, and writes a standards-shaped regional SQLite package. It refuses to publish a region with no genuine raster tiles.

The server no longer assumes that public OSM/ArcGIS URLs are generic bulk-download sources. A tile URL template must be explicitly configured by the operator. Offline export remains disabled unless `MAP_TILE_OFFLINE_ALLOWED` is explicitly true.

**Important:** The server-side region MBTiles export is not the mobile MapLibre offline-pack database. The mobile SDK should use its own `OfflineManager` pack lifecycle from the style URL. Do not download the MBTiles archive to the phone and assume MapLibre can consume it directly.

---

## 4. Repository facts and exact files to inspect

### 4.1 Existing mobile dependencies

Current `mobile/package.json` includes:

- React Native `0.88.1`
- React `19.3.0`
- TypeScript `6.0.3`
- `react-native-keychain` `8.2.0`
- React Navigation, gesture handler, Reanimated, safe-area and screens packages

It does **not** currently declare the native QR renderer, camera scanner, image picker, native geolocation provider, MapLibre or a dedicated private-file encryption/storage package.

The project has New Architecture enabled. Inspect `mobile/android/gradle.properties`, the iOS project and `mobile/ios/Podfile` before installing native modules.

### 4.2 Existing QR screens and APIs

- `mobile/src/features/coordinator/screens/CoordinatorAttendanceScreen.tsx`
  - Has `createdQrToken` state containing `id`, `rawToken`, and `expiresAt`.
  - Has create and revoke handlers.
  - Currently exposes the raw token as text instead of a rendered QR image.
- `mobile/src/features/events/screens/MyAssignmentsScreen.tsx`
  - Has the volunteer check-in UI and QR token input.
  - GPT has already switched submission to `qrCheckIn()`.
  - Add a camera-scanner entry point and use its decoded value with that existing check-in path.
- `mobile/src/data/endpoints/checkinApi.ts`
  - `resolveQrToken()`
  - `redeemQrToken()` (generic multi-purpose)
  - `qrCheckIn()` (check-in only)
  - `createCoordinatorQrToken()`
  - `revokeCoordinatorQrToken()`
- `mobile/src/data/dto/checkinDto.ts`
  - `QrTokenDto` includes `raw_token`, purpose, max uses and expiry.
  - `QrResolveResponseDto` includes event ID, purpose, validity and reason.
- `backend/bff/checkin/views.py`
  - `QrTokenCreateView`
  - `AttendanceQrCheckinView`
- `backend/services/qr_service.py`
  - Inspect `preview_qr_token`, `qr_check_in`, create and revoke functions before changing any semantics.

The server returns the raw token at creation time and stores only its hash. Treat the raw token as one-time display material; it cannot be recovered later from the hash.

### 4.3 Existing location/check-in paths

- `mobile/src/core/location/locationProvider.ts`
  - Defines `LocationFix` with coordinates, accuracy, capture timestamp and mocked flag.
  - Contains the mock and native providers.
  - Verify the actual native import/require and permission behavior.
- `mobile/src/features/events/screens/MyAssignmentsScreen.tsx`
  - Captures GPS and sends the fix through `submitGeoCheckIn()`.
- `mobile/src/data/endpoints/checkinApi.ts`
  - `submitGeoCheckIn()` posts the existing GeoCheckin request DTO.
- `mobile/src/data/dto/checkinDto.ts`
  - `GeoCheckinRequestDto` already supports `captured_at` and `is_mocked`.
- `backend/bff/checkin/serializers.py`
  - `GeoCheckinSerializer`.
- `backend/bff/checkin/views.py`
  - `AttendanceGeoCheckinView`.
- `backend/services/geo_service.py`
  - Calls the SQL `geo_check_in()` function with timestamp and mocked state.
- `mobile/ios/mobile/Info.plist`
  - `NSLocationWhenInUseUsageDescription` is currently an empty string.
- `mobile/android/app/src/main/AndroidManifest.xml`
  - Fine and coarse location permissions already exist.

The database remains authoritative for check-in eligibility and geofence distance. Do not reproduce the geofence algorithm in JavaScript or accept client-calculated distance as authoritative.

### 4.4 Existing verification-photo pipeline

Mobile:

- `mobile/src/features/profile/screens/VerificationCoordinatorStatusScreen.tsx`
- `mobile/src/data/contracts/profileRepository.ts`
- `mobile/src/data/http/HttpProfileRepository.ts`
- `mobile/src/data/endpoints/profileApi.ts`
- `mobile/src/domain/models/verification.ts`

Backend:

- `backend/bff/volunteer/urls.py`
- `backend/bff/volunteer/views.py` — `MeVerificationImagesView`
- `backend/bff/volunteer/serializers.py` — upload serializer
- `backend/services/verification_service.py`
- `backend/common/utils.py` — image sanitization/storage
- `backend/common/image_crypto.py`

Existing types:

- `mock_selfie`
- `id_license`
- `driver_license`

The authenticated endpoint is already `POST /api/v1/me/verification-images/` using multipart fields `image_type` and `image`. The same endpoint's GET returns verification metadata. `HttpProfileRepository.uploadVerificationImage()` already accepts a file URI and constructs multipart FormData.

The server validates image format/size/dimensions, strips EXIF by re-encoding JPEG, computes SHA-256, encrypts images privately with AES-256-GCM, and associates the stored image with the authenticated user. Reuse this pipeline. Do not add another upload endpoint or duplicate server encryption.

The existing GET endpoint returns metadata only. The private image-stream path is admin-gated. Do not expose private image files or add an owner image-download endpoint unless a separately justified product requirement for cross-device restore is demonstrated.

### 4.5 Existing event location wizard and map endpoints

- `mobile/src/features/coordinator/screens/CreateEventWizardScreen.tsx` — seven-step event wizard, Step 2 Location.
- `backend/common/map_engine.py` — region catalog, tile cache, style source configuration and regional MBTiles export.
- `backend/admin_portal/map_views.py`
- `backend/bff/urls.py`

The existing Step 2 fields include:

- `locationName`
- `landmarkText`
- `latitude`
- `longitude`
- `geoRadiusM`
- `geoCheckinEnabled`
- `geoOpensBeforeMin`
- `requireConfirmation`
- `mapProvider` (`openstreetmap` or `google`)

Preserve these serializer-backed values. The map pin picker must return coordinates into the existing form state; do not create a parallel location object that is not submitted by the event serializer.

---

## 5. Gemini task A — QR display and camera scanning

### A1. Coordinator QR rendering

Implement in the existing coordinator attendance workflow:

1. Render `createdQrToken.rawToken` as a scannable QR image. Use a QR renderer compatible with React Native 0.88.1 and the New Architecture.
2. Display event title, purpose, expiry, max uses and token ID using the existing state/response values. Do not invent metadata.
3. Keep the raw token only in component memory for the currently created token. Do not persist it in AsyncStorage, logs, analytics, screenshots, navigation params or ordinary local files.
4. Clear raw token state when:
   - the token is successfully revoked;
   - a replacement token is generated;
   - the token expires;
   - the screen unmounts or the user changes event;
   - the user logs out or switches account.
5. Display an explicit expired/revoked state. Do not present an expired QR as active.
6. Keep role controls disabled in monitor mode. A read-only owner/monitor must not create or revoke a token.

### A2. Volunteer camera-scanner screen

Add a real native scanner route/screen and connect it to the current assignment check-in UI.

Requirements:

- Rear camera preview, scan frame, cancel/back action, flashlight only if the chosen package supports it reliably.
- Camera permission request with a clear explanation and denied/permanently-denied states.
- Do not mount/keep the camera active while the screen is not focused. Follow the chosen camera library's lifecycle/focus guidance.
- On the first valid scan, set a processing guard immediately so repeated frames cannot submit duplicates.
- Prevent a second token submission while the current scan is being resolved/redeemed.
- Show loading, invalid, expired, revoked, wrong-purpose, already-used, not-assigned, network-unavailable and success states from actual API responses.
- A scanner result must be a string token; do not parse arbitrary QR URLs as a token unless the backend's actual issued QR format proves that behavior.
- Optional preview: use `resolveQrToken()` to check `is_valid` and `purpose === "checkin"` before confirmation. This endpoint is a preview only and does not consume the token.
- Final attendance mutation must use `repository.qrCheckIn(token)` / `checkinApi.qrCheckIn()`. Never use generic `redeemQrToken()` for the volunteer attendance action.
- Refresh assignments only after the check-in endpoint returns success.
- On offline/network failure, do not mark the volunteer checked in. Show a retry path and retain no raw token longer than needed.

### A3. QR library selection

The current QR renderer package candidate is `react-native-qrcode-svg` with its `react-native-svg` peer. The current VisionCamera architecture is version-sensitive. Before installing, validate the current QR scanner package and camera core combination from official documentation and installed package types. Do not use obsolete `react-native-camera`, `expo-barcode-scanner`, or unverified VisionCamera v4 snippets.

References checked during planning:

- QR renderer: https://www.npmjs.com/package/react-native-qrcode-svg
- VisionCamera current package: https://www.npmjs.com/package/react-native-vision-camera
- VisionCamera v5 scanner guidance: https://github.com/margelo/react-native-skills/blob/main/skills/react-native-vision-camera/references/migration-v4-to-v5.md

Do not assume a package name/version in this document is still latest when you install. Verify current peer dependencies, React Native version support, native setup, licence and API.

---

## 6. Gemini task B — Native GPS and truthful check-in

The GPT-owned API contract now sends the complete location fix. Finish the native provider and permission path.

### B1. Provider and permission work

1. Inspect the current `locationProvider.ts` and choose a maintained native geolocation package compatible with RN 0.88.1, React 19.3 and New Architecture.
2. Add the dependency and update the actual lockfile with the package manager already used by this repository. Do not hand-edit a lockfile.
3. Wire the provider to the selected native package; remove unreliable dynamic fallbacks that can claim permission was granted when no real permission request occurred.
4. Correct iOS when-in-use permission handling. The current `NSLocationWhenInUseUsageDescription` is blank; provide precise, user-facing purpose copy.
5. Keep Android fine/coarse permission handling. Request only foreground location. Do not add background tracking permission or background location service; it is not required by this task.
6. Capture a fresh fix with:
   - latitude
   - longitude
   - accuracy in metres
   - native capture timestamp converted to ISO 8601
   - native mocked-location signal when supported
7. If the selected native package cannot provide a mocked flag on a particular OS/version, preserve the truthful limitation. Do not set `isMocked=false` merely because the field is absent.
8. Reject missing, invalid, stale or clearly inaccurate fixes client-side for user feedback, but leave authoritative eligibility/distance decisions to the backend.
9. Never fall back to fixed Yangon coordinates in HTTP mode. The mock provider must remain available only in Template Mode/tests and must identify its result as mocked.

### B2. API and UI verification

Confirm that the code committed by GPT still sends `captured_at` and `is_mocked` through `HttpEventRepository` to `GeoCheckinSerializer`. Add/update tests if an implementation edit changes that path.

The server uses PostgreSQL `geo_check_in()` for distance, accuracy, freshness and mock-state validation. Do not duplicate that business logic on the client or edit SQL.

Test these device scenarios:

- permission granted;
- permission denied;
- permission permanently denied / settings redirect;
- location services disabled;
- GPS timeout;
- no fix or stale fix;
- poor accuracy;
- mocked location on supported Android/iOS versions;
- server rejection for outside geofence;
- server rejection for stale/mocked fix;
- successful and already-checked-in response;
- network failure without false success.

Reference: https://www.npmjs.com/package/@react-native-community/geolocation

That package is one compatibility candidate, not a mandate. Compare it with maintained New-Architecture options before choosing; validate its iOS callback permission behavior and native build on both platforms.

---

## 7. Gemini task C — Verification-photo picker, private local retention and upload

The backend upload contract already exists. Implement the missing native mobile path.

### C1. Capture/picker UI

For each current slot (`mock_selfie`, `id_license`, `driver_license`):

- Provide camera capture and gallery selection, with an image preview and replace/remove actions.
- Accept only image content that can be sent as JPEG to the existing server validator. Validate size and dimensions for fast user feedback, while treating server validation as final.
- Show selected, uploading, upload-failed, pending-review, approved and rejected states based on actual local/server state.
- Do not use a demo placeholder as a real uploaded image.
- Use the current `HttpProfileRepository.uploadVerificationImage(imageType, fileUri, mimeType, fileName)` and existing `POST me/verification-images/` multipart route.
- Do not show “uploaded” or change server status until the upload response succeeds.
- On network failure, preserve the encrypted local file and show a retry action.

Candidate picker reference: https://github.com/react-native-image-picker/react-native-image-picker

Validate the current package version and New Architecture/native requirements before installation.

### C2. Local storage and account association

The user's requirement is that the device retains its own verification images and associates them with the correct account. Implement this without using a phone number as the sole storage identity.

Requirements:

1. Inspect the current authenticated profile/bootstrap response and identify the stable account identifier already available to the app. Prefer the stable account UUID/user ID. Do not assume a property exists; prove it from the DTO and mapper.
2. A phone number may be retained as secondary account metadata/label, but must not be the filesystem key: phone numbers can change or be reassigned.
3. Copy the image out of the image-picker's temporary/cache URI into app-private storage immediately.
4. Store only one current encrypted local file per account + verification image type (unless an existing product design requires history).
5. Use a reviewed, maintained filesystem/encryption solution compatible with RN 0.88 New Architecture. Do not invent cryptography. Generate keys with a cryptographically secure random source and protect account-scoped keys with the existing `react-native-keychain` / platform Keychain/Keystore.
6. Keep image bytes out of AsyncStorage, ordinary preferences, navigation params, analytics, crash logs and public gallery storage.
7. Use file names that do not expose phone numbers or identity data. Use opaque identifiers or account UUID + image type.
8. On account switch, logout, expired session and login by a different user, do not render another account's local photos. Revalidate account ownership before reading or uploading a queued file.
9. Retain the latest selected photo locally for the current account as requested. When replacing a photo, replace the local current file only after the replacement has been safely saved; do not destroy the only valid copy before a new upload succeeds.
10. Define a cleanup strategy for abandoned temp files and queued uploads. Do not silently delete a pending upload.
11. Display that the server stores the authoritative submitted image encrypted; the local encrypted copy is for this device's preview/retry. Do not claim local storage syncs across devices.
12. Do not log local file paths, phone numbers, image contents, or encryption keys.

The existing backend validates image type/size/dimensions, strips EXIF by re-encoding, computes SHA-256, encrypts with AES-256-GCM and stores the file outside public media storage. Reuse it. The current GET returns metadata only; the admin-gated streaming view is not a volunteer self-download endpoint. Do not broaden image read permissions or add a self-download endpoint as part of this task.

### C3. Upload correctness

- Multipart file field is `image`; type field is `image_type`.
- Supported types must match backend `ALLOWED_IMAGE_TYPES`: `mock_selfie`, `id_license`, `driver_license`.
- Handle HTTP 400 validation, 401 session expiry, 413/size limit, 5xx and offline failures separately where the API client exposes them.
- Only replace server metadata for the selected image slot with the response from the successful upload.
- Refresh `getVerificationStatus()` after upload when necessary; do not fabricate approval.
- Ensure the Template Mode path never invokes the HTTP upload API and its demo photo does not leak into HTTP Mode.

---

## 8. Gemini task D — MapLibre, event pin selection and offline maps

### D1. Map library choice and native setup

Use MapLibre React Native as the leading in-app map candidate. The current project uses RN 0.88.1 and New Architecture. Current MapLibre documentation states v11 requires RN >= 0.80 and New Architecture; the project appears to satisfy those headline requirements. Still inspect the actual Android SDK/minSdk, iOS deployment target and Podfile before installation.

Official references:

- Getting started: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
- Bare React Native setup: https://maplibre.org/maplibre-react-native/docs/setup/react-native/
- OfflineManager: https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/

Follow the current v11 API rather than old Mapbox/MapLibre examples. Current v11 uses `Map` rather than the older `MapView` naming. On iOS, follow the current setup requirement for `$MLRN.post_install(installer)` in the existing Podfile post-install block; do not create duplicate post-install blocks. Run `pod install` and rebuild.

### D2. In-app location picker

Integrate a map picker with the existing event wizard Step 2 fields. The map must return the selected coordinate to the wizard form itself.

Requirements:

- Map is embedded in the app; user can pan/zoom and move/tap a pin.
- Search can be added only if a real configured geocoding provider/API exists. Do not add fake search results.
- Confirm action returns numeric latitude/longitude to the existing wizard state.
- Preserve manual coordinate entry as a fallback.
- Preserve venue name, landmark, geofence radius, geo-check-in enabled state, opening buffer, confirmation requirement and map provider selection.
- Preserve the current blue/cream/sage-or-olive theme; use semantic tokens and existing components.
- Show an explicit empty/unavailable state when no tile provider is configured; don't render a fake street map as if it were real.
- Never default an unknown coordinate to Yangon or `0,0` at runtime. Existing template fixture defaults may remain only if clearly marked demo/template values.

### D3. Google Maps behavior

Google Maps should be an optional external navigation action, not the app's pin-picker transport and not the offline tile provider.

- Use the selected/saved coordinates to open Google Maps directions/search with a normal URL/intent.
- Do not expect an external Google Maps launch to return a newly selected arbitrary pin to the app.
- Pin selection and coordinate confirmation must happen inside the app's MapLibre screen.
- Do not scrape Google Maps or download/copy Google tiles into the app's offline cache.

### D4. Online tiles and provider licensing

The GPT-owned server code now reads only an explicit tile provider template:

- `MAP_TILE_URL_TEMPLATE` — URL template containing `{z}`, `{x}`, and `{y}`.
- `MAP_TILE_ATTRIBUTION` — visible attribution string.
- `MAP_TILE_OFFLINE_ALLOWED` — explicit boolean gate for offline redistribution.

Gemini must inspect `.env.example`, Django settings and deployment configuration. Add documentation placeholders only if absent. Never add real provider API keys to Git. Do not set `MAP_TILE_OFFLINE_ALLOWED=true` by default.

Do not bulk-download `tile.openstreetmap.org`. The public OSM tile service policy does not allow offline prefetch/packaging from that public tile endpoint. Use a provider whose written terms permit the proposed online use, caching, offline regions and redistribution, or a properly self-hosted licensed tile source. Attribution must be included.

References:

- OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- MapLibre setup / production style guidance: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/

### D5. Client map catalog

Use the actual catalog response; don't invent a region list.

The current catalog contains ASEAN macro and Myanmar region metadata, including region codes, names, bounds, center and zooms. GPT added:

- `tile_provider_configured`
- `tile_attribution`
- `offline_downloads_enabled`
- `region_tile_stats[region].real_raster_tile_count`
- `region_tile_stats[region].placeholder_tile_count`
- `min_zoom` / `max_zoom` where available

The map screen should:

- Fetch `GET /api/v1/maps/catalog/`.
- Use its `style_url` (or derive only from the configured API base URL when the contract says so).
- Show region availability using real raster counts, not raw placeholder-inclusive counts.
- Disable/omit offline download when `offline_downloads_enabled !== true` or the region has no real raster tiles.
- Provide a clear reason when offline maps are not configured, e.g. “Offline maps are not available yet for this region.”
- Never mark a region as downloaded merely because its name appears in the catalog.

### D6. Offline pack lifecycle

Use MapLibre's `OfflineManager` for the app's own style/region packs:

- Create pack using the actual style URL, catalog bounds, and region zoom limits.
- Display progress and recoverable errors.
- Persist the generated pack ID plus region metadata only after creation succeeds.
- Query existing packs after app restart using `OfflineManager.getPacks()`.
- Support delete and re-download/update/invalidation where the installed SDK supports it.
- Handle cancellation/unmount listeners correctly.
- Limit tile counts/download size according to the licensed provider terms and device storage.
- Test airplane mode after a pack reports complete.
- Ensure an incomplete or failed pack is never represented as offline-ready.

**Do not assume the direct MBTiles download endpoint is the same as a MapLibre OfflineManager pack.** The GPT-owned endpoint now returns a genuine region-filtered MBTiles archive for consumers that explicitly need a file. The normal mobile MapLibre flow should use the style + OfflineManager. Do not build a second, duplicate raw SQLite tile cache unless there is a proven technical requirement.

---

## 9. Native configuration checklist

Inspect and update only required settings:

### Android

- `mobile/android/app/src/main/AndroidManifest.xml`
  - Existing INTERNET, ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION.
  - Add CAMERA only as required by the chosen scanner/capture library.
  - Do not add background location or storage permission without a demonstrated requirement.
- Check Gradle min/compile/target SDK compatibility for every native dependency.
- Confirm New Architecture remains enabled.
- Verify app backup does not export private verification photos or sensitive app storage.

### iOS

- `mobile/ios/mobile/Info.plist`
  - Replace blank `NSLocationWhenInUseUsageDescription` with clear purpose copy.
  - Add `NSCameraUsageDescription` for QR scan/photo capture.
  - Add `NSPhotoLibraryUsageDescription` only if the chosen library/workflow requires it.
  - Do not request Always/background location.
- `mobile/ios/Podfile`
  - Integrate only the required hooks for the chosen packages.
  - Preserve the existing React Native post-install logic.
- Run CocoaPods and build an iOS simulator/device target.

Do not add microphone permission: this feature set does not require audio/video recording.

---

## 10. Visual and interaction requirements

Retain the existing blue + cream palette, with sage or olive as a supporting colour. Do not use the old brown theme proposal.

Every new screen/control must have:

- Loading, success, failure, empty and permission-denied states where relevant.
- Accessible labels and button roles.
- Safe-area and keyboard behavior.
- Small-screen layout and scroll behavior.
- A visible disabled reason where an action is unavailable.
- No fake map tiles, fake GPS success, fake upload success or fake QR validation.
- No modal that prevents the user from returning to the underlying assignment/profile/event flow.

Keep the features consistent with the existing shared component system. Avoid introducing a new visual framework.

---

## 11. Required automated tests

Add focused tests and keep them close to their owning modules.

### QR

- Coordinator QR component renders the raw token as a QR value and never renders a stale revoked/expired token.
- QR state clears on revoke, replacement, expiry and unmount/event change.
- Scanner rejects empty scan values and ignores repeated camera callbacks while a request is in progress.
- Scanner checks `purpose === "checkin"` if it uses preview resolution.
- Attendance mutation calls only `qrCheckIn()`, never generic `redeemQrToken()`.
- HTTP failure, expired token, wrong purpose, already-used token and offline state never display success.

### GPS

- Native provider returns the exact capture time, accuracy and mocked status from the native API.
- Permission denied/unavailable is not converted to granted.
- HTTP repository still sends all five GPS fields, including `captured_at` and `is_mocked`.
- Mock provider is not used in HTTP mode.
- No server failure is presented as checked-in success.

### Photos

- Each allowed image type creates a valid multipart request.
- Picker cancellation makes no upload request.
- Local file copy survives component unmount/app restart.
- Encrypted files are scoped to the correct account and slot.
- Logout/account switch does not leak another account's preview.
- Upload failure preserves a retryable local copy.
- Successful upload updates only the corresponding slot with server-returned metadata.
- No image bytes or key are written to AsyncStorage/logs.

### Maps

- Catalog parsing handles absent/null stats and unavailable provider settings.
- Region bounds and coordinates are correctly converted to MapLibre format (longitude, latitude order where required by SDK).
- Offline pack is disabled without explicit server permission and real raster data.
- A failed/incomplete download does not appear complete.
- Existing packs are restored after app restart and deleted correctly.
- Offline map renders in airplane mode after successful pack completion.
- Pin selection writes coordinates to existing Step 2 state and form submission.
- External Google Maps action opens with saved coordinates but does not expect a pin callback.
- No OSM public bulk-prefetch path is reintroduced.

### Backend

Run the GPT-added SQLite-only export test:
`backend/apps/events/tests/test_map_region_exports.py`

It must verify:
- only the requested region is exported;
- SVG placeholders are excluded;
- XYZ → TMS row conversion is correct;
- offline export refuses when the explicit flag is false;
- an SVG-only region is not published.

Do not run migrations, seeds, resets or tests that write to the protected prototype database.

---

## 12. Required local verification

Before reporting completion:

1. Run `git status --short` and record whether unrelated worktree changes exist.
2. Record actual branch name and HEAD.
3. Install native packages only after checking peer dependencies and New Architecture compatibility. Update the existing lockfile using the package manager the repository already uses.
4. Run the existing mobile type check (inspect `mobile/package.json` first; if no type-check script exists, use the repository's documented TypeScript command).
5. Run focused Jest tests for QR, GPS, photo repository and map UI, then the full `npm test -- --runInBand` suite if practical.
6. Run `npm run lint` if defined by the mobile package.
7. Run backend Django tests for the new map export test using the repository's normal test settings. Do not run migrations manually.
8. Build Android with the project's normal Gradle/RN command.
9. Run `pod install` and build iOS using the actual Xcode scheme discovered from the project. Do not invent a scheme name.
10. Test at least one physical Android device and one physical iOS device if available; camera, precise GPS, photo library and location behaviors cannot be fully accepted from Jest or a simulator alone.
11. Test one no-network scenario for QR, photo retry and offline maps.
12. Report exact command, exit code and summary for every check. Separate:
    - passed;
    - failed;
    - not run (with reason);
    - device-tested;
    - simulator-only.

If a check fails, fix only failures introduced by this task, rerun the relevant check and report remaining baseline failures separately. Do not hide failures by weakening assertions or skipping tests.

---

## 13. Completion requirements / definition of done

Gemini may mark a workstream complete only when its specific acceptance conditions are met.

### QR done

- Coordinator-created active token visibly renders as a scannable QR.
- Volunteer camera scanner reads a QR using the rear camera with explicit permission handling.
- Scanner attendance submits through the existing dedicated QR check-in endpoint.
- Duplicate/expired/revoked/wrong-purpose/offline cases never create a false check-in.
- The coordinator can revoke and the UI clears the raw token.

### GPS done

- Real Android and iOS location permission requests work.
- Real location fix is acquired without hard-coded coordinates.
- Full timestamp/accuracy/mock telemetry reaches the existing BFF/SQL path.
- Server response is the only attendance success authority.
- Failure states are clear and tested.

### Photo done

- Camera and gallery selection work on device.
- Photo is copied to private local storage and encrypted at rest using a reviewed implementation.
- Local file is associated with a stable authenticated account ID and image type; phone is not the sole identity key.
- Existing multipart endpoint uploads it and backend metadata is refreshed after success.
- Retry works after network failure without leaking files across accounts.
- Local photo survives app restart.

### Map done

- Real map renders from the configured VCS MapLibre style/approved tile provider.
- In-app pin picker returns selected coordinates into the existing event form.
- Saved venue/landmark/coordinates remain intact.
- Region catalog reflects actual data readiness.
- Offline pack can be downloaded, resumed/retrieved, deleted and opened in airplane mode when provider licensing/config permits.
- Without a licensed provider or real tiles, the UI accurately reports unavailable rather than showing a fake map or fake download success.
- Google Maps is only external navigation, not the pin-picker return channel or offline tile source.

### Overall done

- Android native build passes.
- iOS native build passes.
- TypeScript, focused tests and full tests are reported honestly.
- No database schema or protected DB changes.
- Template Mode stays offline/network-free.
- HTTP mode has no silent mock fallback.
- All work is committed to `mobile/ui_sync`; `main` is unchanged and no merge/PR is created.
- Update this document only if a verified contract or dependency choice materially changes. If changing a plan detail, explain why and cite the source.

---

## 14. Gemini final report format

Return a concise but evidence-based final report with:

1. Actual branch and final HEAD.
2. Commits created (SHA + purpose).
3. Files changed by feature.
4. Dependencies added with exact versions and official compatibility references.
5. QR status and platform checks.
6. GPS status and platform checks.
7. Photo storage/upload status and security details.
8. Map renderer, provider configuration, offline pack status and licence assumption.
9. Tests/build commands, exit codes and outcomes.
10. Tests/builds/device scenarios not run and why.
11. Known limitations and any user decision required.
12. Explicit confirmation that `main`, SQL schema/migrations, and protected database were not changed.

Do not call the app “fully workable” unless the device acceptance criteria above have actually passed.

---

## 15. Official technical references checked when this handoff was prepared

Versions/docs can change. Re-open the current official sources before installing packages or using a new major-version API.

- MapLibre React Native requirements and setup: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
- MapLibre React Native bare RN setup: https://maplibre.org/maplibre-react-native/docs/setup/react-native/
- MapLibre OfflineManager create/get/delete/invalidate pack API: https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/
- QR rendering package: https://www.npmjs.com/package/react-native-qrcode-svg
- VisionCamera package: https://www.npmjs.com/package/react-native-vision-camera
- VisionCamera v5 migration and scanner API boundary: https://github.com/margelo/react-native-skills/blob/main/skills/react-native-vision-camera/references/migration-v4-to-v5.md
- Image picker setup and New Architecture notes: https://github.com/react-native-image-picker/react-native-image-picker
- Community geolocation package and permission requirements: https://www.npmjs.com/package/@react-native-community/geolocation
- OpenStreetMap public tile usage policy: https://operations.osmfoundation.org/policies/tiles/

**End of handoff. Work only on `mobile/ui_sync`; do not merge.**
