// Technical indicators — pure functions, no network, no dependencies.
//
// These exist so the AI never has to do arithmetic: every number the stock-analysis
// prompt quotes is computed here from raw OHLCV and handed over as a finished figure
// (same discipline as aiContext.js). The model interprets; it does not calculate.
//
// Input everywhere is the `series` from fetchStockChart(): oldest-first rows of
// { t, open, high, low, close, volume }. Daily bars are assumed (range '1Y').

const last = (a) => (a.length ? a[a.length - 1] : null)
const r1 = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)))

// ---- Moving averages ----
export function sma(values, period) {
  if (values.length < period) return null
  let sum = 0
  for (let i = values.length - period; i < values.length; i++) sum += values[i]
  return sum / period
}

// Full EMA series (needed by MACD, which runs an EMA over another EMA's history).
export function emaSeries(values, period) {
  if (values.length < period) return []
  const k = 2 / (period + 1)
  const out = []
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period   // seed with SMA
  out.push(prev)
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

export const ema = (values, period) => last(emaSeries(values, period))

// ---- RSI (Wilder's smoothing) ----
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d; else loss -= d
  }
  gain /= period; loss /= period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (loss === 0) return 100
  return 100 - 100 / (1 + gain / loss)
}

// ---- MACD + how long ago it crossed ----
// The crossover *age* matters more than the raw value: "turned bullish 4 days ago" is
// actionable, "MACD is 2.13" is not.
export function macd(closes, fast = 12, slow = 26, signalP = 9) {
  if (closes.length < slow + signalP) return null
  const fastE = emaSeries(closes, fast), slowE = emaSeries(closes, slow)
  // align: fast EMA starts earlier, so trim its head
  const offset = fastE.length - slowE.length
  const line = slowE.map((s, i) => fastE[i + offset] - s)
  const signal = emaSeries(line, signalP)
  const lineTail = line.slice(line.length - signal.length)
  const hist = lineTail.map((v, i) => v - signal[i])

  // walk back to the most recent sign flip in the histogram
  let crossAgo = null
  const h = hist[hist.length - 1]
  for (let i = hist.length - 2; i >= 0; i--) {
    if (Math.sign(hist[i]) !== Math.sign(h)) { crossAgo = hist.length - 1 - i; break }
  }
  return {
    macd: r1(last(lineTail), 3), signal: r1(last(signal), 3), hist: r1(h, 3),
    trend: h > 0 ? 'bullish' : 'bearish',
    crossedDaysAgo: crossAgo,
  }
}

// ---- Bollinger Bands ----
export function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null
  const win = closes.slice(-period)
  const mid = win.reduce((s, v) => s + v, 0) / period
  const sd = Math.sqrt(win.reduce((s, v) => s + (v - mid) ** 2, 0) / period)
  const upper = mid + mult * sd, lower = mid - mult * sd
  const price = last(closes)
  return {
    upper: r1(upper), mid: r1(mid), lower: r1(lower),
    // %B: 0 = on lower band, 1 = on upper. Bandwidth flags squeeze vs expansion.
    pctB: r1(upper === lower ? null : (price - lower) / (upper - lower), 2),
    bandwidthPct: r1(((upper - lower) / mid) * 100),
  }
}

// ---- ATR (Wilder) — volatility, used to size sensible stop-loss distances ----
export function atr(series, period = 14) {
  const rows = series.filter(p => p.high != null && p.low != null)
  if (rows.length < period + 1) return null
  const tr = []
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i - 1], c = rows[i]
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
  }
  let v = tr.slice(0, period).reduce((s, x) => s + x, 0) / period
  for (let i = period; i < tr.length; i++) v = (v * (period - 1) + tr[i]) / period
  return v
}

// ---- Support & resistance from swing pivots ----
// A bar is a pivot high if it's the highest of the `k` bars either side (and vice versa).
// Nearby pivots are then clustered so we report distinct *levels*, not 30 near-identical ones.
export function levels(series, k = 5, price = null) {
  const rows = series.filter(p => p.high != null && p.low != null)
  if (rows.length < k * 2 + 1) return { support: [], resistance: [] }
  const hi = [], lo = []
  for (let i = k; i < rows.length - k; i++) {
    let isHi = true, isLo = true
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue
      if (rows[j].high >= rows[i].high) isHi = false
      if (rows[j].low <= rows[i].low) isLo = false
    }
    if (isHi) hi.push(rows[i].high)
    if (isLo) lo.push(rows[i].low)
  }
  const p = price ?? last(rows).close
  const cluster = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const out = []
    for (const v of sorted) {
      const prev = out[out.length - 1]
      // within 1.5% → same level; average them
      if (prev && Math.abs(v - prev.v) / prev.v < 0.015) { prev.v = (prev.v * prev.n + v) / (prev.n + 1); prev.n++ }
      else out.push({ v, n: 1 })
    }
    return out
  }
  // strongest = touched most often; report the nearest few on each side
  const sup = cluster(lo).filter(x => x.v < p).sort((a, b) => b.v - a.v).slice(0, 3)
  const res = cluster(hi).filter(x => x.v > p).sort((a, b) => a.v - b.v).slice(0, 3)
  const fmt = (x) => ({ price: r1(x.v), touches: x.n })
  return { support: sup.map(fmt), resistance: res.map(fmt) }
}

