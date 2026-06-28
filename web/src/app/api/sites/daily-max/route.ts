import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/sites/daily-max?date=YYYY-MM-DD
 * Returns GeoJSON with each site's daily max occupancy from parking_status_daily.
 */
export async function GET(req: NextRequest) {
  const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  const dateParam = req.nextUrl.searchParams.get('date')
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(EMPTY, { status: 400 })
  }

  try {
    const result = await pool.query(
      `SELECT
         ps.datex_id,
         ps.name,
         ps.total_spaces,
         ST_X(ps.location) AS longitude,
         ST_Y(ps.location) AS latitude,
         d.max_pct         AS occupancy_pct,
         d.mean_pct,
         d.min_pct,
         d.is_synthetic
       FROM parking_sites ps
       LEFT JOIN parking_status_daily d
         ON ps.datex_id = d.datex_id AND d.day = $1::date
       ORDER BY ps.datex_id`,
      [dateParam]
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
          mean_pct: r.mean_pct !== null ? Number(r.mean_pct) : null,
          min_pct: r.min_pct !== null ? Number(r.min_pct) : null,
          site_status: null,
          opening_status: null,
          fetched_at: dateParam,
          is_synthetic: r.is_synthetic ?? false,
        },
      })),
    }

    return NextResponse.json(geojson, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  } catch {
    return NextResponse.json(EMPTY, { status: 500 })
  }
}
