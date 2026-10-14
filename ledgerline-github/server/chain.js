// Multi-network deposit verification. Every credit is checked against the chain
// itself: right network, right asset, sent to our address, from the user's own
// registered wallet, with enough confirmations. Nothing is credited on trust.
// Defaults to testnets. Set DEPOSIT_NETWORK=mainnet only once you are licensed
// and have a regulated custody setup.

export const TESTNET = process.env.DEPOSIT_NETWORK !== 'mainnet'
const NET = TESTNET ? 'testnet' : 'mainnet'
const env = (k) => (process.env[k] ?? '').trim()
const pick = (o) => o[NET]

// ---------- address families (one registered sending wallet per family) ----------
const BASE58 = '[1-9A-HJ-NP-Za-km-z]'
const isBech32 = (a) => /^(bc1|tb1)/i.test(a)

export const FAMILIES = {
  evm: {
    label: 'Ethereum-compatible wallet (0x…)',
    isAddress: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),
    norm: (a) => a.toLowerCase(),
    normHash: (h) => (/^0x[0-9a-fA-F]{64}$/.test(h) ? h.toLowerCase() : null),
  },
  btc: {
    label: 'Bitcoin wallet',
    isAddress: (a) =>
      TESTNET
        ? new RegExp(`^(tb1[02-9ac-hj-np-z]{8,87}|[mn2]${BASE58}{25,34})$`, 'i').test(a)
        : new RegExp(`^(bc1[02-9ac-hj-np-z]{8,87}|[13]${BASE58}{25,34})$`, 'i').test(a),
    norm: (a) => (isBech32(a) ? a.toLowerCase() : a),
    normHash: (h) => (/^(0x)?[0-9a-fA-F]{64}$/.test(h) ? h.replace(/^0x/, '').toLowerCase() : null),
  },
  tron: {
    label: 'Tron wallet (T…)',
    isAddress: (a) => new RegExp(`^T${BASE58}{33}$`).test(a),
    norm: (a) => a,
    normHash: (h) => (/^(0x)?[0-9a-fA-F]{64}$/.test(h) ? h.replace(/^0x/, '').toLowerCase() : null),
  },
  sol: {
    label: 'Solana wallet',
    isAddress: (a) => new RegExp(`^${BASE58}{32,44}$`).test(a),
    norm: (a) => a,
    normHash: (h) => (new RegExp(`^${BASE58}{64,90}$`).test(h) ? h : null),
  },
}

// Sending to the zero address burns funds, so treat it as "not set".
const evmAddress = (env('EVM_DEPOSIT_ADDRESS') || env('DEPOSIT_ADDRESS')).toLowerCase()
const ADDRESSES = {
  evm: /^0x0{40}$/.test(evmAddress) ? '' : evmAddress,
  btc: FAMILIES.btc.norm(env('BTC_DEPOSIT_ADDRESS')),
  tron: env('TRON_DEPOSIT_ADDRESS'),
  sol: env('SOL_DEPOSIT_ADDRESS'),
}
for (const [family, address] of Object.entries(ADDRESSES)) {
  if (address && !FAMILIES[family].isAddress(address))
    throw new Error(`${family.toUpperCase()} deposit address "${address}" is not a valid ${NET} address`)
}

const ENDPOINTS = {
  eth: env('ETH_RPC_URL') || env('RPC_URL') || pick({ testnet: 'https://ethereum-sepolia-rpc.publicnode.com', mainnet: 'https://ethereum-rpc.publicnode.com' }),
  base: env('BASE_RPC_URL') || pick({ testnet: 'https://base-sepolia-rpc.publicnode.com', mainnet: 'https://base-rpc.publicnode.com' }),
  btc: env('BTC_API_URL') || pick({ testnet: 'https://mempool.space/testnet4/api', mainnet: 'https://mempool.space/api' }),
  tron: env('TRON_API_URL') || pick({ testnet: 'https://nile.trongrid.io', mainnet: 'https://api.trongrid.io' }),
  sol: env('SOL_RPC_URL') || pick({ testnet: 'https://api.devnet.solana.com', mainnet: 'https://api.mainnet-beta.solana.com' }),
}

