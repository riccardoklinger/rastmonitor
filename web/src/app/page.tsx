'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback } from 'react'
import type { SiteProperties } from '@/components/Map'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })
const SitePanel = dynamic(() => import('@/components/SitePanel'), { ssr: false })
const TimeSlider = dynamic(() => import('@/components/TimeSlider'), { ssr: false })
const DayPicker = dynamic(() => import('@/components/DayPicker'), { ssr: false })

import type { DailyMetric } from '@/components/DayPicker'

type ViewMode = 'live' | 'history' | 'dailymax'

export default function Home() {
  const [selectedSite, setSelectedSite] = useState<SiteProperties | null>(null)
  const [mode, setMode] = useState<ViewMode>('live')
  const [snapshotTime, setSnapshotTime] = useState<Date | null>(null)
  const [dailyDate, setDailyDate] = useState<string>('')
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>('max')

  const handleTimeChange = useCallback((t: Date | null) => {
    setSnapshotTime(t)
  }, [])

  const handleDayChange = useCallback((d: string, m: DailyMetric) => {
    setDailyDate(d)
    setDailyMetric(m)
  }, [])

  const METRIC_LABELS = { max: 'Maximum', mean: 'Mittelwert', median: 'Median', min: 'Minimum' }

  const dataUrl =
    mode === 'dailymax' && dailyDate
      ? `/api/sites/daily-max?date=${dailyDate}&metric=${dailyMetric}`
      : mode === 'history' && snapshotTime
      ? `/api/sites/snapshot?at=${encodeURIComponent(snapshotTime.toISOString())}`
      : '/api/sites'

  const metricLabel =
    mode === 'dailymax' ? METRIC_LABELS[dailyMetric] :
    mode === 'history'  ? 'Auslastung (historisch)' :
    'Auslastung (live)'

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* Map fills everything except the bottom control bar */}
      <div className="absolute inset-0 bottom-14">
        <Map onSiteSelect={setSelectedSite} dataUrl={dataUrl} metricLabel={metricLabel} />
      </div>

      {selectedSite && (
        <SitePanel site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}

      {/* Footer links */}
      <div className="absolute top-3 right-16 z-10 flex gap-2 text-xs">
        <a
          href="https://github.com/sponsors/riccardoklinger"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 bg-pink-500/90 rounded shadow text-white hover:bg-pink-600 transition"
        >
          ♥ Sponsor
        </a>
        <a
          href="/about"
          className="px-2 py-1 bg-white/90 rounded shadow text-gray-600 hover:text-gray-900 hover:bg-white transition"
        >
          Über
        </a>
        <a
          href="/impressum"
          className="px-2 py-1 bg-white/90 rounded shadow text-gray-600 hover:text-gray-900 hover:bg-white transition"
        >
          Impressum
        </a>
        <a
          href="https://github.com/riccardoklinger/rastmonitor"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 bg-white/90 rounded shadow text-gray-600 hover:text-gray-900 hover:bg-white transition"
        >
          GitHub
        </a>
      </div>

      {/* Mode toggle — top centre */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex rounded-lg shadow border border-gray-200 overflow-hidden text-sm font-medium">
        {([
          ['live',     '● Live'],
          ['history',  '⏱ 72h'],
          ['dailymax', '📅 90T'],
        ] as [ViewMode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 transition ${
              mode === m
                ? m === 'dailymax'
                  ? 'bg-amber-500 text-white'
                  : 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selectedSite && (
        <SitePanel site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}

      {/* Legend */}
      <div className="absolute bottom-16 left-4 bg-white rounded-lg shadow-md p-3 text-xs space-y-1 z-10">
        <p className="font-semibold text-gray-700 mb-1">
          {mode === 'dailymax'
            ? { max: 'Tagesmaximum', mean: 'Tagesmittel', median: 'Tagesmedian', min: 'Tagesminimum' }[dailyMetric]
            : 'Auslastung'}
        </p>
        {[
          ['#22c55e', '< 50 %'],
          ['#eab308', '50 – 80 %'],
          ['#f97316', '80 – 95 %'],
          ['#ef4444', '95 – 100 %'],
          ['#7f1d1d', '> 100 % (überfüllt)'],
          ['#9ca3af', 'Keine Daten'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full border border-white" style={{ backgroundColor: color }} />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Bottom control bar */}
      {mode === 'history' && <TimeSlider onChange={handleTimeChange} />}
      {mode === 'dailymax' && <DayPicker onChange={handleDayChange} />}
      {mode === 'live' && (
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-white/80 border-t border-gray-200 flex items-center justify-center z-10">
          <span className="flex items-center gap-2 text-sm text-green-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live-Daten · Aktualisierung alle 15 Minuten
          </span>
        </div>
      )}
    </main>
  )
}
