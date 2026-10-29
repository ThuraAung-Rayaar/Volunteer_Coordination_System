# Generated to ensure PostgreSQL column names match Django models and contract
from django.db import migrations


def align_postgres(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    with schema_editor.connection.cursor() as cursor:
        # 1. users.password drop not null
        cursor.execute("ALTER TABLE users ALTER COLUMN password DROP NOT NULL;")

        # 2. event_charity_fields rename field_id to field_code if field_id exists
        cursor.execute("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'event_charity_fields' AND column_name = 'field_id'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'event_charity_fields' AND column_name = 'field_code'
                ) THEN
                    ALTER TABLE event_charity_fields RENAME COLUMN field_id TO field_code;
                END IF;
            END $$;
        """)

        # 3. user_charity_interests rename field_id to field_code if field_id exists
        cursor.execute("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'user_charity_interests' AND column_name = 'field_id'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'user_charity_interests' AND column_name = 'field_code'
                ) THEN
                    ALTER TABLE user_charity_interests RENAME COLUMN field_id TO field_code;
                END IF;
            END $$;
        """)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_initial"),
        ("events", "0002_initial"),
    ]

    operations = [
        migrations.RunPython(align_postgres, reverse_code=migrations.RunPython.noop),
    ]

