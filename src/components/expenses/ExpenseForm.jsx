import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import Modal from '../ui/Modal'
import { currentDate } from '../../utils/formatters'

const PAY = [
  { id: 'Cash', icon: '💵' },
  { id: 'UPI',  icon: '📲' },
  { id: 'Card', icon: '💳' },
]

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

const LABEL = 'text-[10px] font-bold uppercase tracking-[1.5px] text-ink/55'

export default function ExpenseForm({ isOpen, onClose, editExpense = null }) {
  const { categories, addExpense, updateExpense } = useApp()
  const [form, setForm] = useState({ amount: '', categoryId: '', description: '', date: currentDate(), paymentType: 'Cash' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (isOpen) {
      setErr('')
      setForm(editExpense
        ? { amount: String(editExpense.amount), categoryId: String(editExpense.categoryId || ''), description: editExpense.description || '', date: editExpense.date, paymentType: editExpense.paymentType || 'Cash' }
        : { amount: '', categoryId: '', description: '', date: currentDate(), paymentType: 'Cash' }
      )
    }
  }, [isOpen, editExpense])

  async function submit(e) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) return setErr('Enter a valid amount')
    if (!form.categoryId) return setErr('Select a category')
    setSaving(true)
    try {
      const d = { ...form, amount: Number(form.amount), categoryId: Number(form.categoryId) }
      editExpense ? await updateExpense({ ...editExpense, ...d }) : await addExpense(d)
      onClose()
    } catch { setErr('Failed to save. Try again.') }
    finally { setSaving(false) }
  }

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editExpense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={submit} className="px-6 py-4 pb-8">
        {/* Amount */}
        <div className="text-center mb-6">
          <p className={`${LABEL} mb-1`}>Amount</p>
          <div className="flex items-center justify-center gap-1">
            <span className="font-serif-n text-4xl text-brand">₹</span>
            <input
              type="number" inputMode="decimal"
              value={form.amount}
              onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setErr('') }}
              placeholder="0" min="0" step="any"
              className="w-44 bg-transparent text-center font-serif-n text-5xl text-ink placeholder-ink/25 focus:outline-none"
            />
          </div>
          <div className="w-52 h-px bg-ink mx-auto" />
        </div>

        {/* Category */}
        <p className={`${LABEL} mb-2.5`}>Category</p>
        <div className="grid grid-cols-4 gap-2 mb-5 max-h-52 overflow-y-auto scrollbar-hide">
          {sorted.map(cat => {
            const sel = form.categoryId === String(cat.id)
            return (
              <button
                key={cat.id} type="button"
                onClick={() => { setForm(f => ({ ...f, categoryId: String(cat.id) })); setErr('') }}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-2xl transition-all active:scale-95"
                style={sel
                  ? { background: tint(cat.color, 0.14), border: `1.5px solid ${cat.color}` }
                  : { border: '1.5px solid rgba(27,23,16,.14)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: tint(cat.color, 0.2) }}>{cat.icon}</div>
                <span className="text-[10px] font-semibold text-ink/70 text-center leading-tight px-1 truncate w-full">{cat.name}</span>
              </button>
            )
          })}
        </div>

        {/* Note */}
        <p className={`${LABEL} mb-2`}>Description</p>
        <input
          type="text" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="What was it for?"
          className="w-full py-3 mb-5 bg-transparent rule-ink text-ink placeholder-ink/40 text-[15px] focus:outline-none"
        />

        {/* Date */}
        <p className={`${LABEL} mb-2`}>Date</p>
        <input
          type="date" value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="w-full py-3 mb-5 bg-transparent rule-ink text-ink text-[15px] focus:outline-none"
        />

        {/* Payment */}
        <p className={`${LABEL} mb-2`}>Payment</p>
        <div className="flex gap-2.5 mb-6">
          {PAY.map(p => {
            const on = form.paymentType === p.id
            return (
              <button
                key={p.id} type="button"
                onClick={() => setForm(f => ({ ...f, paymentType: p.id }))}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[13.5px] font-bold transition-all active:scale-95"
                style={on ? { background: '#1B1710', color: '#F5F0E4' } : { border: '1px solid rgba(27,23,16,.25)', color: '#1B1710' }}
              >
                <span className="text-base">{p.icon}</span> {p.id}
              </button>
            )
          })}
        </div>

        {err && <p className="text-brand text-sm font-semibold mb-4 text-center">{err}</p>}

        <button
          type="submit" disabled={saving}
          className="w-full py-4 rounded-2xl font-bold text-[15px] text-paper bg-ink disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {saving ? 'Saving…' : editExpense ? 'Save changes' : 'Add expense'}
        </button>
      </form>
    </Modal>
  )
}
