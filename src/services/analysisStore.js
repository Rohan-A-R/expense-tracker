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
const MAX_HISTORY = 24          // per stock — roughly six months of weekly calls

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
    },
  }
  const call = {
    at: res.generatedAt, price: c.price,
    score: res.report.score, verdict: res.report.verdict, headline: res.report.headline,
  }
  // A same-day refresh replaces that day's call rather than stacking duplicates.
  const prev = (all[symbol]?.history || []).filter(h => !sameDay(h.at, call.at))
  all[symbol] = { latest, history: [call, ...prev].slice(0, MAX_HISTORY) }
  await setSetting(KEY, all)
  return { latest, history: all[symbol].history }
}
