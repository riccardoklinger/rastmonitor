'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Beer, Building2, Heart, List, MapPinned, Menu, Route, Search, SlidersHorizontal, X } from 'lucide-react'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { Link } from '@/i18n/navigation'
import RoadFilter from '@/components/RoadFilter'
import OperatorFilter from '@/components/OperatorFilter'
import { activeMapFilter, readHighlightedSite, readUrlFilters, updateFilterUrl, updateHighlightedSiteUrl } from '@/lib/filter-url'
import type { SiteProperties, MapHandle } from '@/components/Map'
import type { DailyMetric } from '@/components/DayPicker'
import type { SearchResult } from '@/components/SearchBox'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })
const SitePanel = dynamic(() => import('@/components/SitePanel'), { ssr: false })
const TimeSlider = dynamic(() => import('@/components/TimeSlider'), { ssr: false })
const DayPicker = dynamic(() => import('@/components/DayPicker'), { ssr: false })
const SearchBox = dynamic(() => import('@/components/SearchBox'), { ssr: false })

type ViewMode = 'live' | 'history' | 'dailymax'
const SPONSORS: { name: string; url?: string }[] = []

export default function Home() {
  const t = useTranslations('home')
  const [selectedSite, setSelectedSite] = useState<SiteProperties | null>(null)
  const [mode, setMode] = useState<ViewMode>('live')
  const [snapshotTime, setSnapshotTime] = useState<Date | null>(null)
  const [dailyDate, setDailyDate] = useState<string>('')
  const mapRef = useRef<MapHandle>(null)
  const navigationRef = useRef<HTMLDetailsElement>(null)
  const sponsorDialogRef = useRef<HTMLDialogElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const searchToolRef = useRef<HTMLDetailsElement>(null)
  const roadToolRef = useRef<HTMLDetailsElement>(null)
  const [dailyMetric, setDailyMetric] = useState<DailyMetric>('max')
  const [highlightSiteId, setHighlightSiteId] = useState('')

  const [roadFilter, setRoadFilter] = useState('')
  const [roadToolOpen, setRoadToolOpen] = useState(false)
  const operatorToolRef = useRef<HTMLDetailsElement>(null)
  const [operatorFilter, setOperatorFilter] = useState('')
  const [operatorToolOpen, setOperatorToolOpen] = useState(false)
  const linkCountedRef = useRef(false)
  const stateToolRef = useRef<HTMLDetailsElement>(null)
  const [stateFilter, setStateFilter] = useState('')
  const [stateToolOpen, setStateToolOpen] = useState(false)

  useEffect(() => {
    const filters = readUrlFilters(new URLSearchParams(window.location.search))
    const highlight = readHighlightedSite(new URLSearchParams(window.location.search))
    const active = highlight ? { operator: '', road: '', state: '' } : activeMapFilter(filters)
    setHighlightSiteId(highlight)
    setOperatorFilter(active.operator)
    setRoadFilter(active.road)
    setStateFilter(active.state)
    if (highlight && [filters.operator, filters.road, filters.state].some(Boolean)) {
      const url = new URL(window.location.href)
      url.searchParams.delete('operator')
      url.searchParams.delete('road')
      url.searchParams.delete('state')
      window.history.replaceState(window.history.state, '', url)
    } else if ([filters.operator, filters.road, filters.state].filter(Boolean).length > 1) {
      window.history.replaceState(window.history.state, '', updateFilterUrl(new URL(window.location.href), active.state ? 'state' : 'operator', active.state || active.operator))
    }
    if (linkCountedRef.current) return
    linkCountedRef.current = true
    if (highlight || (!filters.operator && !filters.road && !filters.state)) return
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
      const tool = Array.from(toolsRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []).pop()
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
    setHighlightSiteId('')
    setRoadFilter(val)
    if (val) setOperatorFilter('')
    if (val) setStateFilter('')
    window.history.replaceState(window.history.state, '', updateFilterUrl(new URL(window.location.href), 'road', val))
    if (roadToolRef.current) {
      roadToolRef.current.open = false
      roadToolRef.current.querySelector('summary')?.focus()
    }
  }, [])

  const handleOperatorFilter = useCallback((val: string) => {
    setHighlightSiteId('')
    setOperatorFilter(val)
    if (val) setRoadFilter('')
    if (val) setStateFilter('')
    window.history.replaceState(window.history.state, '', updateFilterUrl(new URL(window.location.href), 'operator', val))
    if (operatorToolRef.current) {
      operatorToolRef.current.open = false
      operatorToolRef.current.querySelector('summary')?.focus()
    }
  }, [])

  const handleStateFilter = useCallback((val: string) => {
    setHighlightSiteId('')
    setStateFilter(val)
    if (val) {
      setOperatorFilter('')
      setRoadFilter('')
    }
    window.history.replaceState(window.history.state, '', updateFilterUrl(new URL(window.location.href), 'state', val))
    if (stateToolRef.current) {
      stateToolRef.current.open = false
      stateToolRef.current.querySelector('summary')?.focus()
    }
  }, [])

  const handleSiteOpen = useCallback((site: SiteProperties) => {
    setHighlightSiteId(site.datex_id)
    setOperatorFilter('')
    setRoadFilter('')
    setStateFilter('')
    window.history.replaceState(window.history.state, '', updateHighlightedSiteUrl(new URL(window.location.href), site.datex_id))
  }, [])

  const handleSiteClose = useCallback(() => {
    setSelectedSite(null)
    if (!highlightSiteId) return
    setHighlightSiteId('')
    window.history.replaceState(window.history.state, '', updateHighlightedSiteUrl(new URL(window.location.href), ''))
  }, [highlightSiteId])

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
    handleSiteOpen(site)
    mapRef.current?.showPopup(result.longitude, result.latitude, site, t('liveOccupancy'))
    if (searchToolRef.current) searchToolRef.current.open = false
  }, [handleSiteOpen, t])

  const metricLabels: Record<DailyMetric, string> = {
    max: t('dailyMax'),
    mean: t('dailyMean'),
    median: t('dailyMedian'),
    min: t('dailyMinimum'),
  }

  const dataUrl =
    mode === 'dailymax' && dailyDate
      ? `/api/sites/daily-max?date=${dailyDate}&metric=${dailyMetric}`
      : mode === 'history' && snapshotTime
      ? `/api/sites/snapshot?at=${encodeURIComponent(snapshotTime.toISOString())}`
      : '/api/sites'

  const metricLabel =
    mode === 'dailymax' ? metricLabels[dailyMetric] :
    mode === 'history'  ? t('historicalOccupancy') :
    t('liveOccupancy')

  return (
    <main className="relative w-screen h-screen overflow-hidden">
      {/* Map fills everything except the bottom control bar */}
      <div className="absolute inset-0 bottom-14">
        <Map ref={mapRef} onSiteSelect={setSelectedSite} onSiteClick={handleSiteOpen} dataUrl={dataUrl} metricLabel={metricLabel} highlightSiteId={highlightSiteId} operatorFilter={operatorFilter} roadFilter={roadFilter} stateFilter={stateFilter} />
      </div>

      {selectedSite && (
        <SitePanel site={selectedSite} onClose={handleSiteClose} />
      )}

      {/* Navigation menu above the map controls */}
      <details ref={navigationRef} name="map-tools" className="group absolute top-[10px] right-[10px] z-20 text-sm">
        <summary
          aria-label={t('navigationOpen')}
          title={t('navigationOpen')}
          className="map-toolbar-button"
        >
          <Menu size={18} aria-hidden="true" />
        </summary>
        <nav aria-label={t('mainNavigation')} className="absolute top-[39px] right-[39px] flex w-40 max-w-[calc(100vw-59px)] max-h-[calc(100dvh-8rem)] flex-col overflow-y-auto rounded bg-white shadow-lg ring-1 ring-black/10">
          <Link href="/table" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">{t('table')}</Link>
          <a href="https://rast-monitor.de/ogcapi/" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">{t('api')}</a>
          <button type="button" onClick={() => {
            if (navigationRef.current) navigationRef.current.open = false
            sponsorDialogRef.current?.showModal()
          }} className="px-4 py-2.5 text-left text-gray-700 hover:bg-gray-100">{t('sponsor')}</button>
          <Link href="/downloads" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">{t('download')}</Link>
          <Link href="/about" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">{t('about')}</Link>
          <Link href="/impressum" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">{t('legal')}</Link>
          <a href="https://github.com/riccardoklinger/rastmonitor" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 text-gray-700 hover:bg-gray-100">{t('github')}</a>
          <div className="border-t border-gray-100 px-4 py-2.5"><LocaleSwitcher /></div>
        </nav>
      </details>

      <dialog
        ref={sponsorDialogRef}
        aria-labelledby="sponsor-title"
        onClose={() => navigationRef.current?.querySelector('summary')?.focus()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.currentTarget.close()
          }
        }}
        onClick={event => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg bg-white p-0 text-gray-800 shadow-xl backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between border-b border-gray-200 pl-5 pr-2 py-2">
          <h2 id="sponsor-title" className="text-base font-semibold">{t('sponsorTitle')}</h2>
          <button type="button" onClick={() => sponsorDialogRef.current?.close()} aria-label={t('close')} title={t('close')} className="flex h-11 w-11 items-center justify-center rounded text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <a href="https://github.com/sponsors/riccardoklinger" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <Heart size={17} aria-hidden="true" /> GitHub Sponsors
            </a>
            <a href="https://www.paypal.com/paypalme/ricckli?locale.x=de_DE" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded border border-blue-700 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <Beer size={17} aria-hidden="true" /> {t('paypal')}
            </a>
          </div>
          <section aria-labelledby="sponsor-list-title">
            <h3 id="sponsor-list-title" className="text-sm font-semibold">{t('sponsors')}</h3>
            {SPONSORS.length > 0 ? (
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {SPONSORS.map(sponsor => (
                  <li key={sponsor.name} className="py-2">
                    {sponsor.url ? <a href={sponsor.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{sponsor.name}</a> : sponsor.name}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-gray-500">{t('noSponsors')}</p>}
          </section>
        </div>
      </dialog>

      {/* Mode toggle — top centre */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex w-max whitespace-nowrap rounded-lg shadow border border-gray-200 overflow-hidden text-sm font-medium">
        {([
          ['live',     t('modeLive')],
          ['history',  t('modeHistory')],
          ['dailymax', t('modeDaily')],
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
          <summary aria-label={t('search')} title={t('search')} className="map-toolbar-button">
            <Search size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] w-72 max-w-[calc(100vw-59px)]">
            <SearchBox onSelect={handleSearchSelect} />
          </div>
        </details>

        <details
          name="map-tools"
          className="relative"
          onToggle={event => {
            if (!event.currentTarget.open) {
              event.currentTarget.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(tool => { tool.open = false })
            }
          }}
        >
          <summary
            aria-label={t('filterOpen')}
            title={roadFilter || operatorFilter || stateFilter
              ? t('activeFilter', { filter: roadFilter || operatorFilter || stateFilter })
              : t('filterOpen')}
            data-active={Boolean(roadFilter || operatorFilter || stateFilter)}
            className="map-toolbar-button"
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] flex gap-[10px]">
            <details ref={roadToolRef} name="filter-tools" className="relative" onToggle={event => setRoadToolOpen(event.currentTarget.open)}>
              <summary
                aria-label={t('roadFilter')}
                title={roadFilter ? t('activeRoadFilter', { filter: roadFilter }) : t('roadFilter')}
                data-active={Boolean(roadFilter)}
                className="map-toolbar-button"
              >
                <Route size={18} aria-hidden="true" />
              </summary>
              <div className="absolute top-[39px] right-[-78px] w-72 max-w-[calc(100vw-59px)]">
                {roadToolOpen && <RoadFilter value={roadFilter} onSelect={handleRoadFilter} />}
              </div>
            </details>

            <details ref={operatorToolRef} name="filter-tools" className="relative" onToggle={event => setOperatorToolOpen(event.currentTarget.open)}>
              <summary
                aria-label={t('operatorFilter')}
                title={operatorFilter ? t('activeOperatorFilter', { filter: operatorFilter }) : t('operatorFilter')}
                data-active={Boolean(operatorFilter)}
                className="map-toolbar-button"
              >
                <Building2 size={18} aria-hidden="true" />
              </summary>
              <div className="absolute top-[39px] right-[-39px] w-72 max-w-[calc(100vw-59px)]">
                {operatorToolOpen && <OperatorFilter value={operatorFilter} onSelect={handleOperatorFilter} />}
              </div>
            </details>

            <details ref={stateToolRef} name="filter-tools" className="relative" onToggle={event => setStateToolOpen(event.currentTarget.open)}>
              <summary
                aria-label={t('stateFilter')}
                title={stateFilter ? t('activeStateFilter', { filter: stateFilter }) : t('stateFilter')}
                data-active={Boolean(stateFilter)}
                className="map-toolbar-button"
              >
                <MapPinned size={18} aria-hidden="true" />
              </summary>
              <div className="absolute top-[39px] right-0 w-72 max-w-[calc(100vw-59px)]">
                {stateToolOpen && <OperatorFilter kind="state" value={stateFilter} onSelect={handleStateFilter} />}
              </div>
            </details>
          </div>
        </details>

        <details name="map-tools" className="relative">
          <summary aria-label={t('legend')} title={t('legend')} className="map-toolbar-button">
            <List size={18} aria-hidden="true" />
          </summary>
          <div className="absolute top-0 right-[39px] w-60 max-w-[calc(100vw-59px)] rounded bg-white p-3 shadow-md text-xs space-y-1">
        <p className="font-semibold text-gray-700 mb-1">
          {mode === 'dailymax'
            ? metricLabels[dailyMetric]
            : t('occupancy')}
        </p>
        {[
          ['#22c55e', t('under50')],
          ['#eab308', t('from50to80')],
          ['#f97316', t('from80to95')],
          ['#ef4444', t('from95to100')],
          ['#7f1d1d', t('over100')],
          ['#9ca3af', t('noData')],
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
            {t('liveRefresh')}
          </span>
        </div>
      )}
    </main>
  )
}
