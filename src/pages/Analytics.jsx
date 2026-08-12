import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine } from 'recharts'
import ReportTab from '../components/insights/ReportTab'
import Modal from '../components/ui/Modal'
import { generateReport } from '../utils/report'
import { formatCurrency, formatMonth, currentFinMonth } from '../utils/formatters'

const TABS = ['Breakdown', 'Trends', 'Monthly', 'Report']
const INK = '#1B1710'
const ACCENT = '#D9481C'
const GREEN = '#4E9E6A'
const TREND_MONTHS = 5
const ICONS = ['🍽️','🛒','🥛','🥚','🍎','🥦','🚌','⚡','🏠','🛍️','💊','📄','📦','☕','🎬','🏋️','✈️','🎓','💇','🐾','🍕','🍜','🎮','📚','🚗','🎵']
const COLS  = ['#D9481C','#C77A1B','#C9972E','#4E9E6A','#3E9E9A','#3E7CA6','#6C5FB0','#9B5FC0','#C6486B','#B84E8F','#7E8794','#A07C4E']

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

// Compact amount for tiny bar labels: 3265 → 3.3k, 254 → 254, 0 → ''
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
  const { expenses, categories, budgets, monthStartDay, addCategory } = useApp()
  const [tab, setTab] = useState('Breakdown')
  const [showAdd, setShowAdd] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', color: '#D9481C' })

  async function saveCategory() {
    if (!catForm.name.trim()) return
    const saved = await addCategory({ ...catForm })
    if (saved?.id != null) setAdded(a => new Set(a).add(saved.id))  // track the new one immediately
    setShowAdd(false); setCatForm({ name: '', icon: '📦', color: '#D9481C' })
  }
  // Which categories the Trends tab tracks. Non-destructive: hiding a category here
  // only removes it from this view (it is NOT deleted). Defaults to every category
  // with spend in the window; `added` lets you also track zero-spend ones.
  const [hidden, setHidden] = useState(() => new Set())
  const [added, setAdded] = useState(() => new Set())

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
      return { cat, series, total, latest, change }
    })
    .sort((a, b) => b.total - a.total)
  }, [expenses, categories, trendMonths])

  // Shown = has spend (and not hidden) OR explicitly added. Pills offer the rest.
  const shownTrends = trendData.filter(t => !hidden.has(t.cat.id) && (t.total > 0 || added.has(t.cat.id)))
  const shownIds = new Set(shownTrends.map(t => t.cat.id))
  const addable = categories.filter(c => !shownIds.has(c.id))

  const trackCat = (id) => { setAdded(a => new Set(a).add(id)); setHidden(h => { const n = new Set(h); n.delete(id); return n }) }
  const untrackCat = (id) => { setHidden(h => new Set(h).add(id)); setAdded(a => { const n = new Set(a); n.delete(id); return n }) }

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
      {/* Header — title + month (doubles as the month switcher) */}
      <div className="flex items-baseline justify-between rule-2 pb-3">
        <span className="font-serif-i text-[34px] leading-none">Analysis</span>
        {months.length > 0 && (
          <select value={effectiveMonth} onChange={e => setSelMonth(e.target.value)}
            className="appearance-none bg-transparent text-[11px] font-bold tracking-[2px] text-ink/60 text-right focus:outline-none active:opacity-60">
            {months.map(m => <option key={m} value={m}>{formatMonth(m).toUpperCase()}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rule mt-4 mb-6">
        {TABS.map(t => {
          const on = tab === t
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-3 text-[12.5px] font-bold transition-colors"
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
                  style={{ color: momChange > 0 ? ACCENT : GREEN, background: momChange > 0 ? tint('#D9481C', 0.1) : tint('#4E9E6A', 0.12) }}>
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
        trendMonths.length === 0 ? (
          <Empty label="Add expenses to see trends" />
        ) : (
          <>
            <p className="text-[13px] text-ink/50 -mt-2 mb-4">Category spend across the last {TREND_MONTHS} months.</p>
            {shownTrends.length === 0
              ? <p className="text-[13px] text-ink/45 py-6 text-center">No categories tracked — add one below.</p>
              : shownTrends.map(t => <TrendRow key={t.cat.id} t={t} months={trendMonths} onRemove={() => untrackCat(t.cat.id)} />)}

            <div className="text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2 mt-6 mb-3">ADD A CATEGORY</div>
            <div className="flex flex-wrap gap-2 pb-2">
              {addable.map(c => (
                <button key={c.id} onClick={() => trackCat(c.id)}
                  className="flex items-center gap-1.5 pl-2 pr-3 py-2 rounded-full border border-ink/25 text-[12.5px] font-semibold active:scale-95 transition-transform">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px]" style={{ background: tint(c.color, 0.18) }}>{c.icon}</span>
                  {c.name}
                </button>
              ))}
              {/* Create a brand-new category right here */}
              <button onClick={() => { setCatForm({ name: '', icon: '📦', color: '#D9481C' }); setShowAdd(true) }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] font-bold text-paper bg-ink active:scale-95 transition-transform">
                ＋ New category
              </button>
            </div>
          </>
        )
      )}

      {/* REPORT */}
      {tab === 'Report' && <ReportTab report={report} categories={categories} />}

      {/* Create category */}
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
          <button onClick={saveCategory} disabled={!catForm.name.trim()}
            className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40">Add category</button>
        </div>
      </Modal>
    </div>
  )
}

// One category's trend: name + up/down delta + full-width monthly spark bars with month initials.
function TrendRow({ t, months, onRemove }) {
  const { cat, series, change } = t
  const max = Math.max(...series, 1)
  const up = change != null && change > 0
  const delta = change == null
    ? { txt: 'new', color: 'rgba(27,23,16,.4)' }
    : change === 0
      ? { txt: '—', color: 'rgba(27,23,16,.35)' }
      : { txt: `${up ? '↑' : '↓'} ${Math.abs(change)}%`, color: up ? ACCENT : GREEN }

  return (
    <div className="py-4 rule-dot">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[15px] shrink-0" style={{ background: tint(cat.color, 0.18) }}>{cat.icon}</div>
        <span className="flex-1 text-[15px] font-bold truncate">{cat.name}</span>
        <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: delta.color }}>{delta.txt}</span>
        <button onClick={onRemove} aria-label={`Stop tracking ${cat.name}`}
          className="text-ink/35 text-xl leading-none px-1 -mr-1 active:opacity-60">×</button>
      </div>
      <div className="flex gap-1.5 mt-3">
        {series.map((v, i) => {
          const isLast = i === series.length - 1
          return (
            <div key={i} className="flex-1 flex flex-col items-center" title={formatCurrency(v)}>
              <span className="text-[9.5px] font-bold leading-none mb-1 h-[10px]" style={{ color: v > 0 ? 'rgba(27,23,16,.55)' : 'transparent' }}>{compact(v)}</span>
              <div className="w-full flex items-end" style={{ height: 46 }}>
                <div className="w-full" style={{ height: `${Math.max((v / max) * 100, v > 0 ? 8 : 2)}%`, background: isLast ? cat.color : tint(cat.color, 0.3), borderRadius: '4px 4px 0 0' }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {months.map((m, i) => (
          <span key={m.key} className="flex-1 text-center text-[10px] font-bold"
            style={{ color: i === months.length - 1 ? 'rgba(27,23,16,.6)' : 'rgba(27,23,16,.35)' }}>
            {m.label[0].toUpperCase()}
          </span>
        ))}
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
