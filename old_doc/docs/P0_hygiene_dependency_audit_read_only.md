# Read-Only Audit Report — Repo Hygiene & Dependency Reproducibility
## Scope: P0-01, P0-02, Test Runner SQL Path Resolution

**Repository:** `ThuraAung-Rayaar/Volunteer_Coordination_System`  
**Branch inspected:** `fix/bknd_stablize` (HEAD `3c03f37`)  
**Date:** 2026-11-06  
**Phase:** PHASE 1 — READ ONLY. No files, DB, environment, or Git state were changed.

---

## Baseline Identity

| Item | Value |
|---|---|
| Active branch | `fix/bknd_stablize` |
| HEAD commit | `3c03f37` ("2nd") |
| Parent commit | `464072d` ("r") |
| Remote tracking | `remotes/origin/fix/bknd_stablize` |
| `git status --short backend/private_media/` | *No output* — all 29 files are **committed and tracked** |
| `.venv` present | Yes (`python stack/.venv/`) |
| `.env` present | Yes (at repo root `python stack/.env`) |

---

## 1. P0-01 — Private Media Hygiene

### 1.1 Git tracking status

**Status: CONFIRMED — gap is active.**

`git ls-files backend/private_media/` returns **29 tracked files**:

```
backend/private_media/verification_images/01a1ab5e-6fd4-7885-9948-54e5512e77fb/id_license_49899f94.jpg
backend/private_media/verification_images/01a1ab5e-6fd4-7885-9948-54e5512e77fb/mock_selfie_b8ac40a0.jpg
backend/private_media/verification_images/01a1ab61-1cae-7df2-b820-667382afcb41/id_license_ddffc4a5.jpg
backend/private_media/verification_images/01a1ab61-1cae-7df2-b820-667382afcb41/mock_selfie_c0f2cb90.jpg
... (14 id_license_*.jpg + 14 mock_selfie_*.jpg + 1 JPEG_example_flower.jpg)
backend/private_media/verification_images/JPEG_example_flower.jpg
```

The 14 UUIDv7-named directories each contain one `id_license_*.jpg` and one `mock_selfie_*.jpg`.  
The root-level `JPEG_example_flower.jpg` is also tracked inside `verification_images/`.

**`git status --short backend/private_media/` produces no output**, meaning the working tree is clean — all 29 files are committed into Git history at this branch HEAD.

### 1.2 `.gitignore` coverage

[`.gitignore`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/.gitignore) — full content inspected.

```
# Django Media & Static
media/
staticfiles/
*.sqlite3
```

- `private_media/` is **not listed** in `.gitignore`.  
- `backend/private_media/` is **not listed** in `.gitignore`.  
- There is **no `.gitignore` inside `backend/`** — only the root-level file exists.  
- The `media/` rule covers only the standard Django `MEDIA_ROOT` path (`backend/media/`), not `backend/private_media/`.

### 1.3 Content assessment (master plan rule 10)

> "The dummy colour/test images in `backend/private_media/verification_images/` are fixtures, not real identity documents; do not classify them as a P0 incident or purge them." — *v0_6_0_backend_improvement_master_plan.md, Rule 10*

The file names (`id_license_*.jpg`, `mock_selfie_*.jpg`) are consistent with synthetic test fixture naming conventions. The master plan explicitly rules out treating them as a P0 security incident and prohibits purging them.

However, the **gitignore gap remains a real operational problem**: the `private_media/` directory is live application runtime storage for real user uploads. If production were ever cloned from this repo, any subsequently uploaded real user verification images would be at risk of accidental `git add`. The directory needs to be excluded from tracking for runtime-safety even if the current fixtures are synthetic.

**The `.gitignore` gap is confirmed. The images themselves are confirmed fixtures per master plan Rule 10 — they must not be deleted.**

### 1.4 Impact

