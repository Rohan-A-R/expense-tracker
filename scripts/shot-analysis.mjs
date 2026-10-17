import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
// node scripts/shot-analysis.mjs <full.png> [tour.jpg] [readmeFrame.png]
//   full.png         — the whole report card, tall
//   tour.jpg         — welcome-tour slide: the report's first screen, 390×844 @2x JPEG
//   readmeFrame.png  — that first screen in a phone frame, 680×1440 (docs/frames/analysis.png)
const [OUT = '/tmp/analysis.png', TOUR_OUT, FRAME_OUT] = process.argv.slice(2)

// Uses the live Worker (real AI) — research notes since method v2 must carry claims that
// cite the real fact book, so a canned reply can't stand in any more. Costs ~₹0.1 a run.

const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForFunction(async () => { const db = await new Promise(ok => { const r = indexedDB.open('ExpenseTrackerDB'); r.onsuccess = () => ok(r.result) }); const ready = db.objectStoreNames.contains('settings'); db.close(); return ready }, null, { timeout: 20000 })
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

await page.getByText('Analyse this stock', { exact: true }).click()
await page.getByText('Research note').waitFor({ timeout: 240000 })
await page.waitForTimeout(1500)
const sheet = page.locator('body > div').last()
const first = await page.screenshot()
if (TOUR_OUT) { await page.screenshot({ path: TOUR_OUT, type: 'jpeg', quality: 86 }); console.log('tour', TOUR_OUT) }

// whole note, sticky header unpinned
await page.addStyleTag({ content: '.sticky { position: static !important }' })
const h = await sheet.evaluate(el => el.scrollHeight)
await page.setViewportSize({ width: 390, height: Math.min(h + 20, 12000) })
await page.waitForTimeout(800)
await page.screenshot({ path: OUT })
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
