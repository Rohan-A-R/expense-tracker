import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine } from 'recharts'
import ReportTab from '../components/insights/ReportTab'
import Modal, { ConfirmModal } from '../components/ui/Modal'
import { generateReport } from '../utils/report'
import { formatCurrency, formatMonth, currentFinMonth } from '../utils/formatters'

const TABS = ['Breakdown', 'Trends', 'Monthly', 'Report']
const INK = '#1B1710'
const ACCENT = '#D9481C'
const TREND_MONTHS = 5
const ICONS = ['🍽️','🛒','🥛','🥚','🍎','🥦','🚌','⚡','🏠','🛍️','💊','📄','📦','☕','🎬','🏋️','✈️','🎓','💇','🐾','🍕','🍜','🎮','📚','🚗','🎵']
const COLS  = ['#D9481C','#C77A1B','#C9972E','#4E9E6A','#3E9E9A','#3E7CA6','#6C5FB0','#9B5FC0','#C6486B','#B84E8F','#7E8794','#A07C4E']

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

// Compact amount for tiny bar labels: 3265 -> 3.3k, 254 -> 254, 0 -> ''
function compact(v) {
  if (!v) return ''
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return String(Math.round(v))
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-paper border border-ink px-3 py-2 rounded-xl text-sm">
      {label && <p className="text-ink/50 text-[11px] mb-0.5">{label}</p>}
      <p className="font-serif-n text-lg">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

export default function Analytics() {
  const { expenses, categories, budgets, addCategory, deleteCategory, monthStartDay } = useApp()
  const [tab, setTab] = useState('Breakdown')
  const [showAdd, setShowAdd] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', color: '#D9481C' })
  const [delCat, setDelCat] = useState(null)

  async function saveCategory() {
    if (!catForm.name.trim()) return
    await addCategory({ ...catForm })
    setShowAdd(false); setCatForm({ name: '', icon: '📦', color: '#D9481C' })
  }

  const months = useMemo(() => {
    const s = new Set(expenses.map(e => e.month))
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [expenses])

  const [selMonth, setSelMonth] = useState(() => {
    const s = new Set(expenses.map(e => e.month))
    return [...s].sort((a, b) => b.localeCompare(a))[0] || ''
  })
  const effectiveMonth = months.includes(selMonth) ? selMonth : months[0] || ''

  const pieData = useMemo(() => {
    const totals = {}
    expenses.filter(e => e.month === effectiveMonth).forEach(e => { totals[e.categoryId] = (totals[e.categoryId] || 0) + Number(e.amount) })
    return Object.entries(totals)
      .map(([id, v]) => { const c = categories.find(x => x.id === Number(id)); return { name: c?.name || 'Other', value: v, color: c?.color || '#A07C4E', icon: c?.icon || '📦' } })
      .sort((a, b) => b.value - a.value)
  }, [expenses, categories, effectiveMonth])

  const barData = useMemo(() => {
    const latestMonth = months[0] || effectiveMonth
    if (!latestMonth) return []
    const [ly, lm] = latestMonth.split('-').map(Number)
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(ly, lm - 1 - (5 - i))
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const v = expenses.filter(e => e.month === m).reduce((s, e) => s + Number(e.amount), 0)
      return { name: d.toLocaleDateString('en-IN', { month: 'short' }), value: v, month: m }
    })
  }, [expenses, months, effectiveMonth])

  // Per-category spend across the last few months → trend view
  const trendMonths = useMemo(() => {
    const latestMonth = months[0] || effectiveMonth
    if (!latestMonth) return []
    const [ly, lm] = latestMonth.split('-').map(Number)
    return Array.from({ length: TREND_MONTHS }, (_, i) => {
      const d = new Date(ly, lm - 1 - (TREND_MONTHS - 1 - i))
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short' }),
      }
    })
  }, [months, effectiveMonth])

  const trendData = useMemo(() => {
    if (!trendMonths.length) return []
    return categories.map(cat => {
      const series = trendMonths.map(m =>
        expenses.filter(e => e.categoryId === cat.id && e.month === m.key)
          .reduce((s, e) => s + Number(e.amount), 0)
      )
      const total = series.reduce((s, v) => s + v, 0)
      const latest = series[series.length - 1]
      const prev = series[series.length - 2] || 0
      const change = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : (latest > 0 ? null : 0)
      const avg = total / series.length
      return { cat, series, total, latest, change, avg }
    })
    .sort((a, b) => b.total - a.total)
  }, [expenses, categories, trendMonths])

  const monthTotal = pieData.reduce((s, d) => s + d.value, 0)
  const report = useMemo(() => generateReport({
    expenses, categories, budgets,
    month: effectiveMonth,
    startDay: monthStartDay,
    isCurrent: effectiveMonth === currentFinMonth(monthStartDay),
  }), [expenses, categories, budgets, effectiveMonth, monthStartDay])
  const barTotal   = barData.reduce((s, d) => s + d.value, 0)
  const barMonthsWithData = barData.filter(d => d.value > 0).length
  // Average over months that actually have data — not diluted by empty months
  const barAvg     = barMonthsWithData ? barTotal / barMonthsWithData : 0
  const latestBar  = barData[barData.length - 1] || { value: 0, name: '' }
  const prevBar    = barData[barData.length - 2] || { value: 0, name: '' }
  const momChange  = prevBar.value > 0 ? Math.round(((latestBar.value - prevBar.value) / prevBar.value) * 100) : null
  const highestBar = barData.reduce((a, b) => b.value > a.value ? b : a, { value: 0, name: '—' })
  const vsAvg      = barAvg > 0 ? Math.round(((latestBar.value - barAvg) / barAvg) * 100) : 0

  return (
    <div className="min-h-screen px-6 pt-4">
      <div className="font-serif-i text-[34px] rule-2 pb-3 mb-1">Analysis</div>

      {/* Month select */}
      {months.length > 0 && (
        <select
          value={effectiveMonth} onChange={e => setSelMonth(e.target.value)}
          className="w-full py-3 mt-2 bg-transparent rule text-ink text-sm font-semibold focus:outline-none"
        >
          {months.map(m => (
            <option key={m} value={m}>
              {formatMonth(m)} · {formatCurrency(expenses.filter(e => e.month === m).reduce((s, e) => s + Number(e.amount), 0))}
            </option>
          ))}
        </select>
      )}

      {/* Tabs */}
      <div className="flex rule mt-4 mb-6">
        {TABS.map(t => {
          const on = tab === t
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-3 text-[12.5px] font-bold"
              style={on ? { color: INK, borderBottom: `2px solid ${ACCENT}`, marginBottom: -1 } : { color: 'rgba(27,23,16,.42)' }}>
              {t}
            </button>
          )
        })}
      </div>

      {/* BREAKDOWN */}
      {tab === 'Breakdown' && (
        pieData.length === 0 ? (
          <Empty label="No data for this month" />
        ) : (
          <>
            <div className="relative flex justify-center my-2 mb-6">
              <div className="relative" style={{ width: 210, height: 210 }}>
                <PieChart width={210} height={210}>
                  <Pie data={pieData} cx={105} cy={105} innerRadius={68} outerRadius={92} paddingAngle={2} dataKey="value" stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[10px] font-bold tracking-[1.5px] text-ink/55">TOTAL</p>
                  <p className="font-serif-n text-3xl">{formatCurrency(monthTotal)}</p>
                </div>
              </div>
            </div>
            {pieData.map((item, i) => {
              const pct = monthTotal > 0 ? Math.round((item.value / monthTotal) * 100) : 0
              return (
                <div key={i} className="flex items-center gap-3 py-3 rule-dot">
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base" style={{ background: tint(item.color, 0.18) }}>{item.icon}</div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-sm font-semibold">{item.name}</span>
                      <span className="font-serif-n text-base">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1" style={{ background: 'rgba(27,23,16,.1)' }}>
                        <div className="h-full" style={{ width: `${pct}%`, background: item.color }} />
                      </div>
                      <span className="text-[11px] font-bold text-ink/50 w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )
      )}

      {/* MONTHLY */}
      {tab === 'Monthly' && (
        <>
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-[11px] font-bold tracking-[1.5px] text-ink/55">LAST 6 MONTHS</div>
            <div className="text-[11px] font-semibold text-ink/50">avg {formatCurrency(Math.round(barAvg))}/mo</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 22, right: 4, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,23,16,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(27,23,16,.6)', fontWeight: 700 }} axisLine={{ stroke: INK }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(27,23,16,.45)' }} axisLine={false} tickLine={false} width={38} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(27,23,16,0.04)' }} />
              {barAvg > 0 && (
                <ReferenceLine y={barAvg} stroke={ACCENT} strokeDasharray="4 4" strokeOpacity={0.55} />
              )}
              <Bar dataKey="value" maxBarSize={34} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                <LabelList dataKey="value" position="top" formatter={v => v > 0 ? (v >= 1000 ? `${(v/1000).toFixed(1)}k` : v) : ''} style={{ fontSize: 10, fontWeight: 700, fill: 'rgba(27,23,16,.55)' }} />
                {barData.map((e, i) => <Cell key={i} fill={i === barData.length - 1 ? ACCENT : 'rgba(27,23,16,.82)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* This month headline */}
          <div className="mt-5 border border-ink/25 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[1.5px] text-ink/55">THIS MONTH · {latestBar.name?.toUpperCase()}</span>
              {momChange != null && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: momChange > 0 ? ACCENT : '#4E9E6A', background: momChange > 0 ? tint('#D9481C', 0.1) : tint('#4E9E6A', 0.12) }}>
                  {momChange > 0 ? '↑' : '↓'} {Math.abs(momChange)}% vs {prevBar.name}
                </span>
              )}
            </div>
            <div className="font-serif-n text-[40px] leading-tight">{formatCurrency(latestBar.value)}</div>
            {barAvg > 0 && (
              <div className="text-[12px] text-ink/55">
                {vsAvg === 0 ? 'right on your average' : `${Math.abs(vsAvg)}% ${vsAvg > 0 ? 'above' : 'below'} your ${formatCurrency(Math.round(barAvg))} average`}
              </div>
            )}
          </div>

          {/* Secondary stats */}
          <div className="flex mt-3 border border-ink/25 rounded-2xl overflow-hidden">
            <div className="flex-1 px-4 py-3.5 border-r border-ink/25">
              <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">HIGHEST</div>
              <div className="font-serif-n text-xl leading-tight">{formatCurrency(highestBar.value)}</div>
              <div className="text-[11px] text-ink/45">{highestBar.name}</div>
            </div>
            <div className="flex-1 px-4 py-3.5 border-r border-ink/25">
              <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">AVG / MONTH</div>
              <div className="font-serif-n text-xl leading-tight">{formatCurrency(Math.round(barAvg))}</div>
              <div className="text-[11px] text-ink/45">{barMonthsWithData} month{barMonthsWithData !== 1 ? 's' : ''}</div>
            </div>
            <div className="flex-1 px-4 py-3.5">
              <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">TOTAL</div>
              <div className="font-serif-n text-xl leading-tight">{formatCurrency(barTotal)}</div>
              <div className="text-[11px] text-ink/45">6 months</div>
            </div>
          </div>
        </>
      )}

      {/* TRENDS — per category, month over month */}
      {tab === 'Trends' && (
        <>
          {/* Sticky header: stays put while the category list scrolls */}
          <div className="sticky top-0 z-10 bg-paper pb-2">
            <div className="flex items-center justify-between rule-ink pb-2 mb-2">
              <span className="text-[11px] font-bold tracking-[1.5px] text-ink/55">BY CATEGORY</span>
              <button onClick={() => { setCatForm({ name: '', icon: '📦', color: '#D9481C' }); setShowAdd(true) }}
                className="text-xs font-bold text-brand">+ Add category</button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-ink/45">Spend per month · ↑↓ vs last month</p>
              <div className="flex gap-[7px] text-[10px] font-bold text-ink/40">
                {trendMonths.map(m => <span key={m.key} className="w-8 text-center">{m.label}</span>)}
              </div>
            </div>
          </div>
          {trendData.length === 0
            ? <Empty label="Add a category to start tracking" />
            : trendData.map(t => <TrendRow key={t.cat.id} t={t} onDelete={() => setDelCat(t.cat)} />)}
          <p className="text-center text-[11px] text-ink/40 pt-4">Tap 🗑 to remove · add as many as you like</p>
        </>
      )}

      {/* REPORT */}
      {tab === 'Report' && <ReportTab report={report} categories={categories} />}

      {/* Add category */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New category">
        <div className="px-6 py-4 pb-8">
          <div className="flex items-center gap-3.5 p-4 border border-ink/25 rounded-2xl mb-5">
            <div className="rounded-2xl flex items-center justify-center text-2xl" style={{ width: 52, height: 52, background: tint(catForm.color, 0.2) }}>{catForm.icon}</div>
            <div>
              <div className="text-[10px] font-bold tracking-[1.5px] text-ink/50">PREVIEW</div>
              <div className="text-[17px] font-bold">{catForm.name || 'Category name'}</div>
            </div>
          </div>
          <input type="text" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Category name"
            className="w-full py-3 mb-5 bg-transparent rule-ink text-ink placeholder-ink/40 text-[15px] focus:outline-none" />
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2.5">ICON</div>
          <div className="grid grid-cols-7 gap-2 mb-5">
            {ICONS.map(icon => {
              const on = catForm.icon === icon
              return (
                <button key={icon} type="button" onClick={() => setCatForm(f => ({ ...f, icon }))}
                  className="aspect-square flex items-center justify-center text-lg rounded-xl"
                  style={on ? { background: tint(catForm.color, 0.2), border: `1.5px solid ${catForm.color}` } : { border: '1px solid rgba(27,23,16,.14)' }}>
                  {icon}
                </button>
              )
            })}
          </div>
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-3">COLOR</div>
          <div className="grid grid-cols-7 gap-2.5 mb-6">
            {COLS.map(color => {
              const on = catForm.color === color
              return (
                <button key={color} type="button" onClick={() => setCatForm(f => ({ ...f, color }))}
                  className="aspect-square rounded-full"
                  style={{ background: color, boxShadow: on ? `0 0 0 2.5px #F5F0E4, 0 0 0 4.5px ${color}` : 'none' }} />
              )
            })}
          </div>
          <button onClick={saveCategory} className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98]">Add category</button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!delCat} onClose={() => setDelCat(null)}
        onConfirm={() => { if (delCat) deleteCategory(delCat.id); setDelCat(null) }}
        title={`Remove ${delCat?.name || ''}?`}
        message="This removes the category. Existing expenses under it stay recorded but will show as uncategorised."
        confirmLabel="Remove" danger
      />
    </div>
  )
}

function TrendRow({ t, onDelete }) {
  const { cat, series, latest, change } = t
  const max = Math.max(...series, 1)
  const up = change != null && change > 0
  const badge = change == null
    ? { txt: 'new', color: 'rgba(27,23,16,.4)' }
    : change === 0
      ? { txt: '—', color: 'rgba(27,23,16,.35)' }
      : { txt: `${up ? '↑' : '↓'} ${Math.abs(change)}%`, color: up ? ACCENT : '#4E9E6A' }

  return (
    <div className="flex items-center gap-3 py-3 rule-dot">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base shrink-0" style={{ background: tint(cat.color, 0.18) }}>{cat.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-semibold truncate">{cat.name}</span>
          <div className="flex items-center gap-2 ml-2 whitespace-nowrap">
            <span className="font-serif-n text-base">{formatCurrency(latest)}</span>
            <button onClick={onDelete} aria-label={`Remove ${cat.name}`} className="text-[13px] opacity-35 active:opacity-70 p-0.5">🗑</button>
          </div>
        </div>
        <div className="flex items-end justify-between mt-2">
          <span className="text-[10.5px] font-bold shrink-0 pb-1" style={{ color: badge.color }}>{badge.txt}</span>
          <div className="flex gap-[7px]">
            {series.map((v, i) => {
              const isLast = i === series.length - 1
              return (
                <div key={i} className="w-8 flex flex-col items-center gap-1" title={formatCurrency(v)}>
                  <div className="h-6 w-full flex items-end">
                    <div className="w-full rounded-t-[2px]"
                      style={{ height: `${Math.max((v / max) * 100, v > 0 ? 10 : 3)}%`, background: isLast ? cat.color : tint(cat.color, 0.32) }} />
                  </div>
                  <span className="text-[8.5px] font-bold leading-none" style={{ color: v > 0 ? 'rgba(27,23,16,.55)' : 'rgba(27,23,16,.2)' }}>{compact(v)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Empty({ label }) {
  return (
    <div className="py-20 text-center text-ink/40">
      <p className="font-serif-n text-2xl text-ink">Nothing here</p>
      <p className="text-sm mt-1">{label}</p>
    </div>
  )
}
