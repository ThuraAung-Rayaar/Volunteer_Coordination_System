# apps/events/services.py
from django.db import transaction
from django.utils import timezone

from apps.audit.services import log_action
from apps.common.constants import (
    ACTIVE_APPLICATION_STATUSES,
    ACTIVE_ASSIGNMENT_STATUSES,
    APPLICATION_ACCEPTED,
    APPLICATION_PENDING,
    APPLICATION_REJECTED,
    APPLICATION_WAITLISTED,
    APPLICATION_WITHDRAWN,
    ASSIGNMENT_CANCELLED,
    ASSIGNMENT_COMPLETED,
    ATTENDANCE_ABSENT,
    ATTENDANCE_CHECKED_IN,
    ATTENDANCE_COMPLETED,
    ATTENDANCE_EXPECTED,
    EVENT_ACTIVE,
    EVENT_CANCELLED,
    EVENT_COMPLETED,
    EVENT_DRAFT,
    EVENT_PUBLISHED,
)
from apps.common.exceptions import (
    CapacityFullError,
    DomainError,
    InvalidStateError,
    PermissionDeniedError,
)
from apps.common.permissions import (
    ensure_active_account,
    ensure_admin,
    ensure_approved_coordinator,
    ensure_event_manager,
    is_admin,
)
from apps.events.models import CharityField, Event, EventApplication, EventCharityField, EventPost


def create_event(actor, data: dict, charity_codes: list[str] = ()) -> Event:
    """
    Coordinator or Admin creates a new event in draft status.
    """
    if not is_admin(actor):
        ensure_approved_coordinator(actor)

    clean_data = dict(data)
    # Ensure status starts at draft and coordinator is actor
    clean_data["status"] = EVENT_DRAFT
    clean_data["coordinator"] = actor
    clean_data.setdefault("onboarding_version", 1)

    # Pop charity codes if included in data dict
    codes = charity_codes or clean_data.pop("charity_codes", ())

    with transaction.atomic():
        event = Event.objects.create(**clean_data)
        if codes:
            set_event_charity_fields(actor, event, codes)

        log_action(
            actor=actor,
            action="create_event",
            entity_type="event",
            entity_id=event.id,
            after_data={"title": event.title, "start_at": str(event.start_at)},
        )

    return event


def update_event(actor, event: Event, data: dict) -> Event:
    """
    Coordinator or Admin updates event fields.
    If onboarding_text changes, onboarding_version is incremented automatically.
    """
    ensure_event_manager(actor, event)

    clean_data = dict(data)
    # Do not allow arbitrary status jumps via update_event
    clean_data.pop("status", None)
    clean_data.pop("coordinator", None)

    with transaction.atomic():
        # Check if onboarding_text changed
        if "onboarding_text" in clean_data:
            new_text = clean_data["onboarding_text"]
            if new_text != event.onboarding_text:
                event.onboarding_version += 1

        codes = clean_data.pop("charity_codes", None)
        if codes is not None:
            set_event_charity_fields(actor, event, codes)

        for field, value in clean_data.items():
            if hasattr(event, field):
                setattr(event, field, value)

        event.clean()
        event.save()

        log_action(
            actor=actor,
            action="update_event",
            entity_type="event",
            entity_id=event.id,
            after_data={k: str(v) for k, v in clean_data.items()},
        )

    return event


def publish_event(actor, event: Event) -> Event:
    """
    Transition event from draft to published.
    Requires at least one post.
    """
    ensure_event_manager(actor, event)

    if event.status != EVENT_DRAFT:
        raise InvalidStateError(f"Cannot publish event in status '{event.status}'. Must be 'draft'.")

    if not event.posts.exists():
        raise DomainError("Event must have at least one post before publishing.", code="post_required")

    with transaction.atomic():
        event.status = EVENT_PUBLISHED
        event.save(update_fields=["status"])

        log_action(
            actor=actor,
            action="publish_event",
            entity_type="event",
            entity_id=event.id,
        )

    return event


