import { useEffect, useRef, useState } from 'react'
import { hashPin } from '../../utils/pin'
import { biometricAuthenticate } from '../../services/biometrics'

const KEYS = ['1','2','3','4','5','6','7','8','9','fp','0','⌫']

export default function PinLock({ storedHash, biometricEnabled, onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const triedAuto = useRef(false)

  async function runBiometric() {
    try {
      await biometricAuthenticate()
      onUnlock()
    } catch { /* cancelled / failed → stay on PIN */ }
  }

  // Auto-prompt fingerprint once when the lock screen mounts
  useEffect(() => {
    if (biometricEnabled && !triedAuto.current) {
      triedAuto.current = true
      runBiometric()
    }
  }, [biometricEnabled])

  async function press(k) {
    if (k === '') return
    if (k === 'fp') { runBiometric(); return }
    setError(false)
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      if ((await hashPin(next)) === storedHash) onUnlock()
      else { setError(true); setTimeout(() => { setPin(''); setError(false) }, 600) }
    }
  }

  return (
    <div className="min-h-screen bg-paper max-w-lg mx-auto flex flex-col items-center justify-center px-10 select-none text-ink">
      <div className="font-serif-i text-4xl mb-1">Finances</div>
      <div className="w-24 h-px bg-ink/60 mb-8" />
      <p className="text-[11px] font-bold tracking-[2px] text-ink/55 mb-5">
        {error ? 'WRONG PIN' : 'ENTER YOUR PIN'}
      </p>

      {/* dots */}
      <div className="flex gap-4 mb-10">
        {[0,1,2,3].map(i => (
          <div key={i} className="w-3.5 h-3.5 rounded-full border-[1.5px] transition-colors"
            style={{
              borderColor: error ? '#D9481C' : '#1B1710',
              background: i < pin.length ? (error ? '#D9481C' : '#1B1710') : 'transparent',
            }} />
        ))}
      </div>

      {/* keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {KEYS.map((k, i) => {
          if (k === 'fp') {
            return biometricEnabled ? (
              <button key={i} onClick={() => press('fp')} aria-label="Unlock with fingerprint"
                className="aspect-square rounded-2xl border border-ink/25 flex items-center justify-center active:scale-90 active:bg-ink active:text-paper transition-transform">
                <FingerprintIcon />
              </button>
            ) : <span key={i} />
          }
          return (
            <button key={i} onClick={() => press(k)}
              className="aspect-square rounded-2xl font-serif-n text-2xl border border-ink/25 active:scale-90 active:bg-ink active:text-paper transition-transform">
              {k}
            </button>
          )
        })}
      </div>

      {biometricEnabled && (
        <button onClick={runBiometric} className="mt-8 text-xs font-bold text-brand tracking-wide">Use fingerprint</button>
      )}
    </div>
  )
}

function FingerprintIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 11a1 1 0 0 1 1 1c0 3-.4 5-1.2 6.6" />
      <path d="M7.5 6.8A6 6 0 0 1 18 11c0 1.2 0 2.3-.2 3.4" />
      <path d="M4.5 11a7.5 7.5 0 0 1 1.6-4.6" />
      <path d="M9 12a3 3 0 0 1 6 0c0 2.5-.3 4.4-.9 6.2" />
      <path d="M6.5 12a5.5 5.5 0 0 1 .3-1.8" />
      <path d="M6.6 16.5c.5-1.4.6-2.9.4-4.4" />
    </svg>
  )
}
