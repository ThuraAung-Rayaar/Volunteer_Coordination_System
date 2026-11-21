"""
backend/tests/test_script_safety_guards.py
Unit tests verifying destructive scripts refuse execution against protected databases.

Covers Section 3.2 (A4) of V0_12_0_STABILIZATION_MASTER_PLAN.md:
- seed_integration_fixtures.py aborts when targeting volunteer_coordination_db or production.
- alter_local_db.py aborts when targeting volunteer_coordination_db or production.
- Both scripts require explicit APP_ENV=ci or APP_ENV=test.
"""

import os
import subprocess
import sys
from pathlib import Path
from django.test import SimpleTestCase

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SEEDER_PATH = REPO_ROOT / "scripts" / "seed_integration_fixtures.py"
ALTER_PATH = REPO_ROOT / "scripts" / "alter_local_db.py"


class ScriptSafetyGuardTests(SimpleTestCase):
    """Verify scripts fail-closed against non-disposable DBs and unapproved environments."""

    def _run_script(self, script_path, env_overrides):
        env = os.environ.copy()
        env.update(env_overrides)
        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
        )
        return result

    def test_seeder_refuses_when_app_env_missing(self):
        env_vars = {"APP_ENV": "", "DB_NAME": "test_volunteer_coordination_db"}
        res = self._run_script(SEEDER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)
        self.assertIn("requires explicit APP_ENV=ci or APP_ENV=test", res.stderr)

    def test_seeder_refuses_production_env(self):
        env_vars = {"APP_ENV": "production", "DB_NAME": "test_volunteer_coordination_db"}
        res = self._run_script(SEEDER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)

    def test_seeder_refuses_volunteer_coordination_db(self):
        env_vars = {"APP_ENV": "ci", "DB_NAME": "volunteer_coordination_db"}
        res = self._run_script(SEEDER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)
        self.assertIn("volunteer_coordination_db", res.stderr)

    def test_seeder_refuses_non_allowlisted_db(self):
        env_vars = {"APP_ENV": "ci", "DB_NAME": "arbitrary_external_db"}
        res = self._run_script(SEEDER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)
        self.assertIn("disposable allow-list", res.stderr)

    def test_alter_db_refuses_when_app_env_missing(self):
        env_vars = {"APP_ENV": "", "DB_NAME": "test_volunteer_coordination_db"}
        res = self._run_script(ALTER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)
        self.assertIn("requires explicit APP_ENV=ci or APP_ENV=test", res.stderr)

    def test_alter_db_refuses_production_env(self):
        env_vars = {"APP_ENV": "production", "DB_NAME": "test_volunteer_coordination_db"}
        res = self._run_script(ALTER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)

    def test_alter_db_refuses_volunteer_coordination_db(self):
        env_vars = {"APP_ENV": "ci", "DB_NAME": "volunteer_coordination_db"}
        res = self._run_script(ALTER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)
        self.assertIn("volunteer_coordination_db", res.stderr)

    def test_alter_db_refuses_non_allowlisted_db(self):
        env_vars = {"APP_ENV": "ci", "DB_NAME": "arbitrary_external_db"}
        res = self._run_script(ALTER_PATH, env_vars)
        self.assertEqual(res.returncode, 1)
        self.assertIn("[SAFETY REFUSAL]", res.stderr)
        self.assertIn("disposable allow-list", res.stderr)
