import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, ArrowUpDown, Bell, History as HistoryIcon, Home, LineChart, LogOut, RotateCcw, Search, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BRAND } from '../config'
import type { Coin } from '../lib/prices'
import { compact, money, smartPrice } from '../lib/prices'
import type { Account, Portfolio, Tx, TxStatus, User } from '../lib/portfolio'
import { FEE_RATE, explorerUrl, holdingsValue } from '../lib/portfolio'
import { Change, CoinIcon, LiveTicker, Logo, RiskNote, Sparkline } from '../components/ui'
import TradeModal from '../components/TradeModal'
import GrowthChart from '../components/GrowthChart'
import DepositModal from '../components/DepositModal'
import WithdrawModal from '../components/WithdrawModal'

type Tab = 'home' | 'markets' | 'history' | 'assets'

type Props = {
  p: Portfolio
  user: User
  account: Account
  coins: Coin[] | null
  priceError: string | null
  updatedAt: number | null
}

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'markets', label: 'Markets', icon: LineChart },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'assets', label: 'Assets', icon: Wallet },
]

export default function Dashboard(props: Props) {
  const { p, user, account, coins } = props
  const [tab, setTab] = useState<Tab>('home')
  const [tradeOpen, setTradeOpen] = useState(false)
  const [tradeCoin, setTradeCoin] = useState<string | undefined>()
  const [fundsOpen, setFundsOpen] = useState<null | 'deposit' | 'withdraw'>(null)

  const invested = holdingsValue(p, coins)
  const total = p.cash + invested
  const pnl = total - BRAND.StartingCash
  const pnlPct = (pnl / BRAND.StartingCash) * 100

  const openTrade = (id?: string) => {
    setTradeCoin(id)
    setTradeOpen(true)
  }

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-display text-lg font-bold text-ink-950">
              {user.name[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-ink-400">Welcome back</p>
              <p className="font-semibold">{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-gold-300 sm:inline">Live account</span>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-ink-300 hover:text-white" aria-label="Notifications"><Bell size={18} /></button>
            <button onClick={account.logout}className="grid h-10 w-10 place-items-center rounded-xl border border-down/30 text-down hover:bg-down/10" aria-label="Sign out"><LogOut size={18} /></button>
          </div>
        </div>
        <LiveTicker coins={coins} />
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {props.priceError && (
          <p className="mb-4 rounded-xl border border-down/20 bg-down/10 px-4 py-2.5 text-sm text-down">
            Live prices are temporarily unavailable ({props.priceError}). Showing last known prices.
          </p>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            {tab === 'home' && (
              <HomeTab {...{ p, coins, total, pnl, pnlPct, invested }} onTrade={openTrade} onFunds={setFundsOpen} onTab={setTab} reset={account.reset} updatedAt={props.updatedAt} />
            )}
            {tab === 'markets' && <MarketsTab coins={coins} onTrade={openTrade} />}
            {tab === 'history' && <HistoryTab txs={p.txs} />}
            {tab === 'assets' && <AssetsTab p={p} coins={coins} total={total} onTrade={openTrade} withdrawable={account.withdrawable} />}
          </motion.div>
        </AnimatePresence>
        <RiskNote className="mx-auto mt-12 max-w-2xl text-center" />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto grid max-w-3xl grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`relative flex flex-col items-center gap-1 py-3 text-xs transition ${tab === t.id ? 'text-gold-300' : 'text-ink-400 hover:text-white'}`}>
              {tab === t.id && <motion.span layoutId="navpill" className="absolute inset-x-5 inset-y-1.5 -z-10 rounded-2xl bg-gold-500/10 ring-1 ring-gold-500/25" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <t.icon size={20} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {coins && <TradeModal open={tradeOpen} onClose={() => setTradeOpen(false)} coins={coins} p={p} feeRate={FEE_RATE} initialCoin={tradeCoin} trade={account.trade} />}

      <DepositModal open={fundsOpen === 'deposit'} onClose={() => setFundsOpen(null)} account={account} coins={coins} />
      <WithdrawModal open={fundsOpen === 'withdraw'} onClose={() => setFundsOpen(null)} account={account} coins={coins} />
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Home; label: string; onClick: () => void }) {
  return (
    <motion.button whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} onClick={onClick} className="group flex flex-col items-center gap-2">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-gold-500/25 bg-gradient-to-b from-gold-500/20 to-gold-500/5 text-gold-300 shadow-[0_10px_30px_-12px_rgb(212_169_67/0.6)] transition group-hover:border-gold-400/60">
        <Icon size={22} />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </motion.button>
  )
}

function HomeTab({ p, coins, total, pnl, pnlPct, invested, onTrade, onFunds, onTab, reset, updatedAt }: {
  p: Portfolio; coins: Coin[] | null; total: number; pnl: number; pnlPct: number; invested: number
  onTrade: (id?: string) => void; onFunds: (k: 'deposit' | 'withdraw') => void; onTab: (t: Tab) => void; reset: () => void; updatedAt: number | null
}) {
  const movers = useMemo(() => (coins ? [...coins].sort((a, b) => Math.abs(b.price_change_percentage_24h ?? 0) - Math.abs(a.price_change_percentage_24h ?? 0)).slice(0, 4) : []), [coins])
  return (
    <div className="space-y-6">
      <section className="card-gold relative overflow-hidden px-6 py-10 text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-gold-400/70 to-transparent" />
        <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Total balance</p>
        <div className="mt-3 flex items-start justify-center gap-2">
          <motion.h1 key={Math.round(total)} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-display text-5xl font-bold tabular-nums sm:text-6xl">{money(total)}</motion.h1>
          <span className="mt-2 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-ink-300">GBP</span>
        </div>
        <p className={`mt-3 text-sm font-medium tabular-nums ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
          {pnl >= 0 ? '+' : ''}{money(pnl)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%) <span className="text-ink-400">all time</span>
        </p>
        <div className="mx-auto mt-9 grid max-w-md grid-cols-4 gap-2">
          <ActionButton icon={ArrowUp} label="Deposit" onClick={() => onFunds('deposit')} />
          <ActionButton icon={ArrowDown} label="Withdraw" onClick={() => onFunds('withdraw')} />
          <ActionButton icon={ArrowUpDown} label="Swap" onClick={() => onTrade()} />
          <ActionButton icon={LineChart} label="Markets" onClick={() => onTab('markets')} />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Cash available" value={money(p.cash)} />
        <Stat label="Invested" value={money(invested)} sub={`${Object.keys(p.holdings).length} active holding${Object.keys(p.holdings).length === 1 ? '' : 's'}`} />
        <Stat label="Profit / loss" value={`${pnl >= 0 ? '+' : ''}${money(pnl)}`} tone={pnl >= 0 ? 'up' : 'down'} sub="Based on live prices" />
      </div>

      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-300">Portfolio growth</h2>
          <button onClick={() => { if (confirm('Reset your Live account to the starting balance?')) reset() }} className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-white">
            <RotateCcw size={13} /> Reset Live
          </button>
        </div>
        <GrowthChart points={p.snapshots} />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Top movers (24h)</h2>
          {updatedAt && <span className="text-xs text-ink-400">Updated {new Date(updatedAt).toLocaleTimeString('en-GB', { timeStyle: 'short' })}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {movers.map((c, i) => (
            <motion.button key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }} onClick={() => onTrade(c.id)} className="card p-4 text-left">
              <div className="flex items-center gap-3">
                <img src={c.image} alt="" width={28} height={28} className="rounded-full" />
                <div className="flex-1"><p className="font-medium">{c.symbol.toUpperCase()}</p><p className="text-xs text-ink-400">{c.name}</p></div>
                <Change value={c.price_change_percentage_24h} className="text-sm font-medium" />
              </div>
              <p className="mt-3 font-display text-lg font-semibold tabular-nums">{smartPrice(c.current_price)}</p>
              <Sparkline data={c.sparkline_in_7d?.price} width={200} height={36} />
            </motion.button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wider text-ink-400">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gold-400/90">{sub}</p>}
    </div>
  )
}

function MarketsTab({ coins, onTrade }: { coins: Coin[] | null; onTrade: (id: string) => void }) {
  const [q, setQ] = useState('')
  const list = coins?.filter((c) => (c.name + c.symbol).toLowerCase().includes(q.toLowerCase())) ?? []
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Markets</h1>
        <label className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets" className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gold-500/60" />
        </label>
      </div>
      <div className="space-y-3">
        {list.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card flex items-center gap-4 p-4">
            <CoinIcon coin={c} size={32} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-ink-400">{c.symbol.toUpperCase()} · Vol {compact(c.total_volume)}</p>
            </div>
            <div className="hidden sm:block"><Sparkline data={c.sparkline_in_7d?.price} /></div>
            <div className="text-right">
              <p className="font-semibold tabular-nums text-gold-300">{smartPrice(c.current_price)}</p>
              <Change value={c.price_change_percentage_24h} className="text-xs" />
            </div>
            <button onClick={() => onTrade(c.id)} className="btn-ghost px-3 py-2 text-sm hover:border-gold-500/50">Trade</button>
          </motion.div>
        ))}
        {!coins && <p className="text-ink-400">Loading live prices…</p>}
      </div>
    </div>
  )
}

const STATUS_BADGE: Record<TxStatus, string> = {
  completed: 'border-up/30 bg-up/10 text-up',
  pending: 'border-gold-500/30 bg-gold-500/10 text-gold-300',
  cancelled: 'border-white/10 bg-white/5 text-ink-400',
  rejected: 'border-down/30 bg-down/10 text-down',
}

function HistoryTab({ txs }: { txs: Tx[] }) {
  const buys = txs.filter((t) => t.type === 'buy').reduce((s, t) => s + t.total, 0)
  const sells = txs.filter((t) => t.type === 'sell').reduce((s, t) => s + t.total, 0)
  return (
    <div>
      <h1 className="mb-5 text-center font-display text-2xl font-bold">Transaction history</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Trades" value={String(txs.filter((t) => t.type === 'buy' || t.type === 'sell').length)} />
        <Stat label="Bought" value={money(buys)} />
        <Stat label="Sold" value={money(sells)} />
        <Stat label="Volume" value={money(buys + sells)} />
      </div>
      <div className="card mt-6 p-4 sm:p-5">
        <h2 className="mb-4 font-semibold">Recent activity</h2>
        <div className="space-y-2.5">
          {txs.map((t) => {
            const status = t.status ?? 'completed'
            const onChain = t.type === 'deposit' || t.type === 'withdraw'
            return (
              <div key={t.id} className={`flex items-center gap-4 rounded-2xl border px-4 py-3.5 ${t.type === 'buy' || t.type === 'deposit' ? 'border-up/15 bg-up/[0.04]' : t.type === 'sell' || t.type === 'withdraw' ? 'border-down/15 bg-down/[0.04]' : 'border-gold-500/15 bg-gold-500/[0.04]'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    {t.type === 'reset' ? 'Live account opened' : `${t.type} ${t.symbol?.toUpperCase()}`}
                    {t.network && <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-ink-400">{t.network}</span>}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {new Date(t.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {t.txHash && (
                      <> · {t.explorer ? (
                        <a href={explorerUrl(t.explorer, t.txHash)} target="_blank" rel="noreferrer" className="font-mono hover:text-white">{t.txHash.slice(0, 8)}…{t.txHash.slice(-4)}</a>
                      ) : <span className="font-mono">{t.txHash.slice(0, 8)}…{t.txHash.slice(-4)}</span>}</>
                    )}
                    {!t.txHash && t.address && <> · to <span className="font-mono">{t.address.slice(0, 8)}…{t.address.slice(-4)}</span></>}
                  </p>
                </div>
                {t.qty != null && t.price != null && <p className="hidden text-right text-xs text-ink-400 sm:block">{t.qty.toFixed(6)} @ {smartPrice(t.price)}</p>}
                <p className={`font-semibold tabular-nums ${t.type === 'sell' || t.type === 'deposit' ? 'text-up' : t.type === 'buy' || t.type === 'withdraw' ? 'text-white' : 'text-gold-300'}`}>
                  {onChain ? `${t.type === 'deposit' ? '+' : '−'}${+(t.qty ?? 0).toFixed(8)} ${t.symbol?.toUpperCase()}` : `${t.type === 'buy' ? '−' : '+'}${money(t.total)}`}
                </p>
                <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE[status]}`}>{status === 'completed' ? 'Done' : status}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AssetsTab({ p, coins, total, onTrade, withdrawable }: { p: Portfolio; coins: Coin[] | null; total: number; onTrade: (id: string) => void; withdrawable: Record<string, number> }) {
  const rows = Object.entries(p.holdings)
    .map(([id, qty]) => ({ coin: coins?.find((c) => c.id === id), qty }))
    .filter((r): r is { coin: Coin; qty: number } => !!r.coin)
    .sort((a, b) => b.qty * b.coin.current_price - a.qty * a.coin.current_price)
  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold">Your assets</h1>
      <div className="card mb-4 flex items-center gap-4 p-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-500/10 font-display font-bold text-gold-300">£</div>
        <div className="flex-1"><p className="font-semibold">Cash</p><p className="text-xs text-ink-400">GBP · Live</p></div>
        <p className="font-semibold tabular-nums">{money(p.cash)}</p>
      </div>
      {rows.length === 0 && (
        <div className="card p-10 text-center text-ink-400">
          No crypto yet. Use <span className="text-gold-300">Swap</span> to make your first  trade.
        </div>
      )}
      <div className="space-y-3">
        {rows.map(({ coin, qty }) => {
          const value = qty * coin.current_price
          const share = total ? (value / total) * 100 : 0
          return (
            <motion.button key={coin.id} whileHover={{ y: -2 }} onClick={() => onTrade(coin.id)} className="card flex w-full items-center gap-4 p-4 text-left">
              <CoinIcon coin={coin} size={32} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{coin.name}</p>
                <p className="text-sm tabular-nums text-ink-300">{qty.toFixed(6)} {coin.symbol.toUpperCase()} <Change value={coin.price_change_percentage_24h} className="text-xs" /></p>
                {withdrawable[coin.id] ? (
                  <p className="text-[11px] tabular-nums text-up">{+withdrawable[coin.id].toFixed(8)} on-chain · withdrawable</p>
                ) : null}
                <div className="mt-2 h-1 w-full max-w-48 overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full bg-gold-400" initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums text-gold-300">{money(value)}</p>
                <p className="text-xs text-ink-400">{share.toFixed(1)}% of portfolio</p>
              </div>
            </motion.button>
          )
        })}
      </div>
      <div className="mt-6 flex justify-center"><Logo size={20} /></div>
    </div>
  )
}
