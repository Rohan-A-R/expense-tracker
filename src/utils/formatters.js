export function formatCurrency(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function formatMonth(monthStr) {
  const [year, month] = monthStr.split('-')
  const date = new Date(year, month - 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Financial month: with startDay=25, "2026-07" runs 25 Jul – 24 Aug.
// Days before startDay belong to the previous month's period.
export function finMonthOf(dateStr, startDay = 1) {
  const d = new Date(dateStr + 'T00:00:00')
  if (Number(startDay) > 1 && d.getDate() < Number(startDay)) d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentFinMonth(startDay = 1) {
  return finMonthOf(new Date().toISOString().split('T')[0], startDay)
}

// Human label for a financial period, e.g. "25 Jul – 24 Aug" (startDay > 1)
export function finPeriodLabel(monthStr, startDay = 1) {
  if (Number(startDay) <= 1) return formatMonth(monthStr)
  const [y, m] = monthStr.split('-').map(Number)
  const from = new Date(y, m - 1, Number(startDay))
  const to = new Date(y, m, Number(startDay) - 1)
  const f = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${f(from)} – ${f(to)}`
}

export function currentDate() {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

export function getDayName(dateStr) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-IN', { weekday: 'long' })
}

export function getWeekRange() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  }
}

export function monthsBack(n) {
  const date = new Date()
  date.setMonth(date.getMonth() - n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getPercentage(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}
