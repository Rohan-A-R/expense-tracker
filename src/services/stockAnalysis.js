// Stock analysis — gathers everything about a stock AND its context, then formats it
// into one plain-text block for the model.
//
// The guiding rule (same as aiContext.js): **the model never calculates.** Technical
// indicators, peer comparisons, driver moves and relative strength are all computed here
// in JS and handed over as finished figures. The model's only job is to interpret them.
//
// "Context" is the point. A stock in isolation says little — the report needs the sector,
// the input commodities, the direct competitors, the macro backdrop and what has changed
// in the news. `sectorPlaybook.js` decides which of those matter for this particular
// industry (iron ore for steel, RBI policy for a bank, USD-INR for IT).
//
// Everything is failure-tolerant: any one source dying degrades the report rather than
// breaking it, and anything missing is reported as "not available" so the model can't
// quietly invent it.

import { fetchStockChart, fetchStockFundamentals, fetchNews, fetchIndustryPeers } from './marketData'
import { aiComplete } from './aiClient'
import { playbookFor } from './sectorPlaybook'
import { computeTechnicals, returns as trailingReturns, averageReturns, diffReturns } from '../utils/technicals'

const NEWS_PER_QUERY = 5
const PEER_COUNT = 4
const settle = (p, fallback = null) => p.then(v => v, () => fallback)

/**
 * Choose comparable peers from a full industry list: the stock's nearest neighbours by
 * market cap, not the industry's biggest names.
 *
 * Ranking by size alone would hand a ₹12,000 cr small finance bank the likes of HDFC and
 * SBI — same industry label, ~89x the size, useless as a comparison. Taking the rows
 * either side of the stock's own market cap yields companies actually in its league.
 * The industry leader is appended separately as context, clearly labelled as such.
 */
export function pickPeers(all, symbol, ownMarketCap, count = PEER_COUNT) {
  const rows = all.filter(p => p.symbol.toUpperCase() !== String(symbol || '').toUpperCase())
  if (!rows.length) return { peers: [], leader: null, rank: null, total: 0 }

  const self = all.findIndex(p => p.symbol.toUpperCase() === String(symbol || '').toUpperCase())
  const mc = ownMarketCap || (self >= 0 ? all[self].marketCap : null)
  const leader = rows[0]

  let peers
  if (!mc) {
    peers = rows.slice(0, count)                    // no size info → fall back to the majors
  } else {
    // nearest by ratio, so "half my size" and "twice my size" count as equally close
    peers = [...rows]
      .sort((a, b) => Math.abs(Math.log(a.marketCap / mc)) - Math.abs(Math.log(b.marketCap / mc)))
      .slice(0, count)
      .sort((a, b) => b.marketCap - a.marketCap)
  }
  return {
    peers,
    leader: peers.some(p => p.symbol === leader.symbol) ? null : leader,
    rank: self >= 0 ? self + 1 : null,
    total: all.length,
  }
}

// ---- earnings trend: growth, margins and estimate beats, all precomputed ----
const pctChange = (a, b) => (a != null && b ? Number((((a - b) / Math.abs(b)) * 100).toFixed(1)) : null)
const cr = (v) => (v == null ? null : Math.round(v / 1e7))          // rupees → crore

export function earningsSummary(fund) {
  const q = fund?.quarters || []
  if (!q.length) return null
  const rows = q.map((x, i) => ({
    end: x.end,
    revenueCr: cr(x.revenue), profitCr: cr(x.netIncome),
    marginPct: x.revenue && x.netIncome != null ? Number(((x.netIncome / x.revenue) * 100).toFixed(1)) : null,
    revQoQ: i ? pctChange(x.revenue, q[i - 1].revenue) : null,
    profitQoQ: i ? pctChange(x.netIncome, q[i - 1].netIncome) : null,
  }))
  const first = q[0], latest = q[q.length - 1]
  const eps = (fund.epsHistory || []).map(e => ({
    ...e, surprisePct: pctChange(e.actual, e.estimate),
    result: e.estimate == null ? null : e.actual >= e.estimate ? 'beat' : 'miss',
  }))
  return {
    rows,
    // span of the available history (usually 4 quarters → 3 quarters of change)
    revOverSpan: pctChange(latest.revenue, first.revenue),
    profitOverSpan: pctChange(latest.netIncome, first.netIncome),
    spanFrom: first.end, spanTo: latest.end,
    eps, beats: eps.filter(e => e.result === 'beat').length, misses: eps.filter(e => e.result === 'miss').length,
    nextEarnings: fund.nextEarnings || null,
    exDividend: fund.exDividend || null,
  }
}

