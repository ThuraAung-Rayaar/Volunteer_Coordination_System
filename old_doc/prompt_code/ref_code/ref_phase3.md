# Phase 3 — Authentication, User Profiles & Volunteer Availability

## Inspection Summary

Before writing code, I confirmed the following against the uploaded schema (`updated_volunteer_coordination_system_Database.sql`) and models (`backend_apps_models.txt`):

**SQL function signatures (verified):**

| Function | Arguments | Returns |
|---|---|---|
| `request_otp(p_phone_hash, p_code_hash, p_purpose)` | TEXT, TEXT, TEXT | `BIGINT` (otp id) |
| `verify_otp(p_phone_hash, p_code_hash, p_purpose)` | TEXT, TEXT, TEXT | `TEXT` (`'ok'`/`'invalid_code'`/`'expired'`/`'too_many_attempts'`/`'no_otp'`) |
| `is_user_available(p_user, p_start, p_end)` | BIGINT, TIMESTAMPTZ, TIMESTAMPTZ | `BOOLEAN` |
| `user_has_schedule_conflict(p_user, p_start, p_end, p_except_event)` | BIGINT, TIMESTAMPTZ, TIMESTAMPTZ, BIGINT | `BOOLEAN` |
| `release_expired_blocks()` | none | `INTEGER` (rows updated) |

**Model gaps found:**
- `Users` model is missing the `uuid` field (you added it to the DB; the model needs it for the profile service to return it).
- `common/utils.py` helpers (`compute_phone_hash`, `compute_otp_hash`, `encrypt_phone`, `decrypt_phone`, `normalize_phone`, `normalize_tags`) are assumed present from Phase 1.

**Existing infrastructure reused (not duplicated):**
- `common/db_context.py` → `set_db_session_context`, `BlockedAwareTokenAuthentication`
- `common/exceptions.py` → `DomainError`, `ResourceMaskedNotFound`, `translate_db_exception`
- `common/permissions.py` → `ensure_active_user`
- `rest_framework.authtoken` → existing token mechanism

---

## 1. Model Update — Add `uuid` to `Users`

Add this field to `apps/accounts/models.py` inside the `Users` class, right below `id`:

```python
# apps/accounts/models.py — add to Users class, below `id`
import uuid as uuid_module

class Users(AbstractBaseUser):
    id = models.BigAutoField(primary_key=True)
    uuid = models.UUIDField(unique=True, default=uuid_module.uuid4, editable=False)
    # ... rest unchanged ...
```

> This maps to the `users.uuid` column you already added to the database. Because `managed = False`, Django will not try to create it.

---

## 2. `backend/services/auth_service.py`

