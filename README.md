# 🅿️ rastmonitor

**Echtzeit-Auslastungsmonitor für LKW-Rastplätze in Deutschland**

→ [rast-monitor.de](https://rast-monitor.de) · [Issue melden](https://github.com/riccardoklinger/rastmonitor/issues) · [Projekt unterstützen](https://github.com/sponsors/riccardoklinger)

---

## Was ist rastmonitor?

rastmonitor visualisiert die aktuelle und historische Belegung von LKW-Rastplätzen auf deutschen Autobahnen. Die Daten stammen aus dem DATEX-II-Feed von [Toll Collect](https://www.toll-collect.de) über die [Mobilithek](https://mobilithek.info) und werden alle 15 Minuten aktualisiert.

### Ansichten

| Modus | Beschreibung |
|-------|-------------|
| **Live** | Aktuelle Auslastung aller Rastplätze |
| **72h** | Zeitreise der letzten 3 Tage (15-Minuten-Schritte) |
| **90 Tage** | Tageshistorie mit Auswahl von Max, Mittel, Median oder Min |

## Datenbasis

| Typ | Beschreibung | Aktualisierung |
|-----|-------------|----------------|
| Statisch | Stammdaten der Rastplätze (Name, Position, Kapazität) | 1× täglich, 03:00 Uhr |
| Dynamisch | Aktuelle Belegung in % | alle 15 Minuten |

Die XSD-Schemata der DATEX-II-Daten liegen unter [`static/xsd/`](./static/xsd/).

## Technischer Stack

| Komponente | Technologie |
|-----------|------------|
| Datenbank | PostgreSQL + PostGIS |
| Ingestion | Python 3.12 + cron |
| Tile-Server | [Martin](https://github.com/maplibre/martin) |
| Frontend | Next.js + MapLibre GL JS |
| Basemap | BKG basemapDE Vektor |
| Betrieb | Docker Compose |

## Lokale Entwicklung

### Voraussetzungen

- Docker & Docker Compose
- Mobilithek-Zugangsdaten (Zertifikat + Endpunkt-URLs)

### Einrichten

```bash
cp .env.example .env
# .env mit eigenen Werten befüllen
docker compose up -d
```

Testdaten einspielen (ohne echte API-Zugangsdaten):

```bash
docker compose run --rm ingestion python3 seed_testdata.py
```

Die Anwendung läuft dann unter [http://localhost:3001](http://localhost:3001).

### Dienste & Ports

| Dienst | Port |
|--------|------|
| Web (Next.js) | 3001 |
| Datenbank (PostgreSQL) | 5433 |
| Tile-Server (Martin) | 3002 |

## Deployment

Siehe [DEPLOYMENT.md](./DEPLOYMENT.md) für die vollständige Anleitung mit nginx und HTTPS.

## Lizenz & Impressum

Dieses Projekt ist Open Source. Datenschutz und Impressum: [rast-monitor.de/impressum](https://rast-monitor.de/impressum)

Daten bereitgestellt von **Toll Collect GmbH** via Mobilithek – lizenziert unter den Nutzungsbedingungen der Mobilithek.