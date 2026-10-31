import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { readUrlFilters } from '@/lib/filter-url'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected filter parameters' }, { status: 400 })
  }
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(body)) {
    if (name !== 'operator' && name !== 'road') continue
    if (typeof value !== 'string' || value.length > 200 || value.includes('\0')) {
      return NextResponse.json({ error: 'Invalid filter value (maximum 200 characters)' }, { status: 400 })
    }
    params.set(name, value)
  }
  const entries = Object.entries(readUrlFilters(params))
    .filter(([, value]) => value !== '')
    .map(([name, value]) => [name, name === 'operator' ? value.toLowerCase() : value])
  if (!entries.length) {
    return NextResponse.json({ error: 'At least one non-empty filter is required' }, { status: 400 })
  }
  try {
    await pool.query(
      `INSERT INTO filter_link_views (day, parameter_name, parameter_value, count)
       SELECT CURRENT_DATE, parameter_name, parameter_value, 1
       FROM unnest($1::text[], $2::text[]) AS filters(parameter_name, parameter_value)
       ON CONFLICT (day, parameter_name, parameter_value)
       DO UPDATE SET count = filter_link_views.count + 1`,
      [entries.map(([name]) => name), entries.map(([, value]) => value)]
    )
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error('Could not record filter link open:', error)
    return NextResponse.json({ error: 'Could not record filter link open' }, { status: 500 })
  }
}
