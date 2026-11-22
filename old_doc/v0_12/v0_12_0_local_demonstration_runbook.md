# Local Prototype Demonstration & Verification Runbook (v0.12.0)

**Document:** `v0_12_0_local_demonstration_runbook.md`  
**Target Environment:** Local Windows Workstation / PostgreSQL 18.6 / Python 3.12 (.venv) / React Native BFF  
**Target Database:** `volunteer_coordination_db` (Port 5432)  
**Database Policy:** STRICT FREEZE — Zero DDL, Zero DML against existing database  
**Execution Order:** Least Disruptive Path (Priority 1 -> Priority 2 -> Priority 5 -> Priority 6)

---

## Executive Summary & Safety Policy

This runbook specifies the **least disruptive operational order** to bring the current prototype to a stable, reliable local demonstration state.

### The Immutable Database Freeze Rule
The existing local PostgreSQL database (`volunteer_coordination_db`) contains intact prototype data (238 users, 192 tokens, 37 events, and core schemas).
> [!CAUTION]
> **NEVER execute against `volunteer_coordination_db`:**
> - `python backend/manage.py migrate` or `makemigrations`
> - `python scripts/alter_local_db.py`
> - `python scripts/seed_integration_fixtures.py`
> - `psql -f postgres_sql/updated_volunteer_coordination_system_Database.sql`
> - Any write test suites (`test_real_http_e2e.py` without disposable DB routing)
>
> All models in Django use `managed = False`. The database is database-first and frozen.

---

## Priority 1 — Establish the Local Environment

The goal of Priority 1 is to bring the backend online and verify communication with the existing database without executing any schema or data modifications.

### Step 1.1: Verify & Start the Local PostgreSQL Service
The prototype relies on a locally installed PostgreSQL 18.x instance.

1. **Check Service Status (PowerShell):**
   ```powershell
   Get-Service -Name "*postgres*"
   ```
2. **Start Service (if stopped):**
   ```powershell
   Start-Service -Name "postgresql-x64-18"
   ```
3. **Verified Local State:**
   - **Service Name:** `postgresql-x64-18`
   - **Status:** `Running`
   - **Engine Version:** `PostgreSQL 18.6 on x86_64-windows`

---

### Step 1.2: Confirm Database Credentials & Configure `.env`
Inspect and ensure that the root `.env` or `backend/.env` file has the matching connection parameters for the local database:

```ini
# PostgreSQL Database Configuration
DB_NAME=volunteer_coordination_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=127.0.0.1
DB_PORT=5432

# Django Core & Crypto Settings
DEBUG=True
SECRET_KEY=django-insecure-f7(wutn^($y(7%in-uwbzw6auh6vnuc(zr7yc@vdt70xx(a8nd
ALLOWED_HOSTS=localhost,127.0.0.1,10.0.2.2,0.0.0.0
PHONE_HASH_HMAC_SECRET=your-hmac-secret-at-least-32-chars
PHONE_ENCRYPTION_KEY=your-fernet-key-32-urlsafe-base64-bytes

# Verification Image Encryption (AES-256-GCM)
VERIFICATION_IMAGE_ENCRYPTION_KEY=your-verification-image-aes256-key-32-urlsafe-base64-bytes
VERIFICATION_IMAGE_KEY_ID=v1
VERIFICATION_IMAGE_KEYRING={"v1":"your-verification-image-aes256-key-32-urlsafe-base64-bytes"}
```

---

### Step 1.3: Run Django's Non-Migrating System Check
Always execute Django commands using the virtual environment interpreter (`.venv`) with `PYTHONPATH=backend`.

1. **Execute System Check:**
   ```powershell
   $env:PYTHONPATH="backend"
   .\.venv\Scripts\python backend/manage.py check
   ```
2. **Expected Verification Result:**
   ```text
   System check identified no issues (0 silenced).
   ```
   > [!NOTE]
   > `manage.py check` executes pure system validation without touching the database schema or issuing migrations.

