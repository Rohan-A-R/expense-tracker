import { priceKey } from '../services/marketData'

// Which asset types count as bank/cash vs other savings vs liabilities.
// `dynamic` types compute their value live (gold rate / interest / amortization).
export const ASSET_TYPES = [
  { id: 'metal', label: 'Metal',        icon: '🥇', group: 'others', liability: false, dynamic: true },
  { id: 'fd',    label: 'Fixed deposit', icon: '🔒', group: 'others', liability: false, dynamic: true },
  { id: 'other', label: 'Other asset',  icon: '📦', group: 'others', liability: false },
  { id: 'loan',  label: 'Loan / due',   icon: '💳', group: 'loans',  liability: true,  dynamic: true },
]
// Legacy 'bank'/'cash' entries (from before these were removed) fall back to "Other".
export const typeMeta = (id) => ASSET_TYPES.find(t => t.id === id) || ASSET_TYPES.find(t => t.id === 'other')

// Precious metals under one "Metal" type — the specific metal is stored on `a.metal`.
// Yahoo futures symbol + selectable purities (fineness factor).
export const METALS = {
  gold:     { label: 'Gold',     icon: '🥇', symbol: 'GC=F', purities: [{ code: '24', label: '24K', f: 1 }, { code: '22', label: '22K', f: 0.9167 }, { code: '18', label: '18K', f: 0.75 }] },
  silver:   { label: 'Silver',   icon: '🥈', symbol: 'SI=F', purities: [{ code: '999', label: '999 fine', f: 0.999 }, { code: '925', label: '925 sterling', f: 0.925 }] },
  platinum: { label: 'Platinum', icon: '⚪', symbol: 'PL=F', purities: [{ code: '950', label: '950', f: 0.95 }, { code: '900', label: '900', f: 0.90 }] },
}
// Metal id for an asset — supports the current `type:'metal'` model and legacy per-metal types.
export const assetMetal = (a) => a.type === 'metal' ? a.metal : (METALS[a.type] ? a.type : null)
export const isMetalAsset = (a) => !!assetMetal(a)
export const finenessOf = (a) => {
  const p = METALS[assetMetal(a)]?.purities.find(x => x.code === String(a.purity))
  return p ? p.f : 1
}

function daysSince(startDate) {
  if (!startDate) return 0
  const s = new Date(startDate + 'T00:00:00').getTime()
  return Math.max(0, (Date.now() - s) / 86400000)
}

// Metal value = grams × fineness × live ₹/gram (pure). Falls back to a stored value
// if the rate for that metal isn't loaded yet.
export function metalValue(a, metalRates) {
  const g = Number(a.grams) || 0
  if (!g) return Number(a.value) || 0
  const rate = metalRates?.[assetMetal(a)]?.perGram
  if (!rate) return Number(a.value) || 0
  return g * finenessOf(a) * rate
}

// FD: principal compounded quarterly (the Indian norm) from its start date.
export function fdValue(a) {
  const p = Number(a.principal) || 0
  const r = Number(a.rate) || 0
  if (!p) return 0
  if (!r) return p
  const years = daysSince(a.startDate) / 365.25
  return p * Math.pow(1 + (r / 100) / 4, 4 * years)
}

// Loan: outstanding after k monthly EMIs since start (standard amortization).
// `principal` is the balance at the start date. Without rate+EMI it stays flat.
export function loanOutstanding(a) {
  const p = Number(a.principal) || 0
  if (!p) return 0
  const r = (Number(a.rate) || 0) / 100 / 12
  const e = Number(a.emi) || 0
  if (!r || !e) return p
  const k = Math.floor(daysSince(a.startDate) / 30.4375)
  if (k <= 0) return p
  const grown = p * Math.pow(1 + r, k)
  const paid = e * ((Math.pow(1 + r, k) - 1) / r)
  return Math.max(0, Math.min(grown - paid, grown))
}

// The current value of any asset. `ctx.metalRates` = { gold|silver|platinum: { perGram } }.
export function assetValue(a, ctx = {}) {
  if (isMetalAsset(a)) return metalValue(a, ctx.metalRates)
  switch (a.type) {
    case 'fd':   return fdValue(a)
    case 'loan': return loanOutstanding(a)
    default:     return Number(a.value) || 0
  }
}

// Compute net worth + breakdown from live state.
// Investments use the last-known price; holdings without a price fall back to
// their invested amount so the figure never blank-flashes to zero before prices load.
export function computeNetWorth({ holdings = [], prices = {}, assets = [], udhaar = [], metalRates = {} }) {
  let investments = 0
  holdings.forEach(h => {
    const p = prices[priceKey(h)]
    investments += p ? Number(h.qty) * p.price : Number(h.qty) * Number(h.avgBuy)
  })

  let bankCash = 0, others = 0, loans = 0
  assets.forEach(a => {
    const g = typeMeta(a.type).group
    const v = assetValue(a, { metalRates })
    if (g === 'bankCash') bankCash += v
    else if (g === 'others') others += v
    else if (g === 'loans') loans += v
  })

  // Net per person first (same-person debts genuinely cancel), then split into
  // receivable / payable — matches the Udhaar ledger's TO COLLECT / TO PAY totals.
  const open = udhaar.filter(u => u.status === 'open')
  const perPerson = {}
  open.forEach(u => {
    perPerson[u.person] = (perPerson[u.person] || 0) + (u.direction === 'lent' ? Number(u.amount) : -Number(u.amount))
  })
  const nets = Object.values(perPerson)
  const udhaarReceivable = nets.reduce((s, n) => s + Math.max(n, 0), 0)
  const udhaarPayable = nets.reduce((s, n) => s + Math.max(-n, 0), 0)
  const udhaarNet = udhaarReceivable - udhaarPayable

  const assetsTotal = investments + bankCash + others + udhaarReceivable
  const liabilities = loans + udhaarPayable
  const total = assetsTotal - liabilities

  return { total, investments, bankCash, others, loans, udhaarNet, udhaarReceivable, udhaarPayable, assetsTotal, liabilities }
}
