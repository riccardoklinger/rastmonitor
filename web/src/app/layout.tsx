import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'rastmonitor',
  description: 'Parkplatz-Auslastung Deutschland',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
