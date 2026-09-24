import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
const SYMBOL = process.argv[2] || 'TATASTEEL.NS'

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage()
page.on('console', m => console.log('[browser:' + m.type() + ']', m.text().slice(0, 300)))
page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0, 90), r.failure()?.errorText))
page.on('response', r => { if (r.url().includes('workers.dev')) console.log('[worker resp]', r.status()) })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const out = await page.evaluate(async (symbol) => {
  const t0 = performance.now()
  const steps = []
  try {
    const m = await import('/src/services/stockAnalysis.js')
    const ctx = await m.gatherStockContext(symbol, undefined, s => steps.push(s))
    const prompt = m.analysisPrompt(ctx)
    const t1 = performance.now()
    // call the worker directly so we can see the raw reply
    const resp = await fetch('https://throbbing-base-fd72.rohanflash27.workers.dev/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, task: 'analysis' }),
    })
    const bodyText = await resp.text()
    let parsed = null, perr = null
    try { parsed = m.parseReport(JSON.parse(bodyText).text) } catch (e) { perr = String(e) }
    return {
      ok: true, steps, promptChars: prompt.length,
      gatherMs: Math.round(t1 - t0), aiMs: Math.round(performance.now() - t1),
      status: resp.status, raw: bodyText.slice(0, 1200), parsed, perr,
    }
  } catch (e) {
    return { ok: false, steps, error: String(e?.stack || e), ms: Math.round(performance.now() - t0) }
  }
}, SYMBOL)

console.log(JSON.stringify(out, null, 2))
await browser.close()