// ---- the user's own position in this stock ----
// Everything here is arithmetic on data the app already holds; the model only explains it.
export function positionSummary(pos, price, tech) {
  if (!pos || !pos.qty || !price) return null
  const qty = Number(pos.qty), avg = Number(pos.avgBuy)
  const invested = qty * avg, value = qty * price
  const atr = tech?.atr
  const support = tech?.levels?.support?.[0]?.price ?? null
  return {
    qty, avgBuy: avg,
    invested: Math.round(invested), value: Math.round(value),
    pnl: Math.round(value - invested),
    pnlPct: avg ? Number((((price - avg) / avg) * 100).toFixed(2)) : null,
    weightPct: pos.portfolioValue ? Number(((value / pos.portfolioValue) * 100).toFixed(1)) : null,
    portfolioHoldings: pos.holdingsCount || null,
    // Reference levels only — a 2×ATR stop is a common volatility-based convention, and the
    // nearest support is where buyers have stepped in before. Neither is a recommendation.
    stop2Atr: atr ? Number((price - 2 * atr).toFixed(2)) : null,
    nearestSupport: support,
    pctToSupport: support ? Number((((support - price) / price) * 100).toFixed(2)) : null,
  }
}

// ---- news hygiene: newest first, stale items dropped, age attached ----
const NEWS_MAX_AGE_DAYS = 120
function freshNews(items, now = Date.now()) {
  return (items || [])
    .map(it => {
      const t = Date.parse(it.publishedAt || '')
      return { ...it, t: Number.isFinite(t) ? t : null, ageDays: Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null }
    })
    .filter(it => it.ageDays == null || it.ageDays <= NEWS_MAX_AGE_DAYS)
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
}

// ---- one symbol's price series + trailing returns (used for peers and drivers) ----
async function briefFor(symbol, label) {
  const c = await fetchStockChart(symbol, '1Y')
  const closes = c.series.map(p => p.close)
  return {
    symbol, label: label || c.meta?.name || symbol,
    price: c.meta?.price ?? closes[closes.length - 1] ?? null,
    returns: trailingReturns(closes),
    closes,
  }
}

/**
 * Gather the full context for one stock.
 * @param {string} symbol e.g. "TATASTEEL.NS"
 * @param {string} [name]
 * @param {(step:string)=>void} [onProgress] called with a human label per stage
 * @param {{qty:number, avgBuy:number, portfolioValue?:number, holdingsCount?:number}} [position]
 *        the user's own holding, if they own it — turns the report personal
 */
