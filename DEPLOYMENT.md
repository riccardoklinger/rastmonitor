# rastmonitor — Deployment Guide

## Prerequisites on the server

- Ubuntu 22.04 LTS (or similar)
- Docker Engine + Docker Compose plugin
- Git
- Your Mobilithek `.p12` client certificate file
- Minimum recommended: 2 vCPU, 4 GB RAM, 40 GB disk

```bash
# Install Docker (official script)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

---

## 1. Clone the repository

```bash
git clone https://github.com/Riccardo-Klinger/rastmonitor.git
cd rastmonitor
```

---

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in all values:

| Variable | Description |
|---|---|
| `POSTGRES_DB` | Database name (e.g. `rastmonitor`) |
| `POSTGRES_USER` | DB user |
| `POSTGRES_PASSWORD` | Strong password |
| `STATIC_ENDPOINT` | Mobilithek static REST URL (from `.env.example`) |
| `DYNAMIC_ENDPOINT` | Mobilithek dynamic REST URL (from `.env.example`) |
| `CERT_P12` | **Absolute path** to your `.p12` file on the server |
| `P12_PASSWORD` | Password for the `.p12` file |
| `MARTIN_URL` | Leave as `http://martin:3000` (internal Docker network) |

> **Do not set `NEXT_PUBLIC_MAP_STYLE`** in production — leave it unset so the self-hosted Martin tile server is used.

Upload your certificate to the server:

```bash
# From your local machine:
scp /path/to/certificate.p12 user@yourserver:/home/user/certs/certificate.p12
```

Then in `.env`:
```
CERT_P12=/home/user/certs/certificate.p12
```

---

### Filter-link statistics

For an existing database, apply the migration before deploying the new web and
ingestion images:

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_add_filter_link_views.sql
docker compose up -d --build --no-deps web ingestion
docker compose exec ingestion python3 /app/report_visits.py --days 7
```

Fresh databases create `filter_link_views` through `db/init.sql`. The report also
requires the existing `page_views` table (on an older installation, apply
`db/migrate_add_page_views.sql` in the same way).
The counters store daily totals by filter value, not unique visitors or referrers.
Only initial map opens with `operator` and/or `road` are counted, not changes in
the filter tools. Counts require the browser's tracking request to succeed.

### Protect the GeoPackage download

The burger menu links to `/downloads`, a public information/contact page with a
custom login form. Configure its shared download account in `.env`:

```dotenv
DOWNLOAD_USERNAME=your-download-user
DOWNLOAD_PASSWORD=your-long-random-password
```

The username must not contain `:`. Keep credentials out of Git and URLs.
Use HTTPS: Basic authentication encodes credentials but does not encrypt them.
The public OGC API is not affected by this download protection.

After setting or rotating credentials, rebuild/recreate the web service:

```bash
docker compose up -d --build --no-deps web
```

Successful login sets an HTTP-only, SameSite=Strict cookie valid for 30 minutes
(Secure in production). It contains a signed expiry, not the credentials.
Changing either environment credential and recreating web invalidates existing
sessions. The page provides logout, which clears that browser's cookie; it does
not revoke copies of the shared session held elsewhere.

The static `/downloads/rastmonitor_daily.gpkg` URL checks authentication on
every request. Browser requests without a session go to `/downloads`; HTTP Basic
authentication remains available for scripts such as curl. Without both server
credentials configured, the file returns HTTP 503. Missing or incorrect API
credentials return HTTP 401 with a Basic challenge.
Download responses are private and non-cacheable; if this URL was
previously cached by a CDN or proxy, purge that cached copy before enabling access.
Do not configure the reverse proxy to serve the exports directory directly.

Verify without credentials (expect 401), then authenticate (curl prompts for the
password; expect 200 once the first export exists):

```bash
curl -I https://rast-monitor.de/downloads/rastmonitor_daily.gpkg
curl -I --user your-download-user https://rast-monitor.de/downloads/rastmonitor_daily.gpkg
```

Browsers may remember Basic credentials until their session is closed.
Logout clears the form's session cookie, not browser-managed Basic credentials.
This is a shared download account, not per-user identification or a rate limiter.
Apply login rate limiting at the reverse proxy (POST requests to `/downloads`);
the login form does not add a distributed brute-force limiter.

## 3. Transfer an existing database or start with real data

### Option A — Dump from local dev machine and restore on server

On your **local machine**:

```bash
# Dump the full database (use only verified source data for production)
docker exec rastmonitor-db-1 pg_dump \
  -U rastmonitor -d rastmonitor \
  --no-owner --no-privileges \
  -Fc -f /tmp/rastmonitor.dump

