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

## 3. Transfer the database (with synthetic seed data)

### Option A — Dump from local dev machine and restore on server

On your **local machine**:

```bash
# Dump the full database (static sites + synthetic seed data)
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
| `0 3 * * *` | `fetch_static.py` | Refresh static sites, daily |
| `0 2 * * *` | `aggregate_daily.py` | Compute daily stats |
| `30 2 * * *` | `prune_raw.py` | Delete raw >72h, daily >6 months |

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

## 10. Useful maintenance commands

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

# Apply a DB migration
docker compose exec -T db psql -U rastmonitor -d rastmonitor \
  < db/migrate_add_synthetic.sql

# Pull latest code and redeploy
git pull
docker compose up -d --build
```

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
```

> All browser traffic stays on your domain — no external tile CDN, no external API calls from the client.
