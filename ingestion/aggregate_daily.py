"""
Compute daily occupancy aggregates (min, max, mean, median) per parking site
for the previous calendar day and upsert into parking_status_daily.

Runs at 02:00 daily — before prune_raw.py deletes yesterday's raw rows.
"""

import sys
import logging
from datetime import date, timedelta
from db import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [aggregate_daily] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# Aggregate for this many days back (1 = yesterday only, increase for backfill)
DAYS_BACK = 1


def aggregate(conn, target_day: date):
    sql_agg = """
        WITH stats AS (
            SELECT
                datex_id,
                ROUND(AVG(occupancy_pct)::NUMERIC, 2)                                         AS mean_occ,
                ROUND(MAX(occupancy_pct)::NUMERIC, 2)                                         AS max_occ,
                ROUND(MIN(occupancy_pct)::NUMERIC, 2)                                         AS min_occ,
                ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY occupancy_pct)::NUMERIC, 2) AS median_occ,
                COUNT(*)                                                                       AS sample_count
            FROM parking_status
            WHERE fetched_at >= %(day_start)s
              AND fetched_at <  %(day_end)s
              AND occupancy_pct IS NOT NULL
            GROUP BY datex_id
        )
        INSERT INTO parking_status_daily
            (datex_id, day, mean_occ, max_occ, min_occ, median_occ, sample_count, is_synthetic)
        SELECT datex_id, %(day)s, mean_occ, max_occ, min_occ, median_occ, sample_count, true
        FROM stats
        ON CONFLICT (datex_id, day) DO UPDATE SET
            mean_occ     = EXCLUDED.mean_occ,
            max_occ      = EXCLUDED.max_occ,
            min_occ      = EXCLUDED.min_occ,
            median_occ   = EXCLUDED.median_occ,
            sample_count = EXCLUDED.sample_count
    """
    params = {
        "day": target_day,
        "day_start": target_day,
        "day_end": target_day + timedelta(days=1),
    }
    with conn:
        with conn.cursor() as cur:
            cur.execute(sql_agg, params)
            log.info("Aggregated %d site-days for %s.", cur.rowcount, target_day)


def main():
    conn = get_connection()
    try:
        today = date.today()
        for offset in range(DAYS_BACK, 0, -1):
            target = today - timedelta(days=offset)
            log.info("Aggregating %s …", target)
            aggregate(conn, target)
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fatal error in aggregate_daily")
        sys.exit(1)
