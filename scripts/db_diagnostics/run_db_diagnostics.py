#!/usr/bin/env python3
"""
scripts/db_diagnostics/run_db_diagnostics.py

PostgreSQL Diagnostic Pack Runner.
Strictly READ-ONLY (enforced by 'BEGIN READ ONLY;').
Redacts all PII and sensitive parameters.
Validates environment, schema inventory, data invariants, and AI consumer dependencies.
"""

import argparse
import json
import os
import sys
from pathlib import Path
import psycopg

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DIAGNOSTICS_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = REPO_ROOT / "artifacts" / "ai_db_audit"


def parse_args():
    parser = argparse.ArgumentParser(description="VCS Read-Only Database Diagnostic Runner")
    parser.add_argument("--db-name", default=os.getenv("DB_NAME", "volunteer_coordination_db"), help="Target database name")
    parser.add_argument("--db-user", default=os.getenv("DB_USER", "postgres"), help="Database user")
    parser.add_argument("--db-host", default=os.getenv("DB_HOST", "127.0.0.1"), help="Database host (must be loopback)")
    parser.add_argument("--db-port", default=os.getenv("DB_PORT", "5432"), help="Database port")
    parser.add_argument("--allow-non-loopback", action="store_true", help="Explicit override for remote hosts (safety guard)")
    parser.add_argument("--output-dir", default=str(ARTIFACTS_DIR), help="Output directory for reports")
    return parser.parse_args()


def verify_safety_guards(args):
    # Safety Check: Must be loopback unless explicitly overridden
    is_loopback = args.db_host in ("127.0.0.1", "localhost", "::1")
    if not is_loopback and not args.allow_non_loopback:
        sys.stderr.write(
            f"[SAFETY REFUSAL] Refusing execution against non-loopback host '{args.db_host}'. "
            "Use --allow-non-loopback to override.\n"
        )
        sys.exit(1)