```python
"""
services/auth_service.py

Authentication workflows: OTP request, OTP verification, token issuance, logout.
All OTP logic delegates to PostgreSQL stored functions (request_otp, verify_otp).
This service never stores or logs raw OTP codes beyond the delivery adapter.
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional

from django.conf import settings
from django.db import connection
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.accounts.models import Users
from common.exceptions import DomainError
from common.utils import (
    compute_otp_hash,
    compute_phone_hash,
    encrypt_phone,
    normalize_phone,
)

logger = logging.getLogger(__name__)

# OTP code length for the prototype (4 digits per business rules).
OTP_CODE_LENGTH = 4


# ---------------------------------------------------------------------------
# OTP Delivery Adapter
# ---------------------------------------------------------------------------

class OtpDeliveryAdapter:
    """
    Abstract adapter for delivering OTP codes to the user.

    In production this would integrate with an SMS/email provider.
    For the prototype, the ConsoleOtpDeliveryAdapter is used, which
    does NOT actually send anything — it only records that delivery
    was attempted. The caller decides whether to include the code
    in the API response (DEBUG mode only).
    """

    def deliver(self, phone_enc: str, raw_code: str, purpose: str) -> dict:
        raise NotImplementedError


class ConsoleOtpDeliveryAdapter(OtpDeliveryAdapter):
    """
    Development adapter. Logs the intent but does not send a real SMS.
    Returns a dict indicating delivery was NOT actually performed.
    """

    def deliver(self, phone_enc: str, raw_code: str, purpose: str) -> dict:
        # Do NOT log the raw code in production. For dev visibility,
        # the code is returned in the API response when DEBUG=True.
        logger.info("OTP delivery requested (purpose=%s). No SMS provider configured.", purpose)
        return {"delivered": False, "method": "console", "provider_configured": False}


# The active delivery adapter. Replace with a real SMS adapter in production.
_otp_delivery_adapter: OtpDeliveryAdapter = ConsoleOtpDeliveryAdapter()


def set_otp_delivery_adapter(adapter: OtpDeliveryAdapter) -> None:
    """Allow tests or production config to swap the delivery adapter."""
    global _otp_delivery_adapter
    _otp_delivery_adapter = adapter


# ---------------------------------------------------------------------------
# OTP Request
# ---------------------------------------------------------------------------

def request_login_otp(raw_phone: str, purpose: str = "login") -> dict:
    """
    Request a login OTP for the given phone number.

    Steps:
      1. Normalize phone and compute phone_hash.
      2. Check existing account status (closed → reject, blocked → maybe release).
      3. Generate a 4-digit code and hash it.
      4. Call PostgreSQL request_otp() which enforces rate limits via trigger.
      5. Attempt delivery via the configured adapter.
      6. Return a safe response. Never expose the code unless DEBUG.

    Returns:
        {"status": "sent", "dev_code": "..."} when settings.DEBUG
        {"status": "sent"} otherwise
    """
    phone = normalize_phone(raw_phone)
    phone_hash = compute_phone_hash(phone)

    # Check account status for existing users
    user = Users.objects.filter(phone_hash=phone_hash).first()
    if user is not None:
        if user.account_status == "closed":
            raise DomainError(
                code="account_closed",
                message="This account has been closed.",
                status_code=403,
            )
        if user.account_status == "blocked":
            # Attempt lazy block release
            with connection.cursor() as cursor:
                cursor.execute("SELECT release_expired_blocks()")
            user.refresh_from_db()
            if user.account_status == "blocked":
                raise DomainError(
                    code="account_blocked",
                    message="This account is currently blocked.",
                    status_code=403,
                )

    # Generate OTP code
    if settings.DEBUG and getattr(settings, "DEV_FIXED_OTP", None):
        raw_code = str(settings.DEV_FIXED_OTP)
    else:
        raw_code = f"{secrets.randbelow(10 ** OTP_CODE_LENGTH):0{OTP_CODE_LENGTH}d}"

    code_hash = compute_otp_hash(raw_code)

    # Call the database function. Rate limiting is enforced by trg_01_otp_rate_limit.
    # If rate limit is exceeded, PostgreSQL raises 'otp_rate_limited' which is
    # translated by the custom exception handler into HTTP 429.
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT request_otp(%s, %s, %s)",
            [phone_hash, code_hash, purpose],
        )
        otp_id = cursor.fetchone()[0]

    # Attempt delivery (does not actually send in prototype)
    phone_enc = encrypt_phone(phone)
    delivery_result = _otp_delivery_adapter.deliver(phone_enc, raw_code, purpose)

    response = {"status": "sent", "delivery": delivery_result}
    if settings.DEBUG:
        response["dev_code"] = raw_code

    return response


# ---------------------------------------------------------------------------
# OTP Verification
# ---------------------------------------------------------------------------

def verify_login_otp(
    raw_phone: str,
    raw_code: str,
    purpose: str = "login",
    display_name: Optional[str] = None,
) -> dict:
    """
    Verify an OTP and establish authenticated identity.

    Steps:
      1. Normalize phone and hash code.
      2. Call PostgreSQL verify_otp() which returns a result code.
      3. If 'ok': find or create user, check account status, issue token.
      4. If not 'ok': return the result code for the caller to translate.

    The caller (BFF view) is responsible for committing the transaction
    so that attempt_count increments persist even on failure.

    Returns:
        {"ok": True, "result": "ok", "token": "...", "user": Users}
        {"ok": False, "result": "<code>"}
    """
    phone = normalize_phone(raw_phone)
    phone_hash = compute_phone_hash(phone)
    code_hash = compute_otp_hash(raw_code.strip())

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT verify_otp(%s, %s, %s)",
            [phone_hash, code_hash, purpose],
        )
        result = cursor.fetchone()[0]

    if result != "ok":
        # Return the failure code. The transaction must still commit
        # so that attempt_count increments are persisted.
        return {"ok": False, "result": result}

    # OTP verified successfully. Release any expired blocks, then find/create user.
    with connection.cursor() as cursor:
        cursor.execute("SELECT release_expired_blocks()")

    user = Users.objects.filter(phone_hash=phone_hash).first()

    if user is None:
        # First-time registration
        clean_name = (display_name or "Volunteer").strip()[:150]
        user = Users(
            phone_hash=phone_hash,
            phone_enc=encrypt_phone(phone),
            display_name=clean_name,
            password=None,  # OTP-only user; DB allows NULL password
        )
        user.save()

    # Check account status after potential block release
    if user.account_status != "active" or not user.is_active:
        raise DomainError(
            code="account_blocked",
            message="This account is blocked or closed.",
            status_code=403,
        )

    # Update last_login
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    # Issue DRF token (existing token mechanism, not a second auth system)
    token, _created = Token.objects.get_or_create(user=user)

    return {"ok": True, "result": "ok", "token": token.key, "user": user}


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

def logout_user(user: Users, auth_token) -> None:
    """
    Invalidate the user's authentication token.

    Args:
        user: The authenticated user.
        auth_token: The DRF Token instance from request.auth.
    """
    if auth_token is not None:
        auth_token.delete()
    else:
        # Fallback: delete all tokens for this user
        Token.objects.filter(user=user).delete()
```

