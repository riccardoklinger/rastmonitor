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
         ps.operator_name,
         ps.address_id, ps.street, ps.house_number, ps.postcode, ps.city,
         ps.country, ps.state_code, ps.state_name,
         ps.road_identifier,
         ps.road_destination,
         ps.free_of_charge,
         ps.location_type,
         ps.certified_secure,
        ps.official_spaces,
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
        operator_name: r.operator_name ?? null,
        address_id: r.address_id ?? null,
        street: r.street ?? null,
        house_number: r.house_number ?? null,
        postcode: r.postcode ?? null,
        city: r.city ?? null,
        country: r.country ?? null,
        state_code: r.state_code ?? null,
        state_name: r.state_name ?? null,
        road_identifier: r.road_identifier ?? null,
        road_destination: r.road_destination ?? null,
        free_of_charge: r.free_of_charge ?? null,
        location_type: r.location_type ?? null,
        certified_secure: r.certified_secure ?? null,
        official_spaces: r.official_spaces !== null ? Number(r.official_spaces) : null,
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
