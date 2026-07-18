// Monthly report engine — everything is financial-month aware (salary-day periods).

const DAY = 86400000
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Start/end dates of a financial period. "2026-07" with startDay 25 → 25 Jul … 24 Aug.
export function periodRange(monthStr, startDay = 1) {
  const [y, m] = monthStr.split('-').map(Number)
  const start = new Date(y, m - 1, Number(startDay))
  const end = new Date(y, m, Number(startDay) - 1)
  if (Number(startDay) <= 1) end.setTime(new Date(y, m, 0).getTime())
  return { start, end, totalDays: Math.round((end - start) / DAY) + 1 }
}

function prevMonthStr(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function generateReport({ expenses, categories, budgets, month, startDay = 1, isCurrent }) {
  if (!month) return null
  const { start, end, totalDays } = periodRange(month, startDay)
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const inMonth = expenses.filter(e => e.month === month)
  const prevMonth = prevMonthStr(month)
  const inPrev = expenses.filter(e => e.month === prevMonth)

  const total = inMonth.reduce((s, e) => s + Number(e.amount), 0)
  const prevTotal = inPrev.reduce((s, e) => s + Number(e.amount), 0)

  // Elapsed / remaining days — for past months the whole period has elapsed
  const daysElapsed = isCurrent
    ? Math.max(1, Math.min(totalDays, Math.round((today - start) / DAY) + 1))
    : totalDays
  const daysLeft = Math.max(0, totalDays - daysElapsed)

  // ---- Calendar heatmap: one cell per day of the period ----
  const perDay = {}
  inMonth.forEach(e => { perDay[e.date] = (perDay[e.date] || 0) + Number(e.amount) })
  const days = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const d = new Date(t)
    const key = iso(d)
    days.push({
      date: key,
      day: d.getDate(),
      dow: (d.getDay() + 6) % 7,           // 0 = Monday
      amount: perDay[key] || 0,
      future: isCurrent && d > today,
      isToday: isCurrent && d.getTime() === today.getTime(),
    })
  }
  const maxDay = Math.max(...days.map(d => d.amount), 1)

  // ---- No-spend days & best streak (elapsed days only) ----
  const elapsed = days.filter(d => !d.future)
  const noSpendDays = elapsed.filter(d => d.amount === 0).length
  let bestStreak = 0, run = 0
  elapsed.forEach(d => { run = d.amount === 0 ? run + 1 : 0; bestStreak = Math.max(bestStreak, run) })

  // ---- Weekday pattern: avg spend per weekday ----
  const dowSum = Array(7).fill(0), dowCnt = Array(7).fill(0)
  elapsed.forEach(d => { dowSum[d.dow] += d.amount; dowCnt[d.dow]++ })
  const dowAvg = dowSum.map((s, i) => dowCnt[i] ? s / dowCnt[i] : 0)
  const weekdayAvg = (dowAvg.slice(0, 5).reduce((a, b) => a + b, 0)) / 5
  const weekendAvg = (dowAvg[5] + dowAvg[6]) / 2
  const weekendX = weekdayAvg > 0 ? weekendAvg / weekdayAvg : null
  const maxDowAvg = Math.max(...dowAvg, 1)

  // ---- Category movers vs previous period ----
  const catTotal = (list) => {
    const t = {}
    list.forEach(e => { t[e.categoryId] = (t[e.categoryId] || 0) + Number(e.amount) })
    return t
  }
  const nowCats = catTotal(inMonth), prevCats = catTotal(inPrev)
  const movers = prevTotal > 0
    ? [...new Set([...Object.keys(nowCats), ...Object.keys(prevCats)])]
        .map(id => {
          const cat = categories.find(c => c.id === Number(id))
          const a = nowCats[id] || 0, b = prevCats[id] || 0
          return { cat, now: a, prev: b, delta: a - b, pct: b > 0 ? Math.round(((a - b) / b) * 100) : null }
        })
        .filter(m => m.cat && Math.abs(m.delta) >= 100)
        .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
        .slice(0, 5)
    : []

  // ---- Biggest single expense ----
  const biggest = inMonth.reduce((a, e) => (!a || Number(e.amount) > Number(a.amount)) ? e : a, null)

  // ---- Cumulative race: this month vs last, day-by-day ----
  const prevRange = periodRange(prevMonth, startDay)
  const prevPerDay = {}
  inPrev.forEach(e => { prevPerDay[e.date] = (prevPerDay[e.date] || 0) + Number(e.amount) })
  let curCum = 0, prevCum = 0
  const race = []
  for (let i = 0; i < totalDays; i++) {
    const curD = new Date(start.getTime() + i * DAY)
    const prevD = new Date(prevRange.start.getTime() + i * DAY)
    curCum += perDay[iso(curD)] || 0
    if (prevD <= prevRange.end) prevCum += prevPerDay[iso(prevD)] || 0
    race.push({
      d: i + 1,
      cur: (isCurrent && curD > today) ? null : curCum,   // stop the line at today
      prev: prevTotal > 0 ? prevCum : null,
    })
  }

  // ---- Little things add up: repeated purchases this month ----
  const groups = {}
  inMonth.forEach(e => {
    const key = (e.note || '').trim().toLowerCase() || `cat:${e.categoryId}`
    if (!groups[key]) groups[key] = { label: (e.note || '').trim(), categoryId: e.categoryId, count: 0, total: 0 }
    groups[key].count++
    groups[key].total += Number(e.amount)
  })
  const habits = Object.values(groups)
    .filter(g => g.count >= 3)
    .map(g => ({ ...g, cat: categories.find(c => c.id === g.categoryId), avg: g.total / g.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  // ---- Category budgets: how each is tracking this month ----
  const catBudgets = Object.values(budgets || {})
    .filter(b => b.categoryId != null && b.amount > 0)
    .map(b => {
      const cat = categories.find(c => c.id === b.categoryId)
      const spent = nowCats[b.categoryId] || 0
      const pace = isCurrent ? (spent / daysElapsed) * totalDays : spent
      return { cat, limit: b.amount, spent, pct: Math.round((spent / b.amount) * 100), pace }
    })
    .filter(b => b.cat)
    .sort((a, b) => b.pct - a.pct)

  // ---- Budget, pace & safe-to-spend ----
  const budget = budgets?.monthly?.amount || 0
  const projected = Math.round((total / daysElapsed) * totalDays)
  const remaining = budget > 0 ? budget - total : null
  const safePerDay = isCurrent && budget > 0 && daysLeft > 0 ? Math.floor(Math.max(0, remaining) / daysLeft) : null

  // ---- Grade (0–100 → A…F) ----
  let score = 0
  const reasons = []
  // 1. Budget pace (40 pts) — or vs previous month if no budget
  if (budget > 0) {
    const pace = (total / daysElapsed) / (budget / totalDays)
    if (pace <= 0.85) { score += 40; reasons.push('well under budget') }
    else if (pace <= 1.0) { score += 32; reasons.push('on budget') }
    else if (pace <= 1.2) { score += 18; reasons.push('slightly over budget pace') }
    else { score += 6; reasons.push('spending well over budget pace') }
  } else if (prevTotal > 0) {
    const scaled = (prevTotal / totalDays) * daysElapsed
    if (total <= scaled * 0.9) { score += 36; reasons.push('spending less than last month') }
    else if (total <= scaled * 1.1) { score += 28; reasons.push('about the same as last month') }
    else { score += 12; reasons.push('spending more than last month') }
  } else score += 24
  // 2. vs previous month (25 pts)
  if (prevTotal > 0) {
    const scaled = isCurrent ? (prevTotal / totalDays) * daysElapsed : prevTotal
    if (total < scaled * 0.95) score += 25
    else if (total <= scaled * 1.1) score += 17
    else score += 6
  } else score += 15
  // 3. No-spend days (15 pts)
  score += Math.min(noSpendDays, 5) * 3
  if (noSpendDays >= 3) reasons.push(`${noSpendDays} no-spend days`)
  // 4. Logging consistency (20 pts)
  const loggedDays = elapsed.filter(d => d.amount > 0).length
  const consistency = elapsed.length ? (loggedDays + noSpendDays === elapsed.length ? loggedDays / Math.max(elapsed.length - noSpendDays, 1) : loggedDays / elapsed.length) : 0
  score += Math.round(Math.min(consistency, 1) * 20)

  const grade = score >= 85 ? 'A' : score >= 75 ? 'B+' : score >= 65 ? 'B' : score >= 55 ? 'C+' : score >= 45 ? 'C' : score >= 35 ? 'D' : 'F'
  if (weekendX && weekendX >= 1.8) reasons.push(`weekends run ${weekendX.toFixed(1)}× weekdays`)

  return {
    month, isCurrent, start, end, totalDays, daysElapsed, daysLeft,
    total, prevTotal, prevMonth,
    days, maxDay, noSpendDays, bestStreak,
    dowAvg, maxDowAvg, weekendX,
    movers, biggest, race, habits, catBudgets,
    budget, remaining, safePerDay, projected,
    grade, score, reasons: reasons.slice(0, 2),
  }
}
