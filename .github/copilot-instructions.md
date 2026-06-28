# Copilot Instructions for rastmonitor

## Project Overview

`rastmonitor` monitors truck parking occupancy in Germany. It subscribes to the **Toll Collect SID service** via [Mobilithek](https://mobilithek.info), stores data in PostgreSQL, and visualizes it on a MapLibre map in a Next.js frontend.

- **Static data** (`ParkingTablePublication`): parking facility locations and metadata — fetched once daily
- **Dynamic data** (`ParkingStatusPublication`): occupancy per facility (fill %, vacant/occupied spots) — fetched every **15 minutes**
- Full stack runs in **Docker Compose**

## Architecture

```
Mobilithek SID SOAP endpoints
  ├── static  (ParkingTablePublication) → fetched 1×/day
  └── dynamic (ParkingStatusPublication) → fetched every 15 min
          │
          ▼
  Python ingestion scripts (cron)
          │
          ▼
  PostgreSQL + PostGIS
  ├── parking_sites   (static: geometry, name, capacity, ...)
  └── parking_status  (dynamic: occupancy %, vacant spaces, timestamps)
          │
          ▼
  Next.js + MapLibre GL JS
  (points on map, color-coded by occupancy, Germany-focused)
```

## Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL + PostGIS |
| Data ingestion | Python scripts, cron-scheduled |
| Frontend | Next.js + MapLibre GL JS |
| Infrastructure | Docker / Docker Compose |

## Data Source — DATEX II / Mobilithek

- **Client certificate auth**: Mobilithek requires mTLS via a `.p12` (PKCS#12) file. Use `requests-pkcs12` in Python (`requests_pkcs12.get(url, pkcs12_filename=..., pkcs12_password=...)`). The `.p12` file is mounted into the ingestion container at `/certs/client.p12` via `CERT_P12` in `.env`. Never commit certificate files — reference them via `.env` paths.

Both endpoints return **DATEX II v2.3 XML** (namespace: `http://datex2.eu/schema/2/2_0`) via SOAP `clientPullService`.

- **Static endpoint**: `https://mobilithek.info:8443/mobilithek/api/v1.0/subscription/soap/1006362396091736064/clientPullService`
  - Root element: `ParkingTablePublication` → `parkingRecord[]` (type `ParkingSite`)
  - Key fields per record: `id`, `version`, `parkingName`, `parkingNumberOfSpaces`, `parkingLocation` → `PointCoordinates` (`latitude`, `longitude`)
  - XSD: `static/xsd/ITP_Deutschland_ParkingTable.xsd`

- **Dynamic endpoint**: `https://mobilithek.info:8443/mobilithek/api/v1.0/subscription/soap/1006362327707783168/clientPullService`
  - Root element: `ParkingStatusPublication` → `parkingRecordStatus[]`
  - Key fields: `parkingOccupancy` (Percentage 0–100), `parkingNumberOfVacantSpaces`, `parkingNumberOfOccupiedSpaces`, `parkingOccupancyTrend`, `parkingSiteStatus`, `parkingSiteOpeningStatus`, `parkingStatusOriginTime`
  - XSD: `static/xsd/ITP_Deutschland_ParkingStatus.xsd`

The `id` in `ParkingStatusPublication` records links back to the corresponding `ParkingRecord` in the static table — this is the join key between static and dynamic data.

## Database Conventions

- Coordinates from DATEX II are `latitude`/`longitude` floats (WGS 84). Store as PostGIS `geometry(Point, 4326)`.
- **Static table** (`parking_sites`): populated once daily; upsert on `datex_id`. Holds geometry, name, total capacity, address.
- **Dynamic table** (`parking_status`): insert every 15 min with timestamp; FK to `parking_sites.datex_id`. Holds `occupancy_pct`, `vacant_spaces`, `occupied_spaces`, `occupancy_trend`, `site_status`, `opening_status`, `status_origin_time`.
- Occupancy above 100% is valid per the data model (overcrowded).

## Data Model (three tiers)

| Table/View | Content | Retention |
|---|---|---|
| `parking_sites` | Static facility data (geometry, name, capacity) | Forever (upsert on change) |
| `parking_status` | Raw 15-min scrapes (~518K rows max) | **72 hours** — pruned by `prune_raw.py` |
| `parking_status_live` | VIEW: latest scrape per site (`DISTINCT ON datex_id ORDER BY fetched_at DESC`) | Live, no storage |
| `parking_status_daily` | Daily min/max/mean/median per site | **6 months** — pruned by `prune_raw.py` |

**Cron schedule (all in `ingestion` container):**
| Time | Script | Purpose |
|---|---|---|
| `*/15 * * * *` | `fetch_dynamic.py` | Ingest live occupancy |
| `0 3 * * *` | `fetch_static.py` | Refresh static facility data |
| `0 2 * * *` | `aggregate_daily.py` | Compute yesterday's daily stats |
| `30 2 * * *` | `prune_raw.py` | Delete raw >72h, daily >6 months |

**Important**: `aggregate_daily.py` must run **before** `prune_raw.py` each day (02:00 then 02:30) to avoid losing yesterday's raw data before it is aggregated.

- Scripts live in `ingestion/` (or similar).
- Two separate scripts: one for static (daily), one for dynamic (every 15 min cron).
- Parse DATEX II XML using the XSDs in `static/xsd/` as reference — do not assume field names; verify against the XSD.
- All ingestion runs inside the Docker `ingestion` service.

## Frontend Conventions

- Framework: **Next.js** (App Router).
- Map: **MapLibre GL JS** — initial view centered on Germany.
- Static parking points loaded once as a GeoJSON layer.
- Dynamic occupancy overlaid on points — use color coding based on `occupancy_pct` (e.g. green → red scale; >100% = overcrowded state).

## Docker

- `docker-compose.yml` at repo root manages all services.
- Expected services: `db` (PostgreSQL+PostGIS), `ingestion` (Python + cron), `web` (Next.js).
- Secrets and connection strings go in `.env` — never committed.


