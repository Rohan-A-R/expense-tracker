// Builds the on-device context handed to the AI, and assembles the final prompts.
//
// CORE PRINCIPLE: the model (LFM2.5-2.6B, tiny) never does math or lookups. We
// compute every figure here in JS — reusing the same engines the UI uses
// (generateReport, computeNetWorth) — and give the model finished numbers. Its
// only job is to phrase and explain. A feature cheatsheet keeps how-to answers
// accurate. Only aggregates + the last ~20 transactions leave the device.

import { generateReport } from '../utils/report'
import { computeNetWorth, assetValue } from '../utils/networth'
import { priceKey } from '../services/marketData'
import { formatCurrency, formatMonth, finPeriodLabel, formatDateShort } from '../utils/formatters'

const RECENT_N = 30

const catName = (categories, id) => categories.find(c => c.id === Number(id))?.name || 'Uncategorised'

// Latest financial month present in the data (mirrors Dashboard/Analytics).
function latestMonth(expenses) {
  const months = [...new Set(expenses.map(e => e.month))].sort((a, b) => b.localeCompare(a))
  return months[0] || null
}

function isCurrentMonth(month) {
  if (!month) return false
  const [y, m] = month.split('-').map(Number)
  const now = new Date()
  return y === now.getFullYear() && m === now.getMonth() + 1
}

// Portfolio value + P&L (only priced holdings count) — same logic as Dashboard.
function portfolioSummary(holdings, prices) {
  if (!holdings.length) return null
  let invested = 0, current = 0, priced = false
  holdings.forEach(h => {
    invested += Number(h.qty) * Number(h.avgBuy)
    const p = prices[priceKey(h)]
    if (p) { current += Number(h.qty) * p.price; priced = true }
  })
  const pnl = current - invested
  return { invested, current, pnl, priced, pnlPct: invested > 0 ? (pnl / invested) * 100 : null }
}

