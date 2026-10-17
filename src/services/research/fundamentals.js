// Fundamental quality engine: multi-year business quality and financial strength, computed
// from four fiscal years of statements. Everything lands in the fact book with its period
// and formula; nothing here is scored — scorecard.js reads these facts.
//
// Different businesses need different ratios. A bank's "debt" is its deposits, so debt/
// equity and interest cover mean nothing for it; it is judged on returns on assets and
// equity, net interest income and capital. Cyclicals are judged against their own
// mid-cycle margin, not a peak year. modelFor() routes each company to a model.

const MODEL_OF = {
  banks: 'bank', nbfc: 'nbfc', insurance: 'insurance',
  steel: 'cyclical', metals: 'cyclical', cement: 'cyclical', energy: 'cyclical', chemicals: 'cyclical',
  auto: 'cyclical', airlines: 'cyclical',
  it: 'it', power: 'utility', telecom: 'utility', realty: 'realty',
}
export const MODEL_LABEL = {
  bank: 'Bank', nbfc: 'Non-bank lender', insurance: 'Insurer', cyclical: 'Cyclical',
  it: 'IT & services', utility: 'Utility', realty: 'Real estate', general: 'General business',
}
export const modelFor = (playbookKey) => MODEL_OF[playbookKey] || 'general'
export const isLender = (m) => m === 'bank' || m === 'nbfc'

const cr = (v) => (v == null ? null : v / 1e7)
const pctOf = (a, b) => (a != null && b ? (a / b) * 100 : null)
const cagr = (first, last, years) =>
  first > 0 && last > 0 && years > 0 ? (Math.pow(last / first, 1 / years) - 1) * 100 : null
