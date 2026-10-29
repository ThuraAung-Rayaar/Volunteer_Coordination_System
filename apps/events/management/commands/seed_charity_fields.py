from django.core.management.base import BaseCommand
from apps.events.models import CharityField

INITIAL_CHARITY_FIELDS = [
    ('teaching', 'Teaching', 10),
    ('food_distribution', 'Food Distribution', 20),
    ('elderly_care', 'Elderly Care', 30),
    ('child_care', 'Child Care', 40),
    ('animal_welfare', 'Animal Welfare', 50),
    ('environment', 'Environment', 60),
    ('disaster_support', 'Disaster Support', 70),
    ('blood_donation', 'Blood Donation', 80),
    ('fundraising', 'Fundraising', 90),
    ('logistics', 'Logistics', 100),
    ('cleaning', 'Cleaning', 110),
    ('cooking', 'Cooking', 120),
    ('other', 'Other', 999),
]


class Command(BaseCommand):
    help = 'Seeds initial charity fields from volunteer_coordination_system_db_v0_5.sql'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for code, label, sort_order in INITIAL_CHARITY_FIELDS:
            obj, created = CharityField.objects.update_or_create(
                code=code,
                defaults={'label': label, 'sort_order': sort_order, 'active': True}
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded charity fields. Created: {created_count}, Updated: {updated_count}'
            )
        )

