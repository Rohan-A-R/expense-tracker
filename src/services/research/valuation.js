// Valuation and peers.
//
// Peers: same industry is the starting pool (Yahoo screener); within it, the closest
// businesses — similar margin, growth and leverage — rank first, with market cap as one
// factor rather than the only one. Peer statistics use the median and interquartile
// range, so one outlier can't drag the comparison. With fewer than three usable peers the
// comparison is reported as thin rather than dressed up as confident.
//
// Valuation: price vs peers, vs the company's own history, and a range built from stated
// assumptions (peer multiples × this company's earnings or book value). Never a single
// target price, and never invented by the model.

import { isLender } from './fundamentals'

export const MIN_PEERS = 3

export function quantile(xs, q) {
  const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const pos = (v.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return v[lo] + (v[hi] - v[lo]) * (pos - lo)
}
const median = (xs) => quantile(xs, 0.5)

/**
 * Rank candidate peers by business similarity. `cands` = [{ symbol, name, marketCap, fund }].
 * Distance mixes size (log ratio), profit margin, revenue growth and leverage — each scaled so
 * one "unit" is a meaningful gap. Missing metrics simply don't count against a candidate.
 */
export function rankPeers(self, cands) {
  const r = self?.raw || {}
  const dist = (c) => {
    const x = c.fund?.raw || {}
    let d = 0, w = 0
    const add = (a, b, scale, weight) => { if (a != null && b != null) { d += weight * Math.min(Math.abs(a - b) / scale, 3); w += weight } }
    if (self?.marketCapRaw && c.marketCap) { d += 1.0 * Math.min(Math.abs(Math.log(c.marketCap / self.marketCapRaw)), 3); w += 1.0 }
    add(r.profitMargin, x.profitMargin, 0.08, 1.0)          // 8 pp of net margin
    add(r.revenueGrowth, x.revenueGrowth, 0.15, 0.7)        // 15 pp of growth
    add(r.debtToEquity, x.debtToEquity, 100, 0.5)           // 1.0x of leverage (Yahoo reports %)
    add(r.roe, x.roe, 0.10, 0.6)                            // 10 pp of ROE
    return w ? d / w : 9
  }
  return [...cands].map(c => ({ ...c, similarity: dist(c) })).sort((a, b) => a.similarity - b.similarity)
}

/**
 * Valuation facts. `peers` are the chosen comparables (with .fund), `hist` is the company's
 * own year-end P/E history, `model` decides the anchor multiple (P/B for lenders).
 */
export function addValuationFacts(fb, { fund, price, peers, model, ownPe, annual }) {
  const V = { pillar: 'valuation', source: 'Yahoo Finance', fetchedAt: fund?.fetchedAt }
  const r = fund?.raw || {}
  const lender = isLender(model)

  const pes = peers.map(p => p.fund?.raw?.pe).filter(v => v > 0 && v < 300)
  const pbs = peers.map(p => p.fund?.raw?.pb).filter(v => v > 0 && v < 50)
  const usable = lender ? pbs.length : pes.length
  fb.add('peerCount', 'Comparable peers with a usable multiple', usable, { ...V, unit: 'peers', status: 'computed', calc: lender ? 'peers with a P/B' : 'peers with a positive P/E' })
  const thin = usable < MIN_PEERS

  // ---- the anchor multiple ----
  fb.add('pe', 'P/E (trailing)', r.pe > 0 ? r.pe : null, { ...V, unit: 'x', period: 'TTM', why: r.pe != null ? 'loss-making — P/E not meaningful' : undefined })
  fb.add('pb', 'Price / book value', r.pb > 0 ? r.pb : null, { ...V, unit: 'x', period: 'latest' })
  if (!lender) fb.add('evEbitda', 'EV / EBITDA', r.evEbitda > 0 ? r.evEbitda : null, { ...V, unit: 'x', period: 'TTM' })

  if (!thin) {
    if (!lender) {
      fb.add('pePeerMedian', 'Peer median P/E', median(pes), { ...V, unit: 'x', status: 'computed', calc: `median of ${pes.length} peers` })
      fb.add('pePeerP25', 'Peer P/E, 25th percentile', quantile(pes, 0.25), { ...V, unit: 'x', status: 'computed', calc: 'interquartile range of peers' })
      fb.add('pePeerP75', 'Peer P/E, 75th percentile', quantile(pes, 0.75), { ...V, unit: 'x', status: 'computed', calc: 'interquartile range of peers' })
      if (r.pe > 0) fb.add('pePremium', 'P/E premium to peer median', ((r.pe / median(pes)) - 1) * 100,
        { ...V, unit: '%', status: 'computed', calc: 'P/E / peer median − 1', signed: true })
    }
    fb.add('pbPeerMedian', 'Peer median P/B', median(pbs), { ...V, unit: 'x', status: 'computed', calc: `median of ${pbs.length} peers` })
    if (lender && r.pb > 0) fb.add('pbPremium', 'P/B premium to peer median', ((r.pb / median(pbs)) - 1) * 100,
      { ...V, unit: '%', status: 'computed', calc: 'P/B / peer median − 1', signed: true })
  } else {
    fb.add('peerComparison', 'Peer valuation comparison', null, { pillar: 'valuation', why: `fewer than ${MIN_PEERS} comparable peers with usable data` })
  }

  // ---- against its own history (year-end P/E, ₹ statements only) ----
  if (ownPe?.length >= 2) {
    fb.add('peOwnMedian', 'Own median year-end P/E', median(ownPe.map(x => x.pe)),
      { ...V, unit: 'x', status: 'computed', period: `${ownPe[0].fy}–${ownPe[ownPe.length - 1].fy}`, calc: 'fiscal-year-end price / diluted EPS, median' })
    if (r.pe > 0) fb.add('peVsOwnHistory', 'P/E vs own historical median', ((r.pe / median(ownPe.map(x => x.pe))) - 1) * 100,
      { ...V, unit: '%', status: 'computed', calc: 'trailing P/E / own median − 1', signed: true })
  } else fb.add('peOwnMedian', 'Own historical P/E', null, { pillar: 'valuation', why: annual?.currency && annual.currency !== 'INR' ? `statements reported in ${annual.currency}` : 'not enough annual EPS history' })

  // ---- lenders: is the P/B earned? (justified P/B ≈ ROE / cost of equity) ----
  const roe = fb.val('roe')
  if (lender && r.pb > 0 && roe != null) {
    fb.add('pbToRoe', 'P/B relative to ROE-justified P/B', r.pb / (roe / 13),
      { ...V, unit: 'x', status: 'computed', calc: 'P/B / (ROE / 13% assumed cost of equity); 1.0 = fairly priced for its returns' })
  }

  // ---- cash yield ----
  if (!lender && fund?.marketCapRaw && r.freeCashflow != null && (fund.financialCurrency || 'INR') === (fund.currency || 'INR')) {
    fb.add('fcfYield', 'Free-cash-flow yield', (r.freeCashflow / fund.marketCapRaw) * 100,
      { ...V, unit: '%', period: 'TTM', status: 'computed', calc: 'free cash flow / market cap' })
  }

  // ---- a range, with its assumptions on the label ----
  let range = null
  if (!thin) {
    if (!lender && r.eps > 0) {
      range = { basis: 'trailing EPS × peer P/E quartiles', bear: r.eps * quantile(pes, 0.25), base: r.eps * median(pes), bull: r.eps * quantile(pes, 0.75) }
    } else if (lender && r.bookValue > 0) {
      range = { basis: 'book value per share × peer P/B quartiles', bear: r.bookValue * quantile(pbs, 0.25), base: r.bookValue * median(pbs), bull: r.bookValue * quantile(pbs, 0.75) }
    }
  }
  if (range && price) {
    fb.add('rangeBear', 'Valuation range — low', range.bear, { ...V, unit: '₹', status: 'computed', calc: range.basis + ' (25th pct)' })
    fb.add('rangeBase', 'Valuation range — mid', range.base, { ...V, unit: '₹', status: 'computed', calc: range.basis + ' (median)' })
    fb.add('rangeBull', 'Valuation range — high', range.bull, { ...V, unit: '₹', status: 'computed', calc: range.basis + ' (75th pct)' })
    fb.add('priceVsRangeMid', 'Price vs mid of range', ((price / range.base) - 1) * 100, { ...V, unit: '%', status: 'computed', calc: 'price / range mid − 1', signed: true })
  } else {
    fb.add('range', 'Valuation range', null, { pillar: 'valuation', why: thin ? 'too few comparable peers' : 'no positive earnings / book value to apply multiples to' })
  }

  // ---- brokers: an estimate, kept separate from our own valuation ----
  if (fund?.targetMeanRaw && price) fb.add('brokerUpside', 'Upside to mean broker target', ((fund.targetMeanRaw / price) - 1) * 100,
    { pillar: 'valuation', source: 'Yahoo Finance (analyst consensus)', status: 'estimate', unit: '%', signed: true, calc: undefined })
  const now = fund?.ratings?.find(x => x.period === '0m')
  if (now) {
    const buy = now.strongBuy + now.buy, total = buy + now.hold + now.sell + now.strongSell
    if (total) fb.add('brokerBuyShare', 'Share of brokers rating it buy', (buy / total) * 100,
      { pillar: 'valuation', source: 'Yahoo Finance (analyst consensus)', status: 'estimate', unit: '%', period: `${total} analysts` })
  }
  return { range, thin }
}

/** Year-end P/E for each fiscal year with ₹ statements: price on the FY end / diluted EPS. */
export function ownPeHistory(annual, weekly) {
  if (!annual?.years?.length || annual.currency !== 'INR' || !weekly?.length) return []
  const out = []
  for (const y of annual.years) {
    if (!(y.dilutedEps > 0)) continue
    const t = new Date(y.end + 'T00:00:00').getTime()
    const bar = weekly.reduce((best, b) => (Math.abs(b.t - t) < Math.abs((best?.t ?? Infinity) - t) ? b : best), null)
    if (bar && Math.abs(bar.t - t) < 15 * 864e5) out.push({ fy: y.fy, pe: bar.close / y.dilutedEps })
  }
  return out.filter(x => x.pe > 0 && x.pe < 300)
}
