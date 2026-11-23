"""
Volunteer Coordination System v0.6.0 — Self-Hosted Asymmetric Map Engine
ASEAN Macro + Myanmar Regional Micro Tile Server, Range Streaming & Monthly Sync Store.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

from django.conf import settings
from django.utils import timezone

# ==============================================================================
# CONFIGURATION: ASEAN MACRO + MYANMAR REGIONAL MICRO PACKS
# ==============================================================================

ASEAN_MACRO_CONFIG: dict[str, Any] = {
    "code": "asean_macro",
    "name": "ASEAN Macro Overview (Myanmar & Neighbors)",
    "min_zoom": 0,
    "max_zoom": 9,
    "center": [16.8661, 96.1951],
    "bounds": [[5.0, 91.0], [28.6, 109.5]],  # SW, NE
}

MYANMAR_MICRO_REGIONS: dict[str, dict[str, Any]] = {
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
        "bounds": [[16.75, 94.70], [19.35, 97.10]],  # Northern Bago (Pyay) to southern delta
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
        "bounds": [[17.25, 92.15], [21.50, 94.85]],
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

    # ==========================================
    # ALIASES / REGIONAL AGGREGATIONS
    # ==========================================
    "bagan_magway": {
        "code": "bagan_magway",
        "name": "Central Dry Zone — Bagan & Magway (Micro Detail)",
        "center": [21.1717, 94.8585],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[18.80, 93.90], [22.20, 95.90]],
    },
    "mawlamyine_south": {
        "code": "mawlamyine_south",
        "name": "Mon State & Kayin — Mawlamyine Grid (Micro Detail)",
        "center": [16.4905, 97.6282],
        "default_zoom": 12,
        "min_zoom": 10,
        "max_zoom": 18,
        "bounds": [[14.90, 96.90], [17.50, 98.20]],
    },
}

# Storage paths
MBTILES_DIR = Path(settings.BASE_DIR) / "media" / "maps"
MBTILES_PATH = MBTILES_DIR / "vcs_asean_myanmar_tiles.mbtiles"
MANIFEST_PATH = MBTILES_DIR / "manifest.json"

USER_AGENT_HEADER = (
    "VolunteerCoordinationSystem/0.6.0 "
    "(SelfHostedTileGatekeeper; +https://vcs-myanmar.org; contact@vcs-myanmar.org)"
)


# ==============================================================================
# SLIPPY-MAP TILE MATH HELPERS
# ==============================================================================

def latlon_to_xy(lat: float, lon: float, z: int) -> tuple[int, int]:
    """
    Convert GPS latitude and longitude to slippy map tile coordinates (x, y) at zoom z.
    """
    n = 1 << z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    x = max(0, min(x, n - 1))
    y = max(0, min(y, n - 1))
    return x, y


def xy_to_latlon(x: int, y: int, z: int) -> tuple[float, float]:
    """
    Convert slippy map tile coordinates (x, y) at zoom z to (lat, lon) of the NW tile corner.
    """
    n = 1 << z
    lon_deg = x / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n)))
    lat_deg = math.degrees(lat_rad)
    return lat_deg, lon_deg


def _match_region_code(z: int, x: int, y: int) -> str:
    """Identify which region a tile coordinate belongs to."""
    if z <= 9:
        return "asean_macro"

    lat, lon = xy_to_latlon(x, y, z)
    for code, reg in MYANMAR_MICRO_REGIONS.items():
        bounds = reg["bounds"]
        sw, ne = bounds[0], bounds[1]
        if sw[0] <= lat <= ne[0] and sw[1] <= lon <= ne[1]:
            return code
    return "myanmar_micro"


# ==============================================================================
# SQLITE MBTILES STORE INITIALIZATION & ACCESS
# ==============================================================================

_db_initialized = False


def _init_mbtiles_db(db_path: Path = MBTILES_PATH) -> None:
    """
    Ensure SQLite MBTiles database and tables exist.
    """
    global _db_initialized
    if _db_initialized and db_path.exists() and db_path.stat().st_size > 0:
        return

    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=30.0)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                name TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tiles (
                zoom_level INTEGER,
                tile_column INTEGER,
                tile_row INTEGER,
                tile_data BLOB,
                region_code TEXT,
                updated_at TEXT,
                PRIMARY KEY (zoom_level, tile_column, tile_row)
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tiles_region ON tiles(region_code);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tiles_zoom ON tiles(zoom_level);")

        default_meta = [
            ("name", "Volunteer Coordination System Asymmetric Map Engine"),
            ("type", "baselayer"),
            ("version", "0.6.0"),
            ("description", "Permanent SQLite MBTiles Store for ASEAN Macro and Myanmar Regional Micro detail"),
            ("format", "png"),
            ("minzoom", "0"),
            ("maxzoom", "18"),
            ("refresh_interval", "monthly"),
        ]
        for key, val in default_meta:
            conn.execute("INSERT OR IGNORE INTO metadata (name, value) VALUES (?, ?)", (key, val))
        conn.commit()
    finally:
        conn.close()

    _db_initialized = True


def _get_db_connection(db_path: Path = MBTILES_PATH) -> sqlite3.Connection:
    _init_mbtiles_db(db_path)
    conn = sqlite3.connect(str(db_path), timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


# ==============================================================================
# OFFLINE SVG FALLBACK TILE GENERATOR
# ==============================================================================

def generate_offline_svg_tile(z: int, x: int, y: int) -> bytes:
    """
    Generate a clean 256x256 dark-slate SVG tile showing coordinates,
    approximate GPS bounds, and 'Offline Local Map Grid' so maps never break.
    """
    lat, lon = xy_to_latlon(x, y, z)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#0f172a" stroke="#334155" stroke-width="1"/>
  <line x1="0" y1="0" x2="256" y2="256" stroke="#1e293b" stroke-width="0.5" stroke-dasharray="4,4"/>
  <line x1="0" y1="256" x2="256" y2="0" stroke="#1e293b" stroke-width="0.5" stroke-dasharray="4,4"/>
  <rect x="8" y="8" width="240" height="240" fill="none" stroke="#1e293b" stroke-width="1"/>
  <text x="128" y="105" fill="#38bdf8" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle">Z{z}/{x}/{y}</text>
  <text x="128" y="130" fill="#94a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">Offline Local Map Grid</text>
  <text x="128" y="152" fill="#64748b" font-family="monospace" font-size="10" text-anchor="middle">{lat:.4f}°, {lon:.4f}°</text>
</svg>"""
    return svg.encode("utf-8")


