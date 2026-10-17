// Market behaviour and market-side risk, as facts.
//
// Technicals are split by horizon so a short-term reading can't masquerade as a thesis:
//   long   — 200-day average, 12-month return vs the market
//   medium — 50-day average, 3–6-month return vs peers / sector
//   short  — RSI, MACD, 1-month move
// None of these predicts anything on its own; they describe how the stock has traded.
//
// Data checks live here too: a stale last price, and day-on-day jumps big enough to be an
// unadjusted split or bonus (which would corrupt every return and indicator).

const SPLIT_JUMP = 0.35          // a >35% one-day move is far more often a corporate action
const STALE_DAYS = 5

export function priceChecks(series) {
  const last = series[series.length - 1]
  const ageDays = last ? Math.floor((Date.now() - last.t) / 864e5) : null
  const jumps = []
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1].close, b = series[i].close
    if (a > 0 && Math.abs(b / a - 1) > SPLIT_JUMP) jumps.push({ t: series[i].t, pct: (b / a - 1) * 100 })
  }
  return { lastBar: last?.t ?? null, ageDays, stale: ageDays != null && ageDays > STALE_DAYS, jumps }
}

/** Average daily traded value over the last 20 sessions, in ₹ crore. */
export function liquidityCr(series) {
  const rows = series.slice(-20).filter(b => b.volume > 0 && b.close > 0)
  if (rows.length < 10) return null
  return rows.reduce((s, b) => s + b.close * b.volume, 0) / rows.length / 1e7
}

export function addMarketFacts(fb, { tech, series, relStrength, sectorIndex, fund, earnings, fetchedAt }) {
  const M = { pillar: 'market', source: 'Yahoo Finance daily prices', fetchedAt }
  const R = { pillar: 'risk', source: 'Yahoo Finance daily prices', fetchedAt }
  const asOf = series.length ? new Date(series[series.length - 1].t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const chk = priceChecks(series)

  fb.add('priceDate', 'Last price date', asOf || null, { ...M, why: 'no price history' })
  if (chk.stale) fb.add('priceStale', 'Days since last price', chk.ageDays, { ...M, unit: 'days', status: 'computed' })
  fb.add('splitJumps', 'One-day moves over 35% (possible unadjusted split/bonus)', chk.jumps.length,
    { ...M, unit: 'events', status: 'computed', calc: 'count of day-on-day changes beyond ±35%' })

  if (tech) {
    const ret = tech.returns || {}
    // long horizon
    fb.add('vs200dma', 'Price vs 200-day average', tech.sma200 ? ((tech.price / tech.sma200) - 1) * 100 : null,
      { ...M, unit: '%', signed: true, period: asOf, calc: 'price / 200-day moving average − 1', why: 'under 200 days of history' })
    fb.add('ret12m', '12-month return', ret['1Y'], { ...M, unit: '%', signed: true, period: asOf, status: 'computed' })
    fb.add('rs12mNifty', '12-month return vs NIFTY 50', relStrength?.nifty?.['1Y'], { ...M, unit: 'pp', period: asOf, status: 'computed', calc: 'stock 1Y return − NIFTY 1Y return' })
    // medium horizon
    fb.add('vs50dma', 'Price vs 50-day average', tech.sma50 ? ((tech.price / tech.sma50) - 1) * 100 : null,
      { ...M, unit: '%', signed: true, period: asOf, calc: 'price / 50-day moving average − 1' })
    fb.add('ret6m', '6-month return', ret['6M'], { ...M, unit: '%', signed: true, period: asOf, status: 'computed' })
    if (sectorIndex) fb.add('rs6mSector', `6-month return vs ${sectorIndex.label}`, sectorIndex.rs?.['6M'], { ...M, unit: 'pp', period: asOf, status: 'computed', calc: `stock 6M − ${sectorIndex.label} 6M` })
    fb.add('rs6mPeers', '6-month return vs peer basket', relStrength?.sector?.['6M'], { ...M, unit: 'pp', period: asOf, status: 'computed', calc: 'stock 6M − equal-weight peer average 6M' })
    // short horizon
    fb.add('rsi', 'RSI (14-day)', tech.rsi, { ...M, unit: '', period: asOf, status: 'computed', calc: 'Wilder RSI on daily closes' })
    if (tech.macd) fb.add('macdTrend', 'MACD trend', `${tech.macd.trend}${tech.macd.crossedDaysAgo != null ? `, crossed ${tech.macd.crossedDaysAgo} sessions ago` : ''}`, { ...M, period: asOf, status: 'computed' })
    fb.add('ret1m', '1-month return', ret['1M'], { ...M, unit: '%', signed: true, period: asOf, status: 'computed' })
    // levels (reference, not signals)
    fb.add('support', 'Nearest support', tech.levels?.support?.[0]?.price, { ...M, unit: '₹', period: asOf, status: 'computed', calc: 'clustered swing lows/highs, 1Y daily' })
    fb.add('resistance', 'Nearest resistance', tech.levels?.resistance?.[0]?.price, { ...M, unit: '₹', period: asOf, status: 'computed', calc: 'clustered swing lows/highs, 1Y daily' })
    fb.add('high52', '52-week high', tech.high52, { ...M, unit: '₹', period: asOf })
    fb.add('low52', '52-week low', tech.low52, { ...M, unit: '₹', period: asOf })

    // risk side
    fb.add('atrPct', 'Typical daily range (ATR as % of price)', tech.atrPct, { ...R, unit: '%', period: asOf, status: 'computed', calc: '14-day ATR / price' })
    fb.add('maxDrawdown', 'Largest fall from a peak, past year', tech.maxDrawdownPct, { ...R, unit: '%', period: asOf, status: 'computed' })
  }
  fb.add('beta', 'Beta (vs market)', fund?.raw?.beta, { pillar: 'risk', source: 'Yahoo Finance', unit: '' })
  fb.add('liquidity', 'Average daily traded value', liquidityCr(series), { ...R, unit: '₹ cr', period: 'last 20 sessions', status: 'computed', calc: 'mean of close × volume' })

  if (earnings?.eps?.length) {
    fb.add('epsMisses', 'Quarters that missed the EPS estimate', earnings.misses, { pillar: 'risk', source: 'Yahoo Finance (estimates)', status: 'estimate', unit: `of ${earnings.eps.length}` })
  } else fb.add('epsMisses', 'EPS vs estimates', null, { pillar: 'risk', why: 'no analyst estimate history' })
  if (earnings) {
    fb.add('qRevChange', 'Revenue change over the last quarters', earnings.revOverSpan, { pillar: 'quality', source: 'Yahoo Finance quarterly results', unit: '%', signed: true, period: `${earnings.spanFrom}→${earnings.spanTo}`, status: 'computed' })
    fb.add('qProfitChange', 'Net profit change over the last quarters', earnings.profitOverSpan, { pillar: 'quality', source: 'Yahoo Finance quarterly results', unit: '%', signed: true, period: `${earnings.spanFrom}→${earnings.spanTo}`, status: 'computed' })
    fb.add('nextResults', 'Next results date', earnings.nextEarnings, { pillar: 'market', source: 'Yahoo Finance calendar' })
  }

  // Governance can't be read from free data — say so, so its absence never reads as "clean".
  for (const [k, label] of [['pledging', 'Promoter share pledging'], ['auditor', 'Audit opinions / auditor changes'], ['relatedParty', 'Related-party transactions'], ['litigation', 'Material litigation and regulatory actions']]) {
    fb.add(k, label, null, { pillar: 'risk', why: 'not assessed — needs exchange filings (NSE/BSE), not available here' })
  }
  return chk
}
