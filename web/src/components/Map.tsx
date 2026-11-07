'use client'

import { useCallback, useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Layers, Radar } from 'lucide-react'
import { applyFilters, zoomToFilteredSites } from '@/lib/map-filters'
import { buildParkingStar, STAR_RADIUS_KM } from '@/lib/parking-star'

// Colour scale by occupancy_pct
// coalesce maps null/missing → -1, which falls into the grey bucket below 0.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OCCUPANCY_COLOR: any = [
  'step',
  ['coalesce', ['get', 'occupancy_pct'], -1],
  '#9ca3af',    //       < 0  → grey (null / no data)
  0,  '#22c55e', //   0– 50 % → green
  50, '#eab308', //  50– 80 % → yellow
  80, '#f97316', //  80– 95 % → orange
  95, '#ef4444', //  95–100 % → red
  100,'#7f1d1d', //     >100 % → dark red (overcrowded)
]

export interface SiteProperties {
  datex_id: string
  name: string
  address_id?: string | null
  street?: string | null
  house_number?: string | null
  postcode?: string | null
  city?: string | null
  country?: string | null
  state_code?: string | null
  state_name?: string | null
  operator_name?: string | null
  road_identifier?: string | null
  road_destination?: string | null
  free_of_charge?: boolean | null
  location_type?: string | null
  certified_secure?: boolean | null
  official_spaces: number | null | undefined
  total_spaces: number
  vacant_spaces: number | null | undefined
  occupancy_pct: number | null | undefined
  site_status: string | null
  opening_status: string | null
  fetched_at: string | null
}

export interface MapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void
  showPopup: (lng: number, lat: number, site: SiteProperties, metricLabel?: string) => void
}

interface MapProps {
  onSiteSelect: (site: SiteProperties) => void
  dataUrl?: string
  metricLabel?: string
  operatorFilter?: string
  roadFilter?: string
  stateFilter?: string
}

// Override with /api/map-style to use the self-hosted Martin tile server.
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json'

function rasterStyle(tiles: string, attribution: string, maxzoom: number): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom, attribution },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f3f4f6' } },
      { id: 'basemap', type: 'raster', source: 'basemap' },
    ],
  }
}

const BKG_STYLE_ROOT = 'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles'
const BKG_TOPPLUS_CREDIT = `© BKG ${new Date().getFullYear()} <a href="https://www.govdata.de/dl-de/by-2-0">dl-de/by-2-0</a> · <a href="https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_topplusopen.html">Datenquellen</a>`
const BASEMAPS: { id: string; label: string; caption: string; style: string | maplibregl.StyleSpecification }[] = [
  { id: 'default', label: 'Standard', caption: 'Standard', style: MAP_STYLE },
  { id: 'color', label: 'BKG · Farbe', caption: 'Farbe', style: `${BKG_STYLE_ROOT}/bm_web_col.json` },
  { id: 'grey', label: 'BKG · Grau', caption: 'Grau', style: `${BKG_STYLE_ROOT}/bm_web_gry.json` },
  { id: 'relief', label: 'BKG · Relief', caption: 'Relief', style: `${BKG_STYLE_ROOT}/bm_web_top.json` },
  {
    id: 'light', label: 'BKG · TopPlusOpen Light', caption: 'Light',
    style: rasterStyle('https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_light/default/WEBMERCATOR/{z}/{y}/{x}.png', BKG_TOPPLUS_CREDIT, 18),
  },
  {
    id: 'light-grey', label: 'BKG · TopPlusOpen Light Grau', caption: 'Light Grau',
    style: rasterStyle('https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_light_grau/default/WEBMERCATOR/{z}/{y}/{x}.png', BKG_TOPPLUS_CREDIT, 18),
  },
  {
    id: 'imagery', label: 'Esri · Luftbild', caption: 'Luftbild',
    style: rasterStyle('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', '<a href="https://www.esri.com/">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community', 19),
  },
]

const DEFAULT_BASEMAP = BASEMAPS.find(basemap => basemap.id === 'light-grey') ?? BASEMAPS[0]

function BasemapPreview({ style }: { style: string | maplibregl.StyleSpecification }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const preview = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [10.4515, 51.1657],
      zoom: 9,
      interactive: false,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 0,
    })
    return () => { preview.remove() }
  }, [style])

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none h-20 w-full bg-gray-100" />
}

