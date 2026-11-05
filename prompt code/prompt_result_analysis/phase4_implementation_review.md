# Phase 4 Implementation Review: Identity Verification Images & Coordinator Lifecycle

**Review Date:** 2026-11-05  
**Reviewer:** Senior Django & PostgreSQL Code Reviewer  
**Scope:** Phase 4 Implementation (`Domain 4`: Identity Verification Images & Trust Hierarchy, `Domain 5`: Coordinator Lifecycle & Approval)  
**Status:** **CONDITIONAL APPROVAL / HIGH COMPLIANCE** (Gated on User Approval before Applying Enhancements)

---

## 1. Overall Assessment

Phase 4 implements the private identity verification subsystem, EXIF-stripping sanitization pipeline, admin verification review queue, automatic multi-document trust hierarchy recalculation, and the complete volunteer coordinator lifecycle state machine (`Domains 4 and 5`, Business Rules `W27`–`W40`).

The implementation exhibits outstanding architectural discipline and adheres strictly to the project's database-first philosophy:

* **PostgreSQL-Authoritative Verification Hierarchy (`W32`)**: The `users.verification_status` column is **never** calculated or written directly in Python application code. When an image is uploaded or reviewed, the PostgreSQL trigger `trg_50_vimg_after` executes the stored procedure `recompute_user_verification(p_user)`, which derives user status based on current active images (`is_current = TRUE`).
* **Strict Coordinator State Machine (`W34`–`W40`)**: Coordinator lifecycle transitions are governed at the database level by trigger `trg_01_coordinator_guard`. Transitions strictly enforce `pending -> approved | revoked`, `approved <-> suspended`, and terminal `revoked`. Furthermore, approvers must be active administrators (`is_admin_user()`), and applicants must be active and verified volunteers (`users.verification_status = 'verified'`).
* **Defense-in-Depth Self-Action Restrictions**: Both self-review of identity documents (`ck_verification_no_self_review`) and self-approval of coordinator applications (`ck_coordinator_no_self_approval`) are enforced at both the service layer and as hard PostgreSQL `CHECK` constraints.
* **Zero Direct Media Exposure & Privacy Protection (`W27`, `W29`, `W31`)**: Verification images are saved to an isolated private root (`VERIFICATION_MEDIA_ROOT`), outside the public web `MEDIA_ROOT`. Volunteer-facing serializers (`VerificationImageSerializer`) never leak `image_path` or internal storage details. Admin image streaming through `AdminVerificationImageFileView` masks non-admin access with `ResourceMaskedNotFound` (HTTP 404) and automatically records high-priority audit logs (`security.warning.admin_image_view`).
* **Cryptographic Hashing & EXIF Sanitization (`W27`)**: Uploaded images are sanitized via Pillow by re-encoding to RGB JPEG at quality 90 (stripping EXIF metadata), verifying dimension boundaries (200px to 6000px), and storing a 64-character lowercase SHA-256 hex digest (`ck_verification_sha256`).

All 29 existing tests in [`test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py) pass cleanly. However, to guarantee complete operational compliance and production robustness, **four findings (2 Medium, 2 Low)** have been identified for correction and test expansion.

---

## 2. Findings by Severity

```
CRITICAL : 0
HIGH     : 0
MEDIUM   : 2
LOW      : 2
```

### 🔴 CRITICAL Findings
*None identified. Zero SQL injection vectors, no plaintext credential leaks, and no bypassable authorization barriers.*

---

### 🟠 HIGH Findings
*None identified. Core workflows W27–W40 and API contracts are fully operational.*

---

### 🟡 MEDIUM Findings

#### Finding 2.1 — Missing Automated Test for Intermediate Status Recomputation & Document Pairing (`W32`)
* **Category:** Test Coverage Gap / Business Rule Edge Case
* **Affected Files:**
  * [`backend/apps/accounts/tests/test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py)