// The plain-text data snapshot. Compact — the model is small.
export function buildSnapshot(app) {
  const { expenses = [], categories = [], budgets = {}, holdings = [], assets = [], udhaar = [], prices = {}, metalRates = {}, monthStartDay = 1 } = app
  const lines = []
  const money = (n) => formatCurrency(Math.round(Number(n) || 0))

  const month = latestMonth(expenses)
  lines.push(`Today: ${formatDateShort(new Date().toISOString().slice(0, 10))}`)

  // ---- Spending (reuse the report engine; all figures precomputed) ----
  if (month) {
    const r = generateReport({ expenses, categories, budgets, month, startDay: monthStartDay, isCurrent: isCurrentMonth(month) })
    if (r) {
      lines.push('')
      lines.push(`SPENDING — ${finPeriodLabel(month, monthStartDay)}:`)
      lines.push(`- Spent so far: ${money(r.total)} over ${r.daysElapsed} days (${r.daysLeft} left in the period)`)
      if (r.prevTotal > 0) lines.push(`- Previous period spent: ${money(r.prevTotal)}`)
      if (r.budget) lines.push(`- Monthly budget: ${money(r.budget)}; remaining: ${money(r.remaining)}; on pace to spend ~${money(r.projected)} by period end`)
      else lines.push(`- No overall monthly budget set`)
      if (r.biggest) lines.push(`- Biggest single expense: ${money(r.biggest.amount)} on ${catName(categories, r.biggest.categoryId)} (${formatDateShort(r.biggest.date)})`)
      lines.push(`- No-spend days: ${r.noSpendDays}; best no-spend streak: ${r.bestStreak} days`)
      if (r.movers?.length) {
        lines.push('- Category changes vs last period:')
        r.movers.forEach(m => lines.push(`   ${m.cat.name}: ${money(m.now)} (${m.delta >= 0 ? '+' : ''}${money(m.delta)}${m.pct != null ? `, ${m.pct >= 0 ? '+' : ''}${m.pct}%` : ''})`))
      }
      if (r.catBudgets?.length) {
        lines.push('- Category budgets:')
        r.catBudgets.forEach(b => lines.push(`   ${b.cat?.name || 'Category'}: spent ${money(b.spent)} of ${money(b.limit)} (${b.pct}%)`))
      }
    }
  } else {
    lines.push('')
    lines.push('SPENDING: no expenses logged yet.')
  }

  // ---- This-month category totals (all) ----
  if (month) {
    const totals = {}
    expenses.filter(e => e.month === month).forEach(e => { totals[e.categoryId] = (totals[e.categoryId] || 0) + Number(e.amount) })
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])
    if (top.length) {
      lines.push('- Category totals this period:')
      top.forEach(([id, amt]) => lines.push(`   ${catName(categories, id)}: ${money(amt)}`))
    }
  }

  // ---- Monthly history: total + per-category for each past financial month ----
  const byMonth = {}
  expenses.forEach(e => {
    if (!byMonth[e.month]) byMonth[e.month] = { total: 0, cats: {} }
    byMonth[e.month].total += Number(e.amount)
    byMonth[e.month].cats[e.categoryId] = (byMonth[e.month].cats[e.categoryId] || 0) + Number(e.amount)
  })
  const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a)).slice(0, 12)
  if (monthKeys.length > 1) {
    lines.push('')
    lines.push('MONTHLY HISTORY (financial months, newest first):')
    monthKeys.forEach(mk => {
      const m = byMonth[mk]
      const cats = Object.entries(m.cats).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([id, amt]) => `${catName(categories, id)} ${money(amt)}`).join(', ')
      lines.push(`   ${formatMonth(mk)}: total ${money(m.total)}${cats ? ` — ${cats}` : ''}`)
    })
  }

  // ---- Net worth (reuse computeNetWorth) ----
  const nw = computeNetWorth({ holdings, prices, assets, udhaar, metalRates })
  lines.push('')
  lines.push('NET WORTH:')
  lines.push(`- Total net worth: ${money(nw.total)}`)
  lines.push(`- Investments: ${money(nw.investments)}; Cash/bank: ${money(nw.bankCash)}; Other assets: ${money(nw.others)}`)
  if (nw.loans > 0) lines.push(`- Loans outstanding: ${money(nw.loans)}`)
  if (nw.udhaarReceivable > 0) lines.push(`- Money owed to you (udhaar): ${money(nw.udhaarReceivable)}`)
  if (nw.udhaarPayable > 0) lines.push(`- Money you owe (udhaar): ${money(nw.udhaarPayable)}`)

  // ---- Portfolio (per-holding detail: qty, avg, price, value, P&L, day change) ----
  const pf = portfolioSummary(holdings, prices)
  if (pf) {
    lines.push('')
    lines.push('PORTFOLIO:')
    lines.push(`- Invested: ${money(pf.invested)}${pf.priced ? `; current value: ${money(pf.current)}; overall P&L: ${pf.pnl >= 0 ? '+' : ''}${money(pf.pnl)}${pf.pnlPct != null ? ` (${pf.pnlPct >= 0 ? '+' : ''}${pf.pnlPct.toFixed(1)}%)` : ''}` : ' (live prices unavailable)'}`)
    holdings.forEach(h => {
      const p = prices[priceKey(h)]
      const invested = Number(h.qty) * Number(h.avgBuy)
      const unit = h.kind === 'mf' ? 'units' : 'shares'
      const priceLabel = h.kind === 'mf' ? 'NAV' : 'LTP'
      let s = `   ${h.name} (${h.kind === 'mf' ? 'fund' : 'stock'}): ${Number(h.qty)} ${unit} @ avg ₹${Number(h.avgBuy).toFixed(2)}`
      if (p) {
        const cur = Number(h.qty) * p.price
        const pnl = cur - invested
        const dayPct = p.prevClose > 0 ? ((p.price - p.prevClose) / p.prevClose) * 100 : null
        s += `, ${priceLabel} ₹${p.price.toFixed(2)}, value ${money(cur)}, P&L ${pnl >= 0 ? '+' : ''}${money(pnl)}${invested > 0 ? ` (${pnl >= 0 ? '+' : ''}${((pnl / invested) * 100).toFixed(1)}%)` : ''}${dayPct != null ? `, today ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%` : ''}`
      } else {
        s += `, invested ${money(invested)} (no live price)`
      }
      if (h.sip?.amount) s += `; SIP ${money(h.sip.amount)}/mo${h.sip.day ? ` on day ${h.sip.day}` : ''}`
      lines.push(s)
    })
  }

  // ---- Assets (gold/FD/loan detail) ----
  if (assets.length) {
    lines.push('')
    lines.push('ASSETS:')
    assets.forEach(a => {
      const v = assetValue(a, { metalRates })
      if (a.type === 'metal') lines.push(`   ${a.metal} ${a.grams}g (${a.purity || '24'}K): now ${money(v)}`)
      else if (a.type === 'fd') lines.push(`   Fixed deposit: principal ${money(a.principal)} at ${a.rate}%${a.startDate ? ` since ${formatDateShort(a.startDate)}` : ''} → now ${money(v)}`)
      else if (a.type === 'loan') lines.push(`   Loan (you owe): principal ${money(a.principal)} at ${a.rate}%${a.emi ? `, EMI ${money(a.emi)}/mo` : ''} → outstanding ${money(v)}`)
      else lines.push(`   Other asset: ${money(v)}`)
    })
  }

  // ---- Udhaar: net per person + each open entry, and settled count ----
  const open = udhaar.filter(u => u.status === 'open')
  if (open.length) {
    const perPerson = {}
    open.forEach(u => { perPerson[u.person] = (perPerson[u.person] || 0) + (u.direction === 'lent' ? Number(u.amount) : -Number(u.amount)) })
    lines.push('')
    lines.push('UDHAAR (money lent/borrowed):')
    Object.entries(perPerson).forEach(([person, net]) => {
      if (Math.abs(net) >= 1) lines.push(`   ${person}: net ${net > 0 ? `owes you ${money(net)}` : `you owe ${money(-net)}`}`)
    })
    lines.push('   Open entries:')
    open.forEach(u => {
      const dir = u.direction === 'lent' ? 'you lent' : 'you borrowed'
      lines.push(`     ${u.person} — ${dir} ${money(u.amount)}${u.note ? ` (${u.note})` : ''}${u.date ? ` on ${formatDateShort(u.date)}` : ''}`)
    })
  }
  const settled = udhaar.filter(u => u.status === 'settled').length
  if (settled) lines.push(`   (${settled} past udhaar entr${settled === 1 ? 'y' : 'ies'} already settled)`)

  // ---- Recent transactions ----
  if (expenses.length) {
    lines.push('')
    lines.push(`RECENT TRANSACTIONS (latest ${Math.min(RECENT_N, expenses.length)} of ${expenses.length}):`)
    expenses.slice(0, RECENT_N).forEach(e => {
      const desc = (e.description || '').trim()
      lines.push(`   ${formatDateShort(e.date)} · ${money(e.amount)} · ${catName(categories, e.categoryId)}${desc ? ` · ${desc}` : ''} · ${e.paymentType || ''}`.trim())
    })
    lines.push('(For older or per-category totals not listed above, use MONTHLY HISTORY. If a specific transaction is not listed, say you only have the most recent ones.)')
  }

  return lines.join('\n')
}

