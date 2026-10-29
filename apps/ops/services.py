# apps/ops/services.py
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.audit.services import log_action
from apps.common.constants import (
    ACTIVE_ASSIGNMENT_STATUSES,
    ASSIGNMENT_ASSIGNED,
    ASSIGNMENT_CANCELLED,
    ASSIGNMENT_CONFIRMED,
    ATTENDANCE_ABSENT,
    ATTENDANCE_CHECKED_IN,
    ATTENDANCE_COMPLETED,
    ATTENDANCE_EXPECTED,
    EVENT_ACTIVE,
    EVENT_COMPLETED,
    FEEDBACK_COORDINATOR_TO_VOLUNTEER,
    FEEDBACK_VOLUNTEER_TO_COORDINATOR,
    FEEDBACK_VOLUNTEER_TO_EVENT,
    QR_CHECKIN,
    QR_DEFAULT_TTL_MINUTES,
    QR_JOIN_EVENT,
    QR_WALKIN_REGISTRATION,
)
from apps.common.exceptions import (
    CapacityFullError,
    DomainError,
    InvalidStateError,
    OnboardingRequiredError,
    PermissionDeniedError,
)
from apps.common.permissions import (
    ensure_active_account,
    ensure_event_manager,
    is_event_manager,
)
from apps.common.security import generate_raw_token, hash_token
from apps.ops.models import (
    Assignment,
    Attendance,
    Feedback,
    OnboardingAcknowledgment,
    QrToken,
)


def check_post_eligibility(user, post) -> bool:
    """
    Check if a volunteer satisfies post requirements:
    1. If post.required_skills: user.skills must overlap post.required_skills.
    2. If post.physical_level == 'heavy': user.physical_ok and user.can_lift_heavy must be True.
    3. If post.physical_level == 'medium': user.physical_ok must be True.
    4. If post.new_volunteers_allowed is False: user.new_to_volunteer must be False.
    """
    if post.required_skills:
        user_skills = set(user.skills or [])
        required = set(post.required_skills)
        if not user_skills.intersection(required):
            return False

    if post.physical_level == "heavy":
        if not (user.physical_ok and user.can_lift_heavy):
            return False
    elif post.physical_level == "medium":
        if not user.physical_ok:
            return False

    if not post.new_volunteers_allowed and user.new_to_volunteer:
        return False

    return True


def get_remaining_post_capacity(post) -> int:
    active_count = Assignment.objects.filter(
        post=post,
        status__in=ACTIVE_ASSIGNMENT_STATUSES,
    ).count()
    return max(0, post.required_headcount - active_count)


def create_assignment_from_application(application, actor=None) -> Assignment | None:
    """
    Create Assignment from an accepted EventApplication.
    - If application already has an active assignment, return it.
    - If application has a specific post, verify post eligibility and capacity.
    - If application has no post, find first eligible open post with capacity.
    - If no eligible post has capacity, return None.
    - Creates Attendance(status='expected') if missing.
    """
    existing = Assignment.objects.filter(
        application=application,
        status__in=ACTIVE_ASSIGNMENT_STATUSES,
    ).first()
    if existing:
        return existing

    user = application.user
    event = application.event

    target_post = application.post
    if target_post:
        if target_post.status != "open":
            return None
        if not check_post_eligibility(user, target_post):
            return None
        if get_remaining_post_capacity(target_post) <= 0:
            return None
    else:
        # Search among event's open posts ordered by priority ascending, id ascending
        open_posts = event.posts.filter(status="open").order_by("priority", "id")
        chosen_post = None
        for post in open_posts:
            if check_post_eligibility(user, post) and get_remaining_post_capacity(post) > 0:
                chosen_post = post
                break
        if not chosen_post:
            return None
        target_post = chosen_post

    assigned_by = "auto" if actor is None else ("admin" if getattr(actor, "is_admin", False) else "coordinator")
    assigned_by_user = None if assigned_by == "auto" else actor

    with transaction.atomic():
        assignment = Assignment.objects.create(
            event=event,
            post=target_post,
            user=user,
            application=application,
            status=ASSIGNMENT_ASSIGNED,
            assigned_by=assigned_by,
            assigned_by_user=assigned_by_user,
            schedule_start=event.start_at,
            schedule_end=event.end_at,
            conditions_snapshot=application.conditions_snapshot or {},
        )

        Attendance.objects.get_or_create(
            event=event,
            user=user,
            defaults={
                "assignment": assignment,
                "status": ATTENDANCE_EXPECTED,
            },
        )

        log_action(
            actor=actor or user,
            action="create_assignment",
            entity_type="assignment",
            entity_id=assignment.id,
            after_data={"post_id": target_post.id if target_post else None, "user_id": user.id},
        )

    return assignment


