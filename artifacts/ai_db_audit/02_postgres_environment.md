# 02 — PostgreSQL Environment and Engine Identity

- **Execution Mode:** STRICT READ-ONLY (`BEGIN READ ONLY;`)
- **Current Database:** `volunteer_coordination_db`
- **Connected User:** `postgres`
- **Current Schema:** `public`
- **Search Path:** `"$user", public`
- **Server Version:** `18.6` (Version number: `180006`)
- **Server Address:** `127.0.0.1/32` (Loopback verified)
- **Server Port:** `5432`
- **Session Timezone:** `Asia/Rangoon`
- **Transaction Read-Only:** `on`
- **Database Size:** `30 MB`

## Installed Extensions
- `btree_gist`: Version `1.8` (Active — required for `ex_assignments_no_overlap` exclusion constraint)
- `plpgsql`: Version `1.0` (Active)

## Native Functions
- `uuidv7()`: Resolves and generates valid UUIDv7 on this server instance.
