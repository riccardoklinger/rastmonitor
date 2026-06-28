import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/raw?datex_id=xxx
 * Returns the last 72 h of raw 15-min occupancy readings for a parking site.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const datexId = searchParams.get('datex_id')

  if (!datexId) {
    return NextResponse.json({ error: 'datex_id is required' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `SELECT
       fetched_at,
       occupancy_pct,
       vacant_spaces,
       occupied_spaces,
       site_status,
       opening_status,
       is_synthetic
     FROM parking_status
     WHERE datex_id = $1
       AND fetched_at >= now() - INTERVAL '72 hours'
     ORDER BY fetched_at ASC`,
    [datexId],
  )

  return NextResponse.json(rows)
}
