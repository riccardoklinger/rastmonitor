"""Refresh the historical OGC API snapshot after successful daily data updates."""

import logging
import sys
from time import monotonic

from db import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [refresh_ogcapi_daily] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def main():
    started = monotonic()
    conn = get_connection()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SET lock_timeout = '5s'")
            cur.execute("SET statement_timeout = '120s'")
            log.info("Refreshing public.mv_parking_daily concurrently.")
            cur.execute(
                "REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parking_daily"
            )
            cur.execute("ANALYZE public.mv_parking_daily")
        log.info(
            "Snapshot refreshed and analyzed in %.2f seconds.", monotonic() - started
        )
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fatal error refreshing historical OGC API snapshot")
        sys.exit(1)
