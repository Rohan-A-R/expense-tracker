import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { formatCurrency, getPercentage, currentMonth, formatMonth } from '../utils/formatters'

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

export default function Budget() {
  const { expenses, categories, budgets, setBudget } = useApp()
  const [editMonthly, setEditMonthly] = useState(false)
  const [monthlyVal, setMonthlyVal]   = useState('')
  const [editCat, setEditCat]         = useState(null)
  const [catVal, setCatVal]           = useState('')

  const activeMonth = useMemo(() => {
    const ms = [...new Set(expenses.map(e => e.month))].sort((a, b) => b.localeCompare(a))
    return ms[0] || currentMonth()
  }, [expenses])

  const monthTotal = useMemo(() =>
    expenses.filter(e => e.month === activeMonth).reduce((s, e) => s + Number(e.amount), 0), [expenses, activeMonth])

  const catTotals = useMemo(() => {
    const map = {}
    expenses.filter(e => e.month === activeMonth).forEach(e => { map[e.categoryId] = (map[e.categoryId] || 0) + Number(e.amount) })
    return map
  }, [expenses, activeMonth])

  const mb  = budgets['monthly']
  const pct = mb ? Math.min(getPercentage(monthTotal, mb.amount), 100) : 0
  const rem = mb ? Math.max(mb.amount - monthTotal, 0) : 0
  const barColor = pct >= 90 ? '#D9481C' : pct >= 70 ? '#C77A1B' : '#1B1710'

  const catsWithData = useMemo(() =>
    categories.filter(c => catTotals[c.id] || budgets[`cat-${c.id}`])
      .sort((a, b) => (catTotals[b.id] || 0) - (catTotals[a.id] || 0)), [categories, catTotals, budgets])

  return (
    <div className="min-h-screen px-6 pt-4">
      <div className="flex items-baseline justify-between rule-2 pb-3">
        <span className="font-serif-i text-[34px]">Budget</span>
        <span className="text-[11px] font-bold tracking-[2px] text-ink/60">{formatMonth(activeMonth).toUpperCase()}</span>
      </div>

      {/* Monthly budget */}
      {editMonthly ? (
        <div className="pt-6">
          <div className="text-[11px] font-bold tracking-[2px] text-ink/55 mb-3">SET MONTHLY BUDGET</div>
          <div className="flex items-center justify-center gap-1 mb-2">
            <span className="font-serif-n text-3xl text-brand">₹</span>
            <input
              type="number" inputMode="decimal" autoFocus
              value={monthlyVal} onChange={e => setMonthlyVal(e.target.value)}
              placeholder="15000"
              className="w-52 bg-transparent text-center font-serif-n text-5xl text-ink placeholder-ink/25 focus:outline-none"
            />
          </div>
          <div className="w-56 h-px bg-ink mx-auto mb-6" />
          <div className="flex gap-3">
            <button onClick={() => setEditMonthly(false)} className="flex-1 py-4 rounded-2xl border-[1.5px] border-ink/30 font-bold text-sm active:scale-95">Cancel</button>
            <button
              onClick={async () => {
                if (monthlyVal && Number(monthlyVal) > 0) {
                  await setBudget({ id: 'monthly', amount: Number(monthlyVal), month: activeMonth })
                  setEditMonthly(false); setMonthlyVal('')
                }
              }}
              className="flex-1 py-4 rounded-2xl bg-ink text-paper font-bold text-sm active:scale-95"
            >Save budget</button>
          </div>
        </div>
      ) : mb ? (
        <div className="pt-6">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] font-bold tracking-[2px] text-ink/55">REMAINING</span>
            <button onClick={() => { setMonthlyVal(String(mb.amount)); setEditMonthly(true) }} className="text-xs font-bold text-brand">Edit</button>
          </div>
          <div className="font-serif-n text-[60px] leading-[1.05] tracking-[-1px]">{formatCurrency(rem)}</div>
          <div className="text-[12.5px] text-ink/55 mb-3.5">of {formatCurrency(mb.amount)} monthly budget</div>
          <div className="h-2" style={{ background: 'rgba(27,23,16,.14)' }}>
            <div className="h-full" style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <div className="flex justify-between mt-2.5 text-xs font-semibold">
            <span className="text-ink/60">{formatCurrency(monthTotal)} spent</span>
            <span style={{ color: barColor }}>{pct}% used</span>
          </div>
        </div>
      ) : (
        <div className="pt-16 text-center">
          <p className="font-serif-n text-2xl">Set a monthly budget</p>
          <p className="text-ink/55 text-sm mt-1 mb-6">Stay in control of your spending</p>
          <button onClick={() => setEditMonthly(true)} className="px-6 py-3.5 rounded-2xl bg-ink text-paper font-bold text-sm active:scale-95">+ Set budget</button>
        </div>
      )}

      {/* Category budgets */}
      {catsWithData.length > 0 && (
        <>
          <div className="text-[11px] font-bold tracking-[2px] text-ink/55 mt-6 mb-1 border-t border-ink pt-4">BY CATEGORY</div>
          {catsWithData.map(cat => {
            const cb    = budgets[`cat-${cat.id}`]
            const spent = catTotals[cat.id] || 0
            const p     = cb ? Math.min(getPercentage(spent, cb.amount), 100) : 0
            const bc    = p >= 90 ? '#D9481C' : p >= 70 ? '#C77A1B' : '#1B1710'

            if (editCat === cat.id) {
              return (
                <div key={cat.id} className="py-4 rule-dot">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-bold">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-3">
                    <span className="font-serif-n text-2xl text-brand">₹</span>
                    <input
                      type="number" inputMode="decimal" autoFocus
                      value={catVal} onChange={e => setCatVal(e.target.value)}
                      placeholder="Budget limit"
                      className="flex-1 py-2 bg-transparent rule-ink font-serif-n text-2xl text-ink placeholder-ink/30 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditCat(null)} className="flex-1 py-2.5 rounded-xl border-[1.5px] border-ink/30 font-bold text-sm active:scale-95">Cancel</button>
                    <button
                      onClick={async () => {
                        if (catVal && Number(catVal) > 0) {
                          await setBudget({ id: `cat-${cat.id}`, categoryId: cat.id, amount: Number(catVal), month: activeMonth })
                          setEditCat(null); setCatVal('')
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-ink text-paper font-bold text-sm active:scale-95"
                    >Save</button>
                  </div>
                </div>
              )
            }

            return (
              <div key={cat.id} className="py-3.5 rule-dot" onClick={() => { setEditCat(cat.id); setCatVal(cb ? String(cb.amount) : '') }}>
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: tint(cat.color, 0.18) }}>{cat.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">{cat.name}</div>
                    <div className="text-[11.5px] text-ink/50">{formatCurrency(spent)}{cb ? ` of ${formatCurrency(cb.amount)}` : ' spent'}</div>
                  </div>
                  {cb
                    ? <span className="font-serif-n text-lg" style={{ color: bc }}>{p}%</span>
                    : <span className="text-xs font-bold text-brand">Set</span>}
                </div>
                {cb && (
                  <div className="h-[5px]" style={{ background: 'rgba(27,23,16,.1)' }}>
                    <div className="h-full" style={{ width: `${p}%`, background: bc }} />
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