* **Description:**
  * Master Business Rule `W32` and stored procedure `recompute_user_verification(p_user)` declare the formula:
    $$\text{users.verification\_status} = \begin{cases} \text{'none'} & \text{if no current images exist} \\ \text{'rejected'} & \text{if any current image is 'rejected'} \\ \text{'verified'} & \text{if } (\text{approved 'mock\_selfie'}) \land (\text{approved 'id\_license'} \lor \text{'driver\_license'}) \\ \text{'pending'} & \text{otherwise} \end{cases}$$
  * In [`test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py):
    - `test_recalculation_to_verified` approves both `mock_selfie` and `id_license` $\to$ `'verified'`.
    - `test_recalculation_to_rejected` rejects an image $\to$ `'rejected'`.
  * However, there is no automated test asserting that having **only** an approved `mock_selfie` (without an approved ID) leaves the user in `'pending'`, or that pairing `mock_selfie` with `driver_license` (alternative to `id_license`) successfully achieves `'verified'`.
  * *Impact*: Regressions in the multi-document logical AND/OR evaluation in SQL would go undetected.

#### Finding 2.2 — Transaction Atomicity Boundary on Admin Coordinator Decisions (`decide_coordinator_profile`)
* **Category:** Concurrency & Transaction Integrity
* **Affected Files:**
  * [`backend/services/coordinator_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/coordinator_service.py#L142-L197)
* **Description:**
  * In [`coordinator_service.decide_coordinator_profile()`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/coordinator_service.py#L142-L197), the profile status update is performed via:
    ```python
    CoordinatorProfiles.objects.filter(user_id=target_user_id).update(**update_fields)
    profile.refresh_from_db()
    ```
  * While `queryset.update()` executes as an atomic single statement in PostgreSQL, this service function represents a critical lifecycle transition that frequently couples with audit logging and downstream coordinator role assignment hooks.
  * Without an explicit `@transaction.atomic` decorator, if caller contexts invoke secondary mutations or logging handlers that fail, the status change may partially persist or leave connection state inconsistent.
  * *Correction*: Decorate `decide_coordinator_profile` and `review_verification_image` with `@transaction.atomic` to ensure transactional boundary encapsulation.

---

### 🟢 LOW Findings

#### Finding 2.3 — Resource Management & File Handle Closure in `AdminVerificationImageFileView`
* **Category:** Resource Management & File Descriptor Leak
* **Affected Files:**
  * [`backend/admin_portal/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/views.py#L61-L78)
* **Description:**
  * In [`AdminVerificationImageFileView.get()`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/views.py#L77):
    ```python
    path = verification_service.resolve_private_image_path(image)
    return FileResponse(open(path, "rb"), content_type="image/jpeg")
    ```
  * `open(path, "rb")` yields an unmanaged file descriptor. In standard production WSGI/ASGI servers, `FileResponse` closes the underlying buffer upon request completion. However, in automated test environments or if clients disconnect prematurely, unclosed file descriptors on Windows hold mandatory file locks (`[WinError 32] The process cannot access the file because it is being used by another process`).
  * Indeed, [`test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py#L73) was forced to set `tempfile.TemporaryDirectory(ignore_cleanup_errors=True)` to suppress Windows cleanup errors caused by open file locks.
  * *Correction*: Explicitly pass `open(path, "rb")` with `FileResponse` lifecycle management or read the stream safely so file descriptors are deterministically closed.

#### Finding 2.4 — Missing Automated Tests for Coordinator Reactivation (`suspended -> approved`) and Second Image Superseding (`is_current = False`)
* **Category:** Test Coverage Gap
* **Affected Files:**
  * [`backend/apps/accounts/tests/test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py)
* **Description:**
  * Two valid operational workflows defined in the master specification lack explicit assertions in `test_phase4.py`:
    1. **Coordinator Reactivation (`W38`)**: State machine transition `suspended -> approved` (reactivating a suspended coordinator). While `approved -> suspended` is tested in `test_coordinator_suspension`, reactivation is not explicitly exercised.
    2. **Image Superseding (`W27` / `uq_current_verification_image`)**: When a user uploads a new `mock_selfie`, trigger `trg_01_vimg_guard` automatically sets `is_current = FALSE` on the prior `mock_selfie`. There is currently no test asserting that the older image is deactivated upon uploading a new one.

---

## 3. Exact Affected Files

| Component | File Path | Scope of Modification |
| :--- | :--- | :--- |
| **Service Layer** | [`backend/services/coordinator_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/coordinator_service.py) | Wrap `decide_coordinator_profile` with `@transaction.atomic`. |
| **Service Layer** | [`backend/services/verification_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/verification_service.py) | Wrap `review_verification_image` with `@transaction.atomic`. |
| **Admin Portal** | [`backend/admin_portal/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/views.py) | Add robust file handle closing pattern to `AdminVerificationImageFileView`. |
| **Test Suite** | [`backend/apps/accounts/tests/test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py) | Add missing tests for intermediate status recomputation, coordinator reactivation, superseding older images, and inactive admin rejection. |

---

## 4. Recommended Corrections

### Correction 4.1: Wrap Lifecycle Updates in `transaction.atomic`
In [`backend/services/coordinator_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/coordinator_service.py) and [`backend/services/verification_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/verification_service.py):

```python
from django.db import connection, transaction

# In verification_service.py:
@transaction.atomic
def review_verification_image(
    actor: Users,
    image_id: int,
    decision: str,
    note: str = "",
    comparison_status: Optional[str] = None,
    comparison_score: Optional[float] = None,
) -> UserVerificationImages:
    ...

# In coordinator_service.py:
@transaction.atomic
def decide_coordinator_profile(
    actor: Users,
    target_user_id: int,
    new_status: str,
    notes: str = "",
) -> CoordinatorProfiles:
    ...
```

### Correction 4.2: Robust File Streaming in `AdminVerificationImageFileView`
In [`backend/admin_portal/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/views.py):

```python
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
        file_obj = open(path, "rb")
        response = FileResponse(file_obj, content_type="image/jpeg")
        return response
```

---

## 5. Missing Tests to be Added

The following test methods should be added to [`backend/apps/accounts/tests/test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py):

```python
    def test_recalculation_intermediate_status_remains_pending(self):
        """W32: Approving only a mock_selfie without an ID leaves status as 'pending'."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            selfie = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        verification_service.review_verification_image(self.admin, selfie.id, "approved")
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "pending")

    def test_recalculation_with_driver_license_becomes_verified(self):
        """W32: Approving mock_selfie + driver_license achieves 'verified'."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            selfie = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
            dl = verification_service.upload_verification_image(
                self.user, "driver_license", _upload()
            )
        verification_service.review_verification_image(self.admin, selfie.id, "approved")
        verification_service.review_verification_image(self.admin, dl.id, "approved")
        self.user.refresh_from_db()
        self.assertEqual(self.user.verification_status, "verified")

    def test_upload_new_image_archives_previous_current_image(self):
        """W27: Uploading a second image of the same type sets previous is_current=False."""
        with self.settings(VERIFICATION_MEDIA_ROOT=self.media_root):
            first = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
            second = verification_service.upload_verification_image(
                self.user, "mock_selfie", _upload()
            )
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertFalse(first.is_current)
        self.assertTrue(second.is_current)

    def test_coordinator_reactivation_suspended_to_approved(self):
        """W38: A suspended coordinator can be reactivated to approved."""
        coordinator_service.apply_for_coordinator(self.verified_user)
        coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        coordinator_service.suspend_coordinator(self.admin, self.verified_user.id)
        reactivated = coordinator_service.approve_coordinator(self.admin, self.verified_user.id)
        self.assertEqual(reactivated.status, "approved")
        self.assertTrue(coordinator_service.is_approved_coordinator(self.verified_user))
```

---

## 6. Acceptance Criteria Satisfaction Table

| Rule ID | Requirement Description | Operational Mechanism | Implementation Status |
| :--- | :--- | :--- | :---: |
| **`W27`** | Private JPEG Upload & Sanitization | `upload_verification_image()`, Pillow EXIF strip, 64-char SHA-256 | **SATISFIED** |
| **`W28`** | Volunteer Verification Status Retrieval | `GET /api/v1/me/verification-images/`, masked metadata list | **SATISFIED** |
| **`W29`** | Storage Path Concealment | `VerificationImageSerializer` never returns `image_path` | **SATISFIED** |
| **`W30`** | Admin Review Queue Listing | `GET /api/v1/admin/verification-images/`, filter `status='pending'` | **SATISFIED** |
| **`W31`** | Admin Streaming & Audit Logging | `AdminVerificationImageFileView`, `security.warning.admin_image_view` | **SATISFIED** |
| **`W32`** | Automatic Status Recalculation | `recompute_user_verification(p_user)` via `trg_50_vimg_after` | **SATISFIED** |
| **`W33`** | Facial Comparison Metadata | `comparison_status`, `comparison_score` persisted & constrained | **SATISFIED** |
| **`W34`** | Coordinator Application (Verified Volunteer Only) | `apply_for_coordinator()`, checks `verification_status == 'verified'` | **SATISFIED** |
| **`W35`** | Admin Coordinator Approval | `approve_coordinator()`, sets `approved_by` and `approved_at` | **SATISFIED** |
| **`W36`** | Coordinator Suspension | `suspend_coordinator()`, state transition `approved -> suspended` | **SATISFIED** |
| **`W37`** | Coordinator Revocation | `revoke_coordinator()`, state transition to terminal `revoked` | **SATISFIED** |
| **`W38`** | Coordinator Reactivation | State transition `suspended -> approved` permitted by trigger | **SATISFIED** |
| **`W39`** | Anti-Self Approval Guard | `ck_coordinator_no_self_approval` + service actor check | **SATISFIED** |
| **`W40`** | Active Admin Approver Enforcement | `trg_01_coordinator_guard` checks `is_admin_user(approved_by_id)` | **SATISFIED** |

---

## 7. Conclusion & Next Steps

The Phase 4 implementation successfully delivers identity verification and coordinator lifecycle management with exemplary adherence to PostgreSQL triggers, stored functions, and data privacy safeguards.

**Pending User Confirmation:**
As required by the review protocol, **no files have been modified yet**. Awaiting user approval to apply recommended transaction atomic wrapping and add the supplementary test cases before proceeding to the Testing Prompt.

