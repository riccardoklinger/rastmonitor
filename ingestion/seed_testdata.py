"""
Seed script: populate parking_status (72h raw) and parking_status_daily (6 months)
with realistic test data based on actual parking sites in the DB.

Realistic pattern for German truck parking (Autobahn):
- Night (22:00–06:00): 90–110 % occupancy (overcrowded)
- Morning (06:00–10:00): dropping from 90 → 40 %
- Day (10:00–17:00): 30–60 %
- Evening (17:00–22:00): rising from 50 → 90 %

Run once: python seed_testdata.py
"""

import os
import math
import random
import logging
from datetime import datetime, timedelta, timezone
from db import get_connection
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [seed] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

random.seed(42)

POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5433")


def occupancy_at(hour: float, site_factor: float) -> float:
    """
    Return a realistic occupancy % for a given hour of day (0–24).
    site_factor (0.7–1.3) gives each site its own personality.
    Night peak ~100 %, day trough ~35 %.
    """
    # Cosine curve: peaks at 03:00, troughs at 14:00
    base = 67.5 + 32.5 * math.cos(math.pi * (hour - 3) / 11)
    noise = random.gauss(0, 4)
    return max(0.0, round((base + noise) * site_factor, 1))


def seed_raw(conn, site_ids: list[str]):
    """Insert 15-min raw rows for the last 72 hours."""
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    # Round down to nearest 15 min
    now = now - timedelta(minutes=now.minute % 15)
    start = now - timedelta(hours=72)

    # Assign a stable per-site factor
    factors = {sid: random.uniform(0.7, 1.3) for sid in site_ids}

    rows = []
    ts = start
    while ts <= now:
        hour = ts.hour + ts.minute / 60
        for sid in site_ids:
            occ = occupancy_at(hour, factors[sid])
            vacant = None
            occupied = None
            trend = random.choice(["increasing", "decreasing", "stable", "stable"])
            rows.append((sid, occ, vacant, occupied, trend, "open", "spacesAvailable" if occ < 95 else "full", ts, True))
        ts += timedelta(minutes=15)

    log.info("Inserting %d raw rows (72h × %d sites × 96 scrapes) …", len(rows), len(site_ids))

    sql = """
        INSERT INTO parking_status
            (datex_id, occupancy_pct, vacant_spaces, occupied_spaces,
             occupancy_trend, opening_status, site_status, status_origin_time, is_synthetic)
        VALUES %s
        ON CONFLICT DO NOTHING
    """
    batch = 5000
    for i in range(0, len(rows), batch):
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql, rows[i:i + batch])
        log.info("  … %d / %d rows inserted", min(i + batch, len(rows)), len(rows))


def seed_daily(conn, site_ids: list[str]):
    """Insert 180 days of daily aggregates."""
    today = datetime.now(timezone.utc).date()
    factors = {sid: random.uniform(0.7, 1.3) for sid in site_ids}

    rows = []
    for day_offset in range(180, 0, -1):
        day = today - timedelta(days=day_offset)
        # Weekend effect: slightly higher occupancy Fri/Sat night
        weekend_boost = 1.05 if day.weekday() in (4, 5) else 1.0
        for sid in site_ids:
            f = factors[sid] * weekend_boost
            # Simulate 96 readings across the day
            samples = [occupancy_at(h / 4, f) for h in range(96)]
            mean_occ = round(sum(samples) / len(samples), 2)
            max_occ = round(max(samples), 2)
            min_occ = round(min(samples), 2)
            sorted_s = sorted(samples)
            median_occ = round((sorted_s[47] + sorted_s[48]) / 2, 2)
            rows.append((sid, day, mean_occ, max_occ, min_occ, median_occ, len(samples), True))

    log.info("Inserting %d daily aggregate rows (180 days × %d sites) …", len(rows), len(site_ids))

    sql = """
        INSERT INTO parking_status_daily
            (datex_id, day, mean_occ, max_occ, min_occ, median_occ, sample_count, is_synthetic)
        VALUES %s
        ON CONFLICT (datex_id, day) DO UPDATE SET
            mean_occ     = EXCLUDED.mean_occ,
            max_occ      = EXCLUDED.max_occ,
            min_occ      = EXCLUDED.min_occ,
            median_occ   = EXCLUDED.median_occ,
            sample_count = EXCLUDED.sample_count,
            is_synthetic = EXCLUDED.is_synthetic
    """
    batch = 5000
    for i in range(0, len(rows), batch):
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql, rows[i:i + batch])
        log.info("  … %d / %d rows inserted", min(i + batch, len(rows)), len(rows))


def main():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT datex_id FROM parking_sites ORDER BY datex_id")
            site_ids = [r[0] for r in cur.fetchall()]
        log.info("Found %d parking sites.", len(site_ids))

        seed_raw(conn, site_ids)
        seed_daily(conn, site_ids)

        log.info("Done. Seed complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
