import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check, ChevronDown, Clock, ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Coin } from '../lib/prices'
import { money } from '../lib/prices'
import type { Account, DepositMethod, Withdrawal } from '../lib/portfolio'
import { explorerUrl, useDepositMethods } from '../lib/portfolio'
import { MethodIcon, Modal } from './ui'
import { WALLET_HINT, methodLabel } from './DepositModal'

const fmt = (n: number) => String(+n.toFixed(8))

export default function WithdrawModal({ open, onClose, account, coins }: { open: boolean; onClose: () => void; account: Account; coins: Coin[] | null }) {
  const { data, error } = useDepositMethods(open)
  const [methodId, setMethodId] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [address, setAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setMethodId(null)
    setPicker(false)
    setAddress('')
    setAmount('')
    setStep('form')
    setErr(null)
  }, [open])

  const methods = useMemo(() => data?.methods.filter((m) => !m.unavailable) ?? [], [data])
  const m = methods.find((x) => x.id === methodId) ?? null
  const coin = (id: string) => coins?.find((c) => c.id === id)
  const available = m ? account.withdrawable[m.coinId] ?? 0 : 0
  const amt = Number(amount)
  const receive = m && amt > 0 ? Math.max(0, amt - m.fee) : 0
  const price = m ? coin(m.coinId)?.current_price ?? 0 : 0

  const problem = !m
    ? 'Choose an asset and network.'
    : !address.trim()
      ? 'Enter the destination address.'
      : !(amt > 0)
        ? 'Enter an amount.'
        : amt < m.minWithdrawal
          ? `Minimum withdrawal is ${fmt(m.minWithdrawal)} ${m.symbol}.`
          : amt > available + 1e-12
            ? available > 0 ? `You can withdraw up to ${fmt(available)} ${m.symbol}.` : `No deposited ${m.symbol} to withdraw.`
            : null

  const submit = async () => {
    if (!m) return
    setBusy(true)
    setErr(null)
    try {
      await account.withdraw(m.id, address.trim(), amt)
      setStep('done')
    } catch (e) {
      setErr((e as Error).message)
      setStep('form')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none focus:border-gold-500/60 focus:ring-4 focus:ring-gold-500/10'

  return (
    <Modal open={open} onClose={onClose} title="Withdraw crypto">
      <div className="max-h-[72dvh] overflow-y-auto pr-1 no-scrollbar">
        {error && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}
        {!data && !error && <div className="grid h-40 place-items-center text-ink-400"><Loader2 className="animate-spin" /></div>}

        {data && step === 'done' && m && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-up/15 text-up"><Check size={30} /></div>
            <h3 className="mt-4 font-display text-xl font-semibold">Withdrawal requested</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              {fmt(receive)} {m.symbol} to <span className="font-mono text-xs">{address.slice(0, 8)}…{address.slice(-6)}</span> on {m.network}.
              The amount is on hold and you’ll see the transaction ID here once it’s sent. You can cancel while it’s pending.
            </p>
            <button onClick={onClose} className="btn-gold mt-6 w-full py-3">Done</button>
          </motion.div>
        )}

        {data && step !== 'done' && (
          <>
            {data.testnet && (
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-gold-500/10 px-3 py-2.5 text-xs leading-relaxed text-gold-300">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>Test networks. Only coins you deposited on-chain can be withdrawn. Demo trading balance can’t be.</span>
              </div>
            )}

            <label className="text-sm font-medium">Asset &amp; network</label>
            <div className="relative mt-2">
              <button onClick={() => setPicker((v) => !v)} className={`${field} flex items-center gap-3 text-left`}>
                {m ? (
                  <>
                    <MethodIcon image={coin(m.coinId)?.image} symbol={m.symbol} badge={m.badge} size={26} />
                    <span className="flex-1"><span className="font-medium">{methodLabel(m)}</span> <span className="text-xs text-ink-400">· {m.network}</span></span>
                  </>
                ) : (
                  <span className="flex-1 text-ink-400">Choose a wallet…</span>
                )}
                <ChevronDown size={16} className={`text-ink-400 transition ${picker ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {picker && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-ink-850 p-1 shadow-2xl"
                  >
                    {methods.map((x) => {
                      const bal = account.withdrawable[x.coinId] ?? 0
                      return (
                        <button
                          key={x.id}
                          onClick={() => { setMethodId(x.id); setPicker(false); setErr(null) }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5 ${x.id === methodId ? 'bg-gold-500/10' : ''}`}
                        >
                          <MethodIcon image={coin(x.coinId)?.image} symbol={x.symbol} badge={x.badge} size={26} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{methodLabel(x)}</span>
                            <span className="block text-xs text-ink-400">{x.network}</span>
                          </span>
                          <span className={`text-right text-xs tabular-nums ${bal > 0 ? 'text-white' : 'text-ink-400'}`}>{fmt(bal)} {x.symbol}</span>
                        </button>
                      )
                    })}
                    {!methods.length && <p className="px-3 py-4 text-sm text-ink-400">No networks are set up yet.</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <label className="mt-5 block text-sm font-medium">Destination address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={m ? `Your ${m.network} address (${WALLET_HINT[m.family].placeholder})` : 'Enter the wallet address to receive funds'}
              className={`${field} mt-2 font-mono`}
              spellCheck={false}
            />
            {m && account.user?.wallets[m.family] && address.trim() !== account.user.wallets[m.family] && (
              <button onClick={() => setAddress(account.user!.wallets[m.family]!)} className="mt-1.5 text-xs text-gold-300 hover:text-gold-400">Use my registered wallet</button>
            )}

            <div className="mt-5 flex items-end justify-between">
              <label className="text-sm font-medium">Amount{m ? ` (${m.symbol})` : ''}</label>
              {m && <span className="text-xs text-ink-400">Available: <span className="tabular-nums text-white">{fmt(available)}</span> {m.symbol}</span>}
            </div>
            <div className="relative mt-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00" className={`${field} pr-20 tabular-nums`} />
              <button onClick={() => setAmount(fmt(available))} disabled={!m || !available} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gold-500/30 px-2.5 py-1 text-[11px] font-semibold text-gold-300 hover:bg-gold-500/10 disabled:opacity-40">MAX</button>
            </div>
            {m && amt > 0 && price > 0 && <p className="mt-1.5 text-xs text-ink-400">≈ {money(amt * price)}</p>}

            {m && (
              <dl className="mt-5 space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm">
                <div className="flex justify-between"><dt className="text-ink-400">Network fee</dt><dd className="tabular-nums">{fmt(m.fee)} {m.symbol}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-400">Minimum</dt><dd className="tabular-nums">{fmt(m.minWithdrawal)} {m.symbol}</dd></div>
                <div className="flex justify-between border-t border-white/5 pt-2 font-semibold"><dt>You’ll receive</dt><dd className="tabular-nums text-gold-300">{fmt(receive)} {m.symbol}</dd></div>
              </dl>
            )}

            {err && <p className="mt-4 rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}

            {step === 'form' ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={onClose} className="btn-ghost py-3">Cancel</button>
                <motion.button whileTap={{ scale: 0.98 }} onClick={() => (problem ? setErr(problem) : (setErr(null), setStep('confirm')))} className="btn-gold py-3">Withdraw</motion.button>
              </div>
            ) : (
              m && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl border border-gold-500/30 bg-gold-500/[0.06] p-4">
                  <p className="text-sm font-semibold">Confirm withdrawal</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-300">
                    Send <b className="text-white">{fmt(receive)} {m.symbol}</b> on <b className="text-white">{m.network}</b> to
                    <span className="mt-1 block break-all font-mono text-[11px] text-white">{address.trim()}</span>
                  </p>
                  <p className="mt-2 text-xs text-down">Blockchain transfers can’t be reversed. Check the address and network.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button onClick={() => setStep('form')} disabled={busy} className="btn-ghost py-2.5 text-sm">Back</button>
                    <button onClick={submit} disabled={busy} className="btn-gold flex items-center justify-center gap-2 py-2.5 text-sm">
                      {busy && <Loader2 size={16} className="animate-spin" />} Confirm
                    </button>
                  </div>
                </motion.div>
              )
            )}

            <div className="mt-6 rounded-xl border border-white/5 p-4 text-xs leading-relaxed text-ink-400">
              <p className="mb-1.5 font-semibold text-ink-300">Good to know</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>The only fee is the network fee above, taken from the amount you send. There’s never an upfront “release” or “tax” payment.</li>
                <li>Each withdrawal is reviewed and then sent on-chain. You’ll get the transaction ID to track it.</li>
                <li>You can cancel a withdrawal while it’s still pending.</li>
              </ul>
            </div>

            {account.withdrawals.length > 0 && <RecentWithdrawals list={account.withdrawals} methods={data.methods} onCancel={account.cancelWithdrawal} />}
          </>
        )}
      </div>
    </Modal>
  )
}

