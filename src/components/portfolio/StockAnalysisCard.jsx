import { useEffect, useState } from 'react'
import { analyseStock } from '../../services/stockAnalysis'
import { loadAnalysis, saveAnalysis } from '../../services/analysisStore'

// On-demand AI stock analysis, styled as an ordinary section of the holding page (same
// headings, rules and serif figures as ABOUT / NEWS) rather than a separate widget.
//
// Nothing is fetched or sent until the user taps Analyse. The figures come from
// stockAnalysis.js (computed on-device); the model supplies judgement and wording only.
// A report is saved for 7 days (analysisStore.js) and every call is kept in a track record.

const VERDICT_COLOR = { BUY: '#4E9E6A', WATCH: '#B5761F', AVOID: '#D9481C' }
const H = 'text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2'
const SUB = 'text-[10px] font-bold tracking-[1.5px] text-ink/55'

const inr = (v) => `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`
const price2 = (v) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// sign decided on the *rounded* value, so a tiny negative never prints as "−0.0%"
const signed = (v, d = 1) => {
  const r = Number(v.toFixed(d))
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}%`
}
const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export default function StockAnalysisCard({ symbol, name, position, currentPrice }) {
  const [state, setState] = useState('loading-saved')   // loading-saved | idle | running | done | error
  const [step, setStep] = useState('')
  const [latest, setLatest] = useState(null)
  const [stale, setStale] = useState(null)
  const [history, setHistory] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let off = false
    loadAnalysis(symbol).then(s => {
      if (off) return
      setLatest(s.latest); setStale(s.stale); setHistory(s.history)
      setState(s.latest ? 'done' : 'idle')
    }).catch(() => !off && setState('idle'))
    return () => { off = true }
  }, [symbol])

  async function run() {
    setState('running'); setErr(''); setStep('Starting')
    try {
      const res = await analyseStock(symbol, name, s => setStep(s.replace(/…$/, '')), position)
      const saved = await saveAnalysis(symbol, res)
      setLatest(saved.latest); setHistory(saved.history); setStale(null)
      setState('done')
    } catch (e) {
      setErr(String(e?.message || e)); setState('error')
    }
  }

  if (state === 'loading-saved') return null

  return (
    <section className="mt-7">
      <div className={`${H} flex items-baseline justify-between`}>
        <span>AI ANALYSIS</span>
        {state === 'done' && (
          <button onClick={run} className="text-[10.5px] font-bold tracking-[1.5px] text-brand active:opacity-60">REFRESH</button>
        )}
      </div>

      {state === 'done' && latest
        ? <Report latest={latest} />
        : <Intro state={state} step={step} err={err} stale={stale} onRun={run} />}

      <TrackRecord history={history} currentPrice={currentPrice} />
    </section>
  )
}

// ---- idle / running / error ----
function Intro({ state, step, err, stale, onRun }) {
  if (state === 'running') {
    return (
      <div className="py-5">
        <p className="font-serif-i text-[20px] leading-snug">{step}…</p>
        <p className="text-[12px] text-ink/45 mt-1">Gathering prices, peers, sector drivers and news. This takes a few seconds.</p>
      </div>
    )
  }
  return (
    <div className="pt-4 pb-1">
      <p className="text-[13.5px] leading-relaxed text-ink/80">
        {state === 'error'
          ? err || 'The analysis could not be completed.'
          : 'A research note on this stock in context — its sector and price drivers, comparable competitors, quarterly results and the latest news.'}
      </p>
      {stale && state !== 'error' && (
        <p className="text-[12px] text-ink/45 mt-2">Last analysed {day(stale.generatedAt)} — reports are kept for 7 days.</p>
      )}
      <button onClick={onRun}
        className="w-full mt-4 py-3.5 rounded-2xl bg-ink text-paper text-sm font-bold active:scale-[0.98] transition-transform">
        {state === 'error' ? 'Try again' : 'Analyse this stock'}
      </button>
    </div>
  )
}

// ---- the report ----
function Report({ latest }) {
  const r = latest.report, m = latest.meta
  const color = VERDICT_COLOR[r.verdict] || VERDICT_COLOR.WATCH
  const when = new Date(latest.generatedAt)

  return (
    <div>
      {/* verdict line */}
      <div className="flex items-end justify-between pt-4">
        <div>
          <div className={SUB}>SCORE</div>
          <div className="font-serif-n text-[56px] leading-[0.95] tracking-[-1px]">
            {r.score ?? '—'}<span className="text-[22px] text-ink/35 tracking-normal"> / 100</span>
          </div>
        </div>
        <div className="text-right pb-1.5">
          <div className={SUB}>VERDICT</div>
          <div className="text-[15px] font-bold tracking-[2px] mt-0.5" style={{ color }}>{r.verdict}</div>
        </div>
      </div>
      <div className="h-1 mt-3" style={{ background: 'rgba(27,23,16,.14)' }}>
        <div className="h-full" style={{ width: `${r.score ?? 0}%`, background: color }} />
      </div>

      {r.headline && <p className="font-serif-i text-[22px] leading-snug mt-5">{r.headline}</p>}

      {m.position && <Holding pos={m.position} text={r.position} />}

      <Para title="TECHNICALS" body={r.technicals} />
      <Para title="VALUATION" body={r.valuation} />
      <Para title="RESULTS & EARNINGS" body={r.earnings} />
      <Para title="SECTOR & DRIVERS" body={r.sector} />
      <Para title="KEY LEVELS" body={r.levels} />

      <List title="CATALYSTS" items={r.catalysts} color="#4E9E6A" />
      <List title="RISKS" items={r.risks} color="#D9481C" />

      <Para title="VERDICT" body={r.verdictText} />

      {!!r.missing?.length && (
        <p className="text-[12px] text-ink/45 leading-snug mt-4">Not available: {r.missing.join(' · ')}</p>
      )}

      <p className="text-[11px] text-ink/40 leading-snug mt-5 pt-3" style={{ borderTop: '1px dotted rgba(27,23,16,.32)' }}>
        {when.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {' '}· {m.peers} peers · {m.drivers} market drivers · {m.headlines} headlines.
        {' '}Research and education only, not investment advice.
      </p>
    </div>
  )
}

// Your holding — the Home screen's stat-row language (ink rule, dotted dividers, serif values).
function Holding({ pos, text }) {
  const up = pos.pnl >= 0
  const cells = [
    { l: 'YOUR P&L', v: `${up ? '+' : '−'}${inr(pos.pnl)}`, s: pos.pnlPct != null ? signed(pos.pnlPct, 2) : null, c: up ? '#4E9E6A' : '#D9481C' },
    { l: 'OF PORTFOLIO', v: pos.weightPct != null ? `${pos.weightPct}%` : '—' },
    { l: 'AVG COST', v: price2(pos.avgBuy), s: `${pos.qty} shares` },
  ]
  return (
    <div className="mt-6">
      <div className="flex border-t border-ink" style={{ borderBottom: '1px solid rgba(27,23,16,.25)' }}>
        {cells.map((x, i) => (
          <div key={x.l} className="flex-1 min-w-0 py-3"
            style={{ paddingLeft: i ? 12 : 0, paddingRight: i < 2 ? 12 : 0, borderRight: i < 2 ? '1px dotted rgba(27,23,16,.32)' : 'none' }}>
            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 truncate">{x.l}</div>
            <div className="font-serif-n text-[21px] leading-tight truncate" style={x.c ? { color: x.c } : undefined}>{x.v}</div>
            {x.s && <div className="text-[11px] truncate" style={{ color: x.c || 'rgba(27,23,16,.5)' }}>{x.s}</div>}
          </div>
        ))}
      </div>
      {text && <p className="text-[13.5px] leading-relaxed text-ink/85 mt-3">{text}</p>}
      {(pos.nearestSupport || pos.stop2Atr) && (
        <p className="text-[11.5px] text-ink/45 mt-1.5">
          Reference levels{pos.nearestSupport ? ` · support ${price2(pos.nearestSupport)}` : ''}{pos.stop2Atr ? ` · 2×ATR ${price2(pos.stop2Atr)}` : ''}. Not a sell signal.
        </p>
      )}
    </div>
  )
}

function Para({ title, body }) {
  if (!body) return null
  return (
    <div className="mt-5">
      <div className={`${SUB} mb-1`}>{title}</div>
      <p className="text-[13.5px] leading-relaxed text-ink/85">{body}</p>
    </div>
  )
}

function List({ title, items, color }) {
  if (!items?.length) return null
  return (
    <div className="mt-5">
      <div className="text-[10px] font-bold tracking-[1.5px] mb-1" style={{ color }}>{title}</div>
      {items.map((t, i) => (
        <div key={i} className="flex gap-2.5 py-1.5 text-[13.5px] leading-snug text-ink/85"
          style={i ? { borderTop: '1px dotted rgba(27,23,16,.25)' } : undefined}>
          <span className="text-ink/35">—</span><span>{t}</span>
        </div>
      ))}
    </div>
  )
}

// ---- how past calls played out ----
function TrackRecord({ history, currentPrice }) {
  if (!history?.length) return null
  return (
    <div className="mt-7">
      <div className={`${SUB} pb-2`} style={{ borderBottom: '1px solid rgba(27,23,16,.25)' }}>PAST CALLS</div>
      {history.map((h, i) => {
        // A call under a day old has had no time to play out — comparing it is just noise.
        const fresh = Date.now() - new Date(h.at).getTime() < 864e5
        const move = !fresh && currentPrice && h.price ? ((currentPrice - h.price) / h.price) * 100 : null
        const color = VERDICT_COLOR[h.verdict] || 'inherit'
        return (
          <div key={h.at} className="flex items-baseline gap-3 py-2.5 text-[13px]"
            style={i ? { borderTop: '1px dotted rgba(27,23,16,.25)' } : undefined}>
            <span className="w-14 text-ink/55 shrink-0">{day(h.at)}</span>
            <span className="w-16 shrink-0 text-[11px] font-bold tracking-[1.5px]" style={{ color }}>{h.verdict}</span>
            <span className="text-ink/55 shrink-0">{h.score}</span>
            <span className="flex-1 text-right text-ink/70 truncate">
              {h.price ? price2(h.price) : '—'}
              {!fresh && currentPrice ? <> → {price2(currentPrice)}</> : null}
            </span>
            <span className="w-14 text-right font-semibold shrink-0"
              style={{ color: move == null ? 'rgba(27,23,16,.4)' : move >= 0 ? '#4E9E6A' : '#D9481C' }}>
              {move != null ? signed(move) : fresh ? 'today' : '—'}
            </span>
          </div>
        )
      })}
      <p className="text-[11px] text-ink/40 mt-1.5">Price when each call was made, against today's price.</p>
    </div>
  )
}
