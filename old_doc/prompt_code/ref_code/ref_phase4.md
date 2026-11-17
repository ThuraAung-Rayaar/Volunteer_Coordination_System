# Phase 4 — Identity Verification & Coordinator Lifecycle

## Inspection Summary

Before writing code, I confirmed the following against the uploaded schema (`updated_volunteer_coordination_system_Database.sql`) and models:

**SQL objects this phase depends on:**

| Object | Type | Role |
|---|---|---|
| `recompute_user_verification(p_user)` | Function | Derives `users.verification_status` from current images |
| `is_admin_user(p_user)` | Function | Admin authorization check |
| `is_approved_coordinator(p_user)` | Function | Coordinator authorization check |
| `trg_01_vimg_guard` | Trigger | Forces `pending` on insert; makes uploads immutable; restricts review to admins; blocks re-review |
| `trg_50_vimg_after` | Trigger | Auto-recomputes `users.verification_status` after any image change |
| `trg_01_coordinator_guard` | Trigger | Enforces coordinator status state machine + approval prerequisites |
| `ck_verification_*` | Constraints | Image type/format/path/sha256/status/comparison/score/review/no-self-review |
| `ck_coordinator_*` | Constraints | Status enum, approval requirements, no-self-approval |

**Verified state machines:**
- Verification image: `pending → approved | rejected` (terminal after review)
- Coordinator: `pending → approved | revoked`; `approved → suspended | revoked`; `suspended → approved | revoked`; `revoked` is terminal

**Confirmed models:** `UserVerificationImages`, `CoordinatorProfiles` (PK = `user_id`), `Users` — all `managed=False`.

**Gap found:** `VERIFICATION_MEDIA_ROOT` is not defined in the uploaded `base.py`. I add it below.

---

## 1. Settings Addition — `backend/config/settings/base.py`

Add near the media/static section:

```python
# Private verification image storage (NOT served by /media/)
VERIFICATION_MEDIA_ROOT = BASE_DIR / "private_media" / "verification_images"

# Verification upload limits (overridable in tests via override_settings)
VERIFICATION_MAX_UPLOAD_BYTES = 5 * 1024 * 1024   # 5 MB
VERIFICATION_MIN_DIMENSION = 200                  # px
VERIFICATION_MAX_DIMENSION = 6000                 # px
```

---

## 2. `backend/services/verification_service.py` (new file)

