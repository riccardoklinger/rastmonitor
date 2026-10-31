import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await pool.query<{ state: string }>(
      `SELECT DISTINCT BTRIM(state_name) AS state
       FROM parking_sites
       WHERE state_name IS NOT NULL AND BTRIM(state_name) <> ''`
    )
    return NextResponse.json(rows.map(row => row.state).sort((a, b) => a.localeCompare(b, 'de')), {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })
  } catch (error) {
    console.error('Could not load Bundesländer:', error)
    return NextResponse.json({ error: 'Bundesländer konnten nicht geladen werden.' }, { status: 500 })
  }
}
