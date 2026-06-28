-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Static parking facilities (from ParkingTablePublication, refreshed once daily)
CREATE TABLE IF NOT EXISTS parking_sites (
    datex_id        TEXT PRIMARY KEY,
    version         TEXT,
    name            TEXT,
    total_spaces    INTEGER,
    address         TEXT,
    location        geometry(Point, 4326) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parking_sites_location_idx ON parking_sites USING GIST (location);

-- Raw occupancy snapshots (from ParkingStatusPublication, every 15 min)
-- Pruned automatically after 72 hours by prune_raw.py
CREATE TABLE IF NOT EXISTS parking_status (
    id                  BIGSERIAL PRIMARY KEY,
    datex_id            TEXT NOT NULL REFERENCES parking_sites(datex_id) ON DELETE CASCADE,
    occupancy_pct       NUMERIC(5, 2),   -- 0–100+; values >100 indicate overcrowded
    vacant_spaces       INTEGER,
    occupied_spaces     INTEGER,
    occupancy_trend     TEXT,            -- ParkingOccupancyTrendEnum
    site_status         TEXT,            -- ParkingSiteStatusEnum
    opening_status      TEXT,            -- OpeningStatusEnum
    status_origin_time  TIMESTAMPTZ,     -- parkingStatusOriginTime from source
    is_synthetic        BOOLEAN NOT NULL DEFAULT false,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parking_status_datex_id_fetched_idx
    ON parking_status (datex_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS parking_status_fetched_at_idx
    ON parking_status (fetched_at DESC);

-- Live view: the single most recent scrape per parking site
CREATE OR REPLACE VIEW parking_status_live AS
SELECT DISTINCT ON (datex_id)
    datex_id,
    occupancy_pct,
    vacant_spaces,
    occupied_spaces,
    occupancy_trend,
    site_status,
    opening_status,
    status_origin_time,
    fetched_at
FROM parking_status
ORDER BY datex_id, fetched_at DESC;

-- Daily aggregates per parking site (kept for 6 months)
-- Populated by aggregate_daily.py at 02:00; pruned by prune_raw.py at 02:30
CREATE TABLE IF NOT EXISTS parking_status_daily (
    id           BIGSERIAL PRIMARY KEY,
    datex_id     TEXT NOT NULL REFERENCES parking_sites(datex_id) ON DELETE CASCADE,
    day          DATE NOT NULL,
    mean_occ     NUMERIC(5, 2),
    max_occ      NUMERIC(5, 2),
    min_occ      NUMERIC(5, 2),
    median_occ   NUMERIC(5, 2),
    sample_count INTEGER,
    is_synthetic BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (datex_id, day)
);

CREATE INDEX IF NOT EXISTS parking_status_daily_datex_day_idx
    ON parking_status_daily (datex_id, day DESC);
