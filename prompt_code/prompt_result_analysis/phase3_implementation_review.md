# Phase 3 Implementation Review: Identity, OTP Auth, Self Profile, Availability & UUID Lookup

**Review Date:** 2026-11-05  
**Reviewer:** Senior Django & PostgreSQL Code Reviewer  
**Scope:** Phase 3 Implementation (`Domain 1`: Authentication & OTP, `Domain 2`: User Profiles & Capabilities, `Domain 3`: Volunteer Availability Rules & Schedule Conflicts)  
**Status:** **NEEDS REVIEW / CONDITIONAL APPROVAL** (Gated on User Approval before Applying Fixes)

---

## 1. Overall Assessment

Phase 3 implements the identity lifecycle, OTP authentication, self-profile management, charity interest tagging, and volunteer availability rules for the Volunteer Coordination System (`Domains 1, 2, and 3`). The implementation demonstrates high architectural discipline and strict adherence to the project's database-first philosophy:

* **PostgreSQL-Authoritative Authentication**: All OTP generation validation, code hashing verification, and lazy account unblocking delegate directly to PostgreSQL stored procedures (`request_otp`, `verify_otp`, `release_expired_blocks`). Raw OTP secrets are never stored in plaintext and never leaked beyond development mode.
* **Database Trigger Protection**: The PostgreSQL trigger `trg_01_otp_rate_limit` enforces the 5-requests-per-hour limit, and `trg_01_users_guard` backstops profile edits against unauthorized privilege elevation.
* **Defense-in-Depth Profile Security**: Triple-layer security protects user profile updates: (1) Serializer-level `AllowListSerializerMixin` rejecting undeclared keys with HTTP 400; (2) Service-level allow-list and privileged field blacklisting in [`profile_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/profile_service.py); and (3) Database trigger enforcement (`trg_01_users_guard`).
* **Zero Availability Reimplementation**: Weekly availability and schedule conflict checks delegate strictly to PostgreSQL functions `is_user_available(p_user, p_start, p_end)` and `user_has_schedule_conflict(p_user, p_start, p_end, p_except_event)`. No duplicate calculation logic exists in Python.
* **Cryptographic & Data Privacy Compliance**: The user's phone is encrypted with Fernet (`encrypt_phone`) and hashed with keyed HMAC-SHA256 (`compute_phone_hash`). Sensitive fields (`phone_hash`, `phone_enc`, `password`) are strictly masked and never returned in profile API payloads. Emergency contact fields strictly adhere to the database pairing constraint `CHECK ((emergency_contact_name IS NULL) = (emergency_contact_phone_enc IS NULL))`.

However, the implementation has **two high-priority compliance gaps** against the master implementation specification ([`volunteer_coordination_system_v0_6_0_step_by_step_backend_implementation_plan.md`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/prompt%20code/spec/volunteer_coordination_system_v0_6_0_step_by_step_backend_implementation_plan.md) Step P3.1/P3.3 and Master Business Rule `W24`):
1. **Missing Public UUID Lookup Endpoint & Service Function (`W24`)**: The endpoint `GET /api/v1/users/by-uuid/{uuid}/` and service function `lookup_user_by_uuid(actor, target_uuid, event_id=None)` were completely omitted.
2. **Missing UUID URL Route Registration**: No routing for `/api/v1/users/by-uuid/{uuid}/` exists in [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py).

In addition, there are legacy artifacts and untested edge cases:
- Legacy file [`backend/services/otp_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/otp_service.py) contains 12 lines of dead prototype code using unkeyed SHA-256 and 6-digit codes.
- The 5-per-hour OTP request rate limit trigger (`trg_01_otp_rate_limit`) lacks an explicit automated test.

---

## 2. Findings by Severity

```
CRITICAL : 0
HIGH     : 2
MEDIUM   : 2
LOW      : 2
```

### 🔴 CRITICAL Findings
*None identified. There are no SQL injection risks, privilege escalations, or plaintext credential exposures.*

---

### 🟠 HIGH Findings

#### Finding 2.1 — Missing Public UUID Lookup Endpoint & Service Function `lookup_user_by_uuid` (`W24`)
* **Category:** Missing Business Rule / Feature Incompleteness
* **Affected Files:**
  * [`backend/services/profile_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/profile_service.py)
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py)
  * [`backend/bff/volunteer/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/serializers.py)
