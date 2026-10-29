# apps/events/management/commands/seed_demo_data.py
from datetime import timedelta
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import CoordinatorProfile, User
from apps.common.constants import (
    APPLICATION_ACCEPTED,
    ASSIGNMENT_CONFIRMED,
    ATTENDANCE_EXPECTED,
    COORDINATOR_APPROVED,
    EVENT_PUBLISHED,
    VERIFICATION_VERIFIED,
)
from apps.common.security import compute_phone_hash
from apps.events.models import CharityField, Event, EventApplication, EventCharityField, EventPost
from apps.ops.models import Assignment, Attendance


class Command(BaseCommand):
    help = "Seeds demo users, coordinator, event, posts, and confirmed assignment (idempotent)."

    def handle(self, *args, **options):
        now = timezone.now()

        # 1. Admin User
        admin_phone = "+959111111111"
        admin_hash = compute_phone_hash(admin_phone)
        admin_user, _ = User.objects.update_or_create(
            phone_hash=admin_hash,
            defaults={
                "display_name": "Demo Admin",
                "password": make_password("admin123"),
                "is_admin": True,
                "is_staff": True,
                "is_superuser": True,
                "account_status": "active",
                "verification_status": VERIFICATION_VERIFIED,
            },
        )

        # Superadmin credentials for Django Admin panel login
        superadmin_user, _ = User.objects.update_or_create(
            phone_hash="12345",
            defaults={
                "display_name": "admin",
                "password": make_password("12345"),
                "is_admin": True,
                "is_staff": True,
                "is_superuser": True,
                "account_status": "active",
                "verification_status": VERIFICATION_VERIFIED,
            },
        )

        # 2. Approved Coordinator
        coord_phone = "+959222222222"
        coord_hash = compute_phone_hash(coord_phone)
        coord_user, _ = User.objects.update_or_create(
            phone_hash=coord_hash,
            defaults={
                "phone_enc": f"ENC_{coord_phone}",
                "display_name": "Demo Coordinator",
                "password": make_password(None),
                "account_status": "active",
                "verification_status": VERIFICATION_VERIFIED,
            },
        )
        CoordinatorProfile.objects.update_or_create(
            user=coord_user,
            defaults={
                "status": COORDINATOR_APPROVED,
                "approved_by": admin_user,
                "approved_at": now,
                "notes": "Demo coordinator approved profile.",
            },
        )

        # 3. Volunteers
        vol1_phone = "+959333333333"
        vol1_hash = compute_phone_hash(vol1_phone)
        vol1_user, _ = User.objects.update_or_create(
            phone_hash=vol1_hash,
            defaults={
                "phone_enc": f"ENC_{vol1_phone}",
                "display_name": "Demo Volunteer Alpha",
                "password": make_password(None),
                "account_status": "active",
                "skills": ["teaching", "logistics"],
                "has_leader_experience": True,
                "physical_ok": True,
                "can_lift_heavy": True,
                "new_to_volunteer": False,
            },
        )

        vol2_phone = "+959444444444"
        vol2_hash = compute_phone_hash(vol2_phone)
        vol2_user, _ = User.objects.update_or_create(
            phone_hash=vol2_hash,
            defaults={
                "phone_enc": f"ENC_{vol2_phone}",
                "display_name": "Demo Volunteer Beta",
                "password": make_password(None),
                "account_status": "active",
                "skills": ["cooking"],
                "has_leader_experience": False,
                "physical_ok": True,
                "can_lift_heavy": False,
                "new_to_volunteer": True,
            },
        )

        # 4. Published Event
        event, _ = Event.objects.update_or_create(
            coordinator=coord_user,
            title="Yangon Community Relief Drive",
            defaults={
                "description": "Annual food and education relief program for Yangon river communities.",
                "purpose_type": "charity_event",
                "status": EVENT_PUBLISHED,
                "location_name": "Yangon Riverside Center",
                "start_at": now + timedelta(days=5),
                "end_at": now + timedelta(days=5, hours=8),
                "application_deadline": now + timedelta(days=4),
                "acceptance_mode": "auto",
                "max_participants": 30,
                "group_size": 5,
                "require_onboarding_ack": True,
                "onboarding_text": "Please bring photo ID, water bottle, and safety footwear.",
                "onboarding_version": 1,
            },
        )

        # Link charity fields
        logistics_field = CharityField.objects.filter(code="logistics").first()
        teaching_field = CharityField.objects.filter(code="teaching").first()
        if logistics_field:
            EventCharityField.objects.get_or_create(event=event, field_code=logistics_field)
        if teaching_field:
            EventCharityField.objects.get_or_create(event=event, field_code=teaching_field)

        # 5. Three Posts with distinct criteria
        post1, _ = EventPost.objects.update_or_create(
            event=event,
            title="Logistics & Heavy Distribution",
            defaults={
                "description": "Loading trucks and carrying food supply packages.",
                "required_headcount": 8,
                "physical_level": "heavy",
                "required_skills": ["logistics"],
                "leader_needed": True,
                "status": "open",
                "priority": 1,
            },
        )

        post2, _ = EventPost.objects.update_or_create(
            event=event,
            title="Youth Workshop Facilitator",
            defaults={
                "description": "Leading community education and skills sessions.",
                "required_headcount": 6,
                "physical_level": "light",
                "required_skills": ["teaching"],
                "leader_needed": True,
                "status": "open",
                "priority": 2,
            },
        )

        post3, _ = EventPost.objects.update_or_create(
            event=event,
            title="Community Kitchen Helper",
            defaults={
                "description": "Food preparation and general helper duties.",
                "required_headcount": 10,
                "physical_level": "medium",
                "required_skills": ["cooking"],
                "new_volunteers_allowed": True,
                "status": "open",
                "priority": 3,
            },
        )

        # 6. Accepted Application & Confirmed Assignment for Volunteer 1
        application, _ = EventApplication.objects.update_or_create(
            event=event,
            user=vol1_user,
            defaults={
                "post": post1,
                "source": "browse",
                "status": APPLICATION_ACCEPTED,
                "decided_by": coord_user,
                "decided_at": now,
                "conditions_snapshot": {
                    "meals_provided": event.meals_provided,
                    "lodging_provided": event.lodging_provided,
                },
            },
        )

        assignment, _ = Assignment.objects.update_or_create(
            event=event,
            user=vol1_user,
            defaults={
                "application": application,
                "post": post1,
                "status": ASSIGNMENT_CONFIRMED,
                "assigned_by": "coordinator",
                "assigned_by_user": coord_user,
                "group_code": "G1",
                "is_group_leader": True,
                "schedule_start": event.start_at,
                "schedule_end": event.end_at,
                "conditions_snapshot": application.conditions_snapshot or {},
            },
        )

        Attendance.objects.update_or_create(
            event=event,
            user=vol1_user,
            defaults={
                "assignment": assignment,
                "status": ATTENDANCE_EXPECTED,
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded demo data: 1 admin ({admin_user.display_name}), "
                f"1 coordinator ({coord_user.display_name}), 2 volunteers, "
                f"1 event ('{event.title}') with 3 posts, 1 confirmed assignment."
            )
        )
