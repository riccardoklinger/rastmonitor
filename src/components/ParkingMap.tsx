"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { LngLatBoundsLike, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type LivePoint = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  usage: number | null;
  capacity: number | null;
  available: number | null;
  scrapedAt: string | null;
};

type AggregatePoint = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  minUsage: number | null;
  maxUsage: number | null;
  meanUsage: number | null;
  sampleCount: number;
  from: string;
  to: string;
};

type Mode = "live" | "last_month" | "last_3_months" | "calendar_month";
type Metric = "mean" | "max" | "min";
const LIVE_REFRESH_INTERVAL_MS = 60_000;

const MAP_BOUNDS: LngLatBoundsLike = [
  [5.5, 47.0],
  [15.5, 55.5],
];

export function ParkingMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [mode, setMode] = useState<Mode>("live");
  const [metric, setMetric] = useState<Metric>("mean");
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [livePoints, setLivePoints] = useState<LivePoint[]>([]);
  const [aggregatePoints, setAggregatePoints] = useState<AggregatePoint[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      bounds: MAP_BOUNDS,
      fitBoundsOptions: { padding: 24 },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      setMapLoaded(true);
      map.addSource("parking", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "parking-points",
        type: "circle",
        source: "parking",
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "value"], 0],
            0,
            "#22c55e",
            50,
            "#f59e0b",
            100,
            "#ef4444",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#111827",
        },
      });

      map.on("click", "parking-points", (event) => {
        const feature = event.features?.[0];
        if (feature?.properties) {
          setSelected(feature.properties as Record<string, unknown>);
        }
      });

      map.on("mouseenter", "parking-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "parking-points", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (mode === "live") {
          const response = await fetch("/api/data/live", { cache: "no-store" });
          if (!response.ok) throw new Error("Failed to load live data");
          const payload = await response.json();
          if (!cancelled) setLivePoints(payload.data ?? []);
        } else {
          const qs = new URLSearchParams({ bucket: mode });
          if (mode === "calendar_month") qs.set("month", month);

          const response = await fetch(`/api/data/aggregates?${qs.toString()}`, { cache: "no-store" });
          if (!response.ok) throw new Error("Failed to load aggregate data");
          const payload = await response.json();
          if (!cancelled) setAggregatePoints(payload.data ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    const timer = mode === "live" ? setInterval(() => void loadData(), LIVE_REFRESH_INTERVAL_MS) : null;

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [mode, month, refreshTick]);

  const features = useMemo(() => {
    if (mode === "live") {
      return livePoints.map((point) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [point.lng, point.lat],
        },
        properties: {
          locationId: point.locationId,
          name: point.name,
          value: point.usage,
          usage: point.usage,
          capacity: point.capacity,
          available: point.available,
          scrapedAt: point.scrapedAt,
        },
      }));
    }

    return aggregatePoints.map((point) => {
      const value = metric === "max" ? point.maxUsage : metric === "min" ? point.minUsage : point.meanUsage;
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [point.lng, point.lat],
        },
        properties: {
          locationId: point.locationId,
          name: point.name,
          value,
          minUsage: point.minUsage,
          maxUsage: point.maxUsage,
          meanUsage: point.meanUsage,
          sampleCount: point.sampleCount,
          from: point.from,
          to: point.to,
        },
      };
    });
  }, [aggregatePoints, livePoints, metric, mode]);

  useEffect(() => {
    if (!mapLoaded) return;
    const source = mapRef.current?.getSource("parking") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features,
    });
  }, [features, mapLoaded]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-3">
        <h1 className="mr-2 text-lg font-semibold">Rastmonitor</h1>

        <select
          className="rounded border border-zinc-300 px-2 py-1"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          <option value="live">Live</option>
          <option value="last_month">Last month</option>
          <option value="last_3_months">Last 3 months</option>
          <option value="calendar_month">Calendar month</option>
        </select>

        {mode !== "live" ? (
          <>
            <select
              className="rounded border border-zinc-300 px-2 py-1"
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
            >
              <option value="mean">Mean usage</option>
              <option value="max">Max usage</option>
              <option value="min">Min usage</option>
            </select>
            {mode === "calendar_month" ? (
              <input
                type="month"
                className="rounded border border-zinc-300 px-2 py-1"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            ) : null}
          </>
        ) : null}

        <button
          type="button"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white"
          onClick={async () => {
            setError(null);
            setMessage(null);
            try {
              const response = await fetch("/api/scrape", { method: "POST" });
              if (!response.ok) {
                throw new Error("Scrape failed");
              }
              setMessage("Scrape completed.");
              setRefreshTick((current) => current + 1);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Scrape failed");
            }
          }}
        >
          Trigger scrape
        </button>

        {loading ? <span className="text-sm text-zinc-500">Loading...</span> : null}
        {message ? <span className="text-sm text-green-700">{message}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </header>

      <div ref={mapContainerRef} className="relative flex-1" />

      {selected ? (
        <aside className="absolute right-4 top-20 z-10 w-80 rounded border border-zinc-300 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{String(selected.name ?? "Parking")}</h2>
            <button type="button" className="text-sm text-zinc-500" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <ul className="space-y-1 text-sm">
            {Object.entries(selected).map(([key, value]) => (
              <li key={key}>
                <span className="font-medium">{key}:</span> {String(value)}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
