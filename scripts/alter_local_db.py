"""
scripts/alter_local_db.py
Automated CLI helper to apply the v0.12.0 database alteration script
(auth_otp_challenge table, stored functions, triggers) to a DISPOSABLE test database only.

Hardened per Section 3.2 (A4) of V0_12_0_STABILIZATION_MASTER_PLAN.md:
- Strictly blocked against targeting the production prototype database 'volunteer_coordination_db'.
- Requires explicit APP_ENV=ci or APP_ENV=test.
- Enforces disposable database allow-list.
"""
import os
import sys
from pathlib import Path

# Repository root
REPO_ROOT = Path(__file__).resolve().parent.parent

# Disposable database allow-list
DISPOSABLE_DB_ALLOWLIST = {
    "test_volunteer_coordination_db",
    "ci_volunteer_coordination_db",
    "ephemeral_volunteer_coordination_db",
}
DISPOSABLE_HOST_ALLOWLIST = {"127.0.0.1", "localhost"}

# Database configuration from environment
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")

UPGRADE_SQL_FILE = REPO_ROOT / "postgres_sql" / "v0_12_0_auth_otp_challenge_upgrade.sql"


def validate_environment_safety():
    """Refuse execution against protected databases or unauthorized environments."""
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if app_env not in {"ci", "test"}:
        sys.stderr.write(
            f"[SAFETY REFUSAL] Refusing execution: alter_local_db.py requires explicit "
            f"APP_ENV=ci or APP_ENV=test (current APP_ENV='{app_env}')\n"
        )
        sys.exit(1)

    if not DB_NAME or DB_NAME == "volunteer_coordination_db" or DB_NAME not in DISPOSABLE_DB_ALLOWLIST:
        sys.stderr.write(
            f"[SAFETY REFUSAL] Refusing execution: DB_NAME '{DB_NAME}' is forbidden. "
            f"Altering 'volunteer_coordination_db' is strictly prohibited. "
            f"Target must be in disposable allow-list: {sorted(DISPOSABLE_DB_ALLOWLIST)}\n"
        )
        sys.exit(1)

    if DB_HOST not in DISPOSABLE_HOST_ALLOWLIST:
        sys.stderr.write(
            f"[SAFETY REFUSAL] Refusing execution: DB_HOST '{DB_HOST}' is not an approved local test host.\n"
        )
        sys.exit(1)


def run_migration():
    validate_environment_safety()

    print("=" * 60)
    print("Volunteer Coordination System: v0.12.0 Disposable DB Alteration")
    print("=" * 60)
    print(f"Connecting to PostgreSQL at {DB_HOST}:{DB_PORT}/{DB_NAME} as user '{DB_USER}'...")

    if not UPGRADE_SQL_FILE.exists():
        print(f"Error: Migration script not found at {UPGRADE_SQL_FILE}", file=sys.stderr)
        sys.exit(1)

    try:
        import psycopg
    except ImportError:
        print("Error: 'psycopg' module not found. Run from the project virtual environment:", file=sys.stderr)
        print("  .\\.venv\\Scripts\\python.exe scripts/alter_local_db.py", file=sys.stderr)
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
        print(f"\n[FAILED] Could not connect to database '{DB_NAME}': {exc}", file=sys.stderr)
        sys.exit(1)

    print("[OK] Connected successfully.")
    print(f"Executing migration script: {UPGRADE_SQL_FILE.name}...")

    sql_content = UPGRADE_SQL_FILE.read_text(encoding="utf-8")

    try:
        with conn.cursor() as cur:
            cur.execute(sql_content)
        print("[OK] Migration script executed successfully.")
    except Exception as exc:
        print(f"\n[FAILED] Error executing migration SQL: {exc}", file=sys.stderr)
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
        print("[SUCCESS] Disposable database has been successfully updated to v0.12.0!")
        print("=" * 60)
    else:
        print("\n[WARNING] Some objects could not be verified. Please check the logs above.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    run_migration()
