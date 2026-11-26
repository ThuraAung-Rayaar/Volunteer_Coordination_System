"""
scripts/setup_local_db.py

Compatibility entrypoint delegating to the unified database lifecycle manager
at `postgres_sql/manage_database.py`.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from postgres_sql.manage_database import main

if __name__ == "__main__":
    raise SystemExit(main())