// ---- Trailing returns ----
// Daily bars: ~21 per month, 252 per year. Falls back to the oldest bar available.
const BARS = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1Y': 252 }
export function returns(closes) {
  const p = last(closes)
  const out = {}
  if (!p) return Object.fromEntries(Object.keys(BARS).map(k => [k, null]))
  for (const [k, n] of Object.entries(BARS)) {
    let i = closes.length - 1 - n
    // Short of a full window (a 1Y fetch yields ~248 bars, not 252) fall back to the
    // oldest bar we have — but only if it covers most of the period, so a 5-bar series
    // can't masquerade as a 1-year return.
    if (i < 0) i = closes.length - 1 >= n * 0.6 ? 0 : -1
    const base = i >= 0 ? closes[i] : null
    out[k] = base ? r1(((p - base) / base) * 100) : null
  }
  return out
}

// Equal-weighted average return across several series — a synthetic sector benchmark.
// Needed because most NIFTY sectoral indices expose no history on Yahoo (quote only),
// whereas the peer stocks themselves all do.
export function averageReturns(returnsList) {
  const out = {}
  for (const k of Object.keys(BARS)) {
    const vals = returnsList.map(r => r?.[k]).filter(v => v != null)
    out[k] = vals.length ? r1(vals.reduce((s, v) => s + v, 0) / vals.length) : null
  }
  return out
}

// a − b, period by period.
export function diffReturns(a, b) {
  const out = {}
  for (const k of Object.keys(BARS)) out[k] = a?.[k] != null && b?.[k] != null ? r1(a[k] - b[k]) : null
  return out
}

export function maxDrawdown(closes) {
  let peak = -Infinity, worst = 0
  for (const c of closes) { if (c > peak) peak = c; const dd = (c - peak) / peak; if (dd < worst) worst = dd }
  return r1(worst * 100)
}

// ---- Volume: is today's activity unusual? ----
export function volumeStats(series) {
  const vols = series.map(p => p.volume).filter(v => v != null && v > 0)
  if (vols.length < 21) return null
  const avg20 = vols.slice(-20).reduce((s, v) => s + v, 0) / 20
  const latest = last(vols)
  return { latest, avg20: Math.round(avg20), ratio: r1(latest / avg20), spike: latest > avg20 * 1.8 }
}

// ---- Everything, in one call ----
// Returns a flat object of finished numbers, ready to be printed into a prompt.
export function computeTechnicals(series, meta = {}) {
  const rows = series.filter(p => p.close != null)
  if (rows.length < 30) return null
  const closes = rows.map(p => p.close)
  const price = meta.price ?? last(closes)

  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200)
  const a = atr(rows, 14)
  const hi52 = meta.weekHigh52 ?? Math.max(...closes)
  const lo52 = meta.weekLow52 ?? Math.min(...closes)
  const rs = rsi(closes, 14)

  return {
    price: r1(price),
    bars: rows.length,
    sma20: r1(s20), sma50: r1(s50), sma200: r1(s200),
    // Position vs the moving averages is the fastest read on trend health.
    aboveSma50: s50 != null ? price > s50 : null,
    aboveSma200: s200 != null ? price > s200 : null,
    goldenCross: s50 != null && s200 != null ? s50 > s200 : null,
    rsi: r1(rs, 1),
    rsiZone: rs == null ? null : rs >= 70 ? 'overbought' : rs <= 30 ? 'oversold' : 'neutral',
    macd: macd(closes),
    bollinger: bollinger(closes),
    atr: r1(a),
    atrPct: r1(a != null && price ? (a / price) * 100 : null),
    levels: levels(rows, 5, price),
    returns: returns(closes),
    maxDrawdownPct: maxDrawdown(closes),
    high52: r1(hi52), low52: r1(lo52),
    fromHigh52Pct: r1(hi52 ? ((price - hi52) / hi52) * 100 : null),
    fromLow52Pct: r1(lo52 ? ((price - lo52) / lo52) * 100 : null),
    volume: volumeStats(rows),
  }
}

// Relative strength: the stock's return minus its benchmark's, over the same window.
// Positive = outperforming. This is the single most useful comparison in the report.
export function relativeStrength(stockCloses, benchCloses) {
  const a = returns(stockCloses), b = returns(benchCloses)
  const out = {}
  for (const k of Object.keys(BARS)) {
    out[k] = a[k] != null && b[k] != null ? r1(a[k] - b[k]) : null
  }
  return out
}
