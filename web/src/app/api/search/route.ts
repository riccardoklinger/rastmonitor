import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/search?q=<text>&limit=10
 * Returns matching parking sites (name search) with live occupancy.
 */
export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 10), 20)

  if (q.length < 2) return NextResponse.json([])

  try {
    const result = await pool.query(
      `SELECT
         ps.datex_id,
         ps.name,
         ps.total_spaces,
         ST_X(ps.location) AS longitude,
         ST_Y(ps.location) AS latitude,
         psl.occupancy_pct
       FROM parking_sites ps
       LEFT JOIN parking_status_live psl ON ps.datex_id = psl.datex_id
       WHERE ps.name ILIKE $1
       ORDER BY ps.name
       LIMIT $2`,
      [`%${q}%`, limit]
    )

    return NextResponse.json(
      result.rows.map(r => ({
        datex_id:    r.datex_id,
        name:        r.name,
        total_spaces: r.total_spaces,
        longitude:   Number(r.longitude),
        latitude:    Number(r.latitude),
        occupancy_pct: r.occupancy_pct !== null ? Number(r.occupancy_pct) : null,
      })),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return NextResponse.json([])
  }
}
