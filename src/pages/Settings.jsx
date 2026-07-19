import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getSetting, setSetting } from '../services/db'
import { enableDailyReminder, disableDailyReminder, isNotificationsSupported } from '../services/notifications'
import { isBiometricAvailable, biometricAuthenticate } from '../services/biometrics'
import Modal, { ConfirmModal } from '../components/ui/Modal'
import { exportToJSON, exportToCSV, parseImportFile } from '../services/export'
import { formatCurrency } from '../utils/formatters'
import { APP_VERSION } from '../services/updateCheck'

const ICONS = ['🍽️','🛒','🥛','🥚','🍎','🥦','🚌','⚡','🏠','🛍️','💊','📄','📦','☕','🎬','🏋️','✈️','🎓','💇','🐾','🍕','🍜','🎮','📚','🚗','🎵']
const COLS  = ['#D9481C','#C77A1B','#C9972E','#4E9E6A','#3E9E9A','#3E7CA6','#6C5FB0','#9B5FC0','#C6486B','#B84E8F','#7E8794','#A07C4E','#3E7CA6','#4E9E6A']

function tint(hex, a) {
  const h = (hex || '#A07C4E').replace('#', '')
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

const SECTION = 'text-[11px] font-bold tracking-[2px] text-ink/55 rule-ink pb-2'

export default function Settings({ onOpenNetWorth, onOpenUdhaar, onOpenPortfolio, onReplayTour }) {
  const { expenses, categories, budgets, udhaar, holdings, assets, netWorthSnaps, activeMonth, addCategory, updateCategory, deleteCategory, resetAllData, importData, monthStartDay, setMonthStartDay, demoLoaded, clearSampleData } = useApp()
  const [showReset, setShowReset] = useState(false)
  const [showCat, setShowCat]     = useState(false)
  const [editCat, setEditCat]     = useState(null)
  const [catForm, setCatForm]     = useState({ name: '', icon: '📦', color: '#D9481C' })
  const [status, setStatus]       = useState('')
  const [reminderOn, setReminderOn] = useState(false)
  const [pinOn, setPinOn] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [pinForm, setPinForm] = useState({ pin: '', confirm: '' })
  const [bioOn, setBioOn] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    getSetting('dailyReminder').then(v => setReminderOn(!!v))
    getSetting('appPin').then(v => setPinOn(!!v))
    getSetting('appBiometric').then(v => setBioOn(!!v))
    isBiometricAvailable().then(setBioAvailable)
  }, [])

  async function toggleBiometric() {
    if (bioOn) {
      await setSetting('appBiometric', false); setBioOn(false); setStatus('Fingerprint unlock off')
    } else {
      try {
        await biometricAuthenticate()   // confirm it works before enabling
        await setSetting('appBiometric', true); setBioOn(true); setStatus('🔓 Fingerprint unlock on')
      } catch { setStatus('❌ Fingerprint not confirmed') }
    }
  }

  async function togglePin() {
    if (pinOn) {
      await setSetting('appPin', null)
      await setSetting('appBiometric', false)   // biometric depends on the PIN
      setPinOn(false); setBioOn(false); setStatus('🔓 App lock removed')
    } else {
      setPinForm({ pin: '', confirm: '' }); setShowPin(true)
    }
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pinForm.pin)) { setStatus('❌ PIN must be 4 digits'); return }
    if (pinForm.pin !== pinForm.confirm) { setStatus('❌ PINs do not match'); return }
    const { hashPin } = await import('../utils/pin')
    await setSetting('appPin', await hashPin(pinForm.pin))
    setPinOn(true); setShowPin(false); setStatus('🔒 App lock enabled')
  }

  async function toggleReminder() {
    if (reminderOn) {
      await disableDailyReminder(); await setSetting('dailyReminder', false); setReminderOn(false)
    } else {
      const ok = await enableDailyReminder()
      if (ok) { await setSetting('dailyReminder', true); setReminderOn(true) }
      else setStatus(isNotificationsSupported() ? '❌ Notification permission denied' : '❌ Reminders only work in the Android app')
    }
  }


  async function handleImport(e) {
    const file = e.target.files?.[0]; if (!file) return
    try {
      setStatus('Importing…')
      const data = await parseImportFile(file)
      await importData(data)
      setStatus(`✅ Imported ${data.expenses?.length || 0} expenses`)
    } catch (err) { setStatus(`❌ ${err.message}`) }
    e.target.value = ''
  }

  async function saveCategory() {
    if (!catForm.name.trim()) return
    editCat ? await updateCategory({ ...editCat, ...catForm }) : await addCategory({ ...catForm })
    setShowCat(false); setEditCat(null); setCatForm({ name: '', icon: '📦', color: '#D9481C' })
  }

  const monthTotal   = expenses.filter(e => e.month === activeMonth).reduce((s, e) => s + Number(e.amount), 0)
  const allTimeTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)

  const STATS = [
    { label: 'This month', value: formatCurrency(monthTotal),  br: true, bb: true },
    { label: 'All time',   value: formatCurrency(allTimeTotal), br: false, bb: true },
    { label: 'Entries',    value: String(expenses.length),      br: true, bb: false },
    { label: 'Categories', value: String(categories.length),    br: false, bb: false },
  ]
  const BACKUP = [
    { label: 'Export JSON backup', icon: '📦', fn: () => exportToJSON(expenses, categories, Object.values(budgets), { udhaar, holdings, assets, netWorthSnaps }) },
    { label: 'Export as CSV',      icon: '📊', fn: () => exportToCSV(expenses, categories) },
    { label: 'Import backup',      icon: '📥', fn: () => fileRef.current?.click() },
  ]

  const track = (on) => `w-[46px] h-[27px] rounded-[20px] p-[3px] flex cursor-pointer transition-all ${on ? 'bg-ink justify-end' : 'justify-start'}`
  const trackStyle = (on) => on ? {} : { background: 'rgba(27,23,16,.2)' }
  const knob = 'w-[21px] h-[21px] rounded-full bg-paper'

  return (
    <div className="min-h-screen px-6 pt-4">
      <div className="font-serif-i text-[34px] rule-2 pb-3 mb-5">Settings</div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 border border-ink/25 rounded-2xl overflow-hidden mb-6">
        {STATS.map(s => (
          <div key={s.label} className="px-4 py-4" style={{ borderRight: s.br ? '1px solid rgba(27,23,16,.2)' : 'none', borderBottom: s.bb ? '1px solid rgba(27,23,16,.2)' : 'none' }}>
            <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55">{s.label.toUpperCase()}</div>
            <div className="font-serif-n text-[26px] leading-tight">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Money */}
      <div className={SECTION}>MONEY</div>
      <button onClick={onOpenNetWorth} className="flex items-center gap-3.5 py-4 w-full text-left rule-dot">
        <span className="text-lg">🏛️</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Net worth</div>
          <div className="text-xs text-ink/50">Everything you own &amp; owe</div>
        </div>
        <span className="text-ink/40 text-lg">→</span>
      </button>
      <button onClick={onOpenPortfolio} className="flex items-center gap-3.5 py-4 w-full text-left rule-dot">
        <span className="text-lg">📈</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Portfolio</div>
          <div className="text-xs text-ink/50">Stocks &amp; mutual funds · live value</div>
        </div>
        <span className="text-ink/40 text-lg">→</span>
      </button>
      <button onClick={onOpenUdhaar} className="flex items-center gap-3.5 py-4 w-full text-left mb-6">
        <span className="text-lg">🤝</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Udhaar ledger</div>
          <div className="text-xs text-ink/50">Who owes you · who you owe</div>
        </div>
        <span className="text-ink/40 text-lg">→</span>
      </button>

      {/* Preferences */}
      <div className={SECTION}>PREFERENCES</div>
      <div className="flex items-center gap-3.5 py-4 rule-dot">
        <span className="text-lg">📆</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Month starts on</div>
          <div className="text-xs text-ink/50">{monthStartDay === 1 ? 'The 1st (calendar month)' : `Day ${monthStartDay} — your salary day`}</div>
        </div>
        <select value={monthStartDay} onChange={e => setMonthStartDay(Number(e.target.value))}
          className="bg-transparent border border-ink/25 rounded-xl px-3 py-2 text-sm font-bold text-ink focus:outline-none">
          {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3.5 py-4 rule-dot">
        <span className="text-lg">🔒</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">App lock</div>
          <div className="text-xs text-ink/50">{pinOn ? '4-digit PIN on every launch' : 'Protect the app with a PIN'}</div>
        </div>
        <div onClick={togglePin} className={track(pinOn)} style={trackStyle(pinOn)}><div className={knob} /></div>
      </div>
      {pinOn && bioAvailable && (
        <div className="flex items-center gap-3.5 py-4 rule-dot">
          <span className="text-lg">☝️</span>
          <div className="flex-1">
            <div className="text-sm font-semibold">Fingerprint unlock</div>
            <div className="text-xs text-ink/50">Use your phone's fingerprint instead of the PIN</div>
          </div>
          <div onClick={toggleBiometric} className={track(bioOn)} style={trackStyle(bioOn)}><div className={knob} /></div>
        </div>
      )}
      <div className="flex items-center gap-3.5 py-4 rule-dot">
        <span className="text-lg">⏰</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Daily reminder</div>
          <div className="text-xs text-ink/50">"Did you log today's expenses?" at 9 PM</div>
        </div>
        <div onClick={toggleReminder} className={track(reminderOn)} style={trackStyle(reminderOn)}><div className={knob} /></div>
      </div>
      <button onClick={onReplayTour} className="flex items-center gap-3.5 py-4 w-full text-left mb-6">
        <span className="text-lg">✨</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">Replay app tour</div>
          <div className="text-xs text-ink/50">See the welcome walkthrough again</div>
        </div>
        <span className="text-ink/40 text-lg">→</span>
      </button>

      {/* Categories */}
      <div className="flex items-center justify-between rule-ink pb-2">
        <span className="text-[11px] font-bold tracking-[2px] text-ink/55">CATEGORIES</span>
        <button onClick={() => { setEditCat(null); setCatForm({ name: '', icon: '📦', color: '#D9481C' }); setShowCat(true) }} className="text-xs font-bold text-brand">+ Add</button>
      </div>
      <div className="mb-6 max-h-72 overflow-y-auto scrollbar-hide">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-3.5 py-3 rule-dot">
            <div className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base" style={{ background: tint(cat.color, 0.18) }}>{cat.icon}</div>
            <span className="flex-1 text-sm font-semibold">{cat.name}</span>
            <button onClick={() => { setEditCat(cat); setCatForm({ name: cat.name, icon: cat.icon, color: cat.color }); setShowCat(true) }} className="text-[15px] opacity-50 p-1">✎</button>
            <button onClick={() => deleteCategory(cat.id)} className="text-[15px] opacity-50 p-1">🗑️</button>
          </div>
        ))}
      </div>

      {/* Backup */}
      <div className={SECTION}>BACKUP &amp; DATA</div>
      <div className="mb-6">
        {BACKUP.map(b => (
          <button key={b.label} onClick={async () => { try { await b.fn() } catch (e) { if (!/cancel/i.test(e?.message || '')) setStatus(`❌ ${e?.message || 'Export failed'}`) } }} className="flex items-center gap-3.5 py-3.5 w-full text-left rule-dot">
            <span className="text-[17px]">{b.icon}</span>
            <span className="flex-1 text-sm font-semibold">{b.label}</span>
            <span className="text-ink/40 text-lg">→</span>
          </button>
        ))}
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        {status && <p className="text-sm text-ink/60 pt-3">{status}</p>}
      </div>

      {demoLoaded && (
        <button onClick={async () => { await clearSampleData(); setStatus('✅ Sample data cleared — your own entries are untouched') }}
          className="flex items-center justify-center w-full py-4 mb-3 border-[1.5px] border-ink/30 rounded-2xl text-sm font-bold text-ink/70 active:scale-[0.98]">
          🧹 Clear sample data
        </button>
      )}
      <button onClick={() => setShowReset(true)} className="flex items-center justify-center w-full py-4 border-[1.5px] border-brand rounded-2xl text-sm font-bold text-brand active:scale-[0.98]">
        Reset all data
      </button>
      <p className="text-center text-[11px] text-ink/40 pt-6">100% offline · Data stays on your device</p>
      <p className="text-center text-[11px] text-ink/40 pb-6 pt-1">Finances v{APP_VERSION}</p>

      {/* Category modal */}
      <Modal isOpen={showCat} onClose={() => setShowCat(false)} title={editCat ? 'Edit category' : 'New category'}>
        <div className="px-6 py-4 pb-8">
          <div className="flex items-center gap-3.5 p-4 border border-ink/25 rounded-2xl mb-5">
            <div className="w-13 h-13 rounded-2xl flex items-center justify-center text-2xl" style={{ width: 52, height: 52, background: tint(catForm.color, 0.2) }}>{catForm.icon}</div>
            <div>
              <div className="text-[10px] font-bold tracking-[1.5px] text-ink/50">PREVIEW</div>
              <div className="text-[17px] font-bold">{catForm.name || 'Category name'}</div>
            </div>
          </div>
          <input
            type="text" value={catForm.name}
            onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Category name"
            className="w-full py-3 mb-5 bg-transparent rule-ink text-ink placeholder-ink/40 text-[15px] focus:outline-none"
          />
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
          <button onClick={saveCategory} className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98]">
            {editCat ? 'Save category' : 'Add category'}
          </button>
        </div>
      </Modal>

      {/* PIN setup modal */}
      <Modal isOpen={showPin} onClose={() => setShowPin(false)} title="Set app lock PIN">
        <div className="px-6 py-4 pb-8">
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">NEW 4-DIGIT PIN</div>
          <input type="password" inputMode="numeric" maxLength={4} autoFocus value={pinForm.pin}
            onChange={e => setPinForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
            placeholder="••••"
            className="w-full py-3 mb-5 bg-transparent rule-ink text-ink placeholder-ink/30 text-center font-serif-n text-3xl tracking-[12px] focus:outline-none" />
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">CONFIRM PIN</div>
          <input type="password" inputMode="numeric" maxLength={4} value={pinForm.confirm}
            onChange={e => setPinForm(f => ({ ...f, confirm: e.target.value.replace(/\D/g, '') }))}
            placeholder="••••"
            className="w-full py-3 mb-3 bg-transparent rule-ink text-ink placeholder-ink/30 text-center font-serif-n text-3xl tracking-[12px] focus:outline-none" />
          <p className="text-[11.5px] text-ink/50 mb-6">If you forget the PIN you'll need to clear the app's data — keep a backup exported.</p>
          <button onClick={savePin} disabled={pinForm.pin.length !== 4 || pinForm.confirm.length !== 4}
            className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40">
            Enable app lock
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showReset} onClose={() => setShowReset(false)}
        onConfirm={resetAllData}
        title="Reset all data?"
        message="This permanently erases every expense, budget and category on this device. This cannot be undone."
        confirmLabel="Reset" danger
      />
    </div>
  )
}
