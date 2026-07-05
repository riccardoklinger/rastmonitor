'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'live' | 'history' | 'dailymax'
type SortDir = 'asc' | 'desc'

interface LiveRow {
  datex_id: string
  name: string | null
  road_identifier: string | null
  road_destination: string | null
  operator_name: string | null
  free_of_charge: boolean | null
  usage_scenario: string | null
  location_type: string | null
  certified_secure: boolean | null
  occupancy_detection_type: string | null
  total_spaces: number | null
  occupancy_pct: number | null
  opening_status: string | null
  fetched_at: string | null
}

interface AggRow {
  datex_id: string
  name: string | null
  road_identifier: string | null
  road_destination: string | null
  operator_name: string | null
  total_spaces: number | null
  min_occ: number | null
  mean_occ: number | null
  max_occ: number | null
  data_points: number
}

type Row = LiveRow | AggRow

interface ColDef {
  key: string
  label: string
  type: 'string' | 'number' | 'datetime' | 'exact'
  modes: ViewMode[]
  get: (r: Row) => unknown
}

// ── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: ColDef[] = [
  { key: 'name',                    label: 'Name',             type: 'string', modes: ['live','history','dailymax'], get: r => r.name },
  { key: 'road_identifier',         label: 'Autobahn',         type: 'exact',  modes: ['live','history','dailymax'], get: r => (r as LiveRow).road_identifier },
  { key: 'road_destination',        label: 'Richtung',         type: 'string', modes: ['live','history','dailymax'], get: r => (r as LiveRow).road_destination },
  { key: 'operator_name',           label: 'Betreiber',        type: 'string', modes: ['live','history','dailymax'], get: r => (r as LiveRow).operator_name },
  { key: 'total_spaces',            label: 'Stellplätze',      type: 'number', modes: ['live','history','dailymax'], get: r => r.total_spaces },
  { key: 'occupancy_pct',           label: 'Auslastung %',     type: 'number', modes: ['live'],                     get: r => (r as LiveRow).occupancy_pct },
  { key: 'min_occ',                 label: 'Min %',            type: 'number', modes: ['history','dailymax'],        get: r => (r as AggRow).min_occ },
  { key: 'mean_occ',                label: 'Mittel %',         type: 'number', modes: ['history','dailymax'],        get: r => (r as AggRow).mean_occ },
  { key: 'max_occ',                 label: 'Max %',            type: 'number', modes: ['history','dailymax'],        get: r => (r as AggRow).max_occ },
  { key: 'data_points',             label: 'Messpunkte',       type: 'number', modes: ['history','dailymax'],        get: r => (r as AggRow).data_points },
  { key: 'usage_scenario',          label: 'Nutzung',          type: 'string', modes: ['live'],                     get: r => (r as LiveRow).usage_scenario },
  { key: 'location_type',           label: 'Lagetyp',          type: 'string', modes: ['live'],                     get: r => (r as LiveRow).location_type },
  { key: 'free_of_charge',          label: 'Kostenlos',        type: 'string', modes: ['live'],                     get: r => { const v = (r as LiveRow).free_of_charge; return v == null ? null : v ? 'Ja' : 'Nein' } },
  { key: 'certified_secure',        label: 'Zert. sicher',     type: 'string', modes: ['live'],                     get: r => { const v = (r as LiveRow).certified_secure; return v == null ? null : v ? 'Ja' : 'Nein' } },
  { key: 'occupancy_detection_type',label: 'Erfassung',        type: 'string', modes: ['live'],                     get: r => (r as LiveRow).occupancy_detection_type },
  { key: 'opening_status',          label: 'Status',           type: 'string', modes: ['live'],                     get: r => (r as LiveRow).opening_status },
  { key: 'fetched_at',              label: 'Aktualisierung',   type: 'datetime', modes: ['live'],                   get: r => (r as LiveRow).fetched_at },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function occColor(pct: number | null): string {
  if (pct == null) return '#9ca3af'
  if (pct > 100)   return '#7f1d1d'
  if (pct >= 95)   return '#ef4444'
  if (pct >= 80)   return '#f97316'
  if (pct >= 50)   return '#eab308'
  return '#22c55e'
}

function OccBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-gray-300">–</span>
  const bg = occColor(pct)
  const color = pct > 100 || pct >= 95 ? 'white' : pct >= 50 ? '#1a1a1a' : 'white'
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold tabular-nums"
      style={{ backgroundColor: bg, color }}
    >
      {pct.toFixed(1)} %
    </span>
  )
}