function formatTs(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  // If it looks like a plain date (YYYY-MM-DD), format as date only
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function buildPopupHtml(props: SiteProperties, metricLabel: string): string {
  const pct = props.occupancy_pct
  const color =
    pct == null  ? '#9ca3af' :
    pct > 100    ? '#7f1d1d' :
    pct >= 95    ? '#ef4444' :
    pct >= 80    ? '#f97316' :
    pct >= 50    ? '#eab308' :
                   '#22c55e'
  const pctStr = pct != null ? `${Number(pct).toFixed(1)} %` : 'Keine Daten'

  const officialSpaces = props.official_spaces ?? null
  const totalSpaces = props.total_spaces ?? null
  const toleratedSpaces =
    officialSpaces != null && totalSpaces != null
      ? Math.max(0, totalSpaces - officialSpaces)
      : null

  // Prefer vacant spaces from the feed; estimate only when they are missing.
  const spacesStr = `${
    officialSpaces != null ? `${officialSpaces} StVO-konform · ` : ''
  }${
    toleratedSpaces != null ? `${toleratedSpaces} geduldet · ` : ''
  }${totalSpaces ?? '–'} gesamt${
    props.vacant_spaces != null
      ? ` · ${props.vacant_spaces} frei`
      : (pct != null && totalSpaces != null)
        ? ` · ~${Math.max(0, Math.round(totalSpaces * (1 - pct / 100)))} frei`
        : ''
  }`

  return `
    <div style="font-family:sans-serif;min-width:180px">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#111">${props.name}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="font-size:13px;font-weight:600;color:#111">${pctStr}</span>
        <span style="font-size:11px;color:#6b7280">${metricLabel}</span>
      </div>
      <div style="font-size:11px;color:#6b7280">${formatTs(props.fetched_at)}</div>
      <div style="font-size:11px;color:#6b7280">${spacesStr}</div>
    </div>
  `
}

function showSitePopup(map: maplibregl.Map, lngLat: maplibregl.LngLatLike, site: SiteProperties, metricLabel: string) {
  return new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12, className: 'site-map-popup' })
    .setLngLat(lngLat)
    .setHTML(buildPopupHtml(site, metricLabel))
    .addTo(map)
}

