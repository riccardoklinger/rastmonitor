import type { Metadata } from 'next'
import './globals.css'
import pool from '@/lib/db'

// Force this layout to run server-side on every request (not cached at build time)
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'rastmonitor',
  description: 'Parkplatz-Auslastung Deutschland',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side page view counter — fire and forget, never blocks rendering
  pool.query(
    `INSERT INTO page_views (day, count) VALUES (CURRENT_DATE, 1)
     ON CONFLICT (day) DO UPDATE SET count = page_views.count + 1`
  ).catch(() => {})

  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
