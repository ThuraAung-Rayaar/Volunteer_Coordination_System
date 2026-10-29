# apps/accounts/services.py
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.accounts.models import (
    AuthOtp,
    CoordinatorProfile,
    User,
    UserCharityInterest,
    UserVerificationImage,
)
from apps.audit.services import log_action
from apps.common.constants import (
    ACCOUNT_CLOSED,
    COORDINATOR_APPROVED,
    COORDINATOR_PENDING,
    COORDINATOR_REVOKED,
    COORDINATOR_SUSPENDED,
    IMAGE_DRIVER_LICENSE,
    IMAGE_ID_LICENSE,
    IMAGE_MOCK_SELFIE,
    OTP_MAX_ATTEMPTS,
    OTP_TTL_SECONDS,
    VERIFICATION_NONE,
    VERIFICATION_PENDING,
    VERIFICATION_REJECTED,
    VERIFICATION_VERIFIED,
)
from apps.common.exceptions import (
    AccountClosedError,
    DomainError,
    InvalidOtpError,
    TooManyAttemptsError,
    VerificationRequiredError,
)
from apps.common.permissions import ensure_active_account, ensure_admin
from apps.common.security import (
    compute_phone_hash,
    encrypt_phone,
    generate_otp_code,
    hash_otp,
    normalize_phone,
)
from apps.common.validators import validate_and_transcode_jpeg
from apps.events.models import CharityField


def request_otp(phone: str, purpose: str = "login") -> dict:
    raw_phone = normalize_phone(phone)
    phone_hash = compute_phone_hash(raw_phone)

    # Check if existing account is closed
    existing_user = User.objects.filter(phone_hash=phone_hash).first()
    if existing_user and existing_user.account_status == ACCOUNT_CLOSED:
        raise AccountClosedError()

    # Generate OTP code (or fixed dev code if configured)
    if settings.DEBUG and getattr(settings, "DEV_FIXED_OTP", None):
        code = str(settings.DEV_FIXED_OTP)
    else:
        code = generate_otp_code()

    code_hash = hash_otp(code)
    expires_at = timezone.now() + timedelta(seconds=OTP_TTL_SECONDS)

    AuthOtp.objects.create(
        phone_hash=phone_hash,
        code_hash=code_hash,
        purpose=purpose,
        expires_at=expires_at,
    )

    response = {"status": "sent"}
    # In DEBUG or test environments, expose code for easy testing/local dev
    if settings.DEBUG or getattr(settings, "TESTING", False):
        response["dev_code"] = code

    return response


def verify_otp(phone: str, code: str, purpose: str = "login") -> tuple[User, Token, bool]:
    raw_phone = normalize_phone(phone)
    phone_hash = compute_phone_hash(raw_phone)

    otp = (
        AuthOtp.objects.filter(
            phone_hash=phone_hash,
            purpose=purpose,
            consumed_at__isnull=True,
        )
        .order_by("-created_at")
        .first()
    )

    if not otp or otp.expires_at <= timezone.now():
        raise InvalidOtpError("Invalid or expired OTP.")

    if otp.attempt_count >= OTP_MAX_ATTEMPTS:
        raise TooManyAttemptsError("Too many attempts. Request a new OTP.")

    # Increment attempt count and save immediately
    otp.attempt_count += 1
    otp.save(update_fields=["attempt_count"])

    # Validate OTP hash
    is_valid = hash_otp(code) == otp.code_hash
    if not is_valid and settings.DEBUG and getattr(settings, "DEV_FIXED_OTP", None):
        is_valid = str(code) == str(settings.DEV_FIXED_OTP)

    if not is_valid:
        raise InvalidOtpError("Invalid OTP.")

    with transaction.atomic():
        # Mark consumed
        otp.consumed_at = timezone.now()
        otp.save(update_fields=["consumed_at"])

        # Get or create User
        created = False
        user = User.objects.filter(phone_hash=phone_hash).first()
        if not user:
            display_name = f"Volunteer {raw_phone[-4:]}" if len(raw_phone) >= 4 else "Volunteer"
            user = User.objects.create(
                phone_hash=phone_hash,
                phone_enc=encrypt_phone(raw_phone),
                display_name=display_name,
            )
            created = True

        # Validate account status (raises AccountClosedError or AccountBlockedError)
        ensure_active_account(user)

        # Issue or retrieve token
        token, _ = Token.objects.get_or_create(user=user)

        # Log login action
        log_action(actor=user, action="login", entity_type="user", entity_id=user.id)

    return (user, token, created)


