# Volunteer Coordination System v0.5 — Coding Reference for Gemini Flash

This file is the canonical coding reference for v0.5.

If any other document conflicts with this file, this file wins.

Target stack:

- Python 3.12
- Django 5.1+
- Django REST Framework
- PostgreSQL
- React Native frontend later
- Online-only system
- No offline sync in v0.5
- No payment processing in v0.5
- No disaster mode in v0.5

---

## 0. Golden Rules for Code Generation

1. Business logic lives only in `apps/<app>/services.py`.
2. Views must be thin:
   - validate input with serializers,
   - call one service function,
   - return serialized result.
3. Every state-changing service must:
   - use `transaction.atomic()`,
   - re-check permissions,
   - validate state,
   - write `AuditLog` through `apps.audit.services.log_action`.
4. Use constants from `apps.common.constants`.
   Do not use raw status strings.
5. Use only these exception classes:
   - `DomainError`
   - `PermissionDeniedError`
   - `AccountBlockedError`
   - `AccountClosedError`
   - `InvalidStateError`
   - `CapacityFullError`
   - `OnboardingRequiredError`
   - `ApplicationNotAllowedError`
   - `QrTokenInvalidError`
   - `NotFoundError`
   - `InvalidOtpError`
   - `TooManyAttemptsError`
   - `VerificationRequiredError`
6. Use PostgreSQL-only Django constraints:
   - `models.CheckConstraint(condition=...)`
   - `models.UniqueConstraint(condition=...)`
   - partial indexes
   - `GinIndex` for array fields
7. Do NOT use `CheckConstraint(check=...)`.
   Use `condition=...`.
8. Do NOT store:
   - raw OTP codes,
   - raw QR tokens,
   - plain phone numbers,
   - binary image data in DB.
9. Verification images:
   - accept image upload,
   - convert to JPEG with Pillow,
   - strip EXIF,
   - save to private storage,
   - store path and SHA-256 only.
10. Phone number:
   - store `phone_hash` as HMAC-SHA256,
   - store `phone_enc` encrypted,
   - never expose `phone_enc` in API responses.
11. QR tokens:
   - generate raw token once,
   - store only token hash,
   - raw token is never returned again.
12. Event soft delete:
   - normal queries must use `Event.objects.visible()`.
13. Admin moderation actions must update target state and write moderation + audit logs in one transaction.
14. Do not create SQL views or unmanaged models in v0.5.
15. Do not build React Native admin screens in v0.5.
16. Tests must be written for every module.

---

## 1. Locked Product Decisions

| ID | Decision |
|---|---|
| D1 | Volunteer confirmation of assignment is optional. Check-in is allowed for assignment status `assigned` or `confirmed`. |
| D2 | User verification is not required to apply to events. Verification is required before admin can approve a coordinator. |
| D3 | Event activation is manual: `draft -> published -> active -> completed`. |
| D4 | Capacity with post: `post.required_headcount - active assignments for that post`. Capacity without post: `event.max_participants - accepted applications`, if `max_participants` is not null. |
| D5 | Auth uses DRF `TokenAuthentication` with a custom blocked-account check. |
| D6 | API root is `/api/v1/`. |
| D7 | Admin UI is Django admin only in v0.5. |
| D8 | QR flow uses `resolve` then `redeem`. |
| D9 | Heavy physical work requires `physical_ok=True` and `can_lift_heavy=True`. Medium requires `physical_ok=True`. Light has no physical requirement. |
| D10 | Feedback score is required and must be 1 to 5. |
| D11 | Waitlist promotion is manual only. |
| D12 | Onboarding must be acknowledged before check-in if `event.require_onboarding_ack=True`. |

---

## 2. Canonical App Structure

```text
apps/
  common/
    constants.py
    exceptions.py
    security.py
    permissions.py
    pagination.py
    validators.py
    fields.py
  accounts/
    models.py
    services.py
    serializers.py
    views.py
    urls.py
    admin.py
    authentication.py
    tests/
  events/
    models.py
    services.py
    serializers.py
    views.py
    urls.py
    admin.py
    tests/
  ops/
    models.py
    services.py
    serializers.py
    views.py
    urls.py
    admin.py
    tests/
  audit/
    models.py
    services.py
    serializers.py
    views.py
    urls.py
    admin.py
    tests/