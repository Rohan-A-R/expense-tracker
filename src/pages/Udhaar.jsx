import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import Modal, { ConfirmModal } from '../components/ui/Modal'
import { formatCurrency, formatDateShort, currentDate } from '../utils/formatters'

const GREEN = '#4E9E6A'
const RUST = '#D9481C'

export default function Udhaar({ onBack }) {
  const { udhaar, addUdhaar, settleUdhaarPerson, deleteUdhaar } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ person: '', direction: 'lent', amount: '', note: '', date: currentDate() })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [settling, setSettling] = useState(null) // person name
  const [del, setDel] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const open = udhaar.filter(u => u.status === 'open')
  const settled = udhaar.filter(u => u.status === 'settled')

  // Per-person: net > 0 → they owe you, net < 0 → you owe them
  const people = useMemo(() => {
    const map = {}
    open.forEach(u => {
      map[u.person] = map[u.person] || { person: u.person, net: 0, entries: [] }
      map[u.person].net += u.direction === 'lent' ? Number(u.amount) : -Number(u.amount)
      map[u.person].entries.push(u)
    })
    return Object.values(map).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  }, [udhaar])

  const toCollect = people.reduce((s, p) => s + Math.max(p.net, 0), 0)
  const toPay = people.reduce((s, p) => s + Math.max(-p.net, 0), 0)
  const knownNames = useMemo(() => [...new Set(udhaar.map(u => u.person))], [udhaar])

  function openAdd(person = '') {
    setForm({ person, direction: 'lent', amount: '', note: '', date: currentDate() })
    setShowAdd(true)
  }

  async function save() {
    let person = form.person.trim()
    if (!person || !form.amount || Number(form.amount) <= 0) return
    // "rahul" and "Rahul" are the same person — reuse the existing casing
    const existing = knownNames.find(n => n.toLowerCase() === person.toLowerCase())
    if (existing) person = existing
    setSaving(true)
    try {
      await addUdhaar({ person, direction: form.direction, amount: Number(form.amount), note: form.note.trim(), date: form.date })
      setShowAdd(false)
    } finally { setSaving(false) }
  }

  const settleTarget = people.find(p => p.person === settling)

  return (
    <div className="min-h-screen bg-paper px-6 pt-14 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 rule-2 pb-3">
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-xl border-[1.5px] border-ink flex items-center justify-center text-lg active:scale-90">←</button>
        <span className="font-serif-i text-[28px] leading-none flex-1">Udhaar</span>
        <button onClick={() => openAdd()} className="px-3.5 py-2.5 rounded-xl bg-ink text-paper text-xs font-bold active:scale-95">+ Add</button>
      </div>

      {/* Summary */}
      <div className="flex border-b border-ink mt-2 mb-6">
        <div className="flex-1 py-4 min-w-0" style={{ borderRight: '1px solid rgba(27,23,16,.25)', paddingRight: 14 }}>
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">TO COLLECT</div>
          <div className="font-serif-n text-[30px] leading-tight" style={{ color: GREEN }}>{formatCurrency(toCollect)}</div>
        </div>
        <div className="flex-1 py-4 min-w-0" style={{ paddingLeft: 14 }}>
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">TO PAY</div>
          <div className="font-serif-n text-[30px] leading-tight" style={{ color: RUST }}>{formatCurrency(toPay)}</div>
        </div>
      </div>

      {/* People */}
      {people.length === 0 ? (
        <div className="py-16 text-center text-ink/40">
          <p className="font-serif-n text-2xl text-ink">All settled</p>
          <p className="text-sm mt-1">Tap "+ Add" when you lend or borrow money</p>
        </div>
      ) : people.map(p => {
        const owesYou = p.net > 0
        const isOpen = expanded === p.person
        return (
          <div key={p.person} className="border border-ink/25 rounded-[18px] mb-3.5 overflow-hidden">
            <button onClick={() => setExpanded(isOpen ? null : p.person)} className="flex items-center gap-3 p-4 w-full text-left">
              <div className="w-10 h-10 rounded-xl bg-ink text-paper flex items-center justify-center font-serif-n text-lg">
                {p.person[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold truncate">{p.person}</div>
                <div className="text-[11px] font-bold tracking-[0.8px] uppercase" style={{ color: owesYou ? GREEN : RUST }}>
                  {owesYou ? 'Owes you' : 'You owe'} · {p.entries.length} entr{p.entries.length > 1 ? 'ies' : 'y'}
                </div>
              </div>
              <div className="font-serif-n text-2xl whitespace-nowrap" style={{ color: owesYou ? GREEN : RUST }}>
                {formatCurrency(Math.abs(p.net))}
              </div>
              <span className="text-ink/40 text-sm">{isOpen ? '▴' : '▾'}</span>
            </button>

            {isOpen && (
              <div className="px-4 pb-4">
                {p.entries.map(u => (
                  <div key={u.id} className="flex items-center gap-2.5 py-2.5 rule-dot">
                    <span className="text-[13px] font-bold w-14" style={{ color: u.direction === 'lent' ? GREEN : RUST }}>
                      {u.direction === 'lent' ? 'GAVE' : 'TOOK'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] text-ink/60">{formatDateShort(u.date)}{u.note ? ` · ${u.note}` : ''}</span>
                    </div>
                    <span className="font-serif-n text-base">{formatCurrency(u.amount)}</span>
                    <button onClick={() => setDel(u)} className="text-[12px] opacity-35 active:opacity-70 p-1">🗑</button>
                  </div>
                ))}
                <div className="flex gap-2.5 pt-3.5">
                  <button onClick={() => setSettling(p.person)}
                    className="flex-1 py-3 rounded-xl bg-ink text-paper text-[13.5px] font-bold active:scale-[0.98]">
                    Settle up
                  </button>
                  <button onClick={() => openAdd(p.person)}
                    className="px-5 py-3 rounded-xl border-[1.5px] border-ink/30 text-[13.5px] font-bold text-ink/70 active:scale-[0.98]">
                    + Entry
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* History */}
      {settled.length > 0 && (
        <>
          <button onClick={() => setShowHistory(h => !h)} className="flex items-center justify-between w-full rule-ink pb-2 mt-6">
            <span className="text-[11px] font-bold tracking-[2px] text-ink/55">SETTLED HISTORY ({settled.length})</span>
            <span className="text-ink/40 text-sm">{showHistory ? '▴' : '▾'}</span>
          </button>
          {showHistory && settled.map(u => (
            <div key={u.id} className="flex items-center gap-2.5 py-2.5 rule-dot opacity-60">
              <span className="text-[12px] font-bold w-12">{u.direction === 'lent' ? 'GAVE' : 'TOOK'}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{u.person}</span>
                <span className="text-[12px] text-ink/50"> · {formatDateShort(u.date)}{u.note ? ` · ${u.note}` : ''}</span>
              </div>
              <span className="font-serif-n text-base line-through">{formatCurrency(u.amount)}</span>
              <button onClick={() => setDel(u)} className="text-[12px] opacity-35 active:opacity-70 p-1">🗑</button>
            </div>
          ))}
        </>
      )}

      {/* Add modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add udhaar entry">
        <div className="px-6 py-4 pb-8">
          {/* direction */}
          <div className="flex gap-2 mb-5">
            {[
              { id: 'lent', label: 'I gave money', hint: 'they owe you' },
              { id: 'borrowed', label: 'I took money', hint: 'you owe them' },
            ].map(d => {
              const on = form.direction === d.id
              return (
                <button key={d.id} type="button" onClick={() => setForm(f => ({ ...f, direction: d.id }))}
                  className="flex-1 py-3 rounded-2xl text-center active:scale-[0.98]"
                  style={on ? { background: '#1B1710', color: '#F5F0E4' } : { border: '1.5px solid rgba(27,23,16,.2)' }}>
                  <div className="text-[13.5px] font-bold">{d.label}</div>
                  <div className="text-[10.5px] opacity-60">{d.hint}</div>
                </button>
              )
            })}
          </div>

          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">PERSON</div>
          <input value={form.person} list="udhaar-names"
            onChange={e => setForm(f => ({ ...f, person: e.target.value }))} placeholder="Rahul"
            className="w-full py-3 mb-5 bg-transparent rule-ink text-ink placeholder-ink/40 text-[15px] focus:outline-none" />
          <datalist id="udhaar-names">
            {knownNames.map(n => <option key={n} value={n} />)}
          </datalist>

          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="font-serif-n text-3xl text-brand">₹</span>
            <input type="number" inputMode="decimal" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0"
              className="w-44 bg-transparent text-center font-serif-n text-5xl text-ink placeholder-ink/25 focus:outline-none" />
          </div>
          <div className="w-48 h-px bg-ink mx-auto mb-6" />

          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">DATE</div>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="w-full py-3 mb-5 bg-transparent rule-ink text-ink text-[15px] focus:outline-none" />

          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">NOTE (OPTIONAL)</div>
          <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Movie tickets"
            className="w-full py-3 mb-6 bg-transparent rule-ink text-ink placeholder-ink/40 text-[15px] focus:outline-none" />

          <button onClick={save} disabled={!form.person.trim() || !form.amount || Number(form.amount) <= 0 || saving}
            className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40">
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!settling} onClose={() => setSettling(null)}
        onConfirm={() => { if (settleTarget) settleUdhaarPerson(settleTarget.person, settleTarget.entries); setSettling(null); setExpanded(null) }}
        title={`Settle up with ${settling || ''}?`}
        message={settleTarget ? `${Math.abs(settleTarget.net) > 0 ? formatCurrency(Math.abs(settleTarget.net)) + (settleTarget.net > 0 ? ' collected from ' : ' paid back to ') + settleTarget.person + '. ' : ''}All open entries move to history.` : ''}
        confirmLabel="Settle"
      />

      <ConfirmModal
        isOpen={!!del} onClose={() => setDel(null)}
        onConfirm={() => { if (del) deleteUdhaar(del.id); setDel(null) }}
        title="Delete entry?"
        message={del ? `Remove ${formatCurrency(del.amount)} (${del.person})? This cannot be undone.` : ''}
        confirmLabel="Delete" danger
      />
    </div>
  )
}
