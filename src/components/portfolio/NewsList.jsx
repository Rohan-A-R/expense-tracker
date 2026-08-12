import { useEffect, useState } from 'react'
import { fetchNews } from '../../services/marketData'

function relTime(pub) {
  if (!pub) return ''
  const t = new Date(pub).getTime()
  if (!t) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

// Headlines for a Google-News query. `title` is the section label above the ink rule.
export default function NewsList({ query, title = 'NEWS', count = 6 }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    fetchNews(query, count)
      .then(r => { if (!cancelled) setItems(r) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [query, count])

  return (
    <>
      <div className="text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2 mt-7 mb-1">{title}</div>
      {items === null ? (
        <p className="text-[12px] text-ink/45 py-3">Loading headlines…</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-ink/45 py-3">No recent headlines — try again later.</p>
      ) : (
        items.map((n, i) => (
          <button key={i} onClick={() => n.link && window.open(n.link, '_blank')}
            className="block w-full text-left py-3 rule-dot active:opacity-70">
            <div className="text-[13.5px] font-semibold leading-snug">{n.title}</div>
            <div className="text-[11px] text-ink/45 mt-1">
              {n.source}{n.source && relTime(n.publishedAt) ? ' · ' : ''}{relTime(n.publishedAt)}
            </div>
          </button>
        ))
      )}
    </>
  )
}
