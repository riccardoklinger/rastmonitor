import { initSchema, upsertLocationsAndSnapshots } from "@/backend/db";
import type { ScrapedParkingPoint } from "@/backend/types";

const scrapeUrl = process.env.SCRAPE_URL;
const DEFAULT_SCRAPE_TIMEOUT_MS = 15000;

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeEntry(entry: Record<string, unknown>, fallbackId: string): ScrapedParkingPoint | null {
  const locationId =
    String(entry.locationId ?? entry.location_id ?? entry.id ?? entry.siteId ?? fallbackId).trim();
  const name = String(entry.name ?? entry.locationName ?? entry.title ?? locationId).trim();

  const lat = parseNumber(entry.lat ?? entry.latitude);
  const lng = parseNumber(entry.lng ?? entry.lon ?? entry.longitude);

  if (lat === null || lng === null) {
    return null;
  }

  return {
    locationId,
    name,
    lat,
    lng,
    usage: parseNumber(entry.usage ?? entry.occupied ?? entry.used ?? entry.currentOccupancy),
    capacity: parseNumber(entry.capacity ?? entry.total ?? entry.spaces),
    available: parseNumber(entry.available ?? entry.free),
  };
}

export function normalizePayload(payload: unknown): ScrapedParkingPoint[] {
  const normalized: ScrapedParkingPoint[] = [];

  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      if (item && typeof item === "object") {
        const point = normalizeEntry(item as Record<string, unknown>, `idx-${index}`);
        if (point) normalized.push(point);
      }
    });
    return normalized;
  }

  if (payload && typeof payload === "object") {
    const asGeoJson = payload as { type?: string; features?: unknown[] };
    if (asGeoJson.type !== "FeatureCollection" || !Array.isArray(asGeoJson.features)) {
      return normalized;
    }

    asGeoJson.features.forEach((feature, index) => {
      if (!feature || typeof feature !== "object") return;

      const f = feature as {
        properties?: Record<string, unknown>;
        geometry?: { coordinates?: unknown[] };
      };

      const coordinates = Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates : [];
      const [lng, lat] = coordinates;
      const merged: Record<string, unknown> = {
        ...(f.properties ?? {}),
        lat,
        lng,
      };

      const point = normalizeEntry(merged, `feature-${index}`);
      if (point) normalized.push(point);
    });
  }

  return normalized;
}

export async function scrapeAndStore() {
  if (!scrapeUrl) {
    throw new Error("SCRAPE_URL is required");
  }

  const configuredTimeoutMs = Number(process.env.SCRAPE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) ? configuredTimeoutMs : DEFAULT_SCRAPE_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);

  const response = await fetch(scrapeUrl, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Scrape request failed: ${response.status}`);
  }

  const payload = await response.json();
  const normalized = normalizePayload(payload);

  await initSchema();
  await upsertLocationsAndSnapshots(normalized);

  return {
    scraped: normalized.length,
  };
}
