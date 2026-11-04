Error: API error (attempt 1): request failed: Post "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse": write tcp 192.168.10.198:59134->172.217.113.4:443: wsasend: An existing connection was forcibly closed by the remote host. (Error ID: f84fac3a-d12c-4ddd-b581-eae2bee5b580-517)

Ran list ref_code directory
Analyzed ref_phase4.md:L1-200
Analyzed ref_phase4.md:L201-450
Analyzed ref_phase4.md:L451-750
Analyzed ref_phase4.md:L751-1066
Ran list admin_portal directory
Analyzed views.py:L1-11
Analyzed urls.py:L1-8
Analyzed urls.py:L1-10
Analyzed models.py:L1-100
Analyzed models.py:L131-191
Ran inspect recompute_user_verification function
Ran inspect trigger functions
Ran inspect trg_vimg_guard lines
Ran check ck_verification_no_self_review
Ran check ck_coordinator_no_self_approval
Ran check MEDIA in settings/base.py
Edited base.py
Created verification_service.py
Created coordinator_service.py
Edited __init__.py
Analyzed serializers.py:L120-160
Edited serializers.py
Edited serializers.py
Analyzed views.py:L100-140
Analyzed views.py:L140-168
Edited views.py
Edited views.py
Analyzed urls.py:L1-46
Edited urls.py
Edited urls.py
Created serializers.py
Analyzed views.py:L1-11
Edited views.py
Edited urls.py
Analyzed urls.py:L1-9
Edited urls.py
Ran run django check
Created test_phase4.py
Ran run test_phase4.py · Exited with code 1
Ran check ensure_admin definition
Edited serializers.py
Edited test_phase4.py
Ran re-run test_phase4.py · Exited with code 1
Edited test_phase4.py
Edited test_phase4.py
Ran re-run test_phase4.py · Exited with code 1
Ran run test_invalid_transition_review_twice
Ran run test_phase4 with verbosity 2 · Exited with code 1
Ran run both tests · Exited with code 1
Ran check log_security_event implementation
Ran check django connection · Exited with code 1
Ran check psycopg connection status · Exited with code 1
Edited test_phase4.py
Ran run the two tests without resp.close()
Ran run all test_phase4.py tests
Ran run full test suite
Ran check git status

# Phase 4 Completion Report: Identity Verification and Coordinator Lifecycle

Phase 4 of the Volunteer Coordination System v0.6.0 has been implemented and verified. All 14 testing requirements and acceptance criteria have been satisfied, and the entire test suite passes cleanly.

---

### 1. Summary of Changes

#### Files Created
- [`backend/services/verification_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/verification_service.py): Identity verification service providing image validation (dimensions, file size, format), EXIF-stripping sanitization, SHA-256 calculation, secure storage, admin review workflow, and verification status recalculation (`recompute_user_verification()`).
- [`backend/services/coordinator_service.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/coordinator_service.py): Coordinator lifecycle service supporting volunteer applications (verified users only), application note updates, admin reviews (`approve`, `suspend`, `revoke`), and SQL helper check `is_approved_coordinator()`.
- [`backend/admin_portal/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/serializers.py): DRF serializers for `ReviewImageSerializer` and `AdminVerificationImageSerializer`.
- [`backend/apps/accounts/tests/test_phase4.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/apps/accounts/tests/test_phase4.py): 29 unit and API integration tests covering all 14 acceptance test scenarios.

#### Files Modified
- [`backend/config/settings/base.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/config/settings/base.py): Added `VERIFICATION_MAX_UPLOAD_BYTES`, `VERIFICATION_MIN_DIMENSION`, and `VERIFICATION_MAX_DIMENSION` settings.
- [`backend/services/__init__.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/services/__init__.py): Exported `verification_service` and `coordinator_service`.
- [`backend/bff/volunteer/serializers.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/serializers.py): Added `VerificationImageUploadSerializer`, `VerificationImageSerializer`, `CoordinatorProfileSerializer`, and `CoordinatorApplySerializer`.
- [`backend/bff/volunteer/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/views.py): Added `MeVerificationImagesView` (upload & list) and `MeCoordinatorView` (get, apply, update notes).
- [`backend/bff/volunteer/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/volunteer/urls.py): Mounted routes `/api/v1/me/verification-images/` and `/api/v1/me/coordinator/`.
- [`backend/admin_portal/views.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/views.py): Added administrative endpoints: `AdminPendingVerificationImagesView`, `AdminVerificationImageFileView`, `AdminReviewVerificationImageView`, `AdminPendingCoordinatorsView`, and `AdminCoordinatorDecisionView`.
- [`backend/admin_portal/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/admin_portal/urls.py): Mounted administrative endpoints.
- [`backend/bff/urls.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer%20HR%20Management/python%20stack/backend/bff/urls.py): Mounted `path('admin/', include('admin_portal.urls'))`.

---

### 2. Key Architectural Decisions & Rationale

