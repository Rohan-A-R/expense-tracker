import { useState } from 'react'
import homeImg from '../../assets/tour/home.jpg'
import portfolioImg from '../../assets/tour/portfolio.jpg'
import moneyImg from '../../assets/tour/money.jpg'
import breakdownImg from '../../assets/tour/breakdown.jpg'
import trendsImg from '../../assets/tour/trends.jpg'
import udhaarImg from '../../assets/tour/udhaar.jpg'

// First-launch walkthrough — real app screens (with demo data) so new users see
// how the app looks once it's full. Screenshots are regenerated if a screen is redesigned.
const SLIDES = [
  { img: homeImg,      accent: '#D9481C', title: 'Everything at a glance',  body: "Your month's spend, budget, portfolio and dues — all on one home screen." },
  { img: portfolioImg, accent: '#4E9E6A', title: 'Track your investments',  body: 'Stocks, mutual funds and SIPs with live prices, returns and allocation.' },
  { img: moneyImg,     accent: '#6C5FB0', title: 'Your whole net worth',    body: 'Metals, FDs, loans and investments in one number — with a trend that grows.' },
  { img: breakdownImg, accent: '#C9972E', title: 'Where your money goes',   body: 'A clear category breakdown for every month.' },
  { img: trendsImg,    accent: '#3E7CA6', title: 'Spot the trends',         body: 'Watch each category move, month over month.' },
  { img: udhaarImg,    accent: '#3E9E9A', title: 'Never forget a debt',     body: 'Track who owes you and who you owe, person by person.' },
]

export default function WelcomeTour({ onDone, onDemo }) {
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const last = i === SLIDES.length - 1
  const s = SLIDES[i]

  return (
    <div className="fixed inset-0 z-[60] bg-paper max-w-lg mx-auto flex flex-col text-ink select-none">
      {/* Top bar: progress dots + Skip */}
      <div className="flex items-center justify-between px-6 pt-5">
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <div key={idx} className="h-1.5 rounded-full transition-all duration-200"
              style={{ width: idx === i ? 20 : 6, background: idx === i ? s.accent : 'rgba(27,23,16,.2)' }} />
          ))}
        </div>
        {!last && <button onClick={onDone} className="text-[12px] font-bold tracking-wide text-ink/45 active:opacity-60">SKIP</button>}
      </div>

      {/* Caption */}
      <div className="px-8 pt-6 pb-4 text-center">
        <h2 className="font-serif-i text-[28px] leading-tight mb-1.5">{s.title}</h2>
        <p className="text-[13.5px] text-ink/60 leading-snug max-w-sm mx-auto">{s.body}</p>
      </div>

      {/* Screenshot in a device frame */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 pb-2">
        <div className="h-full py-2 rounded-[26px] overflow-hidden"
          style={{ border: '6px solid #1B1710', boxShadow: `0 20px 44px -14px rgba(27,23,16,.4)`, background: '#1B1710' }}>
          <img src={s.img} alt={s.title} className="h-full w-auto object-contain rounded-[20px] block" style={{ maxHeight: '100%' }} />
        </div>
      </div>

      {/* Controls */}
      {last ? (
        <div className="px-6 py-6">
          <button onClick={async () => { setBusy(true); await onDemo() }} disabled={busy}
            className="w-full py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98] disabled:opacity-50 mb-2.5">
            {busy ? 'Loading sample…' : 'Explore with sample data'}
          </button>
          <button onClick={onDone} disabled={busy}
            className="w-full py-3.5 rounded-2xl border-[1.5px] border-ink/25 text-[15px] font-bold text-ink/70 active:scale-[0.98] disabled:opacity-50">
            Start fresh
          </button>
          <p className="text-center text-[11px] text-ink/40 pt-3">Sample data is clearly marked — remove it anytime in Settings.</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-6 py-6">
          {i > 0 && (
            <button onClick={() => setI(i - 1)}
              className="px-5 py-4 rounded-2xl border-[1.5px] border-ink/25 text-[15px] font-bold text-ink/70 active:scale-[0.98]">
              Back
            </button>
          )}
          <button onClick={() => setI(i + 1)}
            className="flex-1 py-4 rounded-2xl bg-ink text-paper font-bold text-[15px] active:scale-[0.98]">
            Next
          </button>
        </div>
      )}
    </div>
  )
}
