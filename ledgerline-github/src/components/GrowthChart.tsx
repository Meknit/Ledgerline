import { motion } from 'motion/react'
import { useState } from 'react'
import { compact, money } from '../lib/prices'

// Portfolio value over time, drawn only from recorded snapshots.
export default function GrowthChart({ points }: { points: { at: number; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 800
  const H = 220
  const pad = { l: 56, r: 16, t: 16, b: 28 }

  if (points.length < 2) {
    return (
      <div className="grid h-[220px] place-items-center text-center text-sm text-ink-400">
        Your growth chart builds up as you use the app.<br />A new point is recorded every 10 minutes while you’re signed in.
      </div>
    )
  }

  const vals = points.map((p) => p.value)
  const min = Math.min(...vals) * 0.995
  const max = Math.max(...vals) * 1.005
  const t0 = points[0].at
  const t1 = points[points.length - 1].at
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(t1)},${H - pad.b} L${x(t0)},${H - pad.b} Z`
  const ticks = [min, (min + max) / 2, max]
  const hp = hover != null ? points[hover] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          let best = 0
          points.forEach((p, i) => { if (Math.abs(x(p.at) - px) < Math.abs(x(points[best].at) - px)) best = i })
          setHover(best)
        }}
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d4a943" stopOpacity="0.35" />
            <stop offset="1" stopColor="#d4a943" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(255 255 255 / 0.06)" strokeDasharray="4 4" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8a8a99">{compact(t)}</text>
          </g>
        ))}
        <motion.path d={area} fill="url(#area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
        <motion.path d={line} fill="none" stroke="#eac46a" strokeWidth="2.5" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
        {hp && (
          <g>
            <line x1={x(hp.at)} x2={x(hp.at)} y1={pad.t} y2={H - pad.b} stroke="rgb(255 255 255 / 0.15)" />
            <circle cx={x(hp.at)} cy={y(hp.value)} r="5" fill="#eac46a" stroke="#0d0d12" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/10 bg-ink-900/90 px-3 py-1.5 text-xs">
          <div className="font-medium tabular-nums">{money(hp.value)}</div>
          <div className="text-ink-400">{new Date(hp.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
      )}
    </div>
  )
}
