# Verification Image Encryption Key Management & Operations Runbook

**Specification Reference:** Section 5.7, `V0_12_0_STABILIZATION_MASTER_PLAN.md`  
**Security Boundary:** Server-Side Encrypted Verification Media Storage (`VERIFICATION_MEDIA_ROOT`)  
**Algorithm:** AES-256-GCM authenticated encryption with 96-bit cryptographically unique nonces  

---

## 1. Overview & Threat Model

Server-side verification images (e.g. volunteer ID/driver licenses and verification selfies) must never be stored in plaintext on disk or committed into PostgreSQL. 

### Core Architectural Guardrails:
1. **Zero Database Image Storage:** Database tables (`user_verification_images`) store only metadata (`image_path`, `file_format='jpeg'`, `file_sha256`), never image binary blobs or encryption parameters.
2. **Private Storage Isolation:** Images reside strictly within `VERIFICATION_MEDIA_ROOT` (outside public `MEDIA_ROOT` and static web assets). Direct web server access is forbidden.
3. **In-Memory Streaming Only:** Admin viewers decrypt verification images in memory upon authorization; decrypted bytes are never persisted to disk or cache.
4. **Zero Secret/PII Leakage:** Keys, nonces, raw file paths, hashes, and image bytes are never logged.

---

## 2. Environment Variables & Key Generation

The verification image subsystem requires three environment variables:

| Variable | Description | Example / Format |
|---|---|---|
| `VERIFICATION_IMAGE_ENCRYPTION_KEY` | 32-byte active AES-256 key | 44-character URL-safe Base64 string |
| `VERIFICATION_IMAGE_KEY_ID` | Identifier for the active key | `v1`, `v2`, `prod-2026-key1` |
| `VERIFICATION_IMAGE_KEYRING` | JSON dictionary of key IDs to 32-byte keys | `{"v1": "<key1_b64>", "v2": "<key2_b64>"}` |

### Generating a Secure 256-bit Key:
```bash
python -c "from cryptography.hazmat.primitives.ciphers.aead import AESGCM; import base64; print(base64.urlsafe_b64encode(AESGCM.generate_key(bit_length=256)).decode())"
```

---

## 3. Cryptographic Key Separation

`VERIFICATION_IMAGE_ENCRYPTION_KEY` must be completely independent from:
- `PHONE_ENCRYPTION_KEY` (Fernet)
- `PHONE_HASH_HMAC_SECRET` (HMAC-SHA256)
- `OTP_CODE_HMAC_SECRET` (HMAC-SHA256)
- `AUTH_SESSION_TOKEN_SECRET` (HMAC-SHA256)
- Django `SECRET_KEY`

Reusing any of the above secrets for image encryption is strictly forbidden and rejected at application startup with `ImproperlyConfigured`.

---

## 4. Production Startup Validation

In `backend/config/settings/production.py`:
1. `VERIFICATION_IMAGE_ENCRYPTION_KEY` is checked to ensure it is not empty and does not use the default insecure development key fallback.
2. The key is verified to be pairwise distinct from all other cryptographic keys in the system.
3. The image crypto module executes an in-memory encrypt/decrypt/tamper self-test to verify crypto primitives before serving requests.

---

## 5. Key Rotation Procedure

To rotate the active encryption key without service interruption or database schema modifications:

### Step 1: Generate New Key
Generate a new 32-byte key for the next version (e.g. `v2`):
```bash
NEW_KEY=$(python -c "from cryptography.hazmat.primitives.ciphers.aead import AESGCM; import base64; print(base64.urlsafe_b64encode(AESGCM.generate_key(256)).decode())")
```

### Step 2: Update Configuration with Dual-Key Ring
Add the new key to `VERIFICATION_IMAGE_KEYRING` alongside existing keys, and set the new key as active:
```bash
export VERIFICATION_IMAGE_KEYRING='{"v1": "<old_key>", "v2": "'"$NEW_KEY"'"}'
export VERIFICATION_IMAGE_KEY_ID="v2"
export VERIFICATION_IMAGE_ENCRYPTION_KEY="$NEW_KEY"
```
*At this stage, new image uploads are encrypted under `v2`, while legacy images encrypted under `v1` continue to decrypt seamlessly via the keyring.*

### Step 3: Run In-Place Re-encryption
Execute the conversion command with backup confirmation:
```bash
# 1. Take protected backup first
# 2. Run conversion to upgrade v1 files to v2 in-place:
python backend/manage.py encrypt_verification_images --apply --confirm-backup
```

### Step 4: Verify All Files
Run the post-conversion audit:
```bash
python backend/manage.py encrypt_verification_images --verify-only
```
Ensure that all files decrypt cleanly and match their stored `file_sha256`.

### Step 5: Retire Old Key
Once verification passes and all backups are accounted for, remove `v1` from `VERIFICATION_IMAGE_KEYRING`.

---

## 6. Backup & Disaster Recovery

1. **Independent Backups:**
   - Image files in `VERIFICATION_MEDIA_ROOT` must be backed up to an encrypted volume with restricted access.
   - Encryption keys must be stored in an enterprise secret manager (e.g. AWS Secrets Manager, GCP Secret Manager, Vault) and backed up separately from the encrypted disk files.
2. **Access Control:**
   - Only the web application user and designated backup service accounts may read `VERIFICATION_MEDIA_ROOT`.
3. **Disaster Recovery Testing:**
   - Regularly verify recovery by restoring a backup to a sandbox directory and running:
     ```bash
     python backend/manage.py encrypt_verification_images --verify-only --media-root /path/to/restored/sandbox
     ```
4. **Secure Erasure of Plaintext Backups:**
   - Plaintext backups or temporary artifacts must be wiped using cryptographic secure-erase tools (`shred` or OS-equivalent).
   - Never leave plaintext copies in public media, temp folders, or CI build artifacts.