# ==============================================================================
# CORE TILE RETRIEVAL & GATEKEEPER
# ==============================================================================

def get_or_fetch_tile(z: int, x: int, y: int, allow_remote: bool = True) -> tuple[bytes, str, str]:
    """
    Get tile from local MBTiles SQLite store, or fetch once from Carto mirror,
    or generate an offline SVG fallback tile.

    Returns:
        tuple[bytes, str, str]: (tile_bytes, content_type, source_status)
        where source_status in ("local_mbtiles", "remote_cached", "offline_svg_fallback").
    """
    _init_mbtiles_db()

    # Step 1: Check local SQLite database
    try:
        conn = _get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
                (z, x, y),
            )
            row = cur.fetchone()
            if row and row[0]:
                tile_bytes = row[0]
                is_svg = tile_bytes.startswith(b"<svg") or tile_bytes.startswith(b"<?xml")
                # SVG grid tiles are previews only, not genuine offline map tiles.
                if is_svg and not allow_remote:
                    return b"", "application/octet-stream", "offline_tile_unavailable"
                if not is_svg:
                    content_type = (
                        "image/jpeg" if tile_bytes.startswith(b"\xff\xd8\xff")
                        else "image/png"
                    )
                    return tile_bytes, content_type, "local_mbtiles"

        finally:
            conn.close()
    except Exception:
        pass

    # Step 2: Fetch only from an explicitly configured tile provider.
    # Do not bulk-download public OSM/ArcGIS endpoints.
    if allow_remote:
        provider_template = (
            getattr(settings, "MAP_TILE_URL_TEMPLATE", "")
            or os.getenv("MAP_TILE_URL_TEMPLATE", "")
        )
        if provider_template:
            try:
                url = provider_template.format(z=z, x=x, y=y)
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": USER_AGENT_HEADER,
                        "Accept": "image/png,image/jpeg",
                    },
                )
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    if resp.status == 200:
                        tile_bytes = resp.read()
                        is_png = tile_bytes.startswith(b"\x89PNG\r\n\x1a\n")
                        is_jpeg = tile_bytes.startswith(b"\xff\xd8\xff")
                        if is_png or is_jpeg:
                            content_type = "image/png" if is_png else "image/jpeg"
                            region_code = _match_region_code(z, x, y)
                            now_iso = timezone.now().isoformat()
                            try:
                                conn = _get_db_connection()
                                try:
                                    conn.execute(
                                        """
                                        INSERT OR REPLACE INTO tiles
                                        (zoom_level, tile_column, tile_row, tile_data, region_code, updated_at)
                                        VALUES (?, ?, ?, ?, ?, ?)
                                        """,
                                        (z, x, y, tile_bytes, region_code, now_iso),
                                    )
                                    conn.commit()
                                finally:
                                    conn.close()
                            except Exception:
                                pass
                            return tile_bytes, content_type, "remote_cached"
            except Exception:
                # Missing provider or provider failure means tile unavailable.
                pass

    # Step 3: Offline SVG fallback
    svg_bytes = generate_offline_svg_tile(z, x, y)
    return svg_bytes, "image/svg+xml", "offline_svg_fallback"


