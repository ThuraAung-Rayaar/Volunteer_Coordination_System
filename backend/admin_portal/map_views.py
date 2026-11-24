"""
Volunteer Coordination System v0.6.0 — Map Views & Tile Streaming Proxy
Exposes ASEAN Macro & Myanmar Micro Catalog, Slippy Map Tile Proxy,
HTTP 206 Partial Content MBTiles Range Streaming & Super Admin Sync Action.
"""

from __future__ import annotations

import os
from typing import Any

from django.conf import settings
from django.http import (
    FileResponse,
    HttpResponse,
    HttpResponseBadRequest,
    JsonResponse,
)
from django.shortcuts import redirect
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from common.map_engine import (
    MBTILES_PATH,
    _init_mbtiles_db,
    build_region_mbtiles,
    generate_offline_svg_tile,
    get_map_catalog_status,
    get_or_fetch_tile,
    seed_region_tiles,
)
from .views import _guard_admin_html


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def map_catalog_api_view(request) -> JsonResponse:
    """
    Catalog discovery endpoint returning metadata, zoom bounds, and
    storage metrics for ASEAN macro and Myanmar micro packs.
    """
    payload = get_map_catalog_status()
    payload["style_url"] = request.build_absolute_uri("/api/v1/maps/style.json")
    return JsonResponse(payload)


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def map_style_api_view(request) -> JsonResponse:
    """Return a MapLibre-compatible raster style backed by the VCS tile proxy."""
    tile_base = request.build_absolute_uri("/api/v1/maps/tiles/")
    tile_template = f"{tile_base}{{z}}/{{x}}/{{y}}.png"
    attribution = str(getattr(settings, "MAP_TILE_ATTRIBUTION", "") or "")
    return JsonResponse({
        "version": 8,
        "name": "Volunteer Coordination System",
        "sources": {
            "vcs-raster": {
                "type": "raster",
                "tiles": [tile_template],
                "tileSize": 256,
                "minzoom": 0,
                "maxzoom": 18,
                "attribution": attribution,
            }
        },
        "layers": [
            {
                "id": "vcs-raster-layer",
                "type": "raster",
                "source": "vcs-raster",
            }
        ],
    })


@extend_schema(exclude=True)
@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def map_tile_proxy_view(request, z: int, x: int, y: int) -> HttpResponse:
    """
    Slippy-map tile proxy endpoint. Serves from local MBTiles first;
    if missing and remote allowed, fetches once via compliant server User-Agent;
    otherwise serves offline SVG grid fallback.
    """
    if z < 0 or z > 20 or x < 0 or y < 0:
        return HttpResponseBadRequest("Invalid tile coordinates")

    allow_remote = request.GET.get("offline") != "1"
    tile_bytes, content_type, source_status = get_or_fetch_tile(
        z=z,
        x=x,
        y=y,
        allow_remote=allow_remote,
    )

    if source_status in ("offline_tile_unavailable", "offline_svg_fallback"):
        if request.GET.get("placeholder") != "1":
            return JsonResponse(
                {
                    "code": "map_tile_unavailable",
                    "detail": (
                        "No genuine raster tile is available for this coordinate. "
                        "Configure an approved tile provider or publish real map data."
                    ),
                },
                status=503,
            )
        tile_bytes = generate_offline_svg_tile(z, x, y)
        content_type = "image/svg+xml"

    if request.method == "HEAD":
        response = HttpResponse(b"", content_type=content_type)
        response["Content-Length"] = str(len(tile_bytes))
    else:
        response = HttpResponse(tile_bytes, content_type=content_type)

    response["Cache-Control"] = "public, max-age=2592000"
    response["X-Map-Tile-Source"] = source_status
    return response


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def map_region_download_view(request, region_code: str):
    """
    Stream an MBTiles package containing only genuine raster tiles for this region.
    Offline distribution must be explicitly enabled for a licensed tile provider.
    """
    try:
        pack_path = build_region_mbtiles(region_code)
    except PermissionError as exc:
        return JsonResponse(
            {"code": "offline_distribution_disabled", "detail": str(exc)},
            status=403,
        )
    except ValueError as exc:
        return JsonResponse(
            {"code": "map_region_unavailable", "detail": str(exc)},
            status=404,
        )

    total_size = pack_path.stat().st_size
    range_header = request.META.get("HTTP_RANGE", "").strip()
    if range_header.startswith("bytes="):
        try:
            start_text, end_text = range_header[6:].strip().split("-", 1)
            if start_text and end_text:
                start, end = int(start_text), int(end_text)
            elif start_text:
                start, end = int(start_text), total_size - 1
            elif end_text:
                suffix = int(end_text)
                if suffix <= 0:
                    raise ValueError("Invalid suffix range")
                start, end = max(0, total_size - suffix), total_size - 1
            else:
                raise ValueError("Empty byte range")
        except ValueError:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{total_size}"
            response["Accept-Ranges"] = "bytes"
            return response

        end = min(end, total_size - 1)
        if start < 0 or start > end or start >= total_size:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{total_size}"
            response["Accept-Ranges"] = "bytes"
            return response

        with pack_path.open("rb") as archive:
            archive.seek(start)
            chunk = archive.read(end - start + 1)
        response = HttpResponse(
            chunk,
            status=206,
            content_type="application/vnd.sqlite3",
        )
        response["Content-Range"] = f"bytes {start}-{end}/{total_size}"
        response["Content-Length"] = str(len(chunk))
        response["Accept-Ranges"] = "bytes"
        response["Content-Disposition"] = f'attachment; filename="{region_code}.mbtiles"'
        return response

    response = FileResponse(
        pack_path.open("rb"),
        content_type="application/vnd.sqlite3",
        as_attachment=True,
        filename=f"{region_code}.mbtiles",
    )
    response["Content-Length"] = str(total_size)
    response["Accept-Ranges"] = "bytes"
    response["Cache-Control"] = "private, max-age=0, must-revalidate"
    return response




@extend_schema(exclude=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def admin_map_sync_action_view(request) -> HttpResponse:
    """
    Administrative endpoint to trigger map sync/refresh for a region or all packs.
    Guarded by _guard_admin_html(request).
    """
    guard = _guard_admin_html(request)
    if guard:
        return guard

    region_code = request.data.get("region_code") or request.POST.get("region_code") or "yangon"
    fetch_remote_raw = request.data.get("fetch_remote") or request.POST.get("fetch_remote") or "0"
    fetch_remote = str(fetch_remote_raw).strip() in ("1", "true", "True")

    res = seed_region_tiles(
        region_code=region_code,
        max_tiles=60,
        fetch_remote=fetch_remote,
    )

    accept = request.META.get("HTTP_ACCEPT", "")
    if "application/json" in accept or request.content_type == "application/json":
        return JsonResponse({"status": "ok", "result": res})

    from django.contrib import messages
    messages.success(
        request,
        f"Map pack '{region_code}' synchronized ({res.get('seeded_tiles', 0)} tiles). Monthly schedule active."
    )
    return redirect("/api/v1/admin/ui/settings/")
