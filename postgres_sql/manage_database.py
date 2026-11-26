"""
postgres_sql/manage_database.py

Unified Database Lifecycle & Seedlings Manager for the Volunteer Coordination System.

Covers the complete PostgreSQL lifecycle inside `postgres_sql/`:
1. Connection & DI Sync (`di_config.local.json`) using localhost (`127.0.0.1:5432`)
   and user-supplied PostgreSQL username & password.
2. Database Creation (`00_create_database.sql` logic, safe confirmation if DB exists,
   optional `--force-recreate`).
3. Structure / Schema Handling:
   - Canonical domain DDL (`postgres_sql/VCS_db.sql`: 23 tables, 11 views, triggers, stored procedures)
   - Django system/auth tables (`backend/manage.py migrate --noinput`: 8 tables)
   - Structure verification & optional SQL self-test (`postgres_sql/verify_local_db.sql` / `self_test.sql`)
4. Seedlings (`postgres_sql/seedlings/`):
   - Core Yangon demo dataset (`postgres_sql/seedlings/01_yangon_demo_seed.sql`), dynamically
     re-keyed (`phone_hash`, `phone_enc`, PBKDF2 admin passwords) to the active DI secrets.
   - Optional 500-user / 150-event multi-city AI synthetic cohort (`postgres_sql/seedlings/ai_seed_bundle/`).
5. Credentials Output:
   - Writes `<root>/SEEDED_CREDENTIALS.txt` containing Super Admin, Admin,
     Approved/Pending Coordinator, Volunteer credentials, Events, and QR Tokens.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

POSTGRES_DIR = Path(__file__).resolve().parent
REPO_ROOT = POSTGRES_DIR.parent
BACKEND_DIR = REPO_ROOT / "backend"
SEEDLINGS_DIR = POSTGRES_DIR / "seedlings"
AI_BUNDLE_DIR = SEEDLINGS_DIR / "ai_seed_bundle"
CREDENTIALS_OUT_PATH = REPO_ROOT / "SEEDED_CREDENTIALS.txt"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.setup_di_config import _load_dotenv_dict, build_di_payload, write_di_config

_SEED_ROW_RE = re.compile(
    r"\('(?P<phone>\+959\d+)',\s*'(?P<hash>[0-9a-f]{64})',\s*'(?P<enc>gAAAAA[^']*)',"
)
_ADMIN_PW_HASH_RE = re.compile(
    r"'pbkdf2_sha256\$\d+\$[^']+'"
)


def _load_existing_di_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _connect(dbname: str, user: str, password: str, host: str, port: int, autocommit: bool = False):
    import psycopg

    return psycopg.connect(
        dbname=dbname,
        user=user,
        password=password,
        host=host,
        port=port,
        autocommit=autocommit,
    )


def _quote_ident(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError(f"Unsafe SQL identifier: {name!r}")
    return f'"{name}"'


def _prepare_rekeyed_seed_sql(raw_sql: str, admin_password: str) -> str:
    """
    Recompute phone_hash, phone_enc, and admin PBKDF2 password inside the seedling SQL
    using the active `config_di` cryptographic keys so logins work on any fresh laptop.
    """
    from common.security import compute_phone_hash, encrypt_phone
    from django.contrib.auth.hashers import make_password

    def _replace_row(match: re.Match[str]) -> str:
        phone = match.group("phone")
        new_hash = compute_phone_hash(phone)
        new_enc = encrypt_phone(phone)
        return f"('{phone}', '{new_hash}', '{new_enc}',"

    rekeyed = _SEED_ROW_RE.sub(_replace_row, raw_sql)
    pw_hash = make_password(admin_password)
    rekeyed, count = _ADMIN_PW_HASH_RE.subn(lambda _m: f"'{pw_hash}'", rekeyed, count=1)
    if count != 1:
        raise RuntimeError("Could not locate admin password placeholder in seedling SQL.")
    return rekeyed


def apply_structure(
    *,
    db_name: str,
    db_user: str,
    db_password: str,
    db_host: str,
    db_port: int,
    di_config_path: Path,
) -> None:
    """Apply canonical VCS_db.sql structure and Django system migrations."""
    schema_path = POSTGRES_DIR / "VCS_db.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing schema DDL: {schema_path}")

    print(f"[STRUCTURE 1/2] Applying canonical schema {schema_path.relative_to(REPO_ROOT)}...")
    schema_sql = schema_path.read_text(encoding="utf-8")
    target_conn = _connect(db_name, db_user, db_password, db_host, db_port, autocommit=True)
    try:
        with target_conn.cursor() as cur:
            cur.execute(schema_sql)
    finally:
        target_conn.close()

    print("[STRUCTURE 2/2] Running Django migrations for auth/session/token tables...")
    env = os.environ.copy()
    env["DJANGO_SETTINGS_MODULE"] = "config.settings.local"
    env["VCS_DI_CONFIG_PATH"] = str(di_config_path)
    proc = subprocess.run(
        [sys.executable, str(BACKEND_DIR / "manage.py"), "migrate", "--noinput"],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Django migrate failed:\n{proc.stdout}\n{proc.stderr}")


def verify_database_structure(
    *,
    db_name: str,
    db_user: str,
    db_password: str,
    db_host: str,
    db_port: int,
) -> bool:
    """Run read-only structural and integrity verification on the target database."""
    conn = _connect(db_name, db_user, db_password, db_host, db_port, autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute("BEGIN READ ONLY;")
            cur.execute(
                """
                SELECT
                    current_database(),
                    current_setting('server_version'),
                    current_setting('server_version_num')::int,
                    EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'),
                    to_regprocedure('uuidv7()') IS NOT NULL,
                    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'),
                    (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public'),
                    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal)
                """
            )
            db, srv, ver_num, has_gist, has_uuidv7, tbls, views, trgs = cur.fetchone()
            cur.execute("COMMIT;")
    finally:
        conn.close()

    ok = ver_num >= 180000 and has_gist and has_uuidv7 and tbls >= 23 and views >= 11
    print("[VERIFY STRUCTURE]")
    print(f"  Database   : {db} (PostgreSQL {srv})")
    print(f"  Extensions : btree_gist={has_gist}, uuidv7()={has_uuidv7}")
    print(f"  Objects    : base_tables={tbls}, views={views}, user_triggers={trgs}")
    print(f"  Result     : {'PASS' if ok else 'FAIL'}")
    return ok


def run_ai_cohort_seed(
    *,
    db_host: str,
    db_port: int,
    db_user: str,
    db_password: str,
    db_name: str,
    di_config_path: Path,
) -> None:
    gen_script = AI_BUNDLE_DIR / "generate_seed_bundle.py"
    run_all_sql = AI_BUNDLE_DIR / "run_all.sql"
    if not gen_script.exists() or not run_all_sql.exists():
        raise FileNotFoundError(f"AI seed bundle scripts not found in {AI_BUNDLE_DIR}")

    env = os.environ.copy()
    env["DJANGO_SETTINGS_MODULE"] = "config.settings.local"
    env["VCS_DI_CONFIG_PATH"] = str(di_config_path)
    env["PGPASSWORD"] = db_password

    print("[AI COHORT 1/2] Generating 500 synthetic users & 150 events with active DI keys...")
    gen_proc = subprocess.run(
        [sys.executable, str(gen_script)],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    if gen_proc.returncode != 0:
        raise RuntimeError(f"AI seed generator failed:\n{gen_proc.stdout}\n{gen_proc.stderr}")

    print(f"[AI COHORT 2/2] Applying {run_all_sql.relative_to(REPO_ROOT)} via psql...")
    psql_proc = subprocess.run(
        [
            "psql",
            "-h", db_host,
            "-p", str(db_port),
            "-U", db_user,
            "-d", db_name,
            "-v", "ON_ERROR_STOP=1",
            "-f", str(run_all_sql),
        ],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    if psql_proc.returncode != 0:
        raise RuntimeError(f"AI cohort psql load failed:\n{psql_proc.stdout}\n{psql_proc.stderr}")


def export_credentials_report(
    *,
    db_name: str,
    db_user: str,
    db_password: str,
    db_host: str,
    db_port: int,
    admin_password: str | None = None,
    output_path: Path = CREDENTIALS_OUT_PATH,
) -> Path:
    """Query the database read-only and emit rich credentials & demo data to SEEDED_CREDENTIALS.txt."""
    from common.security import decrypt_phone

    conn = _connect(db_name, db_user, db_password, db_host, db_port, autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute("BEGIN READ ONLY;")
            cur.execute(
                """
                SELECT
                    u.id,
                    u.display_name,
                    u.phone_hash,
                    u.phone_enc,
                    u.is_superuser,
                    u.is_admin,
                    u.is_staff,
                    u.account_status,
                    u.verification_status,
                    u.home_area,
                    u.blood_type,
                    u.is_willing_to_donate_blood,
                    u.skills,
                    u.can_lift_heavy,
                    u.can_work_outdoor,
                    u.has_leader_experience,
                    cp.status AS coordinator_status,
                    t.key AS drf_token
                FROM users u
                LEFT JOIN coordinator_profiles cp ON cp.user_id = u.id
                LEFT JOIN authtoken_token t ON t.user_id = u.id
                ORDER BY u.is_superuser DESC, u.is_admin DESC,
                         CASE cp.status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                         u.id ASC
                """
            )
            user_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                    e.id,
                    e.title,
                    e.status,
                    e.owner_id,
                    e.current_coordinator_id,
                    e.location_name,
                    e.latitude,
                    e.longitude,
                    e.geo_radius_m,
                    e.acceptance_mode,
                    e.require_onboarding_ack,
                    e.start_at,
                    e.end_at,
                    COALESCE(string_agg(DISTINCT ep.title || ' (req:' || ep.required_headcount || ')', ', '), '') AS posts_summary
                FROM events e
                LEFT JOIN event_posts ep ON ep.event_id = e.id
                WHERE e.deleted_at IS NULL
                GROUP BY e.id
                ORDER BY e.id ASC
                LIMIT 30
                """
            )
            event_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                    a.user_id,
                    e.id AS event_id,
                    e.title,
                    e.status AS event_status,
                    a.status AS app_status,
                    COALESCE(asn.status, '-') AS assignment_status,
                    COALESCE(att.status, '-') AS attendance_status
                FROM event_applications a
                JOIN events e ON e.id = a.event_id
                LEFT JOIN assignments asn ON asn.application_id = a.id
                LEFT JOIN attendance att ON att.event_id = e.id AND att.user_id = a.user_id
                ORDER BY a.user_id, e.id
                """
            )
            app_rows = cur.fetchall()

            cur.execute(
                """
                SELECT q.event_id, e.title, q.purpose, q.token_hash, q.max_uses, q.expires_at
                FROM qr_tokens q
                JOIN events e ON e.id = q.event_id
                ORDER BY q.event_id, q.purpose
                """
            )
            qr_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                    (SELECT count(*) FROM users),
                    (SELECT count(*) FROM users WHERE is_superuser),
                    (SELECT count(*) FROM users WHERE is_admin),
                    (SELECT count(*) FROM coordinator_profiles WHERE status = 'approved'),
                    (SELECT count(*) FROM coordinator_profiles WHERE status = 'pending'),
                    (SELECT count(*) FROM events WHERE deleted_at IS NULL),
                    (SELECT count(*) FROM event_posts),
                    (SELECT count(*) FROM event_applications),
                    (SELECT count(*) FROM assignments),
                    (SELECT count(*) FROM attendance),
                    (SELECT count(*) FROM feedback),
                    (SELECT count(*) FROM moderation_actions),
                    (SELECT count(*) FROM authtoken_token)
                """
            )
            counts = cur.fetchone()
            cur.execute("COMMIT;")
    finally:
        conn.close()

    apps_by_user: dict[int, list[str]] = {}
    for uid, eid, etitle, estatus, app_st, asn_st, att_st in app_rows:
        apps_by_user.setdefault(uid, []).append(
            f"Event #{eid} '{etitle}' [{estatus}] (app={app_st}, assign={asn_st}, attend={att_st})"
        )

    events_by_coord: dict[int, list[str]] = {}
    for erow in event_rows:
        eid, etitle, estatus, owner_id, coord_id, loc, lat, lng, rad, mode, ack, start_at, end_at, posts = erow
        line = (
            f"Event #{eid}: {etitle} | status={estatus} | mode={mode} | "
            f"loc={loc} ({lat}, {lng}, r={rad}m) | posts=[{posts}]"
        )
        events_by_coord.setdefault(coord_id, []).append(line)
        if owner_id != coord_id:
            events_by_coord.setdefault(owner_id, []).append(f"[Owner] {line}")

    superadmins, admins, approved_coords, pending_coords, volunteers = [], [], [], [], []
    for row in user_rows:
        (
            uid, name, p_hash, p_enc, is_super, is_adm, is_staff, acc_st, ver_st,
            home, blood, donate_blood, skills, lift, outdoor, leader, coord_st, token
        ) = row
        try:
            phone_plain = decrypt_phone(p_enc) or "<decrypt-unavailable>"
        except Exception:
            phone_plain = "<encrypted-with-different-key>"

        rec = {
            "id": uid,
            "name": name,
            "phone": phone_plain,
            "phone_hash": p_hash,
            "token": token or "<none>",
            "is_super": is_super,
            "is_admin": is_adm,
            "account_status": acc_st,
            "verification_status": ver_st,
            "home_area": home or "-",
            "blood_type": blood,
            "donate_blood": donate_blood,
            "skills": ", ".join(skills or []) or "-",
            "flags": f"lift={lift}, outdoor={outdoor}, leader={leader}",
            "coord_status": coord_st,
        }
        if is_super:
            superadmins.append(rec)
        elif is_adm:
            admins.append(rec)
        elif coord_st == "approved":
            approved_coords.append(rec)
        elif coord_st == "pending":
            pending_coords.append(rec)
        else:
            volunteers.append(rec)

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    pw_display = admin_password if admin_password else "<preserved-existing-password>"

    out: list[str] = [
        "=" * 88,
        "VOLUNTEER HR MANAGEMENT SYSTEM (VCS) — SEEDED CREDENTIALS & RICH TEST DATA",
        "=" * 88,
        f"Generated At   : {now_str}",
        f"Target DB      : {db_user}@{db_host}:{db_port}/{db_name}",
        "Backend URL    : http://127.0.0.1:8000 (Emulator: http://10.0.2.2:8000)",
        "Admin Portal   : http://127.0.0.1:8000/api/v1/admin/ui/login/",
        "Swagger Docs   : http://127.0.0.1:8000/api/docs/",
        "",
        "DATABASE SUMMARY COUNTS:",
        f"  Users={counts[0]} (Superusers={counts[1]}, Admins={counts[2]}, ApprovedCoords={counts[3]}, PendingCoords={counts[4]})",
        f"  Events={counts[5]}, Posts={counts[6]}, Applications={counts[7]}, Assignments={counts[8]}, Attendance={counts[9]}",
        f"  Feedback={counts[10]}, Moderation={counts[11]}, DRF Tokens={counts[12]}",
        "",
        "HOW TO AUTHENTICATE:",
        "  1. Admin Web Portal: Enter Phone (or phone_hash) + Admin Password at /api/v1/admin/ui/login/.",
        "  2. Mobile App / API OTP: Use Phone (+959...) at /api/v1/auth/tokenized/request-otp/.",
        "     (Enable dev_options_enabled=true & debug=true in di_config.local.json to see dev_code in local API responses.)",
        "  3. Direct API / Swagger Bearer Header: Authorization: Token <DRF_TOKEN>",
        "",
    ]

    def _append_user_block(title: str, items: list[dict[str, Any]], include_pw: bool = False, limit: int | None = None) -> None:
        out.append("=" * 88)
        out.append(f"{title} (Count: {len(items)})")
        out.append("=" * 88)
        shown = items[:limit] if limit else items
        for u in shown:
            out.append(f"[{u['id']}] {u['name']}")
            out.append(f"    Phone        : {u['phone']}")
            out.append(f"    Phone Hash   : {u['phone_hash']}")
            if include_pw:
                out.append(f"    Admin Pass   : {pw_display}")
            out.append(f"    DRF Token    : {u['token']}")
            out.append(
                f"    Status       : account={u['account_status']} | verify={u['verification_status']} "
                f"| coord={u['coord_status'] or '-'} | blood={u['blood_type']} (donor={u['donate_blood']})"
            )
            out.append(f"    Home / Skills: {u['home_area']} | skills=[{u['skills']}] | {u['flags']}")
            if u["id"] in events_by_coord:
                for ev_line in events_by_coord[u["id"]][:5]:
                    out.append(f"    Managed Event: {ev_line}")
            if u["id"] in apps_by_user:
                for ap_line in apps_by_user[u["id"]][:5]:
                    out.append(f"    Activity     : {ap_line}")
            out.append("")
        if limit and len(items) > limit:
            out.append(f"... ({len(items) - limit} additional rows in database omitted for readability) ...")
            out.append("")

    # Curated 10-account export: 1 Super Admin, 2 Admins, 2 Coordinators, 5 Volunteers
    _append_user_block("1. SUPER ADMIN ACCOUNT (Max 1)", superadmins, include_pw=True, limit=1)
    _append_user_block("2. OPERATIONS ADMIN ACCOUNTS (Max 2)", admins, include_pw=True, limit=2)
    _append_user_block("3. APPROVED COORDINATORS (Max 2)", approved_coords, limit=2)
    _append_user_block("4. VOLUNTEERS (Max 5)", volunteers, limit=5)

    out.append("=" * 88)
    out.append(f"6. EVENTS CATALOG (Showing {len(event_rows)} Events)")
    out.append("=" * 88)
    for erow in event_rows:
        eid, etitle, estatus, owner_id, coord_id, loc, lat, lng, rad, mode, ack, start_at, end_at, posts = erow
        out.append(f"Event #{eid}: {etitle} [{estatus}] (mode={mode}, ack={ack})")
        out.append(f"    Owner ID={owner_id}, Coordinator ID={coord_id}")
        out.append(f"    Location: {loc} | Coords: ({lat}, {lng}) | Geofence: {rad}m")
        out.append(f"    Window  : {start_at} -> {end_at}")
        out.append(f"    Posts   : {posts or '-'}")
        out.append("")

    out.append("=" * 88)
    out.append(f"7. QR TOKENS (Count: {len(qr_rows)})")
    out.append("=" * 88)
    for eid, etitle, purpose, thash, max_uses, exp in qr_rows:
        out.append(f"Event #{eid} ({etitle}) | purpose={purpose} | max_uses={max_uses} | expires={exp}")
        out.append(f"    token_hash={thash}")

    output_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unified PostgreSQL DB Manager (creation, structure, migrations, verification, seedlings, credentials TXT)."
    )
    parser.add_argument(
        "--phase",
        choices=["all", "create", "structure", "seed", "verify", "export"],
        default="all",
        help="Lifecycle phase to run (default: all)",
    )
    parser.add_argument("--user", help="PostgreSQL username (default: prompt or postgres)")
    parser.add_argument("--password", help="PostgreSQL password (prompted securely if omitted)")
    parser.add_argument("--host", default="127.0.0.1", help="PostgreSQL host (default: 127.0.0.1 / localhost)")
    parser.add_argument("--port", type=int, default=5432, help="PostgreSQL port (default: 5432)")
    parser.add_argument("--db-name", default="volunteer_coordination_db", help="Target database name")
    parser.add_argument("--admin-password", help="Password to assign to seeded Super Admin & Admin accounts")
    parser.add_argument("--with-ai-cohort", action="store_true", help="(Default) Generate & seed 500 synthetic users + 150 events")
    parser.add_argument("--skip-ai-cohort", action="store_true", help="Skip the 500-user / 150-event AI synthetic cohort")
    parser.add_argument("--force-recreate", action="store_true", help="Drop and recreate target DB if it already exists")
    parser.add_argument("--export-only", action="store_true", help="Alias for --phase export (read-only credentials report)")
    parser.add_argument("--verify-structure", action="store_true", help="Run read-only schema/object verification after setup")
    parser.add_argument("--di-config", help="Path to DI config JSON (default: di_config.local.json)")
    parser.add_argument("--no-save-di", action="store_true", help="Do not overwrite di_config.local.json database settings")
    parser.add_argument("--credentials-out", default=str(CREDENTIALS_OUT_PATH), help="Output path for credentials TXT")
    parser.add_argument("--non-interactive", action="store_true", help="Fail instead of prompting on existing DB conflicts")
    args = parser.parse_args()

    phase = "export" if args.export_only else args.phase

    print("=" * 74)
    print("Volunteer Coordination System — Unified PostgreSQL & Seedlings Manager")
    print("=" * 74)

    di_path = Path(args.di_config) if args.di_config else (REPO_ROOT / "di_config.local.json")
    existing_di = _load_existing_di_json(di_path)
    env_map = _load_dotenv_dict()
    cur_db_cfg = existing_di.get("database", {}) if isinstance(existing_di.get("database"), dict) else {}

    default_user = args.user or cur_db_cfg.get("user") or env_map.get("DB_USER") or "postgres"
    if args.user:
        db_user = args.user
    elif args.non_interactive:
        db_user = str(default_user)
    else:
        db_user = input(f"PostgreSQL username [{default_user}]: ").strip() or str(default_user)

    db_password = args.password
    if db_password is None:
        if args.non_interactive:
            db_password = str(cur_db_cfg.get("password") or env_map.get("DB_PASSWORD") or "")
        else:
            existing_pw = str(cur_db_cfg.get("password") or env_map.get("DB_PASSWORD") or "")
            prompt_hint = " (press Enter to reuse configured password)" if existing_pw else ""
            entered_pw = getpass.getpass(f"PostgreSQL password for '{db_user}'@localhost{prompt_hint}: ")
            db_password = entered_pw if entered_pw else existing_pw

    if not db_password:
        print("[ERROR] PostgreSQL password is required.", file=sys.stderr)
        return 1

    db_host = "127.0.0.1" if args.host.lower() == "localhost" else args.host
    db_port = args.port
    db_name = args.db_name

    payload = build_di_payload(
        existing=existing_di,
        env_map=env_map if not existing_di else {},
        db_user=db_user,
        db_password=db_password,
        db_host=db_host,
        db_port=str(db_port),
        db_name=db_name,
    )
    if args.no_save_di:
        active_di_path = REPO_ROOT / ".local" / "tmp_setup_di.json"
        write_di_config(payload, active_di_path)
    else:
        active_di_path = di_path
        write_di_config(payload, active_di_path)

    os.environ["VCS_DI_CONFIG_PATH"] = str(active_di_path)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

    import config_di
    config_di.configure_container(config_path=active_di_path, load_env_files=False)
    import django
    django.setup()

    try:
        if phase == "verify":
            ok = verify_database_structure(
                db_name=db_name, db_user=db_user, db_password=db_password, db_host=db_host, db_port=db_port
            )
            return 0 if ok else 1

        if phase == "export":
            out_file = export_credentials_report(
                db_name=db_name,
                db_user=db_user,
                db_password=db_password,
                db_host=db_host,
                db_port=db_port,
                output_path=Path(args.credentials_out),
            )
            print(f"[OK] Exported credentials report to {out_file}")
            return 0

        if phase in ("all", "create"):
            try:
                maint_conn = _connect("postgres", db_user, db_password, db_host, db_port, autocommit=True)
            except Exception as exc:
                print(f"[ERROR] Failed connecting to PostgreSQL on {db_host}:{db_port} as '{db_user}': {exc}", file=sys.stderr)
                return 1

            try:
                with maint_conn.cursor() as cur:
                    cur.execute("SELECT current_setting('server_version'), current_setting('server_version_num')::int;")
                    srv_ver, srv_num = cur.fetchone()
                    print(f"[OK] Connected to PostgreSQL {srv_ver} on {db_host}:{db_port}")
                    if srv_num < 180000:
                        print(f"[ERROR] PostgreSQL >= 18.0 required (detected {srv_ver}).", file=sys.stderr)
                        return 1
                    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (db_name,))
                    db_exists = cur.fetchone() is not None

                action = "create"
                if db_exists:
                    existing_users = 0
                    try:
                        chk_conn = _connect(db_name, db_user, db_password, db_host, db_port)
                        with chk_conn.cursor() as chk_cur:
                            chk_cur.execute("SELECT to_regclass('public.users') IS NOT NULL;")
                            if chk_cur.fetchone()[0]:
                                chk_cur.execute("SELECT count(*) FROM users;")
                                existing_users = chk_cur.fetchone()[0]
                        chk_conn.close()
                    except Exception:
                        existing_users = 0

                    if args.force_recreate:
                        action = "recreate"
                    elif args.non_interactive:
                        print(
                            f"[ABORT] Database '{db_name}' already exists (users={existing_users}). "
                            "Pass --force-recreate or --phase export.",
                            file=sys.stderr,
                        )
                        return 1
                    else:
                        print(f"\n[!] Database '{db_name}' already exists (users={existing_users}).")
                        print("    [R] Recreate database from scratch (DROPS existing database!)")
                        print("    [S] Keep structure & re-seed Yangon demo data (TRUNCATES operational tables)")
                        print("    [E] Export SEEDED_CREDENTIALS.txt only (read-only, safest)")
                        print("    [A] Abort")
                        choice = input("Select action [E]: ").strip().upper() or "E"
                        if choice == "R":
                            action = "recreate"
                        elif choice == "S":
                            action = "seed_only"
                        elif choice == "E":
                            out_file = export_credentials_report(
                                db_name=db_name,
                                db_user=db_user,
                                db_password=db_password,
                                db_host=db_host,
                                db_port=db_port,
                                output_path=Path(args.credentials_out),
                            )
                            print(f"[OK] Exported credentials report to {out_file}")
                            return 0
                        else:
                            print("Aborted by user.")
                            return 0

                if action in ("create", "recreate"):
                    ident = _quote_ident(db_name)
                    with maint_conn.cursor() as cur:
                        if action == "recreate":
                            print(f"[CREATE] Dropping existing database '{db_name}'...")
                            cur.execute(
                                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                                "WHERE datname = %s AND pid <> pg_backend_pid();",
                                (db_name,),
                            )
                            cur.execute(f"DROP DATABASE IF EXISTS {ident};")
                        print(f"[CREATE] Creating database '{db_name}' (UTF8)...")
                        cur.execute(f"CREATE DATABASE {ident} WITH ENCODING 'UTF8' TEMPLATE template0;")
            finally:
                maint_conn.close()

            if phase == "create":
                print(f"[SUCCESS] Database '{db_name}' creation step completed.")
                return 0
        else:
            action = "seed_only"

        if phase == "structure" or (phase == "all" and action in ("create", "recreate")):
            apply_structure(
                db_name=db_name,
                db_user=db_user,
                db_password=db_password,
                db_host=db_host,
                db_port=db_port,
                di_config_path=active_di_path,
            )
            if args.verify_structure:
                verify_database_structure(
                    db_name=db_name, db_user=db_user, db_password=db_password, db_host=db_host, db_port=db_port
                )
            if phase == "structure":
                print(f"[SUCCESS] Structure & Django migrations applied to '{db_name}'.")
                return 0

        if phase in ("all", "seed"):
            admin_pw = args.admin_password or str(payload.get("auth", {}).get("admin_bootstrap_password") or "").strip()
            if not admin_pw and not args.non_interactive:
                entered_admin_pw = getpass.getpass(
                    "Admin Portal password for seeded Super Admin & Admin (Enter to auto-generate): "
                )
                admin_pw = entered_admin_pw.strip()
            if not admin_pw:
                admin_pw = secrets.token_urlsafe(12)

            seedling_path = SEEDLINGS_DIR / "01_yangon_demo_seed.sql"
            if not seedling_path.exists():
                raise FileNotFoundError(f"Missing seedling file: {seedling_path}")

            print(f"[SEED] Applying {seedling_path.relative_to(REPO_ROOT)} (re-keyed to active DI secrets)...")
            seed_sql = _prepare_rekeyed_seed_sql(seedling_path.read_text(encoding="utf-8"), admin_pw)
            seed_conn = _connect(db_name, db_user, db_password, db_host, db_port, autocommit=True)
            try:
                with seed_conn.cursor() as cur:
                    cur.execute(seed_sql)
            finally:
                seed_conn.close()

            if not args.skip_ai_cohort:
                run_ai_cohort_seed(
                    db_host=db_host,
                    db_port=db_port,
                    db_user=db_user,
                    db_password=db_password,
                    db_name=db_name,
                    di_config_path=active_di_path,
                )

            if args.verify_structure:
                verify_database_structure(
                    db_name=db_name, db_user=db_user, db_password=db_password, db_host=db_host, db_port=db_port
                )

            out_file = export_credentials_report(
                db_name=db_name,
                db_user=db_user,
                db_password=db_password,
                db_host=db_host,
                db_port=db_port,
                admin_password=admin_pw,
                output_path=Path(args.credentials_out),
            )
            print(f"[SUCCESS] Database '{db_name}' ready and credentials written to: {out_file}")
        return 0
    finally:
        if args.no_save_di and active_di_path.exists():
            try:
                active_di_path.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
