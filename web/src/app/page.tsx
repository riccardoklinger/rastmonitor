'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { SiteProperties } from '@/components/Map'

// MapLibre must be loaded client-side only (no SSR)
const Map = dynamic(() => import('@/components/Map'), { ssr: false })
const SitePanel = dynamic(() => import('@/components/SitePanel'), { ssr: false })

export default function Home() {
  const [selectedSite, setSelectedSite] = useState<SiteProperties | null>(null)

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      <Map onSiteSelect={setSelectedSite} />

      {selectedSite && (
        <SitePanel site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}

      {/* Legend */}
      <div className="absolute bottom-8 left-4 bg-white rounded-lg shadow-md p-3 text-xs space-y-1 z-10">
        <p className="font-semibold text-gray-700 mb-1">Auslastung</p>
        {[
          ['#22c55e', '< 50 %'],
          ['#eab308', '50 – 80 %'],
          ['#f97316', '80 – 95 %'],
          ['#ef4444', '95 – 100 %'],
          ['#7f1d1d', '> 100 % (überfüllt)'],
          ['#9ca3af', 'Keine Daten'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full border border-white"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
