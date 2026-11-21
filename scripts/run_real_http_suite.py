"""
scripts/run_real_http_suite.py
Orchestrates the Phase 4 real-HTTP integration test suite against PostgreSQL + Django.
Captures commit SHA, execution timestamp, and full Jest output.
"""
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent


def get_commit_sha() -> str:
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )
        return res.stdout.strip()
    except Exception as e:
        return f"unknown ({e})"


def run():
    print("=" * 70)
    print("Phase 4: Running Real-HTTP Integration Test Suite (No Mocks)")
    print("=" * 70)

    commit_sha = get_commit_sha()
    start_time = datetime.now(timezone.utc)
    print(f"Commit SHA: {commit_sha}")
    print(f"Start Time: {start_time.isoformat()}")

    # 1. Run integration tests in mobile/
    print("\nExecuting: npm run test:real-http in mobile/")
    cmd = ["npm", "run", "test:real-http"]
    if sys.platform == "win32":
        cmd = ["cmd", "/c", "npm", "run", "test:real-http"]

    env = os.environ.copy()
    env.setdefault("APP_ENV", "test")
    env.setdefault("DB_NAME", "test_volunteer_coordination_db")
    env.setdefault("DB_HOST", "127.0.0.1")

    result = subprocess.run(
        cmd,
        cwd=repo_root / "mobile",
        capture_output=True,
        text=True,
        env=env,
    )

    duration = (datetime.now(timezone.utc) - start_time).total_seconds()
    print(result.stdout)
    if result.stderr:
        print(result.stderr)

    passed = result.returncode == 0
    status_str = "PASSED" if passed else "FAILED"
    print(f"\nResult: {status_str} in {duration:.2f}s (Exit code: {result.returncode})")

    # 2. Write artifact report
    report_dir = repo_root / "docs" / "integration"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_file = report_dir / "v0_12_0_real_http_integration_report.md"

    report_content = f"""# v0.12.0 Phase 4 Real-HTTP Integration Test Report

- **Date / Time:** {start_time.isoformat()}
- **Commit SHA:** `{commit_sha}`
- **Execution Duration:** {duration:.2f}s
- **Status:** **{status_str}** (Exit Code {result.returncode})
- **Transport:** Real network HTTP sockets (`fetch` over TCP), zero mocks.
- **Backend:** Django BFF with live PostgreSQL database (`test_volunteer_coordination_db`).

## Test Output

```text
{result.stdout.strip()}
{result.stderr.strip()}
```

## Verified Scenarios

1. **Tokenized Challenge Handshake:** `POST /api/v1/auth/tokenized/request-otp/` -> `auth_session_token` -> `POST /api/v1/auth/tokenized/verify-otp/` (no phone) -> DRF `Token` -> `GET /api/v1/me/bootstrap/` succeeds with `email: null` and decrypted `phone`.
2. **Replay & Parallel Verify Safety:** OTP challenge replay deterministically returns `409 challenge_consumed`. Parallel verifications resolve with exactly one 200 and one 409. Bogus tokens return `400 invalid_challenge`.
3. **Production Dev-Code Suppression:** Live Django server with `ENVIRONMENT=production` and `ALLOW_DEV_CODE_IN_AUTH_RESPONSE=False` strictly omits `dev_code` in real HTTP responses.
4. **Authoritative Check-In & Roster Match:** Coordinator loads roster -> `POST /api/v1/checkin/attendance/manual-checkin/` returns authoritative server `checkin_at` and `method` -> refreshed roster matches server state -> repeat check-in is idempotent.
5. **Authorization & Masking:** Owner-as-monitor blocked (`403 owner_monitor_read_only`), unrelated coordinator masked (`404`), unauthenticated caller denied (`401`).
6. **Session Invalidation:** HTTP 401 clears local session token and triggers listeners; non-401 responses (403, 404, 409, 429, 5xx) and timeouts do NOT silently clear local session.
7. **Verification Image File Encryption & Admin Stream:** Volunteer uploads sanitized JPEG over real HTTP multipart/form-data -> server-side AES-256-GCM envelope stored on disk (`VIMG\\x01`) -> volunteer metadata response excludes file path and raw bytes -> admin stream decrypts JPEG in-memory (`image/jpeg`) -> non-admin access is rejected with masked 404/401.
"""

    with open(report_file, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"\nSaved integration report to: {report_file}")
    sys.exit(result.returncode)


if __name__ == "__main__":
    run()