def generate_qr_token(
    actor,
    event,
    purpose: str,
    max_uses: int = None,
    ttl_minutes: int = 240,
) -> tuple[QrToken, str]:
    """
    Generate QR Token for an event.
    Stores token_hash (SHA-256). Raw token is returned and never persisted.
    """
    ensure_event_manager(actor, event)

    valid_purposes = {QR_WALKIN_REGISTRATION, QR_CHECKIN, QR_JOIN_EVENT}
    if purpose not in valid_purposes:
        raise DomainError(f"Invalid QR token purpose: {purpose}", code="invalid_purpose")

    if max_uses is not None and max_uses <= 0:
        raise DomainError("max_uses must be greater than 0.", code="invalid_max_uses")

    raw_token = generate_raw_token()
    token_hash = hash_token(raw_token)

    ttl = ttl_minutes if ttl_minutes is not None else QR_DEFAULT_TTL_MINUTES
    expires_at = timezone.now() + timedelta(minutes=ttl)

    with transaction.atomic():
        qr_token = QrToken.objects.create(
            event=event,
            created_by=actor,
            purpose=purpose,
            token_hash=token_hash,
            max_uses=max_uses,
            expires_at=expires_at,
        )

        log_action(
            actor=actor,
            action="generate_qr_token",
            entity_type="qr_token",
            entity_id=qr_token.id,
            after_data={"purpose": purpose, "max_uses": max_uses, "expires_at": str(expires_at)},
        )

    return qr_token, raw_token


def resolve_qr_token(raw_token: str) -> dict:
    """
    Resolve QR token metadata without consuming it.
    """
    token_hash = hash_token(raw_token)
    qr_token = QrToken.objects.select_related("event").filter(token_hash=token_hash).first()

    if not qr_token:
        raise DomainError("Invalid QR token.", code="invalid_token")

    if qr_token.revoked_at is not None:
        raise DomainError("QR token has been revoked.", code="revoked_token")

    if qr_token.expires_at <= timezone.now():
        raise DomainError("QR token has expired.", code="expired_token")

    if qr_token.max_uses is not None and qr_token.used_count >= qr_token.max_uses:
        raise CapacityFullError("QR token usage limit reached.", code="qr_limit_reached")

    return {
        "event_id": qr_token.event_id,
        "title": qr_token.event.title,
        "purpose": qr_token.purpose,
        "expires_at": qr_token.expires_at,
        "used_count": qr_token.used_count,
        "max_uses": qr_token.max_uses,
    }


def redeem_qr_token(user, raw_token: str) -> dict:
    """
    Safely redeem a QR token within a transaction lock.
    Dispatches according to purpose:
    - walkin_registration -> apply_to_event(source='qr_walkin')
    - checkin -> check_in(method='qr_scan')
    - join_event -> apply_to_event(source='invite')
    """
    ensure_active_account(user)

    token_hash = hash_token(raw_token)

    with transaction.atomic():
        qr_token = (
            QrToken.objects.select_for_update()
            .select_related("event")
            .filter(token_hash=token_hash)
            .first()
        )

        if not qr_token:
            raise DomainError("Invalid QR token.", code="invalid_token")

        if qr_token.revoked_at is not None:
            raise DomainError("QR token has been revoked.", code="revoked_token")

        if qr_token.expires_at <= timezone.now():
            raise DomainError("QR token has expired.", code="expired_token")

        if qr_token.max_uses is not None and qr_token.used_count >= qr_token.max_uses:
            raise CapacityFullError("QR token usage limit reached.", code="qr_limit_reached")

        qr_token.used_count += 1
        qr_token.save(update_fields=["used_count"])

        # Dispatch by purpose
        if qr_token.purpose == QR_WALKIN_REGISTRATION:
            from apps.events.services import apply_to_event
            app = apply_to_event(user, qr_token.event, source="qr_walkin", qr_token=qr_token)
            result = {
                "action": QR_WALKIN_REGISTRATION,
                "application_id": app.id,
                "status": app.status,
            }
        elif qr_token.purpose == QR_CHECKIN:
            att = check_in(
                actor=user,
                event=qr_token.event,
                user=user,
                method="qr_scan",
                qr_token=qr_token,
            )
            result = {
                "action": QR_CHECKIN,
                "status": "checked_in",
                "attendance_id": att.id,
                "checkin_at": att.checkin_at,
            }
        elif qr_token.purpose == QR_JOIN_EVENT:
            from apps.events.services import apply_to_event
            app = apply_to_event(user, qr_token.event, source="invite")
            result = {
                "action": QR_JOIN_EVENT,
                "application_id": app.id,
                "status": app.status,
            }
        else:
            raise DomainError(f"Unsupported purpose: {qr_token.purpose}", code="invalid_purpose")

        log_action(
            actor=user,
            action="redeem_qr_token",
            entity_type="qr_token",
            entity_id=qr_token.id,
            after_data={"purpose": qr_token.purpose, "used_count": qr_token.used_count},
        )

    return result


