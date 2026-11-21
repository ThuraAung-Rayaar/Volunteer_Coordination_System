# 04 — BFF Integration & Baseline Discovery

**Milestone Focus:** Backend-For-Frontend (BFF) Pattern, Baseline Audits & Gap Remediation (v0.10.0)  
**Document Classification:** API Integration, Serialization Contracts & Technical Gap Analysis  
**Target Systems:** `backend/bff/`, `mobile/src/data/endpoints/`, `baseline/`, `reference/`  

---

## 1. The Backend-For-Frontend (BFF) Architectural Pattern

In early phases, the React Native mobile client interfaced directly with standard Django REST Framework model viewsets. In practice, this created major inefficiencies:
- **Over-fetching:** Returning heavy model relations, internal timestamps, and unnecessary foreign keys across low-bandwidth cellular connections.
- **Under-fetching:** Requiring the mobile client to execute 3 to 5 chained HTTP requests just to render a single shift details screen (e.g. shift info, geofence zone, coordinator contacts, and user application status).
- **Security Leaks:** Internal database identifiers and sensitive volunteer contact details were exposed inadvertently.

The introduction of the **BFF Gateway Layer** resolved these defects by establishing specialized endpoints tailored specifically for mobile user journeys:

```mermaid
flowchart LR
    subgraph MobileClient["React Native Client"]
        Screen["Shift Detail Screen"]
    end

    subgraph BFFGateway["BFF Gateway Layer (/api/v1/mobile/)"]
        Aggregator["Aggregator ViewSet"]
        PrivacyEngine["T0-T4 Filter"]
        AllowList["AllowList Validator"]
    end

    subgraph CoreBackend["Core Django Services & Database"]
        ShiftService["Shift Service"]
        GeoService["Geofence Service"]
        CoordService["Coordinator Service"]
        Postgres["PostgreSQL Invariants"]
    end

    Screen -->|Single Request: GET /shifts/{id}/hub| Aggregator
    Aggregator --> ShiftService
    Aggregator --> GeoService
    Aggregator --> CoordService
    ShiftService --> Postgres
    GeoService --> Postgres
    CoordService --> Postgres
    Aggregator --> PrivacyEngine
    PrivacyEngine --> AllowList
    AllowList -->|Optimized Single Payload JSON| Screen
```

---

## 2. v0.10.0 Baseline Discovery Audit & Field Discrepancies

The read-only discovery audit conducted during milestone v0.10.0 compared the backend serializer outputs directly against the TypeScript DTO definitions in the mobile client. It uncovered critical contract divergences:

| Domain | Backend Field (Serializer) | Frontend Expectation (TypeScript) | Discrepancy & Severity | Resolution Applied |
| :--- | :--- | :--- | :--- | :--- |
| **Shift Timing** | `start_time`, `end_time` (ISO 8601 string) | `startTime`, `endTime` (Unix ms or camelCase) | **High:** Inconsistent case conventions broke date parsing on mobile. | Standardized on camelCase DTO mappers with strict ISO string parsers. |
| **Volunteer Phone** | Stripped under T2/T3 rules | `phone: string` (assumed non-null) | **Critical:** Null pointer exception on screen render when accessing coordinator contact. | Promoted `phone` to first-class nullable string with fallback placeholder. |
| **Attendance Status** | `status: 'assigned'` | `status: 'scheduled'` | **High:** Shift status badge rendered blank or defaulted to error state. | Aligned status enums across PostgreSQL, Django, and TypeScript. |
| **Geofence Radius** | `radius_meters: integer` | `radius: float` | **Medium:** Map circle rendering clipped on Android devices. | Cast to float in DTO mappers with safe default fallbacks (100.0m). |

---

## 3. Canonical API Route Standards

All mobile communications were unified under canonical, versioned REST endpoints prefixed with `/api/v1/`:

```
/api/v1/
├── auth/
│   ├── login/                  [POST] - Authenticate via phone/email and password
│   ├── otp/challenge/          [POST] - Request dynamic SMS/verification OTP
│   ├── otp/verify/             [POST] - Validate OTP and issue JWT access token
│   └── refresh/                [POST] - Refresh expired session token
├── volunteer/
│   ├── profile/                [GET/PUT] - Volunteer profile metrics & skills
│   ├── kyc/upload/             [POST] - Submit ID document & selfie verification
│   └── badges/                 [GET] - List earned gamification badges
├── events/
│   ├── explore/                [GET] - Search public events with region filtering
│   └── {id}/                   [GET] - Detailed event view with coordinator info
├── shifts/
│   ├── {id}/apply/             [POST] - Submit volunteer shift application
│   ├── {id}/withdraw/          [POST] - Cancel pending or approved application
│   └── active/                 [GET] - Retrieve current active shift workspace
├── attendance/
│   ├── checkin/qr/             [POST] - Check-in via rotating camera QR token
│   ├── checkin/geo/            [POST] - Check-in via GPS geofence telemetry
│   └── checkout/               [POST] - Check-out with hour log computation
└── coordinator/
    ├── shifts/{id}/roster/     [GET] - View applicants and assigned volunteers
    ├── applicants/{id}/accept/ [POST] - Approve volunteer application
    ├── applicants/{id}/reject/ [POST] - Reject volunteer application
    └── handover/delegate/      [POST] - Hand over operational command of shift
```

---

## 4. Actor Context & Security Handshake

To enforce zero-trust security and auditability, every authenticated BFF request injects actor context into the transaction lifecycle:
1. **JWT Header Transport:** `Authorization: Bearer <token>`
2. **PostgreSQL Session Context:** The Django middleware sets PostgreSQL transaction session parameters:
   ```sql
   SET LOCAL app.user_id = 'c0a80101-0000-0000-0000-000000000001';
   SET LOCAL app.ip = '192.168.1.100';
   ```
3. **Trigger Ingestion:** Database triggers on `shift_assignments`, `attendance_records`, and `moderation_actions` read `current_setting('app.user_id')` to write tamper-proof audit trails without trusting application parameters.

---

## 5. Private Media Storage & Secure KYC Pipeline

Identity verification documents (NRC cards, passports, driver licenses, and verification selfies) must never be accessible via public media URLs.
- **Storage Location:** `private_media/kyc/` outside public web server roots.
- **Access Protocol:** Signed temporary URLs generated with an expiration window of 300 seconds, accessible strictly by authenticated KYC verification administrators.
- **Integrity Validation:** MIME-type inspection, image resizing, EXIF metadata stripping, and SHA-256 checksum tracking upon upload.
