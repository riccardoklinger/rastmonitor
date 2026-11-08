import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import distance from '@turf/distance'

export const STAR_MINUTES = 30
export const STAR_RADIUS_KM = 100
export type ParkingIsochrone = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>

export function summarizeParkingAvailability(features: GeoJSON.Feature<GeoJSON.LineString>[]) {
  const sites = features.map(feature => {
    const { vacant_spaces: vacant, total_spaces: capacity, occupancy_pct: occupancy } = feature.properties ?? {}
    if (typeof vacant === 'number' && Number.isFinite(vacant) && vacant >= 0) {
      return { feature, vacant, estimated: false }
    }
    if (typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0 &&
        typeof occupancy === 'number' && Number.isFinite(occupancy) && occupancy >= 0) {
      return { feature, vacant: Math.max(0, Math.round(capacity * (1 - occupancy / 100))), estimated: true }
    }
    return { feature, vacant: null, estimated: false }
  })
  sites.sort((first, second) => (first.feature.properties?.distance_km ?? Infinity) - (second.feature.properties?.distance_km ?? Infinity))
  return {
    sites,
    total: sites.reduce((sum, site) => sum + (site.vacant ?? 0), 0),
    unknown: sites.filter(site => site.vacant === null).length,
    estimated: sites.some(site => site.estimated),
  }
}

export function buildParkingStar(origin: [number, number], data: GeoJSON.GeoJSON, area: ParkingIsochrone | number): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
  if (data.type !== 'FeatureCollection') return { type: 'FeatureCollection', features }

  for (const site of data.features) {
    if (site.geometry?.type !== 'Point') continue
    const [lng, lat] = site.geometry.coordinates
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue
    const distanceKm = distance(origin, [lng, lat], { units: 'kilometers' })
    if (typeof area === 'number'
      ? distanceKm > area
      : !area.features.some(polygon => booleanPointInPolygon([lng, lat], polygon))) continue
    const capacity = Number(site.properties?.total_spaces)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [origin, [lng, lat]] },
      properties: {
        ...site.properties,
        spike_width: Number.isFinite(capacity) && capacity > 0 ? Math.max(1, Math.min(12, capacity / 25)) : 1,
        distance_km: distanceKm,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}