def acknowledge_onboarding(user, event, method: str = "app_tick") -> OnboardingAcknowledgment:
    """
    Record onboarding acknowledgment for current event onboarding_version.
    """
    ensure_active_account(user)

    with transaction.atomic():
        ack, created = OnboardingAcknowledgment.objects.update_or_create(
            event=event,
            user=user,
            onboarding_version=event.onboarding_version,
            defaults={
                "method": method,
                "acknowledged_at": timezone.now(),
            },
        )

        log_action(
            actor=user,
            action="acknowledge_onboarding",
            entity_type="onboarding_ack",
            entity_id=ack.id,
            after_data={"event_id": event.id, "version": event.onboarding_version, "method": method},
        )

    return ack


def check_in(
    actor,
    event,
    user=None,
    method: str = "qr_scan",
    qr_token=None,
    target_user=None,
) -> Attendance:
    """
    Check-in volunteer to an active event.
    Returns Attendance instance. Idempotent if already checked in.
    """
    ensure_active_account(actor)
    target = user or target_user
    if not target:
        raise DomainError("Target volunteer is required.", code="user_required")

    if event.status != EVENT_ACTIVE:
        raise InvalidStateError(
            f"Event must be active to check in. Current status: '{event.status}'."
        )

    assignment = Assignment.objects.filter(
        event=event,
        user=target,
        status__in=ACTIVE_ASSIGNMENT_STATUSES,
    ).first()
    if not assignment:
        raise DomainError(
            "User does not have an active assignment for this event.",
            code="no_active_assignment",
        )

    if event.require_onboarding_ack:
        has_ack = OnboardingAcknowledgment.objects.filter(
            event=event,
            user=target,
            onboarding_version=event.onboarding_version,
        ).exists()
        if not has_ack:
            raise OnboardingRequiredError(
                "Volunteer must acknowledge onboarding requirements before checking in."
            )

    if actor.id == target.id:
        if method != "qr_scan":
            raise DomainError("Volunteers can only check in via QR scan.", code="invalid_checkin_method")
        if not qr_token or qr_token.purpose != QR_CHECKIN:
            raise DomainError("Valid check-in QR token is required.", code="invalid_qr_token")
    else:
        ensure_event_manager(actor, event)

    attendance = Attendance.objects.filter(event=event, user=target).first()
    if attendance and attendance.status == ATTENDANCE_CHECKED_IN:
        return attendance

    now = timezone.now()
    with transaction.atomic():
        if not attendance:
            attendance = Attendance.objects.create(
                event=event,
                user=target,
                assignment=assignment,
                qr_token=qr_token,
                status=ATTENDANCE_CHECKED_IN,
                checkin_at=now,
                method=method,
                recorded_by=actor,
            )
        else:
            attendance.assignment = assignment
            attendance.qr_token = qr_token
            attendance.status = ATTENDANCE_CHECKED_IN
            attendance.checkin_at = now
            attendance.method = method
            attendance.recorded_by = actor
            attendance.save()

        log_action(
            actor=actor,
            action="check_in",
            entity_type="attendance",
            entity_id=attendance.id,
            after_data={"method": method, "target_user_id": target.id},
        )

    return attendance


