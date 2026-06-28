import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/sites
 * Returns a GeoJSON FeatureCollection of all parking sites with the latest
 * occupancy data joined from parking_status_live.
 */
export async function GET() {
  const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  let rows: Record<string, unknown>[] = []
  try {
    const result = await pool.query(`
      SELECT
        ps.datex_id,
        ps.name,
        ps.total_spaces,
        ST_X(ps.location)   AS longitude,
        ST_Y(ps.location)   AS latitude,
        psl.occupancy_pct,
        psl.vacant_spaces,
        psl.site_status,
        psl.opening_status,
        psl.fetched_at
      FROM parking_sites ps
      LEFT JOIN parking_status_live psl ON ps.datex_id = psl.datex_id
      ORDER BY ps.datex_id
    `)
    rows = result.rows
  } catch {
    // DB not ready or tables not yet initialised — return empty GeoJSON
    return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'no-store' } })
  }

  const geojson = {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(r.longitude), Number(r.latitude)],
      },
      properties: {
        datex_id: r.datex_id,
        name: r.name,
        total_spaces: r.total_spaces,
        vacant_spaces: r.vacant_spaces !== null ? Number(r.vacant_spaces) : null,
        occupancy_pct: r.occupancy_pct !== null ? Number(r.occupancy_pct) : null,
        site_status: r.site_status,
        opening_status: r.opening_status,
        fetched_at: r.fetched_at,
      },
    })),
  }

  return NextResponse.json(geojson, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
