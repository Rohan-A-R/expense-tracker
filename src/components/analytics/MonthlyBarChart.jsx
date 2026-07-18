import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCurrency } from '../../utils/formatters'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-white/10 text-white px-3 py-2.5 rounded-2xl shadow-2xl text-sm">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="font-black text-lg mt-0.5">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export default function MonthlyBarChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139,92,246,0.06)', radius: 8 }} />
        <Bar dataKey="value" radius={[8, 8, 4, 4]} maxBarSize={44}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.value === max && entry.value > 0 ? '#8b5cf6' : '#e5e7eb'}
              fillOpacity={entry.value === max && entry.value > 0 ? 1 : 0.6}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
