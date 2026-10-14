// Ledgerline API: accounts, sessions, paper trading, on-chain deposit verification
// and a withdrawal queue. Zero dependencies: Node's built-in http, crypto and sqlite (Node 22.13+).
import { createServer } from 'node:http'
import { randomBytes, scrypt as scryptCb, timingSafeEqual, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TESTNET, FAMILIES, METHODS, publicMethods, verifyDeposit } from './chain.js'

const scrypt = promisify(scryptCb)
const PORT = Number(process.env.PORT ?? 8787)
const STARTING_CASH = 10_000
const FEE_RATE = 0.001
const SESSION_DAYS = 7
const COIN_IDS = ['bitcoin', 'ethereum', 'tether', 'usd-coin', 'binancecoin', 'solana', 'ripple', 'cardano', 'dogecoin', 'tron', 'litecoin']
const SECURE_COOKIE = process.env.NODE_ENV === 'production'
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN ?? '').trim()
const EPS = 1e-9

mkdirSync(new URL('./data/', import.meta.url), { recursive: true })
const db = new DatabaseSync(fileURLToPath(new URL('./data/ledgerline.db', import.meta.url)))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    pass_hash TEXT NOT NULL, salt TEXT NOT NULL, wallet TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS portfolios (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS deposits (
    tx_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount REAL NOT NULL, at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_wallets (
    user_id TEXT NOT NULL, family TEXT NOT NULL, address TEXT NOT NULL, PRIMARY KEY (user_id, family)
  );
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, method TEXT NOT NULL, coin_id TEXT NOT NULL,
    address TEXT NOT NULL, amount REAL NOT NULL, fee REAL NOT NULL, status TEXT NOT NULL,
    tx_hash TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
`)
// Migrations from the single-network version.
for (const sql of [
  `ALTER TABLE deposits ADD COLUMN coin_id TEXT NOT NULL DEFAULT 'ethereum'`,
  `ALTER TABLE deposits ADD COLUMN method TEXT NOT NULL DEFAULT 'eth'`,
]) {
  try { db.exec(sql) } catch { /* column already exists */ }
}
db.exec(`INSERT OR IGNORE INTO user_wallets (user_id, family, address) SELECT id, 'evm', wallet FROM users WHERE wallet IS NOT NULL`)

// ---------- helpers ----------
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e5) reject(new Error('Body too large'))
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('Invalid JSON')) }
    })
  })

const cookies = (req) =>
  Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p[0]))

const sessionCookie = (token, maxAge) =>
  `ll_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const buf = await scrypt(password, salt, 64)
  return { hash: buf.toString('hex'), salt }
}

function currentUser(req) {
  const token = cookies(req).ll_session
  if (!token) return null
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?').get(token, Date.now())
  return row ?? null
}

function newSession(userId) {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_DAYS * 864e5)
  return sessionCookie(token, SESSION_DAYS * 86400)
}

const freshPortfolio = () => ({
  cash: STARTING_CASH,
  holdings: {},
  txs: [{ id: randomUUID(), type: 'reset', total: STARTING_CASH, at: Date.now() }],
  snapshots: [{ at: Date.now(), value: STARTING_CASH }],
})
const getPortfolio = (userId) => JSON.parse(db.prepare('SELECT data FROM portfolios WHERE user_id = ?').get(userId)?.data ?? 'null') ?? freshPortfolio()
const savePortfolio = (userId, p) =>
  db.prepare('INSERT INTO portfolios (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').run(userId, JSON.stringify(p))

