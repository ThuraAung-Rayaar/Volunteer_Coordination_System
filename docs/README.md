# Volunteer HR Management System — Technical Documentation Portal

> **Release Version:** v0.12.2 (Mobile & Hardware Stabilization — Complete & Signed Off)  
> **Last Updated:** 2026-11-23  
> **Target Repository:** `python_stack/docs/`  
> **Candidate SHA:** `main` (branch `main`)  
> **Database Engine:** PostgreSQL 18.6 (Schema Frozen & Immutable)  
> **Backend Framework:** Django 5.1 / DRF 3.15.2 (API v0.12.2)  
> **Mobile Client:** React Native 0.88.1 / React 19.3 / TypeScript 6.0 (App v0.12.2)  

---

## 1. Documentation Portal Overview

This directory (`docs/`) serves as the authoritative technical reference repository for the **Volunteer HR Management System (CommonGround / Workshift)**. All legacy drafts, transient plans, and temporary code dumps have been permanently migrated to `old_doc/`.

```
python_stack/docs/
├── README.md                               # This documentation portal index
├── SESSION_COMPLETION_REPORT_V0_12_2.md     # Master session sign-off & completion audit
├── backend_analysis.md                     # Django 5.1 backend, BFF routes, services & security
├── mobile_analysis.md                      # React Native client architecture, screens, DDD layers
├── full_database_details.md                # PostgreSQL 18.6 catalog: 31 tables, 14 views, 63 functions
└── tokenization_login_architecture.md      # Zero-PII auth handshake & OTP session state machine
```

---

## 2. Document Catalog & Deep-Dive Directory

| Document | Core Focus | Key Architectural Elements |
|---|---|---|
| [docs/SESSION_COMPLETION_REPORT_V0_12_2.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/SESSION_COMPLETION_REPORT_V0_12_2.md) | **Session Completion Audit** | Master completion record: USB ADB reverse networking, Volunteer & Coordinator floating dynamic islands, permanent drawer menu accessibility, front-camera verification selfie enforcement, event lifecycle synchronization, and multi-event card selection. |
| [docs/mobile_analysis.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/mobile_analysis.md) | **Mobile Client Tier** | React Native 0.88.1 & TS 6.0 client, 17 Drawer navigation screens, DDD presentation/domain/data tiers, pure bidirectional mappers, dual-mode runtime (`mock` vs `http`), `VolunteerDynamicIsland` and `CoordinatorDynamicIsland`, 39 Jest suites / 621 passing tests, 0 type errors. |
| [docs/backend_analysis.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/backend_analysis.md) | **Backend & BFF Tier** | Django 5.1 & DRF 3.15 settings, 19 business services, unified `/api/v1/` and `/api/bff/mobile/` routes, `DbContextMiddleware`, AES-256-GCM verification image envelope encryption (`VIMG\x01`), streaming admin decrypt, and 662 passing automated backend tests. |
| [docs/full_database_details.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/full_database_details.md) | **Database Layer** | Exhaustive PostgreSQL 18.6 schema catalog: all 31 base tables, 14 views, 63 domain stored procedures and triggers, exclusion constraints (`btree_gist`), native `uuidv7()` primary keys, and immutable frozen schema policy. |
| [docs/tokenization_login_architecture.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/docs/tokenization_login_architecture.md) | **Security & Auth** | Zero-cleartext phone tokenization, ephemeral `auth_session_token` with 180s TTL, row-level locking state machine, `OtpDeliveryAdapter` boundary, asynchronous decoupled SMS dispatch, and sub-500ms latency budget compliance. |

---

## 3. System Architecture & Topology

```mermaid
flowchart TD
    subgraph ClientTier["Mobile Client Tier (mobile/ — v0.12.2)"]
        RN["React Native 0.88.1 / React 19.3"]
        NAV["17-Screen Drawer Navigator (AppHeader Dual-Action)"]
        ISLANDS["Floating Islands: VolunteerDynamicIsland & CoordinatorDynamicIsland"]
        USE_CASES["Domain Use Cases (82 Capabilities)"]
        DM["DataMode Router: 'mock' | 'http'"]
        AUTH_CLIENT["Tokenized Auth Handshake State Machine"]
    end

    subgraph BackendTier["Django BFF Tier (backend/ — API v0.12.2)"]
        DRF["Django 5.1 / DRF 3.15"]
        BFF["BFF Routers (/api/v1/ & /api/bff/mobile/)"]
        ADM["Admin Portal Web UI & APIs"]
        SRV["19 Business Logic Services"]
        CRYPTO["AES-256-GCM Envelope Crypto Engine"]
        MAP_ENG["Self-Hosted Asymmetric Tile Engine"]
    end

    subgraph DatabaseTier["PostgreSQL Engine Tier (postgres_sql/ — Frozen)"]
        PG["PostgreSQL 18.6 Engine"]
        EXT["btree_gist & Native uuidv7()"]
        TABLES["31 Base Tables (auth_otp_challenge, users, etc.)"]
        TRIG["63 Stored Functions & Triggers"]
        VIEWS["14 Read-Only Performance Views"]
    end

    RN --> NAV
    NAV --> ISLANDS
    NAV --> USE_CASES
    USE_CASES --> DM
    DM -->|'http' mode| AUTH_CLIENT
    AUTH_CLIENT -->|REST API / Zero-PII Token Auth| BFF
    BFF --> SRV
    BFF --> CRYPTO
    ADM --> SRV
    ADM --> CRYPTO
    SRV -->|psycopg3 / DB Context Session| PG
    PG --> EXT
    PG --> TABLES
    PG --> TRIG
    PG --> VIEWS
```

