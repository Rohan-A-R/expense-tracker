import { useEffect, useState } from 'react'
import { domainFromUrl, logoUrl } from '../../utils/brands'
import { fetchDomainByName } from '../../services/marketData'

function tint(hex, a) {
  const h = (hex || '#1B1710').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

// Brand logo for a holding. Resolves a domain from `website` (best, for stocks) or by
// looking up `query` (company/fund name). Falls back to a tinted monogram.
export default function LogoMark({ domain: fixedDomain, website, query, name = '?', color = '#1B1710', size = 38, radius = 10 }) {
  const [domain, setDomain] = useState(() => fixedDomain || (website ? domainFromUrl(website) : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (domain || !query) return
    let cancelled = false
    fetchDomainByName(query).then(d => { if (!cancelled && d) setDomain(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [query, domain])

  const showImg = domain && !failed
  const box = { width: size, height: size, borderRadius: radius }

  if (showImg) {
    return (
      <img src={logoUrl(domain)} alt="" width={size} height={size} onError={() => setFailed(true)}
        className="object-contain shrink-0" style={{ ...box, background: '#fff', border: '1px solid rgba(27,23,16,.1)' }} />
    )
  }
  return (
    <div className="flex items-center justify-center font-serif-n shrink-0"
      style={{ ...box, background: tint(color, 0.16), color, fontSize: size * 0.44 }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
}