def activate_event(actor, event: Event) -> Event:
    """
    Transition event from published to active.
    """
    ensure_event_manager(actor, event)

    if event.status != EVENT_PUBLISHED:
        raise InvalidStateError(f"Cannot activate event in status '{event.status}'. Must be 'published'.")

    with transaction.atomic():
        event.status = EVENT_ACTIVE
        event.save(update_fields=["status"])

        log_action(
            actor=actor,
            action="activate_event",
            entity_type="event",
            entity_id=event.id,
        )

    return event


def complete_event(actor, event: Event) -> Event:
    """
    Transition event from active to completed.
    Cascades status:
    - Active/confirmed assignments become completed
    - Checked-in attendances become completed
    """
    ensure_event_manager(actor, event)

    if event.status != EVENT_ACTIVE:
        raise InvalidStateError(f"Cannot complete event in status '{event.status}'. Must be 'active'.")

    from apps.ops.models import Assignment, Attendance

    with transaction.atomic():
        event.status = EVENT_COMPLETED
        event.save(update_fields=["status"])

        # Complete active assignments
        Assignment.objects.filter(
            event=event,
            status__in=ACTIVE_ASSIGNMENT_STATUSES,
        ).update(status=ASSIGNMENT_COMPLETED)

        # Complete checked-in attendances
        Attendance.objects.filter(
            event=event,
            status=ATTENDANCE_CHECKED_IN,
        ).update(status=ATTENDANCE_COMPLETED)

        log_action(
            actor=actor,
            action="complete_event",
            entity_type="event",
            entity_id=event.id,
        )

    return event


def cancel_event(actor, event: Event, reason: str = "") -> Event:
    """
    Cancel an event (from published or active).
    Cascades:
    - Active assignments become cancelled
    - Expected attendances (not checked in) become absent
    """
    ensure_event_manager(actor, event)

    if event.status not in (EVENT_PUBLISHED, EVENT_ACTIVE):
        raise InvalidStateError(
            f"Cannot cancel event in status '{event.status}'. Must be 'published' or 'active'."
        )

    from apps.ops.models import Assignment, Attendance

    with transaction.atomic():
        event.status = EVENT_CANCELLED
        event.save(update_fields=["status"])

        # Cancel active assignments
        Assignment.objects.filter(
            event=event,
            status__in=ACTIVE_ASSIGNMENT_STATUSES,
        ).update(status=ASSIGNMENT_CANCELLED)

        # Mark expected attendance as absent
        Attendance.objects.filter(
            event=event,
            status=ATTENDANCE_EXPECTED,
        ).update(status=ATTENDANCE_ABSENT)

        log_action(
            actor=actor,
            action="cancel_event",
            entity_type="event",
            entity_id=event.id,
            after_data={"reason": reason},
        )

    return event


def set_event_charity_fields(actor, event: Event, charity_codes: list[str]) -> None:
    """
    Replace event charity fields atomically.
    """
    ensure_event_manager(actor, event)

    with transaction.atomic():
        valid_fields = list(CharityField.objects.filter(code__in=charity_codes, active=True))
        EventCharityField.objects.filter(event=event).delete()
        EventCharityField.objects.bulk_create(
            [EventCharityField(event=event, field_code=field) for field in valid_fields]
        )


def add_post(actor, event: Event, data: dict) -> EventPost:
    """
    Add recruiting post to event.
    """
    ensure_event_manager(actor, event)

    with transaction.atomic():
        clean_data = dict(data)
        clean_data["event"] = event
        clean_data.setdefault("status", "open")
        post = EventPost.objects.create(**clean_data)

        log_action(
            actor=actor,
            action="add_post",
            entity_type="event_post",
            entity_id=post.id,
            after_data={"title": post.title, "required_headcount": post.required_headcount},
        )

    return post


