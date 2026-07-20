import { CapacitorHttp, Capacitor } from '@capacitor/core'

// Native goes straight to Yahoo (CapacitorHttp bypasses CORS). In the browser we route
// through the Vite dev proxy (see vite.config.js) so charts/prices work while previewing.
const YQ = 'https://query1.finance.yahoo.com'
const q = (path) => (Capacitor.isNativePlatform() ? `${YQ}${path}` : `/yfin${path}`)

// In-memory cache that expires at the start of each calendar day — mirrors the once-a-day
// price refresh. Reopening a holding's detail screen reuses today's fetch instead of hitting
// the network again. Cleared on app restart (fine — it only dedupes within a running day).
const _dayCache = new Map()
async function cachedDaily(key, fetcher) {
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const hit = _dayCache.get(key)
  if (hit && hit.at >= startOfToday) return hit.value
  const value = await fetcher()
  _dayCache.set(key, { value, at: Date.now() })
  return value
}

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
  const url = q(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`)
  const d = await httpGet(url)
  const meta = d?.chart?.result?.[0]?.meta
  if (!meta || meta.regularMarketPrice == null) throw new Error('No quote')
  return {
    price: Number(meta.regularMarketPrice),
    prevClose: Number(meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice),
    name: meta.longName || meta.shortName || symbol,
  }
}

export async function searchStock(query) {
  const url = q(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15`)
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

// ---- Detail-screen charts (price history + market stats) ----
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

// ---- Stock fundamentals (Yahoo quoteSummary — needs a cookie+crumb handshake) ----
// Native-only: the handshake and this endpoint are blocked by CORS in a browser.
const YUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
let _yCookie = null, _yCrumb = null

async function ensureYahooAuth() {
  if (_yCookie != null && _yCrumb) return
  const c = await CapacitorHttp.get({ url: 'https://fc.yahoo.com', headers: { 'User-Agent': YUA }, connectTimeout: 12000, readTimeout: 12000 })
  const h = c.headers || {}
  const raw = h['set-cookie'] || h['Set-Cookie'] || ''
  const arr = Array.isArray(raw) ? raw : [raw]
  _yCookie = arr.map(s => String(s).split(';')[0]).filter(Boolean).join('; ')
  const cr = await CapacitorHttp.get({ url: 'https://query1.finance.yahoo.com/v1/test/getcrumb', headers: { 'User-Agent': YUA, Cookie: _yCookie }, connectTimeout: 12000, readTimeout: 12000 })
  _yCrumb = (typeof cr.data === 'string' ? cr.data : String(cr.data || '')).trim()
  if (!_yCrumb || _yCrumb.length > 60) { _yCrumb = null; throw new Error('No crumb') }
}

export async function fetchStockFundamentals(symbol) {
  return cachedDaily(`fund:${symbol}`, () => _fetchStockFundamentals(symbol))
}
async function _fetchStockFundamentals(symbol) {
  let d
  if (Capacitor.isNativePlatform()) {
    await ensureYahooAuth()
    const mods = 'summaryDetail,defaultKeyStatistics,financialData,price,assetProfile'
    const url = `${YQ}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(_yCrumb)}`
    const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': YUA, Cookie: _yCookie }, connectTimeout: 12000, readTimeout: 12000 })
    if (res.status === 401) { _yCookie = null; _yCrumb = null; throw new Error('crumb expired') }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
    d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  } else {
    // browser: Vite middleware handles the cookie+crumb handshake server-side
    d = await httpGet(`/yahoo-fundamentals?symbol=${encodeURIComponent(symbol)}`)
  }
  const r = d?.quoteSummary?.result?.[0]
  if (!r) throw new Error('No data')
  const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, pr = r.price || {}, ap = r.assetProfile || {}
  const f = (x) => x?.fmt ?? null
  return {
    marketCap: f(pr.marketCap) || f(sd.marketCap),
    pe: f(sd.trailingPE), fwdPe: f(sd.forwardPE),
    eps: f(ks.trailingEps), bookValue: f(ks.bookValue), pb: f(ks.priceToBook),
    divYield: f(sd.dividendYield), beta: f(sd.beta),
    revenue: f(fd.totalRevenue), profitMargin: f(fd.profitMargins), roe: f(fd.returnOnEquity),
    debtToEquity: f(fd.debtToEquity), currentRatio: f(fd.currentRatio), revenueGrowth: f(fd.revenueGrowth),
    recommendation: fd.recommendationKey || null, targetMean: f(fd.targetMeanPrice),
    sector: ap.sector || null, industry: ap.industry || null,
    employees: ap.fullTimeEmployees ? Number(ap.fullTimeEmployees).toLocaleString('en-IN') : null,
    summary: ap.longBusinessSummary || null,
  }
}