---

## 3. `backend/services/profile_service.py`

```python
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
from common.exceptions import DomainError
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
    "is_admin", "is_staff", "is_superuser", "is_active",
    "account_status", "blocked_until", "phone_hash", "phone_enc",
    "password", "verification_status", "uuid", "id",
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
    if validated_data.get("emergency_contact_name") in (None, ""):
        if "emergency_contact_name" in validated_data:
            user.emergency_contact_phone_enc = None

    # Apply remaining fields
    for field, value in validated_data.items():
        if field == "emergency_contact_phone":
            continue  # already handled above
        setattr(user, field, value)

    # Validate against model constraints (blood_type choices, donation consistency, etc.)
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
```

---

## 4. `backend/services/availability_service.py`

```python
"""
services/availability_service.py

Volunteer availability rules and exceptions.
Availability evaluation delegates to the PostgreSQL is_user_available() function.
Schedule conflict checks delegate to user_has_schedule_conflict().
"""
from __future__ import annotations

import logging
from typing import Optional

from django.db import connection, transaction

from apps.accounts.models import (
    VolunteerAvailabilityExceptions,
    VolunteerAvailabilityRules,
)
from common.exceptions import DomainError, ResourceMaskedNotFound

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def get_user_availability(user_id: int) -> dict:
    """
    Return all weekly rules and date exceptions for a user.
    """
    rules = list(
        VolunteerAvailabilityRules.objects.filter(user_id=user_id)
        .order_by("weekday", "start_time")
        .values(
            "id", "weekday", "start_time", "end_time", "valid_from", "valid_to"
        )
    )
    exceptions = list(
        VolunteerAvailabilityExceptions.objects.filter(user_id=user_id)
        .order_by("date")
        .values("id", "date", "is_available", "start_time", "end_time", "note")
    )
    return {"rules": rules, "exceptions": exceptions}


# ---------------------------------------------------------------------------
# Weekly Rules
# ---------------------------------------------------------------------------

def set_weekly_availability_rules(user_id: int, rules_data: list[dict]) -> list[dict]:
    """
    Atomically replace all weekly availability rules for a user.

    Args:
        user_id: The user's ID.
        rules_data: List of dicts with keys: weekday, start_time, end_time,
                    valid_from (optional), valid_to (optional).

    Returns:
        List of created rule dicts.
    """
    created = []
    with transaction.atomic():
        VolunteerAvailabilityRules.objects.filter(user_id=user_id).delete()
        for rule in rules_data:
            obj = VolunteerAvailabilityRules.objects.create(
                user_id=user_id,
                weekday=rule["weekday"],
                start_time=rule["start_time"],
                end_time=rule["end_time"],
                valid_from=rule.get("valid_from"),
                valid_to=rule.get("valid_to"),
            )
            created.append({
                "id": obj.id,
                "weekday": obj.weekday,
                "start_time": obj.start_time,
                "end_time": obj.end_time,
                "valid_from": obj.valid_from,
                "valid_to": obj.valid_to,
            })
    return created


# ---------------------------------------------------------------------------
# Date Exceptions
# ---------------------------------------------------------------------------

def upsert_availability_exception(user_id: int, exc_data: dict) -> dict:
    """
    Create or update a date-specific availability exception.

    The unique constraint (user_id, date) means there is at most one
    exception per date. This performs an upsert.

    Args:
        user_id: The user's ID.
        exc_data: Dict with keys: date, is_available, start_time (optional),
                  end_time (optional), note (optional).

    Returns:
        The created/updated exception dict.
    """
    obj, _created = VolunteerAvailabilityExceptions.objects.update_or_create(
        user_id=user_id,
        date=exc_data["date"],
        defaults={
            "is_available": exc_data.get("is_available", False),
            "start_time": exc_data.get("start_time"),
            "end_time": exc_data.get("end_time"),
            "note": exc_data.get("note", ""),
        },
    )
    return {
        "id": obj.id,
        "date": obj.date,
        "is_available": obj.is_available,
        "start_time": obj.start_time,
        "end_time": obj.end_time,
        "note": obj.note,
    }


def delete_availability_exception(user_id: int, exception_id: int) -> None:
    """
    Delete a date-specific exception owned by the user.

    Raises:
        ResourceMaskedNotFound: If the exception does not exist or is not owned.
    """
    deleted_count, _ = VolunteerAvailabilityExceptions.objects.filter(
        id=exception_id, user_id=user_id
    ).delete()
    if deleted_count == 0:
        raise ResourceMaskedNotFound(
            message="Availability exception not found."
        )


# ---------------------------------------------------------------------------
# Availability Check (delegates to SQL)
# ---------------------------------------------------------------------------

def check_user_availability(user_id: int, start_at, end_at) -> bool:
    """
    Check if a user is available for a given time window.

    Delegates to the PostgreSQL is_user_available() function.
    Does NOT reimplement the availability algorithm.

    Args:
        user_id: The user's ID.
        start_at: Start of the time window (datetime).
        end_at: End of the time window (datetime).

    Returns:
        True if available, False otherwise.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT is_user_available(%s, %s, %s)",
            [user_id, start_at, end_at],
        )
        row = cursor.fetchone()
        return bool(row[0]) if row else True


def check_schedule_conflict(
    user_id: int,
    start_at,
    end_at,
    except_event_id: Optional[int] = None,
) -> bool:
    """
    Check if a user has a scheduling conflict for a given time window.

    Delegates to the PostgreSQL user_has_schedule_conflict() function.

    Args:
        user_id: The user's ID.
        start_at: Start of the time window.
        end_at: End of the time window.
        except_event_id: Optional event ID to exclude from conflict check.

    Returns:
        True if a conflict exists, False otherwise.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT user_has_schedule_conflict(%s, %s, %s, %s)",
            [user_id, start_at, end_at, except_event_id],
        )
        row = cursor.fetchone()
        return bool(row[0]) if row else False
```

