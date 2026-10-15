import { useState } from 'react'
import { useHeadlines, Tag, ago, openArticle, SECTION_STYLE, Thumb } from '../components/news/newsShared'

const FILTERS = [['all', 'All'], ['markets', 'Markets'], ['world', 'World'], ['india', 'India'], ['tech', 'Tech']]

// The full Daily Brief: a front page — lead story, a 2×2 grid of briefs, then the rest as
// a list — filterable by section. Publisher feeds, last 24 hours only.
export default function News({ onBack }) {
  const { items, at, offline } = useHeadlines()
  const [f, setF] = useState('all')
  const list = (items || []).filter(n => f === 'all' || n.section === f)
  const [lead, ...others] = list
  const grid = others.slice(0, 4), more = others.slice(4)
  const now = new Date(at || Date.now())

  return (
    <div className="min-h-screen px-6 pt-4 pb-8">
      <div className="flex items-center gap-3 rule-2 pb-3">
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-xl border-[1.5px] border-ink flex items-center justify-center text-lg active:scale-90">←</button>
        <span className="font-serif-i text-[30px] leading-none flex-1">The Daily Brief</span>
      </div>
      <div className="flex justify-between text-[9.5px] font-bold tracking-[1.6px] text-ink/50 pt-2">
        <span>{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()} · {now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase()}</span>
        <span>{offline ? 'OFFLINE · LAST SAVED' : 'LAST 24 HOURS'}</span>
      </div>

      <div className="flex gap-1.5 mt-4 overflow-x-auto no-scrollbar -mx-6 px-6">
        {FILTERS.map(([k, label]) => {
          const on = f === k
          return (
            <button key={k} onClick={() => setF(k)}
              className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors"
              style={on ? { background: '#1B1710', color: '#F5F0E4', border: '1.5px solid #1B1710' }
                : { border: '1.5px solid rgba(27,23,16,.18)', color: k === 'all' ? 'rgba(27,23,16,.6)' : SECTION_STYLE[k].color }}>
              {label}
            </button>
          )
        })}
      </div>

      {!items ? (
        <p className="font-serif-i text-[20px] text-ink/40 py-10">Fetching today’s headlines…</p>
      ) : !lead ? (
        <p className="text-[13px] text-ink/50 py-10">No headlines right now — check your connection and try again.</p>
      ) : (
        <>
          {/* lead */}
          <button onClick={() => openArticle(lead)} className="block w-full text-left mt-4 pt-3 pb-4 border-t border-ink active:opacity-70"
            style={{ borderBottom: '1px solid rgba(27,23,16,.15)' }}>
            <Thumb src={lead.image} lead className="block w-full h-[200px] rounded-2xl mb-3" />
            <Tag section={lead.section} extra={`${lead.source} · ${ago(lead.at)} ago`} />
            <h2 className="font-serif-n text-[31px] leading-[1.08] mt-2">{lead.title}</h2>
          </button>

          {/* 2×2 briefs */}
          {grid.length > 0 && (
            <div className="grid grid-cols-2">
              {grid.map((n, i) => (
                <button key={n.link || n.title} onClick={() => openArticle(n)}
                  className="text-left py-3 active:opacity-70"
                  style={{ borderBottom: '1px dotted rgba(27,23,16,.3)', ...(i % 2 === 0 ? { paddingRight: 12, borderRight: '1px dotted rgba(27,23,16,.3)' } : { paddingLeft: 12 }) }}>
                  <Thumb src={n.image} className="block w-full h-[92px] rounded-xl mb-2" />
                  <Tag section={n.section} />
                  <h3 className="font-serif-n text-[18px] leading-[1.15] mt-1.5">{n.title}</h3>
                  <div className="text-[11px] text-ink/45 mt-1.5">{n.source} · {ago(n.at)}</div>
                </button>
              ))}
            </div>
          )}

          {/* everything else */}
          {more.length > 0 && (
            <div className="mt-6">
              <div className="text-[10px] font-bold tracking-[1.8px] text-ink/55 pb-1.5 border-b border-ink">MORE STORIES</div>
              {more.map(n => (
                <button key={n.link || n.title} onClick={() => openArticle(n)}
                  className="flex gap-3 w-full text-left py-3 active:opacity-70" style={{ borderBottom: '1px dotted rgba(27,23,16,.25)' }}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug">{n.title}</span>
                    <span className="flex gap-2 items-baseline mt-1"><Tag section={n.section} /><span className="text-[11px] text-ink/45">{n.source} · {ago(n.at)}</span></span>
                  </span>
                  <Thumb src={n.image} className="w-[72px] h-[72px] rounded-xl shrink-0" />
                </button>
              ))}
            </div>
          )}
          <p className="text-[10.5px] text-ink/40 pt-4">From NDTV, The Times of India, The Hindu, BBC, The Economic Times and Gadgets 360. Tap a story to read it at the source.</p>
        </>
      )}
    </div>
  )
}