def update_post(actor, post: EventPost, data: dict) -> EventPost:
    """
    Update post details.
    """
    ensure_event_manager(actor, post.event)

    clean_data = dict(data)
    clean_data.pop("event", None)

    with transaction.atomic():
        for field, value in clean_data.items():
            if hasattr(post, field):
                setattr(post, field, value)

        post.clean()
        post.save()

        log_action(
            actor=actor,
            action="update_post",
            entity_type="event_post",
            entity_id=post.id,
            after_data={k: str(v) for k, v in clean_data.items()},
        )

    return post


def close_post(actor, post: EventPost) -> EventPost:
    """
    Close post to new applications.
    """
    ensure_event_manager(actor, post.event)

    with transaction.atomic():
        post.status = "closed"
        post.save(update_fields=["status"])

        log_action(
            actor=actor,
            action="close_post",
            entity_type="event_post",
            entity_id=post.id,
        )

    return post


def apply_to_event(
    user,
    event: Event,
    post: EventPost = None,
    source: str = "browse",
    qr_token=None,
) -> EventApplication:
    """
    Volunteer applies to an event (or specific post in an event).
    Enforces active account, event status, deadlines, duplicates, and capacity gating.
    Lock order: Event -> Post -> Application.
    """
    ensure_active_account(user)

    if event.deleted_at is not None or event.status not in (EVENT_PUBLISHED, EVENT_ACTIVE):
        raise InvalidStateError(
            f"Event is not open for applications. Current status: '{event.status}'."
        )

    if event.application_deadline and event.application_deadline <= timezone.now():
        raise DomainError("Application deadline has passed.", code="deadline_passed")

    # Check existing active applications for (event, user)
    if EventApplication.objects.filter(
        event=event,
        user=user,
        status__in=ACTIVE_APPLICATION_STATUSES,
    ).exists():
        raise DomainError(
            "User already has an active application for this event.",
            code="duplicate_application",
        )

    if source == "qr_walkin":
        if not qr_token:
            raise DomainError("QR token required for walk-in registration.", code="qr_token_required")
        if qr_token.expires_at <= timezone.now() or qr_token.revoked_at is not None:
            raise DomainError("QR token is expired or revoked.", code="invalid_qr_token")

    conditions_snapshot = {
        "meals_provided": event.meals_provided,
        "lodging_provided": event.lodging_provided,
        "travel_support_provided": event.travel_support_provided,
        "compensation_kind": event.compensation_kind,
        "compensation_note": event.compensation_note,
        "onboarding_version": event.onboarding_version,
    }

    with transaction.atomic():
        # Lock event
        locked_event = Event.objects.select_for_update().get(id=event.id)
        locked_post = None
        if post:
            locked_post = EventPost.objects.select_for_update().get(id=post.id)

        from apps.ops.models import Assignment

        # Capacity check and status determination
        if locked_event.acceptance_mode == "auto":
            if locked_post:
                active_assignments_count = Assignment.objects.filter(
                    post=locked_post,
                    status__in=ACTIVE_ASSIGNMENT_STATUSES,
                ).count()
                capacity = locked_post.required_headcount - active_assignments_count
            else:
                if locked_event.max_participants:
                    accepted_count = EventApplication.objects.filter(
                        event=locked_event,
                        status=APPLICATION_ACCEPTED,
                    ).count()
                    capacity = locked_event.max_participants - accepted_count
                else:
                    capacity = 999999

            if capacity > 0:
                app_status = APPLICATION_ACCEPTED
                decided_at = timezone.now()
            else:
                app_status = APPLICATION_WAITLISTED
                decided_at = timezone.now()
        else:
            app_status = APPLICATION_PENDING
            decided_at = None

        application = EventApplication.objects.create(
            event=locked_event,
            post=locked_post,
            user=user,
            source=source,
            qr_token=qr_token,
            status=app_status,
            decided_at=decided_at,
            conditions_snapshot=conditions_snapshot,
        )

        if app_status == APPLICATION_ACCEPTED and locked_event.auto_assign_enabled:
            from apps.ops.services import create_assignment_from_application
            create_assignment_from_application(application)

        log_action(
            actor=user,
            action="apply_event",
            entity_type="event_application",
            entity_id=application.id,
            after_data={"status": app_status, "source": source},
        )

    return application