1. **Database-First Verification State Machine**:
   - Python code never computes or updates `users.verification_status` directly.
   - When an image is created or reviewed, PostgreSQL trigger `trg_50_vimg_after` automatically calls stored function `recompute_user_verification(p_user)`.
   - A user transitions to `'verified'` only when an approved `mock_selfie` and an approved ID license (`id_license` or `driver_license`) exist.
2. **Strict Private Storage Architecture**:
   - Verification images are stored outside public `MEDIA_ROOT` in `VERIFICATION_MEDIA_ROOT` (`private_media/verification_images/`).
   - Images are never served directly by static/media file servers. They can only be accessed through the admin-gated streaming endpoint (`/api/v1/admin/verification-images/<id>/file/`).
   - Non-admin requests receive a masked HTTP 404 (`ResourceMaskedNotFound`), and the security event `security.warning.admin_image_view` is recorded in audit logs.
   - Internal paths and file contents are never exposed in volunteer-facing serializers.
3. **Coordinator Lifecycle & Prerequisite Guards**:
   - Rule W34: Only active, verified users can apply for coordinator status. Unverified applicants are rejected with `not_verified`.
   - Triggers `trg_01_coordinator_guard` and check constraint `ck_coordinator_no_self_approval` strictly enforce:
     - New coordinator profiles always start as `'pending'`.
     - Valid state transitions: `pending -> approved | revoked`, `approved -> suspended | revoked`, `suspended -> approved | revoked`.
     - `'revoked'` is terminal.
     - Approver must be an active admin, and self-approval is forbidden at both service and database constraint levels.

---

### 3. Test Results

Ran the full test suite across all apps and phases:
```text
Ran 153 tests in 4.624s

OK
```
- **Phase 1 Tests**: 57 tests passed (DB session context, atomic transactions, exceptions, permission helpers, privacy tiers).
- **Phase 2 Tests**: 28 tests passed (Public event browsing, capacities, draft masking, coordinator event summary).
- **Phase 3 Tests**: 39 tests passed (OTP authentication, profile management, skills, availability rules, date exceptions, conflicts).
- **Phase 4 Tests**: 29 tests passed (Valid JPEG upload, size/dimension guards, private file streaming, recalculation, self-review blocks, coordinator application/approval/suspension/revocation, permissions).
- **Pass Rate**: 100% (153/153 passed, 0 failures, 0 errors).

---

### 4. Known Limitations & Technical Debt Deferred

- **Facial Comparison / ML Matching**: `comparison_status` and `comparison_score` are stored and supported in the review workflow, but automated facial recognition ML pipelines are external services outside the current phase scope.
- **Event Management by Coordinators**: Coordinator profile approval and revocation are operational; event assignment and coordinator-specific operational tools are scheduled for Phase 5.

---

### 5. Verification Checklist

| Requirement | Status | Evidence |
| :--- | :---: | :--- |
| 1. Valid JPEG Upload | ✅ | `test_valid_jpeg_upload`, `test_upload_api_endpoint` |
| 2. Invalid Image Format | ✅ | `test_invalid_image_format_rejected` (HTTP 400 `invalid_image`) |
| 3. Oversized Image | ✅ | `test_oversized_image_rejected` (HTTP 400 `image_too_large`) |
| 4. Unauthorized Image Retrieval | ✅ | `test_unauthorized_image_retrieval` (masked 404 for non-admins) |
| 5. Verification Status Retrieval | ✅ | `test_status_retrieval`, `test_status_retrieval_api` |
| 6. Verification Recalculation | ✅ | `test_recalculation_to_verified`, `test_recalculation_to_rejected`, SQL delegation |
| 7. Valid Reviewer Decision | ✅ | `test_valid_reviewer_decision`, `test_admin_review_api` |
| 8. Invalid Verification Transition | ✅ | `test_invalid_transition_review_twice`, `test_self_review_rejected` |
| 9. Coordinator Application | ✅ | `test_coordinator_application`, `test_unverified_cannot_apply` (400 `not_verified`) |
| 10. Coordinator Approval | ✅ | `test_coordinator_approval`, `test_coordinator_approval_api` (sets `approved_by` & `approved_at`) |
| 11. Coordinator Suspension | ✅ | `test_coordinator_suspension` (`approved` -> `suspended`) |
| 12. Coordinator Revocation | ✅ | `test_coordinator_revocation`, `test_revoked_cannot_transition` (terminal state) |
| 13. Non-Admin Approval Attempt | ✅ | `test_non_admin_approval_rejected` (`PermissionDeniedError`) |
| 14. Unapproved Coordinator Denial | ✅ | `test_unapproved_coordinator_permission_denied` via `is_approved_coordinator` |

---

Phase 4 is complete. In adherence to the phase completion protocol, execution is paused. Please provide your review and confirmation or prompt when you are ready to proceed to **Phase 5 (Event Creation and Coordinator Management)**.