---

## 5. BFF Serializers

### `backend/bff/auth/serializers.py`

```python
from rest_framework import serializers


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    purpose = serializers.ChoiceField(
        choices=["login", "qr_registration"],
        default="login",
    )


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=10)
    purpose = serializers.ChoiceField(
        choices=["login", "qr_registration"],
        default="login",
    )
    display_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True
    )
```

### `backend/bff/volunteer/serializers.py` (profile & availability portions)

```python
from rest_framework import serializers

from common.permissions import AllowListSerializerMixin


class UserProfileSerializer(serializers.Serializer):
    """Read-only serializer for the user's own profile."""
    id = serializers.IntegerField(read_only=True)
    uuid = serializers.UUIDField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    phone = serializers.CharField(read_only=True, allow_null=True)
    preferred_language = serializers.CharField(read_only=True)
    home_area = serializers.CharField(read_only=True, allow_null=True)
    emergency_contact_name = serializers.CharField(read_only=True, allow_null=True)
    emergency_contact_phone = serializers.CharField(read_only=True, allow_null=True)
    blood_type = serializers.CharField(read_only=True)
    is_willing_to_donate = serializers.BooleanField(read_only=True)
    is_willing_to_donate_blood = serializers.BooleanField(read_only=True)
    is_willing_to_donate_items = serializers.BooleanField(read_only=True)
    physical_ok = serializers.BooleanField(read_only=True)
    good_eyesight = serializers.BooleanField(read_only=True)
    needs_glasses = serializers.BooleanField(read_only=True)
    can_lift_heavy = serializers.BooleanField(read_only=True)
    can_work_outdoor = serializers.BooleanField(read_only=True)
    has_leader_experience = serializers.BooleanField(read_only=True)
    new_to_volunteer = serializers.BooleanField(read_only=True)
    skills = serializers.ListField(child=serializers.CharField(), read_only=True)
    needs_meal_support = serializers.BooleanField(read_only=True)
    needs_travel_support = serializers.BooleanField(read_only=True)
    accepts_unpaid = serializers.BooleanField(read_only=True)
    verification_status = serializers.CharField(read_only=True)
    account_status = serializers.CharField(read_only=True)
    charity_interests = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )
    created_at = serializers.DateTimeField(read_only=True)


class ProfileUpdateSerializer(AllowListSerializerMixin, serializers.Serializer):
    """
    Allow-list serializer for profile updates.
    Only fields declared here are accepted; unknown keys return 400.
    """
    display_name = serializers.CharField(max_length=150, required=False)
    preferred_language = serializers.CharField(max_length=35, required=False)
    home_area = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    emergency_contact_name = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    emergency_contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)
    blood_type = serializers.ChoiceField(
        choices=["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
        required=False,
    )
    is_willing_to_donate = serializers.BooleanField(required=False)
    is_willing_to_donate_blood = serializers.BooleanField(required=False)
    is_willing_to_donate_items = serializers.BooleanField(required=False)
    physical_ok = serializers.BooleanField(required=False)
    good_eyesight = serializers.BooleanField(required=False)
    needs_glasses = serializers.BooleanField(required=False)
    can_lift_heavy = serializers.BooleanField(required=False)
    can_work_outdoor = serializers.BooleanField(required=False)
    has_leader_experience = serializers.BooleanField(required=False)
    new_to_volunteer = serializers.BooleanField(required=False)
    skills = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
        allow_empty=True,
    )
    needs_meal_support = serializers.BooleanField(required=False)
    needs_travel_support = serializers.BooleanField(required=False)
    accepts_unpaid = serializers.BooleanField(required=False)


class CharityInterestsSerializer(serializers.Serializer):
    field_codes = serializers.ListField(
        child=serializers.CharField(max_length=50),
        allow_empty=True,
    )


class AvailabilityRuleSerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=1, max_value=7)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    valid_from = serializers.DateField(required=False, allow_null=True)
    valid_to = serializers.DateField(required=False, allow_null=True)


class AvailabilityRulesReplaceSerializer(serializers.Serializer):
    rules = serializers.ListField(child=AvailabilityRuleSerializer(), allow_empty=True)


class AvailabilityExceptionSerializer(serializers.Serializer):
    date = serializers.DateField()
    is_available = serializers.BooleanField(default=False)
    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class AvailabilityCheckSerializer(serializers.Serializer):
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
```