export async function gatherStockContext(symbol, name, onProgress = () => {}, position = null) {
  onProgress('Fetching price history…')
  const [chart, fund] = await Promise.all([
    fetchStockChart(symbol, '1Y'),                  // 1Y so 200-DMA and 52w stats are real
    settle(fetchStockFundamentals(symbol)),
  ])
  const closes = chart.series.map(p => p.close)
  const meta = chart.meta || {}
  const displayName = name || meta.name || symbol

  // Sector routing — decides what *drivers and topics* this stock needs.
  const pb = playbookFor({ sector: fund?.sector, industry: fund?.industry })

  onProgress(pb.generic ? 'Loading market context…' : `Loading ${pb.name} sector context…`)

  // Peers are discovered from the live industry screener, then narrowed to this stock's
  // own market-cap band — never hardcoded, so any stock on any exchange is covered.
  const universe = await settle(fetchIndustryPeers(fund?.industry), [])
  const picked = pickPeers(universe || [], symbol, fund?.marketCapRaw)
  const peerSymbols = [...picked.peers, ...(picked.leader ? [{ ...picked.leader, isLeader: true }] : [])]

  const [peers, drivers, nifty] = await Promise.all([
    Promise.all(peerSymbols.map(p => settle(briefFor(p.symbol, p.name)))),
    Promise.all(pb.drivers.map(d => settle(briefFor(d.symbol, d.label)))),
    settle(briefFor('^NSEI', 'NIFTY 50')),
  ])

  // Peer valuations — P/E only, so one extra call each and failures are harmless.
  const peerFund = await Promise.all(
    peers.filter(Boolean).map(p => settle(fetchStockFundamentals(p.symbol)))
  )

  onProgress('Reading the news…')
  const queries = [`${displayName} share news`, ...(pb.research || [])]
  const newsSets = await Promise.all(queries.map(q => settle(fetchNews(q, NEWS_PER_QUERY), [])))

  onProgress('Crunching the numbers…')
  const tech = computeTechnicals(chart.series, meta)

  // Relative strength. Most NIFTY sectoral indices carry no history on Yahoo, so the
  // sector benchmark is a synthetic equal-weighted basket of the peer stocks — which is
  // arguably the fairer comparison anyway ("did I beat my actual competitors?").
  const selfRet = trailingReturns(closes)
  // The industry leader rides along as context but is excluded from the basket average —
  // otherwise a mega-cap would swamp the comparison it was added to avoid.
  const livePeers = peers.filter((p, i) => p && !peerSymbols[i]?.isLeader)
  const peerAvg = livePeers.length ? averageReturns(livePeers.map(p => p.returns)) : null
  const rsSector = peerAvg ? diffReturns(selfRet, peerAvg) : null
  const rsNifty = nifty ? diffReturns(selfRet, nifty.returns) : null

  const price = meta.price ?? closes[closes.length - 1] ?? null

  return {
    asOf: new Date(),
    symbol, name: displayName,
    price,
    // NOT meta.prevClose — on a ranged chart Yahoo's chartPreviousClose is the close
    // *before the whole range*, so on a 1Y fetch it reads as a year-old price and makes
    // the stock look like it gapped 30%. The previous bar in the series is the real one.
    prevClose: closes.length > 1 ? closes[closes.length - 2] : null,
    exchange: meta.exchange || null,
    sector: fund?.sector || null,
    industry: fund?.industry || null,
    playbook: pb,
    fundamentals: fund,
    earnings: earningsSummary(fund),
    position: positionSummary(position, price, tech),
    technicals: tech,
    peers: peers.map((p, i) => p && {
      ...p, fund: peerFund[i],
      marketCap: peerSymbols[i]?.marketCap ?? null,
      isLeader: !!peerSymbols[i]?.isLeader,
    }).filter(Boolean),
    industryRank: picked.rank, industryCount: picked.total,
    drivers: drivers.filter(Boolean),
    nifty,
    relStrength: { sector: rsSector, peerAvg, peerCount: livePeers.length, nifty: rsNifty },
    news: queries.map((q, i) => ({ query: q, items: freshNews(newsSets[i]) })),
  }
}

// ---------- formatting ----------
const NA = 'not available'
const n = (v, suffix = '') => (v == null ? NA : `${v}${suffix}`)
const pct = (v) => (v == null ? NA : `${v > 0 ? '+' : ''}${v}%`)
const money = (v) => (v == null ? NA : `₹${Number(v).toLocaleString('en-IN')}`)
const retLine = (r) => (!r ? NA : ['1W', '1M', '3M', '6M', '1Y'].map(k => `${k} ${pct(r[k])}`).join(' · '))

/**
 * Render the gathered context as the plain-text block handed to the model.
 * Every figure here is already computed — the model only reads and interprets.
 */
