export default function Card({ children, className = '', onClick, padding = 'p-4' }) {
  const interactive = onClick
    ? 'cursor-pointer active:scale-[0.98] transition-all duration-150 hover:shadow-md'
    : ''
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[#1c1c2e] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm ${interactive} ${padding} ${className}`}
    >
      {children}
    </div>
  )
}

export function GradientCard({ children, className = '', gradient }) {
  return (
    <div className={`rounded-2xl p-5 text-white shadow-xl ${gradient} ${className}`}>
      {children}
    </div>
  )
}
