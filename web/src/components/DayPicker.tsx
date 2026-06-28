'use client'

import { useState, useCallback, useEffect } from 'react'

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
  const [metric, setMetric] = useState<DailyMetric>('max')

  const selectedDate = toDateString(offsetDate(daysAgo))
  const minDate = toDateString(offsetDate(MAX_DAYS))
  const maxDate = toDateString(offsetDate(1))

  useEffect(() => {
    onChange(selectedDate, metric)
  }, [selectedDate, metric, onChange])

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDaysAgo(Number(e.target.value))
  }, [])

  const handleDateInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value)
    const today = new Date()
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
    setDaysAgo(Math.max(1, Math.min(MAX_DAYS, diff)))
  }, [])

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-amber-50/95 backdrop-blur px-4 py-3 shadow-lg border-t border-amber-200">
      <span className="flex-shrink-0 text-xs font-semibold text-amber-800 uppercase tracking-wide">
        90-Tage
      </span>

      <select
        value={metric}
        onChange={(e) => setMetric(e.target.value as DailyMetric)}
        className="flex-shrink-0 text-sm border border-amber-300 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer"
      >
        {(Object.entries(METRIC_LABELS) as [DailyMetric, string][]).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      <input
        type="range"
        min={1}
        max={MAX_DAYS}
        step={1}
        value={daysAgo}
        onChange={handleSlider}
        className="flex-1 accent-amber-600 cursor-pointer"
        style={{ direction: 'rtl' }}
      />

      <input
        type="date"
        min={minDate}
        max={maxDate}
        value={selectedDate}
        onChange={handleDateInput}
        className="flex-shrink-0 text-sm border border-amber-300 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer"
      />
    </div>
  )
}
