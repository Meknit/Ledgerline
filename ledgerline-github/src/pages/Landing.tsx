import { motion } from 'motion/react'
import { ArrowRight, BarChart3, LineChart, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { BRAND } from '../config'
import type { Coin } from '../lib/prices'
import { compact, smartPrice } from '../lib/prices'
import { Change, LiveTicker, Logo, RiskNote, Sparkline } from '../components/ui'

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }),
}

const features = [
  { icon: LineChart, title: 'Live markets', body: 'Prices, 24h moves and 7-day trends for the top assets, refreshed every minute.' },
  { icon: Wallet, title: ' trading', body: `Start with ${BRAND.currencySymbol}${BRAND.StartingCash.toLocaleString()} of practice money and trade at real prices, risk-free.` },
  { icon: BarChart3, title: 'Honest analytics', body: 'Every number is computed from your own trades. No promised returns, ever.' },
  { icon: ShieldCheck, title: 'Built for compliance', body: 'Designed to add KYC, custody and regulated payments once licensing is in place.' },
]

export default function Landing({ coins, onRegister, onLogin }: { coins: Coin[] | null; onRegister: () => void; onLogin: () => void }) {
  const onStart = onRegister
  const btc = coins?.find((c) => c.id === 'bitcoin')
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 h-[900px]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gold-500/15 blur-[120px]" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight">{BRAND.name}</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-ink-300 md:flex">
          <a href="#markets" className="hover:text-white">Markets</a>
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#about" className="hover:text-white">About</a>
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={onLogin} className="btn-ghost px-4 py-2 text-sm">Log in</button>
          <button onClick={onStart} className="btn-gold hidden px-4 py-2 text-sm sm:block">Create account</button>
        </div>
      </header>

      <LiveTicker coins={coins} />

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-16 sm:px-8 lg:grid-cols-2 lg:pt-24">
        <div>
          <motion.span variants={fadeUp} initial="hidden" animate="show" className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs text-gold-300">
            <Sparkles size={14} /> Live prices · Trading · zero risk
          </motion.span>
          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1} className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Trade crypto with <span className="text-gold-gradient">confidence</span> and clarity.
          </motion.h1>
          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2} className="mt-6 max-w-xl text-lg text-ink-300">
            {BRAND.tagline} Build your strategy on real market data before a single pound is on the line.
          </motion.p>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className="mt-9 flex flex-wrap gap-3">
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={onStart} className="btn-gold inline-flex items-center gap-2 px-6 py-3.5">
              Get started <ArrowRight size={18} />
            </motion.button>
            <a href="#features" className="btn-ghost px-6 py-3.5 font-medium">Learn more</a>
          </motion.div>
        </div>

        {/* Product preview built from live data */}
        <motion.div initial={{ opacity: 0, y: 40, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-8 rounded-[3rem] bg-gold-500/10 blur-3xl" />
          <div className="relative rounded-[2.5rem] border border-white/10 bg-ink-900 p-3 shadow-2xl">
            <div className="rounded-[2rem] bg-ink-850 p-5">
              <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-white/10" />
              <p className="text-xs text-ink-400">Bitcoin · live</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums">{btc ? smartPrice(btc.current_price) : '—'}</p>
              {btc && <Change value={btc.price_change_percentage_24h} className="text-sm" />}
              <div className="mt-4"><Sparkline data={btc?.sparkline_in_7d?.price} width={280} height={80} /></div>
              <div className="mt-4 space-y-2">
                {coins?.slice(1, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5">
                    <img src={c.image} alt="" width={24} height={24} className="rounded-full" />
                    <span className="flex-1 text-sm font-medium">{c.symbol.toUpperCase()}</span>
                    <span className="text-sm tabular-nums text-ink-300">{smartPrice(c.current_price)}</span>
                    <Change value={c.price_change_percentage_24h} className="w-16 text-right text-xs" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section id="markets" className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-8">
        <h2 className="font-display text-3xl font-bold">Today’s markets</h2>
        <p className="mt-2 text-ink-400">Data from CoinGecko, refreshed every minute.</p>
        <div className="card mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-400">
              <tr><th className="p-4">Asset</th><th className="p-4 text-right">Price</th><th className="p-4 text-right">24h</th><th className="p-4 text-right">Market cap</th><th className="p-4 text-right">7d</th></tr>
            </thead>
            <tbody>
              {coins?.map((c) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-4"><div className="flex items-center gap-3"><img src={c.image} alt="" width={28} height={28} className="rounded-full" /><span className="font-medium">{c.name}</span><span className="text-ink-400">{c.symbol.toUpperCase()}</span></div></td>
                  <td className="p-4 text-right tabular-nums">{smartPrice(c.current_price)}</td>
                  <td className="p-4 text-right"><Change value={c.price_change_percentage_24h} /></td>
                  <td className="p-4 text-right tabular-nums text-ink-300">{compact(c.market_cap)}</td>
                  <td className="p-4"><div className="flex justify-end"><Sparkline data={c.sparkline_in_7d?.price} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div key={f.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} custom={i} whileHover={{ y: -4 }} className="card p-6">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gold-500/10 text-gold-400"><f.icon size={20} /></div>
              <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer id="about" className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
          <div className="flex items-center gap-2.5"><Logo size={22} /><span className="font-display font-semibold">{BRAND.name}</span></div>
          <RiskNote className="mt-4 max-w-3xl" />
          <p className="mt-4 text-xs text-ink-400">Market data provided by CoinGecko. © {new Date().getFullYear()} {BRAND.name}.</p>
        </div>
      </footer>
    </div>
  )
}