export function formatContext(c) {
  const L = []
  const P = (s = '') => L.push(s)

  P(`STOCK: ${c.name} (${c.symbol})${c.exchange ? ` · ${c.exchange}` : ''}`)
  P(`As of: ${c.asOf.toDateString()}`)
  const dayPct = c.prevClose ? ((c.price - c.prevClose) / c.prevClose) * 100 : null
  P(`Price: ${money(c.price)}${dayPct != null ? `  (${pct(Number(dayPct.toFixed(2)))} vs previous close ${money(c.prevClose)})` : ''}`)
  P(`Sector: ${c.sector || NA} · Industry: ${c.industry || NA}`)
  if (c.fundamentals?.marketCapRaw) P(`Market cap: ₹${Math.round(c.fundamentals.marketCapRaw / 1e7).toLocaleString('en-IN')} cr`)
  P()

  // ---- the reader's own holding ----
  const pos = c.position
  P('=== YOUR POSITION (the reader owns this stock; computed, do not recalculate) ===')
  if (!pos) P('The reader does not hold this stock.')
  else {
    P(`Holding ${pos.qty} shares at average cost ${money(pos.avgBuy)} · invested ${money(pos.invested)} · now worth ${money(pos.value)}`)
    P(`Unrealised P&L: ${pos.pnl >= 0 ? '+' : '−'}${money(Math.abs(pos.pnl))} (${pct(pos.pnlPct)})`)
    if (pos.weightPct != null) P(`Share of total portfolio: ${pos.weightPct}%${pos.portfolioHoldings ? ` (across ${pos.portfolioHoldings} holdings)` : ''}`)
    P(`Reference levels: 2×ATR below price = ${money(pos.stop2Atr)} · nearest support ${money(pos.nearestSupport)} (${pct(pos.pctToSupport)} from price)`)
  }
  P()

  // ---- technicals ----
  const t = c.technicals
  P('=== TECHNICALS (computed, do not recalculate) ===')
  if (!t) P(`Not enough price history to compute indicators.`)
  else {
    P(`Trailing returns: ${retLine(t.returns)}`)
    P(`52-week high ${money(t.high52)} (${pct(t.fromHigh52Pct)} from it) · low ${money(t.low52)} (${pct(t.fromLow52Pct)} from it)`)
    P(`Max drawdown over the year: ${pct(t.maxDrawdownPct)}`)
    P(`Moving averages: 20DMA ${n(t.sma20)} · 50DMA ${n(t.sma50)} · 200DMA ${n(t.sma200)}`)
    P(`  price ${t.aboveSma50 ? 'ABOVE' : 'BELOW'} 50DMA · ${t.aboveSma200 ? 'ABOVE' : 'BELOW'} 200DMA · ${t.goldenCross ? 'golden cross (50>200)' : 'death cross (50<200)'}`)
    P(`RSI(14): ${n(t.rsi)} — ${t.rsiZone || NA}`)
    if (t.macd) P(`MACD: ${t.macd.trend}, histogram ${t.macd.hist}${t.macd.crossedDaysAgo != null ? `, crossed ${t.macd.crossedDaysAgo} trading days ago` : ''}`)
    if (t.bollinger) P(`Bollinger(20,2): upper ${t.bollinger.upper} / mid ${t.bollinger.mid} / lower ${t.bollinger.lower} · %B ${n(t.bollinger.pctB)} · bandwidth ${n(t.bollinger.bandwidthPct, '%')}`)
    P(`ATR(14): ${n(t.atr)} (${n(t.atrPct, '%')} of price) — typical daily range`)
    const s = t.levels.support.map(x => `${money(x.price)} (${x.touches}x)`).join(', ')
    const r = t.levels.resistance.map(x => `${money(x.price)} (${x.touches}x)`).join(', ')
    P(`Support levels: ${s || NA}`)
    P(`Resistance levels: ${r || NA}`)
    if (t.volume) P(`Volume: ${t.volume.latest?.toLocaleString('en-IN')} vs 20d avg ${t.volume.avg20?.toLocaleString('en-IN')} (${t.volume.ratio}x)${t.volume.spike ? ' — SPIKE' : ''}`)
  }
  P()

  // ---- fundamentals ----
  P('=== FUNDAMENTALS ===')
  const f = c.fundamentals
  if (!f) P(`Not available from the data source for this stock — rely on technicals and sector context, and say so.`)
  else {
    P(`Market cap ${n(f.marketCap)} · P/E ${n(f.pe)} · Forward P/E ${n(f.fwdPe)} · P/B ${n(f.pb)}`)
    P(`EPS ${n(f.eps)} · Book value ${n(f.bookValue)} · Dividend yield ${n(f.divYield)} · Beta ${n(f.beta)}`)
    P(`Revenue ${n(f.revenue)} · Revenue growth ${n(f.revenueGrowth)} · Profit margin ${n(f.profitMargin)} · ROE ${n(f.roe)}`)
    P(`Debt/Equity ${n(f.debtToEquity)} · Current ratio ${n(f.currentRatio)}`)
    P(`Analyst consensus: ${n(f.recommendation)} · mean target ${n(f.targetMean)}`)
    if (f.employees) P(`Employees: ${f.employees}`)
  }
  P()

  // ---- earnings trend ----
  P('=== QUARTERLY RESULTS (computed, do not recalculate) ===')
  const e = c.earnings
  if (!e) P('Quarterly results not available from the data source.')
  else {
    // (the oldest quarter has nothing before it to compare with, so no QoQ figure)
    const qoq = (v) => (v == null ? '' : ` (${pct(v)} QoQ)`)
    for (const r of e.rows) {
      P(`Quarter ending ${r.end}: revenue ₹${n(r.revenueCr?.toLocaleString('en-IN'))} cr${qoq(r.revQoQ)} · net profit ₹${n(r.profitCr?.toLocaleString('en-IN'))} cr${qoq(r.profitQoQ)} · net margin ${n(r.marginPct, '%')}`)
    }
    P(`From ${e.spanFrom} to ${e.spanTo}: revenue ${pct(e.revOverSpan)} · net profit ${pct(e.profitOverSpan)}`)
    if (e.eps.length) {
      P(`EPS vs analyst estimates: ${e.beats} beat, ${e.misses} missed of last ${e.eps.length} quarters`)
      for (const x of e.eps) P(`  ${x.quarter}: actual ${x.actual} vs estimate ${n(x.estimate)} → ${x.result || 'n/a'} (${pct(x.surprisePct)})`)
    }
    P(`Next results date: ${e.nextEarnings || NA}${e.exDividend ? ` · last ex-dividend ${e.exDividend}` : ''}`)
  }
  P()

  // ---- sector & relative strength ----
  P('=== SECTOR CONTEXT ===')
  P(`Playbook: ${c.playbook.name}${c.playbook.generic ? ' (generic — industry not specifically mapped)' : ''}`)
  if (c.relStrength.peerAvg) {
    P(`Peer-basket average return (${c.relStrength.peerCount} competitors): ${retLine(c.relStrength.peerAvg)}`)
    P(`Relative strength vs that peer basket: ${retLine(c.relStrength.sector)}   (positive = beating its competitors)`)
  }
  if (c.relStrength.nifty) P(`Relative strength vs NIFTY 50: ${retLine(c.relStrength.nifty)}`)
  P()

  // ---- drivers ----
  P('=== SECTOR DRIVERS (commodities / indices / FX) ===')
  if (!c.drivers.length) P(NA)
  for (const d of c.drivers) P(`${d.label} (${d.symbol}): ${d.price} · ${retLine(d.returns)}`)
  P()

  // ---- peers ----
  P('=== PEER COMPARISON ===')
  if (!c.peers.length) P('No peers found for this industry.')
  else {
    if (c.industryRank) P(`Size rank: #${c.industryRank} of ${c.industryCount} listed Indian companies in this industry.`)
    P('Peers below are the closest matches by market cap — comparable businesses, not the industry giants.')
    for (const p of c.peers) {
      const pe = p.fund?.pe ? `P/E ${p.fund.pe}` : 'P/E n/a'
      const cap = p.marketCap ? `₹${Math.round(p.marketCap / 1e7).toLocaleString('en-IN')} cr` : 'cap n/a'
      P(`${p.isLeader ? '[industry leader, for context] ' : ''}${p.label} (${p.symbol}): ${money(p.price)} · ${cap} · ${pe} · ${retLine(p.returns)}`)
    }
  }
  P()

  // ---- news ----
  P(`=== NEWS & DEVELOPMENTS (headlines, newest first, max ${NEWS_MAX_AGE_DAYS} days old) ===`)
  P('Each headline shows its age. Weight recent news most; anything over ~30 days old is background, not a current event.')
  for (const grp of c.news) {
    if (!grp.items.length) continue
    P(`— on "${grp.query}":`)
    for (const it of grp.items) {
      const when = it.t
        ? `${new Date(it.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${it.ageDays === 0 ? 'under 1d ago' : `${it.ageDays}d ago`}`
        : 'date unknown'
      P(`  • [${when}] ${it.title}${it.source ? ` (${it.source})` : ''}`)
    }
  }
  P()
  return L.join('\n')
}

