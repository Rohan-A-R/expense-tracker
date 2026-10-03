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
        ? <Report latest={latest} name={name} symbol={symbol} />
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
// Laid out like a broker's research note: a masthead with the rating box, an investment
// summary up front, a key-data table, numbered sections, upside/downside side by side,
// and disclosures in small print. Every figure in the tables comes from `meta` (computed);
// only the prose is the model's.
const INK = '#1B1710', GREEN = '#4E9E6A', RUST = '#D9481C'
const rowB = { borderTop: '1px dotted rgba(27,23,16,.28)' }

function Report({ latest, name, symbol }) {
  const r = latest.report, m = latest.meta, snap = m.snapshot || {}
  const color = VERDICT_COLOR[r.verdict] || VERDICT_COLOR.WATCH
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
      <div className="font-serif-n text-[32px] leading-none mt-2">{name}</div>
      <div className="text-[11.5px] text-ink/50 mt-1">{symbol}{snap.sector ? ` · ${snap.sector}` : ''}</div>

      {/* rating box */}
      <div className="grid grid-cols-3 mt-4 border-y-[1.5px] border-ink">
        <div className="py-3 pr-3 flex flex-col justify-center" style={{ background: color, color: '#F5F0E4', margin: '-1.5px 0' }}>
          <div className="text-[9px] font-bold tracking-[1.6px] opacity-80 pl-3">RATING</div>
          <div className="text-[17px] font-bold tracking-[2px] pl-3 mt-0.5">{r.verdict}</div>
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

// ---- how past calls played out ----  (a broker note's "rating history")
function TrackRecord({ history, currentPrice }) {
  if (!history?.length) return null
  return (
    <div className="mt-7">
      <SecHead>Rating history</SecHead>
      <div className="flex gap-3 text-[9px] font-bold tracking-[1.3px] text-ink/45 pt-2 pb-1">
        <span className="w-14">DATE</span><span className="w-16">RATING</span><span>SCORE</span>
        <span className="flex-1 text-right">PRICE</span><span className="w-14 text-right">SINCE</span>
      </div>
      {history.map(h => {
        // A call under a day old has had no time to play out — comparing it is just noise.
        const fresh = Date.now() - new Date(h.at).getTime() < 864e5
        const move = !fresh && currentPrice && h.price ? ((currentPrice - h.price) / h.price) * 100 : null
        const color = VERDICT_COLOR[h.verdict] || 'inherit'
        return (
          <div key={h.at} className="flex items-baseline gap-3 py-2.5 text-[13px]" style={rowB}>
            <span className="w-14 text-ink/55 shrink-0">{day(h.at)}</span>
            <span className="w-16 shrink-0 text-[11px] font-bold tracking-[1.5px]" style={{ color }}>{h.verdict}</span>
            <span className="text-ink/55 shrink-0">{h.score}</span>
            <span className="flex-1 text-right text-ink/70 truncate">{h.price ? price2(h.price) : '—'}</span>
            <span className="w-14 text-right font-semibold shrink-0"
              style={{ color: move == null ? 'rgba(27,23,16,.4)' : move >= 0 ? GREEN : RUST }}>
              {move != null ? signed(move) : fresh ? 'today' : '—'}
            </span>
          </div>
        )
      })}
      <p className="text-[11px] text-ink/40 mt-1.5">Price when each rating was given, and the move to today's {currentPrice ? price2(currentPrice) : 'price'}.</p>
    </div>
  )
}
