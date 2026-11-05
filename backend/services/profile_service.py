"""
services/profile_service.py

User profile retrieval, update (allow-list), charity interests, and skills.
All writes go through the Django ORM which maps to the PostgreSQL users table.
Database triggers (trg_01_users_guard) provide backstop enforcement.
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import transaction

from apps.accounts.models import UserCharityInterests, Users
from apps.events.models import CharityFields
from common.exceptions import DomainError, ResourceMaskedNotFound
from common.permissions import can_coordinator_read_t2, get_event_for_manager_or_404
from common.privacy import get_minimal_public_card, get_t2_volunteer_card
from common.utils import decrypt_phone, encrypt_phone, normalize_tags

logger = logging.getLogger(__name__)

# Fields that a user may update on their own profile.
PROFILE_EDITABLE_FIELDS = frozenset({
    "display_name",
    "preferred_language",
    "home_area",
    "emergency_contact_name",
    "emergency_contact_phone",  # virtual; maps to emergency_contact_phone_enc
    "blood_type",
    "is_willing_to_donate",
    "is_willing_to_donate_blood",
    "is_willing_to_donate_items",
    "physical_ok",
    "good_eyesight",
    "needs_glasses",
    "can_lift_heavy",
    "can_work_outdoor",
    "has_leader_experience",
    "new_to_volunteer",
    "skills",
    "needs_meal_support",
    "needs_travel_support",
    "accepts_unpaid",
})

# Fields that must NEVER be set through the profile update endpoint.
PRIVILEGED_FIELDS = frozenset({
    "is_admin",
    "is_staff",
    "is_superuser",
    "is_active",
    "account_status",
    "blocked_until",
    "phone_hash",
    "phone_enc",
    "password",
    "verification_status",
    "uuid",
    "id",
})


# ---------------------------------------------------------------------------
# Profile Retrieval
# ---------------------------------------------------------------------------

def get_user_profile(user: Users) -> dict:
    """
    Return the full self-profile for the authenticated user.

    Includes decrypted phone for self-view. Never includes phone_hash,
    phone_enc raw token, or password.
    """
    phone = decrypt_phone(user.phone_enc) if user.phone_enc else None
    emergency_phone = (
        decrypt_phone(user.emergency_contact_phone_enc)
        if user.emergency_contact_phone_enc
        else None
    )

    charity_interests = list(
        UserCharityInterests.objects.filter(user=user)
        .select_related("field_code")
        .values_list("field_code__code", flat=True)
    )

    return {
        "id": user.id,
        "uuid": str(user.uuid) if hasattr(user, "uuid") and user.uuid else None,
        "display_name": user.display_name,
        "phone": phone,
        "preferred_language": user.preferred_language,
        "home_area": user.home_area,
        "emergency_contact_name": user.emergency_contact_name,
        "emergency_contact_phone": emergency_phone,
        "blood_type": user.blood_type,
        "is_willing_to_donate": user.is_willing_to_donate,
        "is_willing_to_donate_blood": user.is_willing_to_donate_blood,
        "is_willing_to_donate_items": user.is_willing_to_donate_items,
        "physical_ok": user.physical_ok,
        "good_eyesight": user.good_eyesight,
        "needs_glasses": user.needs_glasses,
        "can_lift_heavy": user.can_lift_heavy,
        "can_work_outdoor": user.can_work_outdoor,
        "has_leader_experience": user.has_leader_experience,
        "new_to_volunteer": user.new_to_volunteer,
        "skills": list(user.skills or []),
        "needs_meal_support": user.needs_meal_support,
        "needs_travel_support": user.needs_travel_support,
        "accepts_unpaid": user.accepts_unpaid,
        "verification_status": user.verification_status,
        "account_status": user.account_status,
        "charity_interests": charity_interests,
        "created_at": user.created_at,
    }


# ---------------------------------------------------------------------------
# Profile Update
# ---------------------------------------------------------------------------

def update_user_profile(user: Users, validated_data: dict) -> Users:
    """
    Update the user's profile using an explicit allow-list.

    Rejects any key not in PROFILE_EDITABLE_FIELDS. Handles the
    emergency_contact_phone encryption and pairing constraint.

    Args:
        user: The authenticated user to update.
        validated_data: Dictionary of fields to update (already serializer-validated).

    Returns:
        The updated Users instance.

    Raises:
        DomainError: If a privileged or unknown field is present, or validation fails.
    """
    # Reject any key outside the allow-list
    unknown_keys = set(validated_data.keys()) - PROFILE_EDITABLE_FIELDS
    privileged_keys = set(validated_data.keys()) & PRIVILEGED_FIELDS
    if privileged_keys:
        raise DomainError(
            code="field_not_allowed",
            message=f"Cannot modify privileged fields: {', '.join(sorted(privileged_keys))}",
            status_code=400,
        )
    if unknown_keys:
        raise DomainError(
            code="field_not_allowed",
            message=f"Unknown fields: {', '.join(sorted(unknown_keys))}",
            status_code=400,
        )

    # Handle skills normalization
    if "skills" in validated_data:
        validated_data["skills"] = normalize_tags(validated_data["skills"])

    # Handle emergency contact phone encryption and pairing
    if "emergency_contact_phone" in validated_data:
        raw_phone = validated_data.pop("emergency_contact_phone")
        if raw_phone:
            user.emergency_contact_phone_enc = encrypt_phone(raw_phone)
        else:
            user.emergency_contact_phone_enc = None

    # If emergency_contact_name is being cleared, also clear the phone
    if "emergency_contact_name" in validated_data:
        name_val = validated_data["emergency_contact_name"]
        if name_val in (None, ""):
            user.emergency_contact_phone_enc = None
            validated_data["emergency_contact_name"] = None

    # Apply remaining fields
    for field, value in validated_data.items():
        if field == "emergency_contact_phone":
            continue
        setattr(user, field, value)

    # Database constraint: CHECK ((emergency_contact_name IS NULL) = (emergency_contact_phone_enc IS NULL))
    has_name = bool(user.emergency_contact_name and user.emergency_contact_name.strip())
    has_phone = bool(user.emergency_contact_phone_enc)
    if has_name != has_phone:
        raise DomainError(
            code="emergency_contact_mismatch",
            message="Emergency contact name and phone must both be provided or both be empty.",
            status_code=400,
        )

    # Validate against model constraints (blood_type choices, etc.)
    try:
        user.full_clean(
            exclude=["password", "phone_hash", "phone_enc", "last_login", "uuid"]
        )
    except Exception as e:
        raise DomainError(
            code="invalid_profile_data",
            message=str(e),
            status_code=400,
        )

    user.save()
    return user


# ---------------------------------------------------------------------------
# Charity Interests
# ---------------------------------------------------------------------------

def replace_charity_interests(user: Users, field_codes: list[str]) -> list[str]:
    """
    Atomically replace the user's charity interests.

    Args:
        user: The authenticated user.
        field_codes: List of active charity field codes.

    Returns:
        The list of field codes now associated with the user.

    Raises:
        DomainError: If any code is unknown or inactive.
    """
    if field_codes:
        valid_codes = set(
            CharityFields.objects.filter(active=True, code__in=field_codes)
            .values_list("code", flat=True)
        )
        invalid = set(field_codes) - valid_codes
        if invalid:
            raise DomainError(
                code="invalid_charity_field",
                message=f"Unknown or inactive charity fields: {', '.join(sorted(invalid))}",
                status_code=400,
            )

    with transaction.atomic():
        UserCharityInterests.objects.filter(user=user).delete()
        for code in field_codes:
            UserCharityInterests.objects.create(
                user=user,
                field_code_id=code,
            )

    return field_codes


def get_charity_interests(user: Users) -> list[str]:
    """Return the user's current charity interest codes."""
    return list(
        UserCharityInterests.objects.filter(user=user)
        .values_list("field_code_id", flat=True)
    )