// How many characters the assembled context runs to — useful while tuning.
export const contextSize = (s) => `${s.length} chars ≈ ${Math.round(s.length / 4)} tokens`

// ---------- the prompt ----------
// Strict about two things: never invent a figure, and never do arithmetic. Everything
// numeric is already in the context; the model's job is judgement and explanation.
const RULES = `
You are a sober equity research analyst writing for a retail investor in India.

HARD RULES
- Use ONLY the data below. Never invent a number, a date, a ratio or an event.
- Do NOT calculate anything. Every figure you need is already computed — quote it as given.
- If something says "not available", say you don't have it. Never guess or substitute.
- Compare against the SIZE-MATCHED PEERS, not the industry leader (it is far larger and
  included only as background).
- Be balanced: state the bear case as plainly as the bull case.
- This is research and education, NOT investment advice. No "buy now" urgency.
- Plain English. No jargon without a short explanation. Amounts in ₹.
- Weight news by its age. A headline weeks old is context, not something happening now.
- Quarterly results matter: say plainly whether revenue and profit are growing or shrinking,
  and whether the company has been beating or missing analyst estimates.
- If YOUR POSITION shows the reader owns the stock, speak to them directly ("your holding").
  Describe their gain/loss and how concentrated they are. The 2×ATR and support figures are
  REFERENCE levels to mention, never an instruction to sell or buy.

SCORING (0-100): weigh trend and momentum, valuation vs peers, financial health,
sector/driver backdrop, and news. 50 is neutral. Be willing to score low.
verdict: "BUY" (>=70), "WATCH" (40-69), "AVOID" (<40).

Reply with ONLY a JSON object, no markdown fence, in exactly this shape:
{
  "score": <0-100 integer>,
  "verdict": "BUY" | "WATCH" | "AVOID",
  "headline": "<one sentence, max 110 chars, the single most important takeaway>",
  "technicals": "<2-3 sentences on trend, momentum and key levels>",
  "valuation": "<2-3 sentences: is it cheap or dear versus its size-matched peers, and why>",
  "sector": "<2-3 sentences on the sector, its drivers and what they imply for margins>",
  "earnings": "<2-3 sentences on the quarterly trend, estimate beats/misses and the next results date>",
  "position": "<2-3 sentences addressed to the holder about their P&L, concentration and the reference levels; empty string if they don't hold it>",
  "catalysts": ["<short, concrete, from the data>", "..."],
  "risks": ["<short, concrete, from the data>", "..."],
  "levels": "<one line naming the support and resistance figures given>",
  "verdictText": "<3-4 sentences of balanced reasoning for the score>",
  "missing": ["<anything important that was unavailable>"]
}`

