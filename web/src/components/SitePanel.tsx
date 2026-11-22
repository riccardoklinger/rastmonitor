'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { getOpeningStatusMessageKey } from '@/lib/opening-status'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RawTooltip({ active, payload, label }: any) {
  const locale = useLocale()
  if (!active || !payload?.length) return null
  const { occ } = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-2 py-1 text-xs">
      <p className="font-medium text-gray-700">{label}</p>
      <p className="text-blue-600">{occ !== null ? `${Number(occ).toLocaleString(locale, { maximumFractionDigits: 1 })} %` : '–'}</p>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DailyTooltip({ active, payload, label }: any) {
  const locale = useLocale()
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-2 py-1 text-xs">
      <p className="font-medium text-gray-700">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value !== null ? `${Number(p.value).toLocaleString(locale, { maximumFractionDigits: 1 })} %` : '–'}
        </p>
      ))}
    </div>
  )
}

interface RawRow {
  fetched_at: string
  occupancy_pct: number | null
}

interface DailyRow {
  day: string
  mean_occ: number | null
  max_occ: number | null
  min_occ: number | null
}

function OccupancyBadge({ pct, locale }: { pct: number | null | undefined; locale: string }) {
  const t = useTranslations('site')
  if (pct == null) return <span className="text-gray-400 text-sm">{t('noData')}</span>
  const color =
    pct > 100 ? 'bg-red-900 text-white' :
    pct >= 95 ? 'bg-red-500 text-white' :
    pct >= 80 ? 'bg-orange-400 text-white' :
    pct >= 50 ? 'bg-yellow-400 text-black' :
    'bg-green-500 text-white'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {pct.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
    </span>
  )
}

function fmt(iso: string, locale: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}

interface Props {
  site: SiteProperties
  onClose: () => void
}

export default function SitePanel({ site, onClose }: Props) {
  const locale = useLocale()
  const t = useTranslations('site')
  const statusT = useTranslations('statuses')
  const [raw, setRaw] = useState<RawRow[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [expanded, setExpanded] = useState(false)

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
    t: fmt(r.fetched_at, locale),
    occ: r.occupancy_pct !== null ? Number(r.occupancy_pct) : null,
  }))

  const dailyData = daily.map((d) => ({
    day: fmtDay(d.day, locale),
    mean: d.mean_occ !== null ? Number(d.mean_occ) : null,
    max: d.max_occ !== null ? Number(d.max_occ) : null,
    min: d.min_occ !== null ? Number(d.min_occ) : null,
  }))

  const panelClass = expanded
    ? 'fixed inset-0 z-50 bg-white flex flex-col overflow-y-auto'
    : 'absolute top-0 right-0 h-full w-80 bg-white shadow-xl z-30 flex flex-col overflow-y-auto'

  const rawChartH  = expanded ? 260 : 100
  const dailyChartH = expanded ? 340 : 150
  const officialSpaces = site.official_spaces ?? null
  const totalSpaces = site.total_spaces ?? null
  const toleratedSpaces =
    officialSpaces != null && totalSpaces != null
      ? Math.max(0, totalSpaces - officialSpaces)
      : null
  const formatBoolean = (value: boolean | null | undefined) =>
    value == null ? t('unspecified') : value ? t('yes') : t('no')
  const staticDetails = [
    [t('operator'), site.operator_name],
    [t('street'), [site.street, site.house_number].filter(Boolean).join(' ')],
    [t('postcode'), site.postcode],
    [t('city'), site.city],
    [t('state'), site.state_name],
    [t('road'), site.road_identifier],
    [t('destination'), site.road_destination],
    [t('freeOfCharge'), formatBoolean(site.free_of_charge)],
    [t('locationType'), site.location_type],
    [t('certifiedSecure'), formatBoolean(site.certified_secure)],
  ]
  const openingStatusKey = getOpeningStatusMessageKey(site.opening_status)

  return (
    <>
      {expanded && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setExpanded(false)} />}
      <aside className={panelClass}>
        {/* Header */}
        <div className={`flex items-start justify-between border-b ${expanded ? 'p-6' : 'p-4'}`}>
          <div>
            <h2 className={`font-semibold leading-tight ${expanded ? 'text-lg' : 'text-sm'}`}>{site.name ?? site.datex_id}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {officialSpaces != null ? `${officialSpaces.toLocaleString(locale)} ${t('officialSpaces')}` : ''}
              {toleratedSpaces != null ? `${officialSpaces != null ? ' · ' : ''}${toleratedSpaces.toLocaleString(locale)} ${t('toleratedSpaces')}` : ''}
              {totalSpaces != null ? `${officialSpaces != null || toleratedSpaces != null ? ' · ' : ''}${totalSpaces.toLocaleString(locale)} ${t('totalSpaces')}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => setExpanded(e => !e)}
              title={expanded ? t('shutDown') : t('expand')}
              className="text-gray-400 hover:text-gray-700 text-base leading-none px-1"
            >
              {expanded ? '⊡' : '⛶'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
          </div>
        </div>

        <div className={expanded ? 'grid grid-cols-1 lg:grid-cols-2 gap-0 flex-1' : 'flex flex-col flex-1'}>
          {/* Live status */}
          <div className={`border-b space-y-2 ${expanded ? 'p-6' : 'p-4'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('currentOccupancy')}</span>
              <OccupancyBadge pct={site.occupancy_pct} locale={locale} />
            </div>
            {site.opening_status && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{t('status')}</span>
                <span className="text-xs">{openingStatusKey ? statusT(openingStatusKey) : site.opening_status}</span>
              </div>
            )}
            {site.fetched_at && (
              <p className="text-xs text-gray-400">
                {t('lastUpdated')}{' '}
                {new Date(site.fetched_at).toLocaleString(locale)}
              </p>
            )}
            <details className="border-t border-gray-100 pt-3">
              <summary className="cursor-pointer text-xs font-medium text-gray-700">{t('details')}</summary>
              <dl className="mt-2 space-y-2 text-xs">
                {staticDetails.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-gray-800 break-words">{value || t('unspecified')}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>

          {/* 72 h chart */}
          <div className={`border-b ${expanded ? 'p-6 lg:border-b-0 lg:border-l' : 'p-4'}`}>
            <h3 className="text-xs font-medium text-gray-700 mb-2">{t('last72Hours')}</h3>
            {rawData.length === 0 ? (
              <p className="text-xs text-gray-400">{t('noData')}</p>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={rawChartH}>
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
          <div className={expanded ? 'p-6 lg:col-span-2' : 'p-4'}>
            <h3 className="text-xs font-medium text-gray-700 mb-2">{t('last90Days')}</h3>
            {dailyData.length === 0 ? (
              <p className="text-xs text-gray-400">{t('noData')}</p>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={dailyChartH}>
                  <LineChart data={dailyData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={Math.floor(dailyData.length / 5)} />
                    <YAxis domain={[0, 'auto']} tick={{ fontSize: 9 }} />
                    <Tooltip content={<DailyTooltip />} />
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="max" stroke="#ef4444" dot={false} name={t('max')} strokeWidth={1} />
                    <Line type="monotone" dataKey="mean" stroke="#3b82f6" dot={false} name={t('mean')} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="min" stroke="#22c55e" dot={false} name={t('min')} strokeWidth={1} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex gap-3 mt-1 justify-center">
              {[[ '#ef4444', t('max') ], [ '#3b82f6', t('mean') ], [ '#22c55e', t('min') ]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="inline-block w-3 h-0.5" style={{ backgroundColor: c }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
