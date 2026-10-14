import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Coin } from '../lib/prices'
import { money, smartPrice } from '../lib/prices'
import type { Portfolio } from '../lib/portfolio'
import { Modal } from './ui'

type Props = {
  open: boolean
  onClose: () => void
  coins: Coin[]
  p: Portfolio
  feeRate: number
  initialCoin?: string
  trade: (side: 'buy' | 'sell', coinId: string, amount: number) => Promise<void>
}

export default function TradeModal({ open, onClose, coins, p, feeRate, initialCoin, trade }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [coinId, setCoinId] = useState(initialCoin ?? coins[0]?.id)
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (open) {
      setMsg(null)
      setAmount('')
      if (initialCoin) setCoinId(initialCoin)
    }
  }, [open, initialCoin])

  const coin = coins.find((c) => c.id === coinId) ?? coins[0]
  const n = parseFloat(amount)
  const held = p.holdings[coin.id] ?? 0
  const heldValue = held * coin.current_price
  const max = side === 'buy' ? p.cash : heldValue
  const fee = (n || 0) * feeRate
  const receive = side === 'buy' ? ((n || 0) - fee) / coin.current_price : (n || 0) - fee

  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await trade(side, coin.id, n)
      setMsg({ ok: true, text: `${side === 'buy' ? 'Bought' : 'Sold'} ${coin.symbol.toUpperCase()} for ${money(n)} (demo).` })
      setAmount('')
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Trade failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Swap (trade)">
      <div className="relative grid grid-cols-2 rounded-xl bg-white/[0.04] p-1 text-sm font-medium">
        {(['buy', 'sell'] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className="relative z-10 py-2 capitalize">
            {side === s && <motion.span layoutId="side" className={`absolute inset-0 -z-10 rounded-lg ${s === 'buy' ? 'bg-up/15 ring-1 ring-up/40' : 'bg-down/15 ring-1 ring-down/40'}`} />}
            {s}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-xs uppercase tracking-wider text-ink-400" htmlFor="coin">Asset</label>
      <select id="coin" value={coin.id} onChange={(e) => setCoinId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-3 outline-none focus:border-gold-500/60">
        {coins.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.symbol.toUpperCase()}) — {smartPrice(c.current_price)}</option>)}
      </select>

      <div className="mt-5 flex items-baseline justify-between">
        <label className="text-xs uppercase tracking-wider text-ink-400" htmlFor="amt">Amount (GBP)</label>
        <button onClick={() => setAmount(max > 0 ? (Math.floor(max * 100) / 100).toString() : '0')} className="text-xs text-gold-400 hover:text-gold-300">
          Max {money(max)}
        </button>
      </div>
      <input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xl tabular-nums outline-none focus:border-gold-500/60 focus:ring-4 focus:ring-gold-500/10" />

      <dl className="mt-4 space-y-1.5 text-sm text-ink-400">
        <div className="flex justify-between"><dt>Price</dt><dd className="tabular-nums text-ink-300">{smartPrice(coin.current_price)}</dd></div>
        <div className="flex justify-between"><dt>Fee ({(feeRate * 100).toFixed(1)}%)</dt><dd className="tabular-nums text-ink-300">{money(fee)}</dd></div>
        <div className="flex justify-between"><dt>You receive</dt><dd className="tabular-nums text-white">{side === 'buy' ? `${receive > 0 ? receive.toFixed(6) : '0'} ${coin.symbol.toUpperCase()}` : money(Math.max(0, receive))}</dd></div>
      </dl>

      {msg && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>{msg.text}</p>}

      <motion.button whileTap={{ scale: 0.98 }} onClick={submit} disabled={busy || !(n > 0)} className="btn-gold mt-5 w-full py-3.5 capitalize disabled:opacity-40">
        {side} {coin.symbol.toUpperCase()}
      </motion.button>
    </Modal>
  )
}
