import { useApp } from '../../context/AppContext'
import ExpenseCard from '../expenses/ExpenseCard'
import { useState } from 'react'
import ExpenseForm from '../expenses/ExpenseForm'

export default function RecentTransactions({ limit = 5 }) {
  const { expenses } = useApp()
  const [editExpense, setEditExpense] = useState(null)

  const recent = [...expenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit)

  if (recent.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-600">
        <span className="text-4xl">📭</span>
        <p className="text-sm">No transactions yet</p>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {recent.map(expense => (
          <ExpenseCard key={expense.id} expense={expense} onEdit={setEditExpense} />
        ))}
      </div>
      <ExpenseForm
        isOpen={!!editExpense}
        onClose={() => setEditExpense(null)}
        editExpense={editExpense}
      />
    </>
  )
}