```python
"""
services/verification_service.py

Identity verification: secure JPEG upload, admin review, and status recomputation.

Database-first rules honoured here:
- Verification status is NEVER computed in Python. It is recomputed by the
  PostgreSQL function recompute_user_verification(), invoked automatically by
  trigger trg_50_vimg_after whenever an image row changes.
- Upload immutability, pending-on-insert, and admin-only review are enforced
  by trigger trg_01_vimg_guard and the ck_verification_* constraints.
- Images are stored outside public MEDIA_ROOT in VERIFICATION_MEDIA_ROOT and
  are only served through an admin-gated streaming view.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from django.conf import settings
from django.db import connection
from django.utils import timezone

from apps.accounts.models import UserVerificationImages, Users
from common.exceptions import (
    DomainError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
)
from common.utils import sanitize_and_save_verification_jpeg

logger = logging.getLogger(__name__)

# Must match ck_verification_image_type
ALLOWED_IMAGE_TYPES = ("mock_selfie", "id_license", "driver_license")

# Must match ck_verification_status (reviewer decisions)
REVIEW_DECISIONS = ("approved", "rejected")

# Must match ck_verification_comparison_status
COMPARISON_STATES = ("pending", "match", "no_match", "needs_review")


# --- Dynamic limit readers (so override_settings works in tests) ------------

def _max_upload_bytes() -> int:
    return getattr(settings, "VERIFICATION_MAX_UPLOAD_BYTES", 5 * 1024 * 1024)


def _min_dimension() -> int:
    return getattr(settings, "VERIFICATION_MIN_DIMENSION", 200)


def _max_dimension() -> int:
    return getattr(settings, "VERIFICATION_MAX_DIMENSION", 6000)


def _validation_error(message: str, code: str = "invalid_image") -> DomainError:
    return DomainError(message=message, code=code, status_code=400)


def _require_admin(actor: Users) -> None:
    """Mirror of SQL is_admin_user(): active admin only."""
    if not (actor and getattr(actor, "is_authenticated", False)
            and actor.is_admin and actor.is_active):
        raise PermissionDeniedError(
            message="Only administrators can perform this action.",
            code="permission_denied",
        )


# --- Upload -----------------------------------------------------------------

def _validate_image_dimensions(uploaded_file) -> None:
    """Reject non-image files and images outside the allowed resolution range."""
    from PIL import Image, UnidentifiedImageError

    try:
        uploaded_file.seek(0)
        with Image.open(uploaded_file) as img:
            img.verify()
        uploaded_file.seek(0)
        with Image.open(uploaded_file) as img:
            width, height = img.size
    except (UnidentifiedImageError, OSError, Exception) as exc:
        raise _validation_error(f"File is not a valid image: {exc}", code="invalid_image")
    finally:
        uploaded_file.seek(0)

    min_dim, max_dim = _min_dimension(), _max_dimension()
    if width < min_dim or height < min_dim:
        raise _validation_error(
            "Image resolution is too low for identity verification.",
            code="image_too_small",
        )
    if width > max_dim or height > max_dim:
        raise _validation_error(
            "Image resolution is too high.",
            code="image_too_large",
        )


def upload_verification_image(
    user: Users, image_type: str, uploaded_file
) -> UserVerificationImages:
    """
    Validate, sanitize, and store a verification image, then insert the DB row.

    The DB trigger trg_01_vimg_guard forces status='pending', clears reviewer
    fields, and deactivates any previous current image of the same type.
    trg_50_vimg_after then recomputes users.verification_status.
    """
    if image_type not in ALLOWED_IMAGE_TYPES:
        raise _validation_error(
            f"Unsupported image type '{image_type}'.", code="invalid_image_type"
        )

    # File-size guard
    size = getattr(uploaded_file, "size", None)
    if size is None:
        uploaded_file.seek(0, 2)
        size = uploaded_file.tell()
        uploaded_file.seek(0)
    if size == 0:
        raise _validation_error("Uploaded image is empty.", code="image_empty")
    if size > _max_upload_bytes():
        raise _validation_error(
            "Uploaded image exceeds the maximum allowed size.", code="image_too_large"
        )

    # Real-format + dimension validation
    _validate_image_dimensions(uploaded_file)

    # Sanitize (EXIF strip, RGB, JPEG re-encode, SHA-256) and save privately.
    # Never log the image contents.
    user_code = str(getattr(user, "uuid", None) or user.id)
    try:
        rel_path, sha256_hex = sanitize_and_save_verification_jpeg(
            user_code, image_type, uploaded_file
        )
    except ValueError as exc:
        raise _validation_error(f"Invalid image file: {exc}", code="invalid_image")

    image = UserVerificationImages.objects.create(
        user=user,
        image_type=image_type,
        image_path=rel_path,
        file_format="jpeg",
        file_sha256=sha256_hex,
        is_current=True,
    )
    image.refresh_from_db()

    logger.info(
        "Verification image uploaded",
        extra={"user_id": user.id, "image_type": image_type, "image_id": image.id},
    )
    return image


# --- Read (self) ------------------------------------------------------------

def get_user_verification_images(user: Users) -> list[dict]:
    """Metadata only. Never returns image_path or file contents."""
    return list(
        UserVerificationImages.objects.filter(user=user)
        .order_by("-created_at")
        .values(
            "id", "image_type", "status", "comparison_status",
            "is_current", "reviewed_at", "created_at",
        )
    )


def get_verification_status(user: Users) -> dict:
    user.refresh_from_db(fields=["verification_status"])
    return {
        "verification_status": user.verification_status,
        "images": get_user_verification_images(user),
    }


# --- Recompute (delegates to SQL) ------------------------------------------

def recompute_verification(user_id: int) -> str:
    """
    Explicitly invoke the DB function. Normally trg_50_vimg_after does this
    automatically; this is provided for admin-driven reconciliation.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT recompute_user_verification(%s)", [user_id])
    user = Users.objects.filter(id=user_id).only("verification_status").first()
    return user.verification_status if user else "none"


# --- Admin review -----------------------------------------------------------

def review_verification_image(
    actor: Users,
    image_id: int,
    decision: str,
    note: str = "",
    comparison_status: Optional[str] = None,
    comparison_score: Optional[float] = None,
) -> UserVerificationImages:
    """
    Admin approves or rejects a pending verification image.

    Guards (service-level, mirrored by DB):
      - actor must be an active admin
      - actor cannot review their own image (ck_verification_no_self_review)
      - image must still be 'pending' (trigger raises invalid_transition otherwise)
    """
    _require_admin(actor)

    if decision not in REVIEW_DECISIONS:
        raise _validation_error(
            f"Invalid review decision '{decision}'.", code="invalid_decision"
        )
    if comparison_status is not None and comparison_status not in COMPARISON_STATES:
        raise _validation_error("Invalid comparison status.", code="invalid_comparison_status")
    if comparison_score is not None and not (0 <= comparison_score <= 1):
        raise _validation_error(
            "Comparison score must be between 0 and 1.", code="invalid_score"
        )

    image = UserVerificationImages.objects.filter(id=image_id).first()
    if image is None:
        raise ResourceMaskedNotFound(message="Verification image not found.")

    if image.user_id == actor.id:
        raise PermissionDeniedError(
            message="You cannot review your own verification image.",
            code="no_self_review",
        )

    if image.status != "pending":
        raise DomainError(
            message="This image has already been reviewed.",
            code="invalid_transition",
            status_code=400,
        )

    update_fields = {
        "status": decision,
        "reviewed_by_id": actor.id,
        "reviewed_at": timezone.now(),
    }
    if note:
        update_fields["note"] = note
    if comparison_status is not None:
        update_fields["comparison_status"] = comparison_status
    if comparison_score is not None:
        update_fields["comparison_score"] = comparison_score

    # queryset.update() fires the DB triggers (guard + recompute)
    UserVerificationImages.objects.filter(id=image_id).update(**update_fields)
    image.refresh_from_db()

    logger.info(
        "Verification image reviewed",
        extra={"image_id": image_id, "decision": decision, "reviewer_id": actor.id},
    )
    return image


def get_pending_images_for_admin(actor: Users) -> list[dict]:
    """List current pending images for the admin review queue."""
    _require_admin(actor)
    return list(
        UserVerificationImages.objects.filter(status="pending", is_current=True)
        .order_by("created_at")
        .values(
            "id", "user_id", "image_type", "status", "comparison_status",
            "is_current", "created_at",
        )
    )


# --- Private file resolution (for the admin streaming view) ----------------

def resolve_private_image_path(image: UserVerificationImages) -> Path:
    """
    Resolve the on-disk path safely, preventing path traversal outside
    VERIFICATION_MEDIA_ROOT.
    """
    root = Path(settings.VERIFICATION_MEDIA_ROOT).resolve()
    target = (root / image.image_path).resolve()
    if root not in target.parents and target != root:
        raise PermissionDeniedError(message="Invalid image path.", code="invalid_path")
    if not target.exists():
        raise ResourceMaskedNotFound(message="Image file not found.")
    return target
```

