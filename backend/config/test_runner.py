from pathlib import Path
from django.conf import settings
from django.test.runner import DiscoverRunner


class SqlFileTestRunner(DiscoverRunner):
    def setup_databases(self, **kwargs):
        old_config = super().setup_databases(**kwargs)
        from django.db import connection

        # Candidates for SQL schema
        candidates = [
            Path(settings.BASE_DIR).parent / "postgres sql" / "updated_volunteer_coordination_system_Database.sql",
            Path(settings.BASE_DIR) / "postgres sql" / "updated_volunteer_coordination_system_Database.sql",
            Path(settings.BASE_DIR).parent / "postgres sql" / "ex1_volunteer_coordination_system_database_schema_v0_5_2.sql",
        ]

        sql_file = None
        for path in candidates:
            if path.exists():
                sql_file = path
                break

        if not sql_file:
            sql_dir = Path(settings.BASE_DIR).parent / "postgres sql"
            if sql_dir.exists():
                sql_files = list(sql_dir.glob("*.sql"))
                if sql_files:
                    sql_file = sql_files[0]

        if sql_file and sql_file.exists():
            with open(sql_file, "r", encoding="utf-8") as f:
                sql = f.read()
            with connection.cursor() as cursor:
                cursor.execute(sql)

        return old_config

