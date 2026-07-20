import { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { useApp } from '../../context/AppContext'
import { formatCurrency } from '../../utils/formatters'
import { fetchStockChart, fetchMfSeries, fetchStockFundamentals, priceKey } from '../../services/marketData'

const PAPER = '#F5F0E4', INK = '#1B1710'
const GREEN_D = '#84C79B', RUST_D = '#F0844F'          // on-dark (chart card)
const GREEN = '#4E9E6A', RUST = '#D9481C'              // on-paper
const RANGES = ['1M', '6M', '1Y', '5Y', 'MAX']
const RANGE_DAYS = { '1M': 30, '6M': 182, '1Y': 365, '5Y': 1825, MAX: null }

const signed = (v) => `${v >= 0 ? '+' : '−'}${formatCurrency(Math.abs(v))}`
// per-unit prices (NAV/LTP, ranges, avg cost) show paise; holding totals stay whole ₹
const fmtPrice = (v) => v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signedPrice = (v) => `${v >= 0 ? '+' : '−'}${fmtPrice(Math.abs(v))}`
function fmtVol(v) {
  if (v == null) return '—'
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`
  return Math.round(v).toLocaleString('en-IN')
}
function downsample(arr, max) {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  const out = arr.filter((_, i) => i % step === 0)
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1])
  return out
}

function ChartTip({ active, payload, isMf }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: PAPER, color: INK, boxShadow: '0 6px 16px rgba(0,0,0,.3)' }}>
      <div className="font-bold">{fmtPrice(p.close)}</div>
      <div style={{ color: 'rgba(27,23,16,.55)' }}>
        {new Date(p.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
        {isMf ? ' · NAV' : ''}
      </div>
    </div>
  )
}

export default function HoldingDetail({ holding: h, onBack, onEdit, onDelete }) {
  const { prices } = useApp()
  const isMf = h.kind === 'mf'
  const [range, setRange] = useState('6M')
  const [stats, setStats] = useState(null)        // live meta (price + market stats)
  const [mfFull, setMfFull] = useState(null)       // full MF series (oldest-first)
  const [stockCache, setStockCache] = useState({}) // { rangeId: series }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [fund, setFund] = useState(null)          // stock fundamentals
  const [fundState, setFundState] = useState('loading') // loading | ready | error

  // Stocks: fetch fundamentals once (native-only; degrades gracefully in browser)
  useEffect(() => {
    if (isMf) return
    let cancelled = false
    setFundState('loading')
    fetchStockFundamentals(h.symbol)
      .then(f => { if (!cancelled) { setFund(f); setFundState('ready') } })
      .catch(() => { if (!cancelled) setFundState('error') })
    return () => { cancelled = true }
  }, [h.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    async function load() {
      setErr(false)
      try {
        if (isMf) {
          if (mfFull) return
          setLoading(true)
          const { series, meta } = await fetchMfSeries(h.schemeCode)
          if (cancelled) return
          setMfFull(series); setStats(meta)
        } else {
          if (stockCache[range]) return
          setLoading(true)
          const { series, meta } = await fetchStockChart(h.symbol, range)
          if (cancelled) return
          setStockCache(c => ({ ...c, [range]: series })); setStats(meta)
        }
      } catch { if (!cancelled) setErr(true) }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [h.id, range]) // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    if (isMf) {
      if (!mfFull) return []
      const days = RANGE_DAYS[range]
      const cutoff = days ? Date.now() - days * 86400000 : 0
      let f = mfFull.filter(p => p.t >= cutoff)
      if (f.length < 2) f = mfFull.slice(-2)
      return downsample(f, 350)
    }
    return stockCache[range] || []
  }, [isMf, mfFull, stockCache, range])

  const cached = prices[priceKey(h)]
  const price = stats?.price ?? cached?.price ?? null
  const prevClose = stats?.prevClose ?? cached?.prevClose ?? null

  const invested = Number(h.qty) * Number(h.avgBuy)
  const current = price != null ? Number(h.qty) * price : null
  const pnl = current != null ? current - invested : null
  const pnlPct = pnl != null && invested > 0 ? (pnl / invested) * 100 : null
  const dayChange = price != null && prevClose != null ? Number(h.qty) * (price - prevClose) : null
  const dayPct = price != null && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null

  // chart-relative move (first→last visible point)
  const rangeMove = useMemo(() => {
    if (series.length < 2) return null
    const a = series[0].close, b = series[series.length - 1].close
    if (a === b) return null
    return { diff: b - a, pct: a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null }
  }, [series])
  const line = rangeMove ? (rangeMove.diff >= 0 ? GREEN_D : RUST_D) : GREEN_D

  // MF trailing returns (annualized for spans over ~1y), computed from NAV history
  const mfReturns = useMemo(() => {
    if (!isMf || !mfFull || mfFull.length < 2) return null
    const end = mfFull[mfFull.length - 1]
    const periods = [['1M', 30], ['6M', 182], ['1Y', 365], ['3Y', 1095], ['5Y', 1825]]
    const out = []
    for (const [lbl, days] of periods) {
      const cutoff = end.t - days * 86400000
      const start = mfFull.find(p => p.t >= cutoff)
      if (!start || start.t >= end.t || start.close <= 0) continue
      const yrs = (end.t - start.t) / (365.25 * 86400000)
      const total = (end.close / start.close - 1) * 100
      out.push({ lbl, pct: yrs > 1.1 ? (Math.pow(end.close / start.close, 1 / yrs) - 1) * 100 : total, ann: yrs > 1.1 })
    }
    const s0 = mfFull[0]
    const yrs0 = (end.t - s0.t) / (365.25 * 86400000)
    if (yrs0 > 0.25 && s0.close > 0) {
      out.push({ lbl: `Since ${new Date(s0.t).getFullYear()}`, pct: yrs0 > 1.1 ? (Math.pow(end.close / s0.close, 1 / yrs0) - 1) * 100 : (end.close / s0.close - 1) * 100, ann: yrs0 > 1.1 })
    }
    return out
  }, [isMf, mfFull])

  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
  const fundamentals = fund && [
    ['Market cap', fund.marketCap], ['P/E (TTM)', fund.pe], ['Forward P/E', fund.fwdPe],
    ['EPS (TTM)', fund.eps], ['Book value', fund.bookValue], ['P/B ratio', fund.pb],
    ['Dividend yield', fund.divYield], ['Beta', fund.beta],
  ]
  const financials = fund && [
    ['Revenue (TTM)', fund.revenue], ['Profit margin', fund.profitMargin], ['Return on equity', fund.roe],
    ['Debt / equity', fund.debtToEquity], ['Current ratio', fund.currentRatio], ['Revenue growth', fund.revenueGrowth],
  ]
  const analysts = fund && [
    ['Analyst view', cap(fund.recommendation)], ['Avg price target', fund.targetMean],
  ]
  const about = fund && [
    ['Sector', fund.sector], ['Industry', fund.industry], ['Employees', fund.employees],
  ]

  const fmtTick = (t) => {
    const dt = new Date(t)
    return (range === '1M' || range === '6M')
      ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  }

  const marketStats = isMf
    ? [
        ['NAV date', stats?.navDate || '—'],
        ['Category', stats?.category || '—'],
        ['Fund house', stats?.fundHouse || '—'],
        ['Type', stats?.schemeType || '—'],
      ]
    : [
        ['Prev close', fmtPrice(prevClose)],
        ['Day range', stats?.dayLow != null ? `${fmtPrice(stats.dayLow)} – ${fmtPrice(stats.dayHigh)}` : '—'],
        ['52-wk range', stats?.weekLow52 != null ? `${fmtPrice(stats.weekLow52)} – ${fmtPrice(stats.weekHigh52)}` : '—'],
        ['Volume', fmtVol(stats?.volume)],
        ['Exchange', stats?.exchange || '—'],
      ]

  return (
    <div className="fixed inset-0 z-40 bg-paper overflow-y-auto max-w-lg mx-auto">
      <div className="px-6 pt-14 pb-24">
        {/* header */}
        <div className="flex items-center gap-3 rule-2 pb-3">
          <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-xl border-[1.5px] border-ink flex items-center justify-center text-lg active:scale-90">←</button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold leading-tight truncate">{h.name}</div>
            <div className="text-[11px] font-bold text-ink/45 truncate">
              {h.symbol || `AMFI ${h.schemeCode}`}{h.sip?.amount > 0 ? ` · SIP ${formatCurrency(h.sip.amount)}/mo` : ''}
            </div>
          </div>
          <button onClick={() => onEdit(h)} className="px-3 py-2 rounded-xl border-[1.5px] border-ink text-xs font-bold active:scale-95">Edit</button>
        </div>

        {/* chart card */}
        <div className="mt-4 rounded-[22px] pt-5 pb-3 text-paper" style={{ background: INK }}>
          <div className="px-5">
            <div className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.5)' }}>
              {isMf ? 'NAV' : 'LAST PRICE'}
            </div>
            <div className="font-serif-n text-[42px] leading-[1.05] tracking-[-0.5px] mt-0.5">
              {fmtPrice(price)}
            </div>
            {dayChange != null && (
              <div className="text-[12.5px] font-bold mt-1" style={{ color: dayPct >= 0 ? GREEN_D : RUST_D }}>
                {dayPct >= 0 ? '▲' : '▼'} {fmtPrice(Math.abs(price - prevClose))}
                {dayPct != null ? ` (${dayPct >= 0 ? '+' : '−'}${Math.abs(dayPct).toFixed(2)}%)` : ''} today
              </div>
            )}
          </div>

          {/* range move */}
          <div className="px-5 h-5 mt-2">
            {rangeMove && (
              <span className="text-[12px] font-bold" style={{ color: line }}>
                {rangeMove.diff >= 0 ? '▲' : '▼'} {signedPrice(rangeMove.diff)}
                {rangeMove.pct != null ? ` (${rangeMove.diff >= 0 ? '+' : '−'}${Math.abs(rangeMove.pct).toFixed(1)}%)` : ''}
                <span style={{ color: 'rgba(245,240,228,.4)' }}> · {range}</span>
              </span>
            )}
          </div>

          {/* chart / states */}
          <div className="mt-1" style={{ height: 178 }}>
            {loading && !series.length ? (
              <div className="h-full flex items-center justify-center text-[12px]" style={{ color: 'rgba(245,240,228,.4)' }}>Loading chart…</div>
            ) : series.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hdTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={line} stopOpacity={0.34} />
                      <stop offset="100%" stopColor={line} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tickFormatter={fmtTick} minTickGap={46}
                    tick={{ fontSize: 9, fill: 'rgba(245,240,228,.45)', fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip content={<ChartTip isMf={isMf} />} cursor={{ stroke: 'rgba(245,240,228,.3)', strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="close" stroke={line} strokeWidth={2.4} fill="url(#hdTrend)" isAnimationActive={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-8" style={{ color: 'rgba(245,240,228,.5)' }}>
                <span className="text-[13px] font-semibold">Live chart unavailable</span>
                <span className="text-[11.5px] mt-1">
                  {isMf ? 'Needs internet — try again in a moment.' : 'Stock charts open in the installed app (Yahoo blocks the browser).'}
                </span>
              </div>
            )}
          </div>

          {/* range pills */}
          <div className="flex gap-1.5 px-5 mt-1">
            {RANGES.map(r => {
              const on = range === r
              return (
                <button key={r} onClick={() => setRange(r)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                  style={on ? { background: 'rgba(245,240,228,.16)', color: PAPER } : { color: 'rgba(245,240,228,.45)' }}>
                  {r}
                </button>
              )
            })}
          </div>
        </div>

        {/* your holding */}
        <div className="text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2 mt-7 mb-1">YOUR HOLDING</div>
        <div className="grid grid-cols-2 gap-x-4">
          <Stat label={isMf ? 'Units' : 'Quantity'} value={isMf ? Number(h.qty).toFixed(3) : String(h.qty)} />
          <Stat label={isMf ? 'Avg NAV' : 'Avg cost'} value={fmtPrice(h.avgBuy)} />
          <Stat label="Invested" value={formatCurrency(invested)} />
          <Stat label="Current value" value={current != null ? formatCurrency(current) : '—'} />
          <Stat label="Total returns" value={pnl != null ? signed(pnl) : '—'}
            sub={pnlPct != null ? `${pnl >= 0 ? '+' : '−'}${Math.abs(pnlPct).toFixed(2)}%` : null}
            color={pnl == null ? undefined : pnl >= 0 ? GREEN : RUST} />
          <Stat label="Today's change" value={dayChange != null ? signed(dayChange) : '—'}
            sub={dayPct != null ? `${dayPct >= 0 ? '+' : '−'}${Math.abs(dayPct).toFixed(2)}%` : null}
            color={dayChange == null ? undefined : dayChange >= 0 ? GREEN : RUST} />
        </div>

        {/* MF: trailing returns */}
        {isMf && mfReturns?.length > 0 && (
          <>
            <div className="text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2 mt-7 mb-1">RETURNS</div>
            <div className="divide-y divide-ink/8">
              {mfReturns.map(r => (
                <div key={r.lbl} className="flex items-center justify-between py-3 gap-4">
                  <span className="text-[12.5px] text-ink/55">{r.lbl}{r.ann ? ' · p.a.' : ''}</span>
                  <span className="text-[14px] font-bold" style={{ color: r.pct >= 0 ? GREEN : RUST }}>
                    {r.pct >= 0 ? '+' : '−'}{Math.abs(r.pct).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-ink/40 pt-1.5">Past returns don't guarantee future results.</p>
          </>
        )}

        {/* price stats / fund info */}
        <KVSection title={isMf ? 'FUND INFO' : 'PRICE STATS'} rows={marketStats} />

        {/* stock: fundamentals, financials, analysts, about */}
        {!isMf && (
          <>
            {fundState === 'loading' && !fund && (
              <p className="text-[12px] text-ink/45 pt-6">Loading fundamentals…</p>
            )}
            {fundState === 'error' && !fund && (
              <p className="text-[12px] text-ink/45 pt-6 leading-snug">
                Fundamentals (P/E, financials, ownership) load in the installed app — Yahoo blocks them in the browser.
              </p>
            )}
            {fund && (
              <>
                <KVSection title="FUNDAMENTALS" rows={fundamentals} />
                <KVSection title="FINANCIALS" rows={financials} />
                <KVSection title="ANALYST VIEW" rows={analysts} />
                <KVSection title="ABOUT" rows={about} />
                {fund.summary && (
                  <p className="text-[12.5px] text-ink/65 leading-relaxed pt-3">{fund.summary}</p>
                )}
              </>
            )}
          </>
        )}
        {isMf && err && !stats && <p className="text-[12px] text-ink/45 py-2">Couldn't load live data — showing what's saved on your device.</p>}

        {/* remove */}
        <button onClick={() => onDelete(h)} className="w-full mt-7 py-3.5 rounded-2xl border-[1.5px] border-brand text-brand font-bold text-sm active:scale-[0.98]">
          Remove from portfolio
        </button>
        <p className="text-center text-[11px] text-ink/40 pt-4">
          {isMf ? 'NAV & fund data via AMFI (mfapi.in)' : 'Prices & stats via Yahoo Finance'}
        </p>
      </div>
    </div>
  )
}

// Key/value list; skips empty rows and hides the whole section if nothing's filled.
function KVSection({ title, rows }) {
  const filled = (rows || []).filter(([, v]) => v != null && v !== '')
  if (!filled.length) return null
  return (
    <>
      <div className="text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2 mt-7 mb-1">{title}</div>
      <div className="divide-y divide-ink/8">
        {filled.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-3 gap-4">
            <span className="text-[12.5px] text-ink/55 shrink-0">{k}</span>
            <span className="text-[13px] font-semibold text-right">{v}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="py-3 rule-dot">
      <div className="text-[10px] font-bold tracking-[1px] text-ink/45">{label.toUpperCase()}</div>
      <div className="font-serif-n text-[19px] mt-0.5 leading-tight" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[11.5px] font-bold mt-0.5" style={color ? { color } : { color: 'rgba(27,23,16,.5)' }}>{sub}</div>}
    </div>
  )
}
