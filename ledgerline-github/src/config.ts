// Single place to rebrand the app once you settle on a name and legal entity.
export const BRAND = {
  name: 'Ledgerline',
  tagline: 'Track, practise and learn crypto with live market data.',
  currency: 'gbp' as const,
  currencySymbol: '£',
  // Paper-trading starting balance. This is practice money, never real funds.
  StartingCash: 10_000,
  supportEmail: 'support@example.com',
}

// Coins shown in markets and available for paper trades (CoinGecko ids).
export const COIN_IDS = [
  'bitcoin',
  'ethereum',
  'tether',
  'usd-coin',
  'binancecoin',
  'solana',
  'ripple',
  'cardano',
  'dogecoin',
  'tron',
  'litecoin',
]
