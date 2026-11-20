"""
scripts/seed_integration_fixtures.py
Seeds test data into PostgreSQL for real-HTTP integration testing (Phase 4).
Outputs JSON metadata containing IDs and Tokens.
"""
import json
import os
import secrets
import sys
from datetime import timedelta
from pathlib import Path

# Ensure backend is on PYTHONPATH
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root / "backend"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()

from apps.accounts.models import Users
from apps.attendance.models import Attendance
from apps.events.models import EventApplications, EventPosts, Events
from common.utils import compute_phone_hash, encrypt_phone, normalize_phone
from django.utils import timezone
from rest_framework.authtoken.models import Token
from services import coordinator_service, onboarding_service


def _make_user(name, is_admin=False, verified=True):
    raw_phone = f"+959{secrets.randbelow(900000000) + 100000000}"
    ph = normalize_phone(raw_phone)
    user = Users.objects.create(
        phone_hash=compute_phone_hash(ph),
        phone_enc=encrypt_phone(ph),
        display_name=name,
        is_admin=is_admin,
        verification_status="verified" if verified else "none",
        account_status="active",
    )
    token, _ = Token.objects.get_or_create(user=user)
    return user, token.key, ph


def seed():
    admin, _, _ = _make_user("Admin Seed", is_admin=True)

    owner, owner_token, _ = _make_user("Event Owner Seed", verified=True)
    coordinator_service.apply_for_coordinator(owner, "Owner Vetting")
    coordinator_service.approve_coordinator(admin, owner.id, "Approved")

    coord, coord_token, _ = _make_user("Event Coordinator Seed", verified=True)
    coordinator_service.apply_for_coordinator(coord, "Coord Vetting")
    coordinator_service.approve_coordinator(admin, coord.id, "Approved")

    unrelated, unrelated_token, _ = _make_user("Unrelated Coord Seed", verified=True)
    coordinator_service.apply_for_coordinator(unrelated, "Unrelated Vetting")
    coordinator_service.approve_coordinator(admin, unrelated.id, "Approved")

    start = timezone.now() + timedelta(hours=2)
    end = start + timedelta(hours=4)
    event = Events.objects.create(
        owner_id=owner.id,
        current_coordinator_id=coord.id,
        title=f"Integration Event {secrets.randbelow(10000)}",
        start_at=start,
        end_at=end,
        acceptance_mode="auto",
        auto_assign_enabled=True,
        require_onboarding_ack=True,
        onboarding_text="Please wear high-vis vests and safety boots.",
    )
    EventPosts.objects.create(event=event, title="Event Marshal", required_headcount=10)
    Events.objects.filter(id=event.id).update(status="published")
    Events.objects.filter(id=event.id).update(status="active")
    Events.objects.filter(id=event.id).update(start_at=timezone.now() - timedelta(minutes=10))

    vol1, vol1_token, vol1_phone = _make_user("Assigned Vol 1", verified=False)
    EventApplications.objects.create(
        event=event,
        user=vol1,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
    onboarding_service.acknowledge_event_onboarding(vol1, event.id)
    att1 = Attendance.objects.get(event=event, user=vol1)

    vol2, vol2_token, _ = _make_user("Assigned Vol 2", verified=False)
    EventApplications.objects.create(
        event=event,
        user=vol2,
        source="browse",
        conditions_acknowledged_at=timezone.now(),
    )
    onboarding_service.acknowledge_event_onboarding(vol2, event.id)
    att2 = Attendance.objects.get(event=event, user=vol2)

    data = {
        "eventId": event.id,
        "eventTitle": event.title,
        "coordinatorToken": coord_token,
        "coordinatorUserId": coord.id,
        "ownerToken": owner_token,
        "ownerUserId": owner.id,
        "unrelatedToken": unrelated_token,
        "unrelatedUserId": unrelated.id,
        "volunteer1UserId": vol1.id,
        "volunteer1AttendanceId": att1.id,
        "volunteer1Token": vol1_token,
        "volunteer1Phone": vol1_phone,
        "volunteer2UserId": vol2.id,
        "volunteer2AttendanceId": att2.id,
    }

    out_path = repo_root / "mobile" / "src" / "data" / "__tests__" / "integration_fixtures.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(json.dumps(data, indent=2))
    return data


if __name__ == "__main__":
    seed()
