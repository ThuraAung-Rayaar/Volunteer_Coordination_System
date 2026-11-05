from django.core.management.base import BaseCommand

from common.db_context import set_system_actor_context
from services import maintenance_service


class Command(BaseCommand):
    help = "Run all scheduled maintenance jobs (release blocks, expire apps, purge OTPs/geo evidence)."

    def handle(self, *args, **options):
        set_system_actor_context()
        summary = maintenance_service.run_all_maintenance()
        for key, value in summary.items():
            self.stdout.write(f"{key}: {value}")
        self.stdout.write(self.style.SUCCESS("Maintenance complete."))

