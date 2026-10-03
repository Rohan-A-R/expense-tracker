import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getSetting, setSetting } from '../services/db'
import ExpenseCard from '../components/expenses/ExpenseCard'
import ExpenseForm from '../components/expenses/ExpenseForm'
import { formatCurrency, formatMonth, getWeekRange, currentFinMonth } from '../utils/formatters'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const INK = '#1B1710', RUST = '#D9481C', GREEN = '#4E9E6A'


export default function Dashboard({ onOpenUdhaar, onOpenPortfolio, onOpenSpends }) {
  const { expenses, budgets, udhaar, holdings, prices, monthStartDay } = useApp()
  const [editExpense, setEditExpense] = useState(null)

  const activeMonth = useMemo(() => {
    const months = [...new Set(expenses.map(e => e.month))].sort((a, b) => b.localeCompare(a))
    return months[0] || null
  }, [expenses])

  const { start: weekStart, end: weekEnd } = getWeekRange()

  // Everything the hero says, from the financial month (which may start on payday, not the
  // 1st): days gone and left, budget left and a safe daily spend, and how this month
  // compares with the previous one *at the same point* — a full April against a part May
  // would always read as "lighter".
  const stats = useMemo(() => {
    const empty = { total: 0, weekTotal: 0, dailyAvg: 0, txCount: 0, budget: null, remaining: 0, pct: 0 }
    if (!activeMonth) return empty
    const sd = Math.max(1, Number(monthStartDay) || 1)
    const [y, m] = activeMonth.split('-').map(Number)
    const start = new Date(y, m - 1, sd), end = new Date(y, m, sd)
    const totalDays = Math.round((end - start) / DAY_MS)
    const isCurrent = activeMonth === currentFinMonth(sd)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const elapsed = isCurrent ? Math.min(totalDays, Math.floor((today - start) / DAY_MS) + 1) : totalDays
    const daysLeft = isCurrent ? totalDays - elapsed + 1 : 0          // today included

    const monthExp = expenses.filter(e => e.month === activeMonth)
    const total = monthExp.reduce((s, e) => s + Number(e.amount), 0)
    const weekTotal = expenses.filter(e => e.date >= weekStart && e.date <= weekEnd).reduce((s, e) => s + Number(e.amount), 0)

    const prevKey = `${new Date(y, m - 2, 1).getFullYear()}-${String(new Date(y, m - 2, 1).getMonth() + 1).padStart(2, '0')}`
    const prevCut = new Date(y, m - 2, sd + elapsed - 1)                // same day-of-period last month
    const prevTotal = expenses
      .filter(e => e.month === prevKey && new Date(e.date + 'T00:00:00') <= prevCut)
      .reduce((s, e) => s + Number(e.amount), 0)
    // Only from the second week: a few days in, one rent payment swings it by thousands of %.
    const vsPrev = prevTotal > 0 && elapsed >= 7 ? ((total - prevTotal) / prevTotal) * 100 : null

    const budget = budgets['monthly']
    const remaining = budget ? budget.amount - total : 0
    return {
      total, weekTotal, txCount: monthExp.length,
      dailyAvg: elapsed > 0 ? total / elapsed : 0,
      isCurrent, daysLeft, monthGonePct: Math.round((elapsed / totalDays) * 100),
      vsPrev, prevName: new Date(y, m - 2, 1).toLocaleDateString('en-IN', { month: 'long' }),
      budget, remaining,
      pct: budget ? Math.min(Math.round((total / budget.amount) * 100), 100) : 0,
      safePerDay: budget && daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : null,
    }
  }, [expenses, budgets, activeMonth, monthStartDay, weekStart, weekEnd])

  // The journal: the latest spends grouped by day, each day headed with its full total.
  const journal = useMemo(() => {
    const recent = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id)).slice(0, 8)
    const dayTotal = {}
    expenses.forEach(e => { dayTotal[e.date] = (dayTotal[e.date] || 0) + Number(e.amount) })
    const groups = []
    recent.forEach(e => {
      const g = groups[groups.length - 1]
      if (g && g.date === e.date) g.items.push(e)
      else groups.push({ date: e.date, total: dayTotal[e.date], items: [e] })
    })
    return groups
  }, [expenses])


  // Gross udhaar position — kept separate by direction. Collecting from one person
  // and owing another are independent, so we never net them into a single figure.
  const udhaarInfo = useMemo(() => {
    const open = udhaar.filter(u => u.status === 'open')
    const perPerson = {}
    open.forEach(u => {
      perPerson[u.person] = (perPerson[u.person] || 0) + (u.direction === 'lent' ? Number(u.amount) : -Number(u.amount))
    })
    const nets = Object.values(perPerson)
    const toCollect = nets.reduce((s, n) => s + Math.max(n, 0), 0)
    const toPay = nets.reduce((s, n) => s + Math.max(-n, 0), 0)
    const oldestDays = open.length
      ? Math.floor((Date.now() - Math.min(...open.map(u => new Date(u.date + 'T00:00:00').getTime()))) / (24 * 60 * 60 * 1000))
      : 0
    return { hasOpen: open.length > 0, toCollect, toPay, oldestDays }
  }, [udhaar])

  // Both udhaar strips behave like notifications: dismiss with ✕, reappear after a week.
  // - balance strip: shown when open balances exist (snooze key: udhaarStripAt)
  // - discovery nudge: shown when nothing is tracked (snooze key: udhaarNudgeAt)
  const [showUdhaarStrip, setShowUdhaarStrip] = useState(false)
  const [showUdhaarNudge, setShowUdhaarNudge] = useState(false)
  useEffect(() => {
    const key = udhaarInfo.hasOpen ? 'udhaarStripAt' : 'udhaarNudgeAt'
    getSetting(key).then(last => {
      const due = !last || Date.now() - last > WEEK_MS
      setShowUdhaarStrip(udhaarInfo.hasOpen && due)
      setShowUdhaarNudge(!udhaarInfo.hasOpen && due)
    })
  }, [udhaarInfo.hasOpen])

  async function snoozeUdhaar() {
    const key = udhaarInfo.hasOpen ? 'udhaarStripAt' : 'udhaarNudgeAt'
    await setSetting(key, Date.now())
    setShowUdhaarStrip(false)
    setShowUdhaarNudge(false)
  }

  // Portfolio value + P&L (only holdings with a known price count toward current value)
  const portfolio = useMemo(() => {
    if (!holdings.length) return null
    let invested = 0, current = 0, day = 0, prevValue = 0
    holdings.forEach(h => {
      invested += Number(h.qty) * Number(h.avgBuy)
      const p = prices[h.kind === 'mf' ? `mf:${h.schemeCode}` : h.symbol]
      if (p) { current += Number(h.qty) * p.price; day += Number(h.qty) * (p.price - p.prevClose); prevValue += Number(h.qty) * p.prevClose }
    })
    return {
      invested, current, day, pnl: current - invested, priced: current > 0,
      pnlPct: invested > 0 ? ((current - invested) / invested) * 100 : null,
      dayPct: prevValue > 0 ? (day / prevValue) * 100 : null,
    }
  }, [holdings, prices])

  const today = new Date()
  const pctTxt = (v) => `${Math.abs(v) < 1 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))}%`
  const up = (v) => v >= 0

  return (
    <div className="min-h-screen px-6 pt-4 pb-6">
      {/* Masthead — today's date; the month lives on the hero */}
      <div className="flex items-baseline justify-between rule-2 pb-3">
        <span className="font-serif-i text-[34px] leading-none">Finances</span>
        <span className="text-[11px] font-bold tracking-[2px] text-ink/60">
          {today.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase()} · {today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase()}
        </span>
      </div>

      {/* Hero — the month in one number, then one sentence of context */}
      <div className="pt-6">
        <div className="text-[10.5px] font-bold tracking-[2px]" style={{ color: RUST }}>
          SPENT IN {activeMonth ? formatMonth(activeMonth).split(' ')[0].toUpperCase() : 'THIS MONTH'}
        </div>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="font-serif-n text-[68px] leading-[.95] tracking-[-1.5px]">{formatCurrency(stats.total)}</span>
          {stats.budget && <span className="font-serif-n text-[22px] text-ink/40">/ {Number(stats.budget.amount).toLocaleString('en-IN')}</span>}
        </div>
        <HeroLine stats={stats} pctTxt={pctTxt} up={up} />
      </div>

      {/* Budget meter — spent so far against how much of the month has gone */}
      {stats.budget && (
        <div className="mt-5">
          <div className="relative h-2.5" style={{ background: 'repeating-linear-gradient(90deg, rgba(27,23,16,.13) 0 2px, transparent 2px 6px)' }}>
            <div className="absolute inset-y-0 left-0" style={{ width: `${stats.pct}%`, background: stats.pct >= 90 ? RUST : INK }} />
            {stats.isCurrent && <div className="absolute -top-1.5 -bottom-1.5 w-[1.5px]" style={{ left: `${stats.monthGonePct}%`, background: RUST }} />}
          </div>
          <div className="flex justify-between text-[11px] font-bold mt-2 text-ink/55">
            <span>{stats.pct}% used</span>
            {stats.isCurrent && <span style={{ color: RUST }}>│ {stats.monthGonePct}% of month gone</span>}
          </div>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-3 border-t border-ink mt-5" style={{ borderBottom: '1px solid rgba(27,23,16,.15)' }}>
        {[
          stats.safePerDay != null ? { l: 'Safe / day', v: formatCurrency(Math.round(stats.safePerDay)) } : { l: 'This week', v: formatCurrency(stats.weekTotal) },
          { l: 'Daily avg', v: formatCurrency(Math.round(stats.dailyAvg)) },
          { l: 'Entries', v: String(stats.txCount) },
        ].map((c, i) => (
          <div key={c.l} className="py-3 min-w-0" style={i ? { borderLeft: '1px dotted rgba(27,23,16,.3)', paddingLeft: 12 } : undefined}>
            <div className="text-[9.5px] font-bold tracking-[1.5px] text-ink/50 truncate">{c.l.toUpperCase()}</div>
            <div className="font-serif-n text-[26px] leading-tight truncate">{c.v}</div>
          </div>
        ))}
      </div>

      {/* Udhaar balance strip — two cells (to collect / to pay), matches the stat-row language */}
      {showUdhaarStrip && (
        <div className="flex items-center py-3" style={{ borderBottom: '1px solid rgba(27,23,16,.25)' }}>
          <button onClick={onOpenUdhaar} className="flex flex-1 min-w-0 text-left">
            {udhaarInfo.toCollect > 0 && (
              <div className="flex-1 min-w-0 pr-3.5">
                <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">TO COLLECT</div>
                <div className="font-serif-n text-2xl leading-tight" style={{ color: '#4E9E6A' }}>{formatCurrency(udhaarInfo.toCollect)}</div>
              </div>
            )}
            {udhaarInfo.toPay > 0 && (
              <div className="flex-1 min-w-0 pl-3.5"
                style={udhaarInfo.toCollect > 0 ? { borderLeft: '1px dotted rgba(27,23,16,.32)' } : undefined}>
                <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">TO PAY</div>
                <div className="font-serif-n text-2xl leading-tight" style={{ color: '#D9481C' }}>{formatCurrency(udhaarInfo.toPay)}</div>
              </div>
            )}
            {udhaarInfo.toCollect === 0 && udhaarInfo.toPay === 0 && (
              <div className="flex-1 text-[13px] font-semibold py-1.5">Open udhaar entries</div>
            )}
          </button>
          <button onClick={snoozeUdhaar} aria-label="Dismiss for a week" className="text-ink/45 text-lg px-2 leading-none active:opacity-60">×</button>
          <button onClick={onOpenUdhaar} aria-label="Open udhaar" className="text-ink/45 text-lg px-1 leading-none active:opacity-60">→</button>
        </div>
      )}

      {/* Udhaar weekly nudge — only when nothing is tracked; snoozes for 7 days */}
      {showUdhaarNudge && (
        <div className="flex items-center gap-2.5 py-3.5" style={{ borderBottom: '1px solid rgba(27,23,16,.25)' }}>
          <span className="text-base">🤝</span>
          <button onClick={onOpenUdhaar} className="flex-1 text-left">
            <span className="text-[13px] font-semibold">Lent or borrowed money lately?</span>
            <span className="block text-[11.5px] text-ink/50">Track it in the Udhaar ledger →</span>
          </button>
          <button onClick={snoozeUdhaar} aria-label="Dismiss for a week"
            className="w-7 h-7 rounded-lg border border-ink/20 text-ink/50 text-sm flex items-center justify-center active:scale-90">✕</button>
        </div>
      )}

      {/* Portfolio — a coloured card so it reads as a door into the Portfolio page */}
      <button onClick={onOpenPortfolio}
        className="w-full text-left mt-5 rounded-[20px] px-5 py-4 text-paper active:scale-[0.985] transition-transform relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #3E8A5C 0%, #2C6845 60%, #1F4D33 100%)', boxShadow: '0 12px 24px -10px rgba(44,104,69,.55)' }}>
        <span className="absolute -right-10 -top-12 w-36 h-36 rounded-full" style={{ background: 'rgba(255,255,255,.07)' }} />
        <div className="relative flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[1.8px]" style={{ color: 'rgba(245,240,228,.7)' }}>PORTFOLIO</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(245,240,228,.16)' }}>View →</span>
        </div>
        {portfolio && portfolio.priced ? (
          <div className="relative flex items-end justify-between mt-1.5 gap-3">
            <span className="font-serif-n text-[30px] leading-none">{formatCurrency(portfolio.current)}</span>
            <div className="text-right text-[12px] font-bold leading-[1.5]">
              <div style={{ color: up(portfolio.pnl) ? '#BFE8CB' : '#FFC4A8' }}>
                {up(portfolio.pnl) ? '+' : '−'}{formatCurrency(Math.abs(portfolio.pnl))}
                {portfolio.pnlPct != null ? ` · ${up(portfolio.pnl) ? '+' : '−'}${Math.abs(portfolio.pnlPct).toFixed(1)}%` : ''}
              </div>
              {portfolio.dayPct != null && (
                <div style={{ color: 'rgba(245,240,228,.75)' }}>
                  today {up(portfolio.day) ? '+' : '−'}{formatCurrency(Math.abs(portfolio.day))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative text-[14px] font-semibold mt-1.5">
            {portfolio ? 'Updating prices…' : 'Track your stocks & mutual funds'}
          </div>
        )}
      </button>

      {/* The journal — latest spends, grouped by day */}
      <div className="flex items-baseline justify-between mt-7">
        <span className="font-serif-i text-[26px] leading-none">The journal</span>
        {expenses.length > 0 && (
          <button onClick={onOpenSpends} className="text-[11px] font-bold tracking-[1.5px] active:opacity-60" style={{ color: RUST }}>
            ALL {expenses.length} →
          </button>
        )}
      </div>
      {journal.length === 0 ? (
        <div className="py-16 text-center text-ink/40">
          <p className="font-serif-n text-xl text-ink">Nothing yet</p>
          <p className="text-sm mt-1">Tap + to add your first expense</p>
        </div>
      ) : journal.map(g => (
        <div key={g.date}>
          <div className="flex justify-between text-[10px] font-bold tracking-[1.8px] mt-4 pb-1.5 border-b border-ink">
            <span>{dayLabel(g.date)}</span>
            <span className="text-ink/50">{formatCurrency(g.total)}</span>
          </div>
          {g.items.map(exp => <ExpenseCard key={exp.id} expense={exp} onEdit={setEditExpense} variant="journal" />)}
        </div>
      ))}

      <ExpenseForm isOpen={!!editExpense} onClose={() => setEditExpense(null)} editExpense={editExpense} />
    </div>
  )
}

// "₹6,976 left for 9 days — 12% lighter than April at this point."
function HeroLine({ stats, pctTxt, up }) {
  const parts = []
  if (stats.budget && stats.isCurrent) {
    parts.push(stats.remaining >= 0
      ? `${formatCurrency(stats.remaining)} left for ${stats.daysLeft} ${stats.daysLeft === 1 ? 'day' : 'days'}`
      : `${formatCurrency(-stats.remaining)} over budget`)
  } else if (!stats.isCurrent && stats.txCount) {
    parts.push(`Across ${stats.txCount} spends`)
  }
  const cmp = stats.vsPrev != null && Math.abs(stats.vsPrev) >= 0.5
  if (!parts.length && !cmp) return null
  return (
    <p className="font-serif-i text-[21px] leading-[1.25] mt-2.5 text-ink/80">
      {parts[0]}
      {cmp && (
        <>
          {parts.length ? ' — ' : ''}
          <span className="not-italic font-serif-n" style={{ color: up(stats.vsPrev) ? RUST : GREEN }}>
            {stats.vsPrev >= 100
              ? `${(1 + stats.vsPrev / 100).toFixed(1)}× ${stats.prevName}'s pace`
              : `${pctTxt(stats.vsPrev)} ${up(stats.vsPrev) ? 'heavier' : 'lighter'}`}
          </span>
          {stats.vsPrev < 100 && <> than {stats.prevName}{stats.isCurrent ? ' at this point' : ''}</>}.
        </>
      )}
      {!cmp && '.'}
    </p>
  )
}

function dayLabel(date) {
  const d = new Date(date + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((t - d) / DAY_MS)
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'YESTERDAY'
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '').toUpperCase()
}
