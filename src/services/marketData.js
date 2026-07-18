import { CapacitorHttp } from '@capacitor/core'

// Native calls go through CapacitorHttp (bypasses CORS). On web it delegates to
// fetch — mfapi.in allows CORS so MF works in the browser; Yahoo does not, so
// stock prices only refresh reliably inside the installed app.
async function httpGet(url) {
  const res = await CapacitorHttp.get({
    url,
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    connectTimeout: 12000,
    readTimeout: 12000,
  })
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
}

// ---- Stocks (Yahoo Finance, unofficial) ----
// symbol e.g. "RELIANCE.NS" (NSE) or "TCS.BO" (BSE)
export async function fetchStockQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const d = await httpGet(url)
  const meta = d?.chart?.result?.[0]?.meta
  if (!meta || meta.regularMarketPrice == null) throw new Error('No quote')
  return {
    price: Number(meta.regularMarketPrice),
    prevClose: Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice),
    name: meta.longName || meta.shortName || symbol,
  }
}

export async function searchStock(q) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15`
  const d = await httpGet(url)
  return (d?.quotes || [])
    .filter(x => x.symbol && (x.symbol.endsWith('.NS') || x.symbol.endsWith('.BO')))
    .slice(0, 12)
    .map(x => ({ symbol: x.symbol, name: x.shortname || x.longname || x.symbol }))
}

// ---- Mutual funds (mfapi.in → AMFI daily NAV, free & official) ----
export async function searchMf(q) {
  const d = await httpGet(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`)
  return Array.isArray(d)
    ? d.slice(0, 15).map(x => ({ schemeCode: String(x.schemeCode), name: x.schemeName }))
    : []
}

export async function fetchMfNav(schemeCode) {
  const d = await httpGet(`https://api.mfapi.in/mf/${schemeCode}`)
  const latest = d?.data?.[0]
  if (!latest) throw new Error('No NAV')
  return {
    price: Number(latest.nav),
    prevClose: Number(d.data[1]?.nav ?? latest.nav),
    name: d?.meta?.scheme_name || schemeCode,
    date: latest.date,
  }
}

// Full NAV history (newest-first), for pricing past SIP installments
const parseDMY = (s) => { const [d, m, y] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export async function fetchMfHistory(schemeCode) {
  const d = await httpGet(`https://api.mfapi.in/mf/${schemeCode}`)
  const history = (d?.data || []).map(x => ({ date: parseDMY(x.date), nav: Number(x.nav) }))
  return { name: d?.meta?.scheme_name || schemeCode, history }
}

// NAV on the given date, or the closest trading day before it (history is newest-first)
export function navOnOrBefore(history, target) {
  for (const h of history) if (h.date <= target) return h.nav
  return history.length ? history[history.length - 1].nav : null
}

// ---- Precious metals (international spot via Yahoo futures, converted to ₹/gram) ----
// Not Indian retail (which adds duty/GST/making) but a live market-linked rate that
// moves day to day — enough to make metal holdings grow like the rest of the portfolio.
const TROY_OZ_G = 31.1034768
const METAL_SYMBOL = { gold: 'GC=F', silver: 'SI=F', platinum: 'PL=F' }

// Fetch ₹/gram (pure) for the requested metals. USD/INR fetched once and shared.
export async function fetchMetalRates(metals = ['gold']) {
  const wanted = [...new Set(metals)].filter(m => METAL_SYMBOL[m])
  if (!wanted.length) return {}
  const fx = await httpGet('https://query1.finance.yahoo.com/v8/finance/chart/INR=X?interval=1d&range=5d')
  const usdInr = Number(fx?.chart?.result?.[0]?.meta?.regularMarketPrice)
  if (!usdInr) throw new Error('No FX rate')
  const out = {}
  await Promise.all(wanted.map(async (m) => {
    try {
      const d = await httpGet(`https://query1.finance.yahoo.com/v8/finance/chart/${METAL_SYMBOL[m]}?interval=1d&range=5d`)
      const oz = Number(d?.chart?.result?.[0]?.meta?.regularMarketPrice)
      const prev = Number(d?.chart?.result?.[0]?.meta?.chartPreviousClose ?? oz)
      if (oz) out[m] = { perGram: (oz / TROY_OZ_G) * usdInr, prevPerGram: (prev / TROY_OZ_G) * usdInr, at: Date.now() }
    } catch { /* skip this metal, keep others */ }
  }))
  return out
}

// Unique cache key per holding
export const priceKey = (h) => h.kind === 'mf' ? `mf:${h.schemeCode}` : h.symbol

// Fetch the latest price for one holding
export async function fetchHoldingPrice(h) {
  const q = h.kind === 'mf' ? await fetchMfNav(h.schemeCode) : await fetchStockQuote(h.symbol)
  return { price: q.price, prevClose: q.prevClose, at: Date.now() }
}
