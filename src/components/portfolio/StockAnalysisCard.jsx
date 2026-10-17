import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { analyseStock, VERDICTS, PILLARS } from '../../services/stockAnalysis'
import { loadAnalysis, saveAnalysis, evaluateCalls, verdictKey, HORIZONS } from '../../services/analysisStore'
import { fetchStockChart } from '../../services/marketData'
import { showValue } from '../../services/research/facts'

// On-demand AI stock analysis, styled as an ordinary section of the holding page (same
// headings, rules and serif figures as ABOUT / NEWS) rather than a separate widget.
//
// Nothing is fetched or sent until the user taps Analyse. The figures come from
// stockAnalysis.js (computed on-device); the model supplies judgement and wording only.
// A report is saved for 7 days (analysisStore.js) and every call is kept in a track record.

const VERDICT_COLOR = { POSITIVE: '#4E9E6A', NEUTRAL: '#B5761F', NEGATIVE: '#D9481C', INSUFFICIENT: '#8A8070' }
const vColor = (v) => VERDICT_COLOR[verdictKey(v)] || VERDICT_COLOR.NEUTRAL
const vLabel = (v) => VERDICTS[verdictKey(v)] || v
const H = 'text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2'

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
  const [open, setOpen] = useState(false)          // full report sheet

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
      setState('done'); setOpen(true)              // a fresh report opens straight away
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
        ? <Summary latest={latest} onOpen={() => setOpen(true)} />
        : <Intro state={state} step={step} err={err} stale={stale} onRun={run} />}

      {/* The full note opens in its own sheet so the holding page stays short. */}
      {open && latest && (
        <ReportSheet onClose={() => setOpen(false)}>
          {latest.report?.version === 2
            ? <ResearchNote latest={latest} name={name} symbol={symbol} />
            : <Report latest={latest} name={name} symbol={symbol} />}
          <TrackRecord history={history} currentPrice={currentPrice} symbol={symbol} />
        </ReportSheet>
      )}
    </section>
  )
}

// ---- on the holding page: just the verdict and a way in ----
function Summary({ latest, onOpen }) {
  const r = latest.report
  const color = vColor(r.verdict)
  const insufficient = verdictKey(r.verdict) === 'INSUFFICIENT'
  return (
    <button onClick={onOpen} className="w-full text-left pt-4 pb-1 active:opacity-80">
      <div className="flex items-stretch border-y-[1.5px] border-ink">
        <div className="px-3 py-2.5 flex flex-col justify-center" style={{ background: color, color: '#F5F0E4', margin: '-1.5px 0' }}>
          <div className="text-[8.5px] font-bold tracking-[1.5px] opacity-80">ASSESSMENT</div>
          <div className={`${insufficient ? 'text-[12px] leading-tight' : 'text-[15px]'} font-bold tracking-[1.2px] uppercase`}>{vLabel(r.verdict)}</div>
        </div>
        <div className="px-3.5 py-2.5 flex flex-col justify-center" style={{ borderRight: '1px dotted rgba(27,23,16,.3)' }}>
          <div className="text-[8.5px] font-bold tracking-[1.5px] text-ink/50">SCORE</div>
          <div className="font-serif-n text-[20px] leading-tight">{r.score ?? '—'}<span className="text-[12px] text-ink/40"> / 100</span></div>
        </div>
        <div className="px-3.5 py-2.5 flex flex-col justify-center min-w-0">
          <div className="text-[8.5px] font-bold tracking-[1.5px] text-ink/50">{r.coverage != null ? 'EVIDENCE' : 'NOTE OF'}</div>
          <div className="text-[13px] font-semibold">{r.coverage != null ? `${Math.round(r.coverage * 100)}% · ${day(latest.generatedAt)}` : day(latest.generatedAt)}</div>
        </div>
      </div>
      {r.headline && <p className="font-serif-i text-[20px] leading-snug mt-3.5">{r.headline}</p>}
      <div className="w-full mt-4 py-3.5 rounded-2xl bg-ink text-paper text-sm font-bold text-center">Read full report →</div>
    </button>
  )
}

