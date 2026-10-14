import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Copy, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Coin } from '../lib/prices'
import type { Account, DepositMethod, Family } from '../lib/portfolio'
import { explorerUrl, useDepositMethods } from '../lib/portfolio'
import { MethodIcon, Modal } from './ui'

export const WALLET_HINT: Record<Family, { label: string; placeholder: string; hash: string }> = {
  evm: { label: 'Ethereum-compatible wallet', placeholder: '0x…', hash: '0x… transaction hash' },
  btc: { label: 'Bitcoin wallet', placeholder: 'bc1… / tb1…', hash: 'Transaction ID (64 characters)' },
  tron: { label: 'Tron wallet', placeholder: 'T…', hash: 'Transaction ID (64 characters)' },
  sol: { label: 'Solana wallet', placeholder: 'Solana address', hash: 'Transaction signature' },
}

export const methodLabel = (m: Pick<DepositMethod, 'name' | 'symbol' | 'badge'>) => (m.badge ? `${m.symbol} (${m.badge})` : m.name)

export default function DepositModal({ open, onClose, account, coins }: { open: boolean; onClose: () => void; account: Account; coins: Coin[] | null }) {
  const { data, error } = useDepositMethods(open)
  const [method, setMethod] = useState<DepositMethod | null>(null)
  useEffect(() => {
    if (!open) setMethod(null)
  }, [open])

  const image = (m: DepositMethod) => coins?.find((c) => c.id === m.coinId)?.image

  return (
    <Modal open={open} onClose={onClose} title={method ? `Deposit ${methodLabel(method)}` : 'Select crypto to deposit'}>
      <AnimatePresence mode="wait" initial={false}>
        {!method ? (
          <motion.div key="pick" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            {error && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}
            {!data && !error && <div className="grid h-40 place-items-center text-ink-400"><Loader2 className="animate-spin" /></div>}
            {data && (
              <>
                <p className="mb-3 text-sm text-ink-400">Choose the asset and network you’re sending from.</p>
                {data.testnet && <TestnetNote />}
                <div className="max-h-[56dvh] space-y-2 overflow-y-auto pr-1 no-scrollbar">
                  {data.methods.map((m, i) => (
                    <motion.button
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      disabled={!!m.unavailable}
                      onClick={() => setMethod(m)}
                      className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3.5 text-left transition hover:border-gold-500/50 hover:bg-gold-500/[0.04] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-white/10 disabled:hover:bg-white/[0.02]"
                    >
                      <MethodIcon image={image(m)} symbol={m.symbol} badge={m.badge} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{methodLabel(m)}</p>
                        <p className="text-xs text-ink-400">{m.network}</p>
                      </div>
                      {m.unavailable ? (
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-400">{m.unavailable}</span>
                      ) : (
                        <ChevronRight size={18} className="text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-gold-300" />
                      )}
                    </motion.button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key={method.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
            <DepositDetail method={method} account={account} onBack={() => setMethod(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

function TestnetNote() {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-gold-500/10 px-3 py-2.5 text-xs leading-relaxed text-gold-300">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>Test networks: coins here have no real value. Use them to try the full deposit and withdrawal flow end to end.</span>
    </div>
  )
}

function DepositDetail({ method: m, account, onBack }: { method: DepositMethod; account: Account; onBack: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [wallet, setWallet] = useState('')
  const [editWallet, setEditWallet] = useState(false)
  const [hash, setHash] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'wait' | 'err'; text: string } | null>(null)
  const saved = account.user?.wallets[m.family]
  const hint = WALLET_HINT[m.family]
  const hasWallet = !!saved && !editWallet

  useEffect(() => {
    QRCode.toDataURL(m.address, { margin: 1, width: 360, color: { dark: '#0d0d12', light: '#f6f1e3' } }).then(setQr, () => setQr(null))
  }, [m.address])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      const err = e as Error & { pending?: boolean }
      setMsg({ tone: err.pending ? 'wait' : 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const saveWallet = () =>
    run(async () => {
      await account.setWallet(m.family, wallet.trim())
      setEditWallet(false)
      setWallet('')
    })
  const verify = () =>
    run(async () => {
      const amount = await account.verifyDeposit(m.id, hash.trim())
      setMsg({ tone: 'ok', text: `Deposit confirmed on-chain: ${+amount.toFixed(8)} ${m.symbol} added to your assets.` })
      setHash('')
    })

  const field = 'mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-sm outline-none focus:border-gold-500/60 focus:ring-4 focus:ring-gold-500/10'

  return (
    <div className="max-h-[70dvh] overflow-y-auto pr-1 no-scrollbar">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-ink-400 hover:text-white"><ArrowLeft size={14} /> All assets</button>

      <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${m.testnet ? 'bg-gold-500/10 text-gold-300' : 'bg-down/10 text-down'}`}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          Send only <b>{m.symbol}</b> on <b>{m.network}</b> to this address.
          {m.testnet ? ' Testnet coins have no real value.' : ' Other assets or networks may be lost permanently.'}
        </span>
      </div>

      <div className="mt-5 flex flex-col items-center">
        {qr && <motion.img initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} src={qr} alt={`${m.symbol} deposit address QR code`} className="h-44 w-44 rounded-2xl ring-1 ring-gold-500/30" />}
        <p className="mt-4 text-xs uppercase tracking-wider text-ink-400">{m.network} deposit address</p>
        <button onClick={copy} className="group mt-2 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left hover:border-gold-500/40">
          <span className="flex-1 break-all font-mono text-[13px] text-white/90">{m.address}</span>
          <span className={`shrink-0 rounded-lg p-1.5 ${copied ? 'text-up' : 'text-ink-400 group-hover:text-gold-300'}`}>{copied ? <Check size={16} /> : <Copy size={16} />}</span>
        </button>
        <motion.button whileTap={{ scale: 0.98 }} onClick={copy} className="btn-gold mt-3 w-full py-3 text-sm">{copied ? 'Copied' : 'Copy address'}</motion.button>
      </div>

      <ol className="mt-6 space-y-5 border-t border-white/5 pt-5 text-sm">
        <li>
          <p className="font-medium"><span className="mr-2 text-gold-400">1.</span>Your sending {hint.label}</p>
          {hasWallet ? (
            <div className="mt-1.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 break-all font-mono text-xs text-ink-300">{saved}</p>
              <button onClick={() => setEditWallet(true)} className="shrink-0 text-xs text-gold-300 hover:text-gold-400">Change</button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-400">We credit deposits by matching the wallet they’re sent from, so nobody else can claim yours.</p>
              <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder={hint.placeholder} className={field} spellCheck={false} />
              <button onClick={saveWallet} disabled={busy || !wallet.trim()} className="btn-ghost mt-2 w-full py-2.5 text-sm disabled:opacity-40">Save wallet</button>
            </>
          )}
        </li>
        <li className={hasWallet ? '' : 'pointer-events-none opacity-40'}>
          <p className="font-medium"><span className="mr-2 text-gold-400">2.</span>Send {m.symbol}, then paste the transaction ID</p>
          <p className="mt-1 text-xs text-ink-400">Credited automatically after {m.minConfirmations} network confirmation{m.minConfirmations === 1 ? '' : 's'}.</p>
          <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder={hint.hash} className={field} spellCheck={false} />
        </li>
      </ol>

      {msg && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-up/10 text-up' : msg.tone === 'wait' ? 'bg-gold-500/10 text-gold-300' : 'bg-down/10 text-down'}`}>{msg.text}</p>
      )}
      {msg?.tone !== 'ok' && hash.trim() && (
        <a href={explorerUrl(m.explorer, hash.trim())} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-ink-400 hover:text-white">
          View on explorer <ExternalLink size={12} />
        </a>
      )}

      <motion.button whileTap={{ scale: 0.98 }} onClick={verify} disabled={busy || !hasWallet || !hash.trim()} className="btn-gold mt-5 flex w-full items-center justify-center gap-2 py-3.5 disabled:opacity-40">
        {busy && <Loader2 size={18} className="animate-spin" />}
        {msg?.tone === 'wait' ? 'Check again' : 'Verify deposit'}
      </motion.button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-400"><ShieldCheck size={13} /> Verified directly on the {m.network} blockchain</p>
    </div>
  )
}
