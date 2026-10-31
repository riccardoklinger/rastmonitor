export function readUrlFilters(params: URLSearchParams) {
  return {
    operator: (params.get('operator') ?? '').trim(),
    road: (params.get('road') ?? '').trim().toUpperCase().replace(/\s/g, ''),
    state: (params.get('state') ?? '').trim(),
  }
}

export function updateFilterUrl(url: URL, name: 'operator' | 'road' | 'state', value: string) {
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
