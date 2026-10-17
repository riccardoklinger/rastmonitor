BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_parking_daily AS
SELECT *
FROM public.v_parking_daily
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_parking_daily_id_idx
    ON public.mv_parking_daily (id);

CREATE INDEX IF NOT EXISTS mv_parking_daily_day_idx
    ON public.mv_parking_daily (day);

CREATE INDEX IF NOT EXISTS mv_parking_daily_geom_idx
    ON public.mv_parking_daily USING GIST (geom);

COMMENT ON MATERIALIZED VIEW public.mv_parking_daily IS
    'Snapshot of v_parking_daily. Refresh after daily data updates; public feature IDs are unchanged.';

ANALYZE public.mv_parking_daily;

COMMIT;