---

## 6. BFF Views

### `backend/bff/auth/views.py`

```python
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import auth_service

from .serializers import OtpRequestSerializer, OtpVerifySerializer


class OtpRequestView(APIView):
    """POST /api/v1/auth/otp/request/"""
    permission_classes = [AllowAny]
    authentication_classes = []  # public endpoint

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = auth_service.request_login_otp(
            raw_phone=serializer.validated_data["phone"],
            purpose=serializer.validated_data.get("purpose", "login"),
        )
        return Response(result, status=status.HTTP_200_OK)


class OtpVerifyView(APIView):
    """POST /api/v1/auth/otp/verify/"""
    permission_classes = [AllowAny]
    authentication_classes = []  # public endpoint

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = auth_service.verify_login_otp(
            raw_phone=serializer.validated_data["phone"],
            raw_code=serializer.validated_data["code"],
            purpose=serializer.validated_data.get("purpose", "login"),
            display_name=serializer.validated_data.get("display_name"),
        )

        if not result["ok"]:
            # Map result codes to HTTP status codes
            code = result["result"]
            status_code = status.HTTP_400_BAD_REQUEST
            message = "Verification failed."
            if code == "expired":
                message = "This verification code has expired. Please request a new one."
            elif code == "too_many_attempts":
                message = "Maximum verification attempts exceeded. Please request a new code."
                status_code = status.HTTP_429_TOO_MANY_REQUESTS
            elif code == "invalid_code":
                message = "Incorrect verification code."
            elif code == "no_otp":
                message = "No active verification code found. Please request a new code."
            return Response(
                {"error": {"code": code, "message": message}},
                status=status_code,
            )

        # Success: return token and basic user info
        user = result["user"]
        return Response(
            {
                "token": result["token"],
                "user": {
                    "id": user.id,
                    "uuid": str(user.uuid) if hasattr(user, "uuid") and user.uuid else None,
                    "display_name": user.display_name,
                    "verification_status": user.verification_status,
                },
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """POST /api/v1/auth/logout/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        auth_service.logout_user(request.user, request.auth)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

### `backend/bff/volunteer/views.py` (profile & availability portions)

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from services import availability_service, profile_service

from .serializers import (
    AvailabilityCheckSerializer,
    AvailabilityExceptionSerializer,
    AvailabilityRulesReplaceSerializer,
    CharityInterestsSerializer,
    ProfileUpdateSerializer,
    UserProfileSerializer,
)


class MeProfileView(APIView):
    """GET /api/v1/me/ and PATCH /api/v1/me/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = profile_service.get_user_profile(request.user)
        serializer = UserProfileSerializer(data)
        return Response(serializer.data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = profile_service.update_user_profile(
            request.user, serializer.validated_data
        )
        data = profile_service.get_user_profile(user)
        return Response(UserProfileSerializer(data).data)


class MeCharityInterestsView(APIView):
    """GET /api/v1/me/charity-interests/ and PUT /api/v1/me/charity-interests/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        codes = profile_service.get_charity_interests(request.user)
        return Response({"field_codes": codes})

    def put(self, request):
        serializer = CharityInterestsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = profile_service.replace_charity_interests(
            request.user, serializer.validated_data["field_codes"]
        )
        return Response({"field_codes": codes})


class MeAvailabilityView(APIView):
    """GET /api/v1/me/availability/ — list rules and exceptions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = availability_service.get_user_availability(request.user.id)
        return Response(data)


class MeAvailabilityRulesView(APIView):
    """POST /api/v1/me/availability/rules/ — replace weekly rules."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AvailabilityRulesReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rules = availability_service.set_weekly_availability_rules(
            request.user.id, serializer.validated_data["rules"]
        )
        return Response({"rules": rules}, status=status.HTTP_200_OK)


class MeAvailabilityExceptionsView(APIView):
    """POST /api/v1/me/availability/exceptions/ — upsert a date exception."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AvailabilityExceptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exc = availability_service.upsert_availability_exception(
            request.user.id, serializer.validated_data
        )
        return Response(exc, status=status.HTTP_200_OK)


class MeAvailabilityExceptionDetailView(APIView):
    """DELETE /api/v1/me/availability/exceptions/{id}/"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, exception_id):
        availability_service.delete_availability_exception(
            request.user.id, exception_id
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventCheckAvailabilityView(APIView):
    """GET /api/v1/me/availability/check/ — check availability for a time window."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AvailabilityCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        available = availability_service.check_user_availability(
            request.user.id,
            serializer.validated_data["start_at"],
            serializer.validated_data["end_at"],
        )
        conflict = availability_service.check_schedule_conflict(
            request.user.id,
            serializer.validated_data["start_at"],
            serializer.validated_data["end_at"],
        )
        return Response({"available": available, "schedule_conflict": conflict})
```

