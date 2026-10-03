import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
// node scripts/shot-analysis.mjs <full.png> [tour.jpg] [readmeFrame.png]
//   full.png         — the whole report card, tall
//   tour.jpg         — welcome-tour slide: the report's first screen, 390×844 @2x JPEG
//   readmeFrame.png  — that first screen in a phone frame, 680×1440 (docs/frames/analysis.png)
const [OUT = '/tmp/analysis.png', TOUR_OUT, FRAME_OUT] = process.argv.slice(2)

// Sample model reply — stands in for the Worker until OpenRouter credit exists.
// Everything else on screen (key data, peers, position, rating history prices) is real.
const REPORT = {
  score: 52, verdict: 'WATCH',
  headline: 'Steel prices are rising, but profits and estimates are moving the wrong way',
  technicals: 'Price sits below both its 50- and 200-day averages, a bearish setup, though MACD turned bullish two days ago. RSI near 40 says momentum is soft but not oversold.',
  valuation: 'At a P/E of about 20 it trades well above JSW Steel and SAIL, its closest peers by size, so it is not the bargain its falling price suggests.',
  earnings: 'Revenue jumped 58% last quarter but net profit fell 21% and margins halved to 3.8%. It has missed analyst estimates in 3 of the last 4 quarters. Next results are due 11 Nov 2026.',
  // (no exact P&L / weight figures — the box above shows those live)
  position: 'Your holding is comfortably in profit, and at nearly a fifth of your portfolio it is one of your larger single bets. The nearest support sits just below the current price.',
  sector: 'Steel HRC futures are up sharply over the year while iron ore is lower, which should widen margins across the industry, and a 12% safeguard tariff shields domestic mills.',
  catalysts: ['12% safeguard tariff on Chinese steel imports', 'HRC steel futures up strongly over the year', 'Brokers mostly positive: 18 buy against 7 sell'],
  risks: ['Missed EPS estimates 3 of the last 4 quarters', 'Net margin halved to 3.8%', 'Rich P/E against size-matched peers'],
  levels: 'Nearest support sits just below the price, with resistance a few rupees above; a close above it would turn the short-term trend.',
  verdictText: 'Industry conditions are improving, but Tata Steel is not converting them into profit yet, and the valuation already assumes it will. Worth watching the 11 Nov results before reading more into the rally.',
  missing: [],
}

const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.route('**/throbbing-base-fd72.rohanflash27.workers.dev/**', r =>
  r.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ text: JSON.stringify(REPORT) }) }))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const db = await new Promise((ok, no) => { const r = indexedDB.open('ExpenseTrackerDB'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
  const put = (s, v) => new Promise(ok => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(v); t.oncomplete = ok })
  for (const k of ['tourDone', 'lockOnboarded', 'aiEnabled']) await put('settings', { key: k, value: true })
  await put('holdings', { id: 7001, kind: 'stock', symbol: 'TATASTEEL.NS', name: 'Tata Steel', qty: 50, avgBuy: 165 })
  await put('holdings', { id: 7002, kind: 'stock', symbol: 'INFY.NS', name: 'Infosys', qty: 40, avgBuy: 1200 })
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString()
  await put('settings', { key: 'stockAnalyses', value: { 'TATASTEEL.NS': {
    latest: { generatedAt: ago(9), report: { score: 44, verdict: 'WATCH' }, meta: {} },
    history: [
      { at: ago(9), price: 176.2, score: 44, verdict: 'WATCH', headline: '' },
      { at: ago(23), price: 168.9, score: 36, verdict: 'AVOID', headline: '' },
    ] } } })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.getByText('PORTFOLIO', { exact: true }).first().click()
await page.waitForTimeout(1500)
await page.getByText('Tata Steel').first().click()

const card = page.locator('section', { hasText: 'AI ANALYSIS' }).first()
await page.getByText('Analyse this stock', { exact: true }).click()
await page.getByText('INVESTMENT SUMMARY').waitFor({ timeout: 120000 })
await page.waitForTimeout(1000)

// First screen of the report: masthead, rating box, headline, summary, key data.
await card.evaluate(el => {
  const scroller = el.closest('.overflow-y-auto')
  scroller.scrollTop += el.getBoundingClientRect().top - 12
})
await page.waitForTimeout(500)
const first = await page.screenshot()
if (TOUR_OUT) { await page.screenshot({ path: TOUR_OUT, type: 'jpeg', quality: 86 }); console.log('tour', TOUR_OUT) }

// Whole card, with the bottom bar out of the way.
await page.addStyleTag({ content: 'nav, .fixed.bottom-0 { display:none !important }' })
await page.setViewportSize({ width: 390, height: 5200 })
await page.waitForTimeout(800)
await card.screenshot({ path: OUT })
console.log('saved', OUT)

if (FRAME_OUT) {
  // Same phone frame as the other docs/frames images (see shot-detail.mjs).
  const fp = await (await browser.newContext({ viewport: { width: 340, height: 720 }, deviceScaleFactor: 2 })).newPage()
  await fp.setContent(`<body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:720px">
    <div style="width:281px;height:593px;border-radius:44px;background:#1B1710;padding:7px;box-sizing:border-box;
      box-shadow:0 24px 40px rgba(0,0,0,.18),0 6px 12px rgba(0,0,0,.08)">
      <div style="width:100%;height:100%;border-radius:37px;overflow:hidden;background:#F5F0E4">
        <img src="data:image/png;base64,${first.toString('base64')}" style="width:100%;display:block"/>
      </div></div></body>`)
  await fp.waitForTimeout(300)
  await fp.screenshot({ path: FRAME_OUT, omitBackground: true })
  console.log('frame', FRAME_OUT)
}
await browser.close()
