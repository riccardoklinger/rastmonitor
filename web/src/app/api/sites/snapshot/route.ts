import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/sites/snapshot?at=<ISO8601>
 * Returns a GeoJSON FeatureCollection with each site's most recent status
 * recorded at or before the given timestamp (within the 72-hour raw window).
 */
export async function GET(req: NextRequest) {
  const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  const atParam = req.nextUrl.searchParams.get('at')
  if (!atParam) return NextResponse.json(EMPTY, { status: 400 })

  const at = new Date(atParam)
  if (isNaN(at.getTime())) return NextResponse.json(EMPTY, { status: 400 })

  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (ps.datex_id)
         ps.datex_id,
         ps.name,
         ps.total_spaces,
         ST_X(ps.location)   AS longitude,
         ST_Y(ps.location)   AS latitude,
         pst.occupancy_pct,
         pst.site_status,
         pst.opening_status,
         pst.fetched_at,
         pst.is_synthetic
       FROM parking_sites ps
       LEFT JOIN parking_status pst
         ON ps.datex_id = pst.datex_id
        AND pst.fetched_at <= $1
       ORDER BY ps.datex_id, pst.fetched_at DESC`,
      [at.toISOString()]
    )

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: result.rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude)] },
        properties: {
          datex_id: r.datex_id,
          name: r.name,
          total_spaces: r.total_spaces,
          occupancy_pct: r.occupancy_pct !== null ? Number(r.occupancy_pct) : null,
          site_status: r.site_status,
          opening_status: r.opening_status,
          fetched_at: r.fetched_at,
          is_synthetic: r.is_synthetic ?? false,
        },
      })),
    }

    return NextResponse.json(geojson, { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch {
    return NextResponse.json(EMPTY, { status: 500 })
  }
}
