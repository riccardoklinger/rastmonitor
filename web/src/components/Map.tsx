'use client'

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import maplibregl from 'maplibre-gl'
import { Layers } from 'lucide-react'

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
  operator_name?: string | null
  road_identifier?: string | null
  road_destination?: string | null
  free_of_charge?: boolean | null
  location_type?: string | null
  certified_secure?: boolean | null
  official_spaces: number | null | undefined
  total_spaces: number
  vacant_spaces: number | null | undefined
  is_synthetic: boolean
  occupancy_pct: number | null | undefined
  site_status: string | null
  opening_status: string | null
  fetched_at: string | null
}

export interface MapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void
  showPopup: (lng: number, lat: number, site: SiteProperties, metricLabel?: string) => void
  setRoadFilter: (road: string) => void
}

interface MapProps {
  onSiteSelect: (site: SiteProperties) => void
  dataUrl?: string
  metricLabel?: string
}

// Self-hosted by default (/api/map-style → Martin tile server via Next.js proxy).
// For local dev without tiles, set NEXT_PUBLIC_MAP_STYLE to a remote style URL.
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? '/api/map-style'

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

function applyRoadFilter(map: maplibregl.Map, road: string) {
  if (!map.getLayer('parking-circles')) return
  if (!road.trim()) {
    map.setFilter('parking-circles', null)
    if (map.getLayer('parking-circles-dim'))
      map.setLayoutProperty('parking-circles-dim', 'visibility', 'none')
  } else {
    const val = road.trim().toUpperCase()
    if (map.getLayer('parking-circles-dim')) {
      map.setLayoutProperty('parking-circles-dim', 'visibility', 'visible')
      map.setFilter('parking-circles-dim', ['!=', ['upcase', ['coalesce', ['get', 'road_identifier'], '']], val])
    }
    map.setFilter('parking-circles', ['==', ['upcase', ['coalesce', ['get', 'road_identifier'], '']], val])
  }
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
  const synth = props.is_synthetic ? '<span style="font-size:10px;color:#6b7280;font-style:italic"> · synthetisch</span>' : ''

  const officialSpaces = props.official_spaces ?? null
  const totalSpaces = props.total_spaces ?? null
  const toleratedSpaces =
    officialSpaces != null && totalSpaces != null
      ? Math.max(0, totalSpaces - officialSpaces)
      : null

  // vacant_spaces from feed, or estimate from occupancy_pct × total_spaces
  const spacesStr = `${
    officialSpaces != null ? `${officialSpaces} StVO-konform · ` : ''
  }${
    toleratedSpaces != null ? `${toleratedSpaces} geduldet · ` : ''
  }${totalSpaces ?? '–'} gesamt${
    props.vacant_spaces != null
      ? ` · ${props.vacant_spaces} frei`
      : (pct != null && totalSpaces)
        ? ` · ~${Math.round(totalSpaces * (1 - pct / 100))} frei`
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
      <div style="font-size:11px;color:#6b7280">${formatTs(props.fetched_at)}${synth}</div>
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
  { onSiteSelect, dataUrl = '/api/sites', metricLabel = 'Auslastung' },
  ref
) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const dataUrlRef      = useRef(dataUrl)
  const metricLabelRef  = useRef(metricLabel)
  const roadFilterRef   = useRef('')
  const basemapMenuRef  = useRef<HTMLDetailsElement>(null)
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false)
  const [basemapId, setBasemapId] = useState(
    BASEMAPS.find(basemap => basemap.id !== 'default' && basemap.style === MAP_STYLE)?.id ?? 'default'
  )

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
    setRoadFilter: (road: string) => {
      roadFilterRef.current = road
        const map = mapRef.current
        if (!map) return
        applyRoadFilter(map, road)
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
      // Re-apply road filter after data swap (new GeoJSON may have road_identifier)
      if (roadFilterRef.current) applyRoadFilter(mapRef.current!, roadFilterRef.current)
    }
  }, [dataUrl])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10.4515, 51.1657], // Germany centre
      zoom: 6,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-right'
    )
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

      applyRoadFilter(map, roadFilterRef.current)
    })

    // Pointer cursor on hover
    map.on('mouseenter', 'parking-circles', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'parking-circles', () => {
      map.getCanvas().style.cursor = ''
    })

    // Click → popup + side panel
    map.on('click', 'parking-circles', (e) => {
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
  }, [onSiteSelect])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <details ref={basemapMenuRef} name="map-tools" onToggle={event => setBasemapMenuOpen(event.currentTarget.open)} className="absolute top-[49px] right-[10px] z-20 text-sm">
        <summary
          aria-label="Hintergrundkarte wählen"
          title="Hintergrundkarte wählen"
          className="map-toolbar-button"
        >
          <Layers size={18} aria-hidden="true" />
        </summary>
        <fieldset className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-12rem)] overflow-y-auto rounded bg-white p-2 shadow-lg ring-1 ring-black/10">
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
