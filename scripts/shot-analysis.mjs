import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
const OUT = process.argv[2] || '/tmp/analysis.png'
// optional: also write a welcome-tour slide (viewport-sized JPEG, report scrolled to top)
const TOUR_OUT = process.argv[3] || null

// Sample model reply — stands in for the Worker until OpenRouter credit exists.
// Everything else on screen (position figures, data counts) is real, computed live.
const REPORT = {
  score: 52, verdict: 'WATCH',
  headline: 'Steel prices are rising, but profits and estimates are moving the wrong way',
  technicals: 'Price sits below both its 50- and 200-day averages, a bearish setup, though MACD turned bullish two days ago. RSI near 50 says momentum is neutral.',
  valuation: 'At a P/E of 21 it trades well above JSW (12.6) and SAIL (17.2), its closest peers by size, so it is not the bargain its falling price suggests.',
  earnings: 'Revenue jumped 58% last quarter but net profit fell 21% and margins halved to 3.8%. It has missed analyst estimates in 3 of the last 4 quarters. Next results are due 11 Nov 2026.',
  // (kept free of exact P&L / weight figures — the stat row above shows those live, and a
  //  hardcoded number here would visibly disagree with it on the tour slide)
  position: 'Your holding is comfortably in profit, and at nearly a fifth of your portfolio it is one of your larger single bets. The nearest support sits just below the current price.',
  sector: 'Steel HRC futures are up 57% over the year while iron ore is down 7%, which should widen margins across the industry, and a 12% safeguard tariff shields domestic mills.',
  catalysts: ['12% safeguard tariff on Chinese steel imports', 'HRC steel futures up 57% over the year', 'Motilal Oswal sees a possible 20% rally'],
  risks: ['Missed EPS estimates 3 of the last 4 quarters', 'Net margin halved to 3.8%', 'P/E 21 vs JSW 12.6 — rich against peers'],
  levels: 'Support ₹184.7 and ₹181.2 · resistance ₹187.4, ₹190.3 and ₹193.5',
  verdictText: 'Industry conditions are improving, but Tata Steel is not converting them into profit yet, and the valuation already assumes it will. Worth watching the 11 Nov results before reading more into the rally.',
  missing: [],
}

const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.route('**/throbbing-base-fd72.rohanflash27.workers.dev/**', r =>
  r.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ text: JSON.stringify(REPORT) }) }))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const db = await new Promise((ok, no) => { const r = indexedDB.open('ExpenseTrackerDB'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
  const put = (s, v) => new Promise(ok => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(v); t.oncomplete = ok })
  await put('settings', { key: 'tourDone', value: true })
  await put('settings', { key: 'lockOnboarded', value: true })
  await put('settings', { key: 'aiEnabled', value: true })
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
await page.waitForTimeout(2500)

const card = page.locator('section', { hasText: 'AI ANALYSIS' }).first()
await page.getByText('Analyse this stock', { exact: true }).waitFor()
await card.scrollIntoViewIfNeeded()
await card.screenshot({ path: OUT.replace('.png', '-idle.png') })

await page.getByText('Analyse this stock', { exact: true }).click()
await page.waitForFunction(() => document.body.innerText.includes('RESULTS & EARNINGS'), null, { timeout: 120000 })
await page.waitForTimeout(800)
await card.screenshot({ path: OUT })
if (TOUR_OUT) {
  // The tour slide sells the *analysis*. The personal holding block (P&L row) is so
  // prominent that on its own it reads as a P&L screen, so it's left out of the slide.
  await card.evaluate(el => {
    const h = [...el.querySelectorAll('div.mt-6')].find(d => d.innerText.includes('YOUR P&L'))
    if (h) h.remove()
  })
  await page.setViewportSize({ width: 412, height: 892 })
  await card.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24))
  await page.waitForTimeout(500)
  await page.screenshot({ path: TOUR_OUT, type: 'jpeg', quality: 84 })
  console.log('tour slide', TOUR_OUT)
}
console.log('saved', OUT)
await browser.close()