# ==============================================================================
# SEEDING & MONTHLY SYNC
# ==============================================================================

def seed_region_tiles(
    region_code: str = "yangon",
    zooms: list[int] | None = None,
    max_tiles: int = 120,
    fetch_remote: bool = False,
) -> dict[str, Any]:
    """
    Pre-populates missing tiles for a given region or all regions into the SQLite .mbtiles database.
    Updates manifest.json and metadata 'last_refreshed_at'.
    """
    _init_mbtiles_db()

    target_keys: list[str] = []
    if region_code == "all":
        target_keys = ["asean_macro"] + list(MYANMAR_MICRO_REGIONS.keys())
    elif region_code == "asean_macro":
        target_keys = ["asean_macro"]
    elif region_code in MYANMAR_MICRO_REGIONS:
        target_keys = [region_code]
    else:
        target_keys = [region_code]

    total_seeded = 0
    now_iso = timezone.now().isoformat()

    conn = _get_db_connection()
    try:
        for r_code in target_keys:
            if total_seeded >= max_tiles:
                break

            cfg = ASEAN_MACRO_CONFIG if r_code == "asean_macro" else MYANMAR_MICRO_REGIONS.get(r_code)
            if not cfg:
                continue

            region_zooms = zooms
            if not region_zooms:
                if r_code == "asean_macro":
                    region_zooms = [0, 1, 2]
                else:
                    region_zooms = [cfg.get("default_zoom", 12)]

            bounds = cfg["bounds"]
            sw_lat, sw_lon = bounds[0]
            ne_lat, ne_lon = bounds[1]

            for z in region_zooms:
                if total_seeded >= max_tiles:
                    break

                x_min, y_max = latlon_to_xy(sw_lat, sw_lon, z)
                x_max, y_min = latlon_to_xy(ne_lat, ne_lon, z)

                if x_min > x_max:
                    x_min, x_max = x_max, x_min
                if y_min > y_max:
                    y_min, y_max = y_max, y_min

                for x in range(x_min, x_max + 1):
                    if total_seeded >= max_tiles:
                        break
                    for y in range(y_min, y_max + 1):
                        if total_seeded >= max_tiles:
                            break

                        cur = conn.cursor()
                        cur.execute(
                            "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
                            (z, x, y),
                        )
                        existing_row = cur.fetchone()
                        if existing_row and existing_row[0]:
                            existing_data = existing_row[0]
                            is_placeholder = existing_data.startswith(b"<svg") or existing_data.startswith(b"<?xml")
                            if not (fetch_remote and is_placeholder):
                                continue

                        if fetch_remote:
                            tile_bytes, _ct, src = get_or_fetch_tile(z, x, y, allow_remote=True)
                            if src == "remote_cached":
                                total_seeded += 1
                        else:
                            tile_bytes = generate_offline_svg_tile(z, x, y)
                            conn.execute(
                                """
                                INSERT OR REPLACE INTO tiles
                                (zoom_level, tile_column, tile_row, tile_data, region_code, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?)
                                """,
                                (z, x, y, tile_bytes, r_code, now_iso),
                            )
                            total_seeded += 1

        conn.execute("INSERT OR REPLACE INTO metadata (name, value) VALUES ('last_refreshed_at', ?)", (now_iso,))
        conn.execute("INSERT OR REPLACE INTO metadata (name, value) VALUES ('refresh_interval', 'monthly')")
        conn.commit()
    finally:
        conn.close()

    # Update manifest.json
    manifest_data = {
        "engine": "Volunteer Coordination System Asymmetric Map Engine",
        "version": "0.6.0",
        "last_refreshed_at": now_iso,
        "refresh_interval": "monthly",
        "mbtiles_file": MBTILES_PATH.name,
        "mbtiles_size_bytes": MBTILES_PATH.stat().st_size if MBTILES_PATH.exists() else 0,
        "asean_macro": ASEAN_MACRO_CONFIG,
        "regions": MYANMAR_MICRO_REGIONS,
    }
    try:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)
    except Exception:
        pass

    return {
        "status": "ok",
        "region": region_code,
        "seeded_tiles": total_seeded,
        "last_refreshed_at": now_iso,
    }


