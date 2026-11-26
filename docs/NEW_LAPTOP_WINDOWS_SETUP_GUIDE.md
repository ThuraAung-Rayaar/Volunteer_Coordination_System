# Clean Windows Laptop — Step-by-Step Installation & Setup Guide

> **Target OS:** Windows 10 / Windows 11 (64-bit)  
> **Target Repository:** `Volunteer_HR_Management/python_stack/`  
> **Last Updated:** 2026-11-26  

This guide walks through setting up the **Volunteer HR Management System (VCS)** from a completely blank Windows laptop—from downloading every required tool and configuring Windows Environment Variables (`PATH`, `JAVA_HOME`, `ANDROID_HOME`), to installing dependencies, creating the dependency-injection config, bootstrapping PostgreSQL & seedlings, and running both the Django backend and React Native Android app.

---

## Step 1: Download & Install System Dependencies

Install the following software in order. Keep default installation paths unless noted so the environment variable paths in **Step 2** match cleanly.

### 1.1 Git for Windows
- **Required:** Git `>= 2.30`
- **Download:** <https://git-scm.com/download/win> (64-bit Git for Windows Setup)
- **Installer options:** Keep defaults (**"Git from the command line and also from 3rd-party software"**).

### 1.2 Python `3.12.x` (`>= 3.11`)
- **Required:** Python `>= 3.11` (project verified on **Python 3.12.4**)
- **Download:** <https://www.python.org/downloads/windows/> (choose latest **Python 3.12.x Windows installer (64-bit)**)
- **Installer options (CRITICAL):**
  - Check **"Add python.exe to PATH"** at the bottom of the first installer screen.
  - Check **"Use admin privileges when installing py.exe"** (recommended).

### 1.3 PostgreSQL `18.x` (Target `18.6`)
- **Required:** PostgreSQL `>= 18.0` (required for native `uuidv7()` and `btree_gist`)
- **Download:** <https://www.enterprisedb.com/downloads/postgres-postgresql-downloads> (select **PostgreSQL 18.x — Windows x86-64**)
- **Installer options:**
  - Install directory: `C:\Program Files\PostgreSQL\18` (default)
  - Port: `5432` (default)
  - Superuser (`postgres`) password: **Choose a local password and write it down** (you will enter it in Steps 5 & 6).
  - Locale: Default locale (`UTF8` databases are created later by the setup script).
  - Ensure the Windows service `postgresql-x64-18` is running.

