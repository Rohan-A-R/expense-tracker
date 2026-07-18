import Card, { GradientCard } from '../ui/Card'
import { formatCurrency } from '../../utils/formatters'

export default function StatCard({ title, value, subtitle, icon, gradient, trend }) {
  if (gradient) {
    return (
      <GradientCard gradient={gradient} className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-xs font-medium">{title}</p>
            <p className="text-2xl font-bold mt-1">{typeof value === 'number' ? formatCurrency(value) : value}</p>
            {subtitle && <p className="text-white/60 text-xs mt-1">{subtitle}</p>}
          </div>
          <span className="text-2xl">{icon}</span>
        </div>
        {trend !== undefined && (
          <div className={`mt-2 text-xs font-medium ${trend >= 0 ? 'text-red-300' : 'text-green-300'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last month
          </div>
        )}
      </GradientCard>
    )
  }

  return (
    <Card className="flex-1 min-w-0">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
            {typeof value === 'number' ? formatCurrency(value) : value}
          </p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xl">{icon}</span>
      </div>
    </Card>
  )
}
