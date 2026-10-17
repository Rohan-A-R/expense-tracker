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

// ---- Brand logos: resolve a company/fund name → domain (Clearbit, keyless, CORS-open) ----
export async function fetchDomainByName(name) {
  if (!name) return null
  return cachedDaily(`domain:${name}`, async () => {
    try {
      const d = await httpGet(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name)}`)
      return Array.isArray(d) && d[0]?.domain ? d[0].domain : null
    } catch { return null }
  })
}

const _hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') || null } catch { return null } }

// Best logo domain for a *stock*. Yahoo's assetProfile.website is authoritative for
// essentially every listed NSE/BSE company (obscure small-caps & PSUs included), where
// Clearbit — a global-brand database — often has no match. So try Yahoo's official website
// first, and only fall back to a Clearbit name lookup if Yahoo has no website on file.
export async function fetchStockDomain(symbol, name) {
  if (symbol) {
    try {
      const f = await fetchStockFundamentals(symbol)   // cachedDaily; reuses the detail-screen fetch
      const dom = _hostOf(f?.website)
      if (dom) return dom
    } catch { /* fall through to Clearbit */ }
  }
  return fetchDomainByName(name)
}

// ---- News: Google News RSS (India), keyless. Native hits Google directly; the browser
// goes through the Vite /gnews proxy (RSS has no CORS headers). Parsed to plain items. ----
// A story's photo, from whichever tag the publisher uses: media:content / media:thumbnail
// (BBC, NDTV), an image <enclosure> (Times of India, Economic Times) or an <img> in the
// description. getElementsByTagName matches the prefixed name in an XML document.
function imageOf(n) {
  const attr = (tag) => [...n.getElementsByTagName(tag)].map(e => e.getAttribute('url')).find(Boolean)
  let url = attr('media:content') || attr('media:thumbnail')
  if (!url) {
    const enc = [...n.getElementsByTagName('enclosure')].find(e => /image/.test(e.getAttribute('type') || 'image'))
    url = enc?.getAttribute('url')
  }
  if (!url) {
    const html = n.querySelector('description')?.textContent || n.getElementsByTagName('content:encoded')[0]?.textContent || ''
    url = html.match(/<img[^>]+src=["']([^"']+)/i)?.[1]
  }
  if (!url || !/^https?:/.test(url)) return null
  if (/ndtvimg\.com/.test(url)) return null        // NDTV's CDN refuses off-site requests (403)
  return url.replace(/&amp;/g, '&')
}

function parseRss(xml, count) {
  const out = []
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    for (const n of doc.querySelectorAll('item')) {
      if (out.length >= count) break
      const source = n.querySelector('source')?.textContent?.trim() || ''
      let title = (n.querySelector('title')?.textContent || '').trim()
      // Google News appends " - Outlet"; publisher feeds don't, and their titles can contain " - "
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3))
      else if (source) title = title.replace(/\s-\s[^-]+$/, '')
      const link = n.querySelector('link')?.textContent?.trim() || ''
      const pub = (n.querySelector('pubDate')?.textContent || n.querySelector('updated')?.textContent || '').trim()
      if (title) out.push({ title, source, link, publishedAt: pub, image: imageOf(n) })
    }
  } catch { /* malformed feed → empty */ }
  return out
}

export async function fetchNews(query, count = 6) {
  if (!query) return []
  return cachedDaily(`news:${query}`, async () => {
    const url = Capacitor.isNativePlatform()
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`
      : `/gnews?q=${encodeURIComponent(query)}`
    const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': YUA }, connectTimeout: 12000, readTimeout: 12000 })
    const xml = typeof res.data === 'string' ? res.data : String(res.data || '')
    return parseRss(xml, count)
  })
}

