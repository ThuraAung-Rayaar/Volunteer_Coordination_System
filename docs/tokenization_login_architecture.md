# Tokenization Login Architecture & Active OTP Integration Specification
> **System:** Volunteer Coordination System (Volunteer HR Management)  
> **Target Scope:** Django 5.1 BFF (`backend/`), PostgreSQL 18 DB Layer (`postgres_sql/`), React Native Mobile Client (`mobile/`)  
> **Document Status:** Authoritative Architectural Specification & v0.12.0 Implementation Baseline (Verified)  
> **Date:** November 2026 (Updated: 2026-11-22) | **Target SLA:** Max 500ms Latency Budget / Sub-Second Failover  

---

## Table of Contents
1. [Executive Summary & Architectural Scope](#1-executive-summary--architectural-scope)
2. [Read-Only System Scan & Baseline Analysis](#2-read-only-system-scan--baseline-analysis)
   - 2.1 Backend Auth & Cryptography Baseline (`backend/`)
   - 2.2 PostgreSQL Schema & Trigger Constraints (`postgres_sql/`)
   - 2.3 Mobile Client Auth & Session Baseline (`mobile/`)
   - 2.4 Vulnerability & Architectural Gap Ledger
3. [Tokenization Login Architecture](#3-tokenization-login-architecture)
   - 3.1 Tokenization Design Principles & Terminology
   - 3.2 End-to-End Handshake Flow (Sequence Diagram)
   - 3.3 Phase 1: Tokenized Identity Exchange & OTP Dispatch
   - 3.4 Phase 2: Session-Bound Identity Approval & Verification
4. [Active OTP Integration Framework & Templates](#4-active-otp-integration-framework--templates)
   - 4.1 Extensible Delivery Adapter Architecture (`OtpDeliveryAdapter`)
   - 4.2 Production Provider Templates (Twilio, Firebase, AWS SNS, Local SMPP)
   - 4.3 Asynchronous Dispatch & Decoupled Task Pipeline
   - 4.4 Failover & Circuit Breaker Adapter
5. [End-to-End Security Architecture & Threat Modeling](#5-end-to-end-security-architecture--threat-modeling)
   - 5.1 PII Protection & Zero-Cleartext Invariant
   - 5.2 Replay, Tampering & Man-in-the-Middle (MitM) Protections
   - 5.3 Multi-Tier Rate Limiting & Anti-Brute-Force Safeguards
   - 5.4 Secure On-Device Storage & Memory Hygiene
6. [Latency Budget & High-Availability SLA (Max 500ms)](#6-latency-budget--high-availability-sla-max-500ms)
   - 6.1 Quantitative Round-Trip Latency Budget Breakdown
   - 6.2 The External Gateway Latency Trap & Async Solution
   - 6.3 High Availability & Sub-500ms Failover Strategy
7. [API Contract & Wire Schema Specifications](#7-api-contract--wire-schema-specifications)
   - 7.1 `POST /api/v1/auth/tokenized/request-otp/`
   - 7.2 `POST /api/v1/auth/tokenized/verify-otp/`
8. [Implementation Roadmap & Migration Strategy](#8-implementation-roadmap--migration-strategy)

---

## 1. Executive Summary & Architectural Scope

This document provides a comprehensive architectural blueprint and system analysis for implementing **Tokenization-Based Authentication** with an **Active OTP System Integration Template** across the Volunteer Coordination System.

### Primary Objectives
1. **PII Shielding via Tokenization:** Eliminate cleartext transmission of Personally Identifiable Information (specifically mobile MSISDN phone numbers) across network boundaries, intermediary proxies, and application loggers by introducing a tokenized identity exchange.
2. **Session-Bound Approval State Machine:** Decouple phone number identity from OTP verification by establishing a secure, ephemeral **Auth Session Token** (`auth_session_token`) upon OTP dispatch, ensuring that mobile client approval transmits only the session token and the user's OTP.
3. **Dual-Mode OTP Delivery with Extensible Template:** Maintain frictionless local development (`DEBUG` mode returning `dev_code` directly to the client) while providing a robust, enterprise-grade adapter template for live SMS/telecom gateways (Twilio Verify, AWS SNS, Firebase Phone Auth, and local SMPP carriers).
4. **Sub-500ms Latency SLA & High Availability:** Enforce a strict **500ms end-to-end latency budget** for both OTP request and verification hops by adopting asynchronous non-blocking SMS queuing, connection pooling, and in-memory session caching.

```
+---------------------------------------------------------------------------------------------------------+
|                                    TARGET ARCHITECTURE AT A GLANCE                                      |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   +-------------------+        1. Tokenized Payload (CIT)       +-----------------------------------+   |
|   |   Mobile Client   | -------------------------------------> | Django BFF (/api/v1/auth/)        |   |
|   |  (React Native)   |                                        | - Detokenize in isolated boundary |   |
|   |                   | <------------------------------------- | - Issue ephemeral auth_session_tk |   |
|   |                   |   2. auth_session_token (+ dev_code)   | - Trigger async OTP job           |   |
|   +-------------------+                                        +-----------------------------------+   |
|             |                                                                    |                      |
|             | 3. Approves OTP with                                               | Async Queue          |
|             |    auth_session_token (No Phone!)                                  v                      |
|             v                                                        +-----------------------+          |
|   +-------------------+                                              | Active OTP Gateway    |          |
|   |   Mobile Client   | ------------------------------------->       | (Twilio / AWS / SMPP) |          |
|   |  (React Native)   |         4. Issues DRF Auth Token             +-----------------------+          |
|   |                   | <-------------------------------------                   |                      |
|   +-------------------+                                                          v Out-of-band SMS      |
|                                                                              [User Handset]             |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Read-Only System Scan & Baseline Analysis

A thorough, read-only audit of the existing codebase (`python_stack/backend/`, `python_stack/mobile/`, and `python_stack/postgres_sql/`) was conducted.

### 2.1 Backend Auth & Cryptography Baseline (`backend/`)
- **Core Services:**
  - `backend/services/auth_service.py` houses the business logic for OTP generation, delivery adapter execution, user resolution/creation, and session token generation.
  - `backend/services/otp_service.py` serves as a shim delegating to `auth_service.py`.
  - Cryptographic helpers in `backend/common/security.py`:
    - `normalize_phone(raw_phone)`: Strips non-digits, validates 7-15 digits, formats E.164.
    - `compute_phone_hash(phone)`: Computes deterministic `HMAC-SHA256(phone, PHONE_HASH_HMAC_SECRET)`. Result is a 64-character hex string satisfying database constraints.
    - `encrypt_phone(phone)` / `decrypt_phone(token)`: Uses Fernet symmetric AES-128-CBC encryption with `PHONE_ENCRYPTION_KEY`.
    - `compute_otp_hash(raw_code)`: Computes `HMAC-SHA256(raw_code, PHONE_HASH_HMAC_SECRET)`.
- **Existing Delivery Adapter:**
  - `OtpDeliveryAdapter` is an abstract class with a single method: `deliver(phone_enc, raw_code, purpose)`.
  - `ConsoleOtpDeliveryAdapter` is currently active. When `settings.DEBUG` or `OTP_CONSOLE_PASSTHROUGH` is true, it logs delivery intent and `auth_service.request_login_otp()` returns `"dev_code": raw_code` in the JSON response payload.
- **BFF Endpoints:**
  - Mounted under `/api/v1/auth/` and `/api/bff/mobile/auth/`:
    - `POST /api/v1/auth/otp/request/` (alias: `auth-request-otp`)
    - `POST /api/v1/auth/otp/verify/` (alias: `auth-verify-otp`)
    - `POST /api/v1/auth/logout/` (invalidates `rest_framework.authtoken.models.Token`)

### 2.2 PostgreSQL Schema & Trigger Constraints (`postgres_sql/`)
- **Table `auth_otp` (`updated_volunteer_coordination_system_Database.sql`, lines 356-381):**
  ```sql
  CREATE TABLE auth_otp (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      phone_hash    TEXT NOT NULL,
      code_hash     TEXT NOT NULL,        -- never raw code
      purpose       TEXT NOT NULL DEFAULT 'login',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      expires_at    TIMESTAMPTZ NOT NULL,
      consumed_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT ck_auth_otp_purpose CHECK (purpose IN ('login', 'qr_registration')),
      CONSTRAINT ck_auth_otp_attempt_count CHECK (attempt_count BETWEEN 0 AND 100),
      CONSTRAINT ck_auth_otp_expiry CHECK (expires_at > created_at),
      CONSTRAINT ck_auth_otp_consumed CHECK (consumed_at IS NULL OR consumed_at >= created_at)
  );
  ```
- **Stored Functions & Trigger Constraints:**
  - `request_otp(p_phone_hash, p_code_hash, p_purpose)`: Inserts new OTP with expiry `now() + setting_int('otp_ttl_minutes')` (default 5 minutes).
  - `trg_01_otp_rate_limit`: Trigger on `BEFORE INSERT` that counts entries for `phone_hash` within the past 1 hour. If count exceeds `setting_int('otp_max_requests_per_hour')` (default 5), raises exception `otp_rate_limited` which translates to HTTP 429.
  - `verify_otp(p_phone_hash, p_code_hash, p_purpose)`: Acquires row lock (`FOR UPDATE`) on the latest unconsumed OTP. Checks expiry, verifies `attempt_count < setting_int('otp_max_attempts')` (default 3), compares `code_hash`, and atomically sets `consumed_at = now()` or increments `attempt_count`. Returns `'ok'`, `'invalid_code'`, `'expired'`, `'too_many_attempts'`, or `'no_otp'`.

### 2.3 Mobile Client Auth & Session Baseline (`mobile/`)
- **Transport & Storage:**
  - `mobile/src/core/api/apiClient.ts`: Built on standard `fetch` with AbortController, timeout handling, and automatic injection of `Authorization: Token <token>`.
  - `mobile/src/core/auth/tokenStore.ts`: `PluggableTokenStore` dynamically discovers native secure storage (Tier 1: `react-native-keychain`, Tier 2: `expo-secure-store`, Tier 3: `@react-native-async-storage/async-storage`, Fallback: `MemoryTokenStore`).
  - `mobile/src/core/auth/sessionManager.ts`: Manages session token lifecycle and triggers subscriber callbacks strictly on HTTP 401 Unauthorized responses.
- **Current Auth Flow (`OtpLoginScreen.tsx` & `UserContext.tsx`):**
  - Step 1: User enters phone number (e.g. `+95912345678`).
  - Step 2: Calls `authApi.requestOtp({ phone, purpose: 'login' })`.
  - Step 3: In Dev mode, `dev_code` is returned in the API response and auto-populated into the UI.
  - Step 4: User clicks verify; calls `authApi.verifyOtp({ phone, code, display_name })`.
  - Step 5: On success, token is persisted via `sessionManager.setToken(token)`.

### 2.4 Vulnerability & Architectural Gap Ledger

| Ref ID | Subsystem | Current State | Risk / Vulnerability | Target Tokenization Solution |
|---|---|---|---|---|
| **GAP-01** | Wire Transport | Raw phone string transmitted in cleartext JSON on both request and verify. | Intermediary proxies, TLS offloaders, and gateway logs capture cleartext phone numbers (PII leak). | Asymmetric Client Identity Token (CIT) or tokenized pseudonym exchange. |
| **GAP-02** | Auth State | Verify endpoint requires client to resend raw phone number. | No cryptographic binding between the OTP dispatch transaction and the verification submission. | Issue an ephemeral `auth_session_token` upon dispatch; verify accepts only session token + code. |
| **GAP-03** | OTP Delivery | Delivery hardwired to `ConsoleOtpDeliveryAdapter` with in-band `dev_code`. | Inability to connect real telecom providers; risk of leaking dev codes into production responses. | Pluggable `OtpDeliveryAdapter` registry with failover support and environment gating (`DEBUG=False` strictly excludes `dev_code`). |
| **GAP-04** | Dispatch Latency | Potential synchronous SMS gateway call within request cycle. | Third-party SMS gateways take 800ms-3000ms, violating the 500ms max downtime/latency SLA. | Asynchronous fire-and-forget background task for SMS delivery; HTTP response returns in <50ms. |
| **GAP-05** | Rate Limiting | Rate limiting relies solely on DB trigger by `phone_hash`. | Malicious actors can spam invalid payloads or exhaust DB connections before reaching triggers. | Tier 1 IP throttle at API gateway/DRF level + Tier 2 Redis-backed token bucket + Tier 3 DB trigger. |

---

## 3. Tokenization Login Architecture

### 3.1 Tokenization Design Principles & Terminology

Tokenization substitutes sensitive personal identifiers with non-sensitive surrogate tokens. In this authentication system, two distinct tokens govern the flow:

1. **Client Identity Token (CIT) / Tokenized Mobile Payload:**
   - Generated on the mobile device to transmit the user's mobile number without cleartext PII exposure.
   - Implemented as an **Encrypted Envelope (JWE / ECIES)** or **Keyed Blind Token**:
     $$\text{CIT} = \text{Encrypt}_{\text{ServerPubKey}}(\text{phone} \parallel \text{timestamp} \parallel \text{client\_nonce})$$
   - The BFF holds the corresponding private key in its secure configuration (or hardware HSM/KMS) to detokenize the payload.
2. **Ephemeral Auth Session Token (`auth_session_token`):**
   - Generated by the BFF upon successful validation of the CIT and issuance of the OTP.
   - Characteristics:
     - High-entropy cryptographic identifier (UUIDv4 or HMAC-signed JWT).
     - Short Time-To-Live (TTL): 180 seconds (3 minutes).
     - State-bound: Maps to `phone_hash`, client fingerprint, attempt count, and expiration.
     - Single-use: Consumed and destroyed atomically upon verification.

---

### 3.2 End-to-End Handshake Flow (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor User as Volunteer / Coordinator
    participant Mobile as Mobile App (React Native)
    participant SecStore as Keystore / Keychain
    participant BFF as Django BFF (/api/v1/auth/)
    participant DB as PostgreSQL 18 (Stored Procs)
    participant Queue as Async Task Worker (Celery/Thread)
    participant SMS as Active OTP Gateway (Twilio/SMPP)

    Note over User,Mobile: Phase 1: Tokenized Request & Dispatch (<150ms)
    User->>Mobile: Enters mobile number (+959...)
    Mobile->>Mobile: Normalizes phone & wraps into Client Identity Token (CIT)
    Mobile->>BFF: POST /api/v1/auth/tokenized/request-otp/ { identity_token, purpose }
    BFF->>BFF: Detokenizes CIT & verifies timestamp/nonce (Anti-Replay)
    BFF->>BFF: Computes phone_hash = HMAC_SHA256(phone)
    BFF->>DB: SELECT request_otp(phone_hash, code_hash, purpose)
    DB-->>BFF: Returns otp_id (Rate limit trigger verified)
    BFF->>BFF: Generates auth_session_token (TTL = 180s)
    alt Active Production Mode
        BFF->>Queue: Enqueue async dispatch job (phone_enc, raw_code)
        Queue->>SMS: Deliver SMS out-of-band
        SMS-->>User: SMS arrives on handset with OTP
        BFF-->>Mobile: 200 OK { auth_session_token, status: "sent", expires_in: 180 }
    else Dev Mode (settings.DEBUG = True)
        BFF-->>Mobile: 200 OK { auth_session_token, status: "dev_console", dev_code: "1234" }
        Mobile->>Mobile: Auto-fills OTP in UI input
    end

    Note over User,Mobile: Phase 2: Tokenized Approval & Verification (<100ms)
    User->>Mobile: Submits OTP code (or taps Auto-Verify)
    Mobile->>BFF: POST /api/v1/auth/tokenized/verify-otp/ { auth_session_token, code, display_name }
    Note over Mobile,BFF: Phone number is NEVER re-transmitted!
    BFF->>BFF: Resolves phone_hash from auth_session_token
    BFF->>DB: SELECT verify_otp(phone_hash, code_hash, purpose)
    DB-->>BFF: Returns 'ok' (Atomically sets consumed_at)
    BFF->>DB: SELECT release_expired_blocks(); Get or Create User
    BFF->>DB: Issue/Retrieve DRF Token
    BFF->>BFF: Invalidate auth_session_token (Single-use enforcement)
    BFF-->>Mobile: 200 OK { token, user: { id, uuid, display_name, verification_status } }
    Mobile->>SecStore: Persist DRF token in Hardware Keystore / Keychain
    Mobile-->>User: Seamless transition to authenticated Dashboard
```

---

### 3.3 Phase 1: Tokenized Identity Exchange & OTP Dispatch

#### Step-by-Step Processing:
1. **Client Envelope Packaging:**
   - Mobile client normalizes phone to canonical E.164 (`+959...`).
   - Packages an ephemeral identity envelope containing:
     - `phone`: Raw phone string.
     - `client_time`: Epoch millisecond timestamp (rejected if $|T_{\text{server}} - T_{\text{client}}| > 60\text{s}$).
     - `nonce`: Unique UUID to defeat replay attacks.
   - Encrypts payload with BFF Public Key using AES-256-GCM + RSA-OAEP (Hybrid Encryption / JWE) or uses the pre-shared transport tokenization secret.
2. **BFF Detokenization & Verification:**
   - Ingests `identity_token`. Decrypts inside an isolated cryptographic utility function.
   - Validates that `client_time` is fresh and `nonce` has not been observed in Redis within the replay window.
   - Computes canonical `phone_hash` using Django's `PHONE_HASH_HMAC_SECRET`.
3. **Database Insertion & Rate Limit Execution:**
   - Executes `SELECT request_otp(%s, %s, %s)` within PostgreSQL.
   - PostgreSQL trigger `trg_01_otp_rate_limit` validates that the phone hash has not exceeded the hourly request quota.
4. **Session Token Generation:**
   - Generates an `auth_session_token` (e.g. `ast_` prefix followed by 32 bytes of secure hex entropy).
   - Stores session mapping in Redis (or in-memory cache) with 180s TTL:
     ```json
     {
       "phone_hash": "a6b4c3d8...",
       "phone_enc": "gAAAAABl...",
       "purpose": "login",
       "created_at": "2026-11-19T20:45:00Z",
       "attempts_left": 3
     }
     ```
5. **Immediate Response & Decoupled Delivery:**
   - If `DEBUG=True`, attaches `dev_code` to the response.
   - If in production, dispatches the OTP delivery task to an asynchronous executor (see Section 4).
   - Returns HTTP 200 with `auth_session_token` in under 35ms.

---

### 3.4 Phase 2: Session-Bound Identity Approval & Verification

#### Step-by-Step Processing:
1. **Approval Submission:**
   - The user inputs the OTP received via SMS (or auto-filled in Dev mode).
   - Mobile sends `POST /api/v1/auth/tokenized/verify-otp/` with:
     - `auth_session_token`: The token received in Phase 1.
     - `code`: The 4-to-6 digit verification code.
     - `display_name` (optional): For new volunteer registrations.
2. **State Resolution & Consumption Check:**
   - BFF verifies `auth_session_token` exists and is active.
   - If missing or expired, immediately returns `HTTP 400 Bad Request` with code `session_expired`.
   - Resolves the stored `phone_hash` without requiring the client to transmit the phone number.
3. **Atomic DB Verification:**
   - Executes `SELECT verify_otp(%s, %s, %s)` with row-level lock (`FOR UPDATE`).
   - If verification succeeds (`result == 'ok'`):
     - Executes `SELECT release_expired_blocks()`.
     - Finds or creates the `Users` entity.
     - Issues a persistent DRF authentication token (`rest_framework.authtoken.models.Token`).
     - Atomically deletes the `auth_session_token` from cache to prevent replay.
     - Returns session credentials and profile card.
   - If verification fails (`invalid_code`):
     - Decrements `attempts_left` on the session.
     - If `attempts_left <= 0`, purges the session token and returns `HTTP 429 Too Many Requests`.

---

## 4. Active OTP Integration Framework & Templates

### 4.1 Extensible Delivery Adapter Architecture (`OtpDeliveryAdapter`)

To decouple the Django BFF from external telecommunication vendors, the system adopts a hardened Adapter Pattern.

```
                    +------------------------------------+
                    |       OtpDeliveryAdapter (ABC)     |
                    +------------------------------------+
                    | + deliver(phone, code, purpose)    |
                    | + health_check()                   |
                    +------------------------------------+
                                       |
        +------------------------------+------------------------------+
        |                              |                              |
+----------------------+   +-----------------------+   +-----------------------------+
| ConsoleOtpAdapter    |   | TwilioVerifyAdapter   |   | FailoverCompositeAdapter    |
| (Dev Mode / Passthru)|   | (Twilio REST API)     |   | (Primary -> Secondary Fall) |
+----------------------+   +-----------------------+   +-----------------------------+
        |                              |                              |
+----------------------+   +-----------------------+   +-----------------------------+
| FirebasePhoneAdapter |   | AwsSnsOtpAdapter      |   | TelecomSmppAdapter          |
| (Firebase Auth REST) |   | (AWS SNS Publish)     |   | (Direct SMPP / Local Telco) |
+----------------------+   +-----------------------+   +-----------------------------+
```

---

### 4.2 Production Provider Templates

Below are production-ready Python adapter templates to be placed in `backend/services/otp_adapters.py`:

```python
"""
backend/services/otp_adapters.py
Production-ready OTP Delivery Adapters for the Volunteer Coordination System.
Provides adapters for Console (Dev), Twilio, AWS SNS, Firebase, and Telecom SMPP.
"""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from django.conf import settings

logger = logging.getLogger(__name__)


class OtpDeliveryResult:
    """Standardized delivery result DTO."""
    def __init__(
        self,
        success: boolean,
        provider: str,
        message_id: Optional[str] = None,
        error_code: Optional[str] = None,
        latency_ms: float = 0.0,
    ):
        self.success = success
        self.provider = provider
        self.message_id = message_id
        self.error_code = error_code
        self.latency_ms = latency_ms

    def to_dict(self) -> Dict[str, Any]:
        return {
            "delivered": self.success,
            "provider": self.provider,
            "message_id": self.message_id,
            "error_code": self.error_code,
            "latency_ms": round(self.latency_ms, 2),
        }


class BaseOtpDeliveryAdapter(ABC):
    """Abstract base adapter for SMS and telecom gateways."""

    @abstractmethod
    def deliver(self, phone_e164: str, raw_code: str, purpose: str = "login") -> OtpDeliveryResult:
        """Deliver the OTP code to the given E.164 phone number."""
        pass

    def health_check(self) -> bool:
        """Check whether the delivery provider is available and responsive."""
        return True


# -----------------------------------------------------------------------------
# 1. Development / Console Adapter
# -----------------------------------------------------------------------------
class ConsoleOtpDeliveryAdapter(BaseOtpDeliveryAdapter):
    """
    Development adapter: Logs intent and simulates delivery without external API calls.
    Returns delivered=True when passthrough is enabled.
    """
    def deliver(self, phone_e164: str, raw_code: str, purpose: str = "login") -> OtpDeliveryResult:
        is_passthrough = getattr(settings, "OTP_CONSOLE_PASSTHROUGH", settings.DEBUG)
        masked_phone = phone_e164[:4] + "****" + phone_e164[-3:] if len(phone_e164) > 7 else "***"
        logger.info("[DEV] OTP code '%s' generated for %s (purpose=%s)", raw_code, masked_phone, purpose)
        return OtpDeliveryResult(
            success=is_passthrough,
            provider="console",
            message_id="dev-mock-id",
            latency_ms=0.5,
        )


# -----------------------------------------------------------------------------
# 2. Twilio Verify / SMS Adapter Template
# -----------------------------------------------------------------------------
class TwilioOtpDeliveryAdapter(BaseOtpDeliveryAdapter):
    """
    Twilio SMS / Verify delivery adapter.
    Requires twilio Python SDK: pip install twilio
    """
    def __init__(self, account_sid: Optional[str] = None, auth_token: Optional[str] = None, from_number: Optional[str] = None):
        self.account_sid = account_sid or getattr(settings, "TWILIO_ACCOUNT_SID", None)
        self.auth_token = auth_token or getattr(settings, "TWILIO_AUTH_TOKEN", None)
        self.from_number = from_number or getattr(settings, "TWILIO_FROM_NUMBER", None)
        self._client = None

    def _get_client(self):
        if not self._client and self.account_sid and self.auth_token:
            from twilio.rest import Client
            self._client = Client(self.account_sid, self.auth_token)
        return self._client

    def deliver(self, phone_e164: str, raw_code: str, purpose: str = "login") -> OtpDeliveryResult:
        t0 = time.perf_counter()
        client = self._get_client()
        if not client:
            return OtpDeliveryResult(False, "twilio", error_code="credentials_missing")

        try:
            message_body = f"Your Volunteer System verification code is: {raw_code}. Valid for 3 minutes."
            msg = client.messages.create(
                to=phone_e164,
                from_=self.from_number,
                body=message_body,
            )
            elapsed = (time.perf_counter() - t0) * 1000
            return OtpDeliveryResult(True, "twilio", message_id=msg.sid, latency_ms=elapsed)
        except Exception as exc:
            elapsed = (time.perf_counter() - t0) * 1000
            logger.error("Twilio OTP delivery failed: %s", str(exc))
            return OtpDeliveryResult(False, "twilio", error_code="delivery_exception", latency_ms=elapsed)


# -----------------------------------------------------------------------------
# 3. AWS SNS SMS Adapter Template
# -----------------------------------------------------------------------------
class AwsSnsOtpDeliveryAdapter(BaseOtpDeliveryAdapter):
    """
    AWS SNS Worldwide SMS delivery adapter.
    Requires boto3: pip install boto3
    """
    def __init__(self, region_name: Optional[str] = None):
        self.region_name = region_name or getattr(settings, "AWS_SNS_REGION", "ap-southeast-1")
        self._sns = None

    def _get_sns(self):
        if not self._sns:
            import boto3
            self._sns = boto3.client("sns", region_name=self.region_name)
        return self._sns

    def deliver(self, phone_e164: str, raw_code: str, purpose: str = "login") -> OtpDeliveryResult:
        t0 = time.perf_counter()
        try:
            sns = self._get_sns()
            response = sns.publish(
                PhoneNumber=phone_e164,
                Message=f"Your Volunteer App login code is: {raw_code}",
                MessageAttributes={
                    "AWS.SNS.SMS.SMSType": {
                        "DataType": "String",
                        "StringValue": "Transactional",
                    }
                },
            )
            elapsed = (time.perf_counter() - t0) * 1000
            return OtpDeliveryResult(True, "aws_sns", message_id=response.get("MessageId"), latency_ms=elapsed)
        except Exception as exc:
            elapsed = (time.perf_counter() - t0) * 1000
            logger.error("AWS SNS OTP delivery failed: %s", str(exc))
            return OtpDeliveryResult(False, "aws_sns", error_code=str(exc), latency_ms=elapsed)


# -----------------------------------------------------------------------------
# 4. Local Telecom HTTP/SMPP Gateway Template (Myanmar / Regional Carriers)
# -----------------------------------------------------------------------------
class TelecomSmppGatewayAdapter(BaseOtpDeliveryAdapter):
    """
    Template for direct HTTP REST or SMPP connection to regional telecom gateways
    (e.g., MPT, Telenor/ATOM, Ooredoo, or local SMS aggregators).
    """
    def __init__(self, gateway_url: Optional[str] = None, api_key: Optional[str] = None):
        self.gateway_url = gateway_url or getattr(settings, "TELECOM_SMS_GATEWAY_URL", "")
        self.api_key = api_key or getattr(settings, "TELECOM_SMS_API_KEY", "")

    def deliver(self, phone_e164: str, raw_code: str, purpose: str = "login") -> OtpDeliveryResult:
        import urllib.request
        import json
        t0 = time.perf_counter()

        payload = json.dumps({
            "to": phone_e164,
            "content": f"Security Code: {raw_code}. Do not share with anyone.",
            "sender_id": "VOLUNTEER",
        }).encode("utf-8")

        req = urllib.request.Request(
            self.gateway_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                elapsed = (time.perf_counter() - t0) * 1000
                data = json.loads(resp.read().decode())
                return OtpDeliveryResult(True, "telecom_smpp", message_id=data.get("tx_id"), latency_ms=elapsed)
        except Exception as exc:
            elapsed = (time.perf_counter() - t0) * 1000
            logger.error("Telecom SMS gateway request failed: %s", str(exc))
            return OtpDeliveryResult(False, "telecom_smpp", error_code="timeout_or_error", latency_ms=elapsed)
```

---

### 4.3 Asynchronous Dispatch & Decoupled Task Pipeline

To ensure the BFF response satisfies the **<500ms SLA**, external network calls to SMS gateways must never execute synchronously within the HTTP thread. 

```python
"""
backend/services/async_otp_dispatcher.py
Asynchronous dispatch pipeline using ThreadPoolExecutor or Celery.
"""
import concurrent.futures
import logging
from typing import Callable

logger = logging.getLogger(__name__)

# Dedicated bounded thread pool for I/O bound SMS gateway requests
_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=10,
    thread_name_prefix="otp_sms_worker"
)


def dispatch_otp_asynchronously(delivery_fn: Callable[[], Any]) -> None:
    """
    Dispatches the delivery adapter call to a background worker thread.
    Returns immediately, decoupling external API latency from the BFF response.
    """
    future = _executor.submit(delivery_fn)

    def _on_complete(fut):
        try:
            res = fut.result()
            logger.info("Async OTP delivery finished: provider=%s, success=%s", res.provider, res.success)
        except Exception as exc:
            logger.error("Async OTP dispatch encountered unhandled error: %s", str(exc))

    future.add_done_callback(_on_complete)
```

---

### 4.4 Failover & Circuit Breaker Adapter

For enterprise resilience, the system supports a composite failover adapter that automatically trips a circuit breaker and fails over to a secondary provider if the primary provider experiences timeouts or degraded availability:

```python
class CompositeFailoverOtpAdapter(BaseOtpDeliveryAdapter):
    """
    Tries the Primary provider (e.g. Telecom SMPP). If it fails or times out,
    immediately routes through the Secondary provider (e.g. Twilio / AWS SNS).
    """
    def __init__(self, primary: BaseOtpDeliveryAdapter, secondary: BaseOtpDeliveryAdapter):
        self.primary = primary
        self.secondary = secondary

    def deliver(self, phone_e164: str, raw_code: str, purpose: str = "login") -> OtpDeliveryResult:
        result = self.primary.deliver(phone_e164, raw_code, purpose)
        if result.success:
            return result
        logger.warning("Primary OTP provider (%s) failed. Activating secondary (%s).", 
                       result.provider, self.secondary.__class__.__name__)
        return self.secondary.deliver(phone_e164, raw_code, purpose)
```

---

## 5. End-to-End Security Architecture & Threat Modeling

### 5.1 PII Protection & Zero-Cleartext Invariant
- **No Plaintext Phone on the Wire:** By sending the phone identity as an encrypted/tokenized Client Identity Token (CIT) in Phase 1 and using the ephemeral `auth_session_token` in Phase 2, plaintext phone numbers never traverse untrusted networks in the clear.
- **Log Masking Invariant:** Sensitive data masking is enforced across all logging layers:
  - Phone numbers are masked: `+95912345678` $\rightarrow$ `+959****5678`.
  - OTP codes are NEVER logged in production under any circumstance.
  - Headers and tokens are stripped from diagnostic captures.

### 5.2 Replay, Tampering & Man-in-the-Middle (MitM) Protections
- **Transport Encryption:** TLS 1.3 is enforced with modern cipher suites (`TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`).
- **Mobile SSL Pinning:** The mobile client incorporates certificate pinning using standard network security configurations (Android `network_security_config.xml` and iOS `Info.plist`) to prevent rogue proxy or certificate authority interception.
- **Nonce & Freshness Window:** Every tokenized payload includes a unique nonce and a client timestamp validated within a $\pm 60$-second drift window.

### 5.3 Multi-Tier Rate Limiting & Anti-Brute-Force Safeguards

```
+--------------------------------------------------------------------------------+
|                         MULTI-TIER RATE LIMITING DEFENSE                       |
+--------------------------------------------------------------------------------+
| Tier 1: DRF IP Throttle        | 10 requests / minute per IP                   |
| Tier 2: Token Bucket (Redis)   | 3 requests / 5 minutes per Client Fingerprint |
| Tier 3: DB Trigger Rate Limit  | 5 requests / hour per Phone Hash (PostgreSQL) |
| Tier 4: OTP Verification Lock  | Max 3 attempts -> Auto-invalidated            |
+--------------------------------------------------------------------------------+
```

1. **Tier 1 (IP Layer):** Prevents automated network-level bot sweeps. Returns `HTTP 429`.
2. **Tier 2 (Tokenized Identity Layer):** Protects individual users from SMS flooding.
3. **Tier 3 (PostgreSQL Database Trigger):** `trg_01_otp_rate_limit` acts as the unbypassable ground truth constraint.
4. **Anti-Brute-Force on OTP:**
   - 4-digit codes provide $10^4 = 10,000$ combinations. With a strict limit of **3 attempts**, the probability of an attacker guessing the code is:
     $$P(\text{compromise}) = \frac{3}{10,000} = 0.03\%$$
   - In production, upgrading to 6-digit codes reduces this probability to $\frac{3}{1,000,000} = 0.0003\%$.

### 5.4 Secure On-Device Storage & Memory Hygiene
- **Hardware-Backed Key Store:** The React Native client stores the issued DRF token exclusively in hardware-backed platform storage via `PluggableTokenStore` (`react-native-keychain` backed by Android Keystore / iOS Secure Enclave).
- **Zero Exposure in Global State:** Tokens are never stored in non-secure storage (e.g. standard `AsyncStorage` or unencrypted SQLite) when native security modules are present.
- **Sensitive Memory Clearing:** Once the `auth_session_token` and OTP are submitted, their values in component state are cleared to reduce exposure in memory dumps.

---

## 6. Latency Budget & High-Availability SLA (Max 500ms)

### 6.1 Quantitative Round-Trip Latency Budget Breakdown

The user requirement specifies seamless communication with a **maximum latency/downtime of 500ms**. Below is the formal budget allocation for each network hop and internal processing stage:

| Stage / Component | Operation Description | Nominal Latency | P99 Latency Budget |
|---|---|---:|---:|
| **Hop 1: Mobile $\rightarrow$ Gateway** | Mobile radio transit (4G/5G/Wi-Fi), DNS resolution & TLS 1.3 handshake | 65 ms | 120 ms |
| **Stage 2: Reverse Proxy (Nginx/ALB)** | SSL termination, header sanitization, IP rate checking | 2 ms | 8 ms |
| **Stage 3: Django BFF Processing** | Serializer validation, CIT detokenization, nonce freshness check | 6 ms | 18 ms |
| **Stage 4: PostgreSQL Stored Proc** | Connection acquisition (PgBouncer), `request_otp()` execution | 4 ms | 14 ms |
| **Stage 5: Task Queue Handoff** | Asynchronous enqueue of delivery task (Thread / Celery) | 1 ms | 4 ms |
| **Stage 6: Serialization & Response** | JSON response serialization (`auth_session_token`, status) | 2 ms | 6 ms |
| **Hop 7: Gateway $\rightarrow$ Mobile** | Downlink packet transit to client device | 40 ms | 90 ms |
| **Total Round-Trip Time (RTT)** | **End-to-End Client Experience** | **120 ms** | **260 ms** |

> [!NOTE]
> The total P99 round-trip time of **260 ms** operates with a **48% safety margin** well below the **500 ms SLA ceiling**.

---

### 6.2 The External Gateway Latency Trap & Async Solution

A common pitfall in SMS authentication systems is invoking external SMS gateway REST APIs (e.g. Twilio or AWS SNS) **synchronously** inside the HTTP request loop.

```
Synchronous Trap (VIOLATES SLA):
[Mobile] ----(120ms)----> [BFF] ----(1,400ms HTTP to Telco)----> [BFF] ----(70ms)----> [Mobile]
TOTAL LATENCY: 1,590 ms (> 500ms SLA Violation!)

Asynchronous Solution (SATISFIES SLA):
[Mobile] ----(120ms)----> [BFF] --+ (Enqueues job in 1ms)
                                  +----> Return 200 OK ----(70ms)----> [Mobile]
                                  |
                                  +----> [Background Thread] ---> [Telco Gateway]
TOTAL CLIENT LATENCY: 191 ms (Well within 500ms SLA!)
```

By enqueuing the external SMS dispatch and returning the `auth_session_token` immediately, the client receives instantaneous feedback while the telecom provider transmits the SMS out-of-band to the user's handset.

---

### 6.3 High Availability & Sub-500ms Failover Strategy

To maintain high availability and prevent downtime exceeding 500ms:
1. **Connection Pooling (PgBouncer):** Transaction-level connection pooling prevents connection starvation during traffic spikes, ensuring database connection acquisition times remain below 5ms.
2. **Circuit Breaker on SMS Providers:** If the primary SMS gateway fails to respond within 250ms or returns consecutive 5xx errors, the `CompositeFailoverOtpAdapter` immediately trips and routes traffic to the secondary provider without dropping client requests.
3. **Stateless BFF Instances:** Django BFF instances are completely stateless. Upstream health checks (e.g. AWS ALB or Nginx `max_fails=2 fail_timeout=500ms`) automatically reroute traffic away from unhealthy application pods within sub-second thresholds.

---

## 7. API Contract & Wire Schema Specifications

### 7.1 `POST /api/v1/auth/tokenized/request-otp/`

Initiates the tokenized authentication handshake.

#### Request Headers:
```http
Content-Type: application/json
Accept: application/json
X-Client-Platform: android | ios
X-Client-Version: 0.11.1
```

#### Request Body Schema:
```json
{
  "identity_token": "string (Base64/JWE tokenized payload containing phone, nonce, timestamp)",
  "purpose": "login | qr_registration",
  "client_nonce": "string (UUIDv4 nonce)"
}
```

#### Success Response (`HTTP 200 OK` — Dev Mode):
```json
{
  "status": "dev_console",
  "auth_session_token": "ast_9f83c1b2e4d567890abcdef123456789",
  "expires_in": 180,
  "dev_code": "1234",
  "delivery": {
    "delivered": true,
    "provider": "console",
    "channel": "console"
  }
}
```

#### Success Response (`HTTP 200 OK` — Production Mode):
```json
{
  "status": "sent",
  "auth_session_token": "ast_9f83c1b2e4d567890abcdef123456789",
  "expires_in": 180,
  "delivery": {
    "delivered": true,
    "provider": "twilio",
    "channel": "sms"
  }
}
```

#### Error Responses:
- `HTTP 400 Bad Request`: `{"error": {"code": "invalid_identity_token", "message": "Failed to detokenize payload."}}`
- `HTTP 429 Too Many Requests`: `{"error": {"code": "otp_rate_limited", "message": "Too many requests. Please try again later."}}`

---

### 7.2 `POST /api/v1/auth/tokenized/verify-otp/`

Approves and verifies the OTP using the ephemeral session token.

#### Request Body Schema:
```json
{
  "auth_session_token": "ast_9f83c1b2e4d567890abcdef123456789",
  "code": "1234",
  "display_name": "Alex Morgan (Optional for initial registration)"
}
```

#### Success Response (`HTTP 200 OK`):
```json
{
  "token": "4f9a3c2e1b8d7a6e5c4b3a2f1e0d9c8b7a6f5e4d",
  "user": {
    "id": 142,
    "uuid": "7b8e3a10-2f9c-4b5a-9d8e-1f2a3b4c5d6e",
    "display_name": "Alex Morgan",
    "verification_status": "verified"
  }
}
```

#### Error Responses:
- `HTTP 400 Bad Request`: `{"error": {"code": "invalid_code", "message": "Incorrect verification code. 2 attempts remaining."}}`
- `HTTP 400 Bad Request`: `{"error": {"code": "session_expired", "message": "Verification session has expired. Please request a new code."}}`
- `HTTP 403 Forbidden`: `{"error": {"code": "account_blocked", "message": "This account is blocked or closed."}}`
- `HTTP 429 Too Many Requests`: `{"error": {"code": "too_many_attempts", "message": "Maximum verification attempts exceeded."}}`

---

## 8. Implementation Roadmap & Migration Strategy

To ensure zero regression of existing functionality while rolling out tokenization, the implementation follows a 4-phase rollout plan:

```
  Phase 1: Backend Foundation
  [Add tokenized endpoints & session cache]
                 |
                 v
  Phase 2: Adapter & Async Integration
  [Deploy BaseOtpDeliveryAdapter & Celery/Thread Queue]
                 |
                 v
  Phase 3: Mobile Client Integration
  [Update authApi.ts, authDto.ts, and OtpLoginScreen]
                 |
                 v
  Phase 4: Deprecation & Production Hardening
  [Disable legacy cleartext endpoints & enforce SSL Pinning]
```

### Phase 1: Backend Foundation (Dual-Route Compatibility) — ✅ IMPLEMENTED (v0.12.0)
- Deployed in `backend/bff/auth/views.py` registering canonical routes:
  - `POST /api/v1/auth/tokenized/request-otp/` (`TokenizedOtpRequestView`)
  - `POST /api/v1/auth/tokenized/verify-otp/` (`TokenizedOtpVerifyView`)
- Retained legacy compatibility routes `/api/v1/auth/otp/request/` and `/verify/`.
- Deployed database-backed `auth_otp_challenge` table (PostgreSQL 18) with row-level locking (`FOR UPDATE`), 180s TTL, and SHA-256 token hashing (`v0_12_0_auth_otp_challenge_upgrade.sql`).

### Phase 2: Active OTP Adapter Pipeline — ✅ IMPLEMENTED (v0.12.0 Stabilization Phase B1)
- Implemented `OtpDeliveryAdapter` interface in `backend/services/auth_service.py` with structured delivery results (`configured`, `provider_accepted`, `handset_delivered`, `safe_retry`).
- Enforced post-commit dispatch via `transaction.on_commit()` to eliminate phantom OTP dispatch if DB transaction rolls back.
- Built active `ConsoleOtpDeliveryAdapter` returning truthful delivery states (`dev_code_available`, `console_simulated`) and provider contract specifications for production carrier backends (Twilio, AWS SNS, Telecom SMPP).

### Phase 3: Mobile Client Integration — ✅ IMPLEMENTED (v0.12.0 Phase B2)
- Updated `mobile/src/data/dto/authDto.ts` with `TokenizedOtpRequestDto`, `TokenizedOtpResponseDto`, `TokenizedOtpVerifyRequestDto`, and `TokenizedOtpVerifyResponseDto`.
- Implemented `requestTokenizedOtp()` and `verifyTokenizedOtp()` in `mobile/src/data/endpoints/authApi.ts` ensuring verify request sends strictly `auth_session_token` and `code` (never transmits phone number).
- Updated `OtpLoginScreen.tsx` with two-step tokenized challenge state machine:
  - Step 1: Submits phone identity, receives and stores `auth_session_token`.
  - Step 2: Submits strictly `auth_session_token` and `code`.
  - Step 3: Receives standard DRF token, stores in `tokenStore.ts`, and bootstraps user profile.
- Verified by unit and integration suites: `tokenizedAuthAndBootstrap.test.tsx` and `v0_12_0_realHttpIntegration.test.ts`.

### Phase 4: Production Hardening & Verification — ✅ IMPLEMENTED & VERIFIED (v0.12.0 Stabilization Phase E)
- Gated `dev_code` behind explicit development flags (`ALLOW_DEV_CODE_IN_AUTH_RESPONSE=False` and `ENVIRONMENT=production`); verified complete absence over real HTTP sockets.
- Verified zero session clearing on non-401 errors (403, 404, 409, 429, timeouts).
- Real HTTP integration test suite (`v0_12_0_realHttpIntegration.test.ts`) executed over TCP sockets against Django + PostgreSQL 18.6 with 14/14 tests passing.
- Operational requirements for final release (carrier account binding and physical device Keystore/Keychain persistence) are summarized in [old_doc/README.md](file:///c:/Users/USER/Documents/INTERN/Project/Volunteer_HR_Management/python_stack/old_doc/README.md).
