import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { Coin } from '../lib/prices'
import { pct, smartPrice } from '../lib/prices'

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6dd9a" />
          <stop offset="1" stopColor="#a9802a" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#121219" stroke="url(#lg)" strokeWidth="1.5" />
      <path d="M9 22 L9 10 M9 22 L23 22 M13 18 L17 13 L20 16 L24 10" fill="none" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Change({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  const up = (value ?? 0) >= 0
  return <span className={`tabular-nums ${up ? 'text-up' : 'text-down'} ${className}`}>{pct(value)}</span>
}

export function Sparkline({ data, width = 96, height = 32 }: { data?: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />
  const step = Math.max(1, Math.floor(data.length / 48))
  const pts = data.filter((_, i) => i % step === 0)
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const span = max - min || 1
  const d = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`)
    .join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={up ? 'var(--color-up)' : 'var(--color-down)'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function CoinIcon({ coin, size = 40 }: { coin: Pick<Coin, 'image' | 'name'>; size?: number }) {
  return (
    <div className="grid shrink-0 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10" style={{ width: size + 8, height: size + 8 }}>
      <img src={coin.image} alt="" width={size} height={size} className="rounded-full" loading="lazy" />
    </div>
  )
}

// Asset logo with a small network chip (e.g. USDT + TRC20), like an exchange's coin picker.
export function MethodIcon({ image, symbol, badge, size = 36 }: { image?: string; symbol: string; badge?: string | null; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {image ? (
        <img src={image} alt="" width={size} height={size} className="rounded-full" loading="lazy" />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-full bg-gold-500/15 text-xs font-bold text-gold-300">{symbol.slice(0, 3)}</div>
      )}
      {badge && (
        <span className="absolute -bottom-1 -right-2 rounded-md border border-ink-900 bg-ink-700 px-1 text-[8px] font-bold uppercase leading-[14px] tracking-wide text-white">
          {badge}
        </span>
      )}
    </div>
  )
}

// Live price ticker: real market moves only, no invented user activity.
export function LiveTicker({ coins }: { coins: Coin[] | null }) {
  if (!coins?.length) return <div className="h-10 border-y border-white/5" />
  const items = [...coins, ...coins]
  return (
    <div className="ticker-wrap overflow-hidden border-y border-white/5 bg-ink-900/60">
      <div className="ticker-track flex w-max gap-8 py-2.5 text-[13px]">
        {items.map((c, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap">
            <img src={c.image} alt="" width={14} height={14} className="rounded-full" />
            <span className="font-medium text-white/90">{c.symbol.toUpperCase()}</span>
            <span className="tabular-nums text-ink-300">{smartPrice(c.current_price)}</span>
            <Change value={c.price_change_percentage_24h} />
          </span>
        ))}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-md rounded-t-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl sm:rounded-3xl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button onClick={onClose} className="rounded-full p-1.5 text-ink-400 hover:bg-white/5 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function RiskNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-ink-400 ${className}`}>
      Cryptoassets are high-risk and prices can fall as well as rise. This app is a trading and market-tracking
      tool: balances are sure.
    </p>
  )
}
