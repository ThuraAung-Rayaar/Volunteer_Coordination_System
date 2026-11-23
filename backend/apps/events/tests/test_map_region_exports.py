from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from django.test import SimpleTestCase, override_settings

from common.map_engine import build_region_mbtiles


class RegionMbtilesExportTests(SimpleTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.source = self.root / "source.mbtiles"
        self.output = self.root / "packs"
        png = b"\x89PNG\r\n\x1a\n" + b"raster"
        svg = b"<svg xmlns='http://www.w3.org/2000/svg'></svg>"
        conn = sqlite3.connect(self.source)
        try:
            conn.execute("CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT)")
            conn.execute(
                """CREATE TABLE tiles (
                    zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER,
                    tile_data BLOB, region_code TEXT, updated_at TEXT,
                    PRIMARY KEY (zoom_level, tile_column, tile_row)
                )"""
            )
            conn.execute(
                "INSERT INTO metadata (name, value) VALUES ('last_refreshed_at', 'test')"
            )
            conn.executemany(
                """INSERT INTO tiles
                (zoom_level, tile_column, tile_row, tile_data, region_code, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)""",
                [
                    (10, 830, 470, png, "yangon", "2026-11-23T05:00:00+00:00"),
                    (10, 831, 470, svg, "yangon", "2026-11-23T05:00:00+00:00"),
                    (10, 830, 471, png, "mandalay", "2026-11-23T05:00:00+00:00"),
                ],
            )
            conn.commit()
        finally:
            conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    @override_settings(MAP_TILE_OFFLINE_ALLOWED=True, MAP_TILE_ATTRIBUTION="Test attribution")
    def test_exports_region_only_rasters_and_converts_xyz_to_tms(self):
        path = build_region_mbtiles("yangon", source_path=self.source, output_dir=self.output)
        conn = sqlite3.connect(path)
        try:
            rows = conn.execute(
                "SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles"
            ).fetchall()
            metadata = dict(conn.execute("SELECT name, value FROM metadata").fetchall())
        finally:
            conn.close()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][:3], (10, 830, (1 << 10) - 1 - 470))
        self.assertTrue(rows[0][3].startswith(b"\x89PNG"))
        self.assertEqual(metadata["format"], "png")
        self.assertEqual(metadata["attribution"], "Test attribution")

    @override_settings(MAP_TILE_OFFLINE_ALLOWED=False)
    def test_offline_export_requires_provider_permission(self):
        with self.assertRaises(PermissionError):
            build_region_mbtiles("yangon", source_path=self.source, output_dir=self.output)

    @override_settings(MAP_TILE_OFFLINE_ALLOWED=True)
    def test_svg_only_region_is_not_published(self):
        conn = sqlite3.connect(self.source)
        try:
            conn.execute("DELETE FROM tiles WHERE region_code='yangon'")
            conn.execute(
                "INSERT INTO tiles VALUES (?, ?, ?, ?, ?, ?)",
                (10, 830, 470, b"<svg></svg>", "yangon", "2026-11-23T05:00:00+00:00"),
            )
            conn.commit()
        finally:
            conn.close()
        with self.assertRaisesRegex(ValueError, "No real raster tiles"):
            build_region_mbtiles("yangon", source_path=self.source, output_dir=self.output)
