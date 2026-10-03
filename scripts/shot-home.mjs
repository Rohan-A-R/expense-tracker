import { chromium } from 'playwright'
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome'
// node scripts/shot-home.mjs <tour.jpg> <readmeFrame.png>
//   Home screen with the app's own sample data (demoData.js): the welcome-tour slide
//   (390×844 @2x JPEG) and the phone-framed docs/frames/home.png (680×1440).
const [TOUR_OUT = '/tmp/home.jpg', FRAME_OUT = '/tmp/home-frame.png'] = process.argv.slice(2)
const browser = await browser_()
async function browser_() { return chromium.launch({ executablePath: CHROME }) }
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.evaluate(async () => {
  const { buildDemoData } = await import('/src/utils/demoData.js')
  const d = buildDemoData()
  const db = await new Promise(ok => { const r = indexedDB.open('ExpenseTrackerDB'); r.onsuccess = () => ok(r.result) })
  const put = (s, v) => new Promise(ok => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(v); t.oncomplete = ok })
  for (const k of ['tourDone', 'lockOnboarded']) await put('settings', { key: k, value: true })
  await put('settings', { key: 'udhaarNudgeAt', value: Date.now() })      // keep the shot uncluttered
  await put('settings', { key: 'priceCache', value: d.priceCache })
  await put('budgets', d.budget)
  let id = 90000
  for (const e of d.expenses) await put('expenses', { id: id++, ...e })
  for (const h of d.holdings) await put('holdings', { id: id++, ...h })
})
await page.reload({ waitUntil: 'networkidle' })
await page.getByText('The journal').waitFor()
await page.waitForTimeout(1500)
const shot = await page.screenshot()
await page.screenshot({ path: TOUR_OUT, type: 'jpeg', quality: 84 })

// Same phone frame as the other docs/frames images (see shot-detail.mjs).
const fp = await (await browser.newContext({ viewport: { width: 340, height: 720 }, deviceScaleFactor: 2 })).newPage()
await fp.setContent(`<body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;height:720px">
  <div style="width:281px;height:593px;border-radius:44px;background:#1B1710;padding:7px;box-sizing:border-box;
    box-shadow:0 24px 40px rgba(0,0,0,.18),0 6px 12px rgba(0,0,0,.08)">
    <div style="width:100%;height:100%;border-radius:37px;overflow:hidden;background:#F5F0E4">
      <img src="data:image/png;base64,${shot.toString('base64')}" style="width:100%;display:block"/>
    </div></div></body>`)
await fp.waitForTimeout(300)
await fp.screenshot({ path: FRAME_OUT, omitBackground: true })
console.log('saved', TOUR_OUT, FRAME_OUT)
await browser.close()