---

## 3. `backend/services/coordinator_service.py` (new file)

```python
"""
services/coordinator_service.py

Coordinator application and lifecycle management.

Database-first rules honoured here:
- The coordinator status state machine is enforced by trg_01_coordinator_guard.
  This service orchestrates and performs request-level authorization only.
- Approval prerequisites (admin approver + verified active user) are enforced
  by the trigger and ck_coordinator_approval / ck_coordinator_no_self_approval.
- Authorization uses the SQL helpers is_admin_user / is_approved_coordinator.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import connection

from apps.accounts.models import Users
from apps.coordination.models import CoordinatorProfiles
from common.exceptions import (
    DomainError,
    PermissionDeniedError,
    ResourceMaskedNotFound,
)

logger = logging.getLogger(__name__)

# Must match ck_coordinator_status
COORDINATOR_STATES = ("pending", "approved", "suspended", "revoked")

# Admin-driven decisions (transitions validated by the trigger)
ALLOWED_DECISIONS = ("approved", "suspended", "revoked")


def _require_admin(actor: Users) -> None:
    """Mirror of SQL is_admin_user(): active admin only."""
    if not (actor and getattr(actor, "is_authenticated", False)
            and actor.is_admin and actor.is_active):
        raise PermissionDeniedError(
            message="Only administrators can manage coordinators.",
            code="permission_denied",
        )


# --- Authorization helpers (delegate to SQL) --------------------------------

def is_approved_coordinator(user: Users) -> bool:
    """Delegates to the PostgreSQL is_approved_coordinator() function."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    with connection.cursor() as cursor:
        cursor.execute("SELECT is_approved_coordinator(%s)", [user.id])
        row = cursor.fetchone()
    return bool(row and row[0])


# --- Volunteer-facing operations -------------------------------------------

def apply_for_coordinator(user: Users, notes: str = "") -> CoordinatorProfiles:
    """
    Create a pending coordinator application.

    Business rule W34: only verified users may apply. The DB re-checks the
    verified + active requirement at approval time via the trigger.
    """
    if user.verification_status != "verified":
        raise DomainError(
            message="Identity verification must be approved before applying as a coordinator.",
            code="not_verified",
            status_code=400,
        )

    existing = CoordinatorProfiles.objects.filter(user_id=user.id).first()
    if existing is not None:
        if existing.status == "pending":
            if notes:
                existing.notes = notes
                existing.save(update_fields=["notes"])
            return existing
        raise DomainError(
            message="A coordinator application already exists for this account.",
            code="duplicate_application",
            status_code=409,
        )

    # Trigger forces status='pending' on insert
    profile = CoordinatorProfiles.objects.create(
        user_id=user.id, status="pending", notes=notes
    )
    logger.info("Coordinator application created", extra={"user_id": user.id})
    return profile


def get_coordinator_profile(user: Users) -> Optional[dict]:
    profile = CoordinatorProfiles.objects.filter(user_id=user.id).first()
    if profile is None:
        return None
    return {
        "user_id": profile.user_id,
        "status": profile.status,
        "approved_by_id": profile.approved_by_id,
        "approved_at": profile.approved_at,
        "notes": profile.notes,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


def update_coordinator_application(user: Users, notes: str) -> CoordinatorProfiles:
    """A user may edit notes only while their application is still pending."""
    profile = CoordinatorProfiles.objects.filter(user_id=user.id).first()
    if profile is None:
        raise ResourceMaskedNotFound(message="No coordinator application found.")
    if profile.status != "pending":
        raise DomainError(
            message="Only pending applications can be updated.",
            code="invalid_state",
            status_code=400,
        )
    profile.notes = notes
    profile.save(update_fields=["notes"])
    return profile


# --- Admin lifecycle operations --------------------------------------------

def get_pending_coordinator_applications(actor: Users) -> list[dict]:
    _require_admin(actor)
    return list(
        CoordinatorProfiles.objects.filter(status="pending")
        .select_related("user")
        .order_by("created_at")
        .values(
            "user_id", "user__display_name", "user__verification_status",
            "notes", "created_at",
        )
    )


def decide_coordinator_profile(
    actor: Users,
    target_user_id: int,
    new_status: str,
    notes: str = "",
) -> CoordinatorProfiles:
    """
    Admin approves, suspends, or revokes a coordinator profile.

    Guards (service-level, mirrored by DB):
      - actor must be an active admin
      - actor cannot change their own coordinator status
      - target profile must exist
      - the transition itself is validated by trg_01_coordinator_guard
    """
    _require_admin(actor)

    if new_status not in ALLOWED_DECISIONS:
        raise DomainError(
            message=f"Invalid coordinator decision '{new_status}'.",
            code="invalid_decision",
            status_code=400,
        )

    if target_user_id == actor.id:
        raise PermissionDeniedError(
            message="You cannot change your own coordinator status.",
            code="no_self_approval",
        )

    profile = CoordinatorProfiles.objects.filter(user_id=target_user_id).first()
    if profile is None:
        raise ResourceMaskedNotFound(message="Coordinator profile not found.")

    update_fields = {"status": new_status}
    if new_status == "approved":
        # approved_at is set by the trigger; approved_by identifies the approver
        update_fields["approved_by_id"] = actor.id
    if notes:
        update_fields["notes"] = notes

    # queryset.update() fires trg_01_coordinator_guard which validates the
    # transition and the verified+active approval prerequisites
    CoordinatorProfiles.objects.filter(user_id=target_user_id).update(**update_fields)
    profile.refresh_from_db()

    logger.info(
        "Coordinator status changed",
        extra={
            "target_user_id": target_user_id,
            "new_status": new_status,
            "admin_id": actor.id,
        },
    )
    return profile


def approve_coordinator(actor: Users, target_user_id: int, notes: str = "") -> CoordinatorProfiles:
    return decide_coordinator_profile(actor, target_user_id, "approved", notes)


def suspend_coordinator(actor: Users, target_user_id: int, notes: str = "") -> CoordinatorProfiles:
    return decide_coordinator_profile(actor, target_user_id, "suspended", notes)


def revoke_coordinator(actor: Users, target_user_id: int, notes: str = "") -> CoordinatorProfiles:
    return decide_coordinator_profile(actor, target_user_id, "revoked", notes)
```