const avg = (xs) => { const v = xs.filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

/**
 * Add business-quality and financial-strength facts for one company.
 * @param fb       fact book
 * @param annual   { years:[{fy,end,revenue,…}], currency, source, fetchedAt } or null
 * @param model    one of MODEL_LABEL's keys
 * @param fund     quoteSummary fundamentals (for TTM fallbacks)
 */
export function addFundamentalFacts(fb, annual, model, fund) {
  const ys = annual?.years || []
  const src = { source: annual?.source || 'Yahoo Finance annual statements', fetchedAt: annual?.fetchedAt }
  const first = ys[0], last = ys[ys.length - 1], prev = ys[ys.length - 2]
  const span = ys.length > 1 ? ys.length - 1 : 0
  const spanLabel = span ? `${first.fy}–${last.fy}` : ''
  const Q = { pillar: 'quality' }, S = { pillar: 'strength' }, R = { pillar: 'risk' }

  if (!ys.length) {
    fb.add('annual', 'Multi-year financial statements', null, { ...Q, why: 'annual statements unavailable for this stock' })
  } else {
    fb.add('statementsYears', 'Years of annual statements available', ys.length, { ...Q, ...src, unit: 'years', period: spanLabel })
    fb.add('reportingCurrency', 'Statement currency', annual.currency || 'unknown', { ...Q, ...src })
  }

  // ---- growth (all models) ----
  const topLine = isLender(model) ? 'netInterestIncome' : 'revenue'
  const topLabel = isLender(model) ? 'Net interest income' : 'Revenue'
  fb.add('topLineCagr', `${topLabel} growth, compound annual`, span ? cagr(first[topLine], last[topLine], span) : null,
    { ...Q, ...src, unit: '%', period: spanLabel, calc: `(${topLabel} ${last?.fy} / ${first?.fy})^(1/${span}) − 1` })
  fb.add('profitCagr', 'Net profit growth, compound annual', span ? cagr(first.netIncome, last.netIncome, span) : null,
    { ...Q, ...src, unit: '%', period: spanLabel, calc: `(net income ${last?.fy} / ${first?.fy})^(1/${span}) − 1`, why: 'loss in the first or last year, or no history' })
  fb.add('profitableYears', 'Years with a net profit', ys.length ? ys.filter(y => y.netIncome > 0).length : null,
    { ...Q, ...src, unit: `of ${ys.length}`, period: spanLabel })
  if (first?.shares && last?.shares && span) {
    fb.add('dilution', 'Change in share count', pctOf(last.shares - first.shares, first.shares),
      { ...R, ...src, unit: '%', period: spanLabel, calc: 'shares outstanding, last / first − 1' })
  } else fb.add('dilution', 'Change in share count', null, R)

  if (isLender(model)) {
    // ---- lenders: returns on assets/equity, net interest margin proxy, capital proxy ----
    const roa = last ? pctOf(last.netIncome, avg([last.totalAssets, prev?.totalAssets])) : null
    const roe = last ? pctOf(last.netIncome, avg([last.equity, prev?.equity])) : null
    fb.add('roa', 'Return on assets', roa, { ...Q, ...src, unit: '%', period: last?.fy, calc: 'net income / average total assets' })
    fb.add('roe', 'Return on equity', roe, { ...Q, ...src, unit: '%', period: last?.fy, calc: 'net income / average equity' })
    fb.add('roaAvg', 'Return on assets, multi-year average', avg(ys.map(y => pctOf(y.netIncome, y.totalAssets))),
      { ...Q, ...src, unit: '%', period: spanLabel, calc: 'mean of yearly net income / total assets' })
    fb.add('niiToAssets', 'Net interest income / total assets (margin proxy)', last ? pctOf(last.netInterestIncome, last.totalAssets) : null,
      { ...Q, ...src, unit: '%', period: last?.fy, calc: 'net interest income / total assets — a proxy for net interest margin' })
    fb.add('equityToAssets', 'Equity / total assets (capital proxy)', last ? pctOf(last.equity, last.totalAssets) : null,
      { ...S, ...src, unit: '%', period: last?.fy, calc: 'shareholders’ equity / total assets — a proxy, not regulatory capital adequacy' })
    fb.add('equityToAssetsChange', 'Change in equity / assets', ys.length > 1 ? pctOf(last.equity, last.totalAssets) - pctOf(first.equity, first.totalAssets) : null,
      { ...S, ...src, unit: 'pp', period: spanLabel, calc: 'equity / assets, last − first' })
    for (const [k, label] of [['gnpa', 'Gross NPA ratio'], ['nnpa', 'Net NPA ratio'], ['creditCost', 'Credit cost'], ['car', 'Capital adequacy ratio (regulatory)']]) {
      fb.add(k, label, null, { pillar: k === 'car' ? 'strength' : 'risk', why: 'not in free data — needs the bank’s own filings' })
    }
    return
  }

  // ---- operating companies ----
  const opMargins = ys.map(y => pctOf(y.operatingIncome, y.revenue))
  fb.add('opMargin', 'Operating margin', opMargins[opMargins.length - 1],
    { ...Q, ...src, unit: '%', period: last?.fy, calc: 'operating income / revenue' })
  fb.add('opMarginAvg', 'Operating margin, multi-year average (mid-cycle proxy)', avg(opMargins),
    { ...Q, ...src, unit: '%', period: spanLabel, calc: 'mean of yearly operating margin' })
  fb.add('opMarginTrend', 'Operating margin change', opMargins.length > 1 && opMargins[0] != null && opMargins[opMargins.length - 1] != null
    ? opMargins[opMargins.length - 1] - opMargins[0] : null,
    { ...Q, ...src, unit: 'pp', period: spanLabel, calc: 'operating margin, last − first' })
  fb.add('roe', 'Return on equity', last ? pctOf(last.netIncome, avg([last.equity, prev?.equity])) : null,
    { ...Q, ...src, unit: '%', period: last?.fy, calc: 'net income / average equity' })
  fb.add('roce', 'Return on capital employed', last ? pctOf(last.ebit ?? last.operatingIncome, avg([last.investedCapital, prev?.investedCapital])) : null,
    { ...Q, ...src, unit: '%', period: last?.fy, calc: 'EBIT / average invested capital (equity + debt)' })

  // cash generation
  const sumCfo = ys.reduce((a, y) => a + (y.operatingCashFlow ?? 0), 0)
  const sumNi = ys.reduce((a, y) => a + (y.netIncome ?? 0), 0)
  const hasCash = ys.some(y => y.operatingCashFlow != null)
  fb.add('cashConversion', 'Operating cash flow / net profit', hasCash && sumNi > 0 ? sumCfo / sumNi : null,
    { ...Q, ...src, unit: 'x', period: spanLabel, calc: 'sum of operating cash flow / sum of net income', why: 'no cash-flow history, or cumulative losses' })
  const fcfYears = ys.filter(y => y.freeCashFlow != null)
  fb.add('fcfPositiveYears', 'Years with positive free cash flow', fcfYears.length ? fcfYears.filter(y => y.freeCashFlow > 0).length : null,
    { ...Q, ...src, unit: `of ${fcfYears.length}`, period: spanLabel })
  if (annual?.currency === 'INR') fb.add('fcfLast', 'Free cash flow', cr(last?.freeCashFlow), { ...Q, ...src, unit: '₹ cr', period: last?.fy })
  // collections: receivables outrunning revenue can flag aggressive booking or stress
  if (last?.receivables != null && prev?.receivables && prev?.revenue) {
    const recG = pctOf(last.receivables - prev.receivables, prev.receivables)
    const revG = pctOf(last.revenue - prev.revenue, prev.revenue)
    fb.add('receivablesVsRevenue', 'Receivables growth minus revenue growth', recG - revG,
      { ...R, ...src, unit: 'pp', period: `${prev.fy}→${last.fy}`, calc: 'receivables growth − revenue growth' })
  } else fb.add('receivablesVsRevenue', 'Receivables growth minus revenue growth', null, R)

  // ---- financial strength ----
  fb.add('debtToEquity', 'Debt / equity', last?.totalDebt != null && last?.equity > 0 ? last.totalDebt / last.equity : null,
    { ...S, ...src, unit: 'x', period: last?.fy, calc: 'total debt / shareholders’ equity' })
  fb.add('netDebtToEbitda', 'Net debt / EBITDA', last?.ebitda > 0 && last?.totalDebt != null
    ? (last.totalDebt - (last.cash ?? 0)) / last.ebitda : null,
    { ...S, ...src, unit: 'x', period: last?.fy, calc: '(total debt − cash) / EBITDA', why: 'no EBITDA or a loss year' })
  fb.add('interestCover', 'Interest cover', last?.interestExpense > 0 ? (last.ebit ?? last.operatingIncome) / last.interestExpense : null,
    { ...S, ...src, unit: 'x', period: last?.fy, calc: 'EBIT / interest expense', why: 'no interest expense reported (often debt-free)' })
  fb.add('currentRatio', 'Current ratio', last?.currentLiabilities > 0 ? last.currentAssets / last.currentLiabilities : fund?.raw?.currentRatio ?? null,
    { ...S, ...src, unit: 'x', period: last?.fy, calc: 'current assets / current liabilities' })
}
