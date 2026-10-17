BEGIN READ ONLY;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

SELECT 'Original view: count' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT COUNT(*) FROM public.v_parking_daily;

SELECT 'Materialized view: count' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT COUNT(*) FROM public.mv_parking_daily;

SELECT 'Original view: offset 0' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT * FROM public.v_parking_daily ORDER BY id LIMIT 100 OFFSET 0;

SELECT 'Materialized view: offset 0' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT * FROM public.mv_parking_daily ORDER BY id LIMIT 100 OFFSET 0;

SELECT 'Original view: offset 53900' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT * FROM public.v_parking_daily ORDER BY id LIMIT 100 OFFSET 53900;

SELECT 'Materialized view: offset 53900' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT * FROM public.mv_parking_daily ORDER BY id LIMIT 100 OFFSET 53900;

SELECT 'Original view: offset 150000' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT * FROM public.v_parking_daily ORDER BY id LIMIT 100 OFFSET 150000;

SELECT 'Materialized view: offset 150000' AS measurement;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
SELECT * FROM public.mv_parking_daily ORDER BY id LIMIT 100 OFFSET 150000;

ROLLBACK;