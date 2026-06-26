import { Pool } from "pg";
import type { AggregateBucket, AggregateParkingPoint, LiveParkingPoint, ScrapedParkingPoint } from "@/backend/types";

const globalForPg = globalThis as unknown as { pool?: Pool };

function getPool() {
  if (globalForPg.pool) return globalForPg.pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  globalForPg.pool = new Pool({
    connectionString: databaseUrl,
  });

  return globalForPg.pool;
}

export async function initSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS parking_locations (
      location_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parking_snapshots (
      id BIGSERIAL PRIMARY KEY,
      location_id TEXT NOT NULL REFERENCES parking_locations(location_id) ON DELETE CASCADE,
      usage DOUBLE PRECISION NULL,
      capacity INTEGER NULL,
      available INTEGER NULL,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_parking_snapshots_location_scraped_at
      ON parking_snapshots(location_id, scraped_at DESC);
  `);
}

export async function upsertLocationsAndSnapshots(rows: ScrapedParkingPoint[]) {
  if (!rows.length) return;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    for (const row of rows) {
      await client.query(
        `INSERT INTO parking_locations (location_id, name, lat, lng)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (location_id)
         DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
        [row.locationId, row.name, row.lat, row.lng],
      );

      await client.query(
        `INSERT INTO parking_snapshots (location_id, usage, capacity, available)
         VALUES ($1, $2, $3, $4)`,
        [row.locationId, row.usage, row.capacity, row.available],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getLiveParkingData(): Promise<LiveParkingPoint[]> {
  const result = await getPool().query<LiveParkingPoint>(`
    WITH ranked AS (
      SELECT
        l.location_id AS "locationId",
        l.name,
        l.lat,
        l.lng,
        s.usage,
        s.capacity,
        s.available,
        s.scraped_at AS "scrapedAt",
        ROW_NUMBER() OVER (PARTITION BY l.location_id ORDER BY s.scraped_at DESC) AS rn
      FROM parking_locations l
      LEFT JOIN parking_snapshots s ON s.location_id = l.location_id
    )
    SELECT
      "locationId",
      name,
      lat,
      lng,
      usage,
      capacity,
      available,
      "scrapedAt"
    FROM ranked
    WHERE rn = 1
    ORDER BY name ASC
  `);

  return result.rows.map((row) => ({
    ...row,
    scrapedAt: row.scrapedAt ? new Date(row.scrapedAt).toISOString() : null,
  }));
}

function getRange(bucket: AggregateBucket, month?: string) {
  const now = new Date();

  if (bucket === "last_month") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 1);
    return {
      from,
      to: now,
    };
  }

  if (bucket === "last_3_months") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return {
      from,
      to: now,
    };
  }

  const selected = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const from = new Date(`${selected}-01T00:00:00.000Z`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);

  return {
    from,
    to,
  };
}

export async function getAggregatedParkingData(bucket: AggregateBucket, month?: string): Promise<AggregateParkingPoint[]> {
  const range = getRange(bucket, month);

  const result = await getPool().query<AggregateParkingPoint>(
    `
      WITH filtered AS (
        SELECT
          s.location_id,
          s.usage,
          s.scraped_at
        FROM parking_snapshots s
        WHERE s.scraped_at >= $1
          AND s.scraped_at < $2
      )
      SELECT
        l.location_id AS "locationId",
        l.name,
        l.lat,
        l.lng,
        MIN(filtered.usage) AS "minUsage",
        MAX(filtered.usage) AS "maxUsage",
        AVG(filtered.usage) AS "meanUsage",
        COUNT(filtered.usage)::INT AS "sampleCount",
        MIN(filtered.scraped_at)::TEXT AS "from",
        MAX(filtered.scraped_at)::TEXT AS "to"
      FROM parking_locations l
      LEFT JOIN filtered ON filtered.location_id = l.location_id
      GROUP BY l.location_id, l.name, l.lat, l.lng
      ORDER BY l.name ASC
    `,
    [range.from, range.to],
  );

  return result.rows;
}
