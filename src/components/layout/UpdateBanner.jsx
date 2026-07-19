import { useApp } from '../../context/AppContext'

// Slim editorial banner shown when a newer APK release exists on GitHub.
// Download opens the release asset in the system browser; × hides this
// version until an even newer one is published.
export default function UpdateBanner() {
  const { update, dismissUpdate } = useApp()
  if (!update) return null

  return (
    <div className="fixed left-0 right-0 z-40 px-4" style={{ top: 'calc(var(--sat) + 10px)' }}>
      <div className="max-w-lg mx-auto bg-ink text-paper rounded-2xl px-4 py-3 flex items-center gap-3"
           style={{ boxShadow: '0 14px 30px -10px rgba(27,23,16,.6)' }}>
        <span className="text-xl leading-none">⬆️</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] tracking-[0.18em] uppercase text-paper/50">Update available</p>
          <p className="font-serif-i text-lg leading-tight">Finances v{update.version}</p>
        </div>
        <button
          onClick={() => window.open(update.url, '_blank')}
          className="shrink-0 bg-brand text-paper text-xs font-semibold tracking-wide uppercase px-3.5 py-2 rounded-xl active:scale-95 transition-transform"
        >
          Download
        </button>
        <button onClick={dismissUpdate} aria-label="Dismiss update" className="shrink-0 text-paper/50 text-lg px-1 -mr-1">
          ×
        </button>
      </div>
    </div>
  )
}