---

## 4. BFF Endpoints (user-facing) — `backend/bff/volunteer/`

### `serializers.py` additions

```python
from rest_framework import serializers

from apps.accounts.models import UserVerificationImages
from apps.coordination.models import CoordinatorProfiles


class VerificationImageUploadSerializer(serializers.Serializer):
    image_type = serializers.ChoiceField(
        choices=["mock_selfie", "id_license", "driver_license"]
    )
    image = serializers.ImageField()


class VerificationImageSerializer(serializers.ModelSerializer):
    """Read-only metadata. image_path is intentionally excluded."""
    class Meta:
        model = UserVerificationImages
        fields = [
            "id", "image_type", "status", "comparison_status",
            "is_current", "reviewed_at", "created_at",
        ]
        read_only_fields = fields


class CoordinatorProfileSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(read_only=True)
    status = serializers.CharField(read_only=True)
    approved_by_id = serializers.IntegerField(read_only=True, allow_null=True)
    approved_at = serializers.DateTimeField(read_only=True, allow_null=True)
    notes = serializers.CharField(read_only=True, allow_null=True, allow_blank=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class CoordinatorApplySerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")
```

### `views.py` additions

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import coordinator_service, verification_service

from .serializers import (
    CoordinatorApplySerializer,
    CoordinatorProfileSerializer,
    VerificationImageSerializer,
    VerificationImageUploadSerializer,
)


