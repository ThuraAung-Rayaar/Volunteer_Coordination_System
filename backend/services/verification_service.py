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
from django.db import connection, transaction
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


@transaction.atomic
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

@transaction.atomic
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


def get_pending_images_for_admin(
    actor: Users,
    status: Optional[str] = "pending",
    image_type: Optional[str] = None,
) -> list[dict]:
    """List verification images for the admin review queue with optional filtering."""
    _require_admin(actor)
    qs = UserVerificationImages.objects.filter(is_current=True)
    if status and status != "all":
        qs = qs.filter(status=status)
    if image_type:
        qs = qs.filter(image_type=image_type)
    return list(
        qs.order_by("created_at")
        .values(
            "id", "user_id", "image_type", "status", "comparison_status",
            "is_current", "created_at",
        )
    )


def list_pending_verifications() -> list[dict]:
    """Return pending verification images for the admin dashboard queue."""
    qs = UserVerificationImages.objects.filter(is_current=True, status="pending").select_related("user")
    return list(
        qs.order_by("created_at").values(
            "id", "user_id", "user__display_name", "image_type", "image_path",
            "status", "comparison_status", "is_current", "created_at",
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


# --- Method Aliases for Alternate Service Naming Conventions ----------------
list_verification_images_for_user = get_user_verification_images
list_admin_verification_queue = get_pending_images_for_admin
get_verification_image_for_streaming = resolve_private_image_path


