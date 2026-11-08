import { recordRoutingUsage } from '@/lib/routing-usage'
import { RoutingBusyError, runRoutingTask } from '@/lib/routing-queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 75

const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const baseUrl = process.env.ORS_URL
  if (!baseUrl) return Response.json({ available: false }, { headers })
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v2/health`, {
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(2_000)]),
    })
    const data = response.ok ? await response.json() : null
    return Response.json({ available: data?.status === 'ready' }, { headers })
  } catch {
    return Response.json({ available: false }, { headers })
  }
}

function validPolygon(coordinates: unknown): boolean {
  return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(ring =>
    Array.isArray(ring) && ring.length >= 4 && ring.every(position =>
      Array.isArray(position) && position.length >= 2 &&
      Number.isFinite(position[0]) && Number.isFinite(position[1]) &&
      Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90
    ) && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  )
}

export async function POST(request: Request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Ungültige Anfrage' }, { status: 400, headers })
  }
  const { origin, minutes } = body ?? {}
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite) ||
      Math.abs(origin[0]) > 180 || Math.abs(origin[1]) > 90 ||
      !Number.isInteger(minutes) || minutes < 10 || minutes > 60) {
    return Response.json({ error: 'Standort und Fahrzeit von 10 bis 60 Minuten erforderlich' }, { status: 400, headers })
  }
  const baseUrl = process.env.ORS_URL
  if (!baseUrl) return Response.json({ error: 'Lkw-Routing ist nicht konfiguriert' }, { status: 503, headers })

  try {
    return await runRoutingTask(request.signal, async () => {
      let success = false
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v2/isochrones/driving-hgv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({ locations: [origin], range: [minutes * 60], range_type: 'time', location_type: 'start' }),
        })
        if (!response.ok) {
          const noRoute = response.status === 400 || response.status === 404
          return Response.json({ error: noRoute ? 'Keine Lkw-Isochrone an diesem Standort verfügbar' : 'Lkw-Routing ist noch nicht bereit oder nicht verfügbar' }, { status: noRoute ? 422 : 503, headers })
        }
        const data = await response.json()
        if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length ||
            !data.features.every((feature: GeoJSON.Feature) => feature?.type === 'Feature' && (
              feature.geometry?.type === 'Polygon' ? validPolygon(feature.geometry.coordinates) :
              feature.geometry?.type === 'MultiPolygon' && feature.geometry.coordinates.length > 0 && feature.geometry.coordinates.every(validPolygon)
            ))) {
          return Response.json({ error: 'Ungültige Isochrone vom Lkw-Routing' }, { status: 502, headers })
        }
        success = true
        return Response.json(data, { headers })
      } catch {
        return Response.json({ error: 'Lkw-Routing nicht erreichbar oder Zeitlimit überschritten' }, { status: 503, headers })
      } finally {
        await recordRoutingUsage(success)
      }
    })
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499, headers })
    if (error instanceof RoutingBusyError) {
      return Response.json({ error: error.message, code: 'ROUTING_BUSY' }, { status: 503, headers: { ...headers, 'Retry-After': '2' } })
    }
    return Response.json({ error: 'Lkw-Routing nicht erreichbar' }, { status: 503, headers })
  }
}