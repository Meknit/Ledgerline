import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { BRAND } from '../config'
import { Logo, RiskNote } from '../components/ui'
import type { Account } from '../lib/portfolio'

type Mode = 'register' | 'login'

export default function Auth({ initialMode, onBack, account }: { initialMode: Mode; onBack: () => void; account: Account }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const strength = [password.length >= 8, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setNotice(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'register' && password !== confirm) return setError('Passwords don’t match.')
    setBusy(true)
    try {
      if (mode === 'register') {
        await account.register(name, email, password)
        // After registering, send the user to log in with their new details.
        setPassword('')
        setConfirm('')
        setMode('login')
        setNotice('Account created. Log in to continue.')
      } else {
        await account.login(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const input = 'mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 outline-none transition focus:border-gold-500/60 focus:ring-4 focus:ring-gold-500/10'
  const label = 'mt-4 block text-xs font-medium uppercase tracking-wider text-ink-400'

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[600px] -translate-x-1/2 rounded-full bg-gold-500/10 blur-[100px]" />
      <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit} className="card relative w-full max-w-sm p-7" noValidate>
        <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>
        <Logo size={36} />
        <h1 className="mt-5 font-display text-2xl font-bold">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          {mode === 'register' ? `Join ${BRAND.name} and start with a £${BRAND.StartingCash.toLocaleString()} practice balance.` : 'Log in to your dashboard.'}
        </p>

        <div className="relative mt-6 grid grid-cols-2 rounded-xl bg-white/[0.04] p-1 text-sm font-medium">
          {(['register', 'login'] as const).map((m) => (
            <button type="button" key={m} onClick={() => switchMode(m)} className={`relative z-10 py-2 ${mode === m ? 'text-white' : 'text-ink-400'}`}>
              {mode === m && <motion.span layoutId="authtab" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.07] ring-1 ring-white/10" />}
              {m === 'register' ? 'Register' : 'Log in'}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {notice && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 flex items-center gap-2 rounded-lg bg-up/10 px-3 py-2 text-sm text-up">
              <CheckCircle2 size={16} /> {notice}
            </motion.p>
          )}
        </AnimatePresence>

        {mode === 'register' && (
          <>
            <label className={label} htmlFor="name">Full name</label>
            <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={input} maxLength={40} required />
          </>
        )}
        <label className={label} htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} required />

        <label className={label} htmlFor="password">Password</label>
        <div className="relative">
          <input id="password" type={show ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-11`} required minLength={8} />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 mt-1 -translate-y-1/2 text-ink-400 hover:text-white" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {mode === 'register' && (
          <>
            <div className="mt-2 flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full transition ${i < strength ? (strength < 2 ? 'bg-down' : strength < 4 ? 'bg-gold-400' : 'bg-up') : 'bg-white/10'}`} />
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-400">At least 8 characters. Mix cases, numbers and symbols for a stronger password.</p>
            <label className={label} htmlFor="confirm">Confirm password</label>
            <input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required />
          </>
        )}

        {error && <p className="mt-4 rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}

        <motion.button whileTap={{ scale: 0.98 }} disabled={busy} className="btn-gold mt-6 flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50">
          {busy && <Loader2 size={18} className="animate-spin" />}
          {mode === 'register' ? 'Create account' : 'Log in'}
        </motion.button>

        <p className="mt-4 text-center text-sm text-ink-400">
          {mode === 'register' ? 'Already have an account? ' : 'New here? '}
          <button type="button" onClick={() => switchMode(mode === 'register' ? 'login' : 'register')} className="font-medium text-gold-400 hover:text-gold-300">
            {mode === 'register' ? 'Log in' : 'Create an account'}
          </button>
        </p>
        <RiskNote className="mt-5" />
      </motion.form>
    </div>
  )
}
