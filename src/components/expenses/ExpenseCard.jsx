import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { formatCurrency, formatDateShort } from '../../utils/formatters'
import { ConfirmModal } from '../ui/Modal'

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

export default function ExpenseCard({ expense, onEdit }) {
  const { categories, deleteExpense } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const cat = categories.find(c => c.id === expense.categoryId)

  return (
    <>
      <div className="rule-dot">
        <div
          className="flex items-center gap-3 py-3 cursor-pointer"
          onClick={() => setExpanded(s => !s)}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: tint(cat?.color, 0.18) }}
          >
            {cat?.icon || '📦'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug truncate">
              {expense.description || cat?.name || 'Expense'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {cat && <span className="text-[11.5px] text-ink/50">{cat.name}</span>}
              {expense.paymentType && (
                <span className="text-[9.5px] font-extrabold tracking-[0.8px] uppercase" style={{ color: cat?.color || '#A07C4E' }}>
                  {expense.paymentType}
                </span>
              )}
              <span className="text-[11.5px] text-ink/40">{formatDateShort(expense.date)}</span>
            </div>
          </div>

          <p className="font-serif-n text-lg flex-shrink-0">−{formatCurrency(expense.amount)}</p>
        </div>

        {expanded && (
          <div className="flex gap-2 pb-3 animate-fade-in">
            <button
              onClick={() => { onEdit(expense); setExpanded(false) }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-ink text-paper active:scale-95 transition-transform"
            >
              Edit
            </button>
            <button
              onClick={() => { setShowConfirm(true); setExpanded(false) }}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold border-[1.5px] border-brand text-brand active:scale-95 transition-transform"
            >
              Delete
            </button>
            <button onClick={() => setExpanded(false)} className="w-10 py-2.5 rounded-xl text-xs border border-ink/25 text-ink/50 active:scale-95">✕</button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => deleteExpense(expense.id)}
        title="Delete this expense?"
        message={`"${expense.description || cat?.name}" (${formatCurrency(expense.amount)}) will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </>
  )
}
