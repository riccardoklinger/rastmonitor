'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

// Colour scale by occupancy_pct
// Colour scale by occupancy_pct.
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
  occupancy_pct: number | null
  site_status: string | null
  opening_status: string | null
  fetched_at: string | null
}

interface MapProps {
  onSiteSelect: (site: SiteProperties) => void
}

// Self-hosted by default (/api/map-style → Martin tile server via Next.js proxy).
// For local dev without tiles, set NEXT_PUBLIC_MAP_STYLE to a remote style URL, e.g.:
//   NEXT_PUBLIC_MAP_STYLE=https://tiles.openfreemap.org/styles/liberty
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? '/api/map-style'

export default function Map({ onSiteSelect }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

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
        data: '/api/sites',
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

      // Click → select site
      map.on('click', 'parking-circles', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        onSiteSelect(feature.properties as SiteProperties)
      })
    })

    mapRef.current = map

    // Refresh live data every 5 minutes
    const interval = setInterval(() => {
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
}
