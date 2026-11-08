import type { ExpressionSpecification, Map } from 'maplibre-gl'

export function applyFilters(map: Map, road: string, operator: string, state = '') {
  if (!map.getLayer('parking-circles')) return
  const conditions: ExpressionSpecification[] = []
  if (state.trim()) {
    conditions.push(['==', ['downcase', ['coalesce', ['get', 'state_name'], '']], state.trim().toLowerCase()])
  }
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

export function zoomToFilteredSites(map: Map, data: GeoJSON.GeoJSON, road: string, operator: string, state = '') {
  const normalizedRoad = road.trim().toUpperCase()
  const normalizedOperator = operator.trim().toLowerCase()
  const normalizedState = state.trim().toLowerCase()
  if ((!normalizedRoad && !normalizedOperator && !normalizedState) || data.type !== 'FeatureCollection') return

  const points: [number, number][] = []
  let singleMatch: GeoJSON.Feature<GeoJSON.Point> | undefined
  for (const feature of data.features) {
    if (feature.geometry?.type !== 'Point') continue
    const properties = feature.properties
    if (normalizedState && (properties?.state_name ?? '').toLowerCase() !== normalizedState) continue
    if (normalizedRoad && (properties?.road_identifier ?? '').toUpperCase() !== normalizedRoad) continue
    if (normalizedOperator && !(properties?.operator_name ?? '').toLowerCase().includes(normalizedOperator)) continue
    const [lng, lat] = feature.geometry.coordinates
    points.push([lng, lat])
    singleMatch = { ...feature, geometry: feature.geometry }
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
  return points.length === 1 ? singleMatch : undefined
}

export function zoomToHighlightedSite(map: Map, data: GeoJSON.GeoJSON, datexId: string) {
  if (!datexId || data.type !== 'FeatureCollection') return
  const feature = data.features.find(candidate =>
    candidate.geometry?.type === 'Point' && candidate.properties?.datex_id === datexId
  )
  if (!feature || feature.geometry.type !== 'Point') return
  const [lng, lat] = feature.geometry.coordinates
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
  map.flyTo({ center: [lng, lat], zoom: 10, essential: true })
  return feature as GeoJSON.Feature<GeoJSON.Point>
}