* **Description:**
  * Master implementation plan Step P3.1 Item 9 explicitly mandates:
    > `lookup_user_by_uuid(actor, target_uuid, event_id=None)`
  * Step P3.3 Item 5 and Master Business Rule `W24` mandate:
    > `GET /api/v1/users/by-uuid/{uuid}/`: Returns `404` (`ResourceMaskedNotFound`) if user does not exist or account is inactive; returns `T2` Event-Scoped Volunteer Card + shift assignment status if `?event_id=` is supplied by an authorized coordinator/manager for an accepted volunteer; or returns `T1` Minimal Public Card (`{"uuid": "...", "display_name": "..."}`) otherwise.
  * Neither the service function `lookup_user_by_uuid` nor the view `UserByUuidView` was implemented.
  * *Impact*: Event coordinators and peer volunteers cannot scan or look up a volunteer by their public UUID barcode/badge.

#### Finding 2.2 — Missing URL Route Mapping for `/api/v1/users/by-uuid/{uuid}/` (`W24`)
* **Category:** API Routing & Integration
* **Affected Files:**
  * [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py)
* **Description:**
  * The URL routing table in [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py) has no pattern registered for `users/by-uuid/<uuid:uuid>/`.
  * External mobile and web clients calling this endpoint receive an unhandled 404 from Django URL resolution rather than a controlled domain response.

---

### 🟡 MEDIUM Findings

