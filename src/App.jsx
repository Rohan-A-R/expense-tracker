import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { getSetting } from './services/db'
import BottomNav from './components/layout/BottomNav'
import PinLock from './components/security/PinLock'
import LockOnboard from './components/security/LockOnboard'
import WelcomeTour from './components/onboarding/WelcomeTour'
import { isBiometricAvailable } from './services/biometrics'
import { setSetting } from './services/db'
import Dashboard from './pages/Dashboard'
import Expenses from './pages/Expenses'
import Analytics from './pages/Analytics'
import Budget from './pages/Budget'
import Settings from './pages/Settings'
import Udhaar from './pages/Udhaar'
import Portfolio from './pages/Portfolio'
import NetWorth from './pages/NetWorth'
import ExpenseForm from './components/expenses/ExpenseForm'

const SUB_PAGES = ['udhaar', 'portfolio', 'expenses']
const NO_FAB = ['settings', 'udhaar', 'portfolio', 'networth']

function AppContent() {
  const { loading, loadSampleData } = useApp()
  const [page, setPage] = useState('dashboard')
  const [returnTo, setReturnTo] = useState('dashboard')
  const [showAdd, setShowAdd] = useState(false)
  const [lock, setLock] = useState({ checked: false, hash: null, unlocked: false, biometric: false })
  const [showOnboard, setShowOnboard] = useState(false)
  const [showTour, setShowTour] = useState(false)

  useEffect(() => {
    Promise.all([getSetting('appPin'), getSetting('appBiometric'), getSetting('lockOnboarded'), getSetting('tourDone')])
      .then(async ([hash, bio, onboarded, tourDone]) => {
        setLock({ checked: true, hash, unlocked: !hash, biometric: !!bio })
        if (!tourDone) setShowTour(true)   // first launch → welcome tour
        // First launch, no lock yet, device supports fingerprint → offer to set it up
        if (!hash && !onboarded && await isBiometricAvailable()) setShowOnboard(true)
      })
  }, [])

  const finishTour = () => { setSetting('tourDone', true); setShowTour(false) }

  // Open a sub page (cashflow/udhaar) remembering where we came from
  const openSub = (target, from) => { setReturnTo(from); setPage(target) }

  if (!lock.checked || loading) {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-5 text-ink">
        <div className="font-serif-i text-4xl">Finances</div>
        <div className="w-40 h-px bg-ink/70" />
        <div className="flex gap-1.5">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand/50 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
          ))}
        </div>
        <p className="text-ink/45 text-xs tracking-widest uppercase">Loading your finances</p>
      </div>
    )
  }

  if (lock.hash && !lock.unlocked) {
    return <PinLock storedHash={lock.hash} biometricEnabled={lock.biometric} onUnlock={() => setLock(l => ({ ...l, unlocked: true }))} />
  }

  return (
    <div className="min-h-screen bg-paper max-w-lg mx-auto relative select-none text-ink">
      <main className="pb-24">
        {page === 'dashboard' && <Dashboard onOpenUdhaar={() => openSub('udhaar', 'dashboard')} onOpenPortfolio={() => openSub('portfolio', 'dashboard')} onOpenSpends={() => openSub('expenses', 'dashboard')} />}
        {page === 'expenses'  && <Expenses onBack={() => setPage(returnTo)} />}
        {page === 'analytics' && <Analytics />}
        {page === 'networth'  && <NetWorth onOpenPortfolio={() => openSub('portfolio', 'networth')} onOpenUdhaar={() => openSub('udhaar', 'networth')} />}
        {page === 'budget'    && <Budget />}
        {page === 'settings'  && <Settings onOpenNetWorth={() => setPage('networth')} onOpenUdhaar={() => openSub('udhaar', 'settings')} onOpenPortfolio={() => openSub('portfolio', 'settings')} onReplayTour={() => setShowTour(true)} />}
        {page === 'udhaar'    && <Udhaar onBack={() => setPage(returnTo)} />}
        {page === 'portfolio' && <Portfolio onBack={() => setPage(returnTo)} />}
      </main>

      {/* FAB — only on main tracking pages */}
      {!NO_FAB.includes(page) && (
        <button
          onClick={() => setShowAdd(true)}
          aria-label="Add expense"
          className="fixed bottom-[92px] right-5 z-30 w-14 h-14 rounded-[17px] bg-ink flex items-center justify-center active:scale-90 transition-transform duration-100"
          style={{ boxShadow: '0 14px 28px -8px rgba(27,23,16,.55)' }}
        >
          <span className="text-paper text-3xl font-light leading-none -mt-0.5">+</span>
        </button>
      )}

      <BottomNav active={SUB_PAGES.includes(page) ? returnTo : page} onChange={setPage} />
      <ExpenseForm isOpen={showAdd} onClose={() => setShowAdd(false)} />

      {showOnboard && !showTour && (
        <LockOnboard onDone={(hash) => {
          setShowOnboard(false)
          if (hash) setLock({ checked: true, hash, unlocked: true, biometric: true })
        }} />
      )}

      {showTour && <WelcomeTour onDone={finishTour} onDemo={async () => { await loadSampleData(); finishTour() }} />}
    </div>
  )
}

export default function App() {
  return <AppProvider><AppContent /></AppProvider>
}
