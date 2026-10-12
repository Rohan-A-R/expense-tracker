import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { aiComplete } from '../../services/aiClient'
import { recapPrompt } from '../../services/aiContext'

const ACCENT = '#6C5FB0'

// One-tap AI recap of the month. Nothing is sent until the user taps Generate.
// Editorial strip: ink rule, small-caps label, one serif line and a text action; the
// finished recap reads as a short column with a drop cap.
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

  const label = (
    <div className="flex items-center gap-2 text-[10px] font-bold tracking-[2px]" style={{ color: ACCENT }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />AI RECAP
    </div>
  )

  return (
    <section className="mb-6 -mt-2" style={{ borderBottom: '1px solid rgba(27,23,16,.15)' }}>
      {state === 'done' ? (
        <div className="py-4">
          <div className="flex items-baseline justify-between">
            {label}
            <button onClick={generate} className="text-[10px] font-bold tracking-[1.5px] text-ink/45 active:opacity-60">REWRITE ↻</button>
          </div>
          <p className="text-[14.5px] leading-[1.65] text-ink/85 mt-3">
            <span className="font-serif-n float-left text-[44px] leading-[0.85] mr-1.5 mt-1" style={{ color: ACCENT }}>{text.charAt(0)}</span>
            {text.slice(1)}
          </p>
          <p className="clear-left text-[10.5px] text-ink/40 pt-2">Written by AI from your app's own totals.</p>
        </div>
      ) : (
        // Idle / loading / error: one quiet line with a text action — no box, no big button.
        <button onClick={generate} disabled={state === 'loading'}
          className="w-full flex items-center justify-between gap-4 py-4 text-left active:opacity-70 disabled:opacity-100">
          <div className="min-w-0">
            {label}
            <p className="font-serif-i text-[21px] leading-tight mt-1.5">
              {state === 'loading' ? 'Reading your month…'
                : state === 'error' ? 'Couldn’t reach the assistant.'
                : 'Your month, in a paragraph.'}
            </p>
          </div>
          {state !== 'loading' && (
            <span className="shrink-0 text-[11px] font-bold tracking-[1.5px] px-3.5 py-2 rounded-full"
              style={{ border: '1.5px solid #1B1710' }}>
              {state === 'error' ? 'TRY AGAIN' : 'WRITE IT →'}
            </span>
          )}
        </button>
      )}
    </section>
  )
}
