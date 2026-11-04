"""
services/onboarding_service.py

Pre-work digital onboarding: retrieve requirements and record acknowledgments.

Database-first rules honoured here:
- trg_01_onboarding_before_insert enforces event open, version match, self-only,
  and applicant-only acknowledgment.
- onboarding_acknowledgments is append-only; existing acknowledgments are never
  overwritten. Re-acknowledging the current version is idempotent.
"""
from __future__ import annotations

import logging

from apps.accounts.models import OnboardingAcknowledgments
from apps.events.models import EventApplications, Events
from common.exceptions import DomainError
from common.permissions import get_visible_event_or_404

logger = logging.getLogger(__name__)

ACTIVE_APPLICATION_STATUSES = ("pending", "accepted", "waitlisted")


def get_event_onboarding(user, event_id: int) -> dict:
    """Return onboarding requirements and the user's acknowledgment status."""
    event = get_visible_event_or_404(user, event_id)

    acknowledged = OnboardingAcknowledgments.objects.filter(
        user=user, event_id=event_id, onboarding_version=event.onboarding_version
    ).exists()

    return {
        "event_id": event_id,
        "onboarding_text": event.onboarding_text,
        "onboarding_version": event.onboarding_version,
        "require_onboarding_ack": event.require_onboarding_ack,
        "acknowledged": acknowledged,
    }


def acknowledge_event_onboarding(user, event_id: int) -> OnboardingAcknowledgments:
    """
    Record an app_tick acknowledgment for the event's current onboarding version.

    Idempotent: if the user already acknowledged the current version, the
    existing row is returned and no new row is written (append-only preserved).
    """
    event = get_visible_event_or_404(user, event_id)

    # Service-level pre-check mirroring trg_01_onboarding_before_insert.
    has_application = EventApplications.objects.filter(
        event_id=event_id, user=user, status__in=ACTIVE_APPLICATION_STATUSES
    ).exists()
    if not has_application:
        raise DomainError(
            code="not_applicant",
            message="Only applicants of this event can acknowledge its onboarding.",
            status_code=400,
        )

    existing = OnboardingAcknowledgments.objects.filter(
        user=user, event_id=event_id, onboarding_version=event.onboarding_version
    ).first()
    if existing is not None:
        return existing  # idempotent; never overwrite

    ack = OnboardingAcknowledgments.objects.create(
        user=user,
        event=event,
        onboarding_version=event.onboarding_version,
        method="app_tick",
    )
    logger.info(
        "Onboarding acknowledged",
        extra={"user_id": user.id, "event_id": event_id, "version": event.onboarding_version},
    )
    return ack

