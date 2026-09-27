import { chromium } from 'playwright'
import { readFileSync } from 'fs'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
// node scripts/shot-detail.mjs <full.png> [tour.jpg] [readmeFrame.png]
//   full.png         — the whole holding screen, tall
//   tour.jpg         — welcome-tour slide: first screen, 390×844 @2x JPEG
//   readmeFrame.png  — that first screen inside a phone frame, 680×1440 (docs/frames)
const [OUT = '/tmp/detail.png', TOUR_OUT, FRAME_OUT] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const db = await new Promise((ok, no) => { const r = indexedDB.open('ExpenseTrackerDB'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
  const put = (s, v) => new Promise(ok => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(v); t.oncomplete = ok })
  await put('settings', { key: 'tourDone', value: true })
  await put('settings', { key: 'lockOnboarded', value: true })
  await put('holdings', { id: 7001, kind: 'stock', symbol: 'RELIANCE.NS', name: 'Reliance Industries', qty: 12, avgBuy: 1150, logoDomain: 'ril.com' })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.getByText('PORTFOLIO', { exact: true }).first().click()
await page.waitForTimeout(1500)
await page.getByText('Reliance Industries').first().click()
await page.getByText('ANALYST VIEW').waitFor({ timeout: 30000 })
await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(2500)

const first = await page.screenshot()
if (TOUR_OUT) { await page.screenshot({ path: TOUR_OUT, type: 'jpeg', quality: 84 }); console.log('tour', TOUR_OUT) }

const h = await page.evaluate(() => document.querySelector('.fixed.inset-0.z-40 > div').scrollHeight)
await page.setViewportSize({ width: 390, height: h + 20 })
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT })
console.log('saved', OUT, h)

if (FRAME_OUT) {
  // Same phone frame as the other docs/frames images: ink bezel, soft shadow, white ground.
  const fp = await (await browser.newContext({ viewport: { width: 340, height: 720 }, deviceScaleFactor: 2 })).newPage()
  const src = 'data:image/png;base64,' + first.toString('base64')
  await fp.setContent(`<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:720px">
    <div style="width:281px;height:593px;border-radius:44px;background:#1B1710;padding:7px;box-sizing:border-box;
      box-shadow:0 24px 40px rgba(0,0,0,.18),0 6px 12px rgba(0,0,0,.08)">
      <div style="width:100%;height:100%;border-radius:37px;overflow:hidden;background:#F5F0E4">
        <img src="${src}" style="width:100%;display:block"/>
      </div></div></body>`)
  await fp.waitForTimeout(300)
  await fp.screenshot({ path: FRAME_OUT })
  console.log('frame', FRAME_OUT)
}
await browser.close()
