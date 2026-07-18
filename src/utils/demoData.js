// Self-contained demo dataset, generated relative to today so the sample always
// looks current. Every record is tagged { demo: true } so "Clear sample data"
// removes only these — never the user's own entries.
const iso = (d) => d.toISOString().split('T')[0]
const monthStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function buildDemoData() {
  const now = new Date()
  const ms = Date.now()

  // ---- Expenses across the last 5 months ----
  const cats = [
    { id: 9, desc: 'Rent', base: 6000, freq: 1 },
    { id: 1, desc: 'Outside food', base: 320, freq: 6 },
    { id: 2, desc: 'Groceries', base: 700, freq: 3 },
    { id: 3, desc: 'Milk', base: 30, freq: 8 },
    { id: 7, desc: 'Travel', base: 160, freq: 3 },
    { id: 8, desc: 'Electricity', base: 820, freq: 1 },
    { id: 5, desc: 'Fruits', base: 180, freq: 3 },
    { id: 11, desc: 'Shopping', base: 1500, freq: 1 },
  ]
  const expenses = []
  for (let mAgo = 4; mAgo >= 0; mAgo--) {
    const md = new Date(now.getFullYear(), now.getMonth() - mAgo, 1)
    const maxDay = mAgo === 0 ? now.getDate() : new Date(md.getFullYear(), md.getMonth() + 1, 0).getDate()
    for (const c of cats) {
      for (let k = 0; k < c.freq; k++) {
        const day = 1 + Math.floor(Math.random() * maxDay)
        const d = new Date(md.getFullYear(), md.getMonth(), day)
        expenses.push({
          amount: Math.max(10, Math.round(c.base * (0.7 + Math.random() * 0.6))),
          categoryId: c.id, description: c.desc, note: c.desc,
          date: iso(d), paymentType: Math.random() < 0.5 ? 'UPI' : 'Cash', demo: true,
        })
      }
    }
  }

  const budget = { id: 'monthly', amount: 20000, month: monthStr(now), demo: true }

  const holdings = [
    { kind: 'stock', symbol: 'RELIANCE.NS', name: 'Reliance Industries', qty: 12, avgBuy: 2450, demo: true },
    { kind: 'stock', symbol: 'INFY.NS', name: 'Infosys', qty: 20, avgBuy: 1500, demo: true },
    { kind: 'mf', schemeCode: '120503', name: 'Parag Parikh Flexi Cap', qty: 640.5, avgBuy: 52, sip: { amount: 5000, day: 5, lastRun: monthStr(now) }, demo: true },
  ]
  const priceCache = {
    'RELIANCE.NS': { price: 2980, prevClose: 2942, at: ms },
    'INFY.NS': { price: 1615, prevClose: 1600, at: ms },
    'mf:120503': { price: 71.8, prevClose: 71.2, at: ms },
  }
  const metalRates = {
    gold: { perGram: 7300, prevPerGram: 7255, at: ms },
    silver: { perGram: 92, prevPerGram: 90.5, at: ms },
    platinum: { perGram: 2600, prevPerGram: 2580, at: ms },
  }

  const assets = [
    { type: 'metal', metal: 'gold', grams: 25, purity: '22', value: Math.round(25 * 0.9167 * 7300), demo: true },
    { type: 'fd', principal: 100000, rate: 7, startDate: iso(new Date(now.getFullYear() - 2, now.getMonth(), 1)), demo: true },
    { type: 'loan', principal: 180000, rate: 9, emi: 6000, startDate: iso(new Date(now.getFullYear() - 1, now.getMonth(), 1)), demo: true },
  ]

  const udhaar = [
    { person: 'Rohan', direction: 'lent', amount: 6000, note: 'Trip', date: iso(new Date(ms - 27 * 864e5)), status: 'open', demo: true },
    { person: 'Rohan', direction: 'lent', amount: 3000, note: 'Dinner', date: iso(new Date(ms - 15 * 864e5)), status: 'open', demo: true },
    { person: 'Tony', direction: 'borrowed', amount: 5555, note: 'Cash', date: iso(new Date(ms - 19 * 864e5)), status: 'open', demo: true },
  ]

  const snaps = []
  let v = 150000
  for (let i = 18; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    v += 7000 + Math.sin(i / 3) * 4000 + Math.random() * 2500
    snaps.push({ date: iso(d), total: Math.round(v), breakdown: {}, demo: true })
  }

  return { expenses, budget, holdings, priceCache, metalRates, assets, udhaar, snaps }
}
