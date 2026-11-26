-- 01_server_identity.sql
-- Strictly READ-ONLY server and database identity check
SELECT
    current_database()                              AS database_name,
    current_user                                    AS connected_user,
    current_schema()                                AS current_schema,
    current_setting('search_path')                  AS search_path,
    current_setting('server_version')               AS server_version,
    current_setting('server_version_num')           AS server_version_num,
    current_setting('TimeZone')                     AS session_timezone,
    current_setting('transaction_read_only')        AS transaction_read_only,
    inet_server_addr()                              AS server_address,
    inet_server_port()                              AS server_port,
    pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT extname, extversion FROM pg_extension ORDER BY extname;