const Map = forwardRef<MapHandle, MapProps>(function Map(
  { onSiteSelect, dataUrl = '/api/sites', metricLabel = 'Auslastung', operatorFilter = '', roadFilter = '', stateFilter = '' },
  ref
) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const dataUrlRef      = useRef(dataUrl)
  const metricLabelRef  = useRef(metricLabel)
  const roadFilterRef   = useRef(roadFilter)
  const stateFilterRef = useRef(stateFilter)
  const operatorFilterRef = useRef(operatorFilter)
  const filterRevisionRef = useRef(0)
  const pendingFilterZoomRef = useRef(true)
  const basemapMenuRef  = useRef<HTMLDetailsElement>(null)
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP.id)
  const [starActive, setStarActive] = useState(false)
  const [starRadius, setStarRadius] = useState(STAR_RADIUS_KM)
  const [starOrigin, setStarOrigin] = useState<[number, number] | null>(null)
  const [liveSites, setLiveSites] = useState<GeoJSON.GeoJSON | null>(null)
  const [starLoading, setStarLoading] = useState(false)
  const [starError, setStarError] = useState('')
  const [starCount, setStarCount] = useState(0)
  const starActiveRef = useRef(false)
  const starOriginRef = useRef<[number, number] | null>(null)
  const framedOriginRef = useRef<[number, number] | null>(null)
  const framedRadiusRef = useRef(STAR_RADIUS_KM)
  const starDataRef = useRef<GeoJSON.FeatureCollection<GeoJSON.LineString>>({ type: 'FeatureCollection', features: [] })

  useEffect(() => {
    if (!starActive) return
    const controller = new AbortController()
    const refresh = async () => {
      setStarLoading(true)
      try {
        const response = await fetch('/api/sites', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Live-Daten nicht verfügbar')
        const data = await response.json()
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Ungültige Live-Daten')
        if (controller.signal.aborted) return
        setLiveSites(data)
        setStarError('')
      } catch (error) {
        if (!controller.signal.aborted) setStarError(error instanceof Error ? error.message : 'Live-Daten nicht verfügbar')
      } finally {
        if (!controller.signal.aborted) setStarLoading(false)
      }
    }
    void refresh()
    const interval = setInterval(() => { void refresh() }, 5 * 60 * 1000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [starActive])

  useEffect(() => {
    const data = starActive && starOrigin && liveSites
      ? buildParkingStar(starOrigin, liveSites, starRadius)
      : { type: 'FeatureCollection' as const, features: [] }
    starDataRef.current = data
    starOriginRef.current = starActive ? starOrigin : null
    setStarCount(data.features.length)
    const map = mapRef.current
    const source = map?.getSource('parking-star') as maplibregl.GeoJSONSource | undefined
    source?.setData(data)
    const originSource = map?.getSource('parking-star-origin') as maplibregl.GeoJSONSource | undefined
    originSource?.setData({
      type: 'FeatureCollection',
      features: starActive && starOrigin ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: starOrigin }, properties: {} }] : [],
    })
  }, [starActive, starOrigin, liveSites, starRadius])

  useEffect(() => {
    if (!starActive || !starOrigin || !liveSites || (framedOriginRef.current === starOrigin && framedRadiusRef.current === starRadius)) return
    const map = mapRef.current
    if (!map) return
    framedOriginRef.current = starOrigin
    framedRadiusRef.current = starRadius
    const bounds = new maplibregl.LngLatBounds(starOrigin, starOrigin)
    for (const feature of starDataRef.current.features) {
      const [lng, lat] = feature.geometry.coordinates[1]
      bounds.extend([lng, lat])
    }
    map.fitBounds(bounds, { padding: { top: 60, right: 60, bottom: 60, left: 30 }, maxZoom: 8 })
  }, [starActive, starOrigin, liveSites, starRadius])

  const fitPendingFilters = useCallback(async () => {
    const map = mapRef.current
    const source = map?.getSource('parking') as maplibregl.GeoJSONSource | undefined
    if (!map || !source || !pendingFilterZoomRef.current || !map.isSourceLoaded('parking')) return
    pendingFilterZoomRef.current = false
    const revision = filterRevisionRef.current
    try {
      // Read the complete source: rendered/source tile queries can omit off-screen sites.
      const data = await source.getData()
      if (mapRef.current !== map || filterRevisionRef.current !== revision) return
      if (map.getSource('parking') !== source) {
        pendingFilterZoomRef.current = true
        void fitPendingFilters()
        return
      }
      const singleMatch = zoomToFilteredSites(map, data, roadFilterRef.current, operatorFilterRef.current, stateFilterRef.current)
      if (singleMatch) {
        const [lng, lat] = singleMatch.geometry.coordinates
        const site = singleMatch.properties as SiteProperties
        showSitePopup(map, [lng, lat], site, metricLabelRef.current)
        onSiteSelect(site)
      }
    } catch (error) {
      console.error('Could not zoom to filtered sites:', error)
    }
  }, [onSiteSelect])

  useEffect(() => {
    const dismissMenu = (event: PointerEvent) => {
      const menu = basemapMenuRef.current
      if (menu && !menu.contains(event.target as Node)) menu.open = false
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && basemapMenuRef.current?.open) {
        basemapMenuRef.current.open = false
        basemapMenuRef.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', dismissMenu)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissMenu)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 13) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, essential: true })
    },
    showPopup: (lng, lat, site, label = metricLabelRef.current) => {
      if (mapRef.current) showSitePopup(mapRef.current, [lng, lat], site, label)
    },
  }))

  // Keep refs in sync
  useEffect(() => { metricLabelRef.current = metricLabel }, [metricLabel])

  // Keep ref in sync so the interval closure always uses latest URL
  useEffect(() => {
    dataUrlRef.current = dataUrl
    const source = mapRef.current?.getSource('parking') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(dataUrl)
    }
  }, [dataUrl])

  useEffect(() => {
    operatorFilterRef.current = operatorFilter
    roadFilterRef.current = roadFilter
    stateFilterRef.current = stateFilter
    filterRevisionRef.current++
    pendingFilterZoomRef.current = Boolean(roadFilter.trim() || operatorFilter.trim() || stateFilter.trim())
    if (mapRef.current) applyFilters(mapRef.current, roadFilter, operatorFilter, stateFilter)
    void fitPendingFilters()
  }, [operatorFilter, roadFilter, stateFilter, fitPendingFilters])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_BASEMAP.style,
      center: [10.4515, 51.1657], // Germany centre
      zoom: 6,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    })
    geolocate.on('geolocate', (event: GeolocationPosition) => {
      if (starActiveRef.current) {
        setStarOrigin([event.coords.longitude, event.coords.latitude])
        setStarError('')
      }
    })
    geolocate.on('error', () => {
      if (starActiveRef.current) setStarError('Standort nicht verfügbar')
    })
    map.addControl(geolocate, 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({
        customAttribution: 'Daten: <a href="https://www.toll-collect.de" target="_blank" rel="noopener">Toll Collect</a> via Mobilithek',
      }),
      'bottom-right'
    )

    map.on('style.load', () => {
      map.addSource('parking', {
        type: 'geojson',
        data: dataUrlRef.current,
      })

      map.addLayer({
        id: 'parking-circles',
        type: 'circle',
        source: 'parking',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 8],
          'circle-color': OCCUPANCY_COLOR,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      })

      // Dim layer — shown for non-matching points when a road filter is active
      map.addLayer({
        id: 'parking-circles-dim',
        type: 'circle',
        source: 'parking',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 10, 8],
          'circle-color': '#9ca3af',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.25,
          'circle-stroke-opacity': 0.25,
        },
      }, 'parking-circles') // insert below main layer so main layer renders on top

      applyFilters(map, roadFilterRef.current, operatorFilterRef.current, stateFilterRef.current)

      map.addSource('parking-star', { type: 'geojson', data: starDataRef.current, lineMetrics: true })
      for (const color of ['#9ca3af', '#22c55e', '#eab308', '#f97316', '#ef4444', '#7f1d1d']) {
        map.addLayer({
          id: `parking-star-lines-${color.slice(1)}`,
          type: 'line',
          source: 'parking-star',
          filter: ['==', OCCUPANCY_COLOR, color],
          paint: {
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255, 255, 255, 0)', 1, color],
            'line-width': ['get', 'spike_width'],
            'line-opacity': 1,
          },
        }, 'parking-circles-dim')
      }
      map.addSource('parking-star-origin', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: starOriginRef.current ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: starOriginRef.current }, properties: {} }] : [],
        },
      })
      map.addLayer({
        id: 'parking-star-center', type: 'circle', source: 'parking-star-origin',
        paint: { 'circle-radius': 7, 'circle-color': '#111827', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
      })
      map.getCanvas().style.cursor = starActiveRef.current ? 'crosshair' : ''
    })

    map.on('sourcedataloading', (e) => {
      if (e.sourceId === 'parking') setLoading(true)
    })
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'parking' && map.isSourceLoaded('parking')) {
        setLoading(false)
        void fitPendingFilters()
      }
    })
    map.on('error', () => setLoading(false))

    // Pointer cursor on hover
    map.on('mouseenter', 'parking-circles', () => {
      map.getCanvas().style.cursor = starActiveRef.current ? 'crosshair' : 'pointer'
    })
    map.on('mouseleave', 'parking-circles', () => {
      map.getCanvas().style.cursor = starActiveRef.current ? 'crosshair' : ''
    })

    map.on('click', event => {
      if (starActiveRef.current) {
        setStarOrigin([event.lngLat.lng, event.lngLat.lat])
        setStarError('')
      }
    })

    // Click → popup + side panel
    map.on('click', 'parking-circles', (e) => {
      if (starActiveRef.current) return
      const feature = e.features?.[0]
      if (!feature) return
      const props = feature.properties as SiteProperties

      showSitePopup(map, e.lngLat, props, metricLabelRef.current)

      onSiteSelect(props)
    })

    mapRef.current = map

    // Refresh live data every 5 minutes (only when showing live data)
    const interval = setInterval(() => {
      if (dataUrlRef.current !== '/api/sites') return  // skip in history mode
      const source = map.getSource('parking') as maplibregl.GeoJSONSource | undefined
      source?.setData('/api/sites')
    }, 5 * 60 * 1000)

    return () => {
      clearInterval(interval)
      map.remove()
      mapRef.current = null
    }
  }, [onSiteSelect, fitPendingFilters])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <button
        type="button"
        aria-label="Sternanalyse"
        title="Sternanalyse: Kartenpunkt oder eigenen Standort wählen"
        aria-pressed={starActive}
        data-active={starActive}
        className="map-toolbar-button absolute top-[283px] right-[10px] z-20"
        onClick={() => {
          const active = !starActive
          starActiveRef.current = active
          framedOriginRef.current = null
          setStarActive(active)
          setStarError('')
          if (mapRef.current) mapRef.current.getCanvas().style.cursor = active ? 'crosshair' : ''
        }}
      >
        <Radar size={18} aria-hidden="true" />
      </button>
      {starActive && (
        <div className="absolute top-[283px] right-[49px] z-20 flex w-16 flex-col items-center gap-1 rounded bg-white/95 px-2 py-2 text-xs text-gray-700 shadow ring-1 ring-black/10">
          <output htmlFor="star-radius" className="whitespace-nowrap font-semibold tabular-nums">{starRadius} km</output>
          <span aria-hidden="true">200</span>
          <input
            id="star-radius"
            type="range"
            min={10}
            max={200}
            step={1}
            value={starRadius}
            aria-label="Analyseradius"
            aria-valuetext={`${starRadius} Kilometer`}
            aria-orientation="vertical"
            className="w-5 cursor-pointer accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 'min(144px, calc(100dvh - 420px))', minHeight: 48 }}
            onChange={event => setStarRadius(Number(event.target.value))}
          />
          <span aria-hidden="true">10</span>
        </div>
      )}
      {starActive && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-8 left-3 right-14 z-10 w-fit max-w-[calc(100%-4.25rem)] rounded bg-white/95 px-3 py-2 text-xs text-gray-700 shadow">
          <strong>{starRadius} km · Live</strong>
          <span className="ml-2">{starLoading ? 'Lade Live-Daten…' : starError || (!starOrigin ? 'Standort ausstehend' : starCount ? `${starCount} Rastplätze` : 'Keine Rastplätze im Umkreis')}</span>
        </div>
      )}
      {loading && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-white/60">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <span className="text-sm font-medium text-gray-700">Loading</span>
        </div>
      )}
      <details ref={basemapMenuRef} name="map-tools" onToggle={event => setBasemapMenuOpen(event.currentTarget.open)} className="absolute top-[49px] right-[10px] z-20 text-sm">
        <summary
          aria-label="Hintergrundkarte wählen"
          title="Hintergrundkarte wählen"
          className="map-toolbar-button"
        >
          <Layers size={18} aria-hidden="true" />
        </summary>
        <fieldset className="absolute top-0 right-[39px] w-72 max-w-[calc(100vw-59px)] max-h-[calc(100dvh-12rem)] overflow-y-auto rounded bg-white p-2 shadow-lg ring-1 ring-black/10">
          <legend className="sr-only">Hintergrundkarte</legend>
          <div className="grid grid-cols-2 gap-2">
          {BASEMAPS.filter(basemap => basemap.id !== 'default' || !BASEMAPS.some(option => option.id !== 'default' && option.style === MAP_STYLE)).map(basemap => (
            <label key={basemap.id} title={basemap.label} className="relative cursor-pointer">
              <input
                type="radio"
                name="basemap"
                value={basemap.id}
                checked={basemapId === basemap.id}
                onChange={() => {
                  if (!mapRef.current) return
                  mapRef.current.setStyle(basemap.style, { diff: false })
                  setBasemapId(basemap.id)
                  if (basemapMenuRef.current) basemapMenuRef.current.open = false
                }}
                aria-label={basemap.label}
                className="peer sr-only"
              />
              <div className="overflow-hidden rounded border border-gray-200 peer-checked:border-blue-600 peer-checked:ring-1 peer-checked:ring-blue-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-600 hover:border-gray-400">
                {basemapMenuOpen ? <BasemapPreview style={basemap.style} /> : <div className="h-20 bg-gray-100" />}
                <span className="flex h-8 items-center justify-center bg-white px-1 text-xs text-gray-700">{basemap.caption}</span>
              </div>
            </label>
          ))}
          </div>
          <p className="mt-2 text-[9px] leading-snug text-gray-500">
            © GeoBasis-DE / BKG {new Date().getFullYear()} · <a href="https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_topplusopen.html" className="underline" target="_blank" rel="noopener noreferrer">Datenquellen</a><br />
            © Esri, Vantor, Earthstar Geographics, GIS User Community
          </p>
        </fieldset>
      </details>
    </div>
  )
})

export default Map
