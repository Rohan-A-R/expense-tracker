import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
// node scripts/probe-full.mjs <SYMBOL> [--prompt]
//   Runs the whole research pipeline (data → fact book → scorecard → Worker → validation)
//   and prints the scorecard, the validated claims and what the validator removed.
const SYMBOL = process.argv[2] || 'TATASTEEL.NS'
const SHOW_PROMPT = process.argv.includes('--prompt')

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage()
page.on('response', r => { if (r.url().includes('workers.dev')) console.log('[worker resp]', r.status()) })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const out = await page.evaluate(async ({ symbol, showPrompt }) => {
  const t0 = performance.now()
  const steps = []
  try {
    const m = await import('/src/services/stockAnalysis.js')
    const res = await m.analyseStock(symbol, undefined, s => steps.push(s), { qty: 50, avgBuy: 165, portfolioValue: 60000, holdingsCount: 6 })
    const r = res.report
    return {
      ok: true, steps, ms: Math.round(performance.now() - t0),
      promptChars: m.analysisPrompt(res.context).length,
      prompt: showPrompt ? m.analysisPrompt(res.context) : undefined,
      facts: res.context.facts.facts.length, missing: res.context.facts.missing.length,
      model: r.model, score: r.score, verdict: r.verdict, coverage: r.coverage, reasons: r.reasons,
      pillars: r.pillars, range: r.range, peers: res.context.peers.map(p => `${p.label}${p.isLeader ? ' (leader)' : ''} sim=${p.similarity?.toFixed?.(2)}`),
      headline: r.headline, thesis: r.thesis, valuation: r.valuation, invalidation: r.invalidation,
      unknowns: r.unknowns, validation: r.validation,
    }
  } catch (e) {
    return { ok: false, steps, error: String(e?.stack || e), ms: Math.round(performance.now() - t0) }
  }
}, { symbol: SYMBOL, showPrompt: SHOW_PROMPT })

if (out.prompt) { console.log(out.prompt); delete out.prompt }
console.log(JSON.stringify(out, null, 2))
await browser.close()
