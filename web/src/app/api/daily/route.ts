import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/daily?datex_id=xxx&days=180
 * Returns daily aggregates (mean/max/min/median) for a parking site.
 * Default: last 180 days.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const datexId = searchParams.get('datex_id')
  const days = Math.min(Number(searchParams.get('days') ?? 180), 180)

  if (!datexId) {
    return NextResponse.json({ error: 'datex_id is required' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `SELECT
       day,
       mean_occ,
       max_occ,
       min_occ,
       median_occ,
       sample_count,
       is_synthetic
     FROM parking_status_daily
     WHERE datex_id = $1
       AND day >= now() - ($2 || ' days')::INTERVAL
     ORDER BY day ASC`,
    [datexId, days],
  )

  return NextResponse.json(rows)
}