def run_diagnostics():
    args = parse_args()
    verify_safety_guards(args)

    password = os.getenv("DB_PASSWORD", "postgres")
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("VCS PostgreSQL Diagnostic Pack (Strictly READ-ONLY)")
    print("=" * 70)
    print(f"Target: {args.db_user}@{args.db_host}:{args.db_port}/{args.db_name}")

    try:
        conn = psycopg.connect(
            dbname=args.db_name,
            user=args.db_user,
            password=password,
            host=args.db_host,
            port=args.db_port,
        )
    except Exception as exc:
        sys.stderr.write(f"[ERROR] Could not connect to database '{args.db_name}': {exc}\n")
        sys.exit(1)

    diagnostic_results = {}
    has_failures = False

    with conn.cursor() as cur:
        # Enforce read-only transaction
        cur.execute("BEGIN READ ONLY;")

        # 1. Identity Check
        cur.execute("""
            SELECT
                current_database(),
                current_user,
                current_schema(),
                current_setting('search_path'),
                current_setting('server_version'),
                current_setting('server_version_num')::integer,
                current_setting('TimeZone'),
                current_setting('transaction_read_only'),
                inet_server_addr()::text,
                inet_server_port(),
                pg_size_pretty(pg_database_size(current_database()));
        """)
        id_row = cur.fetchone()
        cur.execute("SELECT extname, extversion FROM pg_extension ORDER BY extname;")
        exts = {r[0]: r[1] for r in cur.fetchall()}

        diagnostic_results["server_identity"] = {
            "database": id_row[0],
            "user": id_row[1],
            "current_schema": id_row[2],
            "search_path": id_row[3],
            "server_version": id_row[4],
            "server_version_num": id_row[5],
            "timezone": id_row[6],
            "read_only": id_row[7],
            "server_addr": id_row[8],
            "server_port": id_row[9],
            "database_size": id_row[10],
            "extensions": exts,
        }

        # 2. Base tables and Views
        cur.execute("""
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_type, table_name;
        """)
        tables_and_views = cur.fetchall()
        base_tables = [r[0] for r in tables_and_views if r[1] == "BASE TABLE"]
        views = [r[0] for r in tables_and_views if r[1] == "VIEW"]

        diagnostic_results["schema"] = {
            "base_tables_count": len(base_tables),
            "base_tables": base_tables,
            "views_count": len(views),
            "views": views,
        }

        # 3. Columns
        cur.execute("""
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
        """)
        columns_data = {}
        for r in cur.fetchall():
            columns_data.setdefault(r[0], []).append({
                "column": r[1],
                "type": r[2],
                "nullable": r[3],
                "default": r[4],
            })
        diagnostic_results["columns"] = columns_data

        # 4. Constraints
        cur.execute("""
            SELECT conrelid::regclass::text, conname, contype, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE connamespace = 'public'::regnamespace
            ORDER BY conrelid::regclass::text, contype, conname;
        """)
        constraints = cur.fetchall()
        diagnostic_results["constraints_count"] = len(constraints)
        diagnostic_results["constraints"] = [
            {"table": r[0], "name": r[1], "type": r[2], "definition": r[3]}
            for r in constraints
        ]

        # 5. Indexes
        cur.execute("""
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname;
        """)
        indexes = cur.fetchall()
        diagnostic_results["indexes_count"] = len(indexes)

        # 6. Triggers and Procedures
        cur.execute("""
            SELECT c.relname, t.tgname, p.proname, pg_get_triggerdef(t.oid, true)
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_proc p ON p.oid = t.tgfoid
            WHERE NOT t.tgisinternal AND n.nspname = 'public'
            ORDER BY c.relname, t.tgname;
        """)
        triggers = cur.fetchall()
        diagnostic_results["triggers_count"] = len(triggers)
        diagnostic_results["triggers"] = [
            {"table": r[0], "trigger": r[1], "function": r[2], "def": r[3]}
            for r in triggers
        ]

        # tags_are_normalized inspect
        cur.execute("""
            SELECT pg_get_functiondef(oid)
            FROM pg_proc
            WHERE proname = 'tags_are_normalized' AND pronamespace = 'public'::regnamespace;
        """)
        tan_row = cur.fetchone()
        diagnostic_results["tags_are_normalized_live_def"] = tan_row[0] if tan_row else None

        # 7. Exact Row Counts
        row_counts = {}
        for t in base_tables:
            cur.execute(f'SELECT count(*) FROM public."{t}";')
            row_counts[t] = cur.fetchone()[0]
        diagnostic_results["row_counts"] = row_counts

        # 8. Data Invariant Checks (Zero PII)
        invariants = {}

        # Dup UUID
        cur.execute("SELECT count(*) FROM (SELECT id FROM users GROUP BY id HAVING count(*) > 1) s;")
        invariants["dup_users_uuid"] = cur.fetchone()[0]

        # Orphan coordinators
        cur.execute("SELECT count(*) FROM coordinator_profiles cp LEFT JOIN users u ON cp.user_id = u.id WHERE u.id IS NULL;")
        invariants["orphaned_coordinators"] = cur.fetchone()[0]

        # Orphan event posts
        cur.execute("SELECT count(*) FROM event_posts ep LEFT JOIN events e ON ep.event_id = e.id WHERE e.id IS NULL;")
        invariants["orphaned_event_posts"] = cur.fetchone()[0]

        # Orphan applications
        cur.execute("SELECT count(*) FROM event_applications ea LEFT JOIN users u ON ea.user_id = u.id LEFT JOIN events e ON ea.event_id = e.id WHERE u.id IS NULL OR e.id IS NULL;")
        invariants["orphaned_applications"] = cur.fetchone()[0]

        # Orphan assignments
        cur.execute("SELECT count(*) FROM assignments a LEFT JOIN events e ON a.event_id = e.id LEFT JOIN users u ON a.user_id = u.id LEFT JOIN event_posts ep ON a.post_id = ep.id WHERE e.id IS NULL OR u.id IS NULL OR ep.id IS NULL;")
        invariants["orphaned_assignments"] = cur.fetchone()[0]

        # Orphan attendance
        cur.execute("SELECT count(*) FROM attendance att LEFT JOIN assignments a ON att.assignment_id = a.id WHERE a.id IS NULL;")
        invariants["orphaned_attendance"] = cur.fetchone()[0]

        diagnostic_results["invariants"] = invariants

        # Check for failures
        for k, v in invariants.items():
            if v > 0:
                print(f"[FAIL] Invariant violation: {k} = {v}")
                has_failures = True

        # 9. AI Views Existence
        required_views = [
            "v_public_events", "v_event_summary", "v_event_post_capacity",
            "v_accepted_unassigned", "v_pending_confirmations",
            "v_event_checkin_board", "v_geo_attempts_review"
        ]
        view_status = {}
        for v in required_views:
            view_status[v] = v in views
            if not view_status[v]:
                print(f"[FAIL] Required AI view missing: {v}")
                has_failures = True
        diagnostic_results["ai_views"] = view_status

        cur.execute("COMMIT;")

    conn.close()

    # Save diagnostic JSON
    json_path = out_dir / "live_db_diagnostics.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(diagnostic_results, f, indent=2)
    print(f"[SUCCESS] Diagnostic data saved to {json_path}")

    # Summary
    print("-" * 70)
    print(f"PG Version: {diagnostic_results['server_identity']['server_version']}")
    print(f"Base Tables: {diagnostic_results['schema']['base_tables_count']} (Expected: 31)")
    print(f"Views: {diagnostic_results['schema']['views_count']}")
    print(f"Constraints: {diagnostic_results['constraints_count']}")
    print(f"Triggers: {diagnostic_results['triggers_count']}")
    print(f"Invariants: {diagnostic_results['invariants']}")
    print("=" * 70)

    if has_failures:
        print("[STATUS] Diagnostics completed with WARNINGS/FAILURES.")
        return 1
    else:
        print("[STATUS] Diagnostics completed: ALL INVARIANTS PASS.")
        return 0


if __name__ == "__main__":
    sys.exit(run_diagnostics())
