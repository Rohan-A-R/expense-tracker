export default function Badge({ children, color = '#3b82f6', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      {children}
    </span>
  )
}

export function PaymentBadge({ type }) {
  const config = {
    Cash: { icon: '💵', color: '#22c55e' },
    UPI: { icon: '📱', color: '#8b5cf6' },
    Card: { icon: '💳', color: '#f97316' },
  }
  const { icon, color } = config[type] || config.Cash
  return (
    <Badge color={color}>
      {icon} {type}
    </Badge>
  )
}
