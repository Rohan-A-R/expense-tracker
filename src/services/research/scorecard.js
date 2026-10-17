// Deterministic scorecard. Code, not the model, decides the scores and the verdict; the
// model only explains them.
//
// Five pillars, each 0–10, built from rules over the fact book:
//   quality    — growth, margins, returns on capital, cash conversion
//   strength   — leverage, interest cover, liquidity of the balance sheet
//   valuation  — price vs peers, vs own history, cash yield
//   market     — trend and relative strength across horizons
//   risk       — volatility, drawdown, dilution, estimate misses (10 = low risk)
//
// Every rule maps a fact linearly between a "poor" and a "good" level. The levels and the
// pillar weights are STARTING HYPOTHESES (methodology v2.0), not established truths — the
// evaluation engine records outcomes so they can be checked and recalibrated.
//
// Coverage: a pillar's coverage is the weight of rules that had data / all its rules. A
// verdict needs enough evidence; otherwise the outcome is "Insufficient evidence".

import { isLender } from './fundamentals'

export const METHOD_VERSION = 'research-2.0'

const lin = (v, poor, good) => {
  if (v == null || !Number.isFinite(v)) return null
  const t = (v - poor) / (good - poor)
  return Math.max(0, Math.min(10, t * 10))
}
// 10 when v is inside [lo, hi], falling to 0 at the outer bounds
const band = (v, outLo, lo, hi, outHi) => {
  if (v == null || !Number.isFinite(v)) return null
  if (v < lo) return lin(v, outLo, lo)
  if (v > hi) return lin(v, outHi, hi)
  return 10
}

function rulesFor(model) {
  const L = isLender(model)
  const cyc = model === 'cyclical'
  return {
    quality: L ? [
      ['roe', 1.0, v => lin(v, 6, 18)],
      ['roa', 1.0, v => lin(v, 0.4, 1.8)],
      ['roaAvg', 0.6, v => lin(v, 0.4, 1.6)],
      ['topLineCagr', 0.8, v => lin(v, 0, 18)],
      ['profitCagr', 0.6, v => lin(v, -5, 20)],
      ['niiToAssets', 0.5, v => lin(v, 1.5, 4)],
      ['qProfitChange', 0.4, v => lin(v, -25, 20)],
    ] : [
      ['topLineCagr', 0.9, v => lin(v, 0, cyc ? 12 : 16)],
      ['profitCagr', 0.7, v => lin(v, -5, 20)],
      [cyc ? 'opMarginAvg' : 'opMargin', 1.0, v => lin(v, 4, model === 'it' ? 24 : 20)],
      ['opMarginTrend', 0.6, v => lin(v, -5, 3)],
      ['roce', 1.0, v => lin(v, 6, 22)],
      ['roe', 0.6, v => lin(v, 5, 20)],
      ['cashConversion', 0.9, v => lin(v, 0.4, 1.0)],
      ['fcfPositiveYears', 0.5, (v, fb) => lin(v / (fb.val('statementsYears') || 4), 0.25, 1)],
      ['qProfitChange', 0.4, v => lin(v, -25, 20)],
    ],
    strength: L ? [
      ['equityToAssets', 1.0, v => lin(v, 6, 13)],
      ['equityToAssetsChange', 0.5, v => lin(v, -1.5, 1)],
      ['car', 1.0, () => null],                                 // never available → lowers coverage honestly
    ] : [
      ['debtToEquity', 1.0, v => lin(v, cyc ? 1.5 : 1.2, 0.1)],
      ['netDebtToEbitda', 1.0, v => lin(v, 4, 0)],
      ['interestCover', 0.8, v => lin(v, 1.5, 10)],
      ['currentRatio', 0.5, v => band(v, 0.6, 1.2, 3, 6)],
    ],
    valuation: [
      [L ? 'pbPremium' : 'pePremium', 1.0, v => lin(v, 60, -30)],
      ['peVsOwnHistory', 0.8, v => lin(v, 50, -25)],
      ...(L ? [['pbToRoe', 1.0, v => lin(v, 2.2, 0.8)]] : [['fcfYield', 0.7, v => lin(v, 0, 6)], ['evEbitda', 0.4, v => lin(v, 30, 8)]]),
      ['priceVsRangeMid', 0.6, v => lin(v, 40, -25)],
      ['brokerUpside', 0.3, v => lin(v, -10, 30)],
    ],
    market: [
      // long 45% · medium 35% · short 20%
      ['vs200dma', 0.25, v => lin(v, -15, 10)],
      ['rs12mNifty', 0.20, v => lin(v, -25, 20)],
      ['vs50dma', 0.15, v => lin(v, -10, 8)],
      ['rs6mSector', 0.10, v => lin(v, -15, 15)],
      ['rs6mPeers', 0.10, v => lin(v, -15, 15)],
      ['rsi', 0.10, v => band(v, 15, 40, 65, 85)],
      ['ret1m', 0.10, v => lin(v, -12, 8)],
    ],
    risk: [
      ['atrPct', 0.8, v => lin(v, 5, 1.2)],
      ['maxDrawdown', 0.8, v => lin(v, -50, -10)],
      ['beta', 0.4, v => lin(v, 1.8, 0.7)],
      ['dilution', 0.6, v => lin(v, 15, 0)],
      ['epsMisses', 0.6, (v, fb) => { const f = fb.get('epsMisses'); const n = Number(String(f?.unit || '').replace(/\D/g, '')) || 4; return lin(v / n, 0.75, 0) }],
      ['receivablesVsRevenue', 0.4, v => lin(v, 25, 0)],
      ['liquidity', 0.5, v => lin(v, 0.5, 20)],
      // governance can't be assessed from free data; it counts as missing, not as clean
      ['pledging', 0.5, () => null],
      ['auditor', 0.3, () => null],
      ...(L ? [['gnpa', 0.8, () => null]] : []),
    ],
  }
}