#### Finding 2.3 — Missing Automated Test Coverage for OTP Hourly Rate Limit Trigger (`trg_01_otp_rate_limit`)
* **Category:** Test Coverage Gap
* **Affected Files:**
  * [`backend/apps/accounts/tests/test_phase3.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase3.py)
* **Description:**
  * PostgreSQL trigger `trg_01_otp_rate_limit` caps OTP requests to 5 per hour per phone number. On the 6th attempt within 1 hour, PostgreSQL raises `otp_rate_limited`, which [`translate_db_exception()`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/common/exceptions.py) maps to HTTP 429 (`OtpRateLimitError`).
  * While `test_attempt_limit_exceeded_returns_too_many_attempts` validates the 5 wrong verification codes limit (`too_many_attempts`), there is no test asserting that requesting 6 OTPs within 1 hour triggers `otp_rate_limited` and returns HTTP 429.

#### Finding 2.4 — Transaction Boundary Guarantee on Failed OTP Verification in Atomic Contexts
* **Category:** Concurrency & Transaction Integrity
* **Affected Files:**
  * [`backend/services/auth_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/auth_service.py#L183-L198)
* **Description:**
  * PostgreSQL function `verify_otp(p_phone_hash, p_code_hash, p_purpose)` updates `auth_otp.attempt_count = attempt_count + 1` whenever `code_hash` does not match, returning string `'invalid_code'`.
  * In standard autocommit mode, this update is immediately committed by the database.
  * However, if `auth_service.verify_login_otp()` is invoked inside an outer `transaction.atomic()` context (such as transactional test cases or transactional middleware), a subsequent failure or exception would roll back the transaction, rolling back `attempt_count` and defeating brute-force throttling (`too_many_attempts`).
  * *Correction*: Ensure `verify_login_otp` documents or isolates the attempt counter update inside a subtransaction / savepoint to guarantee failed attempt increments are never rolled back.

---

### 🟢 LOW Findings

#### Finding 2.5 — Dead Code & Prototype Drift in Legacy `backend/services/otp_service.py`
* **Category:** Maintainability & Code Hygiene
* **Affected Files:**
  * [`backend/services/otp_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/otp_service.py)
* **Description:**
  * `backend/services/otp_service.py` contains 12 lines of legacy placeholder code:
    ```python
    def generate_otp(length: int = 6) -> str: ...
    def hash_otp(otp: str) -> str: ...
    def verify_otp(raw_otp: str, hashed_otp: str) -> bool: ...
    ```
  * This file generates 6-digit codes (the production system uses 4-digit codes per business rules), uses unkeyed `hashlib.sha256` (the system uses HMAC-SHA256 from `common/utils.py`), and performs comparison in Python rather than calling PostgreSQL `verify_otp`.
  * It is not imported anywhere, but its presence causes confusion for developers. It should either be replaced with re-exports from [`services/auth_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/auth_service.py) or safely deprecated.

#### Finding 2.6 — Dual Semantics in `EventCheckAvailabilityView` (`GET` vs `POST` on `/check/`)
* **Category:** API Design Consistency
* **Affected Files:**
  * [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py#L230-L259)
* **Description:**
  * In [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py), `EventCheckAvailabilityView` implements:
    * `POST`: evaluates general time-window availability via [`availability_service.check_user_availability`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/availability_service.py) (Phase 3).
    * `GET`: evaluates event-specific availability via [`application_service.check_user_availability_for_event`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/application_service.py) (Phase 6).
  * While functional, mixing Phase 3 availability check and Phase 6 event application checking in the same view class creates an unnecessary coupling. Separating them or providing clear docstrings is recommended.

---

## 3. Exact Affected Files

| File | Status | Description |
| :--- | :---: | :--- |
| [`backend/services/profile_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/profile_service.py) | Needs Modification | Add `lookup_user_by_uuid(actor, target_uuid, event_id=None)` enforcing T1 vs T2 visibility. |
| [`backend/bff/volunteer/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/serializers.py) | Needs Modification | Add `UserPublicCardSerializer` and `UserT2CoordinatorCardSerializer` for `W24`. |
| [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py) | Needs Modification | Add `UserByUuidView` implementing `GET /api/v1/users/by-uuid/{uuid}/`. |
| [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py) | Needs Modification | Mount `path("users/by-uuid/<uuid:uuid>/", UserByUuidView.as_view(), name="user-by-uuid")`. |
| [`backend/services/otp_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/otp_service.py) | Needs Modification | Clean up legacy code; re-export functions from `auth_service.py` to maintain backward compatibility. |
| [`backend/apps/accounts/tests/test_phase3.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase3.py) | Needs Modification | Add test cases for `W24` (T1 public card, T2 coordinator card, masked 404) and OTP hourly rate limit. |

---

## 4. Recommended Corrections

> [!IMPORTANT]
> In accordance with instructions, **no files have been modified yet**. The following concrete implementations are prepared for execution upon user confirmation.

### 4.1 Implement `lookup_user_by_uuid` in `backend/services/profile_service.py`

```python
# In backend/services/profile_service.py
from common.exceptions import ResourceMaskedNotFound
from common.privacy import get_minimal_public_card, get_t2_volunteer_card
from common.permissions import can_coordinator_read_t2, get_event_for_manager_or_404

def lookup_user_by_uuid(actor: Users, target_uuid: str, event_id: Optional[int] = None) -> dict:
    """
    Look up a user by their public UUID (W23, W24).
    
    Rules:
      1. Target must exist and have account_status='active', else raise ResourceMaskedNotFound (404).
      2. If event_id is supplied and actor is an event manager (or admin) with T2 access
         for an accepted volunteer on that event, return the T2 card + assignment status.
      3. Otherwise, return strictly the T1 Minimal Public Card ({uuid, display_name}).
    """
    target = Users.objects.filter(uuid=target_uuid, account_status="active", is_active=True).first()
    if target is None:
        raise ResourceMaskedNotFound("User not found.")

    if event_id is not None:
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

    # Default: T1 Minimal Public Card
    return get_minimal_public_card(target)
```

### 4.2 Implement `UserByUuidView` in `backend/bff/volunteer/views.py`

```python
# In backend/bff/volunteer/views.py
class UserByUuidView(APIView):
    """GET /api/v1/users/by-uuid/{uuid}/ — Public UUID lookup & coordinator scan (W24)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, uuid):
        event_id = request.query_params.get("event_id")
        parsed_event_id = int(event_id) if event_id and event_id.isdigit() else None
        data = profile_service.lookup_user_by_uuid(
            actor=request.user,
            target_uuid=uuid,
            event_id=parsed_event_id,
        )
        return Response(data, status=status.HTTP_200_OK)
```

### 4.3 Register Route in `backend/bff/volunteer/urls.py`

```python
# In backend/bff/volunteer/urls.py
urlpatterns = [
    # ... existing routes ...
    path("users/by-uuid/<uuid:uuid>/", UserByUuidView.as_view(), name="user-by-uuid"),
]
```

### 4.4 Clean Up Legacy `backend/services/otp_service.py`

```python
"""
services/otp_service.py
Legacy shim: re-exports authentication and OTP workflows from auth_service.
"""
from services.auth_service import (
    request_login_otp,
    verify_login_otp,
    logout_user,
    set_otp_delivery_adapter,
    get_otp_delivery_adapter,
)

__all__ = [
    "request_login_otp",
    "verify_login_otp",
    "logout_user",
    "set_otp_delivery_adapter",
    "get_otp_delivery_adapter",
]
```

---

## 5. Missing Tests

The following test suite additions should be incorporated into [`backend/apps/accounts/tests/test_phase3.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase3.py):

### 5.1 Public UUID Lookup & Coordinator Scan Tests (`W24`)

```python
class UserByUuidLookupTests(TestCase):
    def setUp(self):
        self.volunteer = _make_user(name="Volunteer Bob")
        self.coordinator = _make_user(name="Coordinator Alice")
        self.other_user = _make_user(name="Regular Charlie")
        self.client = APIClient()

    def test_lookup_user_by_uuid_returns_t1_minimal_public_card(self):
        self.client.force_authenticate(user=self.other_user)
        res = self.client.get(f"/api/v1/users/by-uuid/{self.volunteer.uuid}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["uuid"], str(self.volunteer.uuid))
        self.assertEqual(res.data["display_name"], "Volunteer Bob")
        # Ensure T2/T3 fields are NOT leaked
        self.assertNotIn("phone", res.data)
        self.assertNotIn("skills", res.data)
        self.assertNotIn("blood_type", res.data)

    def test_lookup_nonexistent_or_inactive_uuid_returns_masked_404(self):
        self.client.force_authenticate(user=self.other_user)
        import uuid
        res = self.client.get(f"/api/v1/users/by-uuid/{uuid.uuid4()}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Inactive/blocked user returns 404 masked
        blocked_user = _make_user(account_status="blocked", is_active=False)
        res_blocked = self.client.get(f"/api/v1/users/by-uuid/{blocked_user.uuid}/")
        self.assertEqual(res_blocked.status_code, status.HTTP_404_NOT_FOUND)

    def test_coordinator_scan_with_event_id_returns_t2_card(self):
        # Create event and accepted application
        from apps.events.models import Events, EventApplications
        from apps.accounts.models import CoordinatorProfiles
        from django.utils import timezone
        
        coord_prof = CoordinatorProfiles.objects.create(
            user=self.coordinator,
            status="pending",
        )
        coord_prof.status = "approved"
        coord_prof.save()

        now = timezone.now()
        event = Events.objects.create(
            title="Clean Up Park",
            owner=self.coordinator,
            current_coordinator=self.coordinator,
            start_at=now + timedelta(days=1),
            end_at=now + timedelta(days=1, hours=4),
        )
        event.status = "published"
        event.save()

        EventApplications.objects.create(
            event=event,
            user=self.volunteer,
            status="accepted",
        )

        self.client.force_authenticate(user=self.coordinator)
        res = self.client.get(f"/api/v1/users/by-uuid/{self.volunteer.uuid}/?event_id={event.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["uuid"], str(self.volunteer.uuid))
        self.assertIn("skills", res.data)
        self.assertIn("verification_status", res.data)
        self.assertEqual(res.data["event_id"], event.id)
```

### 5.2 OTP Hourly Rate Limiting Test (`trg_01_otp_rate_limit`)

```python
class OtpHourlyRateLimitTests(TestCase):
    def test_hourly_otp_rate_limit_exceeded_returns_429(self):
        phone = _unique_phone()
        # Make 5 allowed OTP requests within the same hour
        for _ in range(5):
            res = auth_service.request_login_otp(phone)
            self.assertEqual(res["status"], "sent")

        # 6th request triggers trg_01_otp_rate_limit -> translated to OtpRateLimitError (HTTP 429)
        with self.assertRaises(DomainError) as ctx:
            auth_service.request_login_otp(phone)
        self.assertEqual(ctx.exception.code, "otp_rate_limited")
        self.assertEqual(ctx.exception.status_code, 429)
```

---

## 6. Acceptance Criteria Satisfaction Table

| Business Rule / Spec ID | Description | Status | Evidence / Implementation Location |
| :--- | :--- | :---: | :--- |
| **`W01`–`W03`** | Phone normalization, Fernet encryption & HMAC-SHA256 hashing | ✅ PASS | [`common/utils.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/common/utils.py), [`auth_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/auth_service.py#L101-L103) |
| **`W04`** | OTP hourly rate limiting (5 per hour) | ⚠️ PARTIAL | Enforced by PostgreSQL trigger `trg_01_otp_rate_limit`; automated test missing. |
| **`W05`–`W07`** | OTP delivery abstraction & secret masking | ✅ PASS | `ConsoleOtpDeliveryAdapter`; masks code in production, exposes `dev_code` in debug. |
| **`W08`** | OTP verification delegation & attempt counting | ✅ PASS | Stored proc `verify_otp` increments `attempt_count` on `invalid_code`. |
| **`W09`** | OTP code expiration & maximum attempt limits | ✅ PASS | Tested: `test_expired_otp_returns_expired`, `test_attempt_limit_exceeded_returns_too_many_attempts`. |
| **`W10`** | Blocked/Closed account login rejection | ✅ PASS | `test_blocked_account_rejected_at_otp_request`, `test_closed_account_rejected_at_otp_request`. |
| **`W11`** | Lazy block expiry release (`release_expired_blocks`) | ✅ PASS | Called in `request_login_otp` and `verify_login_otp`. |
| **`W12`** | Token authentication & logout invalidation | ✅ PASS | `test_logout_invalidates_token` verifies token deletion. |
| **`W13`, `W23`** | Self-profile retrieval with decrypted phone & public UUID | ✅ PASS | `test_profile_retrieval_api_me` verifies `uuid` present, no `phone_hash`/`phone_enc`. |
| **`W14`–`W16`** | Profile update allow-list & privileged field protection | ✅ PASS | `AllowListSerializerMixin` + `PROFILE_EDITABLE_FIELDS`; rejects `is_admin`, `uuid`, etc. with 400. |
| **`W17`** | Charity interests atomic replacement | ✅ PASS | `test_replace_charity_interests` verifies atomic replacement in `UserCharityInterests`. |
| **`W18`** | Availability retrieval (rules and date exceptions) | ✅ PASS | `get_user_availability()` queries rules and exceptions via ORM. |
| **`W19`** | Weekly availability rules atomic replacement | ✅ PASS | `test_create_and_replace_weekly_rules` verifies atomic deletion and insert. |
| **`W20`–`W21`** | Date exception upsert and delete with owner check | ✅ PASS | `test_upsert_and_delete_exception` & `test_user_cannot_delete_other_user_exception`. |
| **`W22`, `W150`-`W151`** | Availability & conflict evaluation via SQL | ✅ PASS | `is_user_available` & `user_has_schedule_conflict` invoked without Python re-calculation. |
| **`W24`** | Public UUID lookup & coordinator scan endpoint | ❌ MISSING | Endpoint `GET /api/v1/users/by-uuid/{uuid}/` and service `lookup_user_by_uuid` not implemented. |
| **`W25`** | Normalized skills tagging | ✅ PASS | `test_skills_normalization` (strips whitespace, lowercases, deduplicates). |
| **`W26`** | Emergency contact pairing constraint | ✅ PASS | `test_emergency_contact_pairing_constraint` verifies name and phone pairing rule. |

---

## 7. Review Decision & Next Steps

* **Verdict:** **NEEDS REVIEW / CONDITIONAL APPROVAL**
* **Summary:** The core authentication, profile management, and volunteer availability subsystems are solidly architected, performant, and fully compliant with database stored procedures and constraints. However, **Finding 2.1 (Missing `lookup_user_by_uuid` / `W24`)** and **Finding 2.2 (Missing UUID route)** must be resolved to achieve full compliance with Phase 3 specifications.
* **Action Required:** Await user confirmation before modifying codebase files to implement `lookup_user_by_uuid`, `UserByUuidView`, route mapping, and the missing automated tests.

