import { useState } from 'react'
import { hashPin } from '../../utils/pin'
import { biometricAuthenticate } from '../../services/biometrics'
import { setSetting } from '../../services/db'

// One-time first-launch prompt: set a PIN + turn on fingerprint unlock.
// A PIN is required as the fallback when fingerprint fails, so we collect both here.
export default function LockOnboard({ onDone }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function skip() {
    await setSetting('lockOnboarded', true)
    onDone(null)
  }

  async function enable() {
    if (!/^\d{4}$/.test(pin)) { setErr('PIN must be 4 digits'); return }
    if (pin !== confirm) { setErr('PINs do not match'); return }
    setBusy(true); setErr('')
    try {
      await biometricAuthenticate()            // confirm the fingerprint works first
      const hash = await hashPin(pin)
      await setSetting('appPin', hash)
      await setSetting('appBiometric', true)
      await setSetting('lockOnboarded', true)
      onDone(hash)                             // already unlocked this session
    } catch {
      setErr('Fingerprint not confirmed — try again or skip')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/45 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-sm bg-paper rounded-3xl border border-ink/15 overflow-hidden" style={{ boxShadow: '0 24px 60px -12px rgba(27,23,16,.5)' }}>
        <div className="px-7 pt-8 pb-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-ink flex items-center justify-center mb-4">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#F5F0E4" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 11a1 1 0 0 1 1 1c0 3-.4 5-1.2 6.6" />
              <path d="M7.5 6.8A6 6 0 0 1 18 11c0 1.2 0 2.3-.2 3.4" />
              <path d="M4.5 11a7.5 7.5 0 0 1 1.6-4.6" />
              <path d="M9 12a3 3 0 0 1 6 0c0 2.5-.3 4.4-.9 6.2" />
            </svg>
          </div>
          <div className="font-serif-i text-[27px] leading-tight mb-1.5">Lock your finances</div>
          <p className="text-[13px] text-ink/55 leading-relaxed">Set a 4-digit PIN and unlock with your fingerprint each time you open the app.</p>
        </div>

        <div className="px-7 pb-7">
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">4-DIGIT PIN</div>
          <input type="password" inputMode="numeric" maxLength={4} autoFocus value={pin}
            onChange={e => { setErr(''); setPin(e.target.value.replace(/\D/g, '')) }}
            placeholder="••••"
            className="w-full py-3 mb-4 bg-transparent rule-ink text-ink placeholder-ink/30 text-center font-serif-n text-3xl tracking-[12px] focus:outline-none" />
          <div className="text-[10px] font-bold tracking-[1.5px] text-ink/55 mb-2">CONFIRM PIN</div>
          <input type="password" inputMode="numeric" maxLength={4} value={confirm}
            onChange={e => { setErr(''); setConfirm(e.target.value.replace(/\D/g, '')) }}
            placeholder="••••"
            className="w-full py-3 mb-3 bg-transparent rule-ink text-ink placeholder-ink/30 text-center font-serif-n text-3xl tracking-[12px] focus:outline-none" />

          {err && <p className="text-[12.5px] text-brand font-semibold mb-3">{err}</p>}

          <button onClick={enable} disabled={busy || pin.length !== 4 || confirm.length !== 4}
            className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-40 mb-2">
            {busy ? 'Confirming…' : 'Enable fingerprint lock'}
          </button>
          <button onClick={skip} disabled={busy} className="w-full py-3 text-[13px] font-bold text-ink/50 tracking-wide">
            Maybe later
          </button>
          <p className="text-center text-[11px] text-ink/40 pt-2">You can change this anytime in Settings.</p>
        </div>
      </div>
    </div>
  )
}
