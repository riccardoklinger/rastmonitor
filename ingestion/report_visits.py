"""
report_visits.py — daily page view summary.

Queries the page_views table and prints a report for the last 30 days.
Run manually or via cron to get a quick overview of site traffic.

Usage:
    python3 /app/report_visits.py
    python3 /app/report_visits.py --days 7
"""

import sys
import logging
from db import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [report_visits] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


def report(days: int = 30):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT day, count
                FROM page_views
                WHERE day >= CURRENT_DATE - %s::int
                ORDER BY day DESC
                """,
                (days,),
            )
            rows = cur.fetchall()

        if not rows:
            print("Keine Daten vorhanden.")
            return

        total = sum(r[1] for r in rows)
        print(f"\n{'='*40}")
        print(f"  rastmonitor – Seitenaufrufe")
        print(f"  Zeitraum: letzte {days} Tage")
        print(f"{'='*40}")
        print(f"{'Datum':<14} {'Aufrufe':>8}")
        print(f"{'-'*24}")
        for day, count in rows:
            print(f"{str(day):<14} {count:>8}")
        print(f"{'-'*24}")
        print(f"{'Gesamt':<14} {total:>8}")
        print(f"{'Schnitt/Tag':<14} {total/len(rows):>7.1f}")
        print(f"{'='*40}\n")

    finally:
        conn.close()


if __name__ == "__main__":
    days = int(sys.argv[2]) if len(sys.argv) >= 3 and sys.argv[1] == "--days" else 30
    try:
        report(days)
    except Exception:
        log.exception("Fatal error in report_visits")
        sys.exit(1)
