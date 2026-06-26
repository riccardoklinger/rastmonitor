# rastmonitor

Webanwendung zur Visualisierung von LKW-Stellplätzen in Deutschland.

## Funktionen

- Live-Kartenansicht (MapLibre) mit Klick-Modal je Stellplatz
- Backend-Scraper für periodisches Einlesen von Belegungsdaten
- Speicherung in PostgreSQL
- Historische Aggregationen für:
  - Letzten Monat (min/max/mean)
  - Letzte 3 Monate (min/max/mean)
  - Kalender-Monat (min/max/mean)

## Voraussetzungen

- Node.js 20+
- PostgreSQL

## Konfiguration

```bash
DATABASE_URL=postgresql://localhost:5432/rastmonitor
SCRAPE_URL=https://example.com/parking-data.json
SCRAPE_INTERVAL_MINUTES=10
SCRAPE_TIMEOUT_MS=15000
ENABLE_SCRAPER_SCHEDULER=true
SCRAPE_RUN_ON_STARTUP=true
```

`SCRAPE_INTERVAL_MINUTES` wird zwischen 5 und 15 Minuten begrenzt.

## Start

```bash
npm install
npm run dev
```

## Wichtige Endpunkte

- `POST /api/scrape` – manuellen Scrape auslösen
- `GET /api/data/live` – letzte Messung pro Stellplatz
- `GET /api/data/aggregates?bucket=last_month|last_3_months|calendar_month&month=YYYY-MM`
