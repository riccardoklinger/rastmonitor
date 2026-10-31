export function readUrlFilters(params: URLSearchParams) {
  return {
    operator: (params.get('operator') ?? '').trim(),
    road: (params.get('road') ?? '').trim().toUpperCase().replace(/\s/g, ''),
  }
}

export function updateFilterUrl(url: URL, name: 'operator' | 'road', value: string) {
  if (value) {
    url.searchParams.set(name, value)
    url.searchParams.delete(name === 'operator' ? 'road' : 'operator')
  }
  else url.searchParams.delete(name)
  return url
}

export function activeMapFilter(filters: { operator: string; road: string }) {
  return filters.operator ? { operator: filters.operator, road: '' } : filters
}
