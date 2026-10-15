import { useHeadlines, SECTION_STYLE, openArticle, Thumb } from './newsShared'

// Home's news strip, "As it happens": today's top story from each section on a live-blog
// timeline, newest on top. Built to sit beside "The journal" as one system — same serif
// heading, ink rule and rust "ALL →" link — and to stay quieter than the money above it.
const SHOW = 4
const ICON = { india: '🇮🇳', world: '🌍', markets: '📈', tech: '💻' }

function when(at) {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)} min`
  return new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ').toLowerCase()
}

const tint = (hex, a) => {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`
}

// The story photo, or — when a publisher has none — a tile in the section's colour, so
// every row keeps the same right edge.
function Picture({ n, lead }) {
  const st = SECTION_STYLE[n.section] || SECTION_STYLE.india
  const size = lead ? 'w-[96px] h-[72px]' : 'w-[60px] h-[60px]'
  return (
    <span className={`relative ${size} rounded-xl shrink-0 overflow-hidden flex items-center justify-center`}
      style={{ background: tint(st.color, 0.14) }}>
      <span className={lead ? 'text-[24px]' : 'text-[20px]'}>{ICON[n.section] || '📰'}</span>
      <Thumb src={n.image} lead={lead} className="absolute inset-0 w-full h-full" />
    </span>
  )
}

export default function DailyBrief({ onOpenAll }) {
  const { items } = useHeadlines()
  if (items && !items.length) return null                 // offline with nothing saved

  // the top story of each section (India, World, Markets, Tech) — always a mix — topped up
  // from the overall ranking if a section is empty today; then laid out by time
  const picked = []
  for (const sec of ['india', 'world', 'markets', 'tech']) {
    const n = (items || []).find(x => x.section === sec)
    if (n) picked.push(n)
  }
  for (const n of items || []) {
    if (picked.length >= SHOW) break
    if (!picked.includes(n)) picked.push(n)
  }
  picked.sort((a, b) => b.at - a.at)

  return (
    <section>
      <div className="flex items-baseline justify-between mt-7">
        <span className="flex items-baseline gap-2.5">
          <span className="font-serif-i text-[26px] leading-none">As it happens</span>
          <span className="relative flex w-[7px] h-[7px] -translate-y-[3px]" aria-label="Live">
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: '#D9481C', opacity: 0.45 }} />
            <span className="relative w-[7px] h-[7px] rounded-full" style={{ background: '#D9481C' }} />
          </span>
        </span>
        {items?.length > 0 && (
          <button onClick={onOpenAll} className="text-[11px] font-bold tracking-[1.5px] text-brand active:opacity-60">
            ALL {items.length} →
          </button>
        )}
      </div>

      <div className="mt-3 border-t border-ink">
        {!items ? (
          <p className="font-serif-i text-[18px] text-ink/40 py-5">Fetching today’s headlines…</p>
        ) : (
          <div className="relative pt-3">
            {/* the timeline, fading out under the last story */}
            <div className="absolute top-[18px] bottom-4 w-[1.5px]"
              style={{ left: 55, background: 'linear-gradient(rgba(27,23,16,.18) 75%, rgba(27,23,16,0))' }} />
            {picked.map((n, i) => {
              const st = SECTION_STYLE[n.section] || SECTION_STYLE.india
              const lead = i === 0
              return (
                <button key={n.link || n.title} onClick={() => openArticle(n)}
                  className="relative flex w-full text-left py-2.5 active:opacity-70"
                  style={i ? { borderTop: '1px dotted rgba(27,23,16,.22)', marginLeft: 0 } : undefined}>
                  <span className="w-[46px] shrink-0 text-right text-[10px] font-bold text-ink/45 pt-[3px] whitespace-nowrap">{when(n.at)}</span>
                  <span className="relative w-[19px] shrink-0 flex justify-center pt-[4px]">
                    {lead && <span className="absolute top-[1px] w-[15px] h-[15px] rounded-full" style={{ background: st.color, opacity: 0.2 }} />}
                    <span className="relative w-[9px] h-[9px] rounded-full" style={{ background: st.color, boxShadow: '0 0 0 2.5px #F5F0E4' }} />
                  </span>
                  <span className="flex-1 min-w-0 flex gap-3 pl-1">
                    <span className="flex-1 min-w-0">
                      <span className={`block leading-[1.3] line-clamp-3 ${lead ? 'font-serif-n text-[17.5px]' : 'text-[13.5px] font-semibold'}`}>{n.title}</span>
                      <span className="block mt-1 text-[9.5px] font-bold tracking-[1.4px]" style={{ color: st.color }}>
                        {st.label}<span className="text-ink/40 font-semibold tracking-normal text-[11px]"> · {n.source}</span>
                      </span>
                    </span>
                    <Picture n={n} lead={lead} />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
