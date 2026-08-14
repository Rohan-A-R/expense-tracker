import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { aiStream } from '../services/aiClient'
import { askPrompt } from '../services/aiContext'

const STARTERS = [
  'How much did I spend this month?',
  'Am I over budget?',
  'How do I add a SIP?',
  "What's my net worth?",
]

// Full-screen conversational assistant. History is in-memory (per session).
export default function AskFinances({ onBack }) {
  const app = useApp()
  const [messages, setMessages] = useState([])   // { role: 'user'|'assistant', text }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  async function send(q) {
    const question = (q ?? input).trim()
    if (!question || busy) return
    const history = messages
    // Add the user turn + an empty assistant placeholder (last message = the one we stream into).
    setMessages(m => [...m, { role: 'user', text: question }, { role: 'assistant', text: '', streaming: true }])
    setInput('')
    setBusy(true)
    const setLast = (patch) => setMessages(m => {
      const c = [...m]; c[c.length - 1] = { role: 'assistant', ...patch }; return c
    })
    try {
      const finalText = await aiStream(askPrompt(app, history, question), (full) => setLast({ text: full, streaming: true }))
      setLast({ text: finalText, streaming: false })
    } catch {
      setLast({ text: "I couldn't reach the assistant just now — check your connection and try again.", error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-14 pb-24 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 rule-2 pb-3 shrink-0">
        <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-xl border-[1.5px] border-ink flex items-center justify-center text-lg active:scale-90">←</button>
        <span className="font-serif-i text-[28px] leading-none flex-1">Ask Finances</span>
        <span className="text-xl">🪄</span>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide py-5 space-y-3">
        {messages.length === 0 && (
          <div className="pt-2">
            <p className="font-serif-n text-[22px] leading-snug text-ink/80">Ask me anything about your money or how the app works.</p>
            <p className="text-[12px] text-ink/45 mt-2 leading-snug">I use a summary of your on-device data to answer. Only sent when you ask.</p>
            <div className="flex flex-wrap gap-2 mt-5">
              {STARTERS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-[12.5px] font-semibold px-3 py-2 rounded-full border border-ink/25 text-ink/70 active:scale-95">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[82%] px-4 py-2.5 rounded-2xl rounded-br-md bg-ink text-paper text-[14px] leading-snug">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[88%] px-4 py-3 rounded-2xl rounded-bl-md border border-ink/20 text-[14px] leading-relaxed"
                style={m.error ? { color: '#D9481C', borderColor: 'rgba(217,72,28,.35)' } : {}}>
                {m.text
                  ? <>{m.text}{m.streaming && <span className="inline-block w-1.5 h-4 -mb-0.5 ml-0.5 bg-ink/50 animate-pulse" />}</>
                  : <span className="flex gap-1.5 py-0.5">
                      {[0, 1, 2].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink/40 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />)}
                    </span>}
              </div>
            </div>
          )
        ))}
      </div>

      {/* Composer */}
      <div className="shrink-0 flex items-end gap-2 pt-2 rule-ink" style={{ borderBottom: 'none', borderTop: '1px solid #1B1710' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Ask about your money…"
          className="flex-1 py-3 bg-transparent text-ink placeholder-ink/40 text-[15px] focus:outline-none"
        />
        <button onClick={() => send()} disabled={!input.trim() || busy}
          className="mb-1.5 w-10 h-10 rounded-xl bg-ink text-paper flex items-center justify-center text-lg active:scale-90 disabled:opacity-30">↑</button>
      </div>
    </div>
  )
}