// Full-screen sheet over the holding page; closes with ✕.
function ReportSheet({ onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  // Portalled to <body>: inside the holding page it would share that page's stacking layer
  // and the bottom nav (painted later at the same z-index) would cover it.
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-paper overflow-y-auto max-w-lg mx-auto animate-fade-in">
      <div className="sticky top-0 z-10 bg-paper px-6 pt-12 pb-2.5 flex items-center justify-between border-b border-ink">
        <span className="font-serif-i text-[24px] leading-none">Research note</span>
        <button onClick={onClose} aria-label="Close report"
          className="w-9 h-9 rounded-xl border-[1.5px] border-ink flex items-center justify-center text-lg active:scale-90">✕</button>
      </div>
      <div className="px-6 pb-16">{children}</div>
    </div>,
    document.body,
  )
}

// ---- idle / running / error ----
function Intro({ state, step, err, stale, onRun }) {
  if (state === 'running') {
    return (
      <div className="py-5">
        <p className="font-serif-i text-[20px] leading-snug">{step}…</p>
        <p className="text-[12px] text-ink/45 mt-1">Gathering four years of financials, prices, comparable companies, sector drivers and news — then scoring and checking the evidence. About 20–30 seconds.</p>
      </div>
    )
  }
  return (
    <div className="pt-4 pb-1">
      <p className="text-[13.5px] leading-relaxed text-ink/80">
        {state === 'error'
          ? err || 'The analysis could not be completed.'
          : 'A research note built from evidence: four years of financials, valuation against comparable companies and its own history, market behaviour and risk — scored by fixed rules, explained by AI, every figure checked.'}
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
// Laid out like a broker's research note: a masthead with the rating box, an investment
// summary up front, a key-data table, numbered sections, upside/downside side by side,
// and disclosures in small print. Every figure in the tables comes from `meta` (computed);
// only the prose is the model's.
const INK = '#1B1710', GREEN = '#4E9E6A', RUST = '#D9481C'
const rowB = { borderTop: '1px dotted rgba(27,23,16,.28)' }

function Report({ latest, name, symbol }) {
  const r = latest.report, m = latest.meta, snap = m.snapshot || {}
  const color = vColor(r.verdict)
  const when = new Date(latest.generatedAt)
  const upside = snap.target && m.price ? ((snap.target - m.price) / m.price) * 100 : null
  const sections = [
    ['Technicals', r.technicals], ['Valuation', r.valuation], ['Results & earnings', r.earnings],
    ['Sector & drivers', r.sector], ['Key levels', r.levels],
  ].filter(([, b]) => b)

  return (
    <div className="pt-4">
      {/* masthead */}
      <div className="flex justify-between text-[9.5px] font-bold tracking-[1.8px] text-ink/50">
        <span className="truncate pr-3">EQUITY RESEARCH · {(snap.theme || snap.industry || 'INDIA').toUpperCase()}</span>
        <span className="shrink-0">{when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}</span>
      </div>
      <div className="font-serif-n text-[32px] leading-none mt-2">{tidyName(name)}</div>
      <div className="text-[11.5px] text-ink/50 mt-1">{symbol}{snap.sector ? ` · ${snap.sector}` : ''}</div>

      {/* rating box */}
      <div className="grid grid-cols-3 mt-4 border-y-[1.5px] border-ink">
        <div className="py-3 pr-3 flex flex-col justify-center" style={{ background: color, color: '#F5F0E4', margin: '-1.5px 0' }}>
          <div className="text-[9px] font-bold tracking-[1.6px] opacity-80 pl-3">RATING</div>
          <div className="text-[17px] font-bold tracking-[2px] pl-3 mt-0.5 uppercase">{vLabel(r.verdict)}</div>
        </div>
        <Cell label="SCORE" value={<>{r.score ?? '—'}<span className="text-[13px] text-ink/40"> / 100</span></>} />
        <Cell label="PRICE AT NOTE" value={m.price ? price2(m.price) : '—'} last />
      </div>

      {r.headline && <p className="font-serif-i text-[23px] leading-[1.2] mt-5">{r.headline}</p>}

      {/* investment summary, with a drop cap */}
      {r.verdictText && (
        <div className="mt-5">
          <SecHead>Investment summary</SecHead>
          <p className="text-[14px] leading-[1.65] text-ink/85 mt-2">
            <span className="font-serif-n float-left text-[46px] leading-[0.85] mr-1.5 mt-1" style={{ color }}>{r.verdictText.charAt(0)}</span>
            {r.verdictText.slice(1)}
          </p>
        </div>
      )}

      {/* key data */}
      <KeyData snap={snap} price={m.price} upside={upside} />

      {m.position && <Holding pos={m.position} text={r.position} />}

      {/* numbered sections */}
      {sections.map(([t, body], i) => (
        <div key={t} className="mt-6">
          <div className="flex items-baseline gap-3 pb-1.5 border-b border-ink">
            <span className="font-serif-i text-[22px] leading-none" style={{ color }}>{i + 1}</span>
            <span className="text-[11px] font-bold tracking-[1.8px]">{t.toUpperCase()}</span>
          </div>
          <p className="text-[13.5px] leading-[1.65] text-ink/85 mt-2.5">{body}</p>
          {t === 'Valuation' && snap.peers?.length > 0 && <PeerTable snap={snap} name={name} />}
        </div>
      ))}

      {/* upside / downside */}
      {(r.catalysts?.length > 0 || r.risks?.length > 0) && (
        <div className="grid grid-cols-2 gap-4 mt-7 pt-3 border-t-[1.5px] border-ink">
          <Points title="UPSIDE" mark="▲" color={GREEN} items={r.catalysts} />
          <Points title="DOWNSIDE" mark="▼" color={RUST} items={r.risks} />
        </div>
      )}

      {!!r.missing?.length && (
        <p className="text-[12px] text-ink/45 leading-snug mt-5">Not available: {r.missing.join(' · ')}</p>
      )}

      {/* disclosures */}
      <div className="mt-6 px-3.5 py-3 text-[10.5px] leading-[1.55] text-ink/50" style={{ background: 'rgba(27,23,16,.045)' }}>
        <span className="font-bold tracking-[1.2px] text-ink/60">DISCLOSURES · </span>
        Written by an AI model (DeepSeek) from data gathered on {when.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}:
        {' '}{m.peers} size-matched peers, {m.drivers} market drivers and {m.headlines} news headlines. All figures are
        computed in the app; the model supplies the reading only. Research and education, not investment advice.
      </div>
    </div>
  )
}

function SecHead({ children }) {
  return <div className="text-[11px] font-bold tracking-[1.8px] pb-1.5 border-b border-ink">{children.toUpperCase()}</div>
}

function Cell({ label, value, last }) {
  return (
    <div className="py-3 pl-3" style={last ? undefined : { borderRight: '1px dotted rgba(27,23,16,.3)' }}>
      <div className="text-[9px] font-bold tracking-[1.6px] text-ink/50">{label}</div>
      <div className="font-serif-n text-[22px] leading-tight">{value}</div>
    </div>
  )
}

function KeyData({ snap, price, upside }) {
  const rows = [
    ['Market cap', snap.marketCap],
    ['P/E (TTM)', snap.pe],
    ['52-week range', snap.low52 != null ? `${price2(snap.low52)} – ${price2(snap.high52)}` : null],
    ['1-year return', snap.ret1y != null ? signed(snap.ret1y) : null, snap.ret1y != null ? (snap.ret1y >= 0 ? GREEN : RUST) : null],
    ['RSI (14)', snap.rsi],
    ['Broker target', snap.target ? `${price2(snap.target)}${upside != null ? ` (${signed(upside)})` : ''}` : null, upside != null ? (upside >= 0 ? GREEN : RUST) : null],
    ['Broker ratings', snap.ratings ? `${snap.ratings.buy} buy · ${snap.ratings.hold} hold · ${snap.ratings.sell} sell` : null],
    ['Next results', snap.nextResults && !isNaN(new Date(snap.nextResults))
      ? new Date(snap.nextResults).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : snap.nextResults],
  ].filter(([, v]) => v != null && v !== '')
  if (!rows.length) return null
  return (
    <div className="mt-6">
      <SecHead>Key data</SecHead>
      <div className="grid grid-cols-2 gap-x-4">
        {rows.map(([k, v, c], i) => (
          <div key={k} className="py-2" style={i >= 2 ? rowB : undefined}>
            <div className="text-[9.5px] font-bold tracking-[1.2px] text-ink/45 uppercase">{k}</div>
            <div className="text-[13.5px] font-semibold mt-0.5" style={c ? { color: c } : undefined}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Exchange listings come in capitals ("JSW STEEL LIMITED") — print them as names.
const SMALL = { OF: 'of', AND: 'and', THE: 'the', N: '&' }
const tidyName = (n) => /[a-z]/.test(n) ? n : n.split(/\s+/)
  .filter((w, i, a) => !(i === a.length - 1 && /^(LIMITED|LTD\.?|L)$/.test(w)))   // "…LIMITED", cut-off "…L"
  .map(w => SMALL[w] ?? (w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase()))   // keep JSW, SBI
  .join(' ')

function PeerTable({ snap, name }) {
  const rows = [{ name, pe: snap.pe, self: true }, ...snap.peers]
  return (
    <div className="mt-3 text-[12.5px]">
      <div className="flex justify-between text-[9.5px] font-bold tracking-[1.2px] text-ink/45 pb-1">
        <span>PEERS BY SIZE</span><span>P/E</span>
      </div>
      {rows.map((p, i) => (
        <div key={p.name + i} className="flex justify-between py-1.5" style={rowB}>
          <span className={`truncate pr-3 ${p.self ? 'font-bold' : 'text-ink/75'}`}>{tidyName(p.name)}</span>
          <span className={`font-serif-n text-[15px] ${p.self ? '' : 'text-ink/70'}`}>{p.pe ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

function Points({ title, mark, color, items }) {
  if (!items?.length) return <div />
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold tracking-[1.8px] pb-1.5" style={{ color }}>{title}</div>
      {items.map((t, i) => (
        <div key={i} className="flex gap-1.5 py-2 text-[12.5px] leading-snug text-ink/85" style={rowB}>
          <span className="text-[8px] mt-[5px] shrink-0" style={{ color }}>{mark}</span><span>{t}</span>
        </div>
      ))}
    </div>
  )
}

// Note to the holder — a tinted aside, as research notes box anything reader-specific.
function Holding({ pos, text }) {
  const up = pos.pnl >= 0
  const cells = [
    { l: 'YOUR P&L', v: `${up ? '+' : '−'}${inr(pos.pnl)}`, s: pos.pnlPct != null ? signed(pos.pnlPct, 2) : null, c: up ? GREEN : RUST },
    { l: 'OF PORTFOLIO', v: pos.weightPct != null ? `${pos.weightPct}%` : '—' },
    { l: 'AVG COST', v: price2(pos.avgBuy), s: `${pos.qty} shares` },
  ]
  return (
    <div className="mt-6 px-4 pt-3 pb-3.5" style={{ background: 'rgba(217,72,28,.06)', borderLeft: `3px solid ${RUST}` }}>
      <div className="text-[10px] font-bold tracking-[1.8px]" style={{ color: RUST }}>NOTE TO HOLDER</div>
      <div className="flex mt-2">
        {cells.map((x, i) => (
          <div key={x.l} className="flex-1 min-w-0"
            style={{ paddingLeft: i ? 10 : 0, paddingRight: i < 2 ? 10 : 0, borderRight: i < 2 ? '1px dotted rgba(27,23,16,.3)' : 'none' }}>
            <div className="text-[9px] font-bold tracking-[1.3px] text-ink/50 truncate">{x.l}</div>
            <div className="font-serif-n text-[19px] leading-tight truncate" style={x.c ? { color: x.c } : undefined}>{x.v}</div>
            {x.s && <div className="text-[10.5px] truncate" style={{ color: x.c || 'rgba(27,23,16,.5)' }}>{x.s}</div>}
          </div>
        ))}
      </div>
      {text && <p className="text-[13px] leading-relaxed text-ink/85 mt-2.5">{text}</p>}
      {(pos.nearestSupport || pos.stop2Atr) && (
        <p className="text-[11px] text-ink/45 mt-1.5">
          Reference levels{pos.nearestSupport ? ` · support ${price2(pos.nearestSupport)}` : ''}{pos.stop2Atr ? ` · 2×ATR ${price2(pos.stop2Atr)}` : ''}. Not a sell signal.
        </p>
      )}
    </div>
  )
}

// ---- how past calls played out ----  (rating history + evaluation)
// Each call's outcome at 1 and 3 months, once that much time has passed: the stock's move
// from the call's price, and the difference against NIFTY over the same window. Calls are
// never judged on horizons that haven't happened yet.
function TrackRecord({ history, currentPrice, symbol }) {
  const [series, setSeries] = useState(null)
  useEffect(() => {
    let off = false
    if (!history?.length) return
    Promise.all([fetchStockChart(symbol, '1Y').catch(() => null), fetchStockChart('^NSEI', '1Y').catch(() => null)])
      .then(([a, b]) => { if (!off) setSeries({ stock: a?.series || [], nifty: b?.series || [] }) })
    return () => { off = true }
  }, [symbol, history?.length])
  if (!history?.length) return null
  const rows = evaluateCalls(history, series?.stock, series?.nifty)
  const show = ['1M', '3M']
  const fmt = (o) => o?.excess != null ? signed(o.excess) : o?.ret != null ? signed(o.ret) : '—'
  const col = (o) => (o?.excess ?? o?.ret) == null ? 'rgba(27,23,16,.35)' : (o.excess ?? o.ret) >= 0 ? GREEN : RUST
  const matured = rows.filter(h => h.outcomes['1M']?.excess != null)
  const hits = matured.filter(h => {
    const k = verdictKey(h.verdict), x = h.outcomes['1M'].excess
    return (k === 'POSITIVE' && x > 0) || (k === 'NEGATIVE' && x < 0) || (k === 'NEUTRAL' && Math.abs(x) <= 5)
  }).length
  return (
    <div className="mt-7">
      <SecHead>Rating history</SecHead>
      <div className="grid grid-cols-[56px_1fr_34px_60px_54px] gap-x-2 text-[9px] font-bold tracking-[1.2px] text-ink/45 pt-2 pb-1">
        <span>DATE</span><span>CALL</span><span>SCORE</span><span className="text-right">1M vs NIFTY</span><span className="text-right">3M</span>
      </div>
      {rows.map(h => (
        <div key={h.at} className="grid grid-cols-[56px_1fr_34px_60px_54px] gap-x-2 items-baseline py-2.5 text-[12.5px]" style={rowB}>
          <span className="text-ink/55">{day(h.at)}</span>
          <span className="text-[10px] font-bold tracking-[1.2px] uppercase truncate" style={{ color: vColor(h.verdict) }}>{vLabel(h.verdict)}</span>
          <span className="text-ink/55">{h.score ?? '—'}</span>
          {show.map(k => (
            <span key={k} className="text-right font-semibold" style={{ color: col(h.outcomes[k]) }}>
              {h.outcomes[k] ? fmt(h.outcomes[k]) : <span className="text-ink/30 font-normal">pending</span>}
            </span>
          ))}
        </div>
      ))}
      <p className="text-[11px] text-ink/40 mt-1.5 leading-snug">
        Outcome = the stock’s move after the call minus NIFTY’s over the same window, measured only once that window has passed.
        {matured.length >= 3 ? ` So far ${hits} of ${matured.length} one-month outcomes agreed with the call.` : ' Too few matured calls to judge the method yet.'}
        {currentPrice ? ` Today ${price2(currentPrice)}.` : ''}
      </p>
    </div>
  )
}

// ================= the research note (method v2) =================
// Order follows a research analyst's working note: thesis → scorecard → key data →
// quality → risk → valuation → market → catalysts → what would change the view →
// data quality → the reader's own position → evidence. Scores and the assessment are the
// code's; the prose is the model's, kept only where its figures match the evidence.
function ResearchNote({ latest, name, symbol }) {
  const r = latest.report, m = latest.meta, snap = m.snapshot || {}
  const color = vColor(r.verdict)
  const when = new Date(latest.generatedAt)
  const facts = m.facts || []
  const byId = Object.fromEntries(facts.map(f => [f.id, f]))
  const upside = snap.target && m.price ? ((snap.target - m.price) / m.price) * 100 : null
  const sections = [
    ['Business quality', r.quality], ['Financial risk', r.risk],
    ['Valuation', r.valuation, <ValuationExtras key="v" r={r} price={m.price} snap={snap} name={name} />],
    ['Market behaviour', r.market], ['Catalysts', r.catalysts], ['What would change this view', r.invalidation],
  ]
  const cited = [...new Set(['thesis', 'quality', 'risk', 'valuation', 'market', 'catalysts', 'invalidation', 'position'].flatMap(k => (r[k] || []).flatMap(c => c.ids)))]

  return (
    <div className="pt-4">
      <div className="flex justify-between text-[9.5px] font-bold tracking-[1.8px] text-ink/50">
        <span className="truncate pr-3">EQUITY RESEARCH · {(snap.theme || snap.industry || 'INDIA').toUpperCase()}</span>
        <span className="shrink-0">{when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}</span>
      </div>
      <div className="font-serif-n text-[32px] leading-none mt-2">{tidyName(name)}</div>
      <div className="text-[11.5px] text-ink/50 mt-1">{symbol}{snap.sector ? ` · ${snap.sector}` : ''}{r.model ? ` · ${MODEL_NAME[r.model] || r.model} model` : ''}</div>

      <div className="grid grid-cols-3 mt-4 border-y-[1.5px] border-ink">
        <div className="py-3 pr-2 flex flex-col justify-center" style={{ background: color, color: '#F5F0E4', margin: '-1.5px 0' }}>
          <div className="text-[9px] font-bold tracking-[1.6px] opacity-80 pl-3">ASSESSMENT</div>
          <div className={`font-bold pl-3 mt-0.5 uppercase leading-tight ${verdictKey(r.verdict) === 'INSUFFICIENT' ? 'text-[12px] tracking-[0.8px]' : 'text-[16px] tracking-[1.6px]'}`}>{vLabel(r.verdict)}</div>
        </div>
        <Cell label="SCORE" value={<>{r.score ?? '—'}<span className="text-[13px] text-ink/40"> / 100</span></>} />
        <Cell label="EVIDENCE" value={r.coverage != null ? `${Math.round(r.coverage * 100)}%` : '—'} last />
      </div>
      {r.reasons?.length > 0 && (
        <p className="text-[12px] leading-snug mt-2.5 px-3 py-2" style={{ background: 'rgba(138,128,112,.12)' }}>
          <b>Why no verdict:</b> {r.reasons.join('; ')}.
        </p>
      )}

      {r.headline && <p className="font-serif-i text-[23px] leading-[1.2] mt-5">{r.headline}</p>}

      {r.thesis?.length > 0 && (
        <div className="mt-5">
          <SecHead>Thesis</SecHead>
          <Claims claims={r.thesis} dropCap={color} />
        </div>
      )}

      <Scorecard pillars={r.pillars} />
      <KeyData snap={snap} price={m.price} upside={upside} />

      {sections.map(([t, claims, extra], i) => (
        (claims?.length > 0 || extra) ? (
          <div key={t} className="mt-6">
            <div className="flex items-baseline gap-3 pb-1.5 border-b border-ink">
              <span className="font-serif-i text-[22px] leading-none" style={{ color }}>{i + 1}</span>
              <span className="text-[11px] font-bold tracking-[1.8px]">{t.toUpperCase()}</span>
            </div>
            {claims?.length > 0 && <Claims claims={claims} />}
            {extra}
          </div>
        ) : null
      ))}

      <DataQuality r={r} m={m} />

      {m.position && <Holding pos={m.position} text={(r.position || []).map(c => c.text).join(' ')} />}

      <Evidence facts={facts.filter(f => cited.includes(f.id))} total={facts.length} />

      <div className="mt-6 px-3.5 py-3 text-[10.5px] leading-[1.55] text-ink/50" style={{ background: 'rgba(27,23,16,.045)' }}>
        <span className="font-bold tracking-[1.2px] text-ink/60">METHOD & DISCLOSURES · </span>
        Scores and the assessment are computed by fixed rules ({r.method}); the thresholds and weights are starting
        hypotheses, recorded with every call so they can be tested. An AI model (DeepSeek) writes the explanation; every
        figure it uses is checked against the recorded evidence and statements that fail are removed. Data from Yahoo
        Finance, NSE and news outlets, retrieved {new Date(m.fetchedAt || latest.generatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.
        Governance was not assessed. Research and education only — not investment advice or a recommendation to buy or sell.
      </div>
    </div>
  )
}

const MODEL_NAME = { bank: 'Bank', nbfc: 'Lender', insurance: 'Insurer', cyclical: 'Cyclical', it: 'IT & services', utility: 'Utility', realty: 'Real estate', general: 'General' }

// Claims as prose; factual ones carry superscript pointers into the evidence list.
function Claims({ claims, dropCap }) {
  return (
    <div className="mt-2.5 space-y-2">
      {claims.map((c, i) => (
        <p key={i} className="text-[13.5px] leading-[1.6] text-ink/85">
          {dropCap && i === 0
            ? <><span className="font-serif-n float-left text-[44px] leading-[0.85] mr-1.5 mt-1" style={{ color: dropCap }}>{c.text.charAt(0)}</span>{c.text.slice(1)}</>
            : c.text}
          {c.ids?.length > 0 && <sup className="ml-1 text-[8.5px] font-bold tracking-[0.5px] text-ink/35">{c.ids.join(' ')}</sup>}
          {c.type === 'interpretation' && <span className="ml-1 text-[8.5px] font-bold tracking-[0.8px] text-ink/30">VIEW</span>}
        </p>
      ))}
    </div>
  )
}

function Scorecard({ pillars }) {
  if (!pillars) return null
  return (
    <div className="mt-6">
      <SecHead>Scorecard</SecHead>
      {PILLARS.map(([k]) => {
        const p = pillars[k]
        if (!p) return null
        const c = p.score == null ? 'rgba(27,23,16,.2)' : p.score >= 6.5 ? GREEN : p.score < 4.5 ? RUST : '#B5761F'
        return (
          <div key={k} className="py-2.5" style={rowB}>
            <div className="flex justify-between items-baseline">
              <span className="text-[13px] font-semibold">{p.label}</span>
              <span className="font-serif-n text-[18px]" style={{ color: p.used ? undefined : 'rgba(27,23,16,.35)' }}>
                {p.score != null ? p.score.toFixed(1) : '—'}<span className="text-[11px] text-ink/40">/10</span>
              </span>
            </div>
            <div className="h-[5px] mt-1.5" style={{ background: 'rgba(27,23,16,.08)' }}>
              <div className="h-full" style={{ width: `${(p.score ?? 0) * 10}%`, background: c, opacity: p.used ? 1 : 0.35 }} />
            </div>
            <div className="text-[10.5px] text-ink/45 mt-1">
              data {Math.round(p.coverage * 100)}%{!p.used ? ' · too thin to count towards the score' : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Valuation range bar (bear–base–bull, price marked) + peers.
function ValuationExtras({ r, price, snap, name }) {
  const g = r.range
  return (
    <>
      {g && price ? (() => {
        const lo = Math.min(g.bear, price) * 0.95, hi = Math.max(g.bull, price) * 1.05
        const x = (v) => `${((v - lo) / (hi - lo)) * 100}%`
        return (
          <div className="mt-3">
            <div className="text-[9.5px] font-bold tracking-[1.2px] text-ink/45">VALUATION RANGE · {g.basis.toUpperCase()}</div>
            <div className="relative h-8 mt-2">
              <div className="absolute top-3 h-2 rounded-full" style={{ left: x(g.bear), width: `calc(${x(g.bull)} - ${x(g.bear)})`, background: 'rgba(181,118,31,.25)' }} />
              <div className="absolute top-2 h-4 w-[2px]" style={{ left: x(g.base), background: '#B5761F' }} />
              <div className="absolute top-0.5 w-[3px] h-7 rounded-full bg-ink" style={{ left: x(price) }} />
            </div>
            <div className="flex justify-between text-[11px] font-semibold">
              <span>Low {price2(g.bear)}</span><span style={{ color: '#B5761F' }}>Mid {price2(g.base)}</span><span>High {price2(g.bull)}</span>
            </div>
            <div className="text-[10.5px] text-ink/45 mt-0.5">Black mark = today’s {price2(price)}. A range from peer multiples, not a price target.</div>
          </div>
        )
      })() : r.peerThin ? (
        <p className="text-[12px] text-ink/50 mt-2">Too few comparable companies with usable data for a peer valuation range.</p>
      ) : null}
      {snap.peers?.length > 0 && <PeerTable snap={snap} name={name} />}
    </>
  )
}

// What the analysis had, what it lacked, and what the checks removed.
function DataQuality({ r, m }) {
  const v = r.validation || {}
  const missing = (m.missing || []).filter(x => x.pillar !== 'news')
  const notAssessed = missing.filter(x => /not assessed|filings/.test(x.why))
  const gaps = missing.filter(x => !/not assessed|filings/.test(x.why))
  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-3 pb-1.5 border-b border-ink">
        <span className="font-serif-i text-[22px] leading-none text-ink/45">7</span>
        <span className="text-[11px] font-bold tracking-[1.8px]">DATA QUALITY & UNCERTAINTY</span>
      </div>
      <div className="text-[12.5px] leading-[1.55] text-ink/80 mt-2.5 space-y-1.5">
        <p><b>Evidence coverage {Math.round((r.coverage ?? 0) * 100)}%</b> — the share of scoring inputs that had data. {r.checks?.stale ? 'The latest price is stale. ' : ''}{r.checks?.splitJumps ? `${r.checks.splitJumps} unexplained price jump(s) — possible unadjusted split or bonus. ` : ''}</p>
        <p><b>AI statements:</b> {v.total ?? 0} written · {v.kept ?? 0} kept{v.repaired ? ` (${v.repaired} re-linked to the right evidence)` : ''} · {v.dropped ?? 0} removed for figures not in the evidence or missing citations.</p>
        {notAssessed.length > 0 && <p><b>Not assessed:</b> {notAssessed.map(x => x.label).join(', ')} — these need exchange filings and are <i>unknown</i>, not clean.</p>}
        {gaps.length > 0 && <p><b>Missing data:</b> {gaps.map(x => x.label).join(', ')}.</p>}
        {r.unknowns?.length > 0 && <div><b>Open questions:</b><ul className="list-disc pl-5 mt-1">{r.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
        {v.droppedClaims?.length > 0 && (
          <details className="text-[11.5px] text-ink/55"><summary className="cursor-pointer font-semibold">Removed statements</summary>
            <ul className="list-disc pl-5 mt-1 space-y-1">{v.droppedClaims.map((d, i) => <li key={i}>“{d.text}” — {d.reason}</li>)}</ul>
          </details>
        )}
      </div>
    </div>
  )
}

function Evidence({ facts, total }) {
  if (!facts.length) return null
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-[11px] font-bold tracking-[1.8px] pb-1.5 border-b border-ink list-none flex justify-between">
        <span>EVIDENCE CITED ({facts.length} of {total} facts)</span><span className="text-ink/40">SHOW ▾</span>
      </summary>
      {facts.map(f => (
        <div key={f.id} className="py-2 text-[12px]" style={rowB}>
          <div className="flex justify-between gap-3">
            <span><span className="font-bold text-ink/40 mr-1.5">{f.id}</span>{f.label}</span>
            <span className="font-semibold text-right shrink-0">{typeof f.value === 'string' && f.value.length > 40 ? '' : showValue(f)}</span>
          </div>
          {typeof f.value === 'string' && f.value.length > 40 && <div className="text-ink/75 mt-0.5">“{f.value}”</div>}
          <div className="text-[10.5px] text-ink/45 mt-0.5">{[f.period, f.status === 'computed' ? (f.calc || 'computed') : `${f.status} · ${f.source}`].filter(Boolean).join(' · ')}</div>
        </div>
      ))}
    </details>
  )
}