class MeVerificationImagesView(APIView):
    """GET /api/v1/me/verification-images/ and POST upload."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = verification_service.get_verification_status(request.user)
        return Response(data)

    def post(self, request):
        serializer = VerificationImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = verification_service.upload_verification_image(
            request.user,
            serializer.validated_data["image_type"],
            request.FILES["image"],
        )
        return Response(
            VerificationImageSerializer(image).data,
            status=status.HTTP_201_CREATED,
        )


class MeCoordinatorView(APIView):
    """GET / POST / PATCH /api/v1/me/coordinator/."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = coordinator_service.get_coordinator_profile(request.user)
        if profile is None:
            return Response({"coordinator": None})
        return Response({"coordinator": CoordinatorProfileSerializer(profile).data})

    def post(self, request):
        serializer = CoordinatorApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        coordinator_service.apply_for_coordinator(
            request.user, serializer.validated_data.get("notes", "")
        )
        profile = coordinator_service.get_coordinator_profile(request.user)
        return Response(
            {"coordinator": CoordinatorProfileSerializer(profile).data},
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request):
        serializer = CoordinatorApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        coordinator_service.update_coordinator_application(
            request.user, serializer.validated_data.get("notes", "")
        )
        profile = coordinator_service.get_coordinator_profile(request.user)
        return Response({"coordinator": CoordinatorProfileSerializer(profile).data})
```

### `urls.py` additions

```python
path("me/verification-images/", MeVerificationImagesView.as_view(), name="me-verification-images"),
path("me/coordinator/", MeCoordinatorView.as_view(), name="me-coordinator"),
```

---

## 5. Admin Portal Endpoints — `backend/admin_portal/`

### `serializers.py` (new)

```python
from rest_framework import serializers