def check_out(actor, event, user=None, target_user=None) -> Attendance:
    """
    Check-out volunteer from an active event.
    """
    ensure_active_account(actor)
    target = user or target_user
    if not target:
        raise DomainError("Target volunteer is required.", code="user_required")

    if actor.id != target.id:
        ensure_event_manager(actor, event)

    attendance = Attendance.objects.filter(event=event, user=target).first()
    if not attendance or attendance.status != ATTENDANCE_CHECKED_IN:
        raise InvalidStateError("Volunteer is not currently checked in.", code="not_checked_in")

    with transaction.atomic():
        attendance.checkout_at = timezone.now()
        attendance.save(update_fields=["checkout_at"])

        log_action(
            actor=actor,
            action="check_out",
            entity_type="attendance",
            entity_id=attendance.id,
            after_data={"checkout_at": str(attendance.checkout_at), "target_user_id": target.id},
        )

    return attendance


def mark_absent(actor, event, user=None, target_user=None) -> Attendance:
    """
    Coordinator or Admin marks volunteer absent.
    """
    ensure_event_manager(actor, event)
    target = user or target_user
    if not target:
        raise DomainError("Target volunteer is required.", code="user_required")

    attendance = Attendance.objects.filter(event=event, user=target).first()
    if attendance and attendance.status in (ATTENDANCE_CHECKED_IN, ATTENDANCE_COMPLETED):
        raise InvalidStateError(
            f"Cannot mark absent because attendance is already '{attendance.status}'.",
            code="invalid_state",
        )

    assignment = Assignment.objects.filter(
        event=event,
        user=target,
        status__in=ACTIVE_ASSIGNMENT_STATUSES,
    ).first()

    with transaction.atomic():
        if not attendance:
            attendance = Attendance.objects.create(
                event=event,
                user=target,
                assignment=assignment,
                status=ATTENDANCE_ABSENT,
                recorded_by=actor,
            )
        else:
            attendance.status = ATTENDANCE_ABSENT
            attendance.recorded_by = actor
            attendance.save(update_fields=["status", "recorded_by"])

        log_action(
            actor=actor,
            action="mark_absent",
            entity_type="attendance",
            entity_id=attendance.id,
            after_data={"target_user_id": target.id},
        )

    return attendance


def submit_feedback(
    user,
    event,
    direction: str,
    target_user=None,
    score: int = None,
    tags=None,
    comment: str = "",
) -> Feedback:
    """
    Submit feedback between coordinator and volunteer or for the event.
    Requirements:
    - Event must be completed.
    - Score must be between 1 and 5.
    - If coordinator_to_volunteer: rater is coordinator/admin, target_user required and had active assignment.
    - If volunteer_to_event: rater had active assignment, target_user must be None.
    - If volunteer_to_coordinator: rater had active assignment, target_user forced to event.coordinator.
    """
    ensure_active_account(user)

    if event.status != EVENT_COMPLETED:
        raise InvalidStateError(
            "Feedback can only be submitted for completed events.",
            code="event_not_completed",
        )

    if score is None or not (1 <= int(score) <= 5):
        raise DomainError("Feedback score is required and must be between 1 and 5.", code="invalid_score")

    valid_directions = {
        FEEDBACK_COORDINATOR_TO_VOLUNTEER,
        FEEDBACK_VOLUNTEER_TO_EVENT,
        FEEDBACK_VOLUNTEER_TO_COORDINATOR,
    }
    if direction not in valid_directions:
        raise DomainError(f"Invalid feedback direction: {direction}", code="invalid_direction")

    final_target = target_user

    if direction == FEEDBACK_COORDINATOR_TO_VOLUNTEER:
        if not is_event_manager(user, event):
            raise PermissionDeniedError("Only event coordinators or admins can rate volunteers.")
        if not final_target:
            raise DomainError("Target volunteer is required.", code="target_user_required")
        had_assignment = Assignment.objects.filter(
            event=event,
            user=final_target,
        ).exclude(status=ASSIGNMENT_CANCELLED).exists()
        if not had_assignment:
            raise DomainError("Target volunteer had no assignment for this event.", code="invalid_target_user")

    elif direction == FEEDBACK_VOLUNTEER_TO_EVENT:
        had_assignment = Assignment.objects.filter(
            event=event,
            user=user,
        ).exclude(status=ASSIGNMENT_CANCELLED).exists()
        if not had_assignment:
            raise PermissionDeniedError("Only participating volunteers can submit event feedback.")
        final_target = None

    elif direction == FEEDBACK_VOLUNTEER_TO_COORDINATOR:
        had_assignment = Assignment.objects.filter(
            event=event,
            user=user,
        ).exclude(status=ASSIGNMENT_CANCELLED).exists()
        if not had_assignment:
            raise PermissionDeniedError("Only participating volunteers can submit coordinator feedback.")
        final_target = event.coordinator

    # Check duplicate feedback
    if final_target is None:
        if Feedback.objects.filter(event=event, rater_user=user, direction=direction, target_user__isnull=True).exists():
            raise DomainError("Feedback has already been submitted for this event.", code="duplicate_feedback")
    else:
        if Feedback.objects.filter(event=event, rater_user=user, direction=direction, target_user=final_target).exists():
            raise DomainError("Feedback has already been submitted for this user.", code="duplicate_feedback")

    with transaction.atomic():
        feedback = Feedback.objects.create(
            event=event,
            rater_user=user,
            target_user=final_target,
            direction=direction,
            score=int(score),
            tags=tags or [],
            comment=comment or "",
            status="active",
        )

        log_action(
            actor=user,
            action="submit_feedback",
            entity_type="feedback",
            entity_id=feedback.id,
            after_data={
                "direction": direction,
                "score": int(score),
                "target_user_id": final_target.id if final_target else None,
            },
        )

    return feedback


