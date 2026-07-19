import { CapacitorHttp } from '@capacitor/core'
import pkg from '../../package.json'

// The version baked into this build. Bump `version` in package.json before
// releasing — it must match the GitHub release tag (v<version>).
export const APP_VERSION = pkg.version

const LATEST_RELEASE_URL = 'https://api.github.com/repos/Rohan-A-R/expense-tracker/releases/latest'

function parts(v) {
  return String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0)
}

export function isNewer(latest, current) {
  const a = parts(latest), b = parts(current)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true
    if ((a[i] || 0) < (b[i] || 0)) return false
  }
  return false
}

// Returns { version, url, notes } when a newer release exists, else null.
// GitHub's public releases API — no auth, generous rate limit for one call/day.
export async function checkForUpdate() {
  const res = await CapacitorHttp.get({
    url: LATEST_RELEASE_URL,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Finances-app' },
    connectTimeout: 12000,
    readTimeout: 12000,
  })
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
  const d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  const tag = d?.tag_name
  if (!tag || !isNewer(tag, APP_VERSION)) return null
  const apk = (d.assets || []).find(a => a.name?.endsWith('.apk'))
  return {
    version: String(tag).replace(/^v/i, ''),
    url: apk?.browser_download_url || d.html_url,
    notes: (d.body || '').trim(),
  }
}
