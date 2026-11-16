# Volunteer Coordination System v0.6.0 — Self-Hosted Asymmetric Map Engine & Final Hardening Plan

---

## PART 1: Full Architectural Plan for the Self-Hosted Asymmetric Map Engine (ASEAN Macro + Myanmar Regional Micro)

### 1. Why the Previous Map Broke & How This Architecture Permanently Solves It

1. **Why `tile.openstreetmap.org` Blocked You:**
   * All 4 admin templates (`dashboard.html`, `event_create.html`, `events_detail.html`, `geo_monitoring.html`) requested `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` directly from the browser.
   * Browser `<img>` tags cannot set a custom `User-Agent` header and hammer OSM's volunteer servers on every page reload, triggering an automatic `403 Forbidden / Access Blocked` image.
2. **Why Django's `runserver` Cannot Serve `.pmtiles` Properly Out of the Box:**
   * `PMTiles` requires **HTTP `206 Partial Content` (`Range: bytes=start-end`)** support. Django's default static file handler returns `200 OK` with the entire file instead of byte ranges unless served through a dedicated **HTTP Range-capable Django streaming view**.
3. **The Permanent Solution — 3-Tier Self-Hosted Asymmetric Map Engine:**
   * **Tier 1 — Permanent Local Server Tile Store (`SQLite MBTiles` + `.pmtiles` Byte-Range Store):**
     * **ASEAN Macro Base (`z0–z9`):** Covers Myanmar + surrounding ASEAN nations (Thailand, Laos, Cambodia, Vietnam, Malaysia, Singapore, Bangladesh, India border) at macro scale (borders, coastlines, capitals, highway corridors). Always visible globally.
     * **Myanmar Regional Micro Packs (`z10–z16+`):** Divided into **14 selectable operational regions** so web and mobile users can request/download micro street-and-building detail region-by-region:
1. yangon — Yangon Region ([16.35, 95.90] to [17.40, 96.60])
2. mandalay — Mandalay Region ([19.30, 95.20] to [22.40, 96.80])
3. naypyidaw — Naypyidaw Union Territory ([19.30, 95.65] to [20.20, 96.50])
4. shan — Shan State (Taunggyi / Inle / Lashio) ([19.30, 96.15] to [24.15, 101.20])
5. ayeyarwady — Ayeyarwady Delta (Pathein / Hinthada) ([15.65, 94.20] to [18.30, 95.90])
6. bagan_magway — Central Dry Zone (Bagan / Magway / Pakokku) ([18.80, 93.90] to [22.20, 95.90])
7. mawlamyine_south — Mon & Kayin Corridor (Mawlamyine / Hpa-An) ([14.90, 96.90] to [17.50, 98.20])
8. bago — Bago Region — Including Pyay / Pyi ([16.75, 94.70] to [19.35, 97.10])
9. rakhine — Rakhine State (Sittwe / Thandwe / Mrauk-U) ([17.25, 92.15] to [21.50, 94.85])
10. sagaing — Sagaing Region & Monywa ([21.50, 93.90] to [27.30, 96.90])
11. tanintharyi — Tanintharyi Region Archipelago (Dawei / Myeik) ([9.60, 97.50] to [15.20, 99.40])
12. kachin — Kachin State (Myitkyina / Bhamo) ([23.60, 96.00] to [28.55, 98.90])
13. chin — Chin State & Western Hills (Hakha / Mindat) ([20.65, 93.10] to [24.10, 94.15])
14. kayah — Kayah State (Loikaw Sector) ([18.25, 96.90] to [19.95, 97.90])

   * **Tier 2 — Server-Side Caching Gatekeeper (`/api/v1/maps/tiles/<z>/<x>/<y>.png`):**
     * Web and mobile clients **only** talk to your Django server (`/api/v1/maps/tiles/{z}/{x}/{y}.png` or `/api/v1/maps/pmtiles/<pack>.pmtiles`).
     * When a tile `{z}/{x}/{y}` is requested:
       1. **Check Local Permanent SQLite Tile Store (`offline_tiles.mbtiles`) first:** If the tile is already stored on disk (from the monthly sync or previous cache), Django returns it in `< 2ms` with **zero external internet traffic**.
       2. **Server-Side Gatekeeper Fetch & Record:** If a micro-detail tile is not yet in the local SQLite database, the **Django server** fetches it *once* using a compliant custom `User-Agent: VolunteerCoordinationSystem/0.6.0 (Admin-Server-Cache; +https://vcs-myanmar.org; contact@vcs-myanmar.org)` from CartoDB Voyager / OSM mirror, **permanently records it into the local SQLite `.mbtiles` database**, and serves it to the user.
       3. **Offline Vector SVG Fallback:** If the server has zero internet connection and the tile isn't in the SQLite database yet, Django dynamically renders a crisp **Offline Coordinate & Grid Tile SVG** with the exact GPS bounding box and region label so the map **never** shows broken images or blocked watermarks!
   * **Tier 3 — Monthly Automated Refresh (`python manage.py sync_offline_maps`):**
     * A Django management command + Super Admin UI button in `/api/v1/admin/ui/settings/` that downloads/refreshes the ASEAN Macro tiles (`z0–z8`) and Myanmar Micro region packs (`z9–z16`), records the version metadata (`last_refreshed_at`, `tile_count`, `size_bytes`, `sha256`), and exposes them to Web & Mobile clients.