def build_region_mbtiles(
    region_code: str,
    *,
    source_path: Path | None = None,
    output_dir: Path | None = None,
) -> Path:
    """Create a region-filtered MBTiles archive from genuine raster cache entries.

    The offline-distribution flag is an explicit provider licensing gate.
    Central cache rows use XYZ; exported MBTiles uses TMS tile_row values.
    SVG placeholder tiles are never included.
    """
    if not bool(getattr(settings, "MAP_TILE_OFFLINE_ALLOWED", False)):
        raise PermissionError(
            "Offline map distribution is disabled. Configure a tile provider that "
            "explicitly permits offline caching/redistribution before enabling it."
        )
    config = (
        ASEAN_MACRO_CONFIG
        if region_code == ASEAN_MACRO_CONFIG["code"]
        else MYANMAR_MICRO_REGIONS.get(region_code)
    )
    if config is None:
        raise ValueError(f"Unknown map region: {region_code}")

    database_path = Path(source_path or MBTILES_PATH)
    if not database_path.exists() or database_path.stat().st_size == 0:
        raise ValueError(f"No map tile store exists for region: {region_code}")

    with sqlite3.connect(str(database_path), timeout=30.0) as source:
        rows = source.execute(
            """
            SELECT zoom_level, tile_column, tile_row, tile_data, updated_at
            FROM tiles WHERE region_code = ?
            ORDER BY zoom_level, tile_column, tile_row
            """,
            (region_code,),
        ).fetchall()
        try:
            refresh_row = source.execute(
                "SELECT value FROM metadata WHERE name = 'last_refreshed_at'"
            ).fetchone()
        except sqlite3.DatabaseError:
            refresh_row = None

    raster_rows = []
    formats = set()
    for zoom, column, xyz_row, tile_data, updated_at in rows:
        if not isinstance(tile_data, (bytes, bytearray)):
            continue
        data = bytes(tile_data)
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            formats.add("png")
        elif data.startswith(b"\xff\xd8\xff"):
            formats.add("jpg")
        else:
            continue
        raster_rows.append((int(zoom), int(column), int(xyz_row), data, updated_at))

    if not raster_rows:
        raise ValueError(
            f"No real raster tiles are available for '{region_code}'. "
            "The region has no publishable offline map data."
        )
    if len(formats) != 1:
        raise ValueError(f"Region '{region_code}' contains mixed raster formats.")

    latest_update = max((str(row[4] or "") for row in raster_rows), default="")
    revision = (
        f"{database_path.stat().st_mtime_ns}:"
        f"{refresh_row[0] if refresh_row else ''}:{latest_update}:{len(raster_rows)}"
    )
    pack_dir = Path(output_dir or (MBTILES_DIR / "region-packs"))
    pack_dir.mkdir(parents=True, exist_ok=True)
    pack_path = pack_dir / f"{region_code}.mbtiles"

    if pack_path.exists():
        try:
            with sqlite3.connect(str(pack_path)) as cached:
                cached_revision = cached.execute(
                    "SELECT value FROM metadata WHERE name = 'source_revision'"
                ).fetchone()
            if cached_revision and cached_revision[0] == revision:
                return pack_path
        except sqlite3.DatabaseError:
            pass

    fd, temp_name = tempfile.mkstemp(
        prefix=f".{region_code}-", suffix=".tmp", dir=str(pack_dir)
    )
    os.close(fd)
    temp_path = Path(temp_name)
    try:
        min_zoom = min(row[0] for row in raster_rows)
        max_zoom = max(row[0] for row in raster_rows)
        sw, ne = config["bounds"]
        south, west = sw
        north, east = ne
        center_lat, center_lon = config["center"]
        metadata = {
            "name": str(config["name"]),
            "type": "baselayer",
            "version": "1.0",
            "description": f"Region-specific offline raster tiles for {region_code}",
            "format": next(iter(formats)),
            "minzoom": str(min_zoom),
            "maxzoom": str(max_zoom),
            "bounds": f"{west},{south},{east},{north}",
            "center": f"{center_lon},{center_lat},{int(config.get('default_zoom', 4))}",
            "attribution": str(getattr(settings, "MAP_TILE_ATTRIBUTION", "") or ""),
            "source_revision": revision,
        }
        with sqlite3.connect(str(temp_path), timeout=30.0) as output:
            output.execute("CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL)")
            output.execute(
                """
                CREATE TABLE tiles (
                    zoom_level INTEGER NOT NULL,
                    tile_column INTEGER NOT NULL,
                    tile_row INTEGER NOT NULL,
                    tile_data BLOB NOT NULL,
                    PRIMARY KEY (zoom_level, tile_column, tile_row)
                )
                """
            )
            output.executemany(
                "INSERT INTO metadata (name, value) VALUES (?, ?)", list(metadata.items())
            )
            output.executemany(
                """
                INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (z, x, (1 << z) - 1 - xyz_y, data)
                    for z, x, xyz_y, data, _updated_at in raster_rows
                ],
            )
            output.commit()
        os.replace(temp_path, pack_path)
    except Exception:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise
    return pack_path


# ==============================================================================
# CATALOG STATUS DISCOVERY
# ==============================================================================

def get_map_catalog_status() -> dict[str, Any]:
    """
    Returns full status dictionary of ASEAN macro and all Myanmar micro regions,
    cached tile counts, storage size, and timestamps.
    """
    _init_mbtiles_db()
    file_size = MBTILES_PATH.stat().st_size if MBTILES_PATH.exists() else 0
    total_tiles = 0
    last_refreshed_at = None
    zoom_distribution: dict[str, int] = {}
    region_distribution: dict[str, int] = {}

    try:
        conn = _get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM tiles")
            total_tiles = cur.fetchone()[0]

            cur.execute("SELECT zoom_level, COUNT(*) FROM tiles GROUP BY zoom_level")
            zoom_distribution = {str(z): count for z, count in cur.fetchall()}

            cur.execute("SELECT region_code, COUNT(*) FROM tiles GROUP BY region_code")
            region_distribution = {r: count for r, count in cur.fetchall() if r}

            cur.execute("SELECT value FROM metadata WHERE name = 'last_refreshed_at'")
            row = cur.fetchone()
            if row:
                last_refreshed_at = row[0]
        finally:
            conn.close()
    except Exception:
        pass

    return {
        "status": "online",
        "mbtiles_path": str(MBTILES_PATH),
        "file_size_bytes": file_size,
        "total_cached_tiles": total_tiles,
        "total_tiles": total_tiles,
        "last_refreshed_at": last_refreshed_at,
        "refresh_interval": "monthly",
        "macro": ASEAN_MACRO_CONFIG,
        "asean_macro": ASEAN_MACRO_CONFIG,
        "regions": MYANMAR_MICRO_REGIONS,
        "zoom_distribution": zoom_distribution,
        "region_distribution": region_distribution,
        "tile_provider_configured": bool(
            getattr(settings, "MAP_TILE_URL_TEMPLATE", "")
            or os.getenv("MAP_TILE_URL_TEMPLATE", "")
        ),
        "tile_attribution": str(getattr(settings, "MAP_TILE_ATTRIBUTION", "") or ""),
        "offline_downloads_enabled": bool(
            getattr(settings, "MAP_TILE_OFFLINE_ALLOWED", False)
        ),
    }
