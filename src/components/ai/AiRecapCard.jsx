import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { aiComplete } from '../../services/aiClient'
import { recapPrompt } from '../../services/aiContext'

// One-tap AI recap of the month. Nothing is sent until the user taps Generate.
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
    <div className="rounded-[22px] p-5 text-paper mb-6" style={{ background: '#1B1710' }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-[1.5px]" style={{ color: 'rgba(245,240,228,.55)' }}>AI RECAP</span>
        <span className="text-sm">🪄</span>
      </div>

      {state === 'done' ? (
        <>
          <p className="font-serif-n text-[19px] leading-snug mt-2">{text}</p>
          <button onClick={generate} className="text-[11px] font-bold mt-3" style={{ color: '#F0844F' }}>↻ Regenerate</button>
        </>
      ) : state === 'error' ? (
        <>
          <p className="text-[13.5px] leading-snug mt-2" style={{ color: 'rgba(245,240,228,.75)' }}>Couldn't reach the assistant — check your connection and try again.</p>
          <button onClick={generate} className="mt-3 px-4 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'rgba(245,240,228,.14)', color: '#F5F0E4' }}>Try again</button>
        </>
      ) : (
        <>
          <p className="text-[13.5px] leading-snug mt-1.5 mb-3" style={{ color: 'rgba(245,240,228,.7)' }}>
            A friendly summary of your month, written for you.
          </p>
          <button onClick={generate} disabled={state === 'loading'}
            className="px-4 py-2.5 rounded-xl text-xs font-bold active:scale-95 disabled:opacity-60"
            style={{ background: '#F5F0E4', color: '#1B1710' }}>
            {state === 'loading' ? 'Writing…' : '✨ Generate recap'}
          </button>
        </>
      )}
    </div>
  )
}
