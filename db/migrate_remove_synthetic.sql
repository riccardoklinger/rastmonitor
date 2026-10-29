-- Destructive cleanup: back up the database and stop ingestion, web and pygeoapi.
-- Run with psql -v ON_ERROR_STOP=1 -f (relative includes require sibling files).
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- No CASCADE: unexpected dependencies must abort rather than be removed silently.
DROP MATERIALIZED VIEW IF EXISTS public.mv_parking_daily;
DROP VIEW IF EXISTS public.v_parking_daily;
DROP VIEW IF EXISTS public.v_parking_72h;

DELETE FROM public.parking_status
WHERE fetched_at < TIMESTAMPTZ '2026-07-01 00:00:00+00';

DELETE FROM public.parking_status_daily
WHERE day < DATE '2026-07-01';

ALTER TABLE public.parking_status DROP COLUMN IF EXISTS is_synthetic;
ALTER TABLE public.parking_status_daily DROP COLUMN IF EXISTS is_synthetic;

ALTER TABLE public.parking_status
    DROP CONSTRAINT IF EXISTS parking_status_dataset_start,
    ADD CONSTRAINT parking_status_dataset_start
        CHECK (fetched_at >= TIMESTAMPTZ '2026-07-01 00:00:00+00');

ALTER TABLE public.parking_status_daily
    DROP CONSTRAINT IF EXISTS parking_status_daily_dataset_start,
    ADD CONSTRAINT parking_status_daily_dataset_start
        CHECK (day >= DATE '2026-07-01');

\ir migrate_add_ogcapi_views.sql

CREATE MATERIALIZED VIEW public.mv_parking_daily AS
SELECT * FROM public.v_parking_daily;

CREATE UNIQUE INDEX mv_parking_daily_id_idx ON public.mv_parking_daily (id);
CREATE INDEX mv_parking_daily_day_idx ON public.mv_parking_daily (day);
CREATE INDEX mv_parking_daily_geom_idx ON public.mv_parking_daily USING GIST (geom);

COMMENT ON MATERIALIZED VIEW public.mv_parking_daily IS
    'Snapshot of v_parking_daily. Refresh after daily data updates; public feature IDs are unchanged.';

ANALYZE public.parking_status;
ANALYZE public.parking_status_daily;
ANALYZE public.mv_parking_daily;

COMMIT;