def run_auto_assignment(actor, event) -> list[Assignment]:
    """
    Coordinator or Admin runs automated assignment algorithm.
    1. Lock event.
    2. Get accepted applications without active assignment.
    3. For each application, call create_assignment_from_application.
    4. Build groups: group by post, group size = event.group_size. Code format "G1", "G2" per post.
    5. Leader assignment: if post.leader_needed or event.leader_strategy in ("first_experienced", "experienced_preferred"),
       choose first member with has_leader_experience=True. Ensure only one leader per group.
    """
    ensure_event_manager(actor, event)

    from apps.events.models import Event, EventApplication, EventPost

    created_assignments = []

    with transaction.atomic():
        locked_event = Event.objects.select_for_update().get(id=event.id)

        # Get accepted applications without active assignment
        assigned_app_ids = Assignment.objects.filter(
            event=locked_event,
            status__in=ACTIVE_ASSIGNMENT_STATUSES,
        ).values_list("application_id", flat=True)

        unassigned_apps = (
            EventApplication.objects.select_for_update()
            .filter(event=locked_event, status="accepted")
            .exclude(id__in=assigned_app_ids)
            .order_by("applied_at", "id")
        )

        for app in unassigned_apps:
            assignment = create_assignment_from_application(app, actor=None)
            if assignment:
                created_assignments.append(assignment)

        # Group organization and leader assignment
        group_size = locked_event.group_size
        posts = locked_event.posts.all().order_by("priority", "id")

        group_seq = 1
        for post in posts:
            post_assignments = list(
                Assignment.objects.select_for_update()
                .filter(event=locked_event, post=post, status__in=ACTIVE_ASSIGNMENT_STATUSES)
                .select_related("user")
                .order_by("id")
            )

            if not post_assignments:
                continue

            chunk_size = group_size if (group_size and group_size > 0) else len(post_assignments)

            for i in range(0, len(post_assignments), chunk_size):
                chunk = post_assignments[i : i + chunk_size]
                group_code = f"G{group_seq}"
                group_seq += 1

                # Check if group already has an active leader
                has_existing_leader = any(a.is_group_leader for a in chunk)
                leader_assigned = has_existing_leader

                should_assign_leader = post.leader_needed or locked_event.leader_strategy in (
                    "first_experienced",
                    "experienced_preferred",
                )

                for a in chunk:
                    a.group_code = group_code
                    if should_assign_leader and not leader_assigned and a.user.has_leader_experience:
                        a.is_group_leader = True
                        leader_assigned = True
                    elif not has_existing_leader and not a.is_group_leader:
                        a.is_group_leader = False
                    a.save(update_fields=["group_code", "is_group_leader"])

        log_action(
            actor=actor,
            action="run_auto_assignment",
            entity_type="event",
            entity_id=locked_event.id,
            after_data={"assignments_created": len(created_assignments)},
        )

    return created_assignments


