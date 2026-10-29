# Volunteer Coordination System (PEC HR) — Backend

Django REST Framework backend for the **Public Event Coordinator (PEC HR) & Volunteer Coordination System**, designed for online-only coordination with PostgreSQL and React Native clients.

---

## 🏗️ Architecture & Structure

```
python stack/
├── backend/                  # Core Django configuration
│   ├── settings.py           # Configured with python-dotenv, DRF, CORS, Postgres
│   ├── urls.py               # API v1 routes & OpenAPI Swagger/ReDoc
│   ├── wsgi.py
│   └── asgi.py
├── apps/                     # Modular domain apps
│   ├── accounts/             # Users, OTP auth, Coordinator profiles, ID verifications
│   ├── events/               # Events, charity fields, event posts, applications
│   ├── ops/                  # QR tokens, assignments, attendance evidence, feedback
│   ├── audit/                # Admin moderation actions and audit logs
│   └── common/               # Cross-app utilities and database field compatibility
├── sql/
│   └── volunteer_coordination_system_db_v0_5.sql   # Source database schema design v0.5
├── .env.example              # Template environment variables
├── .env                      # Local environment configuration
├── requirements.txt          # Python dependencies
└── manage.py                 # Django CLI entrypoint
```

---

## 🚀 Quick Start Guide

### 1. Activate the Virtual Environment

**Windows PowerShell:**
```powershell
.\.venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
source .venv/bin/activate
```

---

### 2. Configure Environment Variables (`.env`)

Verify your `.env` matches your PostgreSQL database credentials:
```ini
DJANGO_SECRET_KEY=your-secure-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

DB_ENGINE=django.db.backends.postgresql
DB_NAME=volunteer_coordination_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081
PHONE_HASH_HMAC_SECRET=secure-server-secret-for-phone-hmac
```

> **Note**: For local SQLite development (without PostgreSQL installed), set:
> ```ini
> DB_ENGINE=django.db.backends.sqlite3
> ```

---

### 3. Create the Database & Apply Migrations

Ensure PostgreSQL is running and database `volunteer_coordination_db` is created:
```sql
CREATE DATABASE volunteer_coordination_db;
```

Run Django migrations:
```powershell
python manage.py migrate
```

---

### 4. Seed Initial Lookup Data

Populate the controlled vocabulary `charity_fields` (matching `v0.5.sql`):
```powershell
python manage.py seed_charity_fields
```

---

### 5. Create an Administrator Account

```powershell
python manage.py createsuperuser
```

You will be prompted for:
- `phone_hash` (e.g. `admin_super`)
- `display_name` (e.g. `System Administrator`)
- `password`

---

### 6. Run the Development Server

```powershell
python manage.py runserver
```

---

## 📡 API Endpoints & Documentation

Once the server is running, explore:

- **Swagger UI Interactive Docs**: [http://127.0.0.1:8000/api/docs/](http://127.0.0.1:8000/api/docs/)
- **ReDoc Documentation**: [http://127.0.0.1:8000/api/redoc/](http://127.0.0.1:8000/api/redoc/)
- **OpenAPI 3.0 Schema**: [http://127.0.0.1:8000/api/schema/](http://127.0.0.1:8000/api/schema/)
- **Django Admin Portal**: [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/)

### Core API Routes (v1)

| Prefix | Domain | Description |
|---|---|---|
| `/api/v1/accounts/users/` | Accounts | User profile management & `/me` endpoint |
| `/api/v1/accounts/coordinators/` | Accounts | Coordinator verification and profile status |
| `/api/v1/events/charity-fields/` | Events | Controlled list of charity work types |
| `/api/v1/events/events/` | Events | Event creation, schedule, and discovery |
| `/api/v1/events/applications/` | Events | Volunteer event applications & decisions |
| `/api/v1/ops/qr-tokens/` | Operations | Check-in & walk-in QR token validation |
| `/api/v1/ops/assignments/` | Operations | Role assignments, squads & group leaders |
| `/api/v1/ops/attendances/` | Operations | Check-in/check-out timestamp evidence |
| `/api/v1/ops/feedbacks/` | Operations | Ratings and feedback after events |
| `/api/v1/audit/moderation-actions/` | Audit | Admin moderation actions |
| `/api/v1/audit/audit-logs/` | Audit | System audit logs |

