"""
Common infrastructure for the Volunteer Coordination System v0.6.0.

This package provides:
- db_context: PostgreSQL session context management (SET LOCAL app.user_id / app.ip)
- transactions: Transaction utilities and safe execution helpers
- exceptions: Application exception hierarchy with DB error translation
- permissions: Reusable permission checks aligned with SQL trigger definitions
- privacy: Data visibility tier enforcement (T0-T4)
- security: Cryptographic utilities, token handling, redaction
- utils: General-purpose helpers (tag normalization, JPEG sanitization, etc.)
- authentication: Blocked-aware token authentication with DB session context propagation
"""