from apps.accounts.models import UserVerificationImages


class ReviewImageSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approved", "rejected"])
    note = serializers.CharField(required=False, allow_blank=True, default="")
    comparison_status = serializers.ChoiceField(
        choices=["pending", "match", "no_match", "needs_review"],
        required=False, allow_null=True,
    )
    comparison_score = serializers.FloatField(
        required=False, allow_null=True, min_value=0, max_value=1
    )


class AdminVerificationImageSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user_id", read_only=True)
    reviewed_by_id = serializers.IntegerField(source="reviewed_by_id", read_only=True)

    class Meta:
        model = UserVerificationImages
        fields = [
            "id", "user_id", "image_type", "status", "comparison_status",
            "comparison_score", "is_current", "reviewed_by_id", "reviewed_at",
            "note", "created_at",
        ]
        read_only_fields = fields
```

### `views.py` additions

```python
from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import UserVerificationImages
from common.exceptions import DomainError, ResourceMaskedNotFound, log_security_event
from common.permissions import ensure_admin
from services import coordinator_service, verification_service

from .serializers import AdminVerificationImageSerializer, ReviewImageSerializer


class AdminPendingVerificationImagesView(APIView):
    """GET /api/v1/admin/verification-images/ — pending review queue."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_admin(request)
        rows = verification_service.get_pending_images_for_admin(request.user)
        return Response({"results": rows})


class AdminVerificationImageFileView(APIView):
    """GET /api/v1/admin/verification-images/{id}/file/ — private stream."""
    permission_classes = [IsAuthenticated]

    def get(self, request, image_id):
        ensure_admin(request)  # raises masked 404 for non-admins
        image = UserVerificationImages.objects.filter(id=image_id).first()
        if image is None:
            raise ResourceMaskedNotFound()
        log_security_event(
            request,
            action="security.warning.admin_image_view",
            entity_type="user_verification_images",
            entity_id=image.id,
        )
        path = verification_service.resolve_private_image_path(image)
        return FileResponse(open(path, "rb"), content_type="image/jpeg")


class AdminReviewVerificationImageView(APIView):
    """POST /api/v1/admin/verification-images/{id}/review/."""
    permission_classes = [IsAuthenticated]

    def post(self, request, image_id):
        ensure_admin(request)
        serializer = ReviewImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        image = verification_service.review_verification_image(
            actor=request.user,
            image_id=image_id,
            decision=serializer.validated_data["decision"],
            note=serializer.validated_data.get("note", ""),
            comparison_status=serializer.validated_data.get("comparison_status"),
            comparison_score=serializer.validated_data.get("comparison_score"),
        )
        return Response(AdminVerificationImageSerializer(image).data)


class AdminPendingCoordinatorsView(APIView):
    """GET /api/v1/admin/coordinators/ — pending coordinator applications."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_admin(request)
        rows = coordinator_service.get_pending_coordinator_applications(request.user)
        return Response({"results": rows})


class AdminCoordinatorDecisionView(APIView):
    """POST /api/v1/admin/coordinators/{user_id}/{action}/ where action is
    approve | suspend | revoke."""
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id, action):
        ensure_admin(request)
        notes = request.data.get("notes", "")
        if action == "approve":
            profile = coordinator_service.approve_coordinator(request.user, user_id, notes)
        elif action == "suspend":
            profile = coordinator_service.suspend_coordinator(request.user, user_id, notes)
        elif action == "revoke":
            profile = coordinator_service.revoke_coordinator(request.user, user_id, notes)
        else:
            raise DomainError(
                message="Invalid coordinator action.", code="invalid_decision", status_code=400
            )
        return Response({
            "user_id": profile.user_id,
            "status": profile.status,
            "approved_by_id": profile.approved_by_id,
            "approved_at": profile.approved_at,
        })