### 1.4 Node.js (`>= 22.11.0`)
- **Required:** Node.js `>= 22.11.0` (specified in `mobile/package.json` `"engines": { "node": ">= 22.11.0" }`)
- **Download:** <https://nodejs.org/en/download> (download **Windows Installer (.msi) 64-bit** for Node `v22.11.0+` or current LTS)
- **Installer options:** Keep defaults (automatically installs `npm` and adds `C:\Program Files\nodejs\` to `PATH`).

### 1.5 Java Development Kit — JDK 21 LTS (or JDK 17 LTS)
- **Required:** JDK `17` or `21` LTS (verified on **JDK 21.0.7**)
- **Download:** <https://adoptium.net/temurin/releases/?os=windows&arch=x64&package=jdk&version=21> (Eclipse Temurin JDK 21 `.msi`)
- **Installer options:** Check **"Set JAVA_HOME variable"** and **"Add to PATH"** in the MSI feature tree if offered (we also verify/configure it in Step 2).

### 1.6 Android Studio & Android SDK
- **Required:** Android Studio + Android SDK components matching `mobile/android/build.gradle`:
  - `compileSdkVersion = 37`
  - `targetSdkVersion = 36`
  - `minSdkVersion = 24`
  - `buildToolsVersion = "37.0.0"`
  - `ndkVersion = "27.1.12297006"`
  - Gradle `9.4.1` (auto-downloaded by `mobile/android/gradlew.bat` on first build)
- **Download:** <https://developer.android.com/studio>
- **First-Launch SDK Setup:**
  1. Open **Android Studio** and complete the Standard Setup Wizard (downloads the base Android SDK to `C:\Users\<YourUsername>\AppData\Local\Android\Sdk`).
  2. Open **Settings / More Actions → SDK Manager**:
     - Under **SDK Platforms** tab: check **"Show Package Details"** (bottom right) and install **Android API 37** (and optionally API 36 / 35) including an **SDK Platform** and **Google APIs Intel x86_64 Atom System Image** (for emulator).
     - Under **SDK Tools** tab: check **"Show Package Details"** and install:
       - **Android SDK Build-Tools** → `37.0.0`
       - **NDK (Side by side)** → `27.1.12297006`
       - **Android SDK Command-line Tools (latest)**
       - **Android Emulator**
       - **Android SDK Platform-Tools** (`adb`)
  3. *(Optional if not using a physical phone)* Open **Device Manager → Create Virtual Device** (e.g., `Medium Phone` or `Pixel 5`, API 33/35/36) and finish creating one AVD.

### 1.7 Optional: Local AI Runtime (Ollama)
- Only needed if you want to run local LLM inference (`AI_PROVIDER=ollama`) instead of `mock` (offline deterministic) or `gemini` (cloud API key).
- **Download:** <https://ollama.com/download/windows>

---

## Step 2: Configure Windows Environment Variables (`PATH`, `JAVA_HOME`, `ANDROID_HOME`)

### Where to Open Environment Variables on Windows
1. Press `Win + R`, type `sysdm.cpl`, and press **Enter**.
2. Click the **Advanced** tab → **Environment Variables...** button.
   *(Or search Windows Start for **"Edit the system environment variables"** → **Environment Variables...**.)*

### 2.1 Add User (or System) Variables
Under **User variables for \<YourUsername\>** (top box), click **New...** for each missing variable:

| Variable Name | Value to Set (Check Your Actual Install Path) |
|---|---|
| `JAVA_HOME` | `C:\Program Files\Eclipse Adoptium\jdk-21.0.7.6-hotspot` *(or `C:\Program Files\Java\jdk-21` if using Oracle JDK)* |
| `ANDROID_HOME` | `%LOCALAPPDATA%\Android\Sdk` *(resolves to `C:\Users\<YourUsername>\AppData\Local\Android\Sdk`)* |
| `ANDROID_SDK_ROOT` | `%LOCALAPPDATA%\Android\Sdk` *(optional legacy alias)* |

### 2.2 Add Entries to `Path`
In **System variables** (or **User variables**), select `Path` → click **Edit...** → click **New** and ensure all of these exist:

1. `C:\Program Files\PostgreSQL\18\bin` *(so `psql`, `createdb`, `pg_dump` work anywhere)*
2. `%JAVA_HOME%\bin` *(so `java` works anywhere)*
3. `%ANDROID_HOME%\platform-tools` *(so `adb` works anywhere)*
4. `%ANDROID_HOME%\emulator` *(so `emulator` works anywhere)*
5. `C:\Program Files\Git\cmd` *(added by Git installer)*
6. `C:\Program Files\nodejs\` *(added by Node.js installer)*
7. Python 3.12 path (if not added by installer, e.g. `%LOCALAPPDATA%\Programs\Python\Python312\` and `%LOCALAPPDATA%\Programs\Python\Python312\Scripts\`)

Click **OK** on all dialogs, then **close and reopen PowerShell** so the new environment variables take effect.

### 2.3 Verify All Installed Tools in a Fresh PowerShell Window
```powershell
git --version
python --version
psql --version
node --version
npm --version
java -version
adb version
echo "JAVA_HOME=$env:JAVA_HOME"
echo "ANDROID_HOME=$env:ANDROID_HOME"
```
Every command above should print a valid version without `"is not recognized"` errors.

---

## Step 3: Clone the Repository & Run the System Status Probe

1. If PowerShell blocks script activation later, allow local scripts for your user:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```
2. Clone the project into a **short folder path** (e.g., `C:\vcs\` — recommended to avoid Windows' 260-character path limit during Android C++/CMake builds) and navigate into `python_stack`:
   ```powershell
   cd C:\
   git clone <your-repo-url> vcs
   cd C:\vcs\python_stack
   git checkout feature/ai-chat-cache-ml-insights
   ```
   *(If you must clone into a deep folder like `Documents\...`, enable Windows Long Paths once in an **Administrator** PowerShell: `Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1`.)*
3. Run the read-only system status checker to see what is already satisfied on your laptop:
   ```powershell
   python scripts\check_system_status.py
   ```
   This prints a readiness percentage and generates `SYSTEM_STATUS.md` at the root of `python_stack/`.

---

## Step 4: Install Python & React Native Project Dependencies

### 4.1 Python Virtual Environment (`.venv`) & Backend Packages
From `python_stack\`:
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements\local.txt
```
This installs Django `5.1.x`, Django REST Framework `>= 3.15.2`, `psycopg >= 3.2.0`, `cryptography`, `python-dotenv`, `Pillow`, `drf-spectacular`, `django-cors-headers`, `django-filter`, `ruff`, and `pytest-django`.

### 4.2 React Native Mobile Packages (`mobile/`)
From `python_stack\`:
```powershell
cd mobile
npm ci
cd ..
```
> Use `npm ci` (not `npm install`) so installed versions match `mobile/package-lock.json` cleanly.

---

## Step 5: Create the Dependency Injection Config (`di_config.local.json`)

The backend reads all secrets, database credentials, map keys, AI settings, and runtime flags from `di_config.local.json` via `config_di.py` (instead of the template `di_config.example.json`).

Run the interactive DI config generator from `python_stack\`:
```powershell
.\.venv\Scripts\python.exe scripts\setup_di_config.py --interactive
```
Enter your values when prompted:
- **PostgreSQL Host:** `127.0.0.1`
- **PostgreSQL Port:** `5432`
- **Database Name:** `volunteer_coordination_db`
- **PostgreSQL User:** `postgres`
- **PostgreSQL Password:** *(the password you set in Step 1.3)*
- **AI Provider:**
  - `mock` *(recommended default: zero external API key required, works offline)*
  - `gemini` *(requires a Gemini API key if testing live hosted AI)*
  - `ollama` *(requires local Ollama running with `qwen2.5:0.5b` or `qwen3.5:4b`)*
- **CARTO Map API Key:** *(optional; press Enter to leave empty and use public OSM/CARTO + local `map/*.mbtiles`)*

This automatically generates **6 distinct high-entropy cryptographic keys** (`django_secret_key`, `phone_hash_hmac_secret`, `otp_code_hmac_secret`, `auth_session_token_secret`, `phone_encryption_key`, `verification_image_encryption_key`) and writes the gitignored `di_config.local.json` file.

---

## Step 6: Create, Structure & Seed the PostgreSQL Database

Run the unified database manager from `python_stack\`:
```powershell
.\.venv\Scripts\python.exe postgres_sql\manage_database.py --verify-structure
```
When prompted:
1. Confirm PostgreSQL username (`postgres`) and password.
2. Enter an **Admin Portal password** for the seeded Super Admin & Admin accounts (or press **Enter** to auto-generate a secure random password).

Behind the scenes, `manage_database.py` performs the entire database lifecycle:
1. Connects to `127.0.0.1:5432/postgres` and verifies PostgreSQL `>= 18.0`.
2. Creates database `volunteer_coordination_db` (`UTF8`).
3. Applies `postgres_sql/VCS_db.sql` (23 domain tables, 11 views, 53 triggers, `btree_gist`, `uuidv7()`).
4. Runs `backend\manage.py migrate --noinput` (creates the 8 Django system tables).
5. Executes `postgres_sql/seedlings/01_yangon_demo_seed.sql`, dynamically re-computing `phone_hash`, `phone_enc`, and PBKDF2 admin passwords with your `di_config.local.json` keys so logins work out of the box.
6. Generates & seeds the mandatory 500-user / 150-event multi-city AI cohort (`postgres_sql/seedlings/ai_seed_bundle/`).
7. Verifies database structure (`base_tables=31, views=11, user_triggers=53`).
8. Writes **`SEEDED_CREDENTIALS.txt`** at the repository root containing 10 curated accounts (**1 Super Admin, 2 Admins, 2 Approved Coordinators, 5 Volunteers**) along with event IDs, coordinates, and QR tokens.

---

## Step 7: Verify Pre-Launch Readiness

Run the status check and Django system check:
```powershell
.\.venv\Scripts\python.exe scripts\check_system_status.py
.\.venv\Scripts\python.exe backend\manage.py check
```
Confirm:
- `SYSTEM_STATUS.md` shows **Mandatory Satisfied: 20/20 (100.0%)**
- `manage.py check` prints `System check identified no issues (0 silenced).`

---

## Step 8: Run the Full Stack (Manual 3-Terminal Method)

Open **3 PowerShell terminals** inside `python_stack\`:

### Terminal 1 — Start Django Backend & BFF Server
```powershell
.\.venv\Scripts\python.exe backend\manage.py runserver 0.0.0.0:8000
```
- **Admin Web Portal:** <http://127.0.0.1:8000/api/v1/admin/ui/login/>
- **Swagger API Docs:** <http://127.0.0.1:8000/api/docs/>

### Terminal 2 — Start React Native Metro Bundler
```powershell
cd mobile
npm start
```
*(Keep Metro running in this terminal.)*

### Terminal 3 — Connect Android Target & Launch Mobile App

Choose **Option A (Emulator)** or **Option B (Physical USB Phone)**:

#### Option A: Android Studio Virtual Device (Emulator)
1. Start your AVD from **Android Studio → Device Manager** (or run `emulator -avd <your_avd_name>`).
2. Confirm ADB sees it:
   ```powershell
   adb devices
   ```
   *(Should show `emulator-5554    device`.)*
3. Build and install the app:
   ```powershell
   cd mobile
   npm run android
   ```
   *(First Gradle build downloads Gradle `9.4.1` and compiles native C++/Kotlin dependencies; this takes a few minutes.)*
4. Inside the app's **Settings** screen:
   - Switch **DataMode** from `mock` to **`http`**.
   - Set **API Host Preset** to **Android Emulator (`http://10.0.2.2:8000`)**.

#### Option B: Physical Android Phone over USB
1. **Enable Developer Options on the phone:**
   - Open **Settings → About phone** (or **Software information**).
   - Tap **Build number** (or **MIUI/HyperOS/OS version** on Xiaomi) **7 times** until *"You are now a developer!"* appears.
   - Open **Settings → System → Developer options** and turn ON **Developer options** and **USB debugging**.
   - *Vendor extras:* On **Xiaomi / Redmi / POCO**, also turn ON **USB debugging (Security settings)** and **Install via USB**. On **Oppo / Realme / OnePlus**, turn ON **Disable Permission Monitoring**.
2. Plug in a **USB data cable**, set USB mode to **File Transfer (MTP)**, and tap **Allow** on the *"Allow USB debugging?"* popup on your phone (check *"Always allow from this computer"*).
3. Verify ADB authorization:
   ```powershell
   adb devices
   ```
   *(Must show `<serial>    device`, NOT `unauthorized`.)*
4. Forward Metro (`8081`) and Django (`8000`) ports and install the app:
   ```powershell
   cd mobile
   npm run android:device
   ```
   *(Runs `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8000 tcp:8000` then `react-native run-android`.)*
5. Inside the app's **Settings** screen:
   - Switch **DataMode** from `mock` to **`http`**.
   - Keep **API Host Preset** on **USB Device (`http://localhost:8000`)**.

---

## Step 9: Log In and Verify End-to-End Flow

Open `SEEDED_CREDENTIALS.txt` at the root of `python_stack\`:
- **Admin Web Portal** (`http://127.0.0.1:8000/api/v1/admin/ui/login/`): Use the **Super Admin** or **Admin** phone number (`+959100000001` / `+959100000002`) and the Admin Password shown in `SEEDED_CREDENTIALS.txt`.
- **Mobile App / API OTP Login**: Use any **Coordinator** or **Volunteer** phone number from `SEEDED_CREDENTIALS.txt`. *(To see `dev_code` in local development OTP responses without SMS delivery, set `"dev_options_enabled": true` under `"consumer_ui"` and `"allow_dev_code_in_auth_response": true` under `"auth"` in `di_config.local.json`.)*

---

## Troubleshooting Common Windows Setup Issues

| Symptom | Cause | Fix |
|---|---|---|
| `psql` / `adb` / `java` is not recognized | Folder missing from Windows `Path` or terminal wasn't restarted | Add the `bin` / `platform-tools` folder in `sysdm.cpl` → Environment Variables, then open a **new** PowerShell window. |
| `Activate.ps1 cannot be loaded because running scripts is disabled` | Windows PowerShell default policy | Run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` or invoke `.\.venv\Scripts\python.exe` directly. |
| `adb devices` shows `unauthorized` | RSA USB debugging popup not accepted on phone | Unlock phone screen, run `adb kill-server` then `adb start-server`, and tap **Allow** on the phone dialog. |
| Mobile app in `http` mode cannot reach Django on Emulator | App still pointing to `localhost:8000` instead of host bridge | In mobile **Settings**, select **Android Emulator (`http://10.0.2.2:8000`)** (inside an emulator, `localhost` refers to the emulator itself). |
| Mobile app in `http` mode cannot reach Django on USB phone | ADB reverse port forwarding lost after cable reconnect | Re-run `cd mobile && npm run reverse` (`adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8000 tcp:8000`). |
| Gradle fails complaining about NDK or Build-Tools | Missing exact SDK package versions | Open Android Studio → SDK Manager → **SDK Tools** → **Show Package Details** → install **Build-Tools 37.0.0** and **NDK 27.1.12297006**. |
