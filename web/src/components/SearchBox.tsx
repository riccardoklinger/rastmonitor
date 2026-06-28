'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface SearchResult {
  datex_id: string
  name: string
  total_spaces: number
  longitude: number
  latitude: number
  occupancy_pct: number | null
}

interface SearchBoxProps {
  onSelect: (result: SearchResult) => void
}

function OccupancyDot({ pct }: { pct: number | null }) {
  const color =
    pct == null  ? '#9ca3af' :
    pct > 100    ? '#7f1d1d' :
    pct >= 95    ? '#ef4444' :
    pct >= 80    ? '#f97316' :
    pct >= 50    ? '#eab308' :
                   '#22c55e'
  return (
    <span
      style={{ backgroundColor: color }}
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
    />
  )
}

export default function SearchBox({ onSelect }: SearchBoxProps) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<SearchResult[]>([])
  const [open, setOpen]         = useState(false)
  const [active, setActive]     = useState(-1)
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef            = useRef<HTMLDivElement>(null)

  // Debounced fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data: SearchResult[] = await res.json()
      setResults(data)
      setOpen(data.length > 0)
      setActive(-1)
    }, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((r: SearchResult) => {
    setQuery(r.name)
    setOpen(false)
    onSelect(r)
  }, [onSelect])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && active >= 0) handleSelect(results[active])
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="flex items-center bg-white rounded-lg shadow border border-gray-200 px-3 py-2 gap-2">
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Parkplatz suchen…"
          className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        )}
      </div>

      {open && (
        <ul className="absolute top-full mt-1 left-0 right-0 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-72 overflow-y-auto">
          {results.map((r, i) => (
            <li
              key={r.datex_id}
              onMouseDown={() => handleSelect(r)}
              onMouseEnter={() => setActive(i)}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-sm ${
                i === active ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <OccupancyDot pct={r.occupancy_pct} />
              <div className="min-w-0">
                <div className="font-medium text-gray-800 truncate">{r.name}</div>
                <div className="text-xs text-gray-400">
                  {r.occupancy_pct != null ? `${r.occupancy_pct.toFixed(0)} % belegt` : 'Keine Daten'}
                  {' · '}{r.total_spaces} Plätze
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