# Copy dump to server
docker cp rastmonitor-db-1:/tmp/rastmonitor.dump ./rastmonitor.dump
scp rastmonitor.dump user@yourserver:/home/user/rastmonitor/
```

On the **server** (run after step 4's `docker compose up db`):

```bash
# Wait for DB to be healthy, then restore
docker compose exec -T db pg_restore \
  -U rastmonitor -d rastmonitor \
  --no-owner --no-privileges \
  /docker-entrypoint-initdb.d/rastmonitor.dump
```

Or mount the dump as a volume and restore:

```bash
docker run --rm \
  --network rastmonitor_default \
  -v $(pwd)/rastmonitor.dump:/dump.dump \
  postgis/postgis:16-3.4 \
  pg_restore -h db -U rastmonitor -d rastmonitor --no-owner --no-privileges /dump.dump
```

### Option B — Fresh start (no seed data, real data only)

Skip this section. The DB schema is created automatically from `db/init.sql` on first start. Run the ingestion scripts once to populate real data (see step 6).

---

## 4. Prepare the tile directory

The Martin tile server expects a PMTiles file at `./tiles/germany.pmtiles`.

```bash
mkdir -p tiles
```

Download a Germany PMTiles file (choose one):

```bash
# Option A: Protomaps (Germany extract, ~1.3 GB)
wget -O tiles/germany.pmtiles \
  https://build.protomaps.com/20240101.pmtiles
# Note: this is the world file — for a Germany extract, use a regional source

# Option B: Geofabrik + tippecanoe (advanced, not covered here)
```

> If you don't have tiles yet, the basemap will be blank but all parking data still works. 
> Add tiles later and restart the `martin` service.

---

## 5. Build and start all services

```bash
docker compose up -d --build
```

Check all services are healthy:

```bash
docker compose ps
# All services should show "Up" or "healthy"

# Tail logs
docker compose logs -f
```

The web app will be available at `http://yourserver:3000`.

---

## 6. Run the initial data ingestion

```bash
# Populate static parking sites (~1828 sites, run once)
docker compose exec ingestion python fetch_static.py

# Fetch current live occupancy
docker compose exec ingestion python fetch_dynamic.py
```

After this, the map should show colored dots immediately.

---

## 7. Cron schedule (automatic, runs inside the `ingestion` container)

The Dockerfile installs these cron jobs automatically:

| Time | Script | Purpose |
|---|---|---|
| `*/15 * * * *` | `fetch_dynamic.py` | Live occupancy, every 15 min |
| `0 3 * * *` | `fetch_static.py` then `refresh_ogcapi_daily.py` | Refresh static sites, then the historical OGC snapshot |
| `0 2 * * *` | `aggregate_daily.py` then `refresh_ogcapi_daily.py` | Compute daily stats, then refresh the historical OGC snapshot |
| `30 2 * * *` | `prune_raw.py` | Delete raw >72h, daily >6 months |

Times use the ingestion container's timezone. Each snapshot refresh starts only
after its preceding script exits successfully, not at a fixed delay. If an
upstream job fails, its refresh is skipped. A failed refresh retains the previous
snapshot and exits nonzero; both jobs write to `/var/log/cron.log`. The existing
02:00 aggregation / 02:30 pruning order is unchanged.

Verify cron is running inside the container:

```bash
docker compose exec ingestion crontab -l
docker compose logs ingestion
```

Monitor the log file inside the container:

```bash
docker compose exec ingestion tail -f /var/log/cron.log
```

---

## 8. Reverse proxy with nginx (recommended)

