"""
scripts/check_system_status.py

Inspects the local workstation / new laptop to determine how much of the
Volunteer HR Management System (VCS) environment is satisfied.

Checks:
- OS, Shell, Git
- Python version, `.venv`, required backend Python packages
- PostgreSQL CLI (`psql`, `createdb`, `pg_isready`), server connectivity, PG >= 18,
  `btree_gist` extension, `uuidv7()`, table/view counts, seed data readiness
- Node.js >= 22.11.0, npm, `mobile/node_modules`, React Native 0.88.1 / React 19.3 / TS 6.0
- Java JDK (17/21 LTS), JAVA_HOME, Android Studio IDE, Android SDK, `adb`,
  Build Tools 37.0.0, Compile SDK 36/37, NDK 27.1.12297006, Gradle wrapper, AVDs, connected devices
- Dependency Injection config (`config_di.py`, `di_config.local.json`, `.env`)
- Map MBTiles packs (`map/*.mbtiles`) and optional AI runtime (Ollama / Gemini key)

Outputs a concise console summary and writes `SYSTEM_STATUS.md` at the repository root.
Strictly read-only (uses `BEGIN READ ONLY` for PostgreSQL checks; never prints secrets).
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
MOBILE_DIR = REPO_ROOT / "mobile"
BACKEND_DIR = REPO_ROOT / "backend"
POSTGRES_DIR = REPO_ROOT / "postgres_sql"
SEEDLINGS_DIR = POSTGRES_DIR / "seedlings"
MAP_DIR = REPO_ROOT / "map"
DEFAULT_STATUS_MD = REPO_ROOT / "SYSTEM_STATUS.md"

_PLACEHOLDER_PREFIXES = (
    "django-insecure",
    "your-",
    "replace_with_",
    "replace-with-",
    "change-me",
    "<generate-",
    "example-",
)


@dataclass
class CheckResult:
    category: str
    name: str
    required: str
    detected: str
    status: str  # PASS | WARN | FAIL
    mandatory: bool = True
    remediation: str = ""


def _run_cmd(cmd: list[str], timeout: int = 8) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(REPO_ROOT),
        )
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, "", str(exc)


def _parse_version_tuple(raw: str) -> tuple[int, ...]:
    nums = [int(x) for x in re.findall(r"\d+", raw or "")]
    return tuple(nums)


def _version_gte(raw: str, minimum: tuple[int, ...]) -> bool:
    parsed = _parse_version_tuple(raw)
    if not parsed:
        return False
    padded = parsed + (0,) * max(0, len(minimum) - len(parsed))
    return padded[: len(minimum)] >= minimum


def _is_placeholder(val: Any) -> bool:
    text = str(val or "").strip()
    if not text:
        return True
    lower = text.lower()
    return any(lower.startswith(p) for p in _PLACEHOLDER_PREFIXES)


def _load_env_map() -> dict[str, str]:
    env_map: dict[str, str] = {}
    for env_file in (BACKEND_DIR / ".env", REPO_ROOT / ".env"):
        if not env_file.exists():
            continue
        try:
            for line in env_file.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                k, v = stripped.split("=", 1)
                env_map.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except OSError:
            pass
    for k, v in os.environ.items():
        env_map[k] = v
    return env_map


def _load_di_json() -> dict[str, Any]:
    di_path = REPO_ROOT / "di_config.local.json"
    if not di_path.exists():
        return {}
    try:
        data = json.loads(di_path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _find_venv_python() -> Path | None:
    candidates = [
        REPO_ROOT / ".venv" / "Scripts" / "python.exe",
        REPO_ROOT / ".venv" / "bin" / "python",
    ]
    for cand in candidates:
        if cand.exists():
            return cand
    return None


def _find_android_sdk() -> Path | None:
    candidates: list[Path] = []
    for var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        val = os.environ.get(var, "").strip()
        if val:
            candidates.append(Path(val))
    local_app = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app:
        candidates.append(Path(local_app) / "Android" / "Sdk")
    home = Path.home()
    candidates.extend([
        home / "AppData" / "Local" / "Android" / "Sdk",
        home / "Android" / "Sdk",
        home / "Library" / "Android" / "sdk",
    ])
    for path in candidates:
        if path.exists() and path.is_dir():
            return path
    return None


def _find_android_studio() -> Path | None:
    candidates = [
        Path("C:/Program Files/Android/Android Studio/bin/studio64.exe"),
        Path("C:/Program Files (x86)/Android/Android Studio/bin/studio64.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Android Studio" / "bin" / "studio64.exe",
        Path("/Applications/Android Studio.app"),
        Path.home() / "Applications" / "Android Studio.app",
    ]
    for path in candidates:
        if str(path).strip() and path.exists():
            return path
    return None


def _tcp_open(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def collect_checks() -> list[CheckResult]:
    results: list[CheckResult] = []
    env_map = _load_env_map()
    di_json = _load_di_json()

    # ------------------------------------------------------------------
    # 1. OS & Core CLI
    # ------------------------------------------------------------------
    results.append(
        CheckResult(
            category="Host & Shell",
            name="Operating System",
            required="Windows 10/11, macOS, or Linux",
            detected=f"{platform.system()} {platform.release()} ({platform.machine()})",
            status="PASS",
            mandatory=True,
        )
    )

    git_bin = shutil.which("git")
    if git_bin:
        rc, out, _ = _run_cmd(["git", "--version"])
        results.append(
            CheckResult(
                category="Host & Shell",
                name="Git CLI",
                required="Git >= 2.30",
                detected=out if rc == 0 else git_bin,
                status="PASS" if rc == 0 else "WARN",
                mandatory=True,
            )
        )
    else:
        results.append(
            CheckResult(
                category="Host & Shell",
                name="Git CLI",
                required="Git >= 2.30",
                detected="Not found in PATH",
                status="FAIL",
                mandatory=True,
                remediation="Install Git for Windows / system package manager.",
            )
        )

    # ------------------------------------------------------------------
    # 2. Python & Backend Virtual Environment
    # ------------------------------------------------------------------
    py_ver = platform.python_version()
    py_ok = sys.version_info >= (3, 11)
    results.append(
        CheckResult(
            category="Python & Backend",
            name="Host Python Interpreter",
            required="Python >= 3.11 (target 3.12.x)",
            detected=f"Python {py_ver}",
            status="PASS" if py_ok else "FAIL",
            mandatory=True,
            remediation="Install Python 3.12.x and ensure it is on PATH.",
        )
    )

    venv_py = _find_venv_python()
    if venv_py:
        rc, out, _ = _run_cmd([str(venv_py), "--version"])
        results.append(
            CheckResult(
                category="Python & Backend",
                name="Project Virtual Environment (.venv)",
                required=".venv present with Python >= 3.11",
                detected=f"{out} ({venv_py.relative_to(REPO_ROOT)})",
                status="PASS" if rc == 0 else "WARN",
                mandatory=True,
            )
        )
    else:
        results.append(
            CheckResult(
                category="Python & Backend",
                name="Project Virtual Environment (.venv)",
                required=".venv present with Python >= 3.11",
                detected="Missing (.venv not found)",
                status="FAIL",
                mandatory=True,
                remediation="Run: python -m venv .venv && .\\.venv\\Scripts\\pip install -r backend\\requirements\\local.txt",
            )
        )

    # Check key backend packages inside .venv (or current python)
    check_py = str(venv_py) if venv_py else sys.executable
    pkg_script = (
        "import importlib.metadata as m, json; "
        "pkgs = ['Django','djangorestframework','psycopg','cryptography','python-dotenv','Pillow','drf-spectacular','django-cors-headers','django-filter']; "
        "out = {}; "
        "[out.__setitem__(p, m.version(p)) for p in pkgs if any(d.metadata['Name'].lower()==p.lower() for d in m.distributions())]; "
        "print(json.dumps(out))"
    )
    rc, pkg_out, _ = _run_cmd([check_py, "-c", pkg_script], timeout=10)
    pkg_versions: dict[str, str] = {}
    if rc == 0 and pkg_out:
        try:
            pkg_versions = json.loads(pkg_out)
        except ValueError:
            pkg_versions = {}

    django_v = pkg_versions.get("Django", "")
    results.append(
        CheckResult(
            category="Python & Backend",
            name="Django & DRF Stack",
            required="Django 5.1.x + DRF >= 3.15.2 + psycopg >= 3.2",
            detected=(
                f"Django {django_v}, DRF {pkg_versions.get('djangorestframework', 'missing')}, "
                f"psycopg {pkg_versions.get('psycopg', 'missing')}"
                if django_v
                else "Packages missing in active Python"
            ),
            status=(
                "PASS"
                if _version_gte(django_v, (5, 1, 0))
                and _version_gte(pkg_versions.get("djangorestframework", ""), (3, 15, 2))
                and _version_gte(pkg_versions.get("psycopg", ""), (3, 2, 0))
                else "FAIL"
            ),
            mandatory=True,
            remediation="Run: .\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements\\local.txt",
        )
    )

    required_pkgs = ["cryptography", "python-dotenv", "Pillow", "drf-spectacular", "django-cors-headers", "django-filter"]
    missing_pkgs = [p for p in required_pkgs if p not in pkg_versions]
    results.append(
        CheckResult(
            category="Python & Backend",
            name="Backend Supporting Libraries",
            required=", ".join(required_pkgs),
            detected="All installed" if not missing_pkgs else f"Missing: {', '.join(missing_pkgs)}",
            status="PASS" if not missing_pkgs else "FAIL",
            mandatory=True,
            remediation="Run: .\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements\\local.txt",
        )
    )

    # ------------------------------------------------------------------
    # 3. PostgreSQL & Database State
    # ------------------------------------------------------------------
    psql_bin = shutil.which("psql")
    if psql_bin:
        rc, out, _ = _run_cmd(["psql", "--version"])
        pg_cli_ok = rc == 0 and _version_gte(out, (18, 0, 0))
        results.append(
            CheckResult(
                category="PostgreSQL & Database",
                name="PostgreSQL CLI (psql)",
                required="PostgreSQL >= 18.0 (target 18.6)",
                detected=out or psql_bin,
                status="PASS" if pg_cli_ok else "WARN",
                mandatory=True,
                remediation="Install PostgreSQL 18.x and add its bin/ folder to PATH.",
            )
        )
    else:
        results.append(
            CheckResult(
                category="PostgreSQL & Database",
                name="PostgreSQL CLI (psql)",
                required="PostgreSQL >= 18.0 (target 18.6)",
                detected="psql not found on PATH",
                status="FAIL",
                mandatory=True,
                remediation="Install PostgreSQL 18.6 and add C:\\Program Files\\PostgreSQL\\18\\bin to PATH.",
            )
        )

    db_cfg = di_json.get("database", {}) if isinstance(di_json.get("database"), dict) else {}
    db_name = str(db_cfg.get("name") or env_map.get("DB_NAME") or "volunteer_coordination_db")
    db_user = str(db_cfg.get("user") or env_map.get("DB_USER") or "postgres")
    db_password = str(db_cfg.get("password") or env_map.get("DB_PASSWORD") or "")
    db_host = str(db_cfg.get("host") or env_map.get("DB_HOST") or "127.0.0.1")
    db_port = int(str(db_cfg.get("port") or env_map.get("DB_PORT") or "5432"))

    pg_port_up = _tcp_open(db_host, db_port)
    results.append(
        CheckResult(
            category="PostgreSQL & Database",
            name="PostgreSQL Service Port",
            required=f"Listening on {db_host}:{db_port}",
            detected=f"Reachable ({db_host}:{db_port})" if pg_port_up else f"Not reachable ({db_host}:{db_port})",
            status="PASS" if pg_port_up else "FAIL",
            mandatory=True,
            remediation="Start the local postgresql-x64-18 Windows service.",
        )
    )

    schema_sql = POSTGRES_DIR / "VCS_db.sql"
    manage_db_py = POSTGRES_DIR / "manage_database.py"
    seedling_sql = SEEDLINGS_DIR / "01_yangon_demo_seed.sql"
    ai_bundle_sql = SEEDLINGS_DIR / "ai_seed_bundle" / "run_all.sql"
    results.append(
        CheckResult(
            category="PostgreSQL & Database",
            name="Unified Schema, DB Manager & Seedlings",
            required="postgres_sql/manage_database.py, VCS_db.sql & postgres_sql/seedlings/",
            detected=(
                f"manage_database.py={'OK' if manage_db_py.exists() else 'MISSING'}, "
                f"VCS_db.sql={'OK' if schema_sql.exists() else 'MISSING'}, "
                f"yangon_seed={'OK' if seedling_sql.exists() else 'MISSING'}, "
                f"ai_bundle={'OK' if ai_bundle_sql.exists() else 'MISSING'}"
            ),
            status="PASS" if (manage_db_py.exists() and schema_sql.exists() and seedling_sql.exists() and ai_bundle_sql.exists()) else "FAIL",
            mandatory=True,
            remediation="Ensure postgres_sql/manage_database.py, VCS_db.sql, and postgres_sql/seedlings/ exist.",
        )
    )

    # Probe DB internals read-only via venv python + psycopg if reachable
    if pg_port_up and "psycopg" in pkg_versions and db_password:
        probe_code = """
