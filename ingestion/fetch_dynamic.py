"""
Fetch the dynamic ParkingStatusPublication from the Mobilithek SID endpoint
and insert into the parking_status table.

DATEX II structure:
  D2LogicalModel
    └── payloadPublication (xsi:type="ParkingStatusPublication")
          └── parkingRecordStatus[]   (xsi:type="ParkingSiteStatus")
                ├── parkingRecordReference  @id        ← FK to parking_sites.datex_id
                ├── parkingStatusOriginTime             ← source timestamp
                ├── parkingOccupancy
                │     ├── parkingOccupancy              ← fill % (0–100+)
                │     ├── parkingNumberOfVacantSpaces
                │     ├── parkingNumberOfOccupiedSpaces
                │     └── parkingOccupancyTrend
                ├── parkingSiteStatus                   ← e.g. "spacesAvailable"
                └── parkingSiteOpeningStatus            ← e.g. "open"

Run manually:  python fetch_dynamic.py
Cron:          */15 * * * *  python /app/fetch_dynamic.py
"""

import os
import sys
import logging
from lxml import etree
from requests_pkcs12 import get
from db import get_connection
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [fetch_dynamic] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

NS = "http://datex2.eu/schema/2/2_0"
ENDPOINT = os.environ["DYNAMIC_ENDPOINT"]
CERT_FILE = os.environ["CERT_FILE"]
P12_PASSWORD = os.environ.get("P12_PASSWORD", "")


def _text(el, tag):
    child = el.find(f"{{{NS}}}{tag}")
    return child.text.strip() if child is not None and child.text else None


def _int(el, tag):
    val = _text(el, tag)
    return int(val) if val is not None else None


def _float(el, tag):
    val = _text(el, tag)
    return float(val) if val is not None else None


def fetch_xml():
    log.info("Fetching dynamic data from %s", ENDPOINT)
    resp = get(
        ENDPOINT,
        pkcs12_filename=CERT_FILE,
        pkcs12_password=P12_PASSWORD,
        timeout=60,
    )
    resp.raise_for_status()
    return etree.fromstring(resp.content)


def parse_records(root):
    records = []
    for status_el in root.iter(f"{{{NS}}}parkingRecordStatus"):
        # Join key: id attribute on the parkingRecordReference element
        ref_el = status_el.find(f"{{{NS}}}parkingRecordReference")
        if ref_el is None:
            continue
        datex_id = ref_el.get("id")
        if not datex_id:
            continue

        origin_time = _text(status_el, "parkingStatusOriginTime")

        occupancy_el = status_el.find(f"{{{NS}}}parkingOccupancy")
        occupancy_pct = None
        vacant_spaces = None
        occupied_spaces = None
        occupancy_trend = None
        if occupancy_el is not None:
            occupancy_pct = _float(occupancy_el, "parkingOccupancy")
            vacant_spaces = _int(occupancy_el, "parkingNumberOfVacantSpaces")
            occupied_spaces = _int(occupancy_el, "parkingNumberOfOccupiedSpaces")
            occupancy_trend = _text(occupancy_el, "parkingOccupancyTrend")

        site_status = _text(status_el, "parkingSiteStatus")
        opening_status = _text(status_el, "parkingSiteOpeningStatus")

        records.append({
            "datex_id": datex_id,
            "occupancy_pct": occupancy_pct,
            "vacant_spaces": vacant_spaces,
            "occupied_spaces": occupied_spaces,
            "occupancy_trend": occupancy_trend,
            "site_status": site_status,
            "opening_status": opening_status,
            "status_origin_time": origin_time,
        })

    return records


def insert(records):
    if not records:
        log.warning("No status records to insert.")
        return

    sql = """
        INSERT INTO parking_status
            (datex_id, occupancy_pct, vacant_spaces, occupied_spaces,
             occupancy_trend, site_status, opening_status, status_origin_time)
        VALUES %s
        ON CONFLICT DO NOTHING
    """
    rows = [
        (
            r["datex_id"],
            r["occupancy_pct"],
            r["vacant_spaces"],
            r["occupied_spaces"],
            r["occupancy_trend"],
            r["site_status"],
            r["opening_status"],
            r["status_origin_time"],
        )
        for r in records
    ]

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                execute_values(cur, sql, rows)
        log.info("Inserted %d status records.", len(rows))
    finally:
        conn.close()


def main():
    root = fetch_xml()
    records = parse_records(root)
    log.info("Parsed %d status records.", len(records))
    insert(records)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fatal error in fetch_dynamic")
        sys.exit(1)
