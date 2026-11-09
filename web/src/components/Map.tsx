'use client'

import { useCallback, useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { createRoot } from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import { ChevronDown, ChevronUp, Layers, Navigation, Radar } from 'lucide-react'
import { applyFilters, zoomToFilteredSites, zoomToHighlightedSite } from '@/lib/map-filters'
import { buildDirectionsUrl, type MapProvider } from '@/lib/map-directions'
import { buildParkingStar, summarizeParkingAvailability, STAR_MINUTES, STAR_RADIUS_KM, type ParkingIsochrone } from '@/lib/parking-star'

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
const STAR_COLORS = ['#9ca3af', '#22c55e', '#eab308', '#f97316', '#ef4444', '#7f1d1d']
const STAR_LINE_LAYER_IDS = STAR_COLORS.map(color => `parking-star-lines-${color.slice(1)}`)

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
  onSiteClick?: (site: SiteProperties) => void
  dataUrl?: string
  metricLabel?: string
  highlightSiteId?: string
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
const BASEMAP_CONSENT_KEY = 'rastmonitor-basemap-consent-v1'
const LOCAL_BACKGROUND: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f3f4f6' } }],
}

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

function getDirectionsProvider(): MapProvider {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? 'apple' : 'google'
}

function occupancyColor(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(Number(pct))) return '#9ca3af'
  if (pct > 100) return '#7f1d1d'
  if (pct >= 95) return '#ef4444'
  if (pct >= 80) return '#f97316'
  if (pct >= 50) return '#eab308'
  return '#22c55e'
}