---

## 4. Subsystem Verification & Quality Metrics

As of **v0.12.2 Stabilization (Session Signed Off)**, all system components meet strict production readiness gates:

| Subsystem | Stack & Version | Implementation Status | Quality & Verification Evidence |
|---|---|---|---|
| **Database Engine** | PostgreSQL 18.6 (`postgres_sql/`) | **100% Frozen & Complete** | 31 base tables, 14 views, 63 stored functions/triggers, `uuidv7()` active, preflight check PASS (`scripts/db_preflight_check.py`). |
| **Backend & BFF** | Django 5.1 / DRF 3.15.2 (`backend/`) | **100% Complete (API v0.12.2)** | 19 business services, OpenAPI 3.0 schema (206 KB), tokenized OTP challenge endpoints, AES-256-GCM image streaming, **662 automated tests passing (100%)**. |
| **Mobile Client** | React Native 0.88.1 / TS 6.0 (`mobile/`) | **100% Complete (App v0.12.2)** | 17 Drawer screens, 82 role capabilities, dynamic islands in Volunteer & Coordinator workspaces, persistent side menu, **0 TypeScript errors, 39 Jest suites / 621 tests passing (100%)**. |
| **Hardware Testing** | Samsung Galaxy (`RFCR71P2BKE`) | **100% Verified** | Front camera strictly enforced for verification selfies, reverse tunnels (`8000`/`8081`) active, horizontal swipe tab transitions verified. |
| **Security & Privacy** | AES-256-GCM / HMAC-SHA256 | **100% Enforced** | Server-side encrypted verification images (`VIMG\x01`), blind index phone hashing, single-use `auth_session_token` with 180s TTL, Privacy Rule BR-PRIV-T4 hiding raw GPS coordinates. |

---

## 5. Security Architecture & Invariants

1. **Frozen Database Contract:**
   - Absolute immutability of `volunteer_coordination_db`.
   - All tests and fixtures execute strictly against isolated disposable database `test_volunteer_coordination_db`.
   - Preflight verification confirmed via `scripts/db_preflight_check.py`.
2. **Tokenized Authentication (Zero-PII Wire Transmission):**
   - Direct cleartext phone number transmission during verification is eliminated.
   - Client requests challenge via `POST /api/v1/auth/tokenized/request-otp/`, receiving ephemeral `auth_session_token` (180s TTL).
   - Verification (`POST /api/v1/auth/tokenized/verify-otp/`) transmits only `auth_session_token` and `code`.
   - OTP replay safely rejected with `409 challenge_consumed`.
3. **Encrypted Verification Image Storage:**
   - Uploaded verification JPEGs are sanitized in-memory and wrapped in a versioned AES-256-GCM binary envelope (`VIMG\x01`).
   - Stored in private directory `VERIFICATION_MEDIA_ROOT` outside public web media root.
   - Admin access decrypts in-memory on the fly via `GET /api/v1/admin/verification-images/<id>/file/`; non-admin access is rejected with `404/401`.
4. **Owner-as-Monitor Access Gate:**
   - Event owners who have handed over active coordination to another coordinator are restricted to read-only monitoring mode (HTTP 403 Forbidden on operational mutations).
5. **Front-Camera Verification Invariant:**
   - Verification selfies strictly invoke the native front-facing camera (`android.intent.extras.CAMERA_FACING: 1`, `LENS_FACING_FRONT: 1`); photo library selection is permanently disabled.

---

## 6. Historical Documents Archive (`old_doc/`)

All prior planning documents, intermediate transformation chronologies, and legacy implementation plans have been archived to `old_doc/`:
- `old_doc/01_PROJECT_TRANSFORMATION_MASTER_CHRONOLOGY.md` through `06_INTEGRATION_AUDIT_SECURITY_AND_VERIFICATION.md`
- `old_doc/ADMIN_PANEL_IMPLEMENTATION_AND_RECOMMENDED_FEATURES.md`
- `old_doc/ADMIN_SIDE_UI_ALL_CODE_APPENDED.html` & `.txt`
- `old_doc/MOBILE_UI_SYNC_GEMINI_CLI_IMPLEMENTATION_PLAN.md`
- `old_doc/TEMPLATE_MODE_BFF_SCREEN_AND_DATABASE_MATRIX.md`
- `old_doc/TEMPLATE_MODE_MOBILE_UI_AND_BFF_PARITY_PLAN.md`
- `old_doc/TEMPLATE_UI_RENDERABILITY_LOCAL_ANTIGRAVITY_PLAN.md`
- `old_doc/v0_12_0_real_http_integration_report.md`
- `old_doc/v0_12_0_stabilization_report.md`
- `old_doc/v0_12/` (historical prompt logs, baseline dumps, and v0.12.0 artifacts)

---

*Volunteer HR Management System Technical Documentation Suite — Authoritative Portal.*
