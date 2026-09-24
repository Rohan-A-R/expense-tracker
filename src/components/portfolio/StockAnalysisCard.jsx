import { useState } from 'react'
import { analyseStock } from '../../services/stockAnalysis'

// On-demand AI stock analysis. Nothing is fetched or sent until the user taps Analyse.
// The figures come from stockAnalysis.js (all computed on-device); the model supplies
// only judgement and wording, so the numbers on screen are ours, not the model's.

const VERDICT = {
  BUY:   { color: '#4E9E6A', label: 'BUY' },
  WATCH: { color: '#C9972E', label: 'WATCH' },
  AVOID: { color: '#D9481C', label: 'AVOID' },
}
const ACCENT = '#6C5FB0'

// Reports survive navigating away and back — one per stock per app session.
const cache = new Map()

export default function StockAnalysisCard({ symbol, name, position }) {
  const [state, setState] = useState(cache.has(symbol) ? 'done' : 'idle')
  const [step, setStep] = useState('')
  const [data, setData] = useState(cache.get(symbol) || null)
  const [err, setErr] = useState('')

  async function run() {
    setState('loading'); setErr(''); setStep('Starting…')
    try {
      const res = await analyseStock(symbol, name, setStep, position)
      cache.set(symbol, res)
      setData(res); setState('done')
    } catch (e) {
      setErr(String(e?.message || e)); setState('error')
    }
  }

  if (state === 'idle' || state === 'loading' || state === 'error') {
    return (
      <div className="rounded-2xl overflow-hidden mt-7"
        style={{ border: '1px solid rgba(27,23,16,.14)', borderLeft: `3px solid ${ACCENT}`, background: 'rgba(108,95,176,.05)' }}>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: ACCENT }}>AI Analysis</span>
            <span className="text-[13px]">🔬</span>
          </div>
          {state === 'loading' ? (
            <div className="flex items-center gap-2.5 mt-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: ACCENT, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[13px] text-ink/60">{step}</span>
            </div>
          ) : (
            <>
              <p className="text-[13.5px] leading-snug mt-1.5 mb-3.5 text-ink/60">
                {state === 'error'
                  ? (err || "Couldn't complete the analysis.")
                  : 'Reads the sector, its price drivers, comparable competitors and the latest news — then weighs it all up.'}
              </p>
              <button onClick={run}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-paper active:scale-95"
                style={{ background: ACCENT }}>
                {state === 'error' ? 'Try again' : '🔬 Analyse this stock'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const r = data.report
  const v = VERDICT[r.verdict] || VERDICT.WATCH
  const when = new Date(data.generatedAt)

  return (
    <div className="mt-7">
      <div className="flex items-center gap-2 rule-ink pb-2 mb-4">
        <span className="text-[11px] font-bold tracking-[2px] text-ink/55">AI ANALYSIS</span>
        <span className="text-[13px]">🔬</span>
        <button onClick={run} className="ml-auto text-[11px] font-bold tracking-[1px] active:opacity-60" style={{ color: ACCENT }}>
          ↻ REFRESH
        </button>
      </div>

      {/* Score + verdict */}
      <div className="flex items-end gap-4">
        <div>
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">SCORE</div>
          <div className="font-serif-n text-[52px] leading-none" style={{ color: v.color }}>
            {r.score ?? '—'}<span className="text-[22px] text-ink/35">/100</span>
          </div>
        </div>
        <div className="pb-2">
          <span className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[1px] text-paper" style={{ background: v.color }}>
            {v.label}
          </span>
        </div>
      </div>
      <div className="h-1.5 mt-3 rounded-full" style={{ background: 'rgba(27,23,16,.12)' }}>
        <div className="h-full rounded-full" style={{ width: `${r.score ?? 0}%`, background: v.color }} />
      </div>

      {r.headline && <p className="font-serif-n text-[20px] leading-snug mt-4">{r.headline}</p>}

      {/* Your holding — first, because it's the part only this app can tell you.
          Figures are ours (computed on-device); the prose is the model's. */}
      {data.context.position && <PositionBox pos={data.context.position} text={r.position} />}

      <Section title="TECHNICALS" body={r.technicals} />
      <Section title="VALUATION" body={r.valuation} />
      <Section title="RESULTS & EARNINGS" body={r.earnings} />
      <Section title="SECTOR & DRIVERS" body={r.sector} />
      {r.levels && <Section title="KEY LEVELS" body={r.levels} />}

      <Bullets title="CATALYSTS" items={r.catalysts} color="#4E9E6A" mark="▲" />
      <Bullets title="RISKS" items={r.risks} color="#D9481C" mark="▼" />

      {r.verdictText && <Section title="VERDICT" body={r.verdictText} />}

      {!!r.missing.length && (
        <p className="text-[11.5px] text-ink/45 leading-snug mt-5">
          Data not available: {r.missing.join(' · ')}
        </p>
      )}

      <p className="text-[11px] text-ink/40 leading-snug mt-5">
        Generated {when.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} from
        {' '}{data.context.peers.length} peers, {data.context.drivers.length} market drivers and
        {' '}{data.context.news.reduce((s, g) => s + g.items.length, 0)} headlines.
        <br />Research and education only — not investment advice.
      </p>
    </div>
  )
}

const inr = (v) => `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`

function PositionBox({ pos, text }) {
  const up = pos.pnl >= 0
  const color = up ? '#4E9E6A' : '#D9481C'
  return (
    <div className="mt-5 rounded-2xl px-4 py-3.5" style={{ background: 'rgba(27,23,16,.04)', border: '1px solid rgba(27,23,16,.12)' }}>
      <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">YOUR HOLDING</div>
      <div className="grid grid-cols-3 gap-2">
        <Mini label="P&L" value={`${up ? '+' : '−'}${inr(pos.pnl)}`} sub={pos.pnlPct != null ? `${up ? '+' : ''}${pos.pnlPct}%` : null} color={color} />
        <Mini label="Of portfolio" value={pos.weightPct != null ? `${pos.weightPct}%` : '—'} />
        <Mini label="Avg cost" value={`₹${pos.avgBuy.toLocaleString('en-IN')}`} sub={`${pos.qty} sh`} />
      </div>
      {text && <p className="text-[13.5px] leading-relaxed text-ink/85 mt-3">{text}</p>}
      {(pos.stop2Atr || pos.nearestSupport) && (
        <p className="text-[11.5px] text-ink/50 leading-snug mt-2">
          Reference levels{pos.nearestSupport ? ` · support ₹${pos.nearestSupport}` : ''}{pos.stop2Atr ? ` · 2×ATR ₹${pos.stop2Atr}` : ''} — not a sell signal.
        </p>
      )}
    </div>
  )
}

function Mini({ label, value, sub, color }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-bold tracking-[1px] text-ink/50 truncate">{label.toUpperCase()}</div>
      <div className="font-serif-n text-[18px] leading-tight truncate" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-ink/50 truncate" style={color ? { color } : undefined}>{sub}</div>}
    </div>
  )
}

function Section({ title, body }) {
  if (!body) return null
  return (
    <div className="mt-5">
      <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-1">{title}</div>
      <p className="text-[13.5px] leading-relaxed text-ink/85">{body}</p>
    </div>
  )
}

function Bullets({ title, items, color, mark }) {
  if (!items?.length) return null
  return (
    <div className="mt-5">
      <div className="text-[10px] font-bold tracking-[1.5px] mb-1.5" style={{ color }}>{title}</div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-ink/85">
            <span className="text-[10px] pt-1" style={{ color }}>{mark}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
