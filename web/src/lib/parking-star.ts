import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import distance from '@turf/distance'

export const STAR_MINUTES = 30
export const STAR_RADIUS_KM = 100
export type ParkingIsochrone = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>

export function buildParkingStar(origin: [number, number], data: GeoJSON.GeoJSON, area: ParkingIsochrone | number): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
  if (data.type !== 'FeatureCollection') return { type: 'FeatureCollection', features }

  for (const site of data.features) {
    if (site.geometry?.type !== 'Point') continue
    const [lng, lat] = site.geometry.coordinates
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue
    if (typeof area === 'number'
      ? distance(origin, [lng, lat], { units: 'kilometers' }) > area
      : !area.features.some(polygon => booleanPointInPolygon([lng, lat], polygon))) continue
    const capacity = Number(site.properties?.total_spaces)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [origin, [lng, lat]] },
      properties: {
        ...site.properties,
        spike_width: Number.isFinite(capacity) && capacity > 0 ? Math.max(1, Math.min(12, capacity / 25)) : 1,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}