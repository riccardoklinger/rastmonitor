import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/sites/aggregate?period=72h|90d
 *
 * Returns min / mean / max occupancy per site over the requested period.
 *
 * 72h  — aggregated from parking_status (raw rows, already pruned to ~72 h)
 * 90d  — aggregated from parking_status_daily (one pre-aggregated row per day)
 *        MIN of daily min_occ, AVG of daily mean_occ, MAX of daily max_occ
 */
export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '72h'

  if (period !== '72h' && period !== '90d') {
    return NextResponse.json({ error: 'period must be 72h or 90d' }, { status: 400 })
  }

  try {
    let rows: Record<string, unknown>[]

    if (period === '72h') {
      const result = await pool.query(`
        SELECT
          ps.datex_id,
          ps.name,
          ps.road_identifier,
          ps.road_destination,
          ps.operator_name,
          ps.total_spaces,
          MIN(pst.occupancy_pct)              AS min_occ,
          ROUND(AVG(pst.occupancy_pct)::numeric, 1) AS mean_occ,
          MAX(pst.occupancy_pct)              AS max_occ,
          COUNT(pst.occupancy_pct)            AS data_points
        FROM parking_sites ps
        LEFT JOIN parking_status pst
          ON ps.datex_id = pst.datex_id
         AND pst.fetched_at > NOW() - INTERVAL '72 hours'
        GROUP BY ps.datex_id, ps.name, ps.road_identifier, ps.road_destination, ps.operator_name, ps.total_spaces
        ORDER BY ps.name
      `)
      rows = result.rows
    } else {
      // 90d: use daily pre-aggregates; take overall min/avg/max across days
      const result = await pool.query(`
        SELECT
          ps.datex_id,
          ps.name,
          ps.road_identifier,
          ps.road_destination,
          ps.operator_name,
          ps.total_spaces,
          MIN(d.min_occ)                           AS min_occ,
          ROUND(AVG(d.mean_occ)::numeric, 1)       AS mean_occ,
          MAX(d.max_occ)                           AS max_occ,
          COUNT(d.day)                             AS data_points
        FROM parking_sites ps
        LEFT JOIN parking_status_daily d
          ON ps.datex_id = d.datex_id
         AND d.day > CURRENT_DATE - INTERVAL '90 days'
        GROUP BY ps.datex_id, ps.name, ps.road_identifier, ps.road_destination, ps.operator_name, ps.total_spaces
        ORDER BY ps.name
      `)
      rows = result.rows
    }

    const data = rows.map(r => ({
      datex_id:        r.datex_id,
      name:            r.name,
      road_identifier: r.road_identifier ?? null,
      road_destination: r.road_destination ?? null,
      operator_name:   r.operator_name ?? null,
      total_spaces:    r.total_spaces !== null ? Number(r.total_spaces) : null,
      min_occ:         r.min_occ  !== null ? Number(r.min_occ)  : null,
      mean_occ:        r.mean_occ !== null ? Number(r.mean_occ) : null,
      max_occ:         r.max_occ  !== null ? Number(r.max_occ)  : null,
      data_points:     Number(r.data_points),
    }))

    return NextResponse.json(data, {
      headers: { 'Cache-Control': period === '90d' ? 'public, max-age=3600' : 'no-store' },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json([], { status: 500 })
  }
}