---

## 7. BFF URLs

### `backend/bff/auth/urls.py`

```python
from django.urls import path

from .views import LogoutView, OtpRequestView, OtpVerifyView

urlpatterns = [
    path("otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
]
```

### `backend/bff/volunteer/urls.py` (profile & availability additions)

```python
from django.urls import path

from .views import (
    EventCheckAvailabilityView,
    MeAvailabilityExceptionDetailView,
    MeAvailabilityExceptionsView,
    MeAvailabilityRulesView,
    MeAvailabilityView,
    MeCharityInterestsView,
    MeProfileView,
)

# Add these to the existing urlpatterns list in bff/volunteer/urls.py
profile_availability_urls = [
    path("me/", MeProfileView.as_view(), name="me-profile"),
    path("me/charity-interests/", MeCharityInterestsView.as_view(), name="me-charity-interests"),
    path("me/availability/", MeAvailabilityView.as_view(), name="me-availability"),
    path("me/availability/rules/", MeAvailabilityRulesView.as_view(), name="me-availability-rules"),
    path("me/availability/exceptions/", MeAvailabilityExceptionsView.as_view(), name="me-availability-exceptions"),
    path("me/availability/exceptions/<int:exception_id>/", MeAvailabilityExceptionDetailView.as_view(), name="me-availability-exception-detail"),
    path("me/availability/check/", EventCheckAvailabilityView.as_view(), name="me-availability-check"),
]
```

Ensure `bff/urls.py` includes both:

```python
# bff/urls.py
from django.urls import include, path

urlpatterns = [
    path("auth/", include("bff.auth.urls")),
    path("", include("bff.volunteer.urls")),
    # ... other includes ...
]
```

---

## 8. Tests — `backend/apps/accounts/tests/test_phase3.py`

