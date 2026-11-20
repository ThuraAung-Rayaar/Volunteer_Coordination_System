"""
scripts/alter_local_db.py
Automated CLI helper to apply the v0.12.0 database alteration script
(auth_otp_challenge table, stored functions, triggers) to the local PostgreSQL database.
"""
import os
import sys
from pathlib import Path

# Repository root
REPO_ROOT = Path(__file__).resolve().parent.parent

# Database configuration defaults matching backend/config/settings/base.py
DB_NAME = os.getenv("DB_NAME", "volunteer_coordination_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")

UPGRADE_SQL_FILE = REPO_ROOT / "postgres_sql" / "v0_12_0_auth_otp_challenge_upgrade.sql"


def run_migration():
    print("=" * 60)
    print("Volunteer Coordination System: v0.12.0 Local DB Alteration")
    print("=" * 60)
    print(f"Connecting to PostgreSQL at {DB_HOST}:{DB_PORT}/{DB_NAME} as user '{DB_USER}'...")

    if not UPGRADE_SQL_FILE.exists():
        print(f"Error: Migration script not found at {UPGRADE_SQL_FILE}")
        sys.exit(1)

    try:
        import psycopg
    except ImportError:
        print("Error: 'psycopg' module not found. Run from the project virtual environment:")
        print("  .\\.venv\\Scripts\\python.exe scripts/alter_local_db.py")
        sys.exit(1)

    try:
        conn = psycopg.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            autocommit=True,
        )
    except Exception as exc:
        print(f"\n[FAILED] Could not connect to database '{DB_NAME}': {exc}")
        print("\nPlease check that PostgreSQL is running and credentials are correct.")
        sys.exit(1)

    print("[OK] Connected successfully.")
    print(f"Executing migration script: {UPGRADE_SQL_FILE.name}...")

    sql_content = UPGRADE_SQL_FILE.read_text(encoding="utf-8")

    try:
        with conn.cursor() as cur:
            cur.execute(sql_content)
        print("[OK] Migration script executed successfully.")
    except Exception as exc:
        print(f"\n[FAILED] Error executing migration SQL: {exc}")
        conn.close()
        sys.exit(1)

    print("\nVerifying database objects...")
    with conn.cursor() as cur:
        # 1. Check table existence
        cur.execute("""
            SELECT count(*)
              FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = 'auth_otp_challenge';
        """)
        tbl_exists = cur.fetchone()[0] == 1
        print(f"  - Table 'auth_otp_challenge': {'FOUND' if tbl_exists else 'MISSING'}")

        # 2. Check stored functions
        cur.execute("""
            SELECT proname
              FROM pg_proc
             WHERE proname IN ('create_otp_challenge', 'verify_otp_challenge', 'purge_expired_otp_challenges')
               AND pronamespace = 'public'::regnamespace;
        """)
        funcs = [row[0] for row in cur.fetchall()]
        print(f"  - Stored functions: {funcs}")

        # 3. Check trigger
        cur.execute("""
            SELECT tgname
              FROM pg_trigger
             WHERE tgrelid = 'public.auth_otp_challenge'::regclass
               AND tgname = 'trg_01_auth_otp_challenge_guard';
        """)
        trg_row = cur.fetchone()
        trg_exists = trg_row is not None
        print(f"  - Trigger 'trg_01_auth_otp_challenge_guard': {'ACTIVE' if trg_exists else 'MISSING'}")

    conn.close()

    if tbl_exists and len(funcs) == 3 and trg_exists:
        print("\n" + "=" * 60)
        print("[SUCCESS] Local database has been successfully updated to v0.12.0!")
        print("=" * 60)
    else:
        print("\n[WARNING] Some objects could not be verified. Please check the logs above.")
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
