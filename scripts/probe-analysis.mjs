import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
const SYMBOL = process.argv[2] || 'TATASTEEL.NS'
const NAME = process.argv[3] || ''

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage()
page.on('console', m => { if (m.type() === 'error') console.error('[browser]', m.text()) })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const out = await page.evaluate(async ([symbol, name]) => {
  const t0 = performance.now()
  const steps = []
  try {
    const m = await import('/src/services/stockAnalysis.js')
    const ctx = await m.gatherStockContext(symbol, name || undefined, s => steps.push(s), { qty: 50, avgBuy: 165, portfolioValue: 60000, holdingsCount: 6 })
    const text = m.formatContext(ctx)
    return { ok: true, text, size: m.contextSize(text), ms: Math.round(performance.now() - t0), steps }
  } catch (e) {
    return { ok: false, error: String(e && e.stack || e), ms: Math.round(performance.now() - t0), steps }
  }
}, [SYMBOL, NAME])

if (!out.ok) { console.error('FAILED after', out.ms, 'ms\n', out.error); process.exit(1) }
console.log(out.text)
console.log('─'.repeat(70))
console.log('steps:', out.steps.join(' → '))
console.log('time:', out.ms, 'ms ·', out.size)
await browser.close()