export const PILLARS = [
  ['quality', 'Business quality'],
  ['strength', 'Financial strength'],
  ['valuation', 'Valuation'],
  ['market', 'Market behaviour'],
  ['risk', 'Risk (10 = low)'],
]

const WEIGHTS = {
  general:   { quality: 0.25, strength: 0.20, valuation: 0.25, market: 0.15, risk: 0.15 },
  it:        { quality: 0.30, strength: 0.15, valuation: 0.25, market: 0.15, risk: 0.15 },
  cyclical:  { quality: 0.20, strength: 0.25, valuation: 0.25, market: 0.15, risk: 0.15 },
  bank:      { quality: 0.30, strength: 0.15, valuation: 0.25, market: 0.15, risk: 0.15 },
  nbfc:      { quality: 0.30, strength: 0.15, valuation: 0.25, market: 0.15, risk: 0.15 },
  insurance: { quality: 0.25, strength: 0.20, valuation: 0.25, market: 0.15, risk: 0.15 },
  utility:   { quality: 0.20, strength: 0.25, valuation: 0.25, market: 0.15, risk: 0.15 },
  realty:    { quality: 0.20, strength: 0.25, valuation: 0.25, market: 0.15, risk: 0.15 },
}

// Verdict labels in research language (not "buy/sell" instructions).
export const VERDICTS = {
  POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Negative', INSUFFICIENT: 'Insufficient evidence',
}
const MIN_COVERAGE = 0.55          // overall evidence needed for any verdict
const MIN_PILLAR = 0.4             // a pillar below this coverage is left out of the score

export function computeScorecard(fb, model, { stale = false, splitJumps = 0 } = {}) {
  const rules = rulesFor(model)
  const weights = WEIGHTS[model] || WEIGHTS.general
  const pillars = {}
  for (const [key, label] of PILLARS) {
    let num = 0, den = 0, have = 0, all = 0
    const parts = []
    for (const [fact, w, fn] of rules[key]) {
      all += w
      const f = fb.get(fact)
      const s = f && typeof f.value === 'number' ? fn(f.value, fb) : null
      if (s == null) continue
      have += w; num += s * w; den += w
      parts.push({ fact, id: f.id, label: f.label, score: Number(s.toFixed(1)), weight: w })
    }
    const coverage = all ? have / all : 0
    pillars[key] = {
      key, label, weight: weights[key],
      score: den ? Number((num / den).toFixed(1)) : null,
      coverage: Number(coverage.toFixed(2)),
      used: coverage >= MIN_PILLAR && den > 0,
      parts,
    }
  }
  const used = Object.values(pillars).filter(p => p.used)
  const wsum = used.reduce((s, p) => s + p.weight, 0)
  const overall = wsum ? used.reduce((s, p) => s + p.score * p.weight, 0) / wsum : null
  const coverage = Object.values(pillars).reduce((s, p) => s + p.weight * p.coverage, 0)

  const reasons = []
  if (coverage < MIN_COVERAGE) reasons.push(`only ${Math.round(coverage * 100)}% of the scoring evidence was available`)
  if (!pillars.quality.used) reasons.push('business-quality data is too thin')
  if (!pillars.valuation.used) reasons.push('valuation data is too thin')
  if (stale) reasons.push('the latest price is stale')
  if (splitJumps > 0) reasons.push('the price history has an unexplained jump (possible unadjusted split/bonus)')

  const score = overall == null ? null : Math.round(overall * 10)
  const verdict = reasons.length ? 'INSUFFICIENT'
    : score >= 65 ? 'POSITIVE' : score < 45 ? 'NEGATIVE' : 'NEUTRAL'

  return { version: METHOD_VERSION, model, weights, pillars, score, coverage: Number(coverage.toFixed(2)), verdict, reasons }
}

/** Put the scorecard into the fact book so the model can cite it (it may not change it). */
export function addScoreFacts(fb, sc) {
  const S = { pillar: 'score', source: `scorecard ${sc.version}`, status: 'computed' }
  fb.add('score', 'Overall score', sc.score, { ...S, unit: '/100', calc: 'weighted pillar scores' })
  fb.add('verdict', 'Assessment', VERDICTS[sc.verdict], { ...S })
  fb.add('coverage', 'Evidence coverage', Math.round(sc.coverage * 100), { ...S, unit: '%', calc: 'share of scoring inputs that had data' })
  for (const [key] of PILLARS) {
    const p = sc.pillars[key]
    fb.add(`pillar_${key}`, `${p.label} score`, p.score, { ...S, unit: '/10', calc: `${p.parts.length} inputs, ${Math.round(p.coverage * 100)}% coverage` })
  }
}