```python
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import (
    UserCharityInterests,
    Users,
    VolunteerAvailabilityExceptions,
    VolunteerAvailabilityRules,
)
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from services import auth_service, availability_service, profile_service

_phone_seq = 0


def _phone():
    global _phone_seq
    _phone_seq += 1
    return f"+959{_phone_seq:08d}"


def _make_user(phone=None, name="Test User", **kwargs):
    phone = phone or _phone()
    normalized = normalize_phone(phone)
    return Users.objects.create(
        phone_hash=compute_phone_hash(normalized),
        phone_enc=encrypt_phone(normalized),
        display_name=name,
        **kwargs,
    )


class OtpRequestTests(TestCase):
    def test_otp_request_returns_sent(self):
        result = auth_service.request_login_otp(_phone())
        self.assertEqual(result["status"], "sent")

    def test_otp_request_does_not_expose_code_in_production(self):
        with override_settings(DEBUG=False):
            result = auth_service.request_login_otp(_phone())
            self.assertNotIn("dev_code", result)

    def test_otp_request_exposes_code_in_debug(self):
        with override_settings(DEBUG=True):
            result = auth_service.request_login_otp(_phone())
            self.assertIn("dev_code", result)

    def test_otp_request_blocked_account_rejected(self):
        phone = _phone()
        user = _make_user(phone=phone, account_status="blocked")
        user.is_active = False
        user.save(update_fields=["is_active"])
        with self.assertRaises(Exception):
            auth_service.request_login_otp(phone)

    def test_otp_request_closed_account_rejected(self):
        phone = _phone()
        _make_user(phone=phone, account_status="closed")
        with self.assertRaises(Exception):
            auth_service.request_login_otp(phone)


class OtpVerifyTests(TestCase):
    def _request_and_get_code(self, phone):
        with override_settings(DEBUG=True):
            result = auth_service.request_login_otp(phone)
            return result["dev_code"]

    def test_successful_verification_creates_user(self):
        phone = _phone()
        code = self._request_and_get_code(phone)
        result = auth_service.verify_login_otp(phone, code, display_name="New User")
        self.assertTrue(result["ok"])
        self.assertIn("token", result)
        self.assertEqual(result["user"].display_name, "New User")

    def test_invalid_code_returns_invalid(self):
        phone = _phone()
        self._request_and_get_code(phone)
        result = auth_service.verify_login_otp(phone, "0000")
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "invalid_code")

    def test_expired_otp_returns_expired(self):
        phone = _phone()
        code = self._request_and_get_code(phone)
        # Manually expire the OTP
        from apps.accounts.models import AuthOtp
        AuthOtp.objects.filter(
            phone_hash=compute_phone_hash(normalize_phone(phone))
        ).update(expires_at=timezone.now() - timedelta(minutes=1))
        result = auth_service.verify_login_otp(phone, code)
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "expired")

    def test_attempt_limit_enforced(self):
        phone = _phone()
        code = self._request_and_get_code(phone)
        # Exhaust attempts with wrong codes
        for _ in range(5):
            auth_service.verify_login_otp(phone, "0000")
        # Now even the correct code should fail
        result = auth_service.verify_login_otp(phone, code)
        self.assertFalse(result["ok"])
        self.assertEqual(result["result"], "too_many_attempts")

    def test_blocked_account_cannot_login(self):
        phone = _phone()
        user = _make_user(phone=phone, account_status="blocked")
        user.is_active = False
        user.save(update_fields=["is_active"])
        code = self._request_and_get_code(phone)
        # The OTP verify succeeds at the code level, but account check fails
        with self.assertRaises(Exception):
            auth_service.verify_login_otp(phone, code)


class ProfileTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Profile User")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_profile(self):
        data = profile_service.get_user_profile(self.user)
        self.assertEqual(data["display_name"], "Profile User")
        self.assertNotIn("phone_hash", data)
        self.assertNotIn("phone_enc", data)
        self.assertNotIn("password", data)

    def test_update_profile_valid_fields(self):
        updated = profile_service.update_user_profile(
            self.user, {"display_name": "Updated Name", "blood_type": "O+"}
        )
        updated.refresh_from_db()
        self.assertEqual(updated.display_name, "Updated Name")
        self.assertEqual(updated.blood_type, "O+")

    def test_update_profile_rejects_privileged_fields(self):
        with self.assertRaises(Exception):
            profile_service.update_user_profile(self.user, {"is_admin": True})

    def test_update_profile_rejects_unknown_fields(self):
        with self.assertRaises(Exception):
            profile_service.update_user_profile(self.user, {"bogus_field": "x"})

    def test_charity_interests_replace(self):
        from apps.events.models import CharityFields
        # Ensure charity fields exist
        CharityFields.objects.get_or_create(code="teaching", defaults={"label": "Teaching"})
        CharityFields.objects.get_or_create(code="cooking", defaults={"label": "Cooking"})
        codes = profile_service.replace_charity_interests(self.user, ["teaching", "cooking"])
        self.assertEqual(codes, ["teaching", "cooking"])
        self.assertEqual(
            UserCharityInterests.objects.filter(user=self.user).count(), 2
        )

    def test_skills_normalization(self):
        updated = profile_service.update_user_profile(
            self.user, {"skills": ["  Cooking ", "CLEANING", "cooking", ""]}
        )
        updated.refresh_from_db()
        self.assertEqual(updated.skills, ["cooking", "cleaning"])

    def test_user_cannot_modify_other_user_profile(self):
        other_user = _make_user(name="Other User")
        # The service operates on the authenticated user, so direct cross-user
        # modification is prevented by the BFF view passing request.user.
        # This test verifies the service only updates the given user.
        profile_service.update_user_profile(self.user, {"display_name": "Changed"})
        other_user.refresh_from_db()
        self.assertEqual(other_user.display_name, "Other User")


class AvailabilityTests(TestCase):
    def setUp(self):
        self.user = _make_user(name="Availability User")

    def test_set_weekly_rules(self):
        rules = availability_service.set_weekly_availability_rules(
            self.user.id,
            [
                {"weekday": 1, "start_time": "09:00", "end_time": "17:00"},
                {"weekday": 3, "start_time": "10:00", "end_time": "14:00"},
            ],
        )
        self.assertEqual(len(rules), 2)
        self.assertEqual(
            VolunteerAvailabilityRules.objects.filter(user=self.user).count(), 2
        )

    def test_replace_rules_is_atomic(self):
        availability_service.set_weekly_availability_rules(
            self.user.id,
            [{"weekday": 1, "start_time": "09:00", "end_time": "17:00"}],
        )
        availability_service.set_weekly_availability_rules(
            self.user.id,
            [{"weekday": 2, "start_time": "10:00", "end_time": "18:00"}],
        )
        rules = VolunteerAvailabilityRules.objects.filter(user=self.user)
        self.assertEqual(rules.count(), 1)
        self.assertEqual(rules.first().weekday, 2)

    def test_upsert_exception(self):
        exc = availability_service.upsert_availability_exception(
            self.user.id,
            {"date": "2026-12-25", "is_available": False, "note": "Holiday"},
        )
        self.assertEqual(exc["is_available"], False)
        self.assertEqual(
            VolunteerAvailabilityExceptions.objects.filter(user=self.user).count(), 1
        )

    def test_delete_exception(self):
        exc = availability_service.upsert_availability_exception(
            self.user.id,
            {"date": "2026-12-25", "is_available": False},
        )
        availability_service.delete_availability_exception(self.user.id, exc["id"])
        self.assertEqual(
            VolunteerAvailabilityExceptions.objects.filter(user=self.user).count(), 0
        )

    def test_delete_exception_wrong_owner_returns_404(self):
        other_user = _make_user(name="Other")
        exc = availability_service.upsert_availability_exception(
            other_user.id,
            {"date": "2026-12-25", "is_available": False},
        )
        with self.assertRaises(Exception):
            availability_service.delete_availability_exception(self.user.id, exc["id"])

    def test_check_availability_no_rules_returns_true(self):
        # No rules means available by default
        now = timezone.now()
        result = availability_service.check_user_availability(
            self.user.id, now, now + timedelta(hours=2)
        )
        self.assertTrue(result)

    def test_schedule_conflict_no_assignments_returns_false(self):
        now = timezone.now()
        result = availability_service.check_schedule_conflict(
            self.user.id, now, now + timedelta(hours=2)
        )
        self.assertFalse(result)
```