| Scenario | Impact |
|---|---|
| Clean clone + run + user uploads a real document | The file lands in `backend/private_media/verification_images/` — a directory **not covered by `.gitignore`** — and can be accidentally staged/committed |
| Public repository sharing | The 29 fixture files are publicly accessible via GitHub, but as synthetic fixtures this is accepted by Rule 10 |
| Future `git add .` by a developer | Would silently add any real runtime uploads since the directory is unprotected |

### 1.5 Smallest safe proposed fix (awaiting approval)

Add to the root `.gitignore`:

```gitignore
# Private application media — runtime uploads must never be committed
backend/private_media/
```

> [!IMPORTANT]
> This entry must be added **without** running `git rm --cached` on the existing tracked fixtures, because Rule 10 forbids purging them. Git will continue tracking the already-committed files; the rule only prevents *new* files from being staged. If the intent is for the fixture files themselves to remain committed (as test fixtures), no history rewrite is needed. If instead they should move to a proper test-fixtures directory, that is a separate human decision.

**No SQL files are affected. No Python code changes required.**

---

## 2. P0-02 — Dependency Reproducibility

### 2.1 `backend/requirements/base.txt` (8 lines)

```
Django>=5.1,<5.2
psycopg>=3.2.0
psycopg-binary>=3.2.0
djangorestframework>=3.15.2
django-cors-headers>=4.3.0
python-dotenv>=1.0.0
drf-spectacular>=0.27.0
Pillow>=10.0.0
```

**Missing:** `django-filter` and `cryptography` are **not declared**.

[`backend/requirements/base.txt`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/requirements/base.txt) — 8 lines total.

### 2.2 `cryptography.fernet` import analysis

**Status: CONFIRMED — gap is active.**

