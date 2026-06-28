'use client'

import { useState, useCallback, useEffect } from 'react'

const MAX_DAYS = 90

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function offsetDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d
}

interface DayPickerProps {
  onChange: (date: string) => void  // YYYY-MM-DD
}

export default function DayPicker({ onChange }: DayPickerProps) {
  // 0 = today, MAX_DAYS = 90 days ago; slider value = daysAgo
  const [daysAgo, setDaysAgo] = useState(1)

  const selectedDate = toDateString(offsetDate(daysAgo))

  const minDate = toDateString(offsetDate(MAX_DAYS))
  const maxDate = toDateString(offsetDate(1))  // yesterday (today has no full day yet)

  useEffect(() => {
    onChange(selectedDate)
  }, [selectedDate, onChange])

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
        Tagesmax
      </span>

      {/* Slider: left = 90 days ago, right = yesterday */}
      <input
        type="range"
        min={1}
        max={MAX_DAYS}
        step={1}
        value={daysAgo}
        onChange={handleSlider}
        className="flex-1 accent-amber-600 cursor-pointer"
        style={{ direction: 'rtl' }}  // left = oldest, right = most recent
      />

      {/* Date input for precise selection */}
      <input
        type="date"
        min={minDate}
        max={maxDate}
        value={selectedDate}
        onChange={handleDateInput}
        className="flex-shrink-0 text-sm border border-amber-300 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer"
      />

      <div className="flex-shrink-0 text-xs text-amber-700">
        {new Date(selectedDate).toLocaleDateString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
        })}
      </div>
    </div>
  )
}
