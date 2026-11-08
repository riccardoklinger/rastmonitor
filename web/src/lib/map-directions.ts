export type MapProvider = 'apple' | 'google'

export function buildDirectionsUrl(
  origin: [number, number],
  destination: [number, number],
  provider: MapProvider
): string {
  const coordinate = ([longitude, latitude]: [number, number]) => `${latitude},${longitude}`
  const start = coordinate(origin)
  const end = coordinate(destination)

  if (provider === 'apple') {
    const params = new URLSearchParams({ saddr: start, daddr: end, dirflg: 'd' })
    return `https://maps.apple.com/?${params}`
  }

  const params = new URLSearchParams({ api: '1', origin: start, destination: end, travelmode: 'driving' })
  return `https://www.google.com/maps/dir/?${params}`
}