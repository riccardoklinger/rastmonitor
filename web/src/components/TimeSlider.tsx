'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const WINDOW_HOURS = 72
const STEP_MINUTES = 15   // matches data ingestion frequency
const TOTAL_STEPS = (WINDOW_HOURS * 60) / STEP_MINUTES  // 288

interface TimeSliderProps {
  /** Called with null for live mode, or a Date for a historical snapshot */
  onChange: (time: Date | null) => void
}

export default function TimeSlider({ onChange }: TimeSliderProps) {
  // step 0 = 72h ago, TOTAL_STEPS = now (live)
  const [step, setStep] = useState<number>(TOTAL_STEPS)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stepToDate = useCallback((s: number): Date | null => {
    if (s >= TOTAL_STEPS) return null   // live
    const msAgo = (TOTAL_STEPS - s) * STEP_MINUTES * 60 * 1000
    return new Date(Date.now() - msAgo)
  }, [])

  // Notify parent whenever step changes
  useEffect(() => {
    onChange(stepToDate(step))
  }, [step, stepToDate, onChange])

  // Playback: advance one step per 400 ms
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setStep((prev) => {
          if (prev >= TOTAL_STEPS) {
            setPlaying(false)
            return TOTAL_STEPS
          }
          return prev + 1
        })
      }, 400)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  const isLive = step >= TOTAL_STEPS
  const displayDate = stepToDate(step)

  const formatDate = (d: Date) =>
    d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-white/90 backdrop-blur px-4 py-3 shadow-lg border-t border-gray-200">

      {/* Play / Pause */}
      <button
        onClick={() => {
          if (isLive) setStep(0)   // start from beginning if at live end
          setPlaying((p) => !p)
        }}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
        title={playing ? 'Pause' : 'Wiedergabe'}
      >
        {playing ? (
          // pause icon
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <rect x="4" y="3" width="4" height="14" rx="1" />
            <rect x="12" y="3" width="4" height="14" rx="1" />
          </svg>
        ) : (
          // play icon
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
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
        onChange={(e) => {
          setPlaying(false)
          setStep(Number(e.target.value))
        }}
        className="flex-1 accent-blue-600 cursor-pointer"
      />

      {/* Time label */}
      <div className="flex-shrink-0 text-sm font-medium min-w-[11rem] text-right">
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        ) : (
          <span className="text-gray-700">{displayDate ? formatDate(displayDate) : ''}</span>
        )}
      </div>

      {/* Jump-to-live button (only shown when not live) */}
      {!isLive && (
        <button
          onClick={() => { setPlaying(false); setStep(TOTAL_STEPS) }}
          className="flex-shrink-0 text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition"
        >
          Live
        </button>
      )}
    </div>
  )
}
