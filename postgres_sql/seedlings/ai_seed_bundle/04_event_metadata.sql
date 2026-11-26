-- =============================================================================
-- 04_event_metadata.sql
-- Staging and natural key metadata for the 150 synthetic events
-- =============================================================================

CREATE TEMP TABLE IF NOT EXISTS temp_hist_event_dates (
    cohort_key TEXT PRIMARY KEY,
    event_id BIGINT,
    hist_start TIMESTAMPTZ,
    hist_end TIMESTAMPTZ,
    hist_deadline TIMESTAMPTZ
);
