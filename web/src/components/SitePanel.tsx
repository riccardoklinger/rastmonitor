'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts'
import type { SiteProperties } from './Map'

/** Small corner badge shown when a chart contains any synthetic data points */
function SyntheticBadge() {
  return (
    <span className="absolute top-1 right-1 z-10 text-[9px] font-semibold tracking-wider text-gray-400 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 select-none pointer-events-none">
      SYNTHETIC DATA
    </span>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RawTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const { occ, synthetic } = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-2 py-1 text-xs">
      <p className="font-medium text-gray-700">{label}</p>
      <p className="text-blue-600">{occ !== null ? `${Number(occ).toFixed(1)} %` : '–'}</p>
      {synthetic && <p className="text-gray-400 italic mt-0.5">synthetic</p>}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DailyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const synthetic = payload[0]?.payload?.synthetic
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-2 py-1 text-xs">
      <p className="font-medium text-gray-700">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value !== null ? `${Number(p.value).toFixed(1)} %` : '–'}
        </p>
      ))}
      {synthetic && <p className="text-gray-400 italic mt-0.5">synthetic</p>}
    </div>
  )
}

interface RawRow {
  fetched_at: string
  occupancy_pct: number | null
  is_synthetic: boolean
}

interface DailyRow {
  day: string
  mean_occ: number | null
  max_occ: number | null
  min_occ: number | null
  is_synthetic: boolean
}

function OccupancyBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-gray-400 text-sm">Keine Daten</span>
  const color =
    pct > 100 ? 'bg-red-900 text-white' :
    pct >= 95 ? 'bg-red-500 text-white' :
    pct >= 80 ? 'bg-orange-400 text-white' :
    pct >= 50 ? 'bg-yellow-400 text-black' :
    'bg-green-500 text-white'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {pct.toFixed(1)} %
    </span>
  )
}

function fmt(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

interface Props {
  site: SiteProperties
  onClose: () => void
}

export default function SitePanel({ site, onClose }: Props) {
  const [raw, setRaw] = useState<RawRow[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])

  useEffect(() => {
    setRaw([])
    setDaily([])
    fetch(`/api/raw?datex_id=${site.datex_id}`)
      .then((r) => r.json())
      .then(setRaw)
    fetch(`/api/daily?datex_id=${site.datex_id}&days=90`)
      .then((r) => r.json())
      .then(setDaily)
  }, [site.datex_id])

  const rawData = raw.map((r) => ({
    t: fmt(r.fetched_at),
    occ: r.occupancy_pct !== null ? Number(r.occupancy_pct) : null,
    synthetic: r.is_synthetic,
  }))
  const rawHasSynthetic = raw.some((r) => r.is_synthetic)

  const dailyData = daily.map((d) => ({
    day: fmtDay(d.day),
    mean: d.mean_occ !== null ? Number(d.mean_occ) : null,
    max: d.max_occ !== null ? Number(d.max_occ) : null,
    min: d.min_occ !== null ? Number(d.min_occ) : null,
    synthetic: d.is_synthetic,
  }))
  const dailyHasSynthetic = daily.some((d) => d.is_synthetic)

  return (
    <aside className="absolute top-0 right-0 h-full w-80 bg-white shadow-xl z-10 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold text-sm leading-tight">{site.name ?? site.datex_id}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {site.total_spaces ? `${site.total_spaces} Stellplätze` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 ml-2 text-lg leading-none">✕</button>
      </div>

      {/* Live status */}
      <div className="p-4 border-b space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Aktuelle Auslastung</span>
          <OccupancyBadge pct={site.occupancy_pct} />
        </div>
        {site.opening_status && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Status</span>
            <span className="text-xs capitalize">{site.opening_status}</span>
          </div>
        )}
        {site.fetched_at && (
          <p className="text-xs text-gray-400">
            Letzte Aktualisierung:{' '}
            {new Date(site.fetched_at).toLocaleString('de-DE')}
          </p>
        )}
      </div>

      {/* 72 h sparkline */}
      <div className="p-4 border-b">
        <h3 className="text-xs font-medium text-gray-700 mb-2">Letzte 72 Stunden</h3>
        {rawData.length === 0 ? (
          <p className="text-xs text-gray-400">Keine Daten</p>
        ) : (
          <div className="relative">
            {rawHasSynthetic && <SyntheticBadge />}
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={rawData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 9 }} />
                <Tooltip content={<RawTooltip />} />
                <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="occ"
                  stroke="#3b82f6"
                  fill="url(#occGrad)"
                  dot={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Daily chart: last 90 days */}
      <div className="p-4">
        <h3 className="text-xs font-medium text-gray-700 mb-2">Tageswerte (90 Tage)</h3>
        {dailyData.length === 0 ? (
          <p className="text-xs text-gray-400">Keine Daten</p>
        ) : (
          <div className="relative">
            {dailyHasSynthetic && <SyntheticBadge />}
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={dailyData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={Math.floor(dailyData.length / 5)} />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 9 }} />
                <Tooltip content={<DailyTooltip />} />
                <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="max" stroke="#ef4444" dot={false} name="Max" strokeWidth={1} />
                <Line type="monotone" dataKey="mean" stroke="#3b82f6" dot={false} name="Mittel" strokeWidth={1.5} />
                <Line type="monotone" dataKey="min" stroke="#22c55e" dot={false} name="Min" strokeWidth={1} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex gap-3 mt-1 justify-center">
          {[['#ef4444', 'Max'], ['#3b82f6', 'Mittel'], ['#22c55e', 'Min']].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: c }} />
              {l}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