const STATUS_STYLE: Record<Withdrawal['status'], string> = {
  pending: 'border-gold-500/30 bg-gold-500/10 text-gold-300',
  completed: 'border-up/30 bg-up/10 text-up',
  cancelled: 'border-white/10 bg-white/5 text-ink-400',
  rejected: 'border-down/30 bg-down/10 text-down',
}

function RecentWithdrawals({ list, methods, onCancel }: { list: Withdrawal[]; methods: DepositMethod[]; onCancel: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-semibold">Recent withdrawals</p>
      <div className="space-y-2">
        {list.slice(0, 5).map((w) => {
          const m = methods.find((x) => x.id === w.method)
          return (
            <div key={w.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-xs">
              <Clock size={14} className="shrink-0 text-ink-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums text-white">{fmt(w.amount - w.fee)} {m?.symbol}{m?.badge ? ` · ${m.badge}` : ''}</p>
                <p className="truncate text-ink-400">{new Date(w.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              {w.txHash && m && (
                <a href={explorerUrl(m.explorer, w.txHash)} target="_blank" rel="noreferrer" className="text-ink-400 hover:text-white" aria-label="View on explorer"><ExternalLink size={14} /></a>
              )}
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[w.status]}`}>{w.status}</span>
              {w.status === 'pending' && (
                <button
                  onClick={async () => { setBusy(w.id); try { await onCancel(w.id) } finally { setBusy(null) } }}
                  disabled={busy === w.id}
                  className="rounded-md p-1 text-ink-400 hover:bg-white/5 hover:text-down"
                  aria-label="Cancel withdrawal"
                >
                  {busy === w.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
