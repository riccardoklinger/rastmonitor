import pool from '@/lib/db'

export async function recordRoutingUsage(success: boolean): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO routing.isochrone_usage_daily (day, requests, successes)
       VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1, $1)
       ON CONFLICT (day) DO UPDATE
       SET requests = routing.isochrone_usage_daily.requests + 1,
           successes = routing.isochrone_usage_daily.successes + EXCLUDED.successes`,
      [success ? 1 : 0]
    )
  } catch (error) {
    console.error('Could not record isochrone usage:', error)
  }
}