import json, os, psycopg
conn = psycopg.connect(
    dbname=os.environ['VCS_CHK_DB'],
    user=os.environ['VCS_CHK_USER'],
    password=os.environ['VCS_CHK_PW'],
    host=os.environ['VCS_CHK_HOST'],
    port=int(os.environ['VCS_CHK_PORT']),
    connect_timeout=4,
)
cur = conn.cursor()
cur.execute('BEGIN READ ONLY;')
cur.execute(
    "SELECT current_setting('server_version'), current_setting('server_version_num')::int, "
    "EXISTS(SELECT 1 FROM pg_extension WHERE extname='btree_gist'), to_regprocedure('uuidv7()') IS NOT NULL, "
    "(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'), "
    "(SELECT count(*) FROM information_schema.views WHERE table_schema='public')"
)
srv, num, gist, uv7, tbls, views = cur.fetchone()
users_c = events_c = admins_c = super_c = 0
cur.execute("SELECT to_regclass('public.users') IS NOT NULL, to_regclass('public.events') IS NOT NULL")
has_u, has_e = cur.fetchone()
if has_u:
    cur.execute('SELECT count(*), count(*) FILTER (WHERE is_admin), count(*) FILTER (WHERE is_superuser) FROM users')
    users_c, admins_c, super_c = cur.fetchone()
