"""
Export the full daily dataset (parking_status_daily joined with site geometry)
as a GeoPackage to a static path. Written atomically so downloads never see a
partial file.

Runs after aggregate_daily.py each night.
"""

import logging
import os
import subprocess
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [export_gpkg] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

EXPORT_DIR = os.environ.get("EXPORT_DIR", "/exports")
FILENAME = "rastmonitor_daily.gpkg"

SQL = """
    SELECT s.datex_id, s.name, s.official_spaces, s.total_spaces, s.address,
           d.day, d.mean_occ, d.max_occ, d.min_occ, d.median_occ,
           d.sample_count, d.is_synthetic, s.location
    FROM parking_status_daily d
    JOIN parking_sites s USING (datex_id)
    ORDER BY d.day, s.datex_id
"""


def main():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    final = os.path.join(EXPORT_DIR, FILENAME)
    tmp = os.path.join(EXPORT_DIR, f".{FILENAME}.tmp")
    if os.path.exists(tmp):
        os.remove(tmp)

    conn = (
        f"PG:host={os.environ['POSTGRES_HOST']} "
        f"port={os.environ.get('POSTGRES_PORT', '5432')} "
        f"dbname={os.environ['POSTGRES_DB']} user={os.environ['POSTGRES_USER']}"
    )
    env = {**os.environ, "PGPASSWORD": os.environ["POSTGRES_PASSWORD"]}
    cmd = [
        "ogr2ogr", "-f", "GPKG", tmp, conn,
        "-sql", SQL, "-nln", "parking_status_daily",
        "-a_srs", "EPSG:4326", "-nlt", "POINT",
    ]
    subprocess.run(cmd, check=True, env=env)
    os.chmod(tmp, 0o644)
    os.replace(tmp, final)
    log.info("Wrote %s (%d bytes)", final, os.path.getsize(final))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log.exception("Fatal error in export_gpkg")
        sys.exit(1)