def issue_token_for_user(user: User) -> Token:
    ensure_active_account(user)
    token, _ = Token.objects.get_or_create(user=user)
    return token


def update_profile(user: User, data: dict) -> User:
    """
    Update volunteer profile.
    Disallows updating is_admin, account_status, verification_status directly.
    """
    forbidden_fields = {"is_admin", "account_status", "verification_status", "blocked_until", "id", "phone_hash", "phone_enc"}
    attempted_forbidden = forbidden_fields.intersection(data.keys())
    if attempted_forbidden:
        raise DomainError(
            f"Cannot update restricted field(s): {', '.join(sorted(attempted_forbidden))}",
            code="field_not_allowed",
        )

    clean_data = dict(data)
    with transaction.atomic():
        if "emergency_contact_phone" in clean_data:
            raw_contact_phone = clean_data.pop("emergency_contact_phone")
            if raw_contact_phone:
                clean_data["emergency_contact_phone_enc"] = encrypt_phone(normalize_phone(raw_contact_phone))
            else:
                clean_data["emergency_contact_phone_enc"] = None

        for field, value in clean_data.items():
            if hasattr(user, field):
                setattr(user, field, value)

        user.clean()
        user.save()

        log_action(
            actor=user,
            action="profile_update",
            entity_type="user",
            entity_id=user.id,
            after_data={k: v for k, v in clean_data.items() if not k.endswith("_enc")},
        )

    return user


def set_charity_interests(user: User, codes: list[str]) -> None:
    """
    Atomically replace UserCharityInterest records for user.
    """
    with transaction.atomic():
        valid_fields = list(CharityField.objects.filter(code__in=codes, active=True))
        UserCharityInterest.objects.filter(user=user).delete()
        UserCharityInterest.objects.bulk_create(
            [UserCharityInterest(user=user, field_code=field) for field in valid_fields]
        )
        log_action(
            actor=user,
            action="set_charity_interests",
            entity_type="user",
            entity_id=user.id,
            after_data={"codes": codes},
        )


def add_verification_image(user: User, image_type: str, uploaded_file) -> UserVerificationImage:
    """
    Validate and transcode uploaded image to JPEG.
    Deactivates previous images of the same image_type.
    Creates new UserVerificationImage and recomputes user verification status.
    """
    valid_types = {IMAGE_MOCK_SELFIE, IMAGE_ID_LICENSE, IMAGE_DRIVER_LICENSE}
    if image_type not in valid_types:
        raise DomainError(f"Invalid image type: {image_type}", code="invalid_image_type")

    dest_dir = Path(settings.MEDIA_ROOT) / "verification_images"
    rel_path, sha256_hex = validate_and_transcode_jpeg(uploaded_file, dest_dir)

    with transaction.atomic():
        # Deactivate old current images of the same image_type
        UserVerificationImage.objects.filter(
            user=user,
            image_type=image_type,
            is_current=True,
        ).update(is_current=False)

        new_image = UserVerificationImage.objects.create(
            user=user,
            image_type=image_type,
            image_path=rel_path,
            file_format="jpeg",
            file_sha256=sha256_hex,
            status=VERIFICATION_PENDING,
            is_current=True,
        )

        recompute_verification_status(user)

        log_action(
            actor=user,
            action="upload_verification_image",
            entity_type="verification_image",
            entity_id=new_image.id,
            after_data={"image_type": image_type, "file_sha256": sha256_hex},
        )

    return new_image


def review_verification_image(
    actor: User,
    image: UserVerificationImage,
    status: str,
    note: str = "",
) -> UserVerificationImage:
    """
    Admin review of user verification image.
    Updates status, reviewer, and recomputes verification status of target user.
    """
    ensure_admin(actor)

    valid_statuses = {"approved", "verified", VERIFICATION_VERIFIED, VERIFICATION_REJECTED}
    if status not in valid_statuses:
        raise DomainError(f"Invalid review status: {status}", code="invalid_status")

    db_status = "approved" if status in ("approved", "verified", VERIFICATION_VERIFIED) else VERIFICATION_REJECTED

    with transaction.atomic():
        image.status = db_status
        image.reviewed_by = actor
        image.reviewed_at = timezone.now()
        image.note = note
        image.save(update_fields=["status", "reviewed_by", "reviewed_at", "note"])

        recompute_verification_status(image.user)

        log_action(
            actor=actor,
            action=f"review_image_{db_status}",
            entity_type="verification_image",
            entity_id=image.id,
            after_data={"status": db_status, "note": note},
        )

    return image