# ---------------------------------------------------------------------------
# Public UUID Lookup & Coordinator Scan (W23, W24)
# ---------------------------------------------------------------------------

def lookup_user_by_uuid(actor: Users, target_uuid: str, event_id: Optional[int] = None) -> dict:
    """
    Look up a user by their public UUID (W23, W24).

    Rules:
      1. Target must exist and have account_status='active' and is_active=True,
         else raise ResourceMaskedNotFound (404).
      2. If event_id is supplied and actor is an event manager (or admin) with T2 access
         for an accepted volunteer on that event, return the T2 card + assignment status.
      3. Otherwise, return strictly the T1 Minimal Public Card ({uuid, display_name}).
    """
    target = Users.objects.filter(uuid=target_uuid, account_status="active", is_active=True).first()
    if target is None:
        raise ResourceMaskedNotFound("User not found.")

    if event_id is not None:
        try:
            event = get_event_for_manager_or_404(actor, event_id, require_write=False)
            if can_coordinator_read_t2(actor, target.id, event):
                card = get_t2_volunteer_card(target)
                card["uuid"] = str(target.uuid)

                # Attach shift/assignment status if available
                from apps.coordination.models import Assignments
                assignment = Assignments.objects.filter(
                    event_id=event.id,
                    user_id=target.id,
                ).exclude(status="cancelled").first()

                card["assignment_status"] = assignment.status if assignment else None
                card["event_id"] = event.id
                return card
        except ResourceMaskedNotFound:
            pass  # Fall back to T1 Minimal Public Card

    return get_minimal_public_card(target)


# Specification alias
update_profile = update_user_profile



