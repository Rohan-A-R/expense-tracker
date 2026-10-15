import { useEffect, useState } from 'react'
import { fetchHeadlines } from '../../services/marketData'
import { getSetting, setSetting } from '../../services/db'

export const SECTION_STYLE = {
  india: { label: 'INDIA', color: '#4E9E6A' },
  world: { label: 'WORLD', color: '#6C5FB0' },
  markets: { label: 'MARKETS', color: '#D9481C' },
  tech: { label: 'TECH', color: '#3E7CA6' },
}

export function ago(at) {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m`
  return `${Math.round(mins / 60)}h`
}

export const openArticle = (n) => n.link && window.open(n.link, '_blank')

// Today's headlines. Shows the last saved batch at once (so Home never waits on the
// network, and works offline), then refreshes. The saved batch is display-only — news
// is never part of the user's data or backups.
const FRESH_MS = 30 * 60000

export function useHeadlines() {
  const [state, setState] = useState({ items: null, at: null, offline: false })
  useEffect(() => {
    let off = false
    // The saved batch is shown at once. If it's under 30 minutes old it's used as-is and
    // nothing is downloaded — so reopening the app doesn't re-fetch all ten feeds.
    getSetting('newsCache').catch(() => null).then(c => {
      if (off) return
      if (c?.items?.length) setState(s => s.items ? s : { items: c.items, at: c.at, offline: false })
      if (c?.items?.length && Date.now() - c.at < FRESH_MS) return
      refresh()
    })
    const refresh = () => fetchHeadlines()
      .then(items => {
        if (off) return
        const at = Date.now()
        setState({ items, at, offline: false })
        setSetting('newsCache', { items: items.slice(0, 150), at }).catch(() => {})
      })
      .catch(() => { if (!off) setState(s => ({ ...s, items: s.items || [], offline: true })) })
    return () => { off = true }
  }, [])
  return state
}

export function Tag({ section, extra }) {
  const st = SECTION_STYLE[section] || SECTION_STYLE.india
  return (
    <span className="text-[9.5px] font-bold tracking-[1.6px]" style={{ color: st.color }}>
      {st.label}{extra ? <span className="text-ink/40"> · {extra}</span> : null}
    </span>
  )
}

// Ask each publisher's image server for the size actually shown — a 64-px thumbnail was
// loading 800–1280-px originals (~10× the data). Unknown hosts keep the original URL.
export function sizedImage(url, kind = 'thumb') {
  if (!url) return null
  const lead = kind === 'lead'
  // BBC: /ace/standard/<width>/
  if (/ichef\.bbci\.co\.uk\/ace\/standard\/\d+\//.test(url)) return url.replace(/(\/ace\/standard\/)\d+\//, `$1${lead ? 800 : 240}/`)
  // Times of India / Economic Times: /photo/msid-N,imgsize-N.cms → resizable /thumb/ URL
  const toi = url.match(/^(https:\/\/(?:static\.toiimg\.com|img\.etimg\.com))\/photo\/msid-(\d+)/)
  if (toi) return `${toi[1]}/thumb/msid-${toi[2]},width-${lead ? 800 : 200},height-${lead ? 450 : 200},resizemode-4/photo.jpg`
  // The Hindu: …/alternates/<VARIANT>/file.jpg
  if (/thgim\.com\/.*\/alternates\/[A-Z_0-9]+\//.test(url)) return url.replace(/\/alternates\/[A-Z_0-9]+\//, `/alternates/${lead ? 'LANDSCAPE_1200' : 'SQUARE_320'}/`)
  // Gadgets 360: ?downsize=<w>:* — honoured for JPEGs only; their PNGs come back full size
  // (1 MB+), so those stories go without a photo rather than costing a megabyte each.
  if (/gadgets360cdn\.com/.test(url)) return /\.png(\?|$)/i.test(url) ? null : `${url.split('?')[0]}?downsize=${lead ? 800 : 200}:*`
  return url
}

// A story photo; disappears quietly if the publisher's image fails to load. No referrer —
// some publishers block hot-linked images that carry one.
export function Thumb({ src, lead = false, className = '', style }) {
  const [bad, setBad] = useState(false)
  const url = sizedImage(src, lead ? 'lead' : 'thumb')
  if (!url || bad) return null
  return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)}
    className={`object-cover bg-ink/5 ${className}`} style={style} />
}
