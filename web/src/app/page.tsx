'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useRef } from 'react'
import { Menu } from 'lucide-react'
import type { SiteProperties, MapHandle } from '@/components/Map'
import type { DailyMetric } from '@/components/DayPicker'
import type { SearchResult } from '@/components/SearchBox'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })
const SitePanel = dynamic(() => import('@/components/SitePanel'), { ssr: false })
const TimeSlider = dynamic(() => import('@/components/TimeSlider'), { ssr: false })
const DayPicker = dynamic(() => import('@/components/DayPicker'), { ssr: false })
const SearchBox = dynamic(() => import('@/components/SearchBox'), { ssr: false })

type ViewMode = 'live' | 'history' | 'dailymax'

export default function Home() {
  const [selectedSite, setSelectedSite] = useState<SiteProperties | null>(null)
  const [mode, setMode] = useState<ViewMode>('live')
  const [snapshotTime, setSnapshotTime] = useState<Date | null>(null)
  const [dailyDate, setDailyDate] = useState<string>('')
  const mapRef = useRef<MapHandle>(null)
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>('max')

  const [roadFilter, setRoadFilter] = useState('')

  const handleRoadFilter = useCallback((val: string) => {
    setRoadFilter(val)
    mapRef.current?.setRoadFilter(val)
  }, [])

  const handleTimeChange = useCallback((t: Date | null) => {
    setSnapshotTime(t)
  }, [])

  const handleDayChange = useCallback((d: string, m: DailyMetric) => {
    setDailyDate(d)
    setDailyMetric(m)
  }, [])

  const handleSearchSelect = useCallback((result: SearchResult) => {
    mapRef.current?.flyTo(result.longitude, result.latitude, 14)
    const site: SiteProperties = {
      ...result,
      datex_id: result.datex_id,
      name: result.name,
      official_spaces: result.official_spaces,
      total_spaces: result.total_spaces,
      vacant_spaces: null,
      is_synthetic: false,
      occupancy_pct: result.occupancy_pct,
      site_status: null,
      opening_status: null,
      fetched_at: null,
    }
    setSelectedSite(site)
    mapRef.current?.showPopup(result.longitude, result.latitude, site, 'Auslastung (live)')
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
        <Map ref={mapRef} onSiteSelect={setSelectedSite} dataUrl={dataUrl} metricLabel={metricLabel} />
      </div>

      {selectedSite && (
        <SitePanel site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}

      {/* Navigation menu above the map controls */}
      <details name="map-tools" className="group absolute top-[10px] right-[10px] z-20 text-sm">
        <summary
          aria-label="Navigation öffnen"
          title="Navigation öffnen"
          className="map-toolbar-button"
        >
          <Menu size={18} aria-hidden="true" />
        </summary>
        <nav aria-label="Hauptnavigation" className="absolute right-0 mt-2 flex min-w-40 flex-col overflow-hidden rounded bg-white shadow-lg ring-1 ring-black/10">
          <a href="/table" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Tabelle</a>
          <a href="https://rast-monitor.de/ogcapi/" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">API</a>
          <a href="https://github.com/sponsors/riccardoklinger" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">♥ Sponsor</a>
          <a href="/about" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Über</a>
          <a href="/impressum" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Impressum</a>
          <a href="https://github.com/riccardoklinger/rastmonitor" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">GitHub</a>
        </nav>
      </details>

      {/* Search box — top left */}
      <div className="absolute top-3 left-4 z-10">
        <SearchBox onSelect={handleSearchSelect} />
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

      {/* Autobahn filter + Legend — stacked bottom-left */}
      <div className="absolute bottom-16 left-4 z-10 flex flex-col gap-2 items-start">
        {/* Autobahn filter */}
        <div className="bg-white rounded-lg shadow-md px-3 py-2 flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium whitespace-nowrap">🛣 Autobahn</span>
          <input
            type="text"
            value={roadFilter}
            onChange={e => handleRoadFilter(e.target.value.toUpperCase())}
            placeholder="z.B. A2"
            maxLength={6}
            className="w-16 border border-gray-200 rounded px-2 py-0.5 text-xs font-mono uppercase focus:outline-none focus:border-blue-400"
          />
          {roadFilter && (
            <button onClick={() => handleRoadFilter('')} className="text-gray-400 hover:text-gray-700 text-xs">✕</button>
          )}
        </div>

        {/* Legend */}
        <div className="bg-white rounded-lg shadow-md p-3 text-xs space-y-1">
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
