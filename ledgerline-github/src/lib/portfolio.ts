import { useCallback, useEffect, useState } from 'react'

// Account + portfolio state, owned by the server. The browser never decides
// balances: trades are priced server-side and deposits are verified on-chain.

export type TxStatus = 'pending' | 'completed' | 'cancelled' | 'rejected'

export type Tx = {
  id: string
  type: 'buy' | 'sell' | 'reset' | 'deposit' | 'withdraw'
  coinId?: string
  symbol?: string
  qty?: number
  price?: number
  fee?: number
  total: number
  txHash?: string
  address?: string
  method?: string
  network?: string
  explorer?: string
  status?: TxStatus
  note?: string
  at: number
}

export type Portfolio = {
  cash: number
  holdings: Record<string, number>
  txs: Tx[]
  snapshots: { at: number; value: number }[]
}

export type Family = 'evm' | 'btc' | 'tron' | 'sol'

export type User = { id: string; email: string; name: string; wallets: Partial<Record<Family, string>> }

export type DepositMethod = {
  id: string
  name: string
  symbol: string
  badge: string | null
  coinId: string
  family: Family
  network: string
  testnet: boolean
  address: string
  unavailable: string | null
  minConfirmations: number
  explorer: string
  fee: number
  minWithdrawal: number
}

export type Withdrawal = {
  id: string
  method: string
  coinId: string
  address: string
  amount: number
  fee: number
  status: TxStatus
  txHash: string | null
  note: string | null
  createdAt: number
  updatedAt: number
}

type State = { user: User; portfolio: Portfolio; withdrawable: Record<string, number>; withdrawals: Withdrawal[] }

export const FEE_RATE = 0.001

export const explorerUrl = (template: string, tx: string) => template.replace('{tx}', tx)

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.pending) {
    const fallback = res.status === 502 || res.status === 504 ? 'Can’t reach the Ledgerline server. Is it running?' : `Request failed (${res.status})`
    const err = new Error(data.error ?? fallback) as Error & { status: number; pending?: boolean }
    err.status = res.status
    err.pending = data.pending
    throw err
  }
  return data as T
}

// Supported deposit/withdrawal networks, as configured on the server.
let methodsCache: Promise<{ testnet: boolean; methods: DepositMethod[] }> | null = null
export function useDepositMethods(enabled: boolean) {
  const [data, setData] = useState<{ testnet: boolean; methods: DepositMethod[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    methodsCache ??= api<{ testnet: boolean; methods: DepositMethod[] }>('/deposit/methods')
    methodsCache
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: Error) => {
        methodsCache = null
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [enabled])
  return { data, error }
}

export function holdingsValue(p: Portfolio, coins: { id: string; current_price: number }[] | null) {
  if (!coins) return 0
  return Object.entries(p.holdings).reduce((sum, [id, qty]) => sum + (coins.find((c) => c.id === id)?.current_price ?? 0) * qty, 0)
}

export function useAccount() {
  const [user, setUser] = useState<User | null>(null)
  const [p, setP] = useState<Portfolio | null>(null)
  const [withdrawable, setWithdrawable] = useState<Record<string, number>>({})
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)

  const apply = useCallback((s: State) => {
    setUser(s.user)
    setP(s.portfolio)
    setWithdrawable(s.withdrawable)
    setWithdrawals(s.withdrawals)
    return s
  }, [])

  const refresh = useCallback(async () => {
    try {
      apply(await api<State>('/me'))
    } catch {
      setUser(null)
      setP(null)
    } finally {
      setLoading(false)
    }
  }, [apply])

  // Load the session on start; re-sync every minute so withdrawal status updates show up.
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const register = (name: string, email: string, password: string) => api('/register', { name, email, password })

  const login = async (email: string, password: string) => {
    await api('/login', { email, password })
    await refresh()
  }

  const logout = async () => {
    await api('/logout', {}).catch(() => {})
    setUser(null)
    setP(null)
  }

  const trade = async (side: 'buy' | 'sell', coinId: string, amount: number) => {
    apply(await api<State>('/trade', { side, coinId, amount }))
  }

  const reset = async () => {
    apply(await api<State>('/reset', {}))
  }

  const setWallet = async (family: Family, wallet: string) => {
    apply(await api<State>('/wallet', { family, wallet }))
  }

  const verifyDeposit = async (method: string, txHash: string) => {
    const r = await api<State & { amount: number }>('/deposit/verify', { method, txHash })
    apply(r)
    return r.amount
  }

  const withdraw = async (method: string, address: string, amount: number) => {
    apply(await api<State>('/withdraw', { method, address, amount }))
  }

  const cancelWithdrawal = async (id: string) => {
    apply(await api<State>('/withdraw/cancel', { id }))
  }

  return { user, p, withdrawable, withdrawals, loading, refresh, register, login, logout, trade, reset, setWallet, verifyDeposit, withdraw, cancelWithdrawal }
}

export type Account = ReturnType<typeof useAccount>
