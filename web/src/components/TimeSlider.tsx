'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const WINDOW_HOURS = 72
const STEP_MINUTES = 15
const TOTAL_STEPS  = (WINDOW_HOURS * 60) / STEP_MINUTES  // 288

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface TimeSliderProps {
  onChange: (time: Date | null) => void
}

export default function TimeSlider({ onChange }: TimeSliderProps) {
  const [step, setStep]       = useState<number>(TOTAL_STEPS)
  const [playing, setPlaying] = useState(false)
  const intervalRef           = useRef<ReturnType<typeof setInterval> | null>(null)

  const now72ago = () => new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000)

  const stepToDate = useCallback((s: number): Date | null => {
    if (s >= TOTAL_STEPS) return null
    const msAgo = (TOTAL_STEPS - s) * STEP_MINUTES * 60 * 1000
    return new Date(Date.now() - msAgo)
  }, [])

  useEffect(() => {
    onChange(stepToDate(step))
  }, [step, stepToDate, onChange])

  // Playback: advance one step per 400 ms
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setStep(prev => {
          if (prev >= TOTAL_STEPS) { setPlaying(false); return TOTAL_STEPS }
          return prev + 1
        })
      }, 400)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  const isLive      = step >= TOTAL_STEPS
  const displayDate = stepToDate(step)

  const handleDatetimeInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false)
    const picked = new Date(e.target.value)
    if (isNaN(picked.getTime())) return
    const clamped = new Date(
      Math.max(now72ago().getTime(), Math.min(Date.now(), picked.getTime()))
    )
    const msAgo   = Date.now() - clamped.getTime()
    const newStep = Math.round(TOTAL_STEPS - msAgo / (STEP_MINUTES * 60 * 1000))
    setStep(Math.max(0, Math.min(TOTAL_STEPS, newStep)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const minDt = toDatetimeLocal(now72ago())
  const maxDt = toDatetimeLocal(new Date())

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-white/95 backdrop-blur px-4 py-3 shadow-lg border-t border-gray-200">

      <span className="flex-shrink-0 text-xs font-semibold text-blue-700 uppercase tracking-wide w-8">
        72h
      </span>

      {/* Play / Pause */}
      <button
        onClick={() => { if (isLive) setStep(0); setPlaying(p => !p) }}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
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

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={TOTAL_STEPS}
        step={1}
        value={step}
        onChange={e => { setPlaying(false); setStep(Number(e.target.value)) }}
        className="flex-1 accent-blue-600 cursor-pointer"
      />

      {/* Datetime picker — syncs bidirectionally with slider */}
      <input
        type="datetime-local"
        min={minDt}
        max={maxDt}
        value={isLive ? maxDt : (displayDate ? toDatetimeLocal(displayDate) : maxDt)}
        onChange={handleDatetimeInput}
        className="flex-shrink-0 text-sm border border-blue-200 rounded px-2 py-1 bg-white text-gray-700 cursor-pointer"
      />

      {/* Live indicator / jump button */}
      {isLive ? (
        <span className="flex-shrink-0 inline-flex items-center gap-1 text-sm text-green-600 font-medium min-w-[3.5rem]">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      ) : (
        <button
          onClick={() => { setPlaying(false); setStep(TOTAL_STEPS) }}
          className="flex-shrink-0 text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition min-w-[3.5rem] text-center"
        >
          Live
        </button>
      )}
    </div>
  )
}
