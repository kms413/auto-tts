import { useMemo } from 'react'

interface Props {
  /** How many bars to draw. */
  barCount?: number
  /** Fraction of the strip that is filled, between 0 and 1. */
  progress?: number
  /** Marks a strip as live work, which switches its bars to the signal colour. */
  active?: boolean
  variant?: 'hero' | 'strip'
  /** Seed for the deterministic envelope, so each strip keeps its own shape. */
  seed?: number
}

/**
 * Build a deterministic waveform envelope: bars fade towards the edges and
 * jitter in between, which reads as audio rather than as random noise.
 */
function buildHeights(count: number, seed: number): number[] {
  let state = (seed >>> 0) || 1
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
  return Array.from({ length: count }, (_, index) => {
    const distanceFromCentre = Math.abs(index / (count - 1) - 0.5) * 2
    const envelope = 0.42 + (1 - distanceFromCentre) * 0.58
    return Math.min(1, Math.max(0.16, envelope * (0.5 + random() * 0.55)))
  })
}

export default function Waveform({
  barCount = 48,
  progress = 0,
  active = false,
  variant = 'hero',
  seed = 7,
}: Props) {
  const bars = useMemo(() => buildHeights(barCount, seed), [barCount, seed])
  const className = `wave wave--${variant}${active ? ' is-active' : ''}`

  return (
    <div className={className} aria-hidden="true">
      {bars.map((height, index) => (
        <span
          key={index}
          className={index / barCount < progress ? 'wave__bar is-lit' : 'wave__bar'}
          style={{ height: `${Math.round(height * 100)}%`, animationDelay: `${index * 18}ms` }}
        />
      ))}
    </div>
  )
}