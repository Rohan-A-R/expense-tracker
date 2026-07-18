import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '../../utils/formatters'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0].payload
  const fill = payload[0].payload.color
  return (
    <div className="bg-gray-900 text-white px-3 py-2.5 rounded-2xl shadow-2xl text-sm border border-white/10">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: fill }} />
        <span className="font-semibold">{name}</span>
      </div>
      <p className="font-black text-lg">{formatCurrency(value)}</p>
    </div>
  )
}

const RADIAN = Math.PI / 180
function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.06) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="800">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export default function CategoryPieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (!data.length) {
    return (
      <div className="h-52 flex flex-col items-center justify-center text-gray-300 dark:text-gray-700 gap-2">
        <span className="text-4xl">🥧</span>
        <p className="text-sm font-semibold">No data for this month</p>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              labelLine={false}
              label={CustomLabel}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[11px] text-gray-400 font-semibold">Total</p>
          <p className="text-lg font-black text-gray-900 dark:text-white">{formatCurrency(total)}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2.5 mt-2">
        {data.slice(0, 7).map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{item.icon} {item.name}</span>
            <span className="text-xs text-gray-400 font-medium">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
            <span className="text-sm font-black text-gray-900 dark:text-white w-20 text-right">{formatCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