// How-to knowledge so the model doesn't invent app steps.
export const FEATURE_CHEATSHEET = `HOW THE APP WORKS (use for how-to questions):
- Add an expense: tap the round + button at the bottom-right of most screens.
- See spending analysis: the STATS tab (breakdown pie, monthly trends, report card).
- Set a budget: the BUDGET tab — set one overall monthly cap and/or per-category caps.
- Investments (stocks & mutual funds): MONEY tab → Portfolio → "+ Add". Tap any holding for its chart, fundamentals & news.
- Start a SIP: Portfolio → add a mutual fund → set a monthly SIP amount and day; it auto-adds units each month.
- Net worth (gold, FDs, loans, cash): MONEY tab → Net worth → add an asset. Gold/metals are valued at live rates; FDs compound; loans amortise.
- Udhaar (who owes whom): MONEY tab → Udhaar ledger — track money lent and borrowed per person, mark as settled.
- Change your salary day / month start: SETTINGS → "Month starts on" (months then run salary-day to salary-day).
- Backup your data: SETTINGS → Export JSON or CSV; Import restores a backup.
- Daily reminder & app lock (PIN/fingerprint): SETTINGS.
- Everything is stored on your device and works offline; only AI questions/recaps send a summary to the cloud.`

const RULES = `You are "Finances", a warm, concise financial companion inside a personal-finance app for an Indian user (currency is ₹).
Rules:
- Use ONLY the DATA and FEATURES provided below. All amounts are already calculated — never do arithmetic yourself and never invent a figure.
- If a specific number isn't in the DATA, say you don't have it rather than guessing.
- For "how do I…" questions, answer from FEATURES with the exact steps.
- Be brief and friendly: 1–4 short sentences, plain language, no markdown headings. Amounts in ₹.`

// One flattened prompt for the monthly recap.
export function recapPrompt(app) {
  const snapshot = buildSnapshot(app)
  return `${RULES}

Task: Write a friendly 3–4 sentence recap of the user's month using the figures below — how much they've spent, how they're tracking against budget, one notable category change, and a gentle, encouraging note. Do not list raw numbers mechanically; make it read like a helpful friend.

DATA:
${snapshot}`
}

// One flattened prompt for a chat turn (history + snapshot + new question).
export function askPrompt(app, history, question) {
  const snapshot = buildSnapshot(app)
  const convo = (history || [])
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n')
  return `${RULES}

${FEATURE_CHEATSHEET}

DATA:
${snapshot}
${convo ? `\nCONVERSATION SO FAR:\n${convo}` : ''}

User: ${question}
Assistant:`
}
