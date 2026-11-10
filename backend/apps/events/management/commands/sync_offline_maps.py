"""
Management command to synchronize and pre-seed offline map tiles
for ASEAN Macro and Myanmar Regional Micro packs into SQLite MBTiles store.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand
from common.map_engine import get_map_catalog_status, seed_region_tiles


class Command(BaseCommand):
    help = (
        "Synchronize and pre-seed offline map tiles for ASEAN Macro overview "
        "and Myanmar Regional Micro packs into the permanent SQLite MBTiles store."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--region",
            type=str,
            default="all",
            help="Target region to sync ('all', 'asean_macro', 'yangon', 'mandalay', etc.)",
        )
        parser.add_argument(
            "--max-tiles",
            type=int,
            default=60,
            help="Maximum tiles to seed/sync per region (default: 60)",
        )
        parser.add_argument(
            "--offline-seed",
            action="store_true",
            help="Seed deterministic local fallback tiles without internet access (for CI / airgapped servers)",
        )

    def handle(self, *args: Any, **options: Any):
        region: str = options.get("region") or "all"
        max_tiles: int = options.get("max_tiles") or 60
        offline_seed: bool = bool(options.get("offline_seed", False))
        fetch_remote: bool = not offline_seed

        self.stdout.write(
            f"[*] Executing offline map sync: region='{region}', max_tiles={max_tiles}, "
            f"fetch_remote={fetch_remote}, offline_seed={offline_seed}"
        )

        res = seed_region_tiles(
            region_code=region,
            max_tiles=max_tiles,
            fetch_remote=fetch_remote,
        )

        catalog = get_map_catalog_status()
        self.stdout.write(
            self.style.SUCCESS(
                f"[+] Successfully synchronized offline maps: region='{res.get('region')}', "
                f"seeded_tiles={res.get('seeded_tiles')}. "
                f"Total cached tiles: {catalog.get('total_cached_tiles')}, "
                f"Store size: {catalog.get('file_size_bytes')} bytes, "
                f"Refresh interval: {catalog.get('refresh_interval')}."
            )
        )