```

### `urls.py` additions

```python
path("api/v1/admin/verification-images/", AdminPendingVerificationImagesView.as_view(), name="admin-verification-images"),
path("api/v1/admin/verification-images/<int:image_id>/file/", AdminVerificationImageFileView.as_view(), name="admin-verification-image-file"),
path("api/v1/admin/verification-images/<int:image_id>/review/", AdminReviewVerificationImageView.as_view(), name="admin-verification-image-review"),
path("api/v1/admin/coordinators/", AdminPendingCoordinatorsView.as_view(), name="admin-coordinators"),
path("api/v1/admin/coordinators/<int:user_id>/<str:action>/", AdminCoordinatorDecisionView.as_view(), name="admin-coordinator-decision"),
```

---

## 6. Tests — `backend/apps/accounts/tests/test_phase4.py`

```python
import io
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import UserVerificationImages, Users
from apps.coordination.models import CoordinatorProfiles
from common.exceptions import DomainError, PermissionDeniedError
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import coordinator_service, verification_service

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(name="User", is_admin=False, verified=False):
    phone = normalize_phone(_phone())
    return Users.objects.create(
        phone_hash=compute_phone_hash(phone),
        phone_enc=encrypt_phone(phone),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
    )


def _jpeg_bytes(size=(400, 400)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, color=(200, 120, 40)).save(buf, format="JPEG")
    return buf.getvalue()


def _upload(name="img.jpg", data=None, content_type="image/jpeg"):
    data = data if data is not None else _jpeg_bytes()
    return SimpleUploadedFile(name, data, content_type=content_type)


class VerificationImageTestBase(TestCase):
    def setUp(self):
        self.user = _make_user(name="Volunteer")
        self.admin = _make_user(name="Admin", is_admin=True)
        self._tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tempdir.cleanup)
        self.media_root = self._tempdir.name


class UploadTests(VerificationImageTestBase):
    def test_valid_jpeg_upload(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        self.assertEqual(image.status, "pending")
        self.assertTrue(image.is_current)
        self.assertEqual(image.image_type, "mock_selfie")
        self.assertIsNotNone(image.file_sha256)
        self.assertEqual(len(image.file_sha256), 64)

    def test_invalid_image_format_rejected(self):
        garbage = SimpleUploadedFile("file.jpg", b"not-an-image", content_type="image/jpeg")
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(DomainError):
                verification_service.upload_verification_image(
                    self.user, "mock_selfie", garbage
                )

    def test_oversized_image_rejected(self):
        with self.settings(
            VERIFICATION_MEDIA_ROOT=self.media_root,
            VERIFICATION_MAX_UPLOAD_BYTES=10,
        ):
            with self.assertRaises(DomainError):
                verification_service.upload_verification_image(
                    self.user, "mock_selfie", _upload()
                )

    def test_invalid_image_type_rejected(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            with self.assertRaises(DomainError):
                verification_service.upload_verification_image(
                    self.user, "passport", _upload()
                )


class VerificationStatusTests(VerificationImageTestBase):
    def _approve_both(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            selfie = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload())
            id_img = verification_service.upload_verification_image(
                self.user, "id_license", _upload())
        verification_service.review_verification_image(self.admin, selfie.id, "approved")
        verification_service.review_verification_image(self.admin, id_img.id, "approved")

    def test_status_retrieval(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            verification_service.upload_verification_image(self.user, "mock_selfie", _upload())
        data = verification_service.get_verification_status(self.user)
        self.assertEqual(data["verification_status"], "pending")
        self.assertEqual(len(data["images"]), 1)

    def test_recalculation_to_verified(self):
        self._approve_both()
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "verified")

    def test_valid_reviewer_decision(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload())
        reviewed = verification_service.review_verification_image(
            self.admin, image.id, "approved", note="looks good")
        self.assertEqual(reviewed.status, "approved")
        self.assertEqual(reviewed.reviewed_by_id, self.admin.id)
        self.assertIsNotNone(reviewed.reviewed_at)

    def test_invalid_transition_review_twice(self):
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload())
        verification_service.review_verification_image(self.admin, image.id, "approved")
        with self.assertRaises(DomainError):
            verification_service.review_verification_image(self.admin, image.id, "rejected")

    def test_self_review_rejected(self):
        # user uploads, then tries to review their own image as an admin-themself
        admin_self = _make_user(name="SelfAdmin", is_admin=True)
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                admin_self, "mock_selfie", _upload())
        with self.assertRaises(PermissionDeniedError):
            verification_service.review_verification_image(admin_self, image.id, "approved")

    def test_unauthorized_image_retrieval(self):
        client = APIClient()
        client.force_authenticate(user=self.user)  # non-admin
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            image = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload())
        resp = client.get(f"/api/v1/admin/verification-images/{image.id}/file/")
        self.assertIn(resp.status_code, (403, 404))