if has_e:
    cur.execute('SELECT count(*) FROM events')
    events_c = cur.fetchone()[0]
cur.execute('COMMIT;')
conn.close()
print(json.dumps({
    'srv': srv, 'num': num, 'gist': gist, 'uv7': uv7, 'tbls': tbls, 'views': views,
    'users': users_c, 'admins': admins_c, 'super': super_c, 'events': events_c,
}))
""".strip()
        probe_env = os.environ.copy()
        probe_env.update({
            "VCS_CHK_DB": db_name,
            "VCS_CHK_USER": db_user,
            "VCS_CHK_PW": db_password,
            "VCS_CHK_HOST": db_host,
            "VCS_CHK_PORT": str(db_port),
        })
        try:
            proc = subprocess.run(
                [check_py, "-c", probe_code],
                capture_output=True,
                text=True,
                timeout=8,
                env=probe_env,
                cwd=str(REPO_ROOT),
            )
            if proc.returncode == 0 and proc.stdout.strip():
                info = json.loads(proc.stdout.strip())
                db_ready = (
                    info["num"] >= 180000
                    and info["gist"]
                    and info["uv7"]
                    and info["tbls"] >= 23
                    and info["views"] >= 11
                )
                results.append(
                    CheckResult(
                        category="PostgreSQL & Database",
                        name=f"Target Database ({db_name})",
                        required="PG >= 18, btree_gist, uuidv7(), >=23 domain tables (31 w/ Django), 11 views",
                        detected=(
                            f"PG {info['srv']}, btree_gist={info['gist']}, uuidv7={info['uv7']}, "
                            f"tables={info['tbls']}, views={info['views']}"
                        ),
                        status="PASS" if db_ready else "WARN",
                        mandatory=True,
                        remediation="Run: .\\.venv\\Scripts\\python.exe postgres_sql\\manage_database.py",
                    )
                )
                seeded_ok = info["users"] > 0 and info["events"] > 0 and info["super"] >= 1 and info["admins"] >= 1
                results.append(
                    CheckResult(
                        category="PostgreSQL & Database",
                        name="Seeded Data Cohort",
                        required=">=1 Superuser, >=1 Admin, Volunteers/Coordinators & Events",
                        detected=f"users={info['users']} (superusers={info['super']}, admins={info['admins']}), events={info['events']}",
                        status="PASS" if seeded_ok else "WARN",
                        mandatory=True,
                        remediation="Run: .\\.venv\\Scripts\\python.exe postgres_sql\\manage_database.py",
                    )
                )
            else:
                err_msg = (proc.stderr or proc.stdout or "connection failed").strip().splitlines()[-1]
                results.append(
                    CheckResult(
                        category="PostgreSQL & Database",
                        name=f"Target Database ({db_name})",
                        required="Created, schema loaded, migrated, and seeded",
                        detected=f"Not ready ({err_msg[:120]})",
                        status="FAIL",
                        mandatory=True,
                        remediation="Run: .\\.venv\\Scripts\\python.exe postgres_sql\\manage_database.py",
                    )
                )
        except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
            results.append(
                CheckResult(
                    category="PostgreSQL & Database",
                    name=f"Target Database ({db_name})",
                    required="Created, schema loaded, migrated, and seeded",
                    detected=f"Probe error: {exc}",
                    status="FAIL",
                    mandatory=True,
                    remediation="Run: .\\.venv\\Scripts\\python.exe postgres_sql\\manage_database.py",
                )
            )
    else:
        reason = "DB password not configured in di_config.local.json / .env" if not db_password else "PostgreSQL unreachable or psycopg missing"
        results.append(
            CheckResult(
                category="PostgreSQL & Database",
                name=f"Target Database ({db_name})",
                required="Created, schema loaded, migrated, and seeded",
                detected=reason,
                status="FAIL",
                mandatory=True,
                remediation="Run: .\\.venv\\Scripts\\python.exe scripts\\setup_di_config.py && .\\.venv\\Scripts\\python.exe postgres_sql\\manage_database.py",
            )
        )

    # ------------------------------------------------------------------
    # 4. Node.js & React Native Mobile Client
    # ------------------------------------------------------------------
    node_bin = shutil.which("node")
    if node_bin:
        rc, node_v, _ = _run_cmd(["node", "--version"])
        node_ok = rc == 0 and _version_gte(node_v, (22, 11, 0))
        results.append(
            CheckResult(
                category="Node & React Native",
                name="Node.js Runtime",
                required="Node.js >= 22.11.0",
                detected=node_v or node_bin,
                status="PASS" if node_ok else "FAIL",
                mandatory=True,
                remediation="Install Node.js >= 22.11.0 LTS.",
            )
        )
    else:
        results.append(
            CheckResult(
                category="Node & React Native",
                name="Node.js Runtime",
                required="Node.js >= 22.11.0",
                detected="Not found on PATH",
                status="FAIL",
                mandatory=True,
                remediation="Install Node.js >= 22.11.0 LTS.",
            )
        )

    npm_bin = shutil.which("npm")
    if npm_bin:
        rc, npm_v, _ = _run_cmd([npm_bin, "--version"])
        results.append(
            CheckResult(
                category="Node & React Native",
                name="npm CLI",
                required="npm >= 10",
                detected=f"npm {npm_v}" if rc == 0 else npm_bin,
                status="PASS" if rc == 0 else "WARN",
                mandatory=True,
            )
        )
    else:
        results.append(
            CheckResult(
                category="Node & React Native",
                name="npm CLI",
                required="npm >= 10",
                detected="Not found on PATH",
                status="FAIL",
                mandatory=True,
                remediation="Install Node.js (includes npm).",
            )
        )

    rn_pkg_file = MOBILE_DIR / "package.json"
    rn_node_modules = MOBILE_DIR / "node_modules" / "react-native" / "package.json"
    pkg_json_data: dict[str, Any] = {}
    if rn_pkg_file.exists():
        try:
            pkg_json_data = json.loads(rn_pkg_file.read_text(encoding="utf-8"))
        except ValueError:
            pkg_json_data = {}
    deps = pkg_json_data.get("dependencies", {})
    dev_deps = pkg_json_data.get("devDependencies", {})
    expected_rn = deps.get("react-native", "0.88.1")
    expected_react = deps.get("react", "19.3.0")
    expected_ts = dev_deps.get("typescript", "^6.0.3")

    if rn_node_modules.exists():
        try:
            installed_rn = json.loads(rn_node_modules.read_text(encoding="utf-8")).get("version", "installed")
        except ValueError:
            installed_rn = "installed"
        results.append(
            CheckResult(
                category="Node & React Native",
                name="Mobile Dependencies (node_modules)",
                required=f"react-native {expected_rn}, react {expected_react}, TS {expected_ts}",
                detected=f"Installed (react-native {installed_rn})",
                status="PASS",
                mandatory=True,
            )
        )
    else:
        results.append(
            CheckResult(
                category="Node & React Native",
                name="Mobile Dependencies (node_modules)",
                required=f"react-native {expected_rn}, react {expected_react}, TS {expected_ts}",
                detected="mobile/node_modules missing",
                status="FAIL",
                mandatory=True,
                remediation="Run: cd mobile && npm ci",
            )
        )

    # ------------------------------------------------------------------
    # 5. Java, Android Studio, Android SDK & Devices
    # ------------------------------------------------------------------
    java_bin = shutil.which("java")
    if java_bin:
        rc, out, err = _run_cmd(["java", "-version"])
        ver_text = (out or err).splitlines()[0] if (out or err) else java_bin
        java_nums = _parse_version_tuple(ver_text)
        java_major = java_nums[0] if java_nums else 0
        java_ok = java_major in (17, 21) or java_major >= 17
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="Java JDK",
                required="JDK 17 or 21 LTS (JAVA_HOME set)",
                detected=f"{ver_text} | JAVA_HOME={os.environ.get('JAVA_HOME') or '<unset>'}",
                status="PASS" if (java_ok and os.environ.get("JAVA_HOME")) else ("WARN" if java_ok else "FAIL"),
                mandatory=True,
                remediation="Install JDK 21 (or 17) and set JAVA_HOME.",
            )
        )
    else:
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="Java JDK",
                required="JDK 17 or 21 LTS",
                detected="java not found on PATH",
                status="FAIL",
                mandatory=True,
                remediation="Install Eclipse Temurin / Oracle JDK 21 and set JAVA_HOME.",
            )
        )

    studio_path = _find_android_studio()
    results.append(
        CheckResult(
            category="Android & Mobile Build",
            name="Android Studio IDE",
            required="Android Studio installed (for AVD & SDK Manager)",
            detected=str(studio_path) if studio_path else "Not found in standard install paths",
            status="PASS" if studio_path else "WARN",
            mandatory=False,
            remediation="Install Android Studio if you need graphical AVD/SDK management.",
        )
    )

    sdk_path = _find_android_sdk()
    if sdk_path:
        platforms = sorted(p.name for p in (sdk_path / "platforms").glob("android-*")) if (sdk_path / "platforms").exists() else []
        build_tools = sorted(p.name for p in (sdk_path / "build-tools").iterdir()) if (sdk_path / "build-tools").exists() else []
        ndk_vers = sorted(p.name for p in (sdk_path / "ndk").iterdir()) if (sdk_path / "ndk").exists() else []
        has_compile = any(p.startswith("android-37") or p.startswith("android-36") for p in platforms)
        has_bt = "37.0.0" in build_tools
        has_ndk = "27.1.12297006" in ndk_vers
        sdk_ok = has_compile and has_bt and has_ndk
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="Android SDK & Build Components",
                required="compileSdk 37/36, buildTools 37.0.0, NDK 27.1.12297006",
                detected=f"SDK={sdk_path}; platforms={platforms}; buildTools={build_tools}; ndk={ndk_vers}",
                status="PASS" if sdk_ok else "WARN",
                mandatory=True,
                remediation="Open Android Studio -> SDK Manager and install Android 15/16 (API 36/37), Build-Tools 37.0.0, and NDK 27.1.12297006.",
            )
        )
    else:
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="Android SDK & Build Components",
                required="ANDROID_HOME set with SDK 36/37, Build-Tools 37.0.0, NDK 27.1.12297006",
                detected="Android SDK not found",
                status="FAIL",
                mandatory=True,
                remediation="Install Android SDK via Android Studio and set ANDROID_HOME.",
            )
        )

    adb_bin = shutil.which("adb")
    if not adb_bin and sdk_path:
        cand = sdk_path / "platform-tools" / ("adb.exe" if platform.system() == "Windows" else "adb")
        if cand.exists():
            adb_bin = str(cand)

    if adb_bin:
        rc, adb_out, _ = _run_cmd([adb_bin, "devices", "-l"])
        lines = [ln.strip() for ln in adb_out.splitlines()[1:] if ln.strip()] if rc == 0 else []
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="ADB (Android Debug Bridge)",
                required="adb platform-tools available",
                detected=f"{adb_bin} (attached devices: {len(lines)})",
                status="PASS",
                mandatory=True,
            )
        )
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="Connected Android Device / Emulator",
                required=">= 1 authorized USB device or running AVD",
                detected="; ".join(lines) if lines else "No running emulator or USB device attached right now",
                status="PASS" if any("\tdevice" in ln or " device " in ln for ln in lines) else "WARN",
                mandatory=False,
                remediation="Connect a USB Android phone (USB Debugging ON) or start an AVD in Android Studio.",
            )
        )
    else:
        results.append(
            CheckResult(
                category="Android & Mobile Build",
                name="ADB (Android Debug Bridge)",
                required="adb platform-tools available",
                detected="adb not found",
                status="FAIL",
                mandatory=True,
                remediation="Install Android SDK Platform-Tools and add platform-tools to PATH.",
            )
        )

    emu_bin = shutil.which("emulator")
    if not emu_bin and sdk_path:
        cand = sdk_path / "emulator" / ("emulator.exe" if platform.system() == "Windows" else "emulator")
        if cand.exists():
            emu_bin = str(cand)
    avds: list[str] = []
    if emu_bin:
        rc, avd_out, _ = _run_cmd([emu_bin, "-list-avds"])
        if rc == 0 and avd_out:
            avds = [a.strip() for a in avd_out.splitlines() if a.strip()]
    results.append(
        CheckResult(
            category="Android & Mobile Build",
            name="Android Virtual Devices (AVD)",
            required=">= 1 configured AVD (if not using physical USB)",
            detected=f"{len(avds)} AVD(s): {', '.join(avds)}" if avds else "No AVDs found",
            status="PASS" if avds else "WARN",
            mandatory=False,
            remediation="Create an AVD in Android Studio -> Device Manager.",
        )
    )

    gradlew = MOBILE_DIR / "android" / ("gradlew.bat" if platform.system() == "Windows" else "gradlew")
    results.append(
        CheckResult(
            category="Android & Mobile Build",
            name="Gradle Wrapper",
            required="mobile/android/gradlew(.bat) present",
            detected="Present" if gradlew.exists() else "Missing",
            status="PASS" if gradlew.exists() else "FAIL",
            mandatory=True,
        )
    )

    # ------------------------------------------------------------------
    # 6. Dependency Injection & Configuration
    # ------------------------------------------------------------------
    di_py = REPO_ROOT / "config_di.py"
    di_local = REPO_ROOT / "di_config.local.json"
    sec_cfg = di_json.get("security", {}) if isinstance(di_json.get("security"), dict) else {}
    required_sec_keys = [
        "django_secret_key",
        "phone_hash_hmac_secret",
        "otp_code_hmac_secret",
        "auth_session_token_secret",
        "phone_encryption_key",
        "verification_image_encryption_key",
    ]
    missing_sec = [k for k in required_sec_keys if _is_placeholder(sec_cfg.get(k))]
    di_ok = di_py.exists() and di_local.exists() and bool(di_json) and not missing_sec and not _is_placeholder(db_password)
    results.append(
        CheckResult(
            category="Configuration & DI",
            name="Root Dependency Injection (di_config.local.json)",
            required="True di_config.local.json with distinct secrets & DB config",
            detected=(
                "Configured & valid (all 6 security keys + DB set)"
                if di_ok
                else (
                    "di_config.local.json missing (falling back to .env/defaults)"
                    if not di_local.exists()
                    else f"Incomplete (missing/placeholder security keys: {', '.join(missing_sec) or 'db password'})"
                )
            ),
            status="PASS" if di_ok else "FAIL",
            mandatory=True,
            remediation="Run: .\\.venv\\Scripts\\python.exe scripts\\setup_di_config.py",
        )
    )

    # ------------------------------------------------------------------
    # 7. Map Assets & Optional AI Runtime
    # ------------------------------------------------------------------
    mbtiles = list(MAP_DIR.glob("*.mbtiles")) if MAP_DIR.exists() else []
    results.append(
        CheckResult(
            category="Assets & Optional AI",
            name="Self-Hosted Map Tiles (map/*.mbtiles)",
            required=">= 1 MBTiles pack (yangon.mbtiles recommended)",
            detected=f"{len(mbtiles)} MBTiles pack(s) (yangon.mbtiles={'yes' if (MAP_DIR / 'yangon.mbtiles').exists() else 'no'})",
            status="PASS" if (MAP_DIR / "yangon.mbtiles").exists() else ("WARN" if mbtiles else "FAIL"),
            mandatory=True,
            remediation="Place regional .mbtiles files into map/ or configure maps.tile_url_template in di_config.local.json.",
        )
    )

    ai_cfg = di_json.get("ai", {}) if isinstance(di_json.get("ai"), dict) else {}
    ai_provider = str(ai_cfg.get("provider") or env_map.get("AI_PROVIDER") or "mock").lower()
    ai_key_present = not _is_placeholder(ai_cfg.get("api_key") or env_map.get("AI_API_KEY") or env_map.get("GEMINI_API_KEY"))
    ollama_bin = shutil.which("ollama")
    results.append(
        CheckResult(
            category="Assets & Optional AI",
            name="AI Assistant Provider",
            required="mock (built-in) or gemini (API key) or ollama (local)",
            detected=f"provider={ai_provider}, gemini_key={'configured' if ai_key_present else 'not set'}, ollama={'installed' if ollama_bin else 'not installed'}",
            status="PASS" if (ai_provider == "mock" or (ai_provider == "gemini" and ai_key_present) or (ai_provider == "ollama" and ollama_bin)) else "WARN",
            mandatory=False,
            remediation="Configure ai.provider & ai.api_key in di_config.local.json (mock works offline with zero keys).",
        )
    )

    return results


def compute_summary(results: list[CheckResult]) -> dict[str, Any]:
    total = len(results)
    passed = sum(1 for r in results if r.status == "PASS")
    warned = sum(1 for r in results if r.status == "WARN")
    failed = sum(1 for r in results if r.status == "FAIL")

    mandatory = [r for r in results if r.mandatory]
    man_total = len(mandatory)
    man_pass = sum(1 for r in mandatory if r.status == "PASS")

    overall_pct = round((passed / total) * 100, 1) if total else 0.0
    mandatory_pct = round((man_pass / man_total) * 100, 1) if man_total else 0.0

    return {
        "total": total,
        "passed": passed,
        "warned": warned,
        "failed": failed,
        "overall_pct": overall_pct,
        "mandatory_total": man_total,
        "mandatory_passed": man_pass,
        "mandatory_pct": mandatory_pct,
        "ready_for_launch": failed == 0 and man_pass == man_total,
    }


def render_markdown(results: list[CheckResult], summary: dict[str, Any]) -> str:
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    readiness_label = "READY" if summary["ready_for_launch"] else "ACTION REQUIRED"

    lines = [
        "# System Readiness & Environment Status (`SYSTEM_STATUS.md`)",
        "",
        f"> **Generated At:** {now_str}  ",
        "> **Generator:** `scripts/check_system_status.py` (Read-Only Probe)  ",
        f"> **System Readiness:** **{readiness_label}**  ",
        f"> **Mandatory Conditions Satisfied:** **{summary['mandatory_passed']} / {summary['mandatory_total']} ({summary['mandatory_pct']}%)**  ",
        f"> **Overall Conditions Satisfied:** **{summary['passed']} / {summary['total']} ({summary['overall_pct']}%)** "
        f"(`PASS`: {summary['passed']}, `WARN`: {summary['warned']}, `FAIL`: {summary['failed']})",
        "",
        "---",
        "",
        "## 1. Detailed Dependency & Initial Condition Matrix",
        "",
        "| Category | Condition | Required | Detected on This Device | Mandatory | Status |",
        "|---|---|---|---|---|---|",
    ]

    for r in results:
        req_clean = r.required.replace("|", "\\|")
        det_clean = r.detected.replace("|", "\\|")
        man_txt = "Yes" if r.mandatory else "Optional"
        badge = {"PASS": "**PASS**", "WARN": "**WARN**", "FAIL": "**FAIL**"}.get(r.status, r.status)
        lines.append(f"| {r.category} | {r.name} | {req_clean} | {det_clean} | {man_txt} | {badge} |")

    action_items = [r for r in results if r.status != "PASS" and r.remediation]
    lines.extend(["", "---", "", "## 2. Action Items / New-Laptop Setup Checklist", ""])
    if action_items:
        for r in action_items:
            lines.append(f"- **[{r.status}] {r.name}:** {r.remediation}")
    else:
        lines.append("- All mandatory and optional checks passed. No remediation needed.")

    lines.extend([
        "",
        "---",
        "",
        "## 3. Standard New-Laptop Bootstrap Order",
        "",
        "1. Verify prerequisites: `python scripts/check_system_status.py`",
        "2. Create Python venv & install dependencies: `python -m venv .venv && .\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements\\local.txt`",
        "3. Install Node packages: `cd mobile && npm ci && cd ..`",
        "4. Generate true DI config (`di_config.local.json`): `.\\.venv\\Scripts\\python.exe scripts\\setup_di_config.py`",
        "5. Create local PostgreSQL database, apply `postgres_sql/VCS_db.sql`, run Django migrations, apply `postgres_sql/seedlings/`, and output `SEEDED_CREDENTIALS.txt`: `.\\.venv\\Scripts\\python.exe postgres_sql\\manage_database.py`",
        "6. Launch the backend (`backend/manage.py runserver 0.0.0.0:8000`), Metro (`cd mobile && npm start`), and Android app (`cd mobile && npm run android` or `npm run android:device`) — see `docs/NEW_LAPTOP_WINDOWS_SETUP_GUIDE.md`.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check VCS system prerequisites and update SYSTEM_STATUS.md.")
    parser.add_argument("--output", default=str(DEFAULT_STATUS_MD), help="Path to write markdown status report.")
    parser.add_argument("--no-write", action="store_true", help="Do not write SYSTEM_STATUS.md; print summary only.")
    parser.add_argument("--json", action="store_true", help="Print JSON report to stdout.")
    args = parser.parse_args()

    results = collect_checks()
    summary = compute_summary(results)

    if not args.no_write:
        out_path = Path(args.output)
        out_path.write_text(render_markdown(results, summary), encoding="utf-8")

    if args.json:
        print(json.dumps({
            "summary": summary,
            "checks": [r.__dict__ for r in results],
        }, indent=2))
    else:
        print("=" * 72)
        print("VOLUNTEER HR MANAGEMENT SYSTEM — ENVIRONMENT READINESS STATUS")
        print("=" * 72)
        print(f"Mandatory Satisfied : {summary['mandatory_passed']}/{summary['mandatory_total']} ({summary['mandatory_pct']}%)")
        print(f"Overall Satisfied   : {summary['passed']}/{summary['total']} ({summary['overall_pct']}%)")
        print("-" * 72)
        for r in results:
            tag = f"[{r.status:4s}]"
            print(f"{tag} {r.category:22s} | {r.name}: {r.detected}")
            if r.status != "PASS" and r.remediation:
                print(f"       -> Fix: {r.remediation}")
        print("-" * 72)
        if not args.no_write:
            print(f"Status report written to: {Path(args.output)}")

    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