const EVM_CHAINS = {
  eth: {
    network: pick({ testnet: 'Ethereum Sepolia', mainnet: 'Ethereum' }),
    chainId: pick({ testnet: 11155111, mainnet: 1 }),
    explorer: pick({ testnet: 'https://sepolia.etherscan.io/tx/{tx}', mainnet: 'https://etherscan.io/tx/{tx}' }),
    confirmations: pick({ testnet: 3, mainnet: 12 }),
  },
  base: {
    network: pick({ testnet: 'Base Sepolia', mainnet: 'Base' }),
    chainId: pick({ testnet: 84532, mainnet: 8453 }),
    explorer: pick({ testnet: 'https://sepolia.basescan.org/tx/{tx}', mainnet: 'https://basescan.org/tx/{tx}' }),
    confirmations: pick({ testnet: 3, mainnet: 12 }),
  },
}

// ---------- supported deposit / withdrawal methods ----------
// `fee` is the flat network fee taken from a withdrawal, in the asset itself.
const DEFS = [
  {
    id: 'btc', name: 'Bitcoin', symbol: 'BTC', coinId: 'bitcoin', family: 'btc', kind: 'btc', decimals: 8, fee: 0.0001,
    network: pick({ testnet: 'Bitcoin Testnet4', mainnet: 'Bitcoin' }),
    explorer: pick({ testnet: 'https://mempool.space/testnet4/tx/{tx}', mainnet: 'https://mempool.space/tx/{tx}' }),
    confirmations: pick({ testnet: 1, mainnet: 3 }),
  },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH', coinId: 'ethereum', family: 'evm', kind: 'evm-native', chain: 'eth', decimals: 18, fee: 0.001, ...EVM_CHAINS.eth },
  {
    id: 'usdt-erc20', name: 'Tether', symbol: 'USDT', badge: 'ERC20', coinId: 'tether', family: 'evm', kind: 'erc20', chain: 'eth', decimals: 6, fee: 5,
    // Tether has no official Sepolia deployment; set one yourself to test it.
    contract: (env('USDT_ERC20_CONTRACT') || pick({ testnet: '', mainnet: '0xdac17f958d2ee523a2206206994597c13d831ec7' })).toLowerCase(),
    ...EVM_CHAINS.eth,
  },
  {
    id: 'usdt-trc20', name: 'Tether', symbol: 'USDT', badge: 'TRC20', coinId: 'tether', family: 'tron', kind: 'trc20', decimals: 6, fee: 1,
    contract: env('USDT_TRC20_CONTRACT') || pick({ testnet: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf', mainnet: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }),
    network: pick({ testnet: 'Tron Nile', mainnet: 'Tron' }),
    explorer: pick({ testnet: 'https://nile.tronscan.org/#/transaction/{tx}', mainnet: 'https://tronscan.org/#/transaction/{tx}' }),
    confirmations: 19, // TronGrid only reports solidified (19-block) transfers
  },
  {
    id: 'usdc-erc20', name: 'USD Coin', symbol: 'USDC', badge: 'ERC20', coinId: 'usd-coin', family: 'evm', kind: 'erc20', chain: 'eth', decimals: 6, fee: 5,
    contract: (env('USDC_ERC20_CONTRACT') || pick({ testnet: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', mainnet: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' })).toLowerCase(),
    ...EVM_CHAINS.eth,
  },
  {
    id: 'sol', name: 'Solana', symbol: 'SOL', coinId: 'solana', family: 'sol', kind: 'sol', decimals: 9, fee: 0.001,
    network: pick({ testnet: 'Solana Devnet', mainnet: 'Solana' }),
    explorer: pick({ testnet: 'https://explorer.solana.com/tx/{tx}?cluster=devnet', mainnet: 'https://explorer.solana.com/tx/{tx}' }),
    confirmations: 32, // "finalized" commitment
  },
  { id: 'eth-base', name: 'Ethereum', symbol: 'ETH', badge: 'Base', coinId: 'ethereum', family: 'evm', kind: 'evm-native', chain: 'base', decimals: 18, fee: 0.0001, ...EVM_CHAINS.base },
]

const unavailableReason = (d) => {
  if ((d.kind === 'erc20' || d.kind === 'trc20') && !d.contract) return TESTNET ? 'Mainnet only' : 'Not set up'
  if (!ADDRESSES[d.family]) return 'Not set up'
  return null
}

export const METHODS = Object.fromEntries(DEFS.map((d) => [d.id, { ...d, address: ADDRESSES[d.family], unavailable: unavailableReason(d) }]))

export const publicMethods = () =>
  DEFS.map(({ id }) => {
    const m = METHODS[id]
    return {
      id, name: m.name, symbol: m.symbol, badge: m.badge ?? null, coinId: m.coinId, family: m.family,
      network: m.network, testnet: TESTNET, address: m.unavailable ? '' : m.address, unavailable: m.unavailable,
      minConfirmations: m.confirmations, explorer: m.explorer, fee: m.fee, minWithdrawal: m.fee * 2,
    }
  })

// ---------- chain clients ----------
async function getJson(url, init) {
  const headers = { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }
  if (url.startsWith(ENDPOINTS.tron) && env('TRONGRID_API_KEY')) headers['TRON-PRO-API-KEY'] = env('TRONGRID_API_KEY')
  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) }).catch(() => {
    throw new Error('The blockchain network didn’t respond. Try again shortly.')
  })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new Error(`Network API error ${res.status}. Try again shortly.`)
  return res.json()
}

