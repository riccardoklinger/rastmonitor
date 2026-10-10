'use client'

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import maplibregl from 'maplibre-gl'

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

function applyRoadFilter(map: maplibregl.Map, road: string) {
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

const Map = forwardRef<MapHandle, MapProps>(function Map(
  { onSiteSelect, dataUrl = '/api/sites', metricLabel = 'Auslastung' },
  ref
) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<maplibregl.Map | null>(null)
  const dataUrlRef      = useRef(dataUrl)
  const metricLabelRef  = useRef(metricLabel)
  const roadFilterRef   = useRef('')

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 13) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, essential: true })
    },
    setRoadFilter: (road: string) => {
        const map = mapRef.current
        if (!map) return
        roadFilterRef.current = road
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

    map.on('load', () => {
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

        new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12, className: 'site-map-popup' })
          .setLngLat(e.lngLat)
          .setHTML(buildPopupHtml(props, metricLabelRef.current))
          .addTo(map)

        onSiteSelect(props)
      })
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

  return <div ref={containerRef} className="w-full h-full" />
})

export default Map
