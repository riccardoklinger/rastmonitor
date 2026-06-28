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
}

interface MapProps {
  onSiteSelect: (site: SiteProperties) => void
  dataUrl?: string
  metricLabel?: string
}

// Self-hosted by default (/api/map-style → Martin tile server via Next.js proxy).
// For local dev without tiles, set NEXT_PUBLIC_MAP_STYLE to a remote style URL.
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? '/api/map-style'

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

  // vacant_spaces from feed, or estimate from occupancy_pct × total_spaces
  const spacesStr = `${props.total_spaces} Stellplätze gesamt${
    props.vacant_spaces != null
      ? ` · ${props.vacant_spaces} frei`
      : (pct != null && props.total_spaces)
        ? ` · ~${Math.round(props.total_spaces * (1 - pct / 100))} frei`
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
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<maplibregl.Map | null>(null)
  const dataUrlRef     = useRef(dataUrl)
  const metricLabelRef = useRef(metricLabel)

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 13) => {
      mapRef.current?.flyTo({ center: [lng, lat], zoom, essential: true })
    },
  }))

  // Keep refs in sync
  useEffect(() => { metricLabelRef.current = metricLabel }, [metricLabel])

  // Keep ref in sync so the interval closure always uses latest URL
  useEffect(() => {
    dataUrlRef.current = dataUrl
    const source = mapRef.current?.getSource('parking') as maplibregl.GeoJSONSource | undefined
    source?.setData(dataUrl)
  }, [dataUrl])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10.4515, 51.1657], // Germany centre
      zoom: 6,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

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

        new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12 })
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