---

## 9. Commands

```powershell
cd backend

# Verify no pending model changes (uuid field addition)
python manage.py makemigrations accounts --check --dry-run

# Run Phase 3 tests
python manage.py test apps.accounts.tests.test_phase3 --noinput

# Run full test suite to ensure nothing broke
python manage.py test apps --noinput
```

---

## 10. Completion Report

| Acceptance Criterion | Status | Evidence |
|---|---|---|
| Authentication uses existing SQL functions | ✅ | `request_otp()`, `verify_otp()` called via `connection.cursor()` |
| Profile services use actual model fields | ✅ | `PROFILE_EDITABLE_FIELDS` matches `Users` model columns |
| Availability checks use existing SQL functions | ✅ | `is_user_available()`, `user_has_schedule_conflict()` called, not reimplemented |
| No SQL schema modifications | ✅ | Only model-level `uuid` field added (column already in DB) |
| No duplicate authentication architecture | ✅ | Uses existing `rest_framework.authtoken.Token` |
| OTP operations protected against abuse | ✅ | Rate limit enforced by `trg_01_otp_rate_limit`; attempt limit by `verify_otp()` |
| OTP values not logged | ✅ | `ConsoleOtpDeliveryAdapter` does not log the raw code |
| Token hashes not exposed | ✅ | `phone_hash`, `phone_enc`, `password` excluded from all serializers |
| User cannot modify another user's profile | ✅ | BFF views pass `request.user`; service operates only on that user |
| Transaction-scoped database context | ✅ | `BlockedAwareTokenAuthentication` sets `app.user_id` per Phase 1 |
| 16 test scenarios covered | ✅ | See `test_phase3.py` |

**Files created/modified:**

| File | Action |
|---|---|
| `apps/accounts/models.py` | Modified (added `uuid` field) |
| `services/auth_service.py` | Created |
| `services/profile_service.py` | Created |
| `services/availability_service.py` | Created |
| `bff/auth/serializers.py` | Created |
| `bff/auth/views.py` | Created |
| `bff/auth/urls.py` | Created |
| `bff/volunteer/serializers.py` | Modified (added profile/availability serializers) |
| `bff/volunteer/views.py` | Modified (added profile/availability views) |
| `bff/volunteer/urls.py` | Modified (added profile/availability routes) |
| `apps/accounts/tests/test_phase3.py` | Created |

**Known limitation:** The `ConsoleOtpDeliveryAdapter` does not actually send SMS. In production, replace it with a real provider adapter by calling `set_otp_delivery_adapter()`. The API response honestly reports `"provider_configured": false` when no real provider is set.

Phase 3 is complete. Awaiting your approval before Phase 4.