To serve on port 80/443 with TLS:

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/rastmonitor`:

```nginx
server {
    server_name yourdomain.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # OGC API Features (pygeoapi)
    location /ogcapi/ {
        proxy_pass http://127.0.0.1:9000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/rastmonitor /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.example.com
sudo systemctl reload nginx
```

---

## 9. Keeping the stack up after reboots

```bash
# Enable Docker to start on boot
sudo systemctl enable docker

# The containers are configured with restart: unless-stopped
# so they will restart automatically after a reboot
```

---

## 11. Automated database backups

Add a cron job on the **host** (not inside Docker) to dump the database daily.

```bash
mkdir -p /home/ricckli/backups/rastmonitor
crontab -e
```

Add this line (04:00 daily, 30-day retention):

```cron
0 4 * * * docker exec rastmonitor-db-1 pg_dump -U rastmonitor -d rastmonitor -Fc | gzip > /home/ricckli/backups/rastmonitor/$(date +\%Y-\%m-\%d).dump.gz && find /home/ricckli/backups/rastmonitor/ -name "*.dump.gz" -mtime +30 -delete
```

**Restore from backup:**

```bash
gunzip -c /home/ricckli/backups/rastmonitor/2026-06-28.dump.gz | \
  docker exec -i rastmonitor-db-1 pg_restore \
  -U rastmonitor -d rastmonitor --no-owner --clean
```

> `init.sql` only runs on a **fresh empty volume**. If you ever recreate the volume,
> restore from a backup — the schema + data won't come back from init.sql alone.

---

## 10. OGC API Features (pygeoapi)

The `pygeoapi` service exposes three OGC API Features collections at `https://rast-monitor.de/ogcapi/`.

### One-time DB migration (run after first deployment or upgrade)

```bash
docker compose cp db/migrate_add_ogcapi_views.sql db:/tmp/
docker compose exec db psql -U rastmonitor -d rastmonitor -f /tmp/migrate_add_ogcapi_views.sql
```

### Historical collection: materialized snapshot

The migration below creates `public.mv_parking_daily` as a populated
snapshot of the existing `public.v_parking_daily`. It retains the source view's
columns, geometries, and public feature IDs. It adds a unique B-tree index on `id`,
a B-tree index on `day`, and a GiST index on `geom`, then runs `ANALYZE`.
The source OGC views and their static-attribute columns must already exist.

**The current `parking_daily` provider uses `mv_parking_daily`. Apply this migration
before deploying the changed pygeoapi image.** The original `v_parking_daily`
remains available for comparisons and rollback. No existing tables or views are
dropped. Allow additional database storage for the snapshot and its indexes.

From the repository root on the server, preferably outside busy periods:

```bash
docker compose exec -T db sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < db/migrate_add_ogcapi_daily_materialized.sql
```

The migration uses a 5-second lock timeout and a 120-second statement timeout.
It runs in a transaction, so errors roll back changes from that execution. It is
safe to rerun, but an existing snapshot is not repopulated or structurally upgraded
by `IF NOT EXISTS`. If the source view's columns later change, plan an explicit
snapshot schema migration rather than assuming this script updates it.

Compare the original and materialized view using the same count and ID-ordered
queries at offsets 0, 53,900, and 150,000:

```bash
docker compose exec -T db sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < db/benchmark_ogcapi_daily.sql
```

Run the benchmark twice and retain both outputs. It uses a read-only transaction,
a 15-second timeout per statement, and `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`.
It really executes the SELECTs and therefore consumes CPU and I/O. These are
controlled comparison queries, not an exact replay of every provider projection
or geometry-serialization step. Compare execution times, `Sort` nodes, temporary
buffers, and use of `mv_parking_daily_id_idx`. A sequential scan for `COUNT(*)` can
still be appropriate; a large `OFFSET` still needs to skip index entries.

### Enable the snapshot in production

After applying the migration, build the updated images without starting them:

```bash
docker compose build ingestion pygeoapi
```

Refresh the snapshot using the newly built ingestion image before switching the
running API. If this command fails, do not continue to the deployment command:

```bash
docker compose run --rm --no-deps --entrypoint /usr/local/bin/python3 \
  ingestion /app/refresh_ogcapi_daily.py
```

Outside the daily ingestion jobs, replace only the two affected services:

```bash
docker compose up -d --no-deps ingestion pygeoapi
docker compose exec ingestion crontab -l
docker compose logs --tail=50 pygeoapi
```

The refreshed snapshot is now used by the historical collection. The live and
72-hour collections, pagination settings, and provider count behavior are unchanged.
Verify the root/items endpoints, ID lookup, datetime/bbox filters, returned
properties and geometries, and a complete paginated QGIS download. Compare the
IDs and total count with the original view using the same data snapshot.

After deployment, manual refreshes use the running ingestion container:

```bash
docker compose exec ingestion python /app/refresh_ogcapi_daily.py
```

For direct SQL maintenance without the ingestion image:

```bash
docker compose exec -T db sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SET lock_timeout = '5s';
SET statement_timeout = '120s';
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parking_daily;
ANALYZE public.mv_parking_daily;
SQL
```

The initial migration populates the snapshot and supplies the unique index needed
for concurrent refresh. During a refresh, readers can continue using the previous
snapshot. The 90-day cutoff is evaluated at refresh time, not on each API request.
New daily aggregates and updated site metadata appear only after a refresh; even
without inserts, refresh is needed to age old days out of the rolling window.

The ingestion crontab refreshes the snapshot after successful daily aggregation
and static-data updates. Inspect `/var/log/cron.log` for
`[refresh_ogcapi_daily]` messages: success includes elapsed time, and failures
include a traceback and nonzero process exit. The script sets a 5-second lock
timeout and a 120-second statement timeout. It does not silently create a missing
snapshot or fall back to a blocking refresh. A successful refresh is committed
before `ANALYZE`; if analysis alone fails, the new snapshot is already available.

```bash
docker compose exec ingestion tail -n 100 /var/log/cron.log
```

These logs provide failure visibility, not automatic alert delivery. Include them
in server monitoring and verify successful refreshes after both daily jobs;
otherwise a failed upstream job or refresh can leave an old snapshot being served.
Manual aggregation or static-data runs outside cron must be followed by a manual
refresh. An hourly/15-minute refresh is not needed for these daily aggregates.

To roll back the API source, change only the `parking_daily` provider's `table`
in `pygeoapi/config.yml.template` from `mv_parking_daily` to `v_parking_daily`, then
run `docker compose up -d --build --no-deps pygeoapi`. The original feature-ID
format is unchanged. Keep the snapshot and its refresh jobs while investigating;
no table/view deletion is required for rollback.

### Available collections

| Collection | URL | Description |
|---|---|---|
| Landing page | `/ogcapi/` | API root |
| Conformance | `/ogcapi/conformance` | OGC conformance classes |
| Collections | `/ogcapi/collections` | List all three collections |
| **Live** | `/ogcapi/collections/parking_live/items` | Current occupancy, 1 row/site |
| **72h** | `/ogcapi/collections/parking_72h/items` | All readings, last 72 h |
| **Daily** | `/ogcapi/collections/parking_daily/items` | Daily stats, last 90 days |

### Example queries

```bash
# Get all live data (first 100 sites)
curl "https://rast-monitor.de/ogcapi/collections/parking_live/items?f=json"

# 72h readings for a specific 30-minute window
curl "https://rast-monitor.de/ogcapi/collections/parking_72h/items?datetime=2024-06-01T13:45:00Z/2024-06-01T14:15:00Z&f=json"

# Daily stats for a specific day
curl "https://rast-monitor.de/ogcapi/collections/parking_daily/items?datetime=2024-06-01&f=json"

# Filter by Autobahn (property filter)
curl "https://rast-monitor.de/ogcapi/collections/parking_live/items?road_identifier=A2&f=json"
```

### Add PYGEOAPI_BASE_URL to .env

```
PYGEOAPI_BASE_URL=https://rast-monitor.de/ogcapi
```

---

## 11. Useful maintenance commands

```bash
# View all container logs
docker compose logs -f

# Restart a single service
docker compose restart web

# Run a one-off ingestion manually
docker compose exec ingestion python fetch_dynamic.py

# Connect to the database
docker compose exec db psql -U rastmonitor -d rastmonitor

# Check DB row counts
docker compose exec db psql -U rastmonitor -d rastmonitor -c "
  SELECT 'parking_sites' AS tbl, COUNT(*) FROM parking_sites
  UNION ALL
  SELECT 'parking_status', COUNT(*) FROM parking_status
  UNION ALL
  SELECT 'parking_status_daily', COUNT(*) FROM parking_status_daily;
"

# Backup the database
docker compose exec db pg_dump -U rastmonitor -d rastmonitor -Fc \
  > backup_$(date +%Y%m%d).dump

# Pull latest code and redeploy
git pull
docker compose up -d --build
```

---

## Remove the synthetic field and start the dataset on 1 July 2026

This is a destructive schema migration. It removes `is_synthetic` from raw and
daily data and recreates the dependent OGC views and materialized snapshot.
The live API view is also recreated to support older column layouts.
Records before **2026-07-01** are deleted; raw timestamps use **UTC midnight**.
July 1 itself is retained. Static site records are not deleted. Check constraints
prevent historical records before the cutoff from being inserted again.
Existing rolling retention (72 hours / six months, API snapshot 90 days) remains
unchanged: July 1 is a lower bound, not permanent archival retention.

Do not run the old `migrate_add_synthetic.sql` afterward. The test-data seeder
is for isolated development databases only, never production.

Allow a short maintenance window. Pull the code, then build before stopping
services. Do not start the new images until the migration succeeds:

```bash
docker compose build ingestion web pygeoapi
```

Create a backup outside the repository. This example uses a private directory:

```bash
mkdir -p "$HOME/rastmonitor-backups"
chmod 700 "$HOME/rastmonitor-backups"
umask 077
backup="$HOME/rastmonitor-backups/before-cleanup-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose stop ingestion web pygeoapi
docker compose exec -T db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup" &&
docker compose exec -T db pg_restore --list < "$backup" > /dev/null
```

**Proceed only if the backup and archive-list check succeed.** Copy the backup
off-server too. Copy the migration directory because the cleanup uses a relative
include to rebuild the OGC views:

```bash
docker compose cp ./db db:/tmp/rastmonitor-cleanup-db
docker compose exec -T db sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -f /tmp/rastmonitor-cleanup-db/migrate_remove_synthetic.sql'
```

The migration is transactional and deliberately does not use `CASCADE`. A lock
timeout or unexpected dependency aborts the transaction; investigate the error
before restarting updated services. Do not bypass it by adding `CASCADE`.
Recreated views are owned by the migration user; if you use custom read-only
roles, reapply their grants before starting those clients.

After success, regenerate the downloadable file before reopening the web service:

```bash
docker compose run --rm --no-deps --entrypoint /usr/local/bin/python3 \
  ingestion /app/export_gpkg.py &&
docker compose up -d --no-deps ingestion web pygeoapi
```

If export fails, keep web stopped: the previous GeoPackage still contains the
old fields and records. Fix the export and repeat the command. Regenerate or
delete any other previously published CSV/GeoPackage copies separately; this
migration cannot recall files already downloaded by users.

Verify the cutoff and that no public tables/views retain the field:

```bash
docker compose exec -T db sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT min(day), count(*) FILTER (WHERE day < DATE '2026-07-01') AS before_cutoff
FROM parking_status_daily;
SELECT min(fetched_at),
       count(*) FILTER (WHERE fetched_at < TIMESTAMPTZ '2026-07-01 00:00:00+00') AS before_cutoff
FROM parking_status;
SELECT c.relname, a.attname
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND a.attname = 'is_synthetic'
  AND a.attnum > 0 AND NOT a.attisdropped;
SQL
```

Both `before_cutoff` counts must be zero; the last query must return no rows.
Check the OGC collection schemas, map charts and authenticated GeoPackage
download. Restarting pygeoapi regenerates OpenAPI against the new schema.
Existing QGIS layers may need to be removed and re-added to update cached fields.
Feature IDs for retained rows are unchanged. Purge any proxy/CDN caches if enabled.
Recovery of deleted records requires restoring the backup; reverting the code
alone is not a rollback.

---

## Architecture overview (production)

```
Internet
   │
   ▼
nginx (port 80/443, TLS)
   │
   ▼
Next.js web (port 3000)
   ├── /api/sites       → PostgreSQL (parking_sites + parking_status_live)
   ├── /api/raw         → PostgreSQL (parking_status, 72h)
   ├── /api/daily       → PostgreSQL (parking_status_daily, 6 months)
   ├── /api/map-style   → style JSON (no external tile CDN)
   └── /tiles/*         → Martin tile server (germany.pmtiles)

Martin (internal only, not exposed to host)
   └── serves germany.pmtiles

Ingestion (cron)
   └── Mobilithek API (mTLS via .p12) → PostgreSQL

pygeoapi (internal, port 9000)
   └── /ogcapi/ → OGC API Features (3 collections)
       ├── parking_live   — live occupancy (1 row/site)
       ├── parking_72h    — raw readings, last 72 h (filterable by datetime)
       └── parking_daily  — daily stats, last 90 days (filterable by datetime)
```

> All browser traffic stays on your domain — no external tile CDN, no external API calls from the client.