[`backend/common/security.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/common/security.py) imports `cryptography.fernet` at **two locations**:

| Line | Statement | Context |
|---|---|---|
| [L106](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/common/security.py#L106-L110) | `from cryptography.fernet import Fernet` | Inside `encrypt_phone()` — called every time a phone number is stored |
| [L126](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/common/security.py#L126-L133) | `from cryptography.fernet import Fernet, InvalidToken` | Inside `decrypt_phone()` — called every time a phone number is read back |

Both imports are **deferred** (inside function bodies), so the import error only surfaces at runtime when these functions are called — not at Django startup. This means `manage.py check` can pass without `cryptography` installed, but phone encryption/decryption will fail at runtime with `ModuleNotFoundError`.

**Call chain:**
- `encrypt_phone()` → `decrypt_phone()` are in `common/security.py`
- These are core security utilities called by the accounts/profile service layer for every user phone operation

**Installed in current `.venv`:** `cryptography==50.0.2` — present but **via manual install, not from declared requirements**.

The `pip show cryptography` output shows `Required-by: (empty)`, confirming it is an **orphan direct install** — not a transitive dependency of any other declared package. If a developer runs `pip install -r requirements/base.txt` in a clean venv, `cryptography` will not be installed and phone encryption will fail at runtime.

### 2.3 `django_filters` / `django-filter` analysis

**Status: CONFIRMED — gap is active (declared in INSTALLED_APPS but absent from requirements).**

[`backend/config/settings/base.py` L42](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/config/settings/base.py#L38-L44):

```python
THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'django_filters',      # ← line 42
    'drf_spectacular',
]
```

**Usage scope — `django_filters` is used ONLY in `INSTALLED_APPS`:**

A full recursive search of all `*.py` files under `backend/` for `import django_filters`, `from django_filters`, `FilterSet`, or `DjangoFilterBackend` returned **only the single `base.py` line 42** entry. `django_filters` is registered in `INSTALLED_APPS` but **no Python code currently imports or uses it directly** (no `FilterSet` classes, no `DjangoFilterBackend` in `REST_FRAMEWORK` settings).

This means:
1. Without `django-filter` installed, Django's app registry will raise `django.core.exceptions.ImproperlyConfigured: 'django_filters' module is not installed` at startup — a **hard startup failure**.
2. The package **is** installed in the current `.venv` (`django-filter==24.3`), masking the problem.
3. A clean `pip install -r requirements/base.txt` will **not** install `django-filter`, causing immediate startup failure.

**Installed in current `.venv`:** `django-filter==24.3` — present but **not declared in requirements**.

### 2.4 Actual impact during clean environment builds

| Package | Missing from `base.txt` | Impact on clean `pip install -r requirements/base.txt` |
|---|---|---|
| `cryptography` | ✅ Yes | `manage.py check` **passes** (deferred import), but `encrypt_phone()` / `decrypt_phone()` raise `ModuleNotFoundError` at runtime — phone registration/login fails |
| `django-filter` | ✅ Yes | `manage.py check` **fails immediately** with `ImproperlyConfigured` — Django won't even start |

Both gaps will block a new developer from getting a working environment using documented steps.

### 2.5 Smallest safe proposed fixes (awaiting approval)

Add two lines to [`backend/requirements/base.txt`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/requirements/base.txt):

```
django-filter>=24.3,<25
cryptography>=43.0,<51
```

**Version bounds rationale:**
- `django-filter>=24.3` — matches installed version; `<25` guards against breaking changes
- `cryptography>=43.0,<51` — installed is 50.0.2; `>=43.0` matches the minimum version known to provide `Fernet`; `<51` guards against next major

> [!NOTE]
> `cryptography` version 50.x uses `cffi` as a backend dependency. Confirm that `cffi` (already in `.venv`) is pinned or bounded appropriately if a lock file is introduced.

> [!WARNING]
> The `psycopg` and `psycopg-binary` are **both declared**. This is unusual — `psycopg-binary` is typically used only for local/dev convenience, while production typically uses the source distribution. This is an existing condition; do not change it without an explicit decision.

**No SQL files are affected.**

---

## 3. Test Runner SQL Path Resolution

### 3.1 `BASE_DIR` derivation

[`backend/config/settings/base.py` L5](file:///c:/Users/USER/Documents/INTERN/Project\Volunteer HR Management\python stack\backend\config\settings\base.py#L5):

```python
BASE_DIR = Path(__file__).resolve().parent.parent.parent
```

Tracing from `backend/config/settings/base.py`:
- `.parent` → `backend/config/settings/`
- `.parent` → `backend/config/`
- `.parent` → **`backend/`**

∴ `BASE_DIR` = `python stack/backend/`  
∴ `BASE_DIR.parent` = `python stack/`

### 3.2 Candidate path resolution table

[`backend/config/test_runner.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/config/test_runner.py) — [`SqlFileTestRunner.setup_databases()` L7–L27](file:///c:/Users/USER/Documents/INTERN\Project\Volunteer HR Management\python stack\backend\config\test_runner.py#L7-L27):

```python
candidates = [
    Path(settings.BASE_DIR).parent / "postgres sql" / "updated_volunteer_coordination_system_Database.sql",
    Path(settings.BASE_DIR) / "postgres sql" / "updated_volunteer_coordination_system_Database.sql",
    Path(settings.BASE_DIR).parent / "postgres sql" / "ex1_volunteer_coordination_system_database_schema_v0_5_2.sql",
]
```

| Candidate | Resolved absolute path | File exists? | Evidence |
|---|---|---|---|
| **1** `BASE_DIR.parent / "postgres sql" / "updated_...sql"` | `python stack/postgres sql/updated_volunteer_coordination_system_Database.sql` | ✅ **YES** | `Test-Path` → `True`; file size 151,568 bytes |
| **2** `BASE_DIR / "postgres sql" / "updated_...sql"` | `python stack/backend/postgres sql/updated_...sql` | ❌ **NO** | `Test-Path` → `False`; no such directory |
| **3** `BASE_DIR.parent / "postgres sql" / "ex1_...v0_5_2.sql"` | `python stack/postgres sql/ex1_volunteer_coordination_system_database_schema_v0_5_2.sql` | ❌ **NO** | `Test-Path` → `False`; this older filename does not exist in `python stack/postgres sql/` |

**Glob fallback** (lines 23–27 of `test_runner.py`):  
- Glob directory = `BASE_DIR.parent / "postgres sql"` = `python stack/postgres sql/` → **EXISTS**
- Files in that directory: `self_test.sql`, `updated_volunteer_coordination_system_Database.sql`, `Database_report.md`
- Glob `*.sql` would find `self_test.sql` and `updated_volunteer_coordination_system_Database.sql`
- **The glob fallback is not deterministic** — it uses `sql_files[0]`, which depends on filesystem ordering. With two `.sql` files present, `self_test.sql` or the main file could be selected, depending on OS.

### 3.3 `prompt code/spec/` SQL — NOT in candidate list

The task prompt mentioned verifying `prompt code/spec/` path resolution. The `updated_volunteer_coordination_system_Database.sql` **does exist** in `python stack/prompt code/spec/` (151,568 bytes, same size as the `postgres sql/` copy). However, this path **does not appear anywhere** in `test_runner.py`'s candidate list. The spec copy is a reference copy; the test runner only uses `postgres sql/`.

**Both SQL copies are byte-for-byte the same size (151,568 bytes) and have the same last-modified timestamp (2026-11-02 20:52:54)**, consistent with the master plan's statement that they were "byte-identical at the time inspected."

### 3.4 Current behavior in this workspace

**Status: Candidate 1 resolves correctly — test runner WILL find the SQL file in the current workspace layout.**

The test runner iterates candidates in order, finds candidate 1 exists (`python stack/postgres sql/updated_...sql`), sets `sql_file` to it, and exits the loop. Candidates 2 and 3 are never reached. The glob fallback is also never reached.

**However**, the following risks exist:

### 3.5 Identified risks

| Risk | Description | Severity |
|---|---|---|
| **Candidate ordering exposes fragile fallback** | Candidate 3 uses `BASE_DIR.parent`, same as candidate 1, but with the **old v0.5.2 filename** that doesn't exist. It's dead code in this workspace. If ever a file named `ex1_...v0_5_2.sql` appears, it would be loaded instead of the current SQL. | Low |
| **Glob fallback is non-deterministic** | `sql_files[0]` has no guaranteed ordering. If the main SQL file is ever absent but `self_test.sql` is present, the wrong SQL file could be silently loaded, causing test database setup to succeed with an incomplete schema. | Medium |
| **Candidate 2 (`BASE_DIR / "postgres sql"`)** | `backend/postgres sql/` does not and should not exist. This is dead code. | Low |
| **Path resolution differs in Docker** | Inside the Docker container, the working directory and volume mounts may change how `BASE_DIR` resolves relative to the filesystem. If the `python stack/` directory is not mounted at a compatible path, candidate 1 may fail and the test runner may silently fall back to glob or no SQL, leaving the test database with no schema. | Medium |
| **No SQL file = silent schema skip, not a hard failure** | If `sql_file` is `None` (no candidate found), the `custom_create_test_db` function simply skips loading the SQL (line 50: `if sql_file and sql_file.exists()`). This means in a misconfigured environment, tests run against an empty database without raising an error — giving false green results. | **High** |

### 3.6 Smallest safe proposed fixes (awaiting approval)

Three minimal, independent changes:

1. **Remove dead candidates** (candidates 2 and 3 from the list) and replace with an explicit `prompt code/spec/` fallback for the second known SQL copy location, making the fallback chain deterministic and correct:

```python
candidates = [
    Path(settings.BASE_DIR).parent / "postgres sql" / "updated_volunteer_coordination_system_Database.sql",
    Path(settings.BASE_DIR).parent / "prompt code" / "spec" / "updated_volunteer_coordination_system_Database.sql",
]
```

2. **Sort the glob fallback** so it is deterministic:

```python
sql_files = sorted(sql_dir.glob("*.sql"))
```

3. **Raise a hard error if no SQL file is found**, rather than silently skipping schema load:

```python
if not sql_file:
    raise RuntimeError(
        "SqlFileTestRunner: could not find the frozen SQL prototype file. "
        "Ensure 'postgres sql/updated_volunteer_coordination_system_Database.sql' "
        "exists relative to the project root."
    )
```

> [!CAUTION]
> Do **not** modify the SQL file content or path. Only the Python path-resolution logic in `test_runner.py` is proposed for change. The frozen SQL files remain byte-for-byte identical.

---

## 4. Summary Table

| Item | Status | Evidence level | Key finding |
|---|---|---|---|
| **P0-01** `.gitignore` missing `private_media/` | **CONFIRMED** | E1 (static inspection + `git ls-files`) | 29 files tracked; `private_media/` absent from `.gitignore`; images are confirmed fixtures per Rule 10 |
| **P0-02** `cryptography` missing from `base.txt` | **CONFIRMED** | E1 | `from cryptography.fernet import Fernet` at `security.py:106,126`; not in `base.txt`; deferred import silences Django check |
| **P0-02** `django-filter` missing from `base.txt` | **CONFIRMED** | E1 | `'django_filters'` in `INSTALLED_APPS` only; not in `base.txt`; would cause hard startup failure on clean install |
| **P0-02** `django-filter` active usage | **FACT** | E1 | `django_filters` is used **only** in `INSTALLED_APPS` — no `FilterSet`, no `DjangoFilterBackend` in any Python file |
| **Test runner** Candidate 1 resolves correctly | **CONFIRMED** | E1 (path existence verified) | `python stack/postgres sql/updated_...sql` exists; test runner will load it correctly in this workspace |
| **Test runner** Candidates 2 & 3 are dead code | **CONFIRMED** | E1 | Both paths verified non-existent in this layout |
| **Test runner** Glob fallback is non-deterministic | **CONFIRMED** | E1 | Two `.sql` files in `postgres sql/`; `sql_files[0]` ordering is OS-dependent |
| **Test runner** Silent schema-skip on missing file | **CONFIRMED** | E1 | `if sql_file and sql_file.exists():` — no error raised if no file found |

---

## 5. Regression Risks and Dependency Interactions

| Risk | Impact | Interaction |
|---|---|---|
| Adding `cryptography` to `base.txt` | Minimal; already installed in `.venv` | None — deferred import means no code path changes |
| Adding `django-filter` to `base.txt` | Minimal; already installed in `.venv` | None — only `INSTALLED_APPS` registration; no code uses it |
| If `django-filter` were removed from `INSTALLED_APPS` | Would remove app-level template tags and admin integration | No current code calls it, so removal is safe, but adding to requirements is the simpler path |
| Adding `.gitignore` entry for `private_media/` | The 29 fixture files remain tracked (rule: `git rm --cached` not run) | New runtime uploads will be ignored going forward |
| Hardening test runner SQL path | Tests fail loudly instead of silently on misconfigured environments | This is the desired behavior; no regression for correctly configured environments |
| `psycopg` + `psycopg-binary` both declared | In production containers, `psycopg-binary` pulls in pre-compiled C extensions unnecessarily | Existing condition; not in scope of this task |

---

## 6. Files Involved (Read-Only; No Changes Made)

| File | Role |
|---|---|
| [`python stack/.gitignore`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/.gitignore) | Missing `private_media/` rule |
| [`backend/requirements/base.txt`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/requirements/base.txt) | Missing `django-filter` and `cryptography` |
| [`backend/common/security.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/common/security.py) | Imports `cryptography.fernet` at L106, L126 |
| [`backend/config/settings/base.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/config/settings/base.py) | `'django_filters'` in `INSTALLED_APPS` at L42 |
| [`backend/config/test_runner.py`](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer HR Management/python stack/backend/config/test_runner.py) | Candidate list at L10–L14; glob at L23–L27; silent-skip at L50 |
| `python stack/postgres sql/updated_volunteer_coordination_system_Database.sql` | Primary frozen SQL — 151,568 bytes; candidate 1 resolves to this correctly |
| `python stack/prompt code/spec/updated_volunteer_coordination_system_Database.sql` | Reference copy — same size, same timestamp; not in test runner candidates |

---

**Awaiting human approval before any implementation.**
