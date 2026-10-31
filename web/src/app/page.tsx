'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Building2, List, Menu, Route, Search } from 'lucide-react'
import RoadFilter from '@/components/RoadFilter'
import OperatorFilter from '@/components/OperatorFilter'
import { readUrlFilters, updateFilterUrl } from '@/lib/filter-url'
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
  const toolsRef = useRef<HTMLDivElement>(null)
  const searchToolRef = useRef<HTMLDetailsElement>(null)
  const roadToolRef = useRef<HTMLDetailsElement>(null)
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>('max')

  const [roadFilter, setRoadFilter] = useState('')
  const [roadToolOpen, setRoadToolOpen] = useState(false)
  const operatorToolRef = useRef<HTMLDetailsElement>(null)
  const [operatorFilter, setOperatorFilter] = useState('')
  const [operatorToolOpen, setOperatorToolOpen] = useState(false)
  const linkCountedRef = useRef(false)

  useEffect(() => {
    const filters = readUrlFilters(new URLSearchParams(window.location.search))
    setOperatorFilter(filters.operator)
    setRoadFilter(filters.road)
    if (linkCountedRef.current) return
    linkCountedRef.current = true
    if (!filters.operator && !filters.road) return
    fetch('/api/filter-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
      keepalive: true,
    }).then(response => {
      if (!response.ok) throw new Error(`Filter link count failed (${response.status})`)
    }).catch(error => console.error('Could not record filter link open:', error))
  }, [])

  useEffect(() => {
    const dismissTools = (event: PointerEvent) => {
      toolsRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(tool => {
        if (!tool.contains(event.target as Node)) tool.open = false
      })
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const tool = toolsRef.current?.querySelector<HTMLDetailsElement>('details[open]')
      if (tool) {
        tool.open = false
        tool.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', dismissTools)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissTools)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [])

  const handleRoadFilter = useCallback((val: string) => {
    setRoadFilter(val)
    window.history.replaceState(window.history.state, '', updateFilterUrl(new URL(window.location.href), 'road', val))
    if (roadToolRef.current) {
      roadToolRef.current.open = false
      roadToolRef.current.querySelector('summary')?.focus()
    }
  }, [])

  const handleOperatorFilter = useCallback((val: string) => {
    setOperatorFilter(val)
    window.history.replaceState(window.history.state, '', updateFilterUrl(new URL(window.location.href), 'operator', val))
    if (operatorToolRef.current) {
      operatorToolRef.current.open = false
      operatorToolRef.current.querySelector('summary')?.focus()
    }
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
      occupancy_pct: result.occupancy_pct,
      site_status: null,
      opening_status: null,
      fetched_at: null,
    }
    setSelectedSite(site)
    mapRef.current?.showPopup(result.longitude, result.latitude, site, 'Auslastung (live)')
    if (searchToolRef.current) searchToolRef.current.open = false
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
        <Map ref={mapRef} onSiteSelect={setSelectedSite} dataUrl={dataUrl} metricLabel={metricLabel} operatorFilter={operatorFilter} roadFilter={roadFilter} />
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
        <nav aria-label="Hauptnavigation" className="absolute top-[39px] right-[39px] flex w-40 max-w-[calc(100vw-59px)] max-h-[calc(100dvh-8rem)] flex-col overflow-y-auto rounded bg-white shadow-lg ring-1 ring-black/10">
          <a href="/table" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Tabelle</a>
          <a href="https://rast-monitor.de/ogcapi/" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">API</a>
          <a href="https://github.com/sponsors/riccardoklinger" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">♥ Sponsor</a>
          <a href="/downloads" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Download (GPKG, CSV)</a>
          <a href="/about" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Über</a>
          <a href="/impressum" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">Impressum</a>
          <a href="https://github.com/riccardoklinger/rastmonitor" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">GitHub</a>
        </nav>
      </details>

      {/* Mode toggle — top centre */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex w-max whitespace-nowrap rounded-lg shadow border border-gray-200 overflow-hidden text-sm font-medium">
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

      <div ref={toolsRef} className="absolute top-[88px] right-[10px] z-20 flex flex-col gap-[10px] text-sm">
        <details
          ref={searchToolRef}
          name="map-tools"
          className="relative"
          onToggle={event => {
            if (event.currentTarget.open) event.currentTarget.querySelector('input')?.focus()
          }}
        >
          <summary aria-label="Parkplatz suchen" title="Parkplatz suchen" className="map-toolbar-button">
            <Search size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] w-72 max-w-[calc(100vw-59px)]">
            <SearchBox onSelect={handleSearchSelect} />
          </div>
        </details>

        <details
          ref={roadToolRef}
          name="map-tools"
          className="relative"
          onToggle={event => setRoadToolOpen(event.currentTarget.open)}
        >
          <summary
            aria-label="Autobahn filtern"
            title={roadFilter ? `Autobahn filtern: ${roadFilter}` : 'Autobahn filtern'}
            data-active={Boolean(roadFilter)}
            className="map-toolbar-button"
          >
            <Route size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] w-72 max-w-[calc(100vw-59px)]">
            {roadToolOpen && <RoadFilter value={roadFilter} onSelect={handleRoadFilter} />}
          </div>
        </details>

        <details
          ref={operatorToolRef}
          name="map-tools"
          className="relative"
          onToggle={event => setOperatorToolOpen(event.currentTarget.open)}
        >
          <summary
            aria-label="Betreiber filtern"
            title={operatorFilter ? `Betreiber filtern: ${operatorFilter}` : 'Betreiber filtern'}
            data-active={Boolean(operatorFilter)}
            className="map-toolbar-button"
          >
            <Building2 size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] w-72 max-w-[calc(100vw-59px)]">
            {operatorToolOpen && <OperatorFilter value={operatorFilter} onSelect={handleOperatorFilter} />}
          </div>
        </details>

        <details name="map-tools" className="relative">
          <summary aria-label="Legende anzeigen" title="Legende anzeigen" className="map-toolbar-button">
            <List size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] w-60 max-w-[calc(100vw-59px)] rounded bg-white p-3 shadow-md text-xs space-y-1">
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
        </details>
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
