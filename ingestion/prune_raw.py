"""
Prune old data to keep storage bounded:
  - Raw parking_status rows older than 72 hours
  - Daily aggregates older than 6 months

Runs at 02:30 daily — after aggregate_daily.py has processed yesterday's raw rows.
"""

import sys
import logging
from db import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [prune_raw] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def prune(conn):
    with conn:
        with conn.cursor() as cur:
            # Raw data: keep last 72 hours
            cur.execute("""
                DELETE FROM parking_status
                WHERE fetched_at < now() - INTERVAL '72 hours'
            """)
            log.info("Deleted %d raw rows older than 72h.", cur.rowcount)

            # Daily aggregates: keep last 6 months
            cur.execute("""
                DELETE FROM parking_status_daily
                WHERE day < now() - INTERVAL '6 months'
            """)
            log.info("Deleted %d daily aggregate rows older than 6 months.", cur.rowcount)


def main():
    conn = get_connection()
    try:
        prune(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fatal error in prune_raw")
        sys.exit(1)
