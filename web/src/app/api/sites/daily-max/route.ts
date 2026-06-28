import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

type Metric = 'max' | 'mean' | 'median' | 'min'

const METRIC_COLUMN: Record<Metric, string> = {
  max:    'max_occ',
  mean:   'mean_occ',
  median: 'median_occ',
  min:    'min_occ',
}

/**
 * GET /api/sites/daily-max?date=YYYY-MM-DD&metric=max|mean|median|min
 * Returns GeoJSON with each site's chosen daily metric from parking_status_daily.
 */
export async function GET(req: NextRequest) {
  const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  const dateParam = req.nextUrl.searchParams.get('date')
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(EMPTY, { status: 400 })
  }

  const metricParam = req.nextUrl.searchParams.get('metric') ?? 'max'
  const col = Object.hasOwn(METRIC_COLUMN, metricParam)
    ? METRIC_COLUMN[metricParam as Metric]
    : METRIC_COLUMN.max

  try {
    const result = await pool.query(
      `SELECT
         ps.datex_id,
         ps.name,
         ps.total_spaces,
         ST_X(ps.location)  AS longitude,
         ST_Y(ps.location)  AS latitude,
         d.${col}           AS occupancy_pct,
         d.max_occ, d.mean_occ, d.median_occ, d.min_occ,
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
          datex_id:     r.datex_id,
          name:         r.name,
          total_spaces: r.total_spaces,
          occupancy_pct: r.occupancy_pct !== null ? Number(r.occupancy_pct) : null,
          max_occ:      r.max_occ    !== null ? Number(r.max_occ)    : null,
          mean_occ:     r.mean_occ   !== null ? Number(r.mean_occ)   : null,
          median_occ:   r.median_occ !== null ? Number(r.median_occ) : null,
          min_occ:      r.min_occ    !== null ? Number(r.min_occ)    : null,
          site_status:    null,
          opening_status: null,
          fetched_at:   dateParam,
          is_synthetic: r.is_synthetic ?? false,
          metric:       metricParam,
        },
      })),
    }

    return NextResponse.json(geojson, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  } catch {
    return NextResponse.json(EMPTY, { status: 500 })
  }
}
