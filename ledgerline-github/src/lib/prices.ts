import { useEffect, useState } from 'react'
import { BRAND, COIN_IDS } from '../config'

export type Coin = {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  price_change_percentage_24h: number | null
  market_cap: number
  total_volume: number
  sparkline_in_7d?: { price: number[] }
}

const ENDPOINT =
  `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${BRAND.currency}` +
  `&ids=${COIN_IDS.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`

const CACHE_KEY = 'll:markets'
const REFRESH_MS = 60_000

function readCache(): Coin[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Coin[]) : null
  } catch {
    return null
  }
}

// Live market data from CoinGecko's public API, refreshed every minute.
// Falls back to the last good response so the UI never shows invented prices.
export function useMarkets() {
  const [coins, setCoins] = useState<Coin[] | null>(() => readCache())
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(ENDPOINT)
        if (!res.ok) throw new Error(`Price feed returned ${res.status}`)
        const data = (await res.json()) as Coin[]
        if (!alive) return
        setCoins(data)
        setError(null)
        setUpdatedAt(Date.now())
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data))
        } catch {
          /* storage unavailable */
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Price feed unavailable')
      }
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return { coins, error, updatedAt }
}

export const money = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: BRAND.currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)

export const smartPrice = (n: number) => money(n, n < 1 ? 4 : 2)

export const compact = (n: number) =>
  BRAND.currencySymbol + new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 2 }).format(n)

export const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
