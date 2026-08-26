-- Migration: create views for OGC API Features (pygeoapi)
-- Three views mirror the three map modes exactly.

-- 1. Live — one row per site, current occupancy
CREATE OR REPLACE VIEW v_parking_live AS
SELECT
    ps.datex_id                 AS id,
    ps.name,
    ps.road_identifier,
    ps.road_destination,
    ps.operator_name,
    ps.official_spaces,
    ps.total_spaces,
    CASE
        WHEN ps.total_spaces IS NOT NULL AND ps.official_spaces IS NOT NULL
            THEN GREATEST(ps.total_spaces - ps.official_spaces, 0)
        ELSE NULL
    END                         AS tolerated_spaces,
    psl.occupancy_pct,
    psl.opening_status,
    psl.site_status,
    psl.fetched_at,
    ps.location                 AS geom
FROM parking_sites ps
LEFT JOIN parking_status_live psl ON ps.datex_id = psl.datex_id;

COMMENT ON VIEW v_parking_live IS 'Current truck parking occupancy per site (live feed).';

-- 2. 72h raw readings — one row per site per fetch cycle (last 72 h).
--    Clients filter by fetched_at (datetime parameter) to reconstruct
--    a point-in-time snapshot, e.g. ?datetime=2024-06-01T14:00:00Z/2024-06-01T14:30:00Z
CREATE OR REPLACE VIEW v_parking_72h AS
SELECT
    (ps.datex_id || '_' || to_char(pst.fetched_at, 'YYYYMMDD"T"HH24MISS"Z"')) AS id,
    ps.datex_id,
    ps.name,
    ps.road_identifier,
    ps.road_destination,
    ps.official_spaces,
    ps.total_spaces,
    CASE
        WHEN ps.total_spaces IS NOT NULL AND ps.official_spaces IS NOT NULL
            THEN GREATEST(ps.total_spaces - ps.official_spaces, 0)
        ELSE NULL
    END                         AS tolerated_spaces,
    pst.occupancy_pct,
    pst.opening_status,
    pst.site_status,
    pst.fetched_at,
    pst.is_synthetic,
    ps.location                 AS geom
FROM parking_sites ps
JOIN parking_status pst ON ps.datex_id = pst.datex_id
WHERE pst.fetched_at > NOW() - INTERVAL '72 hours';

COMMENT ON VIEW v_parking_72h IS 'All occupancy readings for the last 72 hours. Filter by fetched_at via the datetime parameter to get a point-in-time snapshot.';

-- 3. 90-day daily stats — one row per site per day (last 90 days).
--    Mirrors the 90-day map mode. Filter by day via the datetime parameter,
--    e.g. ?datetime=2024-06-01
CREATE OR REPLACE VIEW v_parking_daily AS
SELECT
    (ps.datex_id || '_' || to_char(d.day, 'YYYYMMDD')) AS id,
    ps.datex_id,
    ps.name,
    ps.road_identifier,
    ps.road_destination,
    ps.official_spaces,
    ps.total_spaces,
    CASE
        WHEN ps.total_spaces IS NOT NULL AND ps.official_spaces IS NOT NULL
            THEN GREATEST(ps.total_spaces - ps.official_spaces, 0)
        ELSE NULL
    END                         AS tolerated_spaces,
    d.day,
    d.min_occ,
    d.mean_occ,
    d.median_occ,
    d.max_occ,
    d.sample_count,
    d.is_synthetic,
    ps.location                 AS geom
FROM parking_sites ps
JOIN parking_status_daily d ON ps.datex_id = d.datex_id
WHERE d.day >= CURRENT_DATE - INTERVAL '90 days';

COMMENT ON VIEW v_parking_daily IS 'Daily occupancy statistics per site for the last 90 days. Filter by day via the datetime parameter, e.g. ?datetime=2024-06-01.';