---

### 2. Visual Data-Flow Diagram

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                    MONTHLY REFRESH & PERMANENT SERVER STORAGE                     │
│                                                                                   │
│  [Geofabrik / Carto Mirror]                                                       │
│        │  (1x/month or on-demand via custom compliant Server User-Agent)          │
│        ▼                                                                          │
│  [Django Management Command: `python manage.py sync_offline_maps`]                │
│        │                                                                          │
│        ├──► `media/maps/asean_macro.mbtiles` (ASEAN Macro Overview z0–z9)         │
│        ├──► `media/maps/regions/<region_code>.mbtiles` (Myanmar Micro z10–z16)    │
│        └──► `media/maps/manifest.json` (Version, SHA-256, Tile Counts, Bounds)    │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┴───────────────────────────────┐
        ▼                                                               ▼
┌───────────────────────────────────────┐       ┌───────────────────────────────────┐
│   WEB & ADMIN PORTAL (Leaflet.js)     │       │   MOBILE APP (Android / iOS)      │
│                                       │       │                                   │
│ • Always loads `/api/v1/maps/tiles/`  │       │ • Calls `GET /api/v1/maps/catalog`│
│ • Macro ASEAN visible at z0–z9        │       │ • Downloads `asean_macro.mbtiles` │
│ • Region Selector Dropdown on every   │       │ • Downloads needed Myanmar micro  │
│   map (`Yangon`, `Mandalay`, etc.)    │       │   regions on demand via Range API │
│   flies to region & pre-caches micro  │       │   `/api/v1/maps/regions/<code>/`  │
└───────────────────────────────────────┘       └───────────────────────────────────┘
```

---

### 3. New Endpoints & Components to Build

| Component / Route | Purpose | Access |
| :--- | :--- | :--- |
| `backend/common/map_engine.py` | Core self-hosted SQLite `.mbtiles` & `.pmtiles` storage engine, ASEAN/Myanmar bounding-box calculator, compliant server-side tile fetcher, and Offline SVG fallback generator. | Internal Service |
| `backend/apps/events/management/commands/sync_offline_maps.py` | CLI & cron command (`python manage.py sync_offline_maps --region yangon --max-zoom 15`) that seeds and monthly-refreshes ASEAN macro + Myanmar regional micro packs. | CLI / Cron / Super Admin |
| `GET /api/v1/maps/catalog/` | Returns JSON manifest of ASEAN Macro pack + all 7 Myanmar Regional Micro packs (bounds, center, zoom range, cached tile count, file size, last monthly refresh timestamp). | Public (`AllowAny`) |
| `GET /api/v1/maps/tiles/<int:z>/<int:x>/<int:y>.png` | Self-hosted tile server endpoint. Serves from local SQLite `.mbtiles` first; if missing, fetches once via compliant server `User-Agent`, saves permanently to SQLite, and returns PNG (or offline SVG grid tile if server is offline). | Public (`AllowAny`) |
| `GET /api/v1/maps/regions/<str:region_code>/download/` | Streams the regional `.mbtiles` / `.pmtiles` archive file with full **HTTP `206 Partial Content` (`Range` header)** support for mobile offline sync & browser PMTiles clients. | Public / Authenticated |
| `POST /api/v1/admin/maps/sync/` | Triggers an immediate regional or macro tile sync/warm-up from the Super Admin Control Center. | Super Admin / Admin |

---

## PART 2: Step-by-Step Prompts for Antigravity Gemini Flash

### Prompt 1 (`MAP-TASK-01`): Build the Self-Hosted Asymmetric Map Engine, Tile Server, Regional Download API & Monthly Sync Command

Copy and paste this prompt into Antigravity first:

````text
You are working on Volunteer Coordination System v0.6.0 (Django + DRF + PostgreSQL).
TASK ID: MAP-TASK-01 (Self-Hosted Asymmetric Map Engine: ASEAN Macro + Myanmar Regional Micro Tile Server, Range Streaming & Monthly Sync)

PROBLEM TO SOLVE:
OpenStreetMap (`tile.openstreetmap.org`) blocks direct browser requests with a 403 Forbidden error because browser `<img>` tags cannot send a custom `User-Agent` and repeatedly request uncached tiles.
We are replacing direct external OSM requests with a permanent **Self-Hosted Asymmetric Map Engine**:
- Macro Detail (`z0` to `z9`): Surrounding ASEAN region (`[0.0, 90.0]` to `[29.0, 110.0]`)
- Micro Detail (`z10` to `z18`): Myanmar divided into 7 selectable regions (`yangon`, `mandalay`, `naypyidaw`, `shan`, `ayeyarwady`, `bagan_magway`, `mawlamyine_south`)
- Server-Side Permanent SQLite Tile Store (`mbtiles`) + HTTP `206 Partial Content` Range Streaming + Monthly Sync Command (`sync_offline_maps`).

HARD CONSTRAINTS:
- Do NOT modify any `.sql` file or database migration.
- All existing tests must continue to pass.

IMPLEMENT THE FOLLOWING:

1. Create `backend/common/map_engine.py`:
   - Define the ASEAN macro bounds and the 7 Myanmar micro regions:
     ```python
     ASEAN_MACRO_CONFIG = {
         "code": "asean_macro",
         "name": "ASEAN Macro Overview (Myanmar & Neighbors)",
         "min_zoom": 0,
         "max_zoom": 9,
         "center": [16.8661, 96.1951],
         "bounds": [[5.0, 91.0], [28.6, 109.5]],  # SW, NE
     }

     MYANMAR_MICRO_REGIONS = {
    # ==========================================
    # 7 REGIONS (DIVISIONS)
    # ==========================================
    "yangon": {
        "code": "yangon",
        "name": "Yangon Region (Micro Street Detail)",
        "center": [16.80528, 96.15611],
        "default_zoom": 13,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[16.35, 95.90], [17.40, 96.60]],
    },
    "mandalay": {
        "code": "mandalay",
        "name": "Mandalay Region (Micro Street Detail)",
        "center": [21.9588, 96.0891],
        "default_zoom": 13,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[19.30, 95.20], [22.40, 96.80]],
    },
    "bago": {
        "code": "bago",
        "name": "Bago Region — Including Pyay / Pyi (Micro Street Detail)",
        "center": [17.3304, 96.4814],
        "default_zoom": 11,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[16.75, 94.70], [19.35, 97.10]], # Fully wraps northern Bago (Pyay) down to southern delta borders
    },
    "magway": {
        "code": "magway",
        "name": "Magway Region & Central Dry Zone (Micro Detail)",
        "center": [20.1544, 94.9453],
        "default_zoom": 11,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[18.80, 93.90], [22.20, 95.90]],
    },
    "ayeyarwady": {
        "code": "ayeyarwady",
        "name": "Ayeyarwady Delta — Pathein (Micro Street Detail)",
        "center": [16.7792, 94.7321],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[15.65, 94.20], [18.30, 95.90]],
    },
    "sagaing": {
        "code": "sagaing",
        "name": "Sagaing Region — Monywa & Northwest (Micro Detail)",
        "center": [22.1142, 95.1353],
        "default_zoom": 11,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[21.50, 93.90], [27.30, 96.90]],
    },
    "tanintharyi": {
        "code": "tanintharyi",
        "name": "Tanintharyi Region — Southern Archipelago (Micro Detail)",
        "center": [14.0828, 98.1940],
        "default_zoom": 10,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[9.60, 97.50], [15.20, 99.40]],
    },

    # ==========================================
    # 7 STATES (ETHNIC HOMELANDS)
    # ==========================================
    "rakhine": {
        "code": "rakhine",
        "name": "Rakhine State — Sittwe & Coastal Grid (Micro Detail)",
        "center": [20.1442, 92.8961],
        "default_zoom": 11,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[17.25, 92.15], [21.50, 94.85]], # Captures western coastline from Gwa up to Maungdaw
    },
    "shan": {
        "code": "shan",
        "name": "Shan State — Taunggyi, Inle & Plateau (Micro Detail)",
        "center": [20.7892, 97.0378],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[19.30, 96.15], [24.15, 101.20]],
    },
    "kachin": {
        "code": "kachin",
        "name": "Kachin State — Myitkyina & Far North (Micro Detail)",
        "center": [25.3833, 97.4000],
        "default_zoom": 11,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[23.60, 96.00], [28.55, 98.90]],
    },
    "chin": {
        "code": "chin",
        "name": "Chin State — Hakha & Western Hills (Micro Detail)",
        "center": [22.6413, 93.6181],
        "default_zoom": 11,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[20.65, 93.10], [24.10, 94.15]],
    },
    "mon": {
        "code": "mon",
        "name": "Mon State — Mawlamyine Grid (Micro Detail)",
        "center": [16.4905, 97.6282],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[14.90, 96.90], [17.50, 98.20]],
    },
    "kayin": {
        "code": "kayin",
        "name": "Kayin State — Hpa-An & Borders (Micro Detail)",
        "center": [16.8905, 97.6282],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[15.20, 96.30], [19.50, 98.70]],
    },
    "kayah": {
        "code": "kayah",
        "name": "Kayah State — Loikaw Sector (Micro Detail)",
        "center": [19.6742, 97.2094],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[18.25, 96.90], [19.95, 97.90]],
    },

    # ==========================================
    # 1 UNION TERRITORY
    # ==========================================
    "naypyidaw": {
        "code": "naypyidaw",
        "name": "Naypyidaw Union Territory (Micro Street Detail)",
        "center": [19.7633, 96.0785],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[19.30, 95.65], [20.20, 96.50]],
    },
}

     ```
   - Create a permanent SQLite MBTiles-compatible cache manager stored at `Path(settings.BASE_DIR) / "media" / "maps" / "vcs_asean_myanmar_tiles.mbtiles"` (automatically creates directory and SQLite tables `metadata (name TEXT PRIMARY KEY, value TEXT)` and `tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB, region_code TEXT, updated_at TEXT, PRIMARY KEY (zoom_level, tile_column, tile_row))`).
   - Implement `latlon_to_xy(lat, lon, z)` and `xy_to_latlon(x, y, z)` slippy-map tile math helpers.
   - Implement `get_or_fetch_tile(z: int, x: int, y: int, allow_remote: bool = True) -> tuple[bytes, str, str]`:
     * Returns `(tile_bytes, content_type, source_status)` where `source_status` is `"local_mbtiles"`, `"remote_cached"`, or `"offline_svg_fallback"`.
     * Step 1: Check the local SQLite database for `(zoom_level=z, tile_column=x, tile_row=y)`. If found, return `(row[0], "image/png", "local_mbtiles")` immediately!
     * Step 2: If not found in SQLite and `allow_remote=True`, fetch from CartoDB Voyager (`https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`) using `urllib.request.Request` with a strict 2.5-second timeout and compliant headers:
       `User-Agent: VolunteerCoordinationSystem/0.6.0 (SelfHostedTileGatekeeper; +https://vcs-myanmar.org; contact@vcs-myanmar.org)`
       If HTTP 200 and valid PNG bytes are returned, save permanently into the SQLite `tiles` table and return `(png_bytes, "image/png", "remote_cached")`.
     * Step 3: If remote fetch is disabled or fails (offline mode), generate and return a clean 256x256 dark-slate SVG tile (`content_type="image/svg+xml"`) showing subtle grid lines, the tile coordinate `Z{z}/{x}/{y}`, the approximate GPS lat/lng, and `"Offline Local Map Grid"` so the map never breaks offline.
   - Implement `seed_region_tiles(region_code: str = "yangon", zooms: list[int] = None, max_tiles: int = 120, fetch_remote: bool = False) -> dict`:
     * Computes the tile coordinates covering the requested region (`asean_macro` or one of `MYANMAR_MICRO_REGIONS`) for the specified zoom levels.
     * Pre-populates missing tiles into the SQLite `.mbtiles` database (if `fetch_remote=True`, fetches from Carto mirror; if `fetch_remote=False` or offline, stores a lightweight valid 1x1 or generated PNG/SVG tile or records metadata `last_refreshed_at` in `metadata` table) and updates `manifest.json` in `media/maps/manifest.json`.
   - Implement `get_map_catalog_status() -> dict`:
     * Reads tile counts per zoom/region from the SQLite `.mbtiles` store, file size on disk, `last_refreshed_at`, and returns the full JSON catalog of `asean_macro` + all 7 `MYANMAR_MICRO_REGIONS`.

2. Create the Monthly Sync Management Command `backend/apps/events/management/commands/sync_offline_maps.py`:
   - Supports arguments:
     * `--region` (default `"all"`, or `"asean_macro"`, `"yangon"`, `"mandalay"`, etc.)
     * `--max-tiles` (default `60` per region so CLI runs fast)
     * `--offline-seed` (action=`store_true`: seeds deterministic local fallback tiles and metadata without requiring internet access, useful for CI/tests/airgapped servers)
   - Updates `last_refreshed_at` and `refresh_interval = "monthly"` in the `.mbtiles` metadata table and writes `media/maps/manifest.json`.

3. Create Map API & Streaming Views in `backend/admin_portal/map_views.py` and mount them:
   - `map_catalog_api_view(request)` (`GET /api/v1/maps/catalog/`, `AllowAny`, `@extend_schema(exclude=True)`):
     * Returns `JsonResponse(get_map_catalog_status())` for both web and mobile clients to discover available macro & micro regions.
   - `map_tile_proxy_view(request, z: int, x: int, y: int)` (`GET /api/v1/maps/tiles/<int:z>/<int:x>/<int:y>.png`, `AllowAny`, `@extend_schema(exclude=True)`):
     * Validates `0 <= z <= 20`.
     * Calls `get_or_fetch_tile(z, x, y, allow_remote=(request.GET.get("offline") != "1"))`.
     * Returns `HttpResponse(tile_bytes, content_type=content_type)` with headers:
       * `Cache-Control: public, max-age=2592000` (30 days monthly cache)
       * `X-Map-Tile-Source: <source_status>`
   - `map_region_download_view(request, region_code: str)` (`GET /api/v1/maps/regions/<str:region_code>/download/`, `AllowAny`, `@extend_schema(exclude=True)`):
     * Ensures the `.mbtiles` file exists (initializes it if needed).
     * Supports **HTTP `Range: bytes=start-end` (`206 Partial Content`)** requests! If `HTTP_RANGE` is present in `request.META`, parse `bytes=start-end`, seek to `start`, read the requested slice, and return `HttpResponse(status=206)` with `Content-Range: bytes {start}-{end}/{total_size}` and `Accept-Ranges: bytes`. Otherwise stream the file with `Accept-Ranges: bytes` and `Content-Disposition: attachment; filename="{region_code}.mbtiles"`.
   - `admin_map_sync_action_view(request)` (`POST /api/v1/admin/maps/sync/`, guarded by `_guard_admin_html(request)`, `@extend_schema(exclude=True)`):
     * Accepts `region_code` (e.g. `"yangon"`, `"asean_macro"`, or `"all"`) and `fetch_remote` (`"1"` or `"0"`).
     * Calls `seed_region_tiles(...)` and either returns JSON (if `Accept: application/json`) or redirects back to `/api/v1/admin/ui/settings/` with a flash message.

4. Mount the Map Routes:
   - In `backend/config/urls.py` (or wherever `/api/v1/` routes are mounted) and `backend/admin_portal/urls.py`:
     * Mount `/api/v1/maps/catalog/`, `/api/v1/maps/tiles/<int:z>/<int:x>/<int:y>.png`, `/api/v1/maps/regions/<str:region_code>/download/`, and `/api/v1/admin/maps/sync/`.
     * Also mount aliases under `/api/v1/admin/maps/...` if helpful.

5. Add Automated Tests in `backend/apps/audit/tests/test_api_admin_portal_phase8.py`:
   - `test_map_catalog_and_self_hosted_tile_server`:
     * Calls `GET /api/v1/maps/catalog/` -> verifies `asean_macro` and all 7 Myanmar regions (`yangon`, `mandalay`, `naypyidaw`, `shan`, `ayeyarwady`, `bagan_magway`, `mawlamyine_south`) are returned.
     * Calls `GET /api/v1/maps/tiles/12/3142/1880.png?offline=1` -> verifies `200 OK` and header `X-Map-Tile-Source` is `"local_mbtiles"` or `"offline_svg_fallback"`.
   - `test_map_region_download_supports_http_range_206`:
     * Calls `GET /api/v1/maps/regions/yangon/download/` with `HTTP_RANGE="bytes=0-127"` -> verifies `206 Partial Content`, `Accept-Ranges: bytes`, and `Content-Range` header.
   - `test_sync_offline_maps_command`:
     * Runs `call_command("sync_offline_maps", region="yangon", offline_seed=True)` and verifies tiles are recorded in the local `.mbtiles` store.

VERIFY:
1. Run `python manage.py check`
2. Run `python manage.py test apps.audit.tests.test_api_admin_portal_phase8 --keepdb`
3. Confirm `git diff --name-only -- "*.sql"` is empty.
````

---

### Prompt 2 (`MAP-TASK-02`): Switch All Admin Maps to `VCSMapEngine`, Add Region-by-Region Selector, Add Map Sync Card in Settings & Apply Final Hardening (`UI-TASK-07`)

After `MAP-TASK-01` completes, copy and paste this second prompt into Antigravity:

````text
You are working on Volunteer Coordination System v0.6.0 (Django + DRF + PostgreSQL).
TASK ID: MAP-TASK-02 (Upgrade All Frontend Leaflet Maps to Self-Hosted Asymmetric `VCSMapEngine` + Region Selector + Settings Map Manager + UI-TASK-07 Hardening)

HARD CONSTRAINTS:
- Do NOT modify any `.sql` file or database migration.
- Replace ALL remaining hardcoded `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` references across all templates so the browser NEVER hits `tile.openstreetmap.org` directly again.

IMPLEMENT THE FOLLOWING:

1. Add Global `window.VCSMapEngine` Helper in `backend/admin_portal/templates/admin_portal/base_admin.html`:
   - In `base_admin.html` (inside `<head>` or before `{% block script_extra %}`), define `window.VCSMapEngine`:
     ```javascript
     window.VCSMapEngine = {
         regions: {
    // ==========================================
    // OVERVIEW MACRO LAYER
    // ==========================================
    asean_macro: { 
        name: "🌏 ASEAN Macro View (z0–z9)", 
        center: [16.8661, 96.1951], 
        zoom: 6 
    },

    // ==========================================
    // 7 REGIONS (DIVISIONS) - MICRO DETAIL
    // ==========================================
    yangon: { 
        name: "📍 Yangon Region (Micro Detail)", 
        center: [16.80528, 96.15611], 
        zoom: 13 
    },
    mandalay: { 
        name: "📍 Mandalay Region (Micro Detail)", 
        center: [21.9588, 96.0891], 
        zoom: 13 
    },
    bago: { 
        name: "📍 Bago Region — Incl. Pyay / Pyi (Micro Detail)", 
        center: [17.3304, 96.4814], 
        zoom: 12 
    },
    bagan_magway: { 
        name: "📍 Central Dry Zone — Bagan & Magway (Micro Detail)", 
        center: [21.1717, 94.8585], 
        zoom: 12 
    },
    ayeyarwady: { 
        name: "📍 Ayeyarwady — Pathein (Micro Detail)", 
        center: [16.7792, 94.7321], 
        zoom: 12 
    },
    sagaing: { 
        name: "📍 Sagaing Region — Monywa & Northwest (Micro)", 
        center: [22.1142, 95.1353], 
        zoom: 11 
    },
    tanintharyi: { 
        name: "📍 Tanintharyi Region — Southern Tail (Micro)", 
        center: [14.0828, 98.1940], 
        zoom: 11 
    },

    // ==========================================
    // 7 STATES (ETHNIC HOMELANDS) - MICRO DETAIL
    // ==========================================
    rakhine: { 
        name: "📍 Rakhine State — Sittwe & Coast (Micro Detail)", 
        center: [20.1442, 92.8961], 
        zoom: 12 
    },
    shan: { 
        name: "📍 Shan State — Taunggyi/Inle (Micro Detail)", 
        center: [20.7892, 97.0378], 
        zoom: 12 
    },
    kachin: { 
        name: "📍 Kachin State — Myitkyina & Far North (Micro)", 
        center: [25.3833, 97.4000], 
        zoom: 11 
    },
    chin: { 
        name: "📍 Chin State — Hakha & Western Hills (Micro)", 
        center: [22.6413, 93.6181], 
        zoom: 11 
    },
    mawlamyine_south: { 
        name: "📍 Mon/Kayin — Mawlamyine & Hpa-An (Micro)", 
        center: [16.4905, 97.6282], 
        zoom: 12 
    },
    kayah: { 
        name: "📍 Kayah State — Loikaw Sector (Micro)", 
        center: [19.6742, 97.2094], 
        zoom: 12 
    },

    // ==========================================
    // 1 UNION TERRITORY - MICRO DETAIL
    // ==========================================
    naypyidaw: { 
        name: "📍 Naypyidaw Territory (Micro Detail)", 
        center: [19.7633, 96.0785], 
        zoom: 12 
    }
},

         attachTileLayer: function(map, options) {
             // Primary: Self-Hosted Django Tile Gatekeeper (serves local MBTiles first, caches Carto, or renders Offline SVG)
             const selfHostedUrl = "/api/v1/maps/tiles/{z}/{x}/{y}.png";
             const cartoBackupUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
             const layer = L.tileLayer(selfHostedUrl, {
                 maxZoom: (options && options.maxZoom) || 19,
                 attribution: '&copy; Self-Hosted VCS Asymmetric Map Engine (ASEAN Macro + Myanmar Micro) &bull; &copy; OpenStreetMap &amp; CARTO'
             });
             // Fallback if local endpoint ever errors
             layer.on("tileerror", function(err) {
                 if (err.tile && !err.tile.dataset.fallbackTried) {
                     err.tile.dataset.fallbackTried = "1";
                     const c = err.coords;
                     err.tile.src = `/api/v1/maps/tiles/${c.z}/${c.x}/${c.y}.png?offline=1`;
                 }
             });
             layer.addTo(map);
             this.attachRegionControl(map);
             return layer;
         },
         attachRegionControl: function(map) {
             const self = this;
             const RegionControl = L.Control.extend({
                 options: { position: "topright" },
                 onAdd: function() {
                     const div = L.DomUtil.create("div", "leaflet-bar leaflet-control");
                     div.style.background = "rgba(15, 23, 42, 0.92)";
                     div.style.padding = "4px 6px";
                     div.style.borderRadius = "8px";
                     div.style.border = "1px solid #334155";
                     const select = document.createElement("select");
                     select.style.background = "#0f172a";
                     select.style.color = "#f8fafc";
                     select.style.fontSize = "11px";
                     select.style.fontFamily = "monospace";
                     select.style.border = "none";
                     select.style.outline = "none";
                     select.style.cursor = "pointer";
                     Object.keys(self.regions).forEach(function(key) {
                         const opt = document.createElement("option");
                         opt.value = key;
                         opt.textContent = self.regions[key].name;
                         if (key === "yangon") opt.selected = true;
                         select.appendChild(opt);
                     });
                     L.DomEvent.disableClickPropagation(div);
                     select.addEventListener("change", function() {
                         const r = self.regions[select.value];
                         if (r) map.flyTo(r.center, r.zoom, { duration: 0.8 });
                     });
                     div.appendChild(select);
                     return div;
                 }
             });
             map.addControl(new RegionControl());
         }
     };
     ```

2. Replace `L.tileLayer("https://{s}.tile.openstreetmap.org/...")` in All 4 Templates:
   - `backend/admin_portal/templates/admin_portal/dashboard.html`
   - `backend/admin_portal/templates/admin_portal/event_create.html`
   - `backend/admin_portal/templates/admin_portal/events_detail.html`
   - `backend/admin_portal/templates/admin_portal/geo_monitoring.html`
   In all 4 files, replace the `L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", ...).addTo(map);` call with:
   ```javascript
   window.VCSMapEngine.attachTileLayer(map, { maxZoom: 19 });
   ```
   Verify with `grep` that zero occurrences of `tile.openstreetmap.org` remain in `backend/admin_portal/templates/`.

3. Add Self-Hosted Map Storage & Regional Sync Control Card to `backend/admin_portal/templates/admin_portal/settings.html` and `views.py` (`admin_settings_view`):
   - In `admin_settings_view` (`backend/admin_portal/views.py`):
     * Import `get_map_catalog_status, seed_region_tiles` from `common.map_engine`.
     * Handle `form_action == "sync_offline_maps"`:
       Accept `region_code = request.POST.get("region_code", "yangon")` and `fetch_remote = request.POST.get("fetch_remote") == "1"`.
       Call `sync_res = seed_region_tiles(region_code=region_code, fetch_remote=fetch_remote)` and set `success_message = f"Map pack '{region_code}' synchronized ({sync_res.get('seeded_tiles', 0)} tiles processed). Monthly schedule active."`.
     * Pass `"map_catalog": get_map_catalog_status()` in the template `context`.
   - In `settings.html`:
     * Add a full-width section **"Self-Hosted Asymmetric Map Engine (ASEAN Macro + Myanmar Regional Micro Packs)"**:
       - Displays `.mbtiles` storage file status, total cached tiles, file size, and last monthly refresh timestamp.
       - Lists the ASEAN Macro pack (`z0–z9`) + all 7 Myanmar Micro regions (`z10–z18`) with a **"Download `.mbtiles` Pack"** link (`/api/v1/maps/regions/<code>/download/`) and a **"Sync / Refresh Region Now"** form (`form_action="sync_offline_maps"`).

4. Apply the 6 Code Audit Hardening Fixes (`UI-TASK-07`) in `backend/admin_portal/views.py`:
   - **Fix 1 (Default Password on Provisioning & Login Hardening):**
     * In `user_provision_view`: if `not password`, default to `"AdminDemo123!"` and always call `new_user.set_password(password_to_set)` and `new_user.save(update_fields=["password"])`.
     * In `admin_login_view`: only allow the `"AdminDemo123!"` bootstrap upgrade if `raw_user_pw` is non-empty and does NOT start with `"!"` or `("pbkdf2_", "argon2", "bcrypt")`.
   - **Fix 2 (Safe `expires_at` Parsing in `users_directory_view`):**
     * Parse `expires_at` using `parse_datetime(str(expires_at).strip())` and `timezone.make_aware(dt)` when non-empty; pass `None` when empty so blank `<input type="datetime-local" name="expires_at">` never raises a `ValidationError`.
   - **Fix 3 (Privilege Escalation & Self-Approval Guards):**
     * In `admin_settings_view` (`reset_user_password` and `change_user_phone`): if `target_user.is_superuser and not request.user.is_superuser`, raise `DomainError(code="insufficient_privilege", message="Only a Super Admin can modify a Super Admin account.", status_code=403)`.
     * In `user_provision_view`: exclude `request.user.id` from `eligible_volunteers` and block `target_user.id == request.user.id` in `promote_coordinator`.
   - **Fix 4 (Dashboard Feedback Average Alignment):**
     * In `dashboard_view`: filter `active_scores`, `d_feedbacks`, and `star_counts` by `f.status == "active"` so hidden reviews do not skew `feedback_overview`.
   - **Fix 5 (Selected Event Map Focus in `events_detail_and_geo_view`):**
     * Pass `selected_event` into `_build_geo_map_json(selected_event=selected_event)` so inspecting any event includes it in `geo_map_json` and focuses the map on `selected_event`'s coordinates.
   - **Fix 6 (Exclude HTML Template Views from `schema.yml`):**
     * Add `@extend_schema(exclude=True)` to all HTML UI views in `admin_portal/views.py` (`admin_login_view`, `admin_logout_view`, `admin_phone_hash_lookup_api`, `dashboard_view`, `event_create_tab_view`, `events_detail_and_geo_view`, `geo_monitoring_view`, `users_directory_view`, `user_provision_view`, `coordinator_board_view`, `feedback_intelligence_view`) and regenerate `schema.yml`.

5. Add Regression Tests in `backend/apps/audit/tests/test_api_admin_portal_phase8.py`:
   - `test_templates_use_self_hosted_vcs_map_engine_and_not_direct_osm`
   - `test_users_directory_block_with_empty_and_valid_expires_at`
   - `test_standard_admin_cannot_reset_super_admin_password_or_phone`
   - `test_settings_sync_offline_maps_post_action`

VERIFY:
1. Run `python manage.py check`
2. Run `python manage.py spectacular --file ../schema.yml --fail-on-warn`
3. Run `python manage.py test apps.audit.tests --keepdb`
4. Confirm `git diff --name-only -- "*.sql"` is empty.
````