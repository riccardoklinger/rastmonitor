import distance from '@turf/distance'

export const STAR_RADIUS_KM = 100

export function buildParkingStar(origin: [number, number], data: GeoJSON.GeoJSON, radiusKm = STAR_RADIUS_KM): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
  if (data.type !== 'FeatureCollection') return { type: 'FeatureCollection', features }

  for (const site of data.features) {
    if (site.geometry?.type !== 'Point') continue
    const [lng, lat] = site.geometry.coordinates
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue
    const distanceKm = distance(origin, [lng, lat], { units: 'kilometers' })
    if (distanceKm > radiusKm) continue
    const capacity = Number(site.properties?.total_spaces)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [origin, [lng, lat]] },
      properties: {
        ...site.properties,
        distance_km: distanceKm,
        spike_width: Number.isFinite(capacity) && capacity > 0 ? Math.max(1, Math.min(12, capacity / 25)) : 1,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}