function fmtDatetime(iso: string | null) {
  if (!iso) return '–'
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function matchesNumeric(value: unknown, filter: string): boolean {
  const f = filter.trim()
  if (!f) return true
  const num = value as number | null
  if (num == null) return false
  const m = f.match(/^([><=!]{1,2})(.+)/)
  if (m) {
    const op = m[1], n = parseFloat(m[2])
    if (isNaN(n)) return true
    if (op === '>')  return num > n
    if (op === '>=') return num >= n
    if (op === '<')  return num < n
    if (op === '<=') return num <= n
    if (op === '==' || op === '=') return num === n
    if (op === '!=' || op === '!') return num !== n
  }
  return num.toFixed(1).includes(f)
}

function matchesString(value: unknown, filter: string): boolean {
  if (!filter.trim()) return true
  return ((value as string) ?? '').toLowerCase().includes(filter.toLowerCase())
}

const OCC_KEYS = new Set(['occupancy_pct', 'min_occ', 'mean_occ', 'max_occ'])

// ── Main component ───────────────────────────────────────────────────────────

export default function TablePage() {
  const [mode, setMode]   = useState<ViewMode>('live')
  const [rows, setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})

  // Fetch data when mode changes
  useEffect(() => {
    setLoading(true)
    setRows([])

    const url =
      mode === 'live'     ? '/api/sites' :
      mode === 'history'  ? '/api/sites/aggregate?period=72h' :
                            '/api/sites/aggregate?period=90d'

    const transform = (data: unknown): Row[] => {
      if (mode === 'live') {
        // GeoJSON → extract properties
        const fc = data as GeoJSON.FeatureCollection
        return fc.features.map(f => f.properties as LiveRow)
      }
      return data as AggRow[]
    }

    fetch(url)
      .then(r => r.json())
      .then(data => setRows(transform(data)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [mode])

  const activeCols = useMemo(
    () => COLUMNS.filter(c => c.modes.includes(mode)),
    [mode]
  )

  const handleSort = useCallback((key: string) => {
    setSortDir(d => sortKey === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortKey(key)
  }, [sortKey])

  const setFilter = useCallback((key: string, val: string) => {
    setFilters(f => ({ ...f, [key]: val }))
  }, [])

  const displayed = useMemo(() => {
    let data = rows.filter(row =>
      activeCols.every(col => {
        const f = filters[col.key] ?? ''
        if (!f) return true
        const v = col.get(row)
        if (col.type === 'number') return matchesNumeric(v, f)
        if (col.type === 'exact')  return (v as string ?? '').toUpperCase() === f.trim().toUpperCase()
        return matchesString(v, f)
      })
    )

    data = [...data].sort((a, b) => {
      const col = activeCols.find(c => c.key === sortKey)
      const av = col ? col.get(a) : null
      const bv = col ? col.get(b) : null
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

    return data
  }, [rows, filters, activeCols, sortKey, sortDir])

  const modeLabel = {
    live: 'Aktuelle Werte',
    history: 'Min / Mittel / Max der letzten 72 Stunden',
    dailymax: 'Min / Mittel / Max der letzten 90 Tage',
  }[mode]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
          ← Karte
        </Link>
        <h1 className="font-semibold text-gray-800 text-sm">Stationsübersicht</h1>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {([
            ['live',     '● Live'],
            ['history',  '⏱ 72h'],
            ['dailymax', '📅 90T'],
          ] as [ViewMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition ${
                mode === m
                  ? m === 'dailymax' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-400 italic">{modeLabel}</span>

        <span className="ml-auto text-xs text-gray-400">
          {loading ? 'Lade…' : `${displayed.length} von ${rows.length} Stationen`}
        </span>
      </header>

      {/* Filter hint */}
      <div className="px-4 py-1.5 text-xs text-gray-400 bg-white border-b">
        Zahlenfilter:{' '}
        {['>50', '<=80', '95'].map(ex => (
          <code key={ex} className="bg-gray-100 px-1 rounded mx-0.5">{ex}</code>
        ))}{' '}
        · Textfilter: Teilstring
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-2">
        <table className="w-full text-xs border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100 border-b border-gray-200">
              {activeCols.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 select-none whitespace-nowrap"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-blue-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
            <tr className="bg-white border-b border-gray-200">
              {activeCols.map(col => (
                <th key={col.key} className="px-2 py-1">
                  <input
                    type="text"
                    value={filters[col.key] ?? ''}
                    onChange={e => setFilter(col.key, e.target.value)}
                    placeholder={col.type === 'number' ? '>50' : col.type === 'exact' ? 'z.B. A2' : 'Filter…'}
                    className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs font-normal focus:outline-none focus:border-blue-400"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 && !loading && (
              <tr>
                <td colSpan={activeCols.length} className="text-center py-12 text-gray-400">
                  Keine Daten
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={activeCols.length} className="text-center py-12 text-gray-400">
                  Lade Daten…
                </td>
              </tr>
            )}
            {displayed.map((row, i) => (
              <tr
                key={row.datex_id}
                className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
              >
                {activeCols.map(col => {
                  const v = col.get(row)

                  if (OCC_KEYS.has(col.key)) {
                    return (
                      <td key={col.key} className="px-3 py-1.5">
                        <OccBadge pct={v as number | null} />
                      </td>
                    )
                  }

                  if (col.type === 'datetime') {
                    return (
                      <td key={col.key} className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap">
                        {fmtDatetime(v as string | null)}
                      </td>
                    )
                  }

                  return (
                    <td key={col.key} className="px-3 py-1.5 text-gray-700">
                      {v == null ? <span className="text-gray-300">–</span> : String(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