// ---- The Daily Brief (Home): today's headlines across sections ----
// Google News section feeds, merged: each story tagged with its section, anything older than
// 24 hours dropped, near-duplicate titles removed (the same story runs in several sections).
// Cached for 30 minutes rather than daily — the point is today's news.
// Publisher feeds rather than Google News for the brief: Google's feed carries no images,
// these all do. Order within a feed is the publisher's own (top stories first).
export const NEWS_SECTIONS = [
  { key: 'india', label: 'India', feeds: [
    ['NDTV', 'https://feeds.feedburner.com/ndtvnews-top-stories'],
    ['The Times of India', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms'],
    ['The Hindu', 'https://www.thehindu.com/news/national/feeder/default.rss'],
  ] },
  { key: 'world', label: 'World', feeds: [['BBC', 'https://feeds.bbci.co.uk/news/world/rss.xml']] },
  { key: 'markets', label: 'Markets', feeds: [
    ['The Economic Times', 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'],
    ['BBC', 'https://feeds.bbci.co.uk/news/business/rss.xml'],
  ] },
  { key: 'tech', label: 'Tech', feeds: [
    ['Gadgets 360', 'https://feeds.feedburner.com/gadgets360-latest'],
    ['BBC', 'https://feeds.bbci.co.uk/news/technology/rss.xml'],
  ] },
]
// Some feeds repeat the outlet after the headline in a longer form than <source>
// ("… - GSMArena.com news" for source "GSMArena.com"). Cut a trailing " - …" that names it.
function dropSiteSuffix(title, source) {
  const m = title.match(/^(.*\S)\s+[-–|]\s+([^-–|]+)$/)
  const word = (source || '').split(/[\s.]/)[0].toLowerCase()
  return m && word && m[2].toLowerCase().includes(word) ? m[1] : title
}
let _brief = null
export async function fetchHeadlines({ force = false } = {}) {
  if (!force && _brief && Date.now() - _brief.at < 30 * 60000) return _brief.items
  const jobs = NEWS_SECTIONS.flatMap(sec => sec.feeds.map(([source, feed]) => ({ sec, source, feed })))
  const sets = await Promise.all(jobs.map(async ({ sec, source, feed }) => {
    try {
      const url = Capacitor.isNativePlatform() ? feed : `/news-feed?u=${encodeURIComponent(feed)}`
      const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': YUA }, connectTimeout: 12000, readTimeout: 12000 })
      const xml = typeof res.data === 'string' ? res.data : String(res.data || '')
      return parseRss(xml, 20).map((n, rank) => ({
        ...n, source: n.source || source, title: dropSiteSuffix(n.title, n.source || source), section: sec.key, rank,
      }))
    } catch { return [] }
  }))
  const cutoff = Date.now() - 24 * 3600e3
  const seen = new Set(), items = []
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3).slice(0, 6).join(' ')
  for (const n of sets.flat()) {
    const t = new Date(n.publishedAt).getTime()
    if (!t || t < cutoff) continue
    const k = norm(n.title)
    if (seen.has(k)) continue
    seen.add(k); items.push({ ...n, at: t })
  }
  // Google's own ranking within each section, interleaved across sections (India #1,
  // World #1, Markets #1, Tech #1, India #2…) — the lead is the most important story,
  // not merely the latest, and the list stays mixed.
  const order = Object.fromEntries(NEWS_SECTIONS.map((s, i) => [s.key, i]))
  items.sort((a, b) => a.rank - b.rank || order[a.section] - order[b.section])
  if (!items.length) throw new Error('no headlines')
  _brief = { items, at: Date.now() }
  return items
}

// ---- Annual financial statements (Yahoo fundamentals time-series) ----
// Four fiscal years of income statement, balance sheet and cash flow. No crumb needed.
// Each figure keeps its period end and currency: some Indian companies (Infosys) report
// here in USD, so absolute amounts must never be mixed with ₹ prices without checking.
const ANNUAL_TYPES = {
  revenue: 'annualTotalRevenue', operatingIncome: 'annualOperatingIncome', netIncome: 'annualNetIncome',
  ebit: 'annualEBIT', ebitda: 'annualEBITDA', interestExpense: 'annualInterestExpense',
  netInterestIncome: 'annualNetInterestIncome', dilutedEps: 'annualDilutedEPS',
  operatingCashFlow: 'annualOperatingCashFlow', freeCashFlow: 'annualFreeCashFlow', capex: 'annualCapitalExpenditure',
  totalDebt: 'annualTotalDebt', equity: 'annualStockholdersEquity', totalAssets: 'annualTotalAssets',
  investedCapital: 'annualInvestedCapital', cash: 'annualCashAndCashEquivalents', receivables: 'annualAccountsReceivable',
  currentAssets: 'annualCurrentAssets', currentLiabilities: 'annualCurrentLiabilities', shares: 'annualOrdinarySharesNumber',
}
export async function fetchAnnualStatements(symbol) {
  return cachedDaily(`annual:${symbol}`, async () => {
    const types = Object.values(ANNUAL_TYPES).join(',')
    const now = Math.floor(Date.now() / 1000)
    const d = await httpGet(q(`/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types}&period1=${now - 7 * 365 * 86400}&period2=${now}`))
    const byYear = {}
    let currency = null
    for (const r of d?.timeseries?.result || []) {
      const type = r?.meta?.type?.[0]
      const key = Object.keys(ANNUAL_TYPES).find(k => ANNUAL_TYPES[k] === type)
      if (!key) continue
      for (const x of r[type] || []) {
        if (!x?.reportedValue || x.reportedValue.raw == null) continue
        const end = x.asOfDate
        ;(byYear[end] ||= { end, fy: `FY${end.slice(0, 4)}` })[key] = Number(x.reportedValue.raw)
        currency ||= x.currencyCode || null
      }
    }
    const years = Object.values(byYear).sort((a, b) => a.end.localeCompare(b.end))
    if (!years.length) throw new Error('no annual data')
    return { years, currency, source: 'Yahoo Finance annual statements', fetchedAt: new Date().toISOString() }
  })
}

// ---- Market pulse (index/FX ticker for the Portfolio page) ----
const PULSE = [
  { key: 'nifty', symbol: '^NSEI', label: 'NIFTY 50' },
  { key: 'sensex', symbol: '^BSESN', label: 'SENSEX' },
  { key: 'usdinr', symbol: 'INR=X', label: 'USD / INR' },
]

// Fetch the three market gauges in parallel. Each → { label, price, changePct }.
// A failed one is dropped rather than failing the whole strip.
export async function fetchMarketPulse() {
  const out = await Promise.all(PULSE.map(async (p) => {
    try {
      const d = await httpGet(q(`/v8/finance/chart/${encodeURIComponent(p.symbol)}?interval=1d&range=5d`))
      const m = d?.chart?.result?.[0]?.meta
      const price = num(m?.regularMarketPrice)
      const prev = num(m?.chartPreviousClose ?? m?.previousClose)
      if (price == null) return null
      return { key: p.key, label: p.label, price, changePct: prev ? ((price - prev) / prev) * 100 : null, isFx: p.key === 'usdinr' }
    } catch { return null }
  }))
  return out.filter(Boolean)
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

// quoteSummary modules. The last three feed stock analysis: quarterly results, EPS vs
// analyst estimates, and the next results / ex-dividend dates. (Mirrored in vite.config.js.)
const YF_MODULES = 'summaryDetail,defaultKeyStatistics,financialData,price,assetProfile,earnings,calendarEvents,incomeStatementHistoryQuarterly,recommendationTrend'

export async function fetchStockFundamentals(symbol) {
  return cachedDaily(`fund:${symbol}`, () => _fetchStockFundamentals(symbol))
}
async function _fetchStockFundamentals(symbol) {
  let d
  if (Capacitor.isNativePlatform()) {
    await ensureYahooAuth()
    const mods = YF_MODULES
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
  const raw = (x) => num(x?.raw)

  // Quarterly results, oldest → newest. Taken from incomeStatementHistoryQuarterly, whose
  // endDate is the real quarter end (earnings.financialsChart labels quarters by calendar
  // year — "2Q2026" — which reads wrong against India's April–March financial year).
  const quarters = (r.incomeStatementHistoryQuarterly?.incomeStatementHistory || [])
    .map(q => ({
      end: q.endDate?.fmt || null,
      revenue: raw(q.totalRevenue), netIncome: raw(q.netIncome),
    }))
    .filter(q => q.end && (q.revenue != null || q.netIncome != null))
    .sort((a, b) => a.end.localeCompare(b.end))
  const ec = r.earnings?.earningsChart || {}
  const epsHistory = (ec.quarterly || []).map(q => ({
    quarter: q.date || null, actual: raw(q.actual), estimate: raw(q.estimate),
  })).filter(q => q.actual != null)
  const ce = r.calendarEvents || {}
  const nextEarnings = (ce.earnings?.earningsDate || ec.earningsDate || [])[0]?.fmt || null

  return {
    marketCap: f(pr.marketCap) || f(sd.marketCap),
    marketCapRaw: num(pr.marketCap?.raw ?? sd.marketCap?.raw),   // raw value drives peer size-matching
    pe: f(sd.trailingPE), fwdPe: f(sd.forwardPE),
    eps: f(ks.trailingEps), bookValue: f(ks.bookValue), pb: f(ks.priceToBook),
    divYield: f(sd.dividendYield), beta: f(sd.beta),
    revenue: f(fd.totalRevenue), profitMargin: f(fd.profitMargins), roe: f(fd.returnOnEquity),
    debtToEquity: f(fd.debtToEquity), currentRatio: f(fd.currentRatio), revenueGrowth: f(fd.revenueGrowth),
    recommendation: fd.recommendationKey || null, targetMean: f(fd.targetMeanPrice),
    targetMeanRaw: raw(fd.targetMeanPrice), targetHigh: raw(fd.targetHighPrice), targetLow: raw(fd.targetLowPrice),
    analystCount: raw(fd.numberOfAnalystOpinions),
    // Raw numbers for the research engine (the strings above are for display). Ratios from
    // Yahoo are fractions (0.18 = 18%) except debtToEquity, which Yahoo reports in percent.
    raw: {
      price: raw(fd.currentPrice) ?? raw(pr.regularMarketPrice),
      pe: raw(sd.trailingPE), fwdPe: raw(sd.forwardPE), pb: raw(ks.priceToBook),
      evEbitda: raw(ks.enterpriseToEbitda), eps: raw(ks.trailingEps), bookValue: raw(ks.bookValue),
      profitMargin: raw(fd.profitMargins), operatingMargin: raw(fd.operatingMargins),
      roe: raw(fd.returnOnEquity), roa: raw(fd.returnOnAssets),
      revenueGrowth: raw(fd.revenueGrowth), earningsGrowth: raw(fd.earningsGrowth),
      debtToEquity: raw(fd.debtToEquity), currentRatio: raw(fd.currentRatio),
      beta: raw(sd.beta), divYield: raw(sd.dividendYield),
      freeCashflow: raw(fd.freeCashflow), operatingCashflow: raw(fd.operatingCashflow),
      sharesOut: raw(ks.sharesOutstanding), heldByInsiders: raw(ks.heldPercentInsiders),
    },
    currency: pr.currency || null, financialCurrency: fd.financialCurrency || null,
    // Current month's rating split (period "0m"); older months show how opinion moved.
    ratings: (r.recommendationTrend?.trend || []).map(t => ({
      period: t.period, strongBuy: t.strongBuy ?? 0, buy: t.buy ?? 0, hold: t.hold ?? 0,
      sell: t.sell ?? 0, strongSell: t.strongSell ?? 0,
    })),
    website: ap.website || null,
    sector: ap.sector || null, industry: ap.industry || null,
    employees: ap.fullTimeEmployees ? Number(ap.fullTimeEmployees).toLocaleString('en-IN') : null,
    summary: ap.longBusinessSummary || null,
    quarters, epsHistory, nextEarnings,
    exDividend: ce.exDividendDate?.fmt || null,
  }
}

// ---- Industry peers (Yahoo screener) ----
// Peers are discovered, never hardcoded. Yahoo's own "recommendedSymbols" endpoint is
// useless for this — for TATASTEEL it returns Tata Motors, TCS and ICICI Bank ("people
// also viewed"), not steel companies. The screener, filtered to region=in + the stock's
// exact industry and sorted by market cap, gives the real competitor set.
//
// Size-matching is the point: Ujjivan Small Finance Bank and HDFC Bank share the industry
// label "Banks—Regional", but HDFC is ~89x larger. Callers pick the market-cap
// neighbours (see pickPeers in stockAnalysis.js) rather than the industry giants.
// Peer universe. Yahoo's industry screener now returns nothing to logged-out clients
// (Oct 2026: zero rows for every query), so peers come from the exchange instead: NSE's
// published NIFTY 500 constituent list carries each company's NSE industry. Market caps
// for that industry's members come from one batched Yahoo quote call. The screener is
// still tried first in case it recovers. Nothing here names a stock.
//
// `industry` is Yahoo's label (for the screener); `nseIndustry` is the fallback route
// when the stock itself isn't in the NIFTY 500 (decided by the caller from its sector).
export async function fetchIndustryPeers(industry, { symbol, nseIndustry } = {}) {
  if (!industry && !nseIndustry) return []
  return cachedDaily(`peers:${industry}:${symbol || ''}`, async () => {
    const variants = industry ? [...new Set([
      industry,
      industry.replace(/\s+-\s+/g, '—'),   // " - " → em dash
      industry.replace(/—/g, ' - '),       // em dash → " - "
    ])] : []
    for (const v of variants) {
      try {
        const rows = await _fetchIndustryPeers(v)
        if (rows.length) return rows
      } catch { /* try the next spelling */ }
    }
    // exchange route
    const list = await fetchNseUniverse()
    const base = String(symbol || '').replace(/\.(NS|BO)$/, '').toUpperCase()
    const ind = list.find(r => r.code === base)?.industry || nseIndustry
    if (!ind) return []
    const members = list.filter(r => r.industry === ind).map(r => `${r.code}.NS`)
    const quotes = await fetchQuotes(members)
    return quotes.filter(x => x.marketCap).sort((a, b) => b.marketCap - a.marketCap)
      .map(x => ({ ...x, nseIndustry: ind }))
  })
}

// NSE NIFTY 500 constituents: [{ code, name, industry }]. A small public CSV.
export async function fetchNseUniverse() {
  return cachedDaily('nse500', async () => {
    const src = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv'
    const url = Capacitor.isNativePlatform() ? src : '/nse-csv'
    const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': YUA }, connectTimeout: 12000, readTimeout: 12000 })
    const text = typeof res.data === 'string' ? res.data : String(res.data || '')
    const rows = text.trim().split(/\r?\n/).slice(1).map(line => {
      // "Company Name,Industry,Symbol,Series,ISIN" — names may be quoted and contain commas
      const cells = line.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').trim()) || []
      return { name: cells[0], industry: cells[1], code: (cells[2] || '').toUpperCase() }
    }).filter(r => r.code && r.industry)
    if (rows.length < 100) throw new Error('NSE list unavailable')
    return rows
  })
}

// Batched Yahoo quotes (market cap, name, trailing P/E) — crumb-authenticated.
export async function fetchQuotes(symbols) {
  const out = []
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50).join(',')
    let d
    if (Capacitor.isNativePlatform()) {
      await ensureYahooAuth()
      const res = await CapacitorHttp.get({
        url: `${YQ}/v7/finance/quote?symbols=${encodeURIComponent(chunk)}&fields=marketCap,shortName,longName,trailingPE&crumb=${encodeURIComponent(_yCrumb)}`,
        headers: { 'User-Agent': YUA, Cookie: _yCookie }, connectTimeout: 12000, readTimeout: 12000,
      })
      if (res.status === 401) { _yCookie = null; _yCrumb = null; throw new Error('crumb expired') }
      d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    } else {
      d = await httpGet(`/yahoo-quote?symbols=${encodeURIComponent(chunk)}`)
    }
    for (const qt of d?.quoteResponse?.result || []) {
      out.push({ symbol: qt.symbol, name: qt.shortName || qt.longName || qt.symbol, marketCap: num(qt.marketCap) })
    }
  }
  return out
}

async function _fetchIndustryPeers(industry) {
  const body = {
    size: 250, offset: 0,
    sortField: 'intradaymarketcap', sortType: 'desc', quoteType: 'equity',
    query: {
      operator: 'and',
      operands: [
        { operator: 'eq', operands: ['region', 'in'] },
        { operator: 'eq', operands: ['industry', industry] },
      ],
    },
  }
  let d
  if (Capacitor.isNativePlatform()) {
    await ensureYahooAuth()
    const res = await CapacitorHttp.post({
      url: `${YQ}/v1/finance/screener?crumb=${encodeURIComponent(_yCrumb)}`,
      headers: { 'User-Agent': YUA, Cookie: _yCookie, 'Content-Type': 'application/json' },
      data: body, connectTimeout: 12000, readTimeout: 12000,
    })
    if (res.status === 401) { _yCookie = null; _yCrumb = null; throw new Error('crumb expired') }
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
    d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  } else {
    const res = await CapacitorHttp.post({
      url: '/yahoo-screener', headers: { 'Content-Type': 'application/json' },
      data: body, connectTimeout: 12000, readTimeout: 12000,
    })
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
    d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  }
  const quotes = d?.finance?.result?.[0]?.quotes || []
  // Every company lists on both NSE and BSE — collapse to one row, preferring .NS.
  const byBase = new Map()
  for (const qt of quotes) {
    const sym = qt.symbol
    if (!sym) continue
    const base = sym.replace(/\.(NS|BO)$/, '')
    const prev = byBase.get(base)
    if (prev && !sym.endsWith('.NS')) continue
    byBase.set(base, { symbol: sym, name: qt.shortName || qt.longName || sym, marketCap: num(qt.marketCap) })
  }
  return [...byBase.values()].filter(x => x.marketCap).sort((a, b) => b.marketCap - a.marketCap)
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
  const Q = res.indicators?.quote?.[0] || {}
  const closes = Q.close || []
  // open/high/low/volume ride along for technical analysis (ATR, swing pivots, volume
  // spikes). Charts only read `t`/`close`, so this stays backward-compatible.
  const series = ts.map((t, i) => ({
    t: t * 1000,
    close: num(closes[i]),
    open: num(Q.open?.[i]), high: num(Q.high?.[i]), low: num(Q.low?.[i]),
    volume: num(Q.volume?.[i]),
  // Yahoo fills market holidays (and the not-yet-closed current bar) with 0 on indices
  // and futures — `> 0` drops those, otherwise a trailing 0 reads as "price crashed to nil".
  })).filter(p => p.close != null && p.close > 0)
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
