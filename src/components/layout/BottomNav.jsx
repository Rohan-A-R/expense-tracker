const TABS = [
  { id: 'dashboard', label: 'HOME',    D: 'M3 10.5 12 3l9 7.5 M5.5 9.2V20h13V9.2 M9.5 20v-6h5v6' },
  { id: 'analytics', label: 'STATS',   D: 'M4 20h16 M6.5 20v-6 M12 20V5 M17.5 20v-9' },
  { id: 'networth',  label: 'MONEY',   D: 'M3 6.5h18v11H3z M3 10h18 M7 14h3' },
  { id: 'budget',    label: 'BUDGET',  D: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z' },
  { id: 'settings',  label: 'SETTINGS', D: 'M4 7h16M4 12h16M4 17h16' },
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-40 bg-paper border-t-2 border-ink pb-safe">
      <div className="flex items-stretch h-[64px] px-2">
        {TABS.map(tab => {
          const on = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-[5px] active:opacity-60 transition-opacity"
              style={{ color: on ? '#D9481C' : 'rgba(27,23,16,.42)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <path d={tab.D} />
              </svg>
              <span className="text-[9px] font-extrabold tracking-[1px]">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
