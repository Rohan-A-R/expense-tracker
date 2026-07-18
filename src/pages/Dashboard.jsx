import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getSetting, setSetting } from '../services/db'
import ExpenseCard from '../components/expenses/ExpenseCard'
import ExpenseForm from '../components/expenses/ExpenseForm'
import { formatCurrency, formatMonth, getWeekRange } from '../utils/formatters'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const portfolioDark = (v) => v > 0 ? '#84C79B' : v < 0 ? '#F0844F' : '#F5F0E4'

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

const LABEL = 'text-[10px] font-bold uppercase tracking-[1.5px] text-ink/55'

export default function Dashboard({ onOpenUdhaar, onOpenPortfolio, onOpenSpends }) {
  const { expenses, categories, budgets, udhaar, holdings, prices } = useApp()
  const [editExpense, setEditExpense] = useState(null)

  const activeMonth = useMemo(() => {
    const months = [...new Set(expenses.map(e => e.month))].sort((a, b) => b.localeCompare(a))
    return months[0] || null
  }, [expenses])

  const { start: weekStart, end: weekEnd } = getWeekRange()

  const stats = useMemo(() => {
    if (!activeMonth) return { total: 0, weekTotal: 0, dailyAvg: 0, txCount: 0, topCat: null, topAmt: 0, budget: null, remaining: 0, pct: 0 }
    const monthExp = expenses.filter(e => e.month === activeMonth)
    const total = monthExp.reduce((s, e) => s + Number(e.amount), 0)
    const weekTotal = expenses.filter(e => e.date >= weekStart && e.date <= weekEnd).reduce((s, e) => s + Number(e.amount), 0)
    const [y, m] = activeMonth.split('-').map(Number)
    const now = new Date()
    const isCurrentMonth = y === now.getFullYear() && m === (now.getMonth() + 1)
    const daysElapsed = isCurrentMonth ? now.getDate() : new Date(y, m, 0).getDate()
    const dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0
    const catTotals = {}
    monthExp.forEach(e => { catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + Number(e.amount) })
    const [topId, topAmt] = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0] || [null, 0]
    const topCat = categories.find(c => c.id === Number(topId))
    const budget = budgets['monthly']
    const remaining = budget ? Math.max(budget.amount - total, 0) : 0
    const pct = budget ? Math.min(Math.round((total / budget.amount) * 100), 100) : 0
    return { total, weekTotal, dailyAvg, txCount: monthExp.length, topCat, topAmt, budget, remaining, pct }
  }, [expenses, categories, budgets, activeMonth, weekStart, weekEnd])

  const recent = useMemo(() =>
    [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8), [expenses])

  const budgetColor = stats.pct >= 90 ? '#D9481C' : stats.pct >= 70 ? '#C77A1B' : '#1B1710'

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

  return (
    <div className="min-h-screen px-6 pt-4">
      {/* Header */}
      <div className="flex items-baseline justify-between rule-2 pb-3">
        <span className="font-serif-i text-[34px] leading-none">Finances</span>
        <span className="text-[11px] font-bold tracking-[2px] text-ink/60">
          {activeMonth ? formatMonth(activeMonth).toUpperCase() : 'NO DATA'}
        </span>
      </div>

      {/* Total spent */}
      <div className="pt-6 pb-1">
        <div className={LABEL}>Total spent</div>
        <div className="font-serif-n text-[72px] leading-[1.02] tracking-[-1px]">{formatCurrency(stats.total)}</div>
      </div>

      {/* Stat row */}
      <div className="flex border-t border-ink">
        {[
          { l: 'This week', v: formatCurrency(stats.weekTotal) },
          { l: 'Daily avg', v: formatCurrency(Math.round(stats.dailyAvg)) },
          { l: 'Entries', v: String(stats.txCount) },
        ].map((s, i) => (
          <div key={s.l} className="flex-1 py-3 min-w-0"
            style={{
              paddingLeft: i === 0 ? 0 : 14,
              paddingRight: i === 2 ? 0 : 14,
              borderRight: i < 2 ? '1px solid rgba(27,23,16,.25)' : 'none',
            }}>
            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 truncate">{s.l.toUpperCase()}</div>
            <div className="font-serif-n text-2xl leading-tight truncate">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Udhaar balance strip — dismissible like a notification, returns after a week */}
      {showUdhaarStrip && (
        <div className="flex items-center gap-2.5 py-3.5 border-t border-ink/25">
          <span className="text-base">🤝</span>
          <button onClick={onOpenUdhaar} className="flex-1 text-left min-w-0">
            <span className="text-[13px] font-semibold">
              {udhaarInfo.toCollect > 0 && (
                <span style={{ color: '#4E9E6A' }}>{formatCurrency(udhaarInfo.toCollect)} to collect</span>
              )}
              {udhaarInfo.toCollect > 0 && udhaarInfo.toPay > 0 && <span className="text-ink/40"> · </span>}
              {udhaarInfo.toPay > 0 && (
                <span style={{ color: '#D9481C' }}>{formatCurrency(udhaarInfo.toPay)} to pay</span>
              )}
              {udhaarInfo.toCollect === 0 && udhaarInfo.toPay === 0 && (
                <span>Open udhaar entries</span>
              )}
            </span>
            {udhaarInfo.oldestDays >= 14 && (
              <span className="block text-[11.5px] text-ink/45 font-medium">oldest pending {udhaarInfo.oldestDays} days</span>
            )}
          </button>
          <button onClick={snoozeUdhaar} aria-label="Dismiss for a week"
            className="w-7 h-7 rounded-lg border border-ink/20 text-ink/50 text-sm flex items-center justify-center active:scale-90">✕</button>
        </div>
      )}

      {/* Udhaar weekly nudge — only when nothing is tracked; snoozes for 7 days */}
      {showUdhaarNudge && (
        <div className="flex items-center gap-2.5 py-3.5 border-t border-ink/25">
          <span className="text-base">🤝</span>
          <button onClick={onOpenUdhaar} className="flex-1 text-left">
            <span className="text-[13px] font-semibold">Lent or borrowed money lately?</span>
            <span className="block text-[11.5px] text-ink/50">Track it in the Udhaar ledger →</span>
          </button>
          <button onClick={snoozeUdhaar} aria-label="Dismiss for a week"
            className="w-7 h-7 rounded-lg border border-ink/20 text-ink/50 text-sm flex items-center justify-center active:scale-90">✕</button>
        </div>
      )}

      {/* Portfolio card — mini stock-app dashboard */}
      {portfolio && portfolio.priced ? (
        <button onClick={onOpenPortfolio} className="w-full text-left mt-3.5 rounded-2xl px-4 py-3 text-paper active:scale-[0.99] transition-transform" style={{ background: '#1B1710' }}>
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.55)' }}>PORTFOLIO</span>
            <span className="text-sm" style={{ color: 'rgba(245,240,228,.5)' }}>→</span>
          </div>
          <div className="flex items-end justify-between mt-0.5">
            <span className="font-serif-n text-[23px] leading-none">{formatCurrency(portfolio.current)}</span>
            <span className="text-[11.5px] font-bold" style={{ color: portfolioDark(portfolio.pnl) }}>
              {portfolio.pnl >= 0 ? '+' : '−'}{formatCurrency(Math.abs(portfolio.pnl))}
              {portfolio.pnlPct != null ? ` (${portfolio.pnl >= 0 ? '+' : '−'}${Math.abs(portfolio.pnlPct).toFixed(1)}%)` : ''}
            </span>
          </div>
          {portfolio.dayPct != null && (
            <div className="text-[10.5px] font-semibold mt-1" style={{ color: portfolioDark(portfolio.day) }}>
              {portfolio.day >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(portfolio.day))} ({Math.abs(portfolio.dayPct).toFixed(2)}%) today
            </div>
          )}
        </button>
      ) : (
        <button onClick={onOpenPortfolio} className="w-full text-left mt-3.5 rounded-2xl px-4 py-3 text-paper active:scale-[0.99] transition-transform" style={{ background: '#1B1710' }}>
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.55)' }}>PORTFOLIO</span>
            <span className="text-sm" style={{ color: 'rgba(245,240,228,.5)' }}>→</span>
          </div>
          <div className="text-[13.5px] font-semibold mt-1" style={{ color: 'rgba(245,240,228,.9)' }}>
            {portfolio ? 'Updating prices…' : 'Track your stocks & mutual funds'}
          </div>
        </button>
      )}

      {/* Budget */}
      {stats.budget && (
        <div className="pt-5 pb-1">
          <div className="flex justify-between text-[11px] font-bold tracking-[1.5px] mb-2.5">
            <span className="text-ink/60">BUDGET {formatCurrency(stats.budget.amount)}</span>
            <span style={{ color: budgetColor }}>{stats.pct}% USED</span>
          </div>
          <div className="h-1.5" style={{ background: 'rgba(27,23,16,.14)' }}>
            <div className="h-full" style={{ width: `${stats.pct}%`, background: budgetColor }} />
          </div>
          <div className="text-xs text-ink/55 mt-2">{formatCurrency(stats.remaining)} remaining</div>
        </div>
      )}

      {/* Top category */}
      {stats.topCat && (
        <div className="flex items-center gap-3 py-4 mt-3 rule border-t border-ink/25">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: tint(stats.topCat.color, 0.2) }}>{stats.topCat.icon}</div>
          <div className="flex-1">
            <div className={LABEL}>Top category</div>
            <div className="text-[15px] font-bold">{stats.topCat.name}</div>
          </div>
          <span className="font-serif-n text-2xl">{formatCurrency(stats.topAmt)}</span>
        </div>
      )}

      {/* Recent */}
      <div className="flex items-baseline justify-between mt-5 mb-1">
        <span className={LABEL}>Recent</span>
        {expenses.length > 0 && (
          <button onClick={onOpenSpends} className="text-[11px] font-bold tracking-[1px] text-brand active:opacity-60">
            SEE ALL SPENDS →
          </button>
        )}
      </div>
      {recent.length === 0 ? (
        <div className="py-16 text-center text-ink/40">
          <p className="font-serif-n text-xl text-ink">Nothing yet</p>
          <p className="text-sm mt-1">Tap + to add your first expense</p>
        </div>
      ) : (
        <>
          <div>{recent.map(exp => <ExpenseCard key={exp.id} expense={exp} onEdit={setEditExpense} />)}</div>
          {expenses.length > recent.length && (
            <button onClick={onOpenSpends} className="w-full mt-3 py-3.5 rounded-2xl border border-ink/25 text-sm font-bold text-ink/70 active:scale-[0.98] transition-transform">
              See all {expenses.length} spends →
            </button>
          )}
        </>
      )}

      <ExpenseForm isOpen={!!editExpense} onClose={() => setEditExpense(null)} editExpense={editExpense} />
    </div>
  )
}