// Server-side prices so trades can't be faked from the browser.
let priceCache = { at: 0, coins: [] }
async function prices() {
  if (Date.now() - priceCache.at < 60_000 && priceCache.coins.length) return priceCache.coins
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=gbp&ids=${COIN_IDS.join(',')}`, { signal: AbortSignal.timeout(6000) })
    .catch(() => ({ ok: false }))
  if (!res.ok) {
    if (priceCache.coins.length) return priceCache.coins
    throw new Error('Price feed unavailable, try again shortly.')
  }
  priceCache = { at: Date.now(), coins: await res.json() }
  return priceCache.coins
}

async function withSnapshot(p) {
  try {
    const coins = await prices()
    const value = p.cash + Object.entries(p.holdings).reduce((s, [id, q]) => s + (coins.find((c) => c.id === id)?.current_price ?? 0) * q, 0)
    const last = p.snapshots.at(-1)
    if (!last || Date.now() - last.at > 10 * 60_000) p.snapshots = [...p.snapshots, { at: Date.now(), value }].slice(-200)
  } catch { /* prices down: skip snapshot */ }
  return p
}

const wallets = (userId) =>
  Object.fromEntries(db.prepare('SELECT family, address FROM user_wallets WHERE user_id = ?').all(userId).map((r) => [r.family, r.address]))

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, wallets: wallets(u.id) })

// Real (on-chain backed) balance per coin: verified deposits minus withdrawals that
// are pending or paid. Paper-trading profits are never withdrawable.
function realBalances(userId) {
  const out = {}
  for (const r of db.prepare('SELECT coin_id, SUM(amount) AS total FROM deposits WHERE user_id = ? GROUP BY coin_id').all(userId))
    out[r.coin_id] = (out[r.coin_id] ?? 0) + r.total
  for (const r of db.prepare(`SELECT coin_id, SUM(amount) AS total FROM withdrawals WHERE user_id = ? AND status IN ('pending', 'completed') GROUP BY coin_id`).all(userId))
    out[r.coin_id] = (out[r.coin_id] ?? 0) - r.total
  return out
}

function withdrawable(userId, p) {
  const out = {}
  for (const [coin, real] of Object.entries(realBalances(userId))) {
    const v = Math.min(real, p.holdings[coin] ?? 0)
    if (v > EPS) out[coin] = v
  }
  return out
}

const publicWithdrawal = (w) => ({
  id: w.id, method: w.method, coinId: w.coin_id, address: w.address, amount: w.amount, fee: w.fee,
  status: w.status, txHash: w.tx_hash, note: w.note, createdAt: w.created_at, updatedAt: w.updated_at,
})

function sendState(res, u, p, extra = {}) {
  const list = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(u.id)
  json(res, 200, { user: publicUser(u), portfolio: p, withdrawable: withdrawable(u.id, p), withdrawals: list.map(publicWithdrawal), ...extra })
}

// Keeps the matching history entry in step with the withdrawal record.
function setTxStatus(userId, withdrawalId, patch) {
  const p = getPortfolio(userId)
  const tx = p.txs.find((t) => t.withdrawalId === withdrawalId)
  if (tx) Object.assign(tx, patch)
  return p
}

// Basic brute-force protection for login/register.
const attempts = new Map()
function rateLimited(key, max = 10) {
  const now = Date.now()
  const a = (attempts.get(key) ?? []).filter((t) => now - t < 15 * 60_000)
  a.push(now)
  attempts.set(key, a)
  return a.length > max
}

function isAdmin(req) {
  if (!ADMIN_TOKEN) return false
  const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''))
  const want = Buffer.from(ADMIN_TOKEN)
  return given.length === want.length && timingSafeEqual(given, want)
}

// ---------- routes ----------
const routes = {
  'POST /api/register': async (req, res) => {
    if (rateLimited('reg:' + req.socket.remoteAddress)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' })
    const { name, email, password } = await readBody(req)
    const em = String(email ?? '').trim().toLowerCase()
    const nm = String(name ?? '').trim()
    if (!nm || nm.length > 40) return json(res, 400, { error: 'Enter your name.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return json(res, 400, { error: 'Enter a valid email address.' })
    if (String(password ?? '').length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' })
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em)) return json(res, 409, { error: 'An account with this email already exists.' })
    const { hash, salt } = await hashPassword(String(password))
    const id = randomUUID()
    db.prepare('INSERT INTO users (id, email, name, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, em, nm, hash, salt, Date.now())
    savePortfolio(id, freshPortfolio())
    // Registration does not sign the user in; they log in next.
    json(res, 201, { ok: true })
  },

  'POST /api/login': async (req, res) => {
    const { email, password } = await readBody(req)
    const em = String(email ?? '').trim().toLowerCase()
    if (rateLimited('login:' + em) || rateLimited('ip:' + req.socket.remoteAddress)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' })
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(em)
    const { hash } = await hashPassword(String(password ?? ''), u?.salt ?? 'x'.repeat(32))
    if (!u || !timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.pass_hash, 'hex'))) return json(res, 401, { error: 'Incorrect email or password.' })
    json(res, 200, { user: publicUser(u) }, { 'Set-Cookie': newSession(u.id) })
  },

  'POST /api/logout': async (req, res) => {
    const token = cookies(req).ll_session
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) })
  },

  'GET /api/me': async (req, res, u) => {
    const p = await withSnapshot(getPortfolio(u.id))
    savePortfolio(u.id, p)
    sendState(res, u, p)
  },

  'POST /api/trade': async (req, res, u) => {
    const { side, coinId, amount } = await readBody(req)
    const amt = Number(amount)
    if (!['buy', 'sell'].includes(side)) return json(res, 400, { error: 'Invalid side.' })
    if (!(amt > 0) || amt > 1e9) return json(res, 400, { error: 'Enter an amount above zero.' })
    const coin = (await prices()).find((c) => c.id === coinId)
    if (!coin) return json(res, 400, { error: 'Unknown asset.' })
    const p = getPortfolio(u.id)
    const fee = amt * FEE_RATE
    const qty = (side === 'buy' ? amt - fee : amt) / coin.current_price
    const held = p.holdings[coin.id] ?? 0
    if (side === 'buy' && amt > p.cash + EPS) return json(res, 400, { error: 'Not enough cash.' })
    if (side === 'sell' && qty > held * (1 + EPS)) return json(res, 400, { error: `You only hold ${held.toFixed(6)} ${coin.symbol.toUpperCase()}.` })
    p.cash = side === 'buy' ? p.cash - amt : p.cash + amt - fee
    p.holdings[coin.id] = side === 'buy' ? held + qty : Math.max(0, held - qty)
    if (p.holdings[coin.id] < 1e-12) delete p.holdings[coin.id]
    p.txs.unshift({ id: randomUUID(), type: side, coinId: coin.id, symbol: coin.symbol, qty, price: coin.current_price, total: amt, at: Date.now() })
    savePortfolio(u.id, p)
    sendState(res, u, p)
  },

  'POST /api/reset': async (req, res, u) => {
    // Resets demo cash and trades; keeps real on-chain balances and their history.
    const old = getPortfolio(u.id)
    const p = freshPortfolio()
    for (const [coin, amount] of Object.entries(realBalances(u.id))) if (amount > EPS) p.holdings[coin] = amount
    p.txs.push(...old.txs.filter((t) => t.type === 'deposit' || t.type === 'withdraw'))
    savePortfolio(u.id, p)
    sendState(res, u, p)
  },

  'GET /api/deposit/methods': async (req, res) => {
    json(res, 200, { testnet: TESTNET, methods: publicMethods() })
  },

  'POST /api/wallet': async (req, res, u) => {
    const { family, wallet } = await readBody(req)
    const fam = FAMILIES[family]
    const addr = String(wallet ?? '').trim()
    if (!fam) return json(res, 400, { error: 'Unknown wallet type.' })
    if (!fam.isAddress(addr)) return json(res, 400, { error: `Enter a valid ${fam.label}${TESTNET ? ' testnet' : ''} address.` })
    db.prepare('INSERT INTO user_wallets (user_id, family, address) VALUES (?, ?, ?) ON CONFLICT(user_id, family) DO UPDATE SET address = excluded.address')
      .run(u.id, family, fam.norm(addr))
    sendState(res, u, getPortfolio(u.id))
  },

  'POST /api/deposit/verify': async (req, res, u) => {
    if (rateLimited('verify:' + u.id, 60)) return json(res, 429, { error: 'Too many checks. Try again in a few minutes.' })
    const { method: methodId, txHash } = await readBody(req)
    const m = METHODS[methodId]
    if (!m) return json(res, 400, { error: 'Unknown deposit method.' })
    if (m.unavailable) return json(res, 503, { error: `${m.symbol} on ${m.network} isn’t available yet.` })
    const from = wallets(u.id)[m.family]
    if (!from) return json(res, 400, { error: 'Add the wallet you are sending from first.' })
    const hash = FAMILIES[m.family].normHash(String(txHash ?? '').trim())
    if (!hash) return json(res, 400, { error: 'That doesn’t look like a transaction ID for this network.' })
    if (db.prepare('SELECT 1 FROM deposits WHERE tx_hash = ?').get(hash)) return json(res, 409, { error: 'This transaction has already been credited.' })
    const result = await verifyDeposit(m, hash, from)
    if (!result.ok) return json(res, result.pending ? 202 : 400, { error: result.error, pending: !!result.pending })
    try {
      db.prepare('INSERT INTO deposits (tx_hash, user_id, amount, at, coin_id, method) VALUES (?, ?, ?, ?, ?, ?)').run(hash, u.id, result.amount, Date.now(), m.coinId, m.id)
    } catch {
      return json(res, 409, { error: 'This transaction has already been credited.' })
    }
    const p = getPortfolio(u.id)
    p.holdings[m.coinId] = (p.holdings[m.coinId] ?? 0) + result.amount
    p.txs.unshift({ id: randomUUID(), type: 'deposit', coinId: m.coinId, symbol: m.symbol.toLowerCase(), qty: result.amount, total: 0, txHash: hash, method: m.id, network: m.network, explorer: m.explorer, status: 'completed', at: Date.now() })
    savePortfolio(u.id, p)
    sendState(res, u, p, { amount: result.amount })
  },

  'POST /api/withdraw': async (req, res, u) => {
    if (rateLimited('withdraw:' + u.id, 20)) return json(res, 429, { error: 'Too many requests. Try again in a few minutes.' })
    const { method: methodId, address, amount } = await readBody(req)
    const m = METHODS[methodId]
    if (!m) return json(res, 400, { error: 'Choose an asset and network.' })
    if (m.unavailable) return json(res, 503, { error: `${m.symbol} on ${m.network} isn’t available yet.` })
    const fam = FAMILIES[m.family]
    const to = String(address ?? '').trim()
    if (!fam.isAddress(to)) return json(res, 400, { error: `Enter a valid ${m.network} address.` })
    if (fam.norm(to) === m.address) return json(res, 400, { error: 'That is a Ledgerline deposit address. Enter your own wallet.' })
    const amt = Number(amount)
    if (!(amt > 0)) return json(res, 400, { error: 'Enter an amount above zero.' })
    if (amt < m.fee * 2 - EPS) return json(res, 400, { error: `Minimum withdrawal is ${m.fee * 2} ${m.symbol}.` })
    const p = getPortfolio(u.id)
    const available = withdrawable(u.id, p)[m.coinId] ?? 0
    if (amt > available + EPS)
      return json(res, 400, { error: available > 0 ? `You can withdraw up to ${+available.toFixed(8)} ${m.symbol}.` : `You have no deposited ${m.symbol} to withdraw. Demo balances can’t be withdrawn.` })

    const id = randomUUID()
    const now = Date.now()
    db.prepare('INSERT INTO withdrawals (id, user_id, method, coin_id, address, amount, fee, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, u.id, m.id, m.coinId, fam.norm(to), amt, m.fee, 'pending', now, now)
    p.holdings[m.coinId] = Math.max(0, (p.holdings[m.coinId] ?? 0) - amt)
    if (p.holdings[m.coinId] < 1e-12) delete p.holdings[m.coinId]
    p.txs.unshift({ id: randomUUID(), type: 'withdraw', coinId: m.coinId, symbol: m.symbol.toLowerCase(), qty: amt, fee: m.fee, total: 0, address: fam.norm(to), method: m.id, network: m.network, explorer: m.explorer, status: 'pending', withdrawalId: id, at: now })
    savePortfolio(u.id, p)
    sendState(res, u, p, { withdrawalId: id })
  },

  'POST /api/withdraw/cancel': async (req, res, u) => {
    const { id } = await readBody(req)
    const w = db.prepare('SELECT * FROM withdrawals WHERE id = ? AND user_id = ?').get(String(id ?? ''), u.id)
    if (!w) return json(res, 404, { error: 'Withdrawal not found.' })
    if (w.status !== 'pending') return json(res, 409, { error: 'This withdrawal is already being processed and can’t be cancelled.' })
    db.prepare(`UPDATE withdrawals SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(Date.now(), w.id)
    const p = setTxStatus(u.id, w.id, { status: 'cancelled' })
    p.holdings[w.coin_id] = (p.holdings[w.coin_id] ?? 0) + w.amount
    savePortfolio(u.id, p)
    sendState(res, u, p)
  },

  // ---------- operator endpoints (Authorization: Bearer $ADMIN_TOKEN) ----------
  'GET /api/admin/withdrawals': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Forbidden' })
    const rows = db.prepare(`SELECT w.*, u.email FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.status = 'pending' DESC, w.created_at DESC LIMIT 200`).all()
    json(res, 200, { withdrawals: rows.map((w) => ({ ...publicWithdrawal(w), email: w.email, network: METHODS[w.method]?.network, receive: w.amount - w.fee })) })
  },

  'POST /api/admin/withdrawals/update': async (req, res) => {
    if (!isAdmin(req)) return json(res, 403, { error: 'Forbidden' })
    const { id, status, txHash, note } = await readBody(req)
    const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(String(id ?? ''))
    if (!w) return json(res, 404, { error: 'Withdrawal not found.' })
    if (w.status !== 'pending') return json(res, 409, { error: `Withdrawal is already ${w.status}.` })
    if (status === 'completed') {
      const hash = FAMILIES[METHODS[w.method].family].normHash(String(txHash ?? '').trim())
      if (!hash) return json(res, 400, { error: 'A valid payout transaction ID is required.' })
      db.prepare(`UPDATE withdrawals SET status = 'completed', tx_hash = ?, note = ?, updated_at = ? WHERE id = ?`).run(hash, note ?? null, Date.now(), w.id)
      savePortfolio(w.user_id, setTxStatus(w.user_id, w.id, { status: 'completed', txHash: hash }))
    } else if (status === 'rejected') {
      db.prepare(`UPDATE withdrawals SET status = 'rejected', note = ?, updated_at = ? WHERE id = ?`).run(String(note ?? 'Rejected'), Date.now(), w.id)
      const p = setTxStatus(w.user_id, w.id, { status: 'rejected', note: String(note ?? '') })
      p.holdings[w.coin_id] = (p.holdings[w.coin_id] ?? 0) + w.amount
      savePortfolio(w.user_id, p)
    } else return json(res, 400, { error: 'Status must be "completed" or "rejected".' })
    json(res, 200, { ok: true })
  },
}

const PUBLIC = new Set(['POST /api/register', 'POST /api/login', 'POST /api/logout', 'GET /api/deposit/methods', 'GET /api/admin/withdrawals', 'POST /api/admin/withdrawals/update'])

createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split('?')[0]}`
  const handler = routes[key]
  if (!handler) return json(res, 404, { error: 'Not found' })
  try {
    if (PUBLIC.has(key)) return await handler(req, res)
    const u = currentUser(req)
    if (!u) return json(res, 401, { error: 'Please log in.' })
    await handler(req, res, u)
  } catch (e) {
    console.error(e)
    json(res, 500, { error: e instanceof Error ? e.message : 'Server error' })
  }
}).listen(PORT, () => {
  const live = Object.values(METHODS).filter((m) => !m.unavailable).map((m) => m.id)
  console.log(`Ledgerline API on http://localhost:${PORT} · ${TESTNET ? 'TESTNET' : 'MAINNET'} · deposits: ${live.join(', ') || 'none configured'}`)
})
