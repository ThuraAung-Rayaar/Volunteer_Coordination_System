from pathlib import Path
from django.conf import settings
from django.test.runner import DiscoverRunner


class SqlFileTestRunner(DiscoverRunner):
    def setup_databases(self, **kwargs):
        from django.db import connection

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

        orig_create_test_db = connection.creation._create_test_db

        def custom_create_test_db(verbosity, autoclobber, keepdb=False):
            orig_create_test_db(verbosity, autoclobber, keepdb)
            test_db_name = connection.creation._get_test_db_name()
            import psycopg

            db_settings = settings.DATABASES[connection.alias]
            conn = psycopg.connect(
                dbname=test_db_name,
                user=db_settings.get("USER", "postgres"),
                password=db_settings.get("PASSWORD", "postgres"),
                host=db_settings.get("HOST", "127.0.0.1"),
                port=db_settings.get("PORT", "5432"),
                autocommit=True,
            )
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT to_regclass('public.app_settings')")
                    row = cur.fetchone()
                    if not row or row[0] is None:
                        if sql_file and sql_file.exists():
                            with open(sql_file, "r", encoding="utf-8") as f:
                                sql = f.read()
                            cur.execute(sql)
            finally:
                conn.close()

        connection.creation._create_test_db = custom_create_test_db

        try:
            return super().setup_databases(**kwargs)
        finally:
            connection.creation._create_test_db = orig_create_test_db