def accept_application(
    actor,
    application: EventApplication,
    post: EventPost = None,
):
    """
    Coordinator or Admin accepts an application.
    Verifies capacity on target post or event.
    Returns (application, assignment).
    """
    ensure_event_manager(actor, application.event)

    if application.status == APPLICATION_ACCEPTED:
        raise InvalidStateError("Application is already accepted.")

    if application.status not in (APPLICATION_PENDING, APPLICATION_WAITLISTED):
        raise InvalidStateError(
            f"Cannot accept application in status '{application.status}'."
        )

    target_post = post or application.post

    with transaction.atomic():
        locked_app = EventApplication.objects.select_for_update().get(id=application.id)
        from apps.ops.models import Assignment

        if target_post:
            locked_post = EventPost.objects.select_for_update().get(id=target_post.id)
            active_post_assigns = Assignment.objects.filter(
                post=locked_post,
                status__in=ACTIVE_ASSIGNMENT_STATUSES,
            ).count()
            if active_post_assigns >= locked_post.required_headcount:
                raise CapacityFullError("Target post capacity is full.")
            locked_app.post = locked_post
        elif locked_app.event.max_participants:
            accepted_apps_count = EventApplication.objects.filter(
                event=locked_app.event,
                status=APPLICATION_ACCEPTED,
            ).exclude(id=locked_app.id).count()
            if accepted_apps_count >= locked_app.event.max_participants:
                raise CapacityFullError("Event capacity is full.")

        locked_app.status = APPLICATION_ACCEPTED
        locked_app.decided_by = actor
        locked_app.decided_at = timezone.now()
        locked_app.save()

        from apps.ops.services import create_assignment_from_application
        assignment = create_assignment_from_application(locked_app, actor=actor)

        log_action(
            actor=actor,
            action="accept_application",
            entity_type="event_application",
            entity_id=locked_app.id,
        )

    return locked_app, assignment


def reject_application(
    actor,
    application: EventApplication,
    reason: str = "",
) -> EventApplication:
    """
    Coordinator or Admin rejects an application.
    """
    ensure_event_manager(actor, application.event)

    if application.status == APPLICATION_REJECTED:
        return application

    with transaction.atomic():
        application.status = APPLICATION_REJECTED
        application.decided_by = actor
        application.decided_at = timezone.now()
        if reason:
            application.note = reason
        application.save()

        log_action(
            actor=actor,
            action="reject_application",
            entity_type="event_application",
            entity_id=application.id,
            after_data={"reason": reason},
        )

    return application


def waitlist_application(
    actor,
    application: EventApplication,
) -> EventApplication:
    """
    Coordinator or Admin waitlists an application.
    """
    ensure_event_manager(actor, application.event)

    with transaction.atomic():
        application.status = APPLICATION_WAITLISTED
        application.decided_by = actor
        application.decided_at = timezone.now()
        application.save()

        log_action(
            actor=actor,
            action="waitlist_application",
            entity_type="event_application",
            entity_id=application.id,
        )

    return application


def withdraw_application(
    user,
    application: EventApplication,
) -> EventApplication:
    """
    Volunteer withdraws own application.
    Cancels any active assignment.
    """
    if application.user_id != user.id:
        raise PermissionDeniedError("Cannot withdraw another volunteer's application.")

    if application.status not in (APPLICATION_PENDING, APPLICATION_ACCEPTED, APPLICATION_WAITLISTED):
        raise InvalidStateError(
            f"Cannot withdraw application in status '{application.status}'."
        )

    from apps.ops.models import Assignment

    with transaction.atomic():
        Assignment.objects.filter(
            application=application,
            status__in=ACTIVE_ASSIGNMENT_STATUSES,
        ).update(status=ASSIGNMENT_CANCELLED)

        application.status = APPLICATION_WITHDRAWN
        application.save()

        log_action(
            actor=user,
            action="withdraw_application",
            entity_type="event_application",
            entity_id=application.id,
        )

    return application
