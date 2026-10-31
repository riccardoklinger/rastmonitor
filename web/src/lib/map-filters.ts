import type { ExpressionSpecification, Map } from 'maplibre-gl'

export function applyFilters(map: Map, road: string, operator: string) {
  if (!map.getLayer('parking-circles')) return
  const conditions: ExpressionSpecification[] = []
  if (road.trim()) {
    conditions.push(['==', ['upcase', ['coalesce', ['get', 'road_identifier'], '']], road.trim().toUpperCase()])
  }
  if (operator.trim()) {
    conditions.push(['!=', ['index-of', operator.trim().toLowerCase(), ['downcase', ['coalesce', ['get', 'operator_name'], '']]], -1])
  }
  if (!conditions.length) {
    map.setFilter('parking-circles', null)
    if (map.getLayer('parking-circles-dim'))
      map.setLayoutProperty('parking-circles-dim', 'visibility', 'none')
    return
  }
  const match: ExpressionSpecification = conditions.length === 1 ? conditions[0] : ['all', ...conditions]
  if (map.getLayer('parking-circles-dim')) {
    map.setLayoutProperty('parking-circles-dim', 'visibility', 'visible')
    map.setFilter('parking-circles-dim', ['!', match])
  }
  map.setFilter('parking-circles', match)
}

export function zoomToFilteredSites(map: Map, data: GeoJSON.GeoJSON, road: string, operator: string) {
  const normalizedRoad = road.trim().toUpperCase()
  const normalizedOperator = operator.trim().toLowerCase()
  if ((!normalizedRoad && !normalizedOperator) || data.type !== 'FeatureCollection') return

  const points: [number, number][] = []
  for (const feature of data.features) {
    if (feature.geometry?.type !== 'Point') continue
    const properties = feature.properties
    if (normalizedRoad && (properties?.road_identifier ?? '').toUpperCase() !== normalizedRoad) continue
    if (normalizedOperator && !(properties?.operator_name ?? '').toLowerCase().includes(normalizedOperator)) continue
    const [lng, lat] = feature.geometry.coordinates
    points.push([lng, lat])
  }
  if (!points.length) return

  const first = points[0]
  const west = Math.min(...points.map(([lng]) => lng))
  const east = Math.max(...points.map(([lng]) => lng))
  const south = Math.min(...points.map(([, lat]) => lat))
  const north = Math.max(...points.map(([, lat]) => lat))
  if (points.length === 1 || (west === east && south === north)) {
    map.flyTo({ center: first, zoom: 10 })
  } else {
    map.fitBounds([[west, south], [east, north]], { padding: 60 })
  }
}