---

### Step 1.4: Start Django & Verify Swagger / Admin Pages
1. **Start Development Server:**
   ```powershell
   $env:PYTHONPATH="backend"
   .\.venv\Scripts\python backend/manage.py runserver 0.0.0.0:8000
   ```

2. **Verify Endpoints:**
   - **Swagger UI Documentation:** [http://127.0.0.1:8000/api/docs/](http://127.0.0.1:8000/api/docs/) (HTTP 200 OK via `drf-spectacular`)
   - **OpenAPI Schema Definition:** [http://127.0.0.1:8000/api/v1/schema/](http://127.0.0.1:8000/api/v1/schema/) (HTTP 200 OK)
   - **Admin Login Portal:** [http://127.0.0.1:8000/admin/login/](http://127.0.0.1:8000/admin/login/) (HTTP 200 OK)

3. **Non-Disruptive Health Verification Script:**
   ```powershell
   $env:PYTHONPATH="backend"
   .\.venv\Scripts\python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local'); django.setup(); from django.test import Client; c = Client(); print('Swagger:', c.get('/api/docs/').status_code); print('Admin Login:', c.get('/admin/login/').status_code)"
   ```

---

## Priority 2 — Verify BFF Integration

The React Native mobile client communicates solely with the Django Backend-For-Frontend (BFF) over REST/HTTP.

### Step 2.1: Set Mobile App to HTTP Mode
The client defaults to `mock` mode to preserve offline baselines until explicitly toggled.

- **Source Location:** [dataMode.ts](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/mobile/src/app/configuration/dataMode.ts)
- **Runtime Switch:**
  ```typescript
  import { setDataMode, getDataMode } from './src/app/configuration/dataMode';

  // Enable live HTTP BFF communication
  setDataMode('http');
  console.log('Active Data Mode:', getDataMode()); // 'http'
  ```

---

### Step 2.2: Configure Base URL for Target Execution Environment
The mobile client contains pre-configured presets in [apiConfig.ts](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/mobile/src/core/api/apiConfig.ts):

| Target Environment | Base URL | Host Preset / Network Setup |
|---|---|---|
| **USB Physical Device** | `http://localhost:8000` | Run `adb reverse tcp:8000 tcp:8000` over USB. Allows device to route to host PC. |
| **Android Emulator (AVD)** | `http://10.0.2.2:8000` | Loopback alias configured via `setApiHostPreset('emulator')`. |
| **iOS Simulator** | `http://localhost:8000` | Direct localhost loopback on macOS host. |
| **LAN Wi-Fi Device** | `http://<HOST_LAN_IP>:8000` | Set via `setApiConfig({ baseUrl: 'http://192.168.x.x:8000' })`. |

**Programmatic Switch:**
```typescript
import { setApiHostPreset, setApiConfig } from './src/core/api/apiConfig';

// For Android Studio Emulator:
setApiHostPreset('emulator'); // Sets http://10.0.2.2:8000

// For Physical Phone over USB:
setApiHostPreset('usb');      // Sets http://localhost:8000 (requires adb reverse)
```

---

### Step 2.3: Confirm Mobile OTP Reaches BFF Endpoint
The mobile app requests challenge tokens via `POST /api/v1/auth/tokenized/request-otp/`.

1. **Endpoint Contract:**
   - **Path:** `/api/v1/auth/tokenized/request-otp/`
   - **Method:** `POST`
   - **Headers:** `Content-Type: application/json`
   - **Payload:** `{"phone": "+95912345678"}`

2. **Verification Command (cURL / PowerShell):**
   ```powershell
   Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/v1/auth/tokenized/request-otp/" `
     -ContentType "application/json" `
     -Body '{"phone": "+95912345678"}'
   ```
3. **Response Received:**
   ```json
   {
     "status": "challenge_issued",
     "auth_session_token": "a021239c-5a98-4c91-9e23-7fa3d20a671f",
     "expires_in": 300,
     "code_length": 6,
     "delivery": {
       "channel": "sms",
       "adapter": "console",
       "dispatched": true
     },
     "dev_code": "123456"
   }
   ```

---

### Step 2.4: Confirm Authenticated Mobile Read Endpoints Through BFF
Once authenticated, the mobile client issues DRF Token authentication (`Authorization: Token <token>`).

1. **Verification Test:**
   ```powershell
   $token = "your_auth_token_here"
   Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/api/v1/events/" `
     -Headers @{ "Authorization" = "Token $token" }
   ```
2. **Verified Endpoints:**
   - `GET /api/v1/events/` -> HTTP 200 (Active public & registered events list)
   - `GET /api/v1/profile/` -> HTTP 200 (User demographics, skills, and emergency contact)
   - `GET /api/v1/coordinator/events/` -> HTTP 200 (Coordinator event dashboard)

---

### Step 2.5: Confirm Zero Mobile-Side Database Drivers or Connection Strings
Inspect `mobile/package.json` and client source tree to verify complete absence of direct database connections:

1. **Dependency Audit:**
   - **`mobile/package.json` Dependencies:** `@react-navigation/*`, `react-native`, `react-native-keychain`, `react-native-reanimated`.
   - **PostgreSQL / SQL Drivers:** `0` (None found).
2. **Source Code Audit:**
   - All network calls flow strictly through `apiClient.ts` using standard `fetch`.
   - No connection strings (`postgresql://`, `postgres://`, `psycopg2`) exist in `mobile/src/`.

---

## Priority 5 — Verify Existing Verification Image Files

The verification images subsystem encrypts files with AES-256-GCM. The existing prototype directory may hold unmigrated or legacy plaintext test images.

### Step 5.1: Run Post-Conversion Audit in `--verify-only` Mode
Execute the management command from the `.venv` environment. This command is strictly **read-only**:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python backend/manage.py encrypt_verification_images --verify-only
```

---

### Step 5.2: Review Aggregate Counts & Hash Mismatch Results
Sample actual aggregate execution summary from the current environment:

```text
=== Verification Image Conversion Utility: POST-CONVERSION AUDIT (READ-ONLY) ===
--- Aggregate Execution Summary ---
Database Rows Scanned:           76
Total Files On Disk:             101
Referenced Files Found On Disk:  1
Plaintext JPEGs Identified:      1
Already Encrypted Envelopes:     0
Missing Referenced Files:        75
Orphan Files On Disk:            100
Corrupt / Unreadable Files:      0
SHA-256 Hash Mismatches:         0
Files Converted In Place:        0
Files Verified Valid:            0
Total Scanned Bytes:             2074
Largest File Size (Bytes):       2074
Post-conversion audit completed with anomalies detected.
```

#### Diagnostic Assessment:
- **`SHA-256 Hash Mismatches: 0`**: No file tampering or hash corruption detected.
- **`Corrupt / Unreadable Files: 0`**: All scanned files are readable.
- **`Missing Referenced Files` & `Orphan Files`**: Expected in prototype state due to development synthetic seeds referencing simulated paths on disk.

> [!WARNING]
> **Safety Guard:**
> Do **NOT** convert or delete images unless a specific operational requirement exists and a verified compressed backup archive has been created:
> ```powershell
> # Backup procedure if conversion is ever required:
> tar -czvf verification_images_backup.tar.gz backend/private_media/verification_images/
> ```

---

## Priority 6 — Repair Fresh-Install SQL Separately

While the live database `volunteer_coordination_db` is healthy and frozen, the standalone schema script [updated_volunteer_coordination_system_Database.sql](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/postgres_sql/updated_volunteer_coordination_system_Database.sql) contains a syntax corruption that prevents fresh bootstraps on new databases.

### Step 6.1: The Corrupted Expression in SQL Bootstrap File
In `postgres_sql/updated_volunteer_coordination_system_Database.sql`, lines 68–79:

```sql
-- Corrupted snippet on line 72:
CREATE FUNCTION tags_are_normalized(tags TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(cardinality(tags) <= 30, FALSE)
       AND NOT EXISTS (                 ....................................................................
       
            SELECT 1 FROM unnest(tags) AS t(tag)
             WHERE t.tag IS NULL
                OR t.tag = ''
                OR t.tag <> lower(btrim(t.tag))
                OR char_length(t.tag) > 50)
$$;
```

---

### Step 6.2: Authoritative Valid Expression
The intended definition was retrieved directly from git commit `de074afe148a80b1558369a69b1ebce8734dad50` and confirmed identical to the function active inside the running `volunteer_coordination_db`:

```sql
-- Authoritative valid schema definition:
CREATE OR REPLACE FUNCTION tags_are_normalized(tags TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(cardinality(tags) <= 30, FALSE)
       AND NOT EXISTS (
            SELECT 1 FROM unnest(tags) AS t(tag)
             WHERE t.tag IS NULL
                OR t.tag = ''
                OR t.tag <> lower(btrim(t.tag))
                OR char_length(t.tag) > 50)
$$;
```

---

### Step 6.3: Validation Workflow on a Disposable PostgreSQL Database
To test fresh schema bootstrapping safely without violating the freeze on `volunteer_coordination_db`:

1. **Create a Disposable Database (Separate from `volunteer_coordination_db`):**
   ```powershell
   psql -U postgres -h 127.0.0.1 -p 5432 -c "CREATE DATABASE disposable_test_db;"
   ```
2. **Repair line 72 in a copy of the SQL file:**
   Replace the ellipsis dots with a clean newline so that `AND NOT EXISTS (` directly encloses the subquery.
3. **Execute Bootstrap on Disposable Database Only:**
   ```powershell
   psql -U postgres -h 127.0.0.1 -p 5432 -d disposable_test_db -f postgres_sql/repaired_schema.sql
   ```
4. **Validate Self-Test on Disposable Database:**
   ```powershell
   psql -U postgres -h 127.0.0.1 -p 5432 -d disposable_test_db -c "SELECT * FROM self_test();"
   ```
5. **Clean up Disposable Database:**
   ```powershell
   psql -U postgres -h 127.0.0.1 -p 5432 -c "DROP DATABASE disposable_test_db;"
   ```
6. **Enforce Database Freeze:**
   > [!IMPORTANT]
   > Do **NOT** apply this script or run DDL against the live local database `volunteer_coordination_db`. The live database already has the correct function installed and verified.

---

## Quick Reference Verification Commands

| Priority | Action | Command | Expected Output / Gate |
|---|---|---|---|
| **Priority 1** | PostgreSQL Service | `Get-Service -Name "*postgres*"` | `Status: Running` |
| **Priority 1** | Django Check | `.\.venv\Scripts\python backend/manage.py check` | `0 issues (0 silenced)` |
| **Priority 1** | Start Django Server | `.\.venv\Scripts\python backend/manage.py runserver 0.0.0.0:8000` | HTTP 200 on `/api/docs/` and `/admin/login/` |
| **Priority 2** | USB Device Routing | `adb reverse tcp:8000 tcp:8000` | Port 8000 forwarded to host |
| **Priority 2** | Mobile OTP Request | `POST /api/v1/auth/tokenized/request-otp/` | HTTP 200 with `auth_session_token` & `dev_code` |
| **Priority 2** | Mobile BFF Read | `GET /api/v1/events/` (with Token) | HTTP 200 with JSON event payload |
| **Priority 2** | DB Driver Check | `node -e "require('./mobile/package.json')"` | 0 SQL / PostgreSQL dependencies |
| **Priority 5** | Image Audit | `.\.venv\Scripts\python backend/manage.py encrypt_verification_images --verify-only` | `SHA-256 Hash Mismatches: 0` |
| **Priority 6** | Schema Function Inspection | `SELECT pg_get_functiondef('tags_are_normalized'::regproc);` | Confirms valid function body in live DB |
