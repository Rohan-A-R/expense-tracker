import { useEffect } from 'react'

export default function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(27,23,16,.5)' }} />
      <div
        className="relative w-full max-w-lg bg-paper rounded-t-[28px] border-t-2 border-ink animate-slide-up max-h-[92vh] flex flex-col text-ink"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(27,23,16,.22)' }} />
        </div>
        <div className="flex items-center justify-between px-6 pt-2 pb-3 rule-ink mx-6">
          <h2 className="font-serif-i text-2xl">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl border border-ink/25 text-ink/60 text-sm flex items-center justify-center active:scale-90">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 scrollbar-hide">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(27,23,16,.5)' }} />
      <div
        className="relative w-full max-w-lg bg-paper rounded-t-[28px] border-t-2 border-ink animate-slide-up px-6 py-7 text-center text-ink"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-serif-i text-2xl mb-2">{title}</h3>
        <p className="text-ink/60 text-sm leading-relaxed mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 rounded-2xl border-[1.5px] border-ink/30 font-bold text-sm active:scale-95">
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className="flex-1 py-4 rounded-2xl font-bold text-sm text-paper active:scale-95"
            style={{ background: danger ? '#D9481C' : '#1B1710' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
