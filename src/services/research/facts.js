// The fact book: every figure the report may use, with where it came from.
//
// Each fact gets a stable id (F01, F02…) that the model must cite, plus provenance:
//   period     what the number describes ("FY2026", "TTM", "15 Oct 2026", "last 4 years")
//   source     where it came from ("Yahoo Finance annual statements", "computed")
//   fetchedAt  when the app retrieved the underlying data
//   status     'reported' (as published by the source), 'computed' (our arithmetic on
//              reported inputs — `calc` says how), or 'estimate' (analyst / broker figures)
//
// A value that can't be had is recorded as *missing*, never as zero — a missing EPS
// estimate is not an estimate of zero. Missing items are listed in the report's data
// quality section so the reader sees the gaps.

export function createFactBook() {
  const facts = []
  const missing = []
  const byKey = new Map()

  function add(key, label, value, meta = {}) {
    const ok = value != null && (typeof value !== 'number' || Number.isFinite(value))
    if (!ok) {
      missing.push({ key, label, pillar: meta.pillar || null, why: meta.why || 'not available from the data source' })
      return null
    }
    const id = `F${String(facts.length + 1).padStart(2, '0')}`
    const f = {
      id, key, label, value,
      unit: meta.unit || '',
      period: meta.period || '',
      source: meta.source || 'computed',
      fetchedAt: meta.fetchedAt || null,
      status: meta.status || (meta.calc ? 'computed' : 'reported'),
      calc: meta.calc || null,
      pillar: meta.pillar || null,
    }
    facts.push(f)
    byKey.set(key, f)
    return f
  }

  return {
    facts, missing, add,
    get: (key) => byKey.get(key) || null,
    val: (key) => byKey.get(key)?.value ?? null,
    byId: (id) => facts.find(f => f.id === id) || null,
  }
}

// How a fact reads in the prompt and in the evidence appendix.
export function showValue(f) {
  const v = f.value
  if (typeof v !== 'number') return String(v)
  const r = (x, d) => Number(x.toFixed(d)).toLocaleString('en-IN')
  switch (f.unit) {
    case '%': return `${v > 0 && f.signed ? '+' : ''}${r(v, 1)}%`
    case 'pp': return `${v > 0 ? '+' : ''}${r(v, 1)} pp`
    case '₹': return `₹${r(v, 2)}`
    case '₹ cr': return `₹${r(v, 0)} cr`
    case 'x': return `${r(v, 2)}x`
    case '/10': return `${r(v, 1)}/10`
    default: return `${r(v, Math.abs(v) < 10 ? 2 : 1)}${f.unit ? ` ${f.unit}` : ''}`
  }
}

export function factLine(f) {
  const where = f.status === 'computed' ? `computed${f.calc ? `: ${f.calc}` : ''}` : `${f.status} · ${f.source}`
  return `[${f.id}] ${f.label}: ${showValue(f)}${f.period ? ` (${f.period})` : ''} — ${where}`
}