def assign_manually(
    actor,
    application,
    post=None,
    group_code=None,
    is_group_leader: bool = False,
) -> Assignment:
    """
    Coordinator or Admin manually assigns or updates volunteer assignment.
    """
    ensure_event_manager(actor, application.event)

    target_post = post or application.post

    with transaction.atomic():
        if application.status != "accepted":
            application.status = "accepted"
            application.decided_by = actor
            application.decided_at = timezone.now()
            if target_post:
                application.post = target_post
            application.save()

        # Check existing active assignment
        assignment = Assignment.objects.filter(
            application=application,
            status__in=ACTIVE_ASSIGNMENT_STATUSES,
        ).first()

        if is_group_leader and not group_code:
            raise DomainError(
                "Group leader must have a group code assigned.",
                code="group_code_required",
            )

        if is_group_leader and group_code:
            existing_leader = (
                Assignment.objects.filter(
                    event=application.event,
                    group_code=group_code,
                    is_group_leader=True,
                )
                .exclude(id=assignment.id if assignment else None)
                .filter(status__in=ACTIVE_ASSIGNMENT_STATUSES)
                .exists()
            )
            if existing_leader:
                raise DomainError(
                    f"Group '{group_code}' already has an active leader.",
                    code="duplicate_group_leader",
                )

        assigned_by = "admin" if getattr(actor, "is_admin", False) else "coordinator"

        if not assignment:
            assignment = Assignment.objects.create(
                event=application.event,
                post=target_post,
                user=application.user,
                application=application,
                status=ASSIGNMENT_ASSIGNED,
                assigned_by=assigned_by,
                assigned_by_user=actor,
                group_code=group_code,
                is_group_leader=is_group_leader,
                schedule_start=application.event.start_at,
                schedule_end=application.event.end_at,
                conditions_snapshot=application.conditions_snapshot or {},
            )
            Attendance.objects.get_or_create(
                event=application.event,
                user=application.user,
                defaults={
                    "assignment": assignment,
                    "status": ATTENDANCE_EXPECTED,
                },
            )
        else:
            assignment.post = target_post
            assignment.group_code = group_code
            assignment.is_group_leader = is_group_leader
            assignment.assigned_by = assigned_by
            assignment.assigned_by_user = actor
            assignment.save()

        log_action(
            actor=actor,
            action="assign_manually",
            entity_type="assignment",
            entity_id=assignment.id,
            after_data={"post_id": target_post.id if target_post else None, "group_code": group_code},
        )

    return assignment


def confirm_assignment(user, assignment: Assignment) -> Assignment:
    """
    Volunteer confirms own assignment.
    """
    if assignment.user_id != user.id:
        raise PermissionDeniedError("Cannot confirm another volunteer's assignment.")

    if assignment.status not in (ASSIGNMENT_ASSIGNED,):
        if assignment.status == ASSIGNMENT_CONFIRMED:
            return assignment
        raise InvalidStateError(f"Cannot confirm assignment in status '{assignment.status}'.")

    with transaction.atomic():
        assignment.status = ASSIGNMENT_CONFIRMED
        assignment.save(update_fields=["status"])

        log_action(
            actor=user,
            action="confirm_assignment",
            entity_type="assignment",
            entity_id=assignment.id,
        )

    return assignment


def cancel_assignment(actor, assignment: Assignment, reason: str = "") -> Assignment:
    """
    Coordinator, Admin, or Volunteer cancels an assignment.
    """
    if assignment.user_id != actor.id:
        ensure_event_manager(actor, assignment.event)

    if assignment.status == ASSIGNMENT_CANCELLED:
        return assignment

    with transaction.atomic():
        assignment.status = ASSIGNMENT_CANCELLED
        assignment.save(update_fields=["status"])

        log_action(
            actor=actor,
            action="cancel_assignment",
            entity_type="assignment",
            entity_id=assignment.id,
            after_data={"reason": reason},
        )

    return assignment
