// Evidence-bound report: parse the model's claims and check them against the fact book.
//
// The model returns every statement as { text, ids, type }:
//   type 'fact'           — must cite at least one real fact id
//   type 'interpretation' — a judgement drawn from facts; ids optional but encouraged
// A claim is dropped when it is a "fact" with no valid citation, or when it contains a
// number found nowhere in the evidence. A number that IS in the evidence but under a fact
// the model forgot to cite gets that fact attached (counted as a repair), not dropped. Dropped claims
// are counted and shown in the data-quality section — the reader sees what was removed.
//
// This can't prove a sentence's reasoning is right; it does stop invented figures.

const SECTIONS = ['thesis', 'quality', 'risk', 'valuation', 'market', 'catalysts', 'invalidation', 'position']

const numsOf = (t) => (String(t || '').match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => Number(x.replace(/,/g, ''))).filter(Number.isFinite)

function candidates(f) {
  // numbers in a fact's period/unit text count too ("35 analysts", "of 4")
  return [...valueCandidates(f), ...numsOf(f.period), ...numsOf(f.unit)]
}
function valueCandidates(f) {
  const v = f.value
  // text facts (headlines, dates, MACD trend) back the numbers written inside them
  if (typeof v === 'string') return (v.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(x => Number(x.replace(/,/g, ''))).filter(Number.isFinite)
  if (typeof v !== 'number' || !Number.isFinite(v)) return []
  const out = [v, Math.abs(v)]
  if (f.unit === '₹ cr' || f.unit === '₹') out.push(v / 100, v / 1e5)   // ₹ cr ↔ ₹ thousand cr / lakh cr phrasing
  return out
}
const close = (a, b) => {
  const d = Math.abs(a - b)
  return d <= 0.06 || d <= Math.abs(b) * 0.015 || Math.abs(Math.round(a) - Math.round(b)) === 0 && Math.abs(b) >= 10
}

/** Numbers that need backing: skip years, quarter/FY labels and small counting words. */
function numbersIn(text) {
  const out = []
  const re = /(FY|Q[1-4]\s?FY|Q)?\s?(-|−)?₹?\s?(\d[\d,]*(?:\.\d+)?)/g
  let m
  while ((m = re.exec(text))) {
    if (m[1]) continue                                   // FY2026, Q1 labels
    if (/F$/.test(text.slice(0, m.index + (m[0].length - m[0].trimStart().length)))) continue   // a fact id like "F45" written inline
    const before = text.slice(Math.max(0, m.index - 1), m.index + (m[0].length - m[0].trimStart().length))
    const after = text.slice(m.index + m[0].length)
    if (/\/\s*$/.test(before) || /^\s*\/?$/.test(before) && text[m.index - 1] === '/') continue   // "52/100", "8/10"
    if (/^\s?-?\s?(day|days|week|weeks|month|months|year|years|quarter|quarters|session|sessions|dma|DMA)\b/i.test(after)) continue  // "50-day", "12-month", "200 DMA"
    if (/^\s?(x|th|st|nd|rd)\b/.test(after) && Number(m[3]) <= 31) continue   // "3rd", ordinals
    const n = Number(m[3].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    if (n >= 1990 && n <= 2100 && !m[3].includes('.')) continue   // a year
    if (Number.isInteger(n) && n <= 12) continue         // "3 of the last 4", "6 months", "12-month"
    out.push(n)
  }
  return out
}

export function validateClaims(raw, fb) {
  const stats = { total: 0, kept: 0, dropped: 0, repaired: 0, unknownIds: 0, unbackedNumbers: 0, uncitedFacts: 0 }
  const dropped = []
  const all = fb.facts
  const allCands = all.flatMap(candidates)

  const checkClaim = (c) => {
    if (!c || typeof c.text !== 'string' || !c.text.trim()) return null
    stats.total++
    const ids = (Array.isArray(c.ids) ? c.ids : []).map(String).filter(id => /^F\d+$/.test(id))
    const good = ids.filter(id => fb.byId(id))
    stats.unknownIds += ids.length - good.length
    const type = c.type === 'fact' ? 'fact' : 'interpretation'
    // ids written inside the sentence ("(F45)", "[F12, F13]") are moved out of the prose
    const inline = (c.text.match(/\bF\d{2,3}\b/g) || [])
    for (const id of inline) if (fb.byId(id) && !good.includes(id)) good.push(id)
    const text = c.text.replace(/\s*[([]\s*F\d{2,3}(?:\s*[,;/]\s*F\d{2,3})*\s*[)\]]/g, '').replace(/\bF\d{2,3}\b/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim()
    let reason = null
    if (type === 'fact' && !good.length) { reason = 'a factual claim with no valid evidence'; stats.uncitedFacts++ }
    if (!reason) {
      const pool = good.flatMap(id => candidates(fb.byId(id)))
      const bad = []
      for (const n of numbersIn(text)) {
        if (pool.some(p => close(n, p))) continue
        // the figure exists, but under a fact the model didn't cite — attach the right one
        const owner = all.find(f => candidates(f).some(p => close(n, p)))
        if (owner) { if (!good.includes(owner.id)) { good.push(owner.id); stats.repaired++ } continue }
        bad.push(n)
      }
      if (bad.length) { reason = `number${bad.length > 1 ? 's' : ''} ${bad.join(', ')} not in the evidence`; stats.unbackedNumbers++ }
    }
    if (reason) { stats.dropped++; dropped.push({ text, reason }); return null }
    stats.kept++
    return { text, ids: good, type }
  }

  const out = {}
  for (const s of SECTIONS) out[s] = (Array.isArray(raw?.[s]) ? raw[s] : []).map(checkClaim).filter(Boolean)
  // headline: plain string, but its numbers must exist somewhere in the fact book
  let headline = String(raw?.headline || '').trim()
  if (headline && numbersIn(headline).some(n => !allCands.some(p => close(n, p)))) {
    dropped.push({ text: headline, reason: 'headline figure not in the evidence' }); stats.dropped++
    headline = ''
  }
  const unknowns = (Array.isArray(raw?.unknowns) ? raw.unknowns : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 8)
  return { ...out, headline, unknowns, validation: { ...stats, dropped: stats.dropped, droppedClaims: dropped.slice(0, 12) } }
}

export function parseJsonLoose(raw) {
  let s = String(raw || '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  if (s[0] !== '{') {
    const a = s.indexOf('{'), b = s.lastIndexOf('}')
    if (a >= 0 && b > a) s = s.slice(a, b + 1)
  }
  return JSON.parse(s)
}
