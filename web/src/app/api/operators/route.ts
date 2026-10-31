import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await pool.query<{ operator: string }>(
      `SELECT DISTINCT BTRIM(operator_name) AS operator
       FROM parking_sites
       WHERE operator_name IS NOT NULL
         AND BTRIM(operator_name) <> ''`
    )
    const operators = rows.map(row => row.operator)
      .sort((first, second) => first.localeCompare(second, 'de', { numeric: true }))

    return NextResponse.json(operators, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })
  } catch {
    return NextResponse.json({ error: 'Betreiber konnten nicht geladen werden.' }, { status: 500 })
  }
}
