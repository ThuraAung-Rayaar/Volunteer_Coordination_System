"""
OpenAPI Schema customization for drf-spectacular.

Provides a clean AutoSchema and preprocessing hook to ensure strict
OpenAPI schema generation with 0 warnings and 0 errors under --fail-on-warn.
"""
from __future__ import annotations

from typing import Optional

from drf_spectacular.openapi import AutoSchema
from rest_framework import serializers
from rest_framework.views import APIView


class EmptyResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField(default=True, read_only=True)


class CleanAutoSchema(AutoSchema):
    """
    AutoSchema subclass that provides safe fallback serializers for plain APIViews
    and intelligent list vs retrieve operationId resolution to prevent collisions.
    """

    def _get_serializer(self):
        view = self.view
        if isinstance(view, APIView):
            if hasattr(view, "serializer_class") or callable(getattr(view, "get_serializer_class", None)) or callable(getattr(view, "get_serializer", None)):
                return super()._get_serializer()
            return EmptyResponseSerializer
        return super()._get_serializer()

    def _is_list_view(self, serializer: Optional[object] = None) -> bool:
        view_name = self.view.__class__.__name__.lower()
        if "list" in view_name and not self.path.rstrip("/").endswith("}"):
            return True
        return super()._is_list_view(serializer)


def clean_endpoints_hook(endpoints):
    """
    Spectacular preprocessing hook that:
    1. Focuses schema on official /api/v1/ endpoints (filtering redundant mobile/flat URL mounts).
    2. Removes duplicate /api/v1/volunteer/events mounts that collide with /api/v1/events.
    3. Removes unparameterized alias /api/v1/events/check-availability/ that collides with /api/v1/events/{event_id}/check-availability/.
    4. Deduplicates (path, method) pairs.
    """
    filtered = []
    seen = set()

    for path, path_regex, method, callback in endpoints:
        # Keep canonical /api/v1/ endpoints
        if not path.startswith("/api/v1/"):
            continue
        # Avoid duplicate /api/v1/volunteer/events when /api/v1/events already serves it
        if path.startswith("/api/v1/volunteer/events"):
            continue
        # Avoid unparameterized fallback alias that collides with parameterized endpoint
        if path == "/api/v1/events/check-availability/":
            continue
        key = (path, method)
        if key in seen:
            continue
        seen.add(key)
        filtered.append((path, path_regex, method, callback))

    return filtered