async function rpc(url, method, params) {
  const body = await getJson(url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  if (body?.error) throw new Error(body.error.message)
  return body?.result ?? null
}

const fail = (error) => ({ ok: false, error })
const pending = (error) => ({ ok: false, pending: true, error })
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const topicAddress = (t) => '0x' + String(t).slice(26).toLowerCase()

async function verifyEvm(m, hash, from) {
  const url = ENDPOINTS[m.chain]
  const [tx, receipt, head] = await Promise.all([
    rpc(url, 'eth_getTransactionByHash', [hash]),
    rpc(url, 'eth_getTransactionReceipt', [hash]),
    rpc(url, 'eth_blockNumber', []),
  ])
  if (!tx) return fail(`Transaction not found on ${m.network}. Check you picked the right network.`)
  if (tx.chainId && Number(tx.chainId) !== m.chainId) return fail(`This transaction is on a different network, not ${m.network}.`)
  if (tx.from?.toLowerCase() !== from) return fail('This transaction was not sent from your registered wallet.')
  if (m.kind === 'evm-native' && tx.to?.toLowerCase() !== m.address) return fail('This transaction was not sent to your deposit address.')
  if (m.kind === 'erc20' && tx.to?.toLowerCase() !== m.contract) return fail(`This is not a ${m.symbol} transfer on ${m.network}.`)
  if (!receipt) return pending('Transaction is still pending. Try again in a minute.')
  if (receipt.status !== '0x1') return fail('Transaction failed on-chain, so nothing was received.')
  const confirmations = Number(BigInt(head) - BigInt(receipt.blockNumber)) + 1
  if (confirmations < m.confirmations) return pending(`Waiting for confirmations (${confirmations}/${m.confirmations}).`)

  let units = 0n
  if (m.kind === 'evm-native') units = BigInt(tx.value)
  else
    for (const log of receipt.logs ?? [])
      if (log.address?.toLowerCase() === m.contract && log.topics?.[0] === TRANSFER_TOPIC && topicAddress(log.topics[1]) === from && topicAddress(log.topics[2]) === m.address)
        units += BigInt(log.data)
  if (units === 0n) return fail(`No ${m.symbol} in this transaction was sent to your deposit address.`)
  return { ok: true, amount: Number(units) / 10 ** m.decimals }
}

async function verifyBtc(m, hash, from) {
  const tx = await getJson(`${ENDPOINTS.btc}/tx/${hash}`)
  if (!tx) return fail(`Transaction not found on ${m.network}. Check you picked the right network.`)
  const norm = FAMILIES.btc.norm
  const sats = (tx.vout ?? []).filter((o) => o.scriptpubkey_address && norm(o.scriptpubkey_address) === m.address).reduce((s, o) => s + o.value, 0)
  if (!sats) return fail('This transaction did not pay your deposit address.')
  if (!(tx.vin ?? []).some((i) => i.prevout?.scriptpubkey_address && norm(i.prevout.scriptpubkey_address) === from))
    return fail('This transaction was not sent from your registered wallet.')
  if (!tx.status?.confirmed) return pending(`In the mempool, waiting for confirmations (0/${m.confirmations}).`)
  const tip = Number(await fetch(`${ENDPOINTS.btc}/blocks/tip/height`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.text()))
  const confirmations = tip - tx.status.block_height + 1
  if (confirmations < m.confirmations) return pending(`Waiting for confirmations (${confirmations}/${m.confirmations}).`)
  return { ok: true, amount: sats / 1e8 }
}

async function verifyTrc20(m, hash, from) {
  const q = new URLSearchParams({ only_to: 'true', only_confirmed: 'true', limit: '200', contract_address: m.contract })
  const list = await getJson(`${ENDPOINTS.tron}/v1/accounts/${m.address}/transactions/trc20?${q}`)
  const hit = list?.data?.find((t) => t.transaction_id?.toLowerCase() === hash)
  if (hit) {
    if (hit.from !== from) return fail('This transaction was not sent from your registered wallet.')
    if (hit.to !== m.address) return fail('This transaction was not sent to your deposit address.')
    const amount = Number(hit.value) / 10 ** m.decimals
    return amount > 0 ? { ok: true, amount } : fail(`No ${m.symbol} was received in this transaction.`)
  }
  // Not among confirmed transfers to us: work out whether it is pending or wrong.
  const tx = await getJson(`${ENDPOINTS.tron}/wallet/gettransactionbyid`, { method: 'POST', body: JSON.stringify({ value: hash }) })
  if (!tx?.txID) return fail(`Transaction not found on ${m.network}. Check you picked the right network.`)
  const info = await getJson(`${ENDPOINTS.tron}/wallet/gettransactioninfobyid`, { method: 'POST', body: JSON.stringify({ value: hash }) })
  if (info?.blockTimeStamp && Date.now() - info.blockTimeStamp > 3 * 60_000)
    return fail(`This is not a ${m.symbol} (TRC20) transfer to your deposit address.`)
  return pending(`Waiting for the Tron network to confirm (${m.confirmations} blocks).`)
}

async function verifySol(m, sig, from) {
  const tx = await rpc(ENDPOINTS.sol, 'getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }])
  if (!tx) {
    const status = await rpc(ENDPOINTS.sol, 'getSignatureStatuses', [[sig], { searchTransactionHistory: true }])
    if (status?.value?.[0]) return pending('Waiting for the transaction to be finalized.')
    return fail(`Transaction not found on ${m.network}. Check you picked the right network.`)
  }
  if (tx.meta?.err) return fail('Transaction failed on-chain, so nothing was received.')
  const transfers = [...(tx.transaction?.message?.instructions ?? []), ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions)]
    .filter((i) => i.program === 'system' && ['transfer', 'transferWithSeed'].includes(i.parsed?.type) && i.parsed.info?.destination === m.address)
  if (!transfers.length) return fail('This transaction did not pay your deposit address.')
  const lamports = transfers.filter((i) => i.parsed.info.source === from).reduce((s, i) => s + Number(i.parsed.info.lamports), 0)
  if (!lamports) return fail('This transaction was not sent from your registered wallet.')
  return { ok: true, amount: lamports / 1e9 }
}

const VERIFIERS = { 'evm-native': verifyEvm, erc20: verifyEvm, btc: verifyBtc, trc20: verifyTrc20, sol: verifySol }

export function verifyDeposit(method, hash, fromWallet) {
  return VERIFIERS[method.kind](method, hash, fromWallet)
}
