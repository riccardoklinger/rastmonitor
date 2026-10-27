'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

interface RoadFilterProps {
  value: string
  onSelect: (road: string) => void
}

export default function RoadFilter({ value, onSelect }: RoadFilterProps) {
  const [query, setQuery] = useState(value)
  const [roads, setRoads] = useState<string[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()
  const inputId = `${id}-input`
  const listId = `${id}-options`

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    fetch('/api/roads', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Road list unavailable')
        const data: unknown = await response.json()
        if (!Array.isArray(data) || !data.every(road => typeof road === 'string')) {
          throw new Error('Invalid road list')
        }
        if (controller.signal.aborted) return
        setRoads(data)
        setActive(0)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [attempt])

  const normalizedQuery = query.toUpperCase().replace(/\s/g, '')
  const options = normalizedQuery
    ? roads.filter(road => road.includes(normalizedQuery)).map(road => ({ value: road, label: road }))
    : [{ value: '', label: 'Alle Autobahnen' }, ...roads.map(road => ({ value: road, label: road }))]

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, query, roads])

  return (
    <div className="overflow-hidden rounded bg-white shadow-md">
      <div className="flex items-center gap-2 px-3 py-2">
        <label htmlFor={inputId} className="text-xs font-medium text-gray-600">Autobahn</label>
        <input
          id={inputId}
          autoFocus
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options[active] ? `${id}-option-${active}` : undefined}
          value={query}
          onChange={event => {
            setQuery(event.target.value.toUpperCase())
            setActive(0)
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!options.length) return
              const direction = event.key === 'ArrowDown' ? 1 : -1
              setActive(previous => Math.max(0, Math.min(options.length - 1, previous + direction)))
            }
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              const option = options[active]
              if (option) onSelect(option.value)
            }
          }}
          placeholder="z.B. A2"
          className="min-w-0 flex-1 border border-gray-200 rounded px-2 py-1 text-xs font-mono uppercase focus:outline-none focus:border-blue-400"
        />
        {value && (
          <button
            onClick={() => onSelect('')}
            aria-label="Autobahnfilter zurücksetzen"
            title="Autobahnfilter zurücksetzen"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-700"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-label="Autobahnen" className="max-h-[min(18rem,40dvh)] overflow-y-auto border-t border-gray-100">
        {options.map((option, index) => (
          <li
            key={option.value}
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => onSelect(option.value)}
            className={`flex min-h-10 cursor-pointer items-center px-3 py-2 text-sm ${index === active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
          >
            {option.label}
          </li>
        ))}
      </ul>
      {status === 'loading' && <p role="status" className="px-3 py-2 text-xs text-gray-500">Wird geladen...</p>}
      {status === 'ready' && options.length === 0 && <p role="status" className="px-3 py-2 text-xs text-gray-500">Keine passende Autobahn</p>}
      {status === 'error' && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs text-red-700">
          <span>Autobahnen konnten nicht geladen werden.</span>
          <button onClick={() => setAttempt(previous => previous + 1)} aria-label="Erneut laden" title="Erneut laden" className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}