class CoordinatorLifecycleTests(TestCase):
    def setUp(self):
        self.admin = _make_user(name="Admin", is_admin=True)
        self.verified_user = _make_user(name="Verified", verified=True)
        self.unverified_user = _make_user(name="Unverified", verified=False)

    def test_unverified_cannot_apply(self):
        with self.assertRaises(DomainError):
            coordinator_service.apply_for_coordinator(self.unverified_user)

    def test_coordinator_application(self):
        profile = coordinator_service.apply_for_coordinator(self.verified_user, "keen to help")
        self.assertEqual(profile.status, "pending")
        self.assertEqual(profile.user_id, self.verified_user.id)

    def test_coordinator_approval(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        profile = coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(profile.status, "approved")
        self.assertEqual(profile.approved_by_id, self.admin.id)
        self.assertIsNotNone(profile.approved_at)

    def test_coordinator_suspension(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        profile = coordinator_service.suspend_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(profile.status, "suspended")

    def test_coordinator_revocation(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        profile = coordinator_service.revoke_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(profile.status, "revoked")

    def test_non_admin_approval_rejected(self):
        coordinator_service.apply_for_coordinator(self.verified_user)
        other = _make_user(name="Other")
        with self.assertRaises(PermissionDeniedError):
            coordinator_service.approve_coordinator(other, self.verified_user.id)

    def test_unapproved_coordinator_permission_denied(self):
        # No profile at all
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))
        # Pending profile is still not approved
        coordinator_service.apply_for_coordinator(self.verified_user)
        self.assertFalse(coordinator_service.is_approved_coordinator(self.verified_user))
```

---

## 7. Commands

```powershell
cd backend
python manage.py test apps.accounts.tests.test_phase4 --noinput
python manage.py test apps --noinput
```

---

## 8. Completion Report

| Acceptance Criterion | Status | Evidence |
|---|---|---|
| Verification services use actual SQL fields | ✅ | `UserVerificationImages` columns map 1:1 to `user_verification_images` |
| Image storage is secure | ✅ | Stored in `VERIFICATION_MEDIA_ROOT` (outside `/media/`), served only via admin-gated stream, path-traversal guarded |
| Verification calc uses DB function | ✅ | `recompute_verification()` calls `recompute_user_verification()`; status changes rely on `trg_50_vimg_after` |
| Coordinator lifecycle respects SQL states | ✅ | Only `pending/approved/suspended/revoked` used; transitions validated by `trg_01_coordinator_guard` |
| Administrative authorization works | ✅ | `_require_admin` + `ensure_admin`; non-admins get `PermissionDeniedError` / masked 404 |
| No image contents in logs | ✅ | Only IDs, types, and decisions are logged |
| Tests pass | ⏳ | Run the commands above |

**Test coverage vs. your 14 requirements:**
1. Valid JPEG upload ✅ 2. Invalid format ✅ 3. Oversized ✅ 4. Unauthorized retrieval ✅ 5. Status retrieval ✅ 6. Recalculation ✅ 7. Valid reviewer decision ✅ 8. Invalid transition ✅ 9. Coordinator application ✅ 10. Approval ✅ 11. Suspension ✅ 12. Revocation ✅ 13. Non-admin approval ✅ 14. Unapproved coordinator denial ✅

**Files created:** `services/verification_service.py`, `services/coordinator_service.py`, `admin_portal/serializers.py`, `apps/accounts/tests/test_phase4.py`
**Files modified:** `config/settings/base.py`, `bff/volunteer/serializers.py`, `bff/volunteer/views.py`, `bff/volunteer/urls.py`, `admin_portal/views.py`, `admin_portal/urls.py`

Phase 4 is complete. Awaiting your approval before Phase 5.