def recompute_verification_status(user: User) -> None:
    """
    Recompute user's verification_status based on current verification images.
    - If any current image rejected -> rejected
    - Else if approved mock_selfie AND (approved id_license OR approved driver_license) -> verified
    - Else if any current pending -> pending
    - Else -> none
    """
    current_images = list(UserVerificationImage.objects.filter(user=user, is_current=True))

    has_rejected = any(img.status in ("rejected", VERIFICATION_REJECTED) for img in current_images)
    has_pending = any(img.status in ("pending", VERIFICATION_PENDING) for img in current_images)
    has_mock = any(
        img.status in ("approved", "verified", VERIFICATION_VERIFIED) and img.image_type == IMAGE_MOCK_SELFIE
        for img in current_images
    )
    has_license = any(
        img.status in ("approved", "verified", VERIFICATION_VERIFIED)
        and img.image_type in (IMAGE_ID_LICENSE, IMAGE_DRIVER_LICENSE)
        for img in current_images
    )

    if has_rejected:
        new_status = VERIFICATION_REJECTED
    elif has_mock and has_license:
        new_status = VERIFICATION_VERIFIED
    elif has_pending:
        new_status = VERIFICATION_PENDING
    else:
        new_status = VERIFICATION_NONE

    user.verification_status = new_status
    user.save(update_fields=["verification_status"])


def apply_as_coordinator(user: User, notes: str = "") -> CoordinatorProfile:
    """
    Active user applies to become a coordinator.
    """
    ensure_active_account(user)

    with transaction.atomic():
        profile, created = CoordinatorProfile.objects.get_or_create(
            user=user,
            defaults={"status": COORDINATOR_PENDING, "notes": notes},
        )
        if not created and profile.status in (COORDINATOR_REVOKED, COORDINATOR_SUSPENDED):
            profile.status = COORDINATOR_PENDING
            if notes:
                profile.notes = notes
            profile.save(update_fields=["status", "notes"])

        log_action(
            actor=user,
            action="apply_coordinator",
            entity_type="coordinator_profile",
            entity_id=user.id,
        )

    return profile


def approve_coordinator(actor: User, profile: CoordinatorProfile) -> CoordinatorProfile:
    """
    Admin approves coordinator application.
    Requires user.verification_status == 'verified'.
    """
    ensure_admin(actor)

    profile.user.refresh_from_db()
    if profile.user.verification_status != VERIFICATION_VERIFIED:
        raise VerificationRequiredError(
            "User must be fully verified before coordinator status can be approved."
        )

    with transaction.atomic():
        profile.status = COORDINATOR_APPROVED
        profile.approved_by = actor
        profile.approved_at = timezone.now()
        profile.save(update_fields=["status", "approved_by", "approved_at"])

        log_action(
            actor=actor,
            action="approve_coordinator",
            entity_type="coordinator_profile",
            entity_id=profile.user_id,
        )

    return profile


def suspend_coordinator(actor: User, profile: CoordinatorProfile) -> CoordinatorProfile:
    """
    Admin suspends an approved coordinator.
    """
    ensure_admin(actor)

    with transaction.atomic():
        profile.status = COORDINATOR_SUSPENDED
        profile.save(update_fields=["status"])

        log_action(
            actor=actor,
            action="suspend_coordinator",
            entity_type="coordinator_profile",
            entity_id=profile.user_id,
        )

    return profile


def revoke_coordinator(actor: User, profile: CoordinatorProfile) -> CoordinatorProfile:
    """
    Admin revokes coordinator role permanently.
    """
    ensure_admin(actor)

    with transaction.atomic():
        profile.status = COORDINATOR_REVOKED
        profile.save(update_fields=["status"])

        log_action(
            actor=actor,
            action="revoke_coordinator",
            entity_type="coordinator_profile",
            entity_id=profile.user_id,
        )

    return profile
