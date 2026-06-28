import { Pool } from 'pg'

// Reuse the pool across hot reloads in development
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

const pool =
  globalThis._pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool
}

export default pool
