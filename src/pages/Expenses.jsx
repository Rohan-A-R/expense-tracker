import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import ExpenseCard from '../components/expenses/ExpenseCard'
import ExpenseForm from '../components/expenses/ExpenseForm'
import { formatCurrency, formatDate, formatMonth } from '../utils/formatters'

export default function Expenses({ onBack }) {
  const { expenses, categories } = useApp()
  const [search, setSearch]           = useState('')
  const [filterCat, setFilterCat]     = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [sortBy, setSortBy]           = useState('date')
  const [editExpense, setEditExpense] = useState(null)

  const months = useMemo(() => {
    const s = new Set(expenses.map(e => e.month))
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [expenses])

  const filtered = useMemo(() => {
    let list = [...expenses]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (categories.find(c => c.id === e.categoryId)?.name || '').toLowerCase().includes(q)
      )
    }
    if (filterCat)   list = list.filter(e => String(e.categoryId) === filterCat)
    if (filterMonth) list = list.filter(e => e.month === filterMonth)
    if (sortBy === 'date') list.sort((a, b) => new Date(b.date) - new Date(a.date))
    else                   list.sort((a, b) => b.amount - a.amount)
    return list
  }, [expenses, search, filterCat, filterMonth, sortBy, categories])

  const grouped = useMemo(() => {
    if (sortBy === 'amount') return null
    const map = {}
    filtered.forEach(e => { if (!map[e.date]) map[e.date] = []; map[e.date].push(e) })
    return Object.entries(map).sort((a, b) => new Date(b[0]) - new Date(a[0]))
  }, [filtered, sortBy])

  const chips = [{ id: '', name: 'All' }, ...categories.filter(c => expenses.some(e => e.categoryId === c.id))]

  return (
    <div className="min-h-screen px-6 pt-4">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-bold text-ink/55 mb-2 -ml-1 active:opacity-60">
          <span className="text-lg leading-none">‹</span> Home
        </button>
      )}
      <div className="font-serif-i text-[34px] rule-2 pb-3 mb-2">Spends</div>

      {/* Search */}
      <div className="flex items-center gap-2.5 py-3 rule mb-3.5">
        <span className="text-[15px] opacity-50">🔍</span>
        <input
          data-testid="expense-search"
          type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search descriptions"
          className="flex-1 bg-transparent text-ink placeholder-ink/40 text-sm focus:outline-none"
        />
      </div>

      {/* Month + category chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-1">
        {months.length > 0 && (
          <select
            value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="flex-shrink-0 px-3 py-1.5 rounded-[20px] text-[12.5px] font-bold border border-ink/30 bg-transparent text-ink focus:outline-none"
          >
            <option value="">All months</option>
            {months.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        )}
        {chips.map(c => {
          const on = filterCat === String(c.id)
          return (
            <button key={c.id || 'all'} onClick={() => setFilterCat(String(c.id))}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-[20px] text-[12.5px] font-bold whitespace-nowrap active:scale-95"
              style={on ? { background: '#1B1710', color: '#F5F0E4' } : { border: '1px solid rgba(27,23,16,.3)' }}>
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Count + sort */}
      <div className="flex items-center justify-between mt-3 mb-1">
        <span className="text-[11px] font-bold tracking-[1.5px] text-ink/55">{filtered.length} EXPENSES</span>
        <button onClick={() => setSortBy(s => s === 'date' ? 'amount' : 'date')} className="text-xs font-bold text-brand">
          ⇅ {sortBy === 'date' ? 'By date' : 'By amount'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-ink/40">
          <p className="font-serif-n text-2xl text-ink">No results</p>
          <p className="text-sm mt-1">Try a different search or filter</p>
        </div>
      ) : grouped ? (
        grouped.map(([date, dayExp]) => {
          const dayTotal = dayExp.reduce((s, e) => s + Number(e.amount), 0)
          return (
            <div key={date} className="mt-5">
              <div className="flex items-center justify-between rule-ink pb-1.5">
                <span className="text-[11px] font-bold tracking-[1.5px] uppercase">{formatDate(date)}</span>
                <span className="font-serif-n text-[17px]">{formatCurrency(dayTotal)}</span>
              </div>
              {dayExp.map(exp => <ExpenseCard key={exp.id} expense={exp} onEdit={setEditExpense} />)}
            </div>
          )
        })
      ) : (
        <div className="mt-4">{filtered.map(exp => <ExpenseCard key={exp.id} expense={exp} onEdit={setEditExpense} />)}</div>
      )}

      <ExpenseForm isOpen={!!editExpense} onClose={() => setEditExpense(null)} editExpense={editExpense} />
    </div>
  )
}
