// Saved stock analyses — the latest report per stock plus a running record of past calls.
//
// Lives in the `settings` store under one key (no DB_VERSION bump needed):
//   { [symbol]: { latest: { generatedAt, report, meta }, history: [{ at, price, score, verdict, headline }] } }
//
// The full report is kept for REPORT_TTL (a week) so reopening a stock shows it instantly
// without another AI call. The history is tiny and kept much longer — it is what lets the
// app show how past calls actually played out ("WATCH at ₹185 → now ₹201, +8.3%").

import { getSetting, setSetting } from './db'

const KEY = 'stockAnalyses'
export const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_HISTORY = 60          // per stock — enough calls to evaluate over a year+

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

async function readAll() {
  const v = await getSetting(KEY)
  return v && typeof v === 'object' ? v : {}
}

/**
 * @returns {{ latest: object|null, stale: object|null, history: object[] }}
 *   latest — the saved report if still within the 7-day window
 *   stale  — the saved report's metadata once it has expired (so the UI can say when)
 */
export async function loadAnalysis(symbol) {
  const entry = (await readAll())[symbol]
  if (!entry) return { latest: null, stale: null, history: [] }
  const fresh = entry.latest && Date.now() - new Date(entry.latest.generatedAt).getTime() < REPORT_TTL_MS
  return {
    latest: fresh ? entry.latest : null,
    stale: !fresh && entry.latest ? { generatedAt: entry.latest.generatedAt } : null,
    history: entry.history || [],
  }
}

function snapshotOf(c) {
  const f = c.fundamentals || {}, t = c.technicals || {}
  const now = f.ratings?.find(r => r.period === '0m')
  return {
    sector: c.sector, industry: c.industry, theme: c.playbook?.generic ? null : c.playbook?.name || null,
    marketCap: f.marketCap || null, pe: f.pe || null,
    target: f.targetMeanRaw ?? null, analysts: f.analystCount ?? null,
    ratings: now ? { buy: now.strongBuy + now.buy, hold: now.hold, sell: now.sell + now.strongSell } : null,
    high52: t.high52 ?? null, low52: t.low52 ?? null, rsi: t.rsi ?? null,
    ret1y: t.returns?.['1Y'] ?? null,
    nextResults: f.nextEarnings || null,
    peers: (c.peers || []).filter(p => !p.isLeader).slice(0, 4).map(p => ({ name: p.label || p.symbol, pe: p.fund?.pe || null })),
  }
}

/**
 * Persist a finished analysis. `res` is analyseStock()'s return value; only the parts the
 * card needs are kept — the raw price series behind peers/drivers would bloat the store.
 */
export async function saveAnalysis(symbol, res) {
  const all = await readAll()
  const c = res.context
  const latest = {
    generatedAt: res.generatedAt,
    report: res.report,
    meta: {
      price: c.price,
      position: c.position,
      peers: c.peers.length,
      drivers: c.drivers.length,
      headlines: c.news.reduce((s, g) => s + g.items.length, 0),
      // A few fixed figures for the report's key-data table (computed, never from the model).
      snapshot: snapshotOf(c),
      // The evidence the report cites (slim) and what was missing — so the evidence
      // appendix and data-quality section work offline, exactly as the model saw them.
      facts: c.facts ? c.facts.facts.map(({ id, label, value, unit, period, source, status, calc, pillar, signed }) =>
        ({ id, label, value, unit, period, source, status, calc, pillar, signed })) : undefined,
      missing: c.facts ? c.facts.missing.map(({ label, why, pillar }) => ({ label, why, pillar })) : undefined,
      peerNames: (c.peers || []).filter(p => !p.isLeader).map(p => p.label),
      fetchedAt: c.fetchedAt,
    },
  }
  const r = res.report
  // One row per call for the track record. Everything needed to evaluate it later is here:
  // the price and date (outcomes are measured from them), the method version and model
  // (so changes to the method can be compared), and the pillar scores behind the verdict.
  const call = {
    at: res.generatedAt, price: c.price,
    score: r.score, verdict: r.verdict, headline: r.headline,
    version: r.method || 'v1', model: r.model || null, coverage: r.coverage ?? null,
    pillars: r.pillars ? Object.fromEntries(Object.entries(r.pillars).map(([k, p]) => [k, p.score])) : null,
  }
  // A same-day refresh replaces that day's call rather than stacking duplicates.
  const prev = (all[symbol]?.history || []).filter(h => !sameDay(h.at, call.at))
  all[symbol] = { latest, history: [call, ...prev].slice(0, MAX_HISTORY) }
  await setSetting(KEY, all)
  return { latest, history: all[symbol].history }
}

// ---- evaluation: how past calls played out ----
// For each call and horizon (1/3/6/12 months), once the horizon has passed: the stock's
// return from the call's price, NIFTY's return over the same window, and the difference.
// Uses daily closes (1Y chart) — horizons older than the series are left unevaluated.
export const HORIZONS = [['1M', 30], ['3M', 91], ['6M', 182], ['12M', 365]]

const closeOn = (series, t) => {
  // last close on or before t (no peeking at later prices)
  let best = null
  for (const b of series) { if (b.t <= t) best = b; else break }
  return best && t - best.t < 7 * 864e5 ? best.close : null
}

export function evaluateCalls(history, stockSeries, niftySeries) {
  if (!stockSeries?.length) return history.map(h => ({ ...h, outcomes: {} }))
  const first = stockSeries[0].t, now = Date.now()
  return history.map(h => {
    const at = new Date(h.at).getTime()
    const outcomes = {}
    for (const [k, days] of HORIZONS) {
      const end = at + days * 864e5
      if (end > now || at < first) continue
      const p0 = h.price ?? closeOn(stockSeries, at), p1 = closeOn(stockSeries, end)
      const n0 = closeOn(niftySeries || [], at), n1 = closeOn(niftySeries || [], end)
      if (!p0 || !p1) continue
      const ret = (p1 / p0 - 1) * 100
      const mkt = n0 && n1 ? (n1 / n0 - 1) * 100 : null
      outcomes[k] = { ret, mkt, excess: mkt != null ? ret - mkt : null }
    }
    return { ...h, outcomes }
  })
}

// Normalise old (v1) verdicts for display: BUY/WATCH/AVOID → the research labels.
export const VERDICT_MAP = { BUY: 'POSITIVE', WATCH: 'NEUTRAL', AVOID: 'NEGATIVE' }
export const verdictKey = (v) => VERDICT_MAP[v] || v
