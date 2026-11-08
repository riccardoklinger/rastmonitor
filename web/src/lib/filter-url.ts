export function readUrlFilters(params: URLSearchParams) {
  return {
    operator: (params.get('operator') ?? '').trim(),
    road: (params.get('road') ?? '').trim().toUpperCase().replace(/\s/g, ''),
    state: (params.get('state') ?? '').trim(),
  }
}

export function readHighlightedSite(params: URLSearchParams) {
  return (params.get('highlight') ?? params.get('Highlight') ?? '').trim()
}

export function updateHighlightedSiteUrl(url: URL, datexId: string) {
  if (datexId) {
    url.searchParams.set('highlight', datexId)
    url.searchParams.delete('Highlight')
    for (const filter of ['operator', 'road', 'state']) url.searchParams.delete(filter)
  } else {
    url.searchParams.delete('highlight')
    url.searchParams.delete('Highlight')
  }
  return url
}

export function updateFilterUrl(url: URL, name: 'operator' | 'road' | 'state', value: string) {
  url.searchParams.delete('highlight')
  url.searchParams.delete('Highlight')
  if (value) {
    url.searchParams.set(name, value)
    for (const other of ['operator', 'road', 'state']) {
      if (other !== name) url.searchParams.delete(other)
    }
  }
  else url.searchParams.delete(name)
  return url
}

export function activeMapFilter(filters: { operator: string; road: string; state: string }) {
  if (filters.state) return { operator: '', road: '', state: filters.state }
  return filters.operator ? { operator: filters.operator, road: '', state: '' } : filters
}