export function analysisPrompt(ctx) {
  return `${RULES}\n\n===== RESEARCH DATA =====\n${formatContext(ctx)}`
}

// Models wrap JSON in prose or fences often enough that a bare JSON.parse is unreliable.
export function parseReport(raw) {
  let s = String(raw || '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  if (s[0] !== '{') {
    const a = s.indexOf('{'), b = s.lastIndexOf('}')
    if (a >= 0 && b > a) s = s.slice(a, b + 1)
  }
  const r = JSON.parse(s)
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : [])
  const score = Math.max(0, Math.min(100, Math.round(Number(r.score))))
  return {
    score: Number.isFinite(score) ? score : null,
    verdict: ['BUY', 'WATCH', 'AVOID'].includes(r.verdict) ? r.verdict
      : score >= 70 ? 'BUY' : score >= 40 ? 'WATCH' : 'AVOID',
    headline: String(r.headline || '').trim(),
    technicals: String(r.technicals || '').trim(),
    valuation: String(r.valuation || '').trim(),
    sector: String(r.sector || '').trim(),
    earnings: String(r.earnings || '').trim(),
    position: String(r.position || '').trim(),
    levels: String(r.levels || '').trim(),
    verdictText: String(r.verdictText || '').trim(),
    catalysts: arr(r.catalysts), risks: arr(r.risks), missing: arr(r.missing),
  }
}

// ---------- top level ----------
/**
 * Full pipeline: gather every source → hand the finished figures to the model →
 * parse its JSON verdict. Returns { report, context } so the UI can show the report
 * and still surface the underlying data the model was given.
 */
export async function analyseStock(symbol, name, onProgress = () => {}, position = null) {
  const context = await gatherStockContext(symbol, name, onProgress, position)
  onProgress('Writing the analysis…')
  // One retry only — an analysis call is slow, and three silent attempts just looks frozen.
  const raw = await aiComplete(analysisPrompt(context), { task: 'analysis', retries: 1 })
  let report
  try {
    report = parseReport(raw)
  } catch {
    throw new Error('The analysis came back in an unexpected format. Try again.')
  }
  return { report, context, generatedAt: new Date().toISOString() }
}
