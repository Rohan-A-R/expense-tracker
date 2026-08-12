// Brand logos for holdings — fully dynamic, NO hardcoded company/fund lists.
// A holding's name (or Yahoo's website for stocks) resolves to a domain, and
// icon.horse renders that domain's logo. Unresolved → a monogram fallback.

// Strip a URL to its bare host: https://www.tcs.com/foo → tcs.com
export function domainFromUrl(url = '') {
  try { return new URL(url).hostname.replace(/^www\./, '') || null } catch { return null }
}

// logo.dev gives crisp, retina, consistent brand logos by domain. Paste a free publishable
// token (pk_…) below to enable it; until then we fall back to unavatar (variable quality).
// Get one at https://www.logo.dev  → Dashboard → Publishable token.
const LOGO_DEV_TOKEN = 'pk_S6U9tNurTjmSE9EkkC2F5A'

export const logoUrl = (domain) => {
  if (!domain) return null
  return LOGO_DEV_TOKEN
    ? `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=128&retina=true`
    : `https://unavatar.io/${domain}?fallback=false`
}

// Fund-house → domain. Stocks resolve dynamically (Yahoo website / name lookup), but AMCs
// have no dynamic logo source and are a small fixed set, so a prefix map is the reliable way.
// Longest/most-specific prefixes first so "Aditya Birla" wins over a bare "Birla", etc.
const AMC_PREFIX = [
  ['aditya birla', 'mutualfund.adityabirlacapital.com'], ['parag parikh', 'amc.ppfas.com'],
  ['nippon india', 'nipponindiamf.com'], ['motilal oswal', 'motilaloswalmf.com'],
  ['baroda bnp', 'barodabnpparibasmf.in'], ['hsbc', 'assetmanagement.hsbc.co.in'],
  ['axis', 'axismf.com'], ['hdfc', 'hdfcfund.com'], ['sbi', 'sbimf.com'], ['icici', 'icicipruamc.com'],
  ['mirae', 'miraeassetmf.co.in'], ['kotak', 'kotakmf.com'], ['uti', 'utimf.com'], ['dsp', 'dspim.com'],
  ['quant', 'quantmutual.com'], ['tata', 'tatamutualfund.com'], ['franklin', 'franklintempletonindia.com'],
  ['edelweiss', 'edelweissmf.com'], ['bandhan', 'bandhanmutual.com'], ['canara', 'canararobeco.com'],
  ['pgim', 'pgimindiamf.com'], ['invesco', 'invescomutualfund.com'], ['sundaram', 'sundarammutual.com'],
  ['mahindra', 'mahindramanulife.com'], ['lic', 'licmf.com'], ['jm ', 'jmfinancialmf.com'],
  ['navi', 'navimutualfund.com'], ['whiteoak', 'whiteoakamc.com'], ['bajaj', 'bajajamc.com'],
  ['groww', 'growwmf.in'], ['ppfas', 'amc.ppfas.com'], ['360 one', '360.one'], ['iifl', '360.one'],
]

export function mfDomain(fundName = '') {
  const n = fundName.trim().toLowerCase()
  const hit = AMC_PREFIX.find(([p]) => n.startsWith(p))
  return hit ? hit[1] : null
}

// The best name to hand a name→domain lookup for a holding.
// Funds: the leading words are the AMC — append "Mutual Fund" so it resolves to the
// AMC, not an unrelated same-named company.
export function logoQuery(h) {
  if (!h) return null
  if (h.kind !== 'mf') return h.name || h.symbol || null
  const amc = (h.name || '')
    .split(/\s+/)
    .slice(0, 2)              // e.g. "Axis ELSS Tax…" → "Axis ELSS"; "Parag Parikh…" → "Parag Parikh"
    .join(' ')
    .replace(/\b(fund|direct|growth|plan|regular)\b/gi, '')
    .trim()
  return amc ? `${amc} Mutual Fund` : h.name || null
}

// A good Google-News query for a holding (or general market news when none given).
export function newsQuery(h) {
  if (!h) return 'nifty sensex stock market'
  if (h.kind === 'mf') return `${h.name} mutual fund`
  const name = (h.name || h.symbol || '').replace(/\b(Ltd|Limited|Industries)\b/gi, '').trim()
  return `${name || h.symbol} share price`
}
