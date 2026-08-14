import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { aiComplete } from '../../services/aiClient'
import { recapPrompt } from '../../services/aiContext'

const ACCENT = '#6C5FB0'

// One-tap AI recap of the month. Nothing is sent until the user taps Generate.
// Editorial paper style: a bordered card with a purple accent rail, serif prose.
export default function AiRecapCard() {
  const app = useApp()
  const [state, setState] = useState('idle')  // idle | loading | done | error
  const [text, setText] = useState('')

  async function generate() {
    setState('loading')
    try {
      const out = await aiComplete(recapPrompt(app))
      setText(out)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden mb-6"
      style={{ border: '1px solid rgba(27,23,16,.14)', borderLeft: `3px solid ${ACCENT}`, background: 'rgba(108,95,176,.05)' }}>
      <div className="px-5 py-4">
        {/* Label */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: ACCENT }}>AI Recap</span>
          <span className="text-[13px]">🪄</span>
        </div>

        {state === 'done' ? (
          <>
            <p className="font-serif-n text-[19px] leading-snug mt-2 text-ink">{text}</p>
            <button onClick={generate} className="text-[11px] font-bold tracking-[1px] mt-3 active:opacity-60" style={{ color: ACCENT }}>↻ REGENERATE</button>
          </>
        ) : state === 'error' ? (
          <>
            <p className="text-[13.5px] leading-snug mt-1.5 text-ink/60">Couldn't reach the assistant — check your connection and try again.</p>
            <button onClick={generate} className="mt-3 px-4 py-2.5 rounded-xl text-xs font-bold bg-ink text-paper active:scale-95">Try again</button>
          </>
        ) : (
          <>
            <p className="text-[13.5px] leading-snug mt-1.5 mb-3.5 text-ink/60">
              A friendly summary of your month, written for you.
            </p>
            <button onClick={generate} disabled={state === 'loading'}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-paper active:scale-95 disabled:opacity-60"
              style={{ background: ACCENT }}>
              {state === 'loading' ? 'Writing…' : '✨ Generate recap'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
