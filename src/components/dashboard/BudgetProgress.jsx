import { useApp } from '../../context/AppContext'
import Card from '../ui/Card'
import { formatCurrency, getPercentage, currentMonth } from '../../utils/formatters'

export default function BudgetProgress() {
  const { expenses, budgets } = useApp()
  const monthBudget = budgets['monthly']
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const monthTotal = expenses
    .filter(e => e.month === month)
    .reduce((s, e) => s + Number(e.amount), 0)

  if (!monthBudget) return null

  const pct = Math.min(getPercentage(monthTotal, monthBudget.amount), 100)
  const remaining = Math.max(monthBudget.amount - monthTotal, 0)
  const isWarning = pct >= 75
  const isDanger = pct >= 90

  const barColor = isDanger ? '#ef4444' : isWarning ? '#f97316' : '#3b82f6'

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Monthly Budget</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatCurrency(monthTotal)} of {formatCurrency(monthBudget.amount)}
          </p>
        </div>
        <div className="text-right">
          <span
            className="text-sm font-bold"
            style={{ color: barColor }}
          >
            {pct}%
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(remaining)} left</p>
        </div>
      </div>
      <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      {isDanger && (
        <p className="text-xs text-red-500 mt-2 font-medium">⚠️ Budget almost exhausted!</p>
      )}
    </Card>
  )
}
