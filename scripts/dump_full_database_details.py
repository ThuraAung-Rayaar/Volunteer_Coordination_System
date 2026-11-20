"""
scripts/dump_full_database_details.py
Dumps the complete, live details of the local PostgreSQL database directly from
PostgreSQL catalog tables (tables, row counts, columns, constraints, indexes, triggers, and functions).
"""
import os
import sys
from pathlib import Path

DB_NAME = os.getenv("DB_NAME", "volunteer_coordination_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")

OUTPUT_FILE = Path("local_database_full_report.txt")


def dump_database_details():
    try:
        import psycopg
    except ImportError:
        print("Error: 'psycopg' module not found. Run with: .\\.venv\\Scripts\\python.exe scripts/dump_full_database_details.py")
        sys.exit(1)

    print(f"Connecting to live local PostgreSQL database: {DB_HOST}:{DB_PORT}/{DB_NAME} as user '{DB_USER}'...")
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
        print(f"Connection failed: {exc}")
        sys.exit(1)

    cur = conn.cursor()
    print("Connected successfully. Extracting full live database details...")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("=" * 80 + "\n")
        out.write(f"LIVE LOCAL DATABASE FULL REPORT: {DB_NAME}\n")
        out.write("=" * 80 + "\n\n")

        # 1. Database & Version Info
        cur.execute("SELECT current_database(), current_user, version();")
        db, user, ver = cur.fetchone()
        out.write(f"Database: {db}\nConnected User: {user}\nEngine Version: {ver}\n\n")

        # 2. All Databases on the Server
        out.write("-" * 80 + "\n")
        out.write("1. ALL DATABASES ON LOCAL POSTGRESQL INSTANCE\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT datname, pg_size_pretty(pg_database_size(datname)) as size, pg_encoding_to_char(encoding) as encoding
              FROM pg_database
             ORDER BY datname;
        """)
        out.write(f"{'Database Name':<35} | {'Size':<12} | {'Encoding'}\n")
        out.write("-" * 65 + "\n")
        for row in cur.fetchall():
            out.write(f"{row[0]:<35} | {row[1]:<12} | {row[2]}\n")
        out.write("\n")

        # 3. Live User Tables with Row Counts and Sizes
        out.write("-" * 80 + "\n")
        out.write("2. ALL TABLES IN DATABASE (WITH LIVE ROW COUNTS & DISK SIZES)\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT relname,
                   n_live_tup,
                   pg_size_pretty(pg_total_relation_size(relid)) as total_size
              FROM pg_stat_user_tables
             WHERE schemaname = 'public'
             ORDER BY relname;
        """)
        out.write(f"{'Table Name':<40} | {'Live Rows':<12} | {'Total Disk Size'}\n")
        out.write("-" * 75 + "\n")
        for row in cur.fetchall():
            out.write(f"{row[0]:<40} | {row[1]:<12} | {row[2]}\n")
        out.write("\n")

        # 4. Table Columns Breakdown
        out.write("-" * 80 + "\n")
        out.write("3. FULL TABLE COLUMN DEFINITIONS\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT table_name, column_name, data_type, is_nullable, column_default
              FROM information_schema.columns
             WHERE table_schema = 'public'
             ORDER BY table_name, ordinal_position;
        """)
        current_table = None
        for row in cur.fetchall():
            tbl, col, dtype, nullable, default = row
            if tbl != current_table:
                current_table = tbl
                out.write(f"\n[TABLE: {current_table}]\n")
                out.write(f"  {'Column':<32} | {'Type':<26} | {'Nullable':<8} | {'Default'}\n")
                out.write("  " + "-" * 85 + "\n")
            out.write(f"  {col:<32} | {dtype:<26} | {nullable:<8} | {default or ''}\n")
        out.write("\n")

        # 5. Constraints
        out.write("-" * 80 + "\n")
        out.write("4. TABLE CONSTRAINTS (PRIMARY, FOREIGN KEY & CHECKS)\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT conrelid::regclass as table_name,
                   conname as constraint_name,
                   contype as type,
                   pg_get_constraintdef(oid) as definition
              FROM pg_constraint
             WHERE connamespace = 'public'::regnamespace
             ORDER BY table_name, constraint_name;
        """)
        for row in cur.fetchall():
            out.write(f"Table: {row[0]} | Type: {row[2]} | {row[1]}\n  Def: {row[3]}\n")
        out.write("\n")

        # 6. Indexes
        out.write("-" * 80 + "\n")
        out.write("5. ALL INDEXES\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT tablename, indexname, indexdef
              FROM pg_indexes
             WHERE schemaname = 'public'
             ORDER BY tablename, indexname;
        """)
        for row in cur.fetchall():
            out.write(f"Table: {row[0]} | Index: {row[1]}\n  SQL: {row[2]}\n")
        out.write("\n")

        # 7. Triggers
        out.write("-" * 80 + "\n")
        out.write("6. ALL DATABASE TRIGGERS\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT event_object_table as table_name,
                   trigger_name,
                   action_timing,
                   event_manipulation,
                   action_statement
              FROM information_schema.triggers
             WHERE trigger_schema = 'public'
             ORDER BY table_name, trigger_name;
        """)
        for row in cur.fetchall():
            out.write(f"Table: {row[0]} | Trigger: {row[1]} | {row[2]} {row[3]}\n  Action: {row[4]}\n")
        out.write("\n")

        # 8. Stored Procedures and Functions
        out.write("-" * 80 + "\n")
        out.write("7. STORED PROCEDURES & FUNCTIONS\n")
        out.write("-" * 80 + "\n")
        cur.execute("""
            SELECT proname,
                   pg_get_function_arguments(oid) as args,
                   prorettype::regtype as return_type
              FROM pg_proc
             WHERE pronamespace = 'public'::regnamespace
             ORDER BY proname;
        """)
        for row in cur.fetchall():
            out.write(f"Function: {row[0]}({row[1]}) -> {row[2]}\n")
        out.write("\n")

    conn.close()
    print(f"[SUCCESS] Full live database details written to {OUTPUT_FILE.resolve()}")
    print(f"Size: {OUTPUT_FILE.stat().st_size} bytes")


if __name__ == "__main__":
    dump_database_details()