function ReachabilityPopup({ site, origin, destination }: {
  site: SiteProperties
  origin: [number, number]
  destination: [number, number]
}) {
  const provider = getDirectionsProvider()
  const providerName = provider === 'apple' ? 'Apple Karten' : 'Google Maps'
  const streetAddress = [site.street, site.house_number].filter(value => value?.trim()).join(' ')
  const locality = [site.postcode, site.city].filter(value => value?.trim()).join(' ')
  const occupancy = site.occupancy_pct != null && Number.isFinite(Number(site.occupancy_pct))
    ? `${Number(site.occupancy_pct).toFixed(1)} %`
    : 'Keine Daten'

  return (
    <div className="min-w-52 pr-1 text-sm text-gray-800">
      <strong className="block pr-1 text-sm font-semibold">{site.name || 'Rastplatz'}</strong>
      <p className="mt-1 text-xs text-gray-600">
        {streetAddress || 'Keine Straßenadresse'}
        {locality && <><br />{locality}</>}
      </p>
      <p className="mt-2 text-xs text-gray-700">Aktuelle Auslastung: <strong>{occupancy}</strong></p>
      <a
        href={buildDirectionsUrl(origin, destination, provider)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Route zum Rastplatz in ${providerName} öffnen`}
        title={`Route in ${providerName} öffnen`}
        className="mt-2 inline-flex h-11 min-w-11 items-center justify-center rounded border border-gray-200 text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <Navigation size={19} aria-hidden="true" />
      </a>
    </div>
  )
}

function showReachabilityPopup(
  map: maplibregl.Map,
  site: SiteProperties,
  origin: [number, number],
  destination: [number, number]
) {
  const container = document.createElement('div')
  const root = createRoot(container)
  root.render(<ReachabilityPopup site={site} origin={origin} destination={destination} />)
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', offset: 12, className: 'site-map-popup' })
    .setLngLat(destination)
    .setDOMContent(container)
  popup.on('close', () => root.unmount())
  popup.addTo(map)
  return popup
}

const Map = forwardRef<MapHandle, MapProps>(function Map(
  { onSiteSelect, onSiteClick, dataUrl = '/api/sites', metricLabel = 'Auslastung', highlightSiteId = '', operatorFilter = '', roadFilter = '', stateFilter = '' },
  ref
) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const popupRef        = useRef<maplibregl.Popup | null>(null)
  const dataUrlRef      = useRef(dataUrl)
  const metricLabelRef  = useRef(metricLabel)
  const roadFilterRef   = useRef(roadFilter)
  const stateFilterRef = useRef(stateFilter)
  const operatorFilterRef = useRef(operatorFilter)
  const highlightSiteIdRef = useRef(highlightSiteId)
  const filterRevisionRef = useRef(0)
  const pendingFilterZoomRef = useRef(true)
  const basemapMenuRef  = useRef<HTMLDetailsElement>(null)
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP.id)
  const [basemapConsent, setBasemapConsent] = useState<boolean | null>(null)
  const [showBasemapConsent, setShowBasemapConsent] = useState(false)
  const externalBasemapAppliedRef = useRef(false)
  const [starActive, setStarActive] = useState(false)
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
  const [starMinutes, setStarMinutes] = useState(STAR_MINUTES)
  const [starDraftMinutes, setStarDraftMinutes] = useState(STAR_MINUTES)
  const [starRadius, setStarRadius] = useState(STAR_RADIUS_KM)
  const [starDraftRadius, setStarDraftRadius] = useState(STAR_RADIUS_KM)
  const [routingAvailable, setRoutingAvailable] = useState<boolean | null>(null)
  const [starAdjusting, setStarAdjusting] = useState(false)
  const [starOrigin, setStarOrigin] = useState<[number, number] | null>(null)
  const [isochrone, setIsochrone] = useState<{ origin: [number, number]; minutes: number; data: ParkingIsochrone } | null>(null)
  const [routingLoading, setRoutingLoading] = useState(false)
  const [routingError, setRoutingError] = useState('')
  const [liveSites, setLiveSites] = useState<GeoJSON.GeoJSON | null>(null)
  const [starLoading, setStarLoading] = useState(false)
  const [starError, setStarError] = useState('')
  const [starCount, setStarCount] = useState(0)
  const starActiveRef = useRef(false)
  const starOriginRef = useRef<[number, number] | null>(null)
  const framedOriginRef = useRef<[number, number] | null>(null)
  const framedMinutesRef = useRef(STAR_MINUTES)
  const framedModeRef = useRef<boolean | null>(null)
  const starDataRef = useRef<GeoJSON.FeatureCollection<GeoJSON.LineString>>({ type: 'FeatureCollection', features: [] })
  const isochroneDataRef = useRef<ParkingIsochrone>({ type: 'FeatureCollection', features: [] })
  const starResults = starDataRef.current.features
  const availability = summarizeParkingAvailability(starResults)
  const distanceMode = routingAvailable === false
  const starValue = distanceMode ? starRadius : starMinutes
  const starDraftValue = distanceMode ? starDraftRadius : starDraftMinutes
  const starUnit = distanceMode ? 'km' : 'min'
  const setDraftValue = distanceMode ? setStarDraftRadius : setStarDraftMinutes
  const commitStarValue = (value: number) => {
    if (distanceMode) setStarRadius(value)
    else setStarMinutes(value)
    setStarAdjusting(false)
  }
  const replacePopup = useCallback((create: () => maplibregl.Popup) => {
    popupRef.current?.remove()
    const popup = create()
    popupRef.current = popup
    popup.on('close', () => {
      if (popupRef.current === popup) popupRef.current = null
    })
  }, [])
  const chooseBasemapConsent = (accepted: boolean) => {
    setBasemapConsent(accepted)
    setShowBasemapConsent(false)
    setBasemapId(DEFAULT_BASEMAP.id)
    if (basemapMenuRef.current) basemapMenuRef.current.open = false
    try {
      document.cookie = `${BASEMAP_CONSENT_KEY}=${accepted ? 'accepted' : 'declined'}; Path=/; Max-Age=15552000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
    } catch {}
  }

  useEffect(() => {
    if (starAdjusting) {
      setRoutingLoading(false)
      return
    }
    setIsochrone(null)
    setRoutingError('')
    if (!starActive || !starOrigin || routingAvailable !== true) {
      setRoutingLoading(false)
      return
    }
    const origin = starOrigin
    const controller = new AbortController()
    setRoutingLoading(true)
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/isochrone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({ origin, minutes: starMinutes }),
        })
        const data = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) {
          if (data.code === 'ROUTING_BUSY' || response.status === 400) {
            setRoutingError(data.error || 'Lkw-Routing nicht verfügbar')
          } else setRoutingAvailable(false)
          return
        }
        setIsochrone({ origin, minutes: starMinutes, data })
      } catch (error) {
        if (!controller.signal.aborted) {
          setRoutingAvailable(false)
          setRoutingError(error instanceof Error ? error.message : 'Lkw-Routing nicht verfügbar')
        }
      } finally {
        if (!controller.signal.aborted) setRoutingLoading(false)
      }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [starActive, starOrigin, starMinutes, starAdjusting, routingAvailable])

  useEffect(() => {
    if (!starActive) return
    const controller = new AbortController()
    const check = async () => {
      try {
        const response = await fetch('/api/isochrone', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4_000)]),
        })
        const data = await response.json()
        if (!controller.signal.aborted) setRoutingAvailable(response.ok && data.available === true)
      } catch {
        if (!controller.signal.aborted) setRoutingAvailable(false)
      }
    }
    void check()
    const interval = setInterval(() => { void check() }, 30_000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [starActive])

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
    const area = starActive && routingAvailable === true && isochrone?.origin === starOrigin && isochrone?.minutes === starMinutes
      ? isochrone.data : { type: 'FeatureCollection' as const, features: [] }
    isochroneDataRef.current = area
    const data = starActive && starOrigin && liveSites
      ? buildParkingStar(starOrigin, liveSites, distanceMode ? starRadius : area)
      : { type: 'FeatureCollection' as const, features: [] }
    starDataRef.current = data
    starOriginRef.current = starActive ? starOrigin : null
    setStarCount(data.features.length)
    const map = mapRef.current
    const source = map?.getSource('parking-star') as maplibregl.GeoJSONSource | undefined
    source?.setData(data)
    const areaSource = map?.getSource('parking-isochrone') as maplibregl.GeoJSONSource | undefined
    areaSource?.setData(area)
    const originSource = map?.getSource('parking-star-origin') as maplibregl.GeoJSONSource | undefined
    originSource?.setData({
      type: 'FeatureCollection',
      features: starActive && starOrigin ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: starOrigin }, properties: {} }] : [],
    })
  }, [starActive, starOrigin, liveSites, starMinutes, isochrone, routingAvailable, distanceMode, starRadius])

  useEffect(() => {
    if (!starActive || !starOrigin || !liveSites || routingAvailable === null ||
      (!distanceMode && (isochrone?.origin !== starOrigin || isochrone?.minutes !== starMinutes)) ||
      (framedOriginRef.current === starOrigin && framedMinutesRef.current === starValue && framedModeRef.current === distanceMode)) return
    const map = mapRef.current
    if (!map) return
    framedOriginRef.current = starOrigin
    framedMinutesRef.current = starValue
    framedModeRef.current = distanceMode
    const bounds = new maplibregl.LngLatBounds(starOrigin, starOrigin)
    for (const feature of distanceMode ? [] : isochrone!.data.features) {
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
      for (const polygon of polygons) {
        for (const [lng, lat] of polygon[0]) bounds.extend([lng, lat])
      }
    }
    if (distanceMode) {
      for (const feature of starDataRef.current.features) {
        const [lng, lat] = feature.geometry.coordinates[1]
        bounds.extend([lng, lat])
      }
    }
    map.fitBounds(bounds, { padding: { top: 60, right: 60, bottom: 60, left: 30 }, maxZoom: 8 })
  }, [starActive, starOrigin, liveSites, starMinutes, isochrone, routingAvailable, distanceMode, starValue])

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
      const highlight = highlightSiteIdRef.current.trim()
      if (highlight) {
        const selected = zoomToHighlightedSite(map, data, highlight)
        if (selected) {
          const [lng, lat] = selected.geometry.coordinates
          const site = selected.properties as SiteProperties
          replacePopup(() => showSitePopup(map, [lng, lat], site, metricLabelRef.current))
          onSiteSelect(site)
        }
        return
      }
      const singleMatch = zoomToFilteredSites(map, data, roadFilterRef.current, operatorFilterRef.current, stateFilterRef.current)
      if (singleMatch) {
        const [lng, lat] = singleMatch.geometry.coordinates
        const site = singleMatch.properties as SiteProperties
        replacePopup(() => showSitePopup(map, [lng, lat], site, metricLabelRef.current))
        onSiteSelect(site)
      }
    } catch (error) {
      console.error('Could not zoom to filtered sites:', error)
    }
  }, [onSiteSelect, replacePopup])

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
      const map = mapRef.current
      if (map) replacePopup(() => showSitePopup(map, [lng, lat], site, label))
    },
  }))

  // Keep refs in sync
  useEffect(() => { metricLabelRef.current = metricLabel }, [metricLabel])

  // Keep ref in sync so the interval closure always uses latest URL
  useEffect(() => {
    dataUrlRef.current = dataUrl
    const source = mapRef.current?.getSource('parking') as maplibregl.GeoJSONSource | undefined
    if (source) {
      setLoading(true)
      source.setData(dataUrl)
    }
  }, [dataUrl])

  useEffect(() => {
    highlightSiteIdRef.current = highlightSiteId
    filterRevisionRef.current++
    pendingFilterZoomRef.current = Boolean(highlightSiteId.trim() || roadFilterRef.current.trim() || operatorFilterRef.current.trim() || stateFilterRef.current.trim())
    void fitPendingFilters()
  }, [highlightSiteId, fitPendingFilters])

  useEffect(() => {
    operatorFilterRef.current = operatorFilter
    roadFilterRef.current = roadFilter
    stateFilterRef.current = stateFilter
    filterRevisionRef.current++
    pendingFilterZoomRef.current = Boolean(highlightSiteIdRef.current.trim() || roadFilter.trim() || operatorFilter.trim() || stateFilter.trim())
    if (mapRef.current) applyFilters(mapRef.current, roadFilter, operatorFilter, stateFilter)
    void fitPendingFilters()
  }, [operatorFilter, roadFilter, stateFilter, fitPendingFilters])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: LOCAL_BACKGROUND,
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
      setLoading(true)
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

      map.addSource('parking-isochrone', { type: 'geojson', data: isochroneDataRef.current, attribution: '© openrouteservice by HeiGIT | © OpenStreetMap contributors' })
      map.addLayer({
        id: 'parking-isochrone-fill', type: 'fill', source: 'parking-isochrone',
        paint: { 'fill-color': '#0891b2', 'fill-opacity': 0.06 },
      }, 'parking-circles-dim')
      map.addLayer({
        id: 'parking-isochrone-outline', type: 'line', source: 'parking-isochrone',
        paint: { 'line-color': '#0891b2', 'line-opacity': 0.7, 'line-width': 1.5, 'line-dasharray': [3, 2] },
      }, 'parking-circles-dim')
      map.addSource('parking-star', { type: 'geojson', data: starDataRef.current, lineMetrics: true })
      for (const color of STAR_COLORS) {
        const layerId = `parking-star-lines-${color.slice(1)}`
        map.addLayer({
          id: layerId,
          type: 'line',
          source: 'parking-star',
          filter: ['==', OCCUPANCY_COLOR, color],
          paint: {
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255, 255, 255, 0)', 1, color],
            'line-width': ['get', 'spike_width'],
            'line-opacity': 1,
          },
        }, 'parking-circles-dim')
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = starActiveRef.current ? 'crosshair' : '' })
        map.on('click', layerId, event => {
          const feature = event.features?.find(candidate => candidate.geometry?.type === 'LineString')
          if (!feature || feature.geometry.type !== 'LineString' || feature.geometry.coordinates.length < 2) return
          const coordinates = feature.geometry.coordinates
          const origin = [Number(coordinates[0][0]), Number(coordinates[0][1])] as [number, number]
          const endpoint = coordinates[coordinates.length - 1]
          const destination = [Number(endpoint[0]), Number(endpoint[1])] as [number, number]
          if (![...origin, ...destination].every(Number.isFinite)) return
          replacePopup(() => showReachabilityPopup(map, feature.properties as SiteProperties, origin, destination))
        })
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

    map.on('sourcedata', (e) => {
      if (e.sourceId === 'parking' && map.isSourceLoaded('parking')) {
        setLoading(false)
        void fitPendingFilters()
      }
    })
    map.on('idle', () => setLoading(false))
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
        const interactiveLayers = [
          'parking-circles',
          'parking-circles-dim',
          ...STAR_LINE_LAYER_IDS,
        ].filter(layerId => map.getLayer(layerId) && map.getLayoutProperty(layerId, 'visibility') !== 'none')
        if (interactiveLayers.length && map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length) return
        setStarOrigin([event.lngLat.lng, event.lngLat.lat])
        setStarError('')
      }
    })

    // Click parking points for site details, or reachability directions when active.
    const handleParkingPointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      const props = feature.properties as SiteProperties
      if (feature.geometry?.type !== 'Point') return
      const [lng, lat] = feature.geometry.coordinates

      if (starActiveRef.current) {
        const origin = starOriginRef.current
        if (origin) replacePopup(() => showReachabilityPopup(map, props, origin, [lng, lat]))
        else setStarOrigin([lng, lat])
        return
      }

      replacePopup(() => showSitePopup(map, [lng, lat], props, metricLabelRef.current))

      onSiteSelect(props)
      onSiteClick?.(props)
    }
    map.on('click', 'parking-circles', handleParkingPointClick)
    map.on('click', 'parking-circles-dim', handleParkingPointClick)

    mapRef.current = map

    // Refresh live data every 5 minutes (only when showing live data)
    const interval = setInterval(() => {
      if (dataUrlRef.current !== '/api/sites') return  // skip in history mode
      const source = map.getSource('parking') as maplibregl.GeoJSONSource | undefined
      if (source) {
        setLoading(true)
        source.setData('/api/sites')
      }
    }, 5 * 60 * 1000)

    return () => {
      clearInterval(interval)
      map.remove()
      mapRef.current = null
    }
  }, [onSiteSelect, fitPendingFilters])

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = document.cookie.split(';').map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${BASEMAP_CONSENT_KEY}=`))?.slice(BASEMAP_CONSENT_KEY.length + 1) ?? null
    } catch {}
    setBasemapConsent(stored === 'accepted')
    setShowBasemapConsent(stored !== 'accepted' && stored !== 'declined')
  }, [])

  useEffect(() => {
    if (basemapConsent === null || externalBasemapAppliedRef.current === basemapConsent) return
    externalBasemapAppliedRef.current = basemapConsent
    mapRef.current?.setStyle(basemapConsent ? DEFAULT_BASEMAP.style : LOCAL_BACKGROUND, { diff: false })
  }, [basemapConsent])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {showBasemapConsent && (
        <section
          aria-labelledby="basemap-consent-title"
          className="absolute left-3 right-14 top-16 z-40 mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-lg"
        >
          <h2 id="basemap-consent-title" className="font-semibold">Externe Hintergrundkarten</h2>
          <p className="mt-2 text-xs leading-relaxed text-gray-600">
            Hintergrundkarten und Vorschaubilder werden von BKG und Esri (esri.com / arcgisonline.com) geladen.
            Dabei erhalten die Anbieter Ihre IP-Adresse und die angefragten Kartenausschnitte.
            Erst nach Ihrer Zustimmung werden diese Verbindungen hergestellt.
          </p>
          <a href="/impressum" className="mt-2 inline-block text-xs text-blue-700 underline">Datenschutz</a>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => chooseBasemapConsent(true)} className="min-h-11 rounded border border-blue-700 bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Akzeptieren und Karten laden</button>
            <button type="button" onClick={() => chooseBasemapConsent(false)} className="min-h-11 rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">Ohne Hintergrundkarte fortfahren</button>
          </div>
        </section>
      )}
      <button
        type="button"
        aria-label="Sternanalyse"
        title={distanceMode ? 'Luftlinienanalyse: Kartenpunkt oder eigenen Standort wählen' : 'Lkw-Fahrzeitanalyse: Kartenpunkt oder eigenen Standort wählen'}
        aria-pressed={starActive}
        data-active={starActive}
        className="map-toolbar-button absolute top-[205px] right-[10px] z-20"
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
        <div className="absolute top-[205px] right-[49px] z-20 flex w-20 flex-col items-center gap-1 rounded bg-white/95 px-2 py-2 text-xs text-gray-700 shadow ring-1 ring-black/10">
          <output htmlFor="star-minutes" className="whitespace-nowrap font-semibold tabular-nums">{starDraftValue} {starUnit}</output>
          <span aria-hidden="true">{distanceMode ? 200 : 60}</span>
          <input
            id="star-minutes"
            type="range"
            min={10}
            max={distanceMode ? 200 : 60}
            step={1}
            value={starDraftValue}
            aria-label={distanceMode ? 'Luftlinienradius' : 'Lkw-Fahrzeit'}
            aria-valuetext={`${starDraftValue} ${distanceMode ? 'Kilometer' : 'Minuten'}`}
            aria-orientation="vertical"
            className="w-5 cursor-pointer accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 'min(144px, calc(100dvh - 420px))', minHeight: 48 }}
            onChange={event => setDraftValue(Number(event.target.value))}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setStarAdjusting(true)
            }}
            onPointerUp={event => {
              commitStarValue(Number(event.currentTarget.value))
            }}
            onPointerCancel={() => {
              setDraftValue(starValue)
              setStarAdjusting(false)
            }}
            onKeyDown={event => {
              if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) setStarAdjusting(true)
            }}
            onKeyUp={event => {
              if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                commitStarValue(Number(event.currentTarget.value))
              }
            }}
            onBlur={event => {
              commitStarValue(Number(event.currentTarget.value))
            }}
          />
          <span aria-hidden="true">10</span>
        </div>
      )}
      {starActive && starOrigin && starResults.length > 0 && (
        <section
          aria-label="Rastplätze im Einzugsgebiet"
          className="absolute bottom-2 left-3 right-3 z-20 flex max-h-[34dvh] flex-col overflow-hidden rounded border border-gray-200 bg-white/95 text-gray-800 shadow-lg"
        >
          <header className="relative min-h-12 shrink-0 border-b border-gray-200 py-2 pl-3 pr-14">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <strong className="text-xs font-semibold">
                {availability.unknown === starResults.length ? 'Freie Plätze: keine Daten' : `${availability.estimated ? '~' : ''}${availability.total} freie Plätze`}
                {' · '}{starResults.length} Rastplätze · {starValue} {starUnit}
              </strong>
              <span className="text-xs text-gray-600">
                {routingLoading ? 'Berechne Fahrzeit…' : starLoading ? 'Lade Live-Daten…' : `${distanceMode ? 'Luftlinie' : 'Lkw'} · Live`}
              </span>
            </div>
            {availability.unknown > 0 && <p className="mt-1 text-xs text-gray-600">{availability.unknown} {availability.unknown === 1 ? 'Rastplatz' : 'Rastplätze'} ohne Angaben zu freien Plätzen</p>}
            {distanceMode && <p className="mt-1 text-xs text-amber-800">Isochronen derzeit nicht verfügbar. Luftlinienentfernung, keine Fahrzeit.</p>}
            {(routingError || starError) && <p role="status" className="mt-1 text-xs text-amber-800">{routingError || starError}</p>}
            <button
              type="button"
              aria-label={resultsCollapsed ? 'Ergebnisliste öffnen' : 'Ergebnisliste minimieren'}
              title={resultsCollapsed ? 'Ergebnisliste öffnen' : 'Ergebnisliste minimieren'}
              aria-expanded={!resultsCollapsed}
              aria-controls="reachability-results-list"
              onClick={() => setResultsCollapsed(collapsed => !collapsed)}
              className="absolute right-1 top-0.5 flex h-11 w-11 items-center justify-center rounded text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              {resultsCollapsed ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            </button>
          </header>
          <ul id="reachability-results-list" className={`${resultsCollapsed ? 'hidden' : 'grid'} min-h-0 grid-cols-1 gap-x-3 overflow-y-auto px-3 sm:grid-cols-2 lg:grid-cols-3`}>
            {availability.sites.map(({ feature, vacant, estimated }) => {
              if (feature.geometry.type !== 'LineString' || feature.geometry.coordinates.length < 2) return null
              const site = feature.properties as SiteProperties
              const endpoint = feature.geometry.coordinates[feature.geometry.coordinates.length - 1]
              const destination: [number, number] = [Number(endpoint[0]), Number(endpoint[1])]
              if (!destination.every(Number.isFinite)) return null
              const streetAddress = [site.street, site.house_number].filter(value => value?.trim()).join(' ')
              const locality = [site.postcode, site.city].filter(value => value?.trim()).join(' ')
              const address = [streetAddress, locality].filter(Boolean).join(', ') || 'Keine Adresse verfügbar'
              const occupancy = site.occupancy_pct != null && Number.isFinite(Number(site.occupancy_pct))
                ? `${Number(site.occupancy_pct).toFixed(1)} %`
                : 'Keine Daten'
              const provider = getDirectionsProvider()
              const providerName = provider === 'apple' ? 'Apple Karten' : 'Google Maps'
              return (
                <li key={site.datex_id} className="flex min-w-0 items-center gap-3 border-b border-gray-100 py-2">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-xs font-medium" title={site.name}>{site.name || 'Rastplatz'}</strong>
                    <span className="block truncate text-xs text-gray-600" title={address}>{address}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-700">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: occupancyColor(site.occupancy_pct) }} aria-hidden="true" />
                      {vacant === null ? 'Freie Plätze: keine Daten' : `${estimated ? '~' : ''}${vacant} frei`} · {occupancy}
                    </span>
                    <span className="block text-xs text-gray-600">{Number(feature.properties?.distance_km).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km Luftlinie</span>
                  </div>
                  <a
                    href={buildDirectionsUrl(starOrigin, destination, provider)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Route zu ${site.name || 'Rastplatz'} in ${providerName} öffnen`}
                    title={`Route in ${providerName} öffnen`}
                    className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded border border-gray-200 text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    <Navigation size={19} aria-hidden="true" />
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {starActive && starResults.length === 0 && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-8 left-3 right-14 z-10 w-fit max-w-[calc(100%-4.25rem)] rounded bg-white/95 px-3 py-2 text-xs text-gray-700 shadow">
          <strong>{starValue} {starUnit} · {distanceMode ? 'Luftlinie' : 'Lkw'} · Live</strong>
          <span className="ml-2">{routingAvailable === null ? 'Prüfe Routing…' : routingLoading ? 'Berechne Fahrzeit…' : starLoading ? 'Lade Live-Daten…' : routingError || starError || (!starOrigin ? 'Standort ausstehend' : starCount ? `${starCount} Rastplätze` : distanceMode ? 'Keine Rastplätze im Radius' : 'Keine erreichbaren Rastplätze')}</span>
          {distanceMode && <span className="mt-1 block text-amber-800">Isochronen derzeit nicht verfügbar. Luftlinienentfernung, keine Fahrzeit.</span>}
        </div>
      )}
      {loading && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded bg-white/95 px-3 py-2 shadow">
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
          {!basemapConsent && (
            <div className="space-y-2 p-2 text-xs text-gray-700">
              <p>Externe Hintergrundkarten sind deaktiviert.</p>
              <button type="button" onClick={() => {
                setShowBasemapConsent(true)
                if (basemapMenuRef.current) basemapMenuRef.current.open = false
              }} className="min-h-11 rounded border border-gray-300 px-3 py-2 hover:bg-gray-100">Datenschutzauswahl öffnen</button>
            </div>
          )}
          {basemapConsent && <>
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
          <button type="button" onClick={() => chooseBasemapConsent(false)} className="mt-2 min-h-11 w-full rounded border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100">Einwilligung widerrufen</button>
          </>}
        </fieldset>
      </details>
    </div>
  )
})

export default Map
