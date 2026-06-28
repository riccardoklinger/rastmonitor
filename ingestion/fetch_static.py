"""
Fetch the static ParkingTablePublication from the Mobilithek SID endpoint
and upsert into the parking_sites table.

DATEX II structure:
  D2LogicalModel
    └── payloadPublication (xsi:type="ParkingTablePublication")
          └── parkingTable[]
                └── parkingRecord[]   (id, version attributes)
                      ├── parkingName / values / value  (text)
                      ├── parkingNumberOfSpaces         (int)
                      └── parkingLocation / ... / pointCoordinates
                                                  ├── latitude
                                                  └── longitude

Run manually:  python fetch_static.py
Cron:          0 3 * * *  python /app/fetch_static.py
"""

import os
import sys
import logging
from lxml import etree
from requests_pkcs12 import get
from db import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [fetch_static] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

NS = "http://datex2.eu/schema/2/2_0"
ENDPOINT = os.environ["STATIC_ENDPOINT"]
CERT_FILE = os.environ["CERT_FILE"]
P12_PASSWORD = os.environ.get("P12_PASSWORD", "")


def _text(el, tag):
    """Return stripped text of first matching child element, or None."""
    child = el.find(f"{{{NS}}}{tag}")
    return child.text.strip() if child is not None and child.text else None


def _int(el, tag):
    val = _text(el, tag)
    return int(val) if val is not None else None


def fetch_xml():
    log.info("Fetching static data from %s", ENDPOINT)
    resp = get(
        ENDPOINT,
        pkcs12_filename=CERT_FILE,
        pkcs12_password=P12_PASSWORD,
        timeout=60,
    )
    resp.raise_for_status()
    return etree.fromstring(resp.content)


def parse_name(parking_record_el):
    """Extract the (first) name value from a MultilingualString parkingName."""
    name_el = parking_record_el.find(f"{{{NS}}}parkingName")
    if name_el is None:
        return None
    value_el = name_el.find(f".//{{{NS}}}value")
    return value_el.text.strip() if value_el is not None and value_el.text else None


def parse_coordinates(parking_record_el):
    """
    parkingLocation can contain a PointCoordinates element somewhere in the
    location hierarchy. We search recursively for the first one.
    """
    coords_el = parking_record_el.find(f".//{{{NS}}}pointCoordinates")
    if coords_el is None:
        return None, None
    lat = _text(coords_el, "latitude")
    lon = _text(coords_el, "longitude")
    return (float(lat) if lat else None, float(lon) if lon else None)


def parse_records(root):
    records = []
    for parking_record in root.iter(f"{{{NS}}}parkingRecord"):
        datex_id = parking_record.get("id")
        version = parking_record.get("version")
        if not datex_id:
            continue

        name = parse_name(parking_record)
        total_spaces = _int(parking_record, "parkingNumberOfSpaces")
        lat, lon = parse_coordinates(parking_record)

        if lat is None or lon is None:
            log.warning("Skipping record %s: no coordinates", datex_id)
            continue

        records.append({
            "datex_id": datex_id,
            "version": version,
            "name": name,
            "total_spaces": total_spaces,
            "lat": lat,
            "lon": lon,
        })

    return records


def upsert(records):
    if not records:
        log.warning("No records to upsert.")
        return

    sql = """
        INSERT INTO parking_sites (datex_id, version, name, total_spaces, location)
        VALUES %s
        ON CONFLICT (datex_id) DO UPDATE SET
            version      = EXCLUDED.version,
            name         = EXCLUDED.name,
            total_spaces = EXCLUDED.total_spaces,
            location     = EXCLUDED.location,
            updated_at   = now()
    """
    rows = [
        (
            r["datex_id"],
            r["version"],
            r["name"],
            r["total_spaces"],
            f"SRID=4326;POINT({r['lon']} {r['lat']})",
        )
        for r in records
    ]

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                from psycopg2.extras import execute_values
                execute_values(cur, sql, rows)
        log.info("Upserted %d parking sites.", len(rows))
    finally:
        conn.close()


def main():
    root = fetch_xml()
    records = parse_records(root)
    log.info("Parsed %d parking records.", len(records))
    upsert(records)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fatal error in fetch_static")
        sys.exit(1)
