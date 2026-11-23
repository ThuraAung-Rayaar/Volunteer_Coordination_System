"""
Management command to check against current date/time and transition
active events that have reached or passed their end schedule to completed.
"""
from __future__ import annotations

from typing import Any
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.events.models import Events
from common.db_context import set_system_actor_context
from services.maintenance_service import complete_ended_events


class Command(BaseCommand):
    help = (
        "Check against current date/time to end schedule (end_at <= now()). "
        "Transition active events whose schedule has ended to 'completed'. "
        "PostgreSQL triggers cascade attendance, assignments, and applications."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Inspect and list active ended events without modifying their status in the database.",
        )

    def handle(self, *args: Any, **options: Any):
        dry_run = options.get("dry_run", False)
        set_system_actor_context()
        now = timezone.now()

        ended_events = list(
            Events.objects.filter(
                status=Events.Status.ACTIVE,
                end_at__lte=now,
                deleted_at__isnull=True,
            ).order_by("end_at")
        )

        self.stdout.write(f"[*] Current verification time (UTC): {now.isoformat()}")
        self.stdout.write(f"[*] Found {len(ended_events)} active event(s) with end_at <= current time.")

        if not ended_events:
            self.stdout.write(self.style.SUCCESS("No active ended events found. Database is in sync."))
            return

        for ev in ended_events:
            self.stdout.write(
                f"  - Event ID {ev.id}: \"{ev.title}\" | Scheduled: {ev.start_at} -> {ev.end_at} "
                f"| Apps: {ev.applications.count()} | Assigns: {ev.assignments.count()} "
                f"| Attend: {ev.attendances.count()}"
            )

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN] No database modifications applied."))
            return

        completed_count = complete_ended_events()
        self.stdout.write(
            self.style.SUCCESS(
                f"\n[SUCCESS] Successfully transitioned {completed_count} ended event(s) to 'completed' status. "
                "Trigger cascades finalized attendance, assignments, and applications."
            )
        )
