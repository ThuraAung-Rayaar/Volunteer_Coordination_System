"""
Volunteer Coordination System v0.6.0 — Map Views & Tile Streaming Proxy
Exposes ASEAN Macro & Myanmar Micro Catalog, Slippy Map Tile Proxy,
HTTP 206 Partial Content MBTiles Range Streaming & Super Admin Sync Action.
"""

from __future__ import annotations

import os
from typing import Any

from django.http import (
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
    return JsonResponse(get_map_catalog_status())


@extend_schema(exclude=True)
@api_view(["GET"])
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

    response = HttpResponse(tile_bytes, content_type=content_type)
    response["Cache-Control"] = "public, max-age=2592000"
    response["X-Map-Tile-Source"] = source_status
    return response


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def map_region_download_view(request, region_code: str) -> HttpResponse:
    """
    Streams the regional MBTiles store with full HTTP 206 Partial Content (Range) support.
    Enables mobile offline sync and browser PMTiles clients to download byte slices.
    """
    _init_mbtiles_db()
    if not MBTILES_PATH.exists() or MBTILES_PATH.stat().st_size == 0:
        seed_region_tiles(region_code=region_code, max_tiles=5, fetch_remote=False)

    total_size = MBTILES_PATH.stat().st_size
    range_header = request.META.get("HTTP_RANGE", "").strip()

    if range_header.startswith("bytes="):
        range_val = range_header[6:].strip()
        if "-" in range_val:
            start_s, end_s = range_val.split("-", 1)
            start_s = start_s.strip()
            end_s = end_s.strip()
            if start_s and end_s:
                start = int(start_s)
                end = int(end_s)
            elif start_s:
                start = int(start_s)
                end = total_size - 1
            elif end_s:
                suffix = int(end_s)
                start = max(0, total_size - suffix)
                end = total_size - 1
            else:
                start = 0
                end = total_size - 1
        else:
            start = 0
            end = total_size - 1

        if start < 0:
            start = 0
        if end >= total_size:
            end = total_size - 1

        if start > end or start >= total_size:
            resp = HttpResponse(status=416)
            resp["Content-Range"] = f"bytes */{total_size}"
            resp["Accept-Ranges"] = "bytes"
            return resp

        length = end - start + 1
        with open(MBTILES_PATH, "rb") as f:
            f.seek(start)
            chunk = f.read(length)

        resp = HttpResponse(chunk, status=206, content_type="application/vnd.sqlite3")
        resp["Content-Range"] = f"bytes {start}-{end}/{total_size}"
        resp["Content-Length"] = str(len(chunk))
        resp["Accept-Ranges"] = "bytes"
        resp["Content-Disposition"] = f'attachment; filename="{region_code}.mbtiles"'
        return resp

    # Full file stream
    with open(MBTILES_PATH, "rb") as f:
        full_content = f.read()

    resp = HttpResponse(full_content, status=200, content_type="application/vnd.sqlite3")
    resp["Content-Length"] = str(total_size)
    resp["Accept-Ranges"] = "bytes"
    resp["Content-Disposition"] = f'attachment; filename="{region_code}.mbtiles"'
    return resp


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
