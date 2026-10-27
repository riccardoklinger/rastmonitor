import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await pool.query<{ road: string }>(
      `SELECT DISTINCT UPPER(BTRIM(road_identifier)) AS road
       FROM parking_sites
       WHERE road_identifier IS NOT NULL
         AND BTRIM(road_identifier) <> ''`
    )
    const roads = rows.map(row => row.road)
      .sort((first, second) => first.localeCompare(second, 'de', { numeric: true }))

    return NextResponse.json(roads, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })
  } catch {
    return NextResponse.json({ error: 'Autobahnen konnten nicht geladen werden.' }, { status: 500 })
  }
}