// Yahoo range → granularity. Coarser bars for longer spans keep payloads small.
const STOCK_RANGE = {
  '1M': { range: '1mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  'MAX': { range: 'max', interval: '1mo' },
}

// One stock's price series for a range + a snapshot of its market stats.
export async function fetchStockChart(symbol, rangeId = '6M') {
  return cachedDaily(`chart:${symbol}:${rangeId}`, () => _fetchStockChart(symbol, rangeId))
}
async function _fetchStockChart(symbol, rangeId = '6M') {
  const cfg = STOCK_RANGE[rangeId] || STOCK_RANGE['6M']
  const d = await httpGet(q(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`))
  const res = d?.chart?.result?.[0]
  if (!res) throw new Error('No chart')
  const ts = res.timestamp || []
  const closes = res.indicators?.quote?.[0]?.close || []
  const series = ts.map((t, i) => ({ t: t * 1000, close: num(closes[i]) })).filter(p => p.close != null)
  const m = res.meta || {}
  return {
    series,
    meta: {
      price: num(m.regularMarketPrice),
      prevClose: num(m.chartPreviousClose ?? m.previousClose),
      dayHigh: num(m.regularMarketDayHigh), dayLow: num(m.regularMarketDayLow),
      weekHigh52: num(m.fiftyTwoWeekHigh), weekLow52: num(m.fiftyTwoWeekLow),
      volume: num(m.regularMarketVolume),
      name: m.longName || m.shortName || symbol,
      exchange: m.fullExchangeName || m.exchangeName || null,
    },
  }
}

// A mutual fund's full NAV history (oldest-first) + fund info. One call covers every
// range — the detail screen filters this client-side, so switching ranges is instant.
export async function fetchMfSeries(schemeCode) {
  return cachedDaily(`mf:${schemeCode}`, () => _fetchMfSeries(schemeCode))
}
async function _fetchMfSeries(schemeCode) {
  const d = await httpGet(`https://api.mfapi.in/mf/${schemeCode}`)
  const data = d?.data || []
  const series = data
    .map(x => ({ t: parseDMY(x.date).getTime(), close: Number(x.nav) }))
    .filter(p => p.close && Number.isFinite(p.t))
    .reverse() // oldest-first for the chart
  const latest = series[series.length - 1], prev = series[series.length - 2]
  return {
    series,
    meta: {
      price: latest?.close ?? null,
      prevClose: prev?.close ?? latest?.close ?? null,
      name: d?.meta?.scheme_name || String(schemeCode),
      fundHouse: d?.meta?.fund_house || null,
      category: d?.meta?.scheme_category || null,
      schemeType: d?.meta?.scheme_type || null,
      navDate: data[0]?.date || null,
    },
  }
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
  const fx = await httpGet(q('/v8/finance/chart/INR=X?interval=1d&range=5d'))
  const usdInr = Number(fx?.chart?.result?.[0]?.meta?.regularMarketPrice)
  if (!usdInr) throw new Error('No FX rate')
  const out = {}
  await Promise.all(wanted.map(async (m) => {
    try {
      const d = await httpGet(q(`/v8/finance/chart/${METAL_SYMBOL[m]}?interval=1d&range=5d`))
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
