"""
Management command to audit and convert verification images to AES-256-GCM in place.

Implements Section 5.6 of V0_12_0_STABILIZATION_MASTER_PLAN.md:
- Default to strictly read-only --dry-run reporting aggregate statistics.
- Requires --apply --confirm-backup before performing any disk modifications.
- Converts files in place using same-directory temp file + atomic replace.
- Preserves DB image_path with zero database modifications.
- Verifies already-encrypted envelopes without double-encrypting.
- Reports missing/corrupt files without deleting DB rows.
- Provides --verify-only read-only post-conversion audit.
- Zero secret/PII/path leakage: reports only aggregate counts.
"""

import hashlib
import os
import uuid
from pathlib import Path
from typing import Dict, List, Set

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import UserVerificationImages
from common.image_crypto import (
    ImageCryptoError,
    ImageDecryptionError,
    InvalidEnvelopeError,
    KeyNotFoundError,
    decrypt_image,
    encrypt_image,
    get_key_ring,
    is_encrypted_envelope,
    is_plaintext_jpeg,
    run_crypto_self_test,
)


class Command(BaseCommand):
    help = (
        "Audit and convert verification images to AES-256-GCM in place. "
        "Defaults to read-only --dry-run reporting aggregate counts with zero PII or paths."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Perform a strictly read-only aggregate inventory (default if no other action specified).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Execute in-place conversion. Requires explicit --confirm-backup.",
        )
        parser.add_argument(
            "--confirm-backup",
            action="store_true",
            default=False,
            help="Explicit confirmation that a protected, verified backup of VERIFICATION_MEDIA_ROOT exists.",
        )
        parser.add_argument(
            "--single-test-id",
            type=int,
            default=None,
            help="Convert only a single image ID to validate before running a full conversion batch.",
        )
        parser.add_argument(
            "--verify-only",
            action="store_true",
            default=False,
            help="Perform a read-only post-conversion audit verifying all DB-referenced files are encrypted and valid.",
        )
        parser.add_argument(
            "--media-root",
            type=str,
            default=None,
            help="Override the verification media root directory (useful for tests and staging).",
        )

    def handle(self, *args, **options):
        is_apply = options.get("apply", False)
        confirm_backup = options.get("confirm_backup", False)
        is_verify_only = options.get("verify_only", False)
        single_test_id = options.get("single_test_id")
        media_root_override = options.get("media_root")

        # Determine mode
        is_dry_run = not is_apply and not is_verify_only

        # Safety gate: --apply requires --confirm-backup
        if is_apply and not confirm_backup:
            raise CommandError(
                "SAFETY REFUSAL: --apply requires explicit --confirm-backup confirming that an "
                "operator-verified protected backup of the image directory exists."
            )

        # Resolve media root
        if media_root_override:
            media_root = Path(media_root_override).resolve()
        else:
            media_root = Path(settings.VERIFICATION_MEDIA_ROOT).resolve()

        if not media_root.exists() or not media_root.is_dir():
            raise CommandError(
                "Configured verification media root directory does not exist or is not a directory."
            )

        # Mandatory crypto self-test before any operation
        try:
            run_crypto_self_test()
        except Exception as e:
            raise CommandError(f"Cryptographic self-test failed: {type(e).__name__}. Refusing execution.")

        key_ring = get_key_ring()

        # Query DB records
        if single_test_id is not None:
            records = UserVerificationImages.objects.filter(id=single_test_id)
            if not records.exists():
                raise CommandError(f"Target record ID {single_test_id} not found in database.")
        else:
            records = UserVerificationImages.objects.all()

        db_rows_total = records.count()

        # Collect all files on disk under media root
        disk_files: List[Path] = [f for f in media_root.rglob("*") if f.is_file() and not f.name.startswith(".tmp_")]
        disk_files_total = len(disk_files)
        disk_file_paths_normalized: Set[str] = {
            os.path.normpath(str(f.relative_to(media_root))) for f in disk_files
        }

        # Initialize counters
        referenced_files_found = 0
        plaintext_jpegs_count = 0
        already_encrypted_count = 0
        missing_files_count = 0
        corrupt_files_count = 0
        converted_count = 0
        verified_valid_count = 0
        hash_mismatch_count = 0
        total_scanned_bytes = 0
        largest_file_bytes = 0

        referenced_disk_paths: Set[str] = set()

        mode_label = "DRY-RUN (READ-ONLY)"
        if is_verify_only:
            mode_label = "POST-CONVERSION AUDIT (READ-ONLY)"
        elif is_apply:
            mode_label = "APPLY IN-PLACE CONVERSION"

        self.stdout.write(f"=== Verification Image Conversion Utility: {mode_label} ===")

        for rec in records:
            if not rec.image_path:
                missing_files_count += 1
                continue

            # Path traversal guard
            try:
                target_file = (media_root / rec.image_path).resolve()
                if not target_file.is_relative_to(media_root):
                    missing_files_count += 1
                    continue
            except Exception:
                missing_files_count += 1
                continue

            norm_rel = os.path.normpath(rec.image_path)
            referenced_disk_paths.add(norm_rel)

            if not target_file.exists() or not target_file.is_file():
                missing_files_count += 1
                continue

            referenced_files_found += 1
            file_size = target_file.stat().st_size
            total_scanned_bytes += file_size
            if file_size > largest_file_bytes:
                largest_file_bytes = file_size

            try:
                data = target_file.read_bytes()
            except Exception:
                corrupt_files_count += 1
                continue

            # Check if file is already encrypted envelope
            if is_encrypted_envelope(data):
                try:
                    decrypted_bytes, _ = decrypt_image(data, key_ring=key_ring)
                    already_encrypted_count += 1

                    # In verify-only or dry-run, check decrypted hash against stored file_sha256
                    decrypted_hash = hashlib.sha256(decrypted_bytes).hexdigest()
                    if rec.file_sha256 and rec.file_sha256.lower() != decrypted_hash.lower():
                        hash_mismatch_count += 1
                    else:
                        verified_valid_count += 1
                except (InvalidEnvelopeError, KeyNotFoundError, ImageDecryptionError, Exception):
                    corrupt_files_count += 1
                continue

            # File is not encrypted envelope; check if plaintext JPEG
            if is_plaintext_jpeg(data):
                plaintext_jpegs_count += 1
                raw_hash = hashlib.sha256(data).hexdigest()

                if rec.file_sha256 and rec.file_sha256.lower() != raw_hash.lower():
                    hash_mismatch_count += 1

                if is_apply:
                    # Perform atomic in-place encryption
                    try:
                        ciphertext = encrypt_image(data)
                        temp_file = target_file.parent / f".tmp_{uuid.uuid4().hex}.enc"

                        with open(temp_file, "wb") as f:
                            f.write(ciphertext)
                            f.flush()
                            os.fsync(f.fileno())

                        # Atomic replace preserves directory entry and relative path
                        os.replace(temp_file, target_file)

                        # In-memory post-write verification
                        verify_data = target_file.read_bytes()
                        decrypted_check, _ = decrypt_image(verify_data, key_ring=key_ring)
                        verify_hash = hashlib.sha256(decrypted_check).hexdigest()
                        if verify_hash.lower() != raw_hash.lower():
                            raise RuntimeError("Post-write verification hash mismatch.")

                        converted_count += 1
                        verified_valid_count += 1
                    except Exception as e:
                        corrupt_files_count += 1
                        if "temp_file" in locals() and temp_file.exists():
                            try:
                                temp_file.unlink()
                            except Exception:
                                pass
                continue

            # Unrecognized / corrupted file
            corrupt_files_count += 1

        # Calculate orphans (disk files not referenced by any DB row)
        orphan_files_count = len(disk_file_paths_normalized - referenced_disk_paths)

        # Output strictly aggregate statistics with ZERO PII, UUIDs, or paths
        self.stdout.write("--- Aggregate Execution Summary ---")
        self.stdout.write(f"Database Rows Scanned: {db_rows_total}")
        self.stdout.write(f"Total Files On Disk: {disk_files_total}")
        self.stdout.write(f"Referenced Files Found On Disk: {referenced_files_found}")
        self.stdout.write(f"Plaintext JPEGs Identified: {plaintext_jpegs_count}")
        self.stdout.write(f"Already Encrypted Envelopes: {already_encrypted_count}")
        self.stdout.write(f"Missing Referenced Files: {missing_files_count}")
        self.stdout.write(f"Orphan Files On Disk: {orphan_files_count}")
        self.stdout.write(f"Corrupt / Unreadable Files: {corrupt_files_count}")
        self.stdout.write(f"SHA-256 Hash Mismatches: {hash_mismatch_count}")
        self.stdout.write(f"Files Converted In Place: {converted_count}")
        self.stdout.write(f"Files Verified Valid: {verified_valid_count}")
        self.stdout.write(f"Total Scanned Bytes: {total_scanned_bytes}")
        self.stdout.write(f"Largest File Size (Bytes): {largest_file_bytes}")

        if is_dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run complete: zero files modified, zero database writes."))
        elif is_verify_only:
            if corrupt_files_count > 0 or missing_files_count > 0 or hash_mismatch_count > 0 or plaintext_jpegs_count > 0:
                self.stdout.write(self.style.WARNING("Post-conversion audit completed with anomalies detected."))
            else:
                self.stdout.write(self.style.SUCCESS("Post-conversion audit complete: all verified files are encrypted and valid."))
        elif is_apply:
            self.stdout.write(self.style.SUCCESS("In-place conversion complete: zero database writes occurred."))

