'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

const MAX_DAYS = 90

export type DailyMetric = 'max' | 'mean' | 'median' | 'min'

const METRIC_LABELS: Record<DailyMetric, string> = {
  max:    'Maximum',
  mean:   'Mittelwert',
  median: 'Median',
  min:    'Minimum',
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function offsetDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d
}

interface DayPickerProps {
  onChange: (date: string, metric: DailyMetric) => void
}

export default function DayPicker({ onChange }: DayPickerProps) {
  const [daysAgo, setDaysAgo] = useState(1)
  const [metric, setMetric]   = useState<DailyMetric>('max')
  const [playing, setPlaying] = useState(false)
  const intervalRef           = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedDate = toDateString(offsetDate(daysAgo))
  const minDate      = toDateString(offsetDate(MAX_DAYS))
  const maxDate      = toDateString(offsetDate(1))

  useEffect(() => {
    onChange(selectedDate, metric)
  }, [selectedDate, metric, onChange])

  // Playback: step one day every 600ms, oldest → most recent
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setDaysAgo(prev => {
          if (prev <= 1) { setPlaying(false); return 1 }
          return prev - 1
        })
      }, 600)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  const handleDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false)
    const d     = new Date(e.target.value)
    const today = new Date()
    const diff  = Math.round((today.getTime() - d.getTime()) / 86400000)
    setDaysAgo(Math.max(1, Math.min(MAX_DAYS, diff)))
  }, [])

  const isMostRecent = daysAgo <= 1

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-white/95 backdrop-blur px-4 py-3 shadow-lg border-t border-gray-200">

      <span className="flex-shrink-0 text-xs font-semibold text-amber-700 uppercase tracking-wide w-8">
        90T
      </span>

      {/* Play / Pause */}
      <button
        onClick={() => { if (isMostRecent) setDaysAgo(MAX_DAYS); setPlaying(p => !p) }}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 transition"
        title={playing ? 'Pause' : 'Wiedergabe'}
      >
        {playing ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <rect x="4" y="3" width="4" height="14" rx="1" />
            <rect x="12" y="3" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l10 6-10 6V4z" />
          </svg>
        )}
      </button>

      <select
        value={metric}
        onChange={(e) => setMetric(e.target.value as DailyMetric)}
        className="flex-shrink-0 text-sm border border-amber-200 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer"
      >
        {(Object.entries(METRIC_LABELS) as [DailyMetric, string][]).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {/* Slider: left = MAX_DAYS ago (oldest), right = 1 day ago (most recent) */}
      <input
        type="range"
        min={1}
        max={MAX_DAYS}
        step={1}
        value={MAX_DAYS + 1 - daysAgo}
        onChange={e => { setPlaying(false); setDaysAgo(MAX_DAYS + 1 - Number(e.target.value)) }}
        className="flex-1 accent-amber-600 cursor-pointer"
      />

      <input
        type="date"
        min={minDate}
        max={maxDate}
        value={selectedDate}
        onChange={handleDateInput}
        className="flex-shrink-0 text-sm border border-amber-200 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer"
      />

      <div className="flex-shrink-0 text-xs text-amber-700 min-w-[3.5rem] text-right">
        {new Date(selectedDate).toLocaleDateString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit',
        })}
      </div>
    </div>
  )
}
