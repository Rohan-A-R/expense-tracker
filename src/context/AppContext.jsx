import { createContext, useContext, useEffect, useReducer, useCallback } from 'react'
import * as db from '../services/db'
import { enableDailyReminder, isNotificationsSupported } from '../services/notifications'
import { fetchHoldingPrice, priceKey, fetchMfHistory, navOnOrBefore, fetchMetalRates } from '../services/marketData'
import { DEFAULT_CATEGORIES } from '../utils/sampleData'
import { currentFinMonth, finMonthOf } from '../utils/formatters'
import { computeNetWorth, assetMetal, METALS } from '../utils/networth'
import { buildDemoData } from '../utils/demoData'

const todayStr = () => new Date().toISOString().split('T')[0]

const AppContext = createContext(null)

const initialState = {
  expenses: [],
  categories: [],
  budgets: {},
  udhaar: [],
  holdings: [],
  assets: [],
  netWorthSnaps: [],   // [{ date, total, breakdown }]
  prices: {},          // { [priceKey]: { price, prevClose, at } }
  pricesUpdatedAt: null,
  pricesLoading: false,
  metalRates: {},      // { gold|silver|platinum: { perGram, prevPerGram, at } }
  settings: { theme: 'light', currency: '₹' },
  monthStartDay: 1,
  loading: true,
  activeMonth: currentFinMonth(1),
  demoLoaded: false,
}

// month is always derived from date + monthStartDay so changing payday re-buckets everything
const withMonth = (list, startDay) => list.map(r => ({ ...r, month: finMonthOf(r.date, startDay) }))

function reducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state, ...action.payload, loading: false }
    case 'ADD_EXPENSE':
      return { ...state, expenses: [action.payload, ...state.expenses] }
    case 'UPDATE_EXPENSE':
      return {
        ...state,
        expenses: state.expenses.map(e => e.id === action.payload.id ? action.payload : e),
      }
    case 'DELETE_EXPENSE':
      return { ...state, expenses: state.expenses.filter(e => e.id !== action.payload) }
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload }
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] }
    case 'UPDATE_CATEGORY':
      return {
        ...state,
        categories: state.categories.map(c => c.id === action.payload.id ? action.payload : c),
      }
    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload) }
    case 'SET_BUDGET':
      return { ...state, budgets: { ...state.budgets, [action.payload.id]: action.payload } }
    case 'ADD_UDHAAR':
      return { ...state, udhaar: [action.payload, ...state.udhaar] }
    case 'UPDATE_UDHAAR_MANY':
      return {
        ...state,
        udhaar: state.udhaar.map(u => action.payload.find(p => p.id === u.id) || u),
      }
    case 'DELETE_UDHAAR':
      return { ...state, udhaar: state.udhaar.filter(u => u.id !== action.payload) }
    case 'ADD_ASSET':
      return { ...state, assets: [...state.assets, action.payload] }
    case 'UPDATE_ASSET':
      return { ...state, assets: state.assets.map(a => a.id === action.payload.id ? action.payload : a) }
    case 'DELETE_ASSET':
      return { ...state, assets: state.assets.filter(a => a.id !== action.payload) }
    case 'UPSERT_SNAP':
      return {
        ...state,
        netWorthSnaps: [
          ...state.netWorthSnaps.filter(s => s.date !== action.payload.date),
          action.payload,
        ].sort((a, b) => a.date.localeCompare(b.date)),
      }
    case 'ADD_HOLDING':
      return { ...state, holdings: [action.payload, ...state.holdings] }
    case 'UPDATE_HOLDING':
      return { ...state, holdings: state.holdings.map(h => h.id === action.payload.id ? action.payload : h) }
    case 'DELETE_HOLDING':
      return { ...state, holdings: state.holdings.filter(h => h.id !== action.payload) }
    case 'SET_PRICES_LOADING':
      return { ...state, pricesLoading: action.payload }
    case 'SET_PRICES':
      return { ...state, prices: action.payload.prices, pricesUpdatedAt: action.payload.at, pricesLoading: false }
    case 'SET_METAL_RATES':
      return { ...state, metalRates: { ...state.metalRates, ...action.payload } }
    case 'SET_MONTH_START_DAY':
      // re-derive every month bucket under the new payday
      return {
        ...state,
        monthStartDay: action.payload,
        activeMonth: currentFinMonth(action.payload),
        expenses: withMonth(state.expenses, action.payload),
      }
    case 'SET_ACTIVE_MONTH':
      return { ...state, activeMonth: action.payload }
    case 'SET_THEME':
      return { ...state, settings: { ...state.settings, theme: action.payload } }
    case 'RESET':
      return { ...initialState, categories: state.categories, monthStartDay: state.monthStartDay, loading: false, netWorthSnaps: [], assets: [] }
    default:
      return state
  }
}

// Guard against React StrictMode double-running the init effect in dev,
// which races the category/sample seeding into duplicate-key errors.
let initPromise = null

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const startDay = state.monthStartDay

  useEffect(() => {
    async function init() {
      await db.seedCategories(DEFAULT_CATEGORIES)

      // Auto-expire sample data a day after it was loaded (if not already cleared).
      // Only demo-tagged records are removed — the user's own entries are kept.
      const [demoFlag, demoAt] = await Promise.all([db.getSetting('demoLoaded'), db.getSetting('demoLoadedAt')])
      if (demoFlag && demoAt && Date.now() - demoAt > 86400000) {
        await db.clearDemoData()
        await db.setSetting('demoLoaded', false)
      }
      const [expenses, categories, budgets, udhaar, holdings, assets, snaps, savedStartDay, priceCache, pricesAt, metalRates, demoLoaded] = await Promise.all([
        db.getAllExpenses(),
        db.getAllCategories(),
        db.getAllBudgets(),
        db.getAllUdhaar(),
        db.getAllHoldings(),
        db.getAllAssets(),
        db.getAllNetWorthSnaps(),
        db.getSetting('monthStartDay'),
        db.getSetting('priceCache'),
        db.getSetting('pricesUpdatedAt'),
        db.getSetting('metalRates'),
        db.getSetting('demoLoaded'),
      ])
      const sd = Number(savedStartDay) || 1

      // New installs start empty — no sample data seeded. Existing users keep whatever they have.
      const allExpenses = expenses

      dispatch({
        type: 'INIT',
        payload: {
          expenses: withMonth(allExpenses, sd).sort((a, b) => new Date(b.date) - new Date(a.date)),
          categories,
          budgets: budgets.reduce((acc, b) => { acc[b.id] = b; return acc }, {}),
          udhaar: udhaar.sort((a, b) => b.createdAt - a.createdAt),
          holdings: holdings.sort((a, b) => b.createdAt - a.createdAt),
          assets: assets.sort((a, b) => a.id - b.id),
          netWorthSnaps: snaps.sort((a, b) => a.date.localeCompare(b.date)),
          prices: priceCache || {},
          pricesUpdatedAt: pricesAt || null,
          metalRates: metalRates || {},
          demoLoaded: !!demoLoaded,
          monthStartDay: sd,
          activeMonth: currentFinMonth(sd),
        },
      })

      // Re-arm the daily reminder in case the OS dropped it (reboot, app update)
      if (isNotificationsSupported() && (await db.getSetting('dailyReminder'))) {
        enableDailyReminder().catch(() => {})
      }
    }
    if (!initPromise) initPromise = init()
    else initPromise = initPromise.then(init) // re-mount: reuse, re-dispatch INIT
  }, [])

  useEffect(() => {
    // Editorial paper theme is light-only
    document.documentElement.classList.remove('dark')
  }, [])

  // On launch: catch up any due SIP installments, then refresh prices + gold rate once/day.
  useEffect(() => {
    if (state.loading) return
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    // Metal rate refresh (independent of holdings — you can own metal with no stocks).
    // Refresh a metal if any asset uses it and its cached rate is missing or from before today.
    const metalsHeld = [...new Set(state.assets.map(assetMetal).filter(Boolean))]
    const staleMetals = metalsHeld.filter(m => !state.metalRates[m]?.at || state.metalRates[m].at < startOfToday)
    if (staleMetals.length) refreshMetalRates(staleMetals).catch(() => {})
    if (!state.holdings.length) return
    processSips(state.holdings)
      .catch(() => {})
      .finally(() => {
        if (!state.pricesUpdatedAt || state.pricesUpdatedAt < startOfToday) {
          refreshPrices(state.holdings).catch(() => {})
        }
      })
  }, [state.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save one net-worth snapshot per calendar day. Recomputes and overwrites today's
  // row whenever assets / holdings / prices / udhaar change, so the trend line is always
  // truthful. Keyed by date → repeated writes just replace the same day's point.
  useEffect(() => {
    if (state.loading) return
    // Don't record real history while the demo dataset is loaded — it would pollute
    // the user's actual net-worth trend once they clear the sample.
    if (state.demoLoaded) return
    const nw = computeNetWorth(state)
    // Nothing to track yet — don't seed an empty snapshot
    if (nw.total === 0 && nw.assetsTotal === 0 && nw.liabilities === 0) return
    const date = todayStr()
    const existing = state.netWorthSnaps.find(s => s.date === date)
    const total = Math.round(nw.total)
    if (existing && Math.round(existing.total) === total) return
    const snap = {
      date,
      total,
      breakdown: {
        investments: Math.round(nw.investments),
        bankCash: Math.round(nw.bankCash),
        others: Math.round(nw.others),
        udhaarNet: Math.round(nw.udhaarNet),
        loans: Math.round(nw.loans),
      },
    }
    db.putNetWorthSnap(snap).then(() => dispatch({ type: 'UPSERT_SNAP', payload: snap })).catch(() => {})
  }, [state.loading, state.demoLoaded, state.assets, state.holdings, state.prices, state.udhaar, state.metalRates]) // eslint-disable-line react-hooks/exhaustive-deps

  const addExpense = useCallback(async (data) => {
    const expense = await db.addExpense({ ...data, month: finMonthOf(data.date, startDay) })
    dispatch({ type: 'ADD_EXPENSE', payload: expense })
    return expense
  }, [startDay])

  const updateExpense = useCallback(async (data) => {
    const expense = await db.updateExpense({ ...data, month: finMonthOf(data.date, startDay) })
    dispatch({ type: 'UPDATE_EXPENSE', payload: expense })
  }, [startDay])

  const deleteExpense = useCallback(async (id) => {
    await db.deleteExpense(id)
    dispatch({ type: 'DELETE_EXPENSE', payload: id })
  }, [])

  const addCategory = useCallback(async (data) => {
    const cat = await db.addCategory(data)
    dispatch({ type: 'ADD_CATEGORY', payload: cat })
    return cat
  }, [])

  const updateCategory = useCallback(async (data) => {
    await db.updateCategory(data)
    dispatch({ type: 'UPDATE_CATEGORY', payload: data })
  }, [])

  const deleteCategory = useCallback(async (id) => {
    await db.deleteCategory(id)
    dispatch({ type: 'DELETE_CATEGORY', payload: id })
  }, [])

  const setBudget = useCallback(async (budget) => {
    await db.setBudget(budget)
    dispatch({ type: 'SET_BUDGET', payload: budget })
  }, [])

  // Udhaar
  const addUdhaar = useCallback(async (data) => {
    const entry = await db.addUdhaar({ ...data, status: 'open' })
    dispatch({ type: 'ADD_UDHAAR', payload: entry })
    return entry
  }, [])

  // Mark every open entry for a person as settled
  const settleUdhaarPerson = useCallback(async (person, openEntries) => {
    const settled = openEntries.map(u => ({ ...u, status: 'settled', settledAt: Date.now() }))
    for (const u of settled) await db.updateUdhaar(u)
    dispatch({ type: 'UPDATE_UDHAAR_MANY', payload: settled })
  }, [])

  const deleteUdhaar = useCallback(async (id) => {
    await db.deleteUdhaar(id)
    dispatch({ type: 'DELETE_UDHAAR', payload: id })
  }, [])

  // Portfolio
  const holdingId = (h) => h.kind === 'mf' ? `mf:${h.schemeCode}` : h.symbol

  // Adding a holding you already own averages in: qty sums, buy price becomes the
  // weighted average. NSE vs BSE (RELIANCE.NS vs .BO) are different symbols → kept apart.
  const addHolding = useCallback(async (data) => {
    const existing = state.holdings.find(h => h.kind === data.kind && holdingId(h) === holdingId(data))
    if (existing) {
      const q1 = Number(existing.qty), q2 = Number(data.qty)
      const totalQty = q1 + q2
      const avgBuy = totalQty > 0 ? (q1 * Number(existing.avgBuy) + q2 * Number(data.avgBuy)) / totalQty : 0
      const merged = { ...existing, qty: totalQty, avgBuy }
      await db.updateHolding(merged)
      dispatch({ type: 'UPDATE_HOLDING', payload: merged })
      return merged
    }
    const entry = await db.addHolding(data)
    dispatch({ type: 'ADD_HOLDING', payload: entry })
    return entry
  }, [state.holdings])

  // Overwrite qty / avg buy / SIP config (corrections, partial sells, SIP edits)
  const updateHolding = useCallback(async (holding, changes) => {
    const merged = { ...holding }
    if (changes.qty != null) merged.qty = Number(changes.qty)
    if (changes.avgBuy != null) merged.avgBuy = Number(changes.avgBuy)
    if ('sip' in changes) merged.sip = changes.sip
    await db.updateHolding(merged)
    dispatch({ type: 'UPDATE_HOLDING', payload: merged })
    return merged
  }, [])

  // Apply any SIP installments that came due since the holding was last processed.
  // Each installment buys amount/NAV units at that month's NAV → averages in.
  // Runs on launch (can't run in background); catches up all missed months at once.
  const processSips = useCallback(async (holdings) => {
    const sips = (holdings || []).filter(h => h.kind === 'mf' && h.sip && Number(h.sip.amount) > 0)
    if (!sips.length) return
    const now = new Date()
    for (const h of sips) {
      try {
        const { history } = await fetchMfHistory(h.schemeCode)
        if (!history.length) continue
        let units = Number(h.qty)
        let invested = Number(h.qty) * Number(h.avgBuy)
        let applied = 0
        const [ly, lm] = (h.sip.lastRun || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number)
        const cursor = new Date(ly, lm - 1)   // last processed month
        let lastRun = h.sip.lastRun
        while (true) {
          cursor.setMonth(cursor.getMonth() + 1)
          const y = cursor.getFullYear(), m = cursor.getMonth()
          if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) break
          const isCurrent = y === now.getFullYear() && m === now.getMonth()
          if (isCurrent && now.getDate() < Number(h.sip.day)) break  // this month's SIP date not reached yet
          const nav = navOnOrBefore(history, new Date(y, m, Number(h.sip.day)))
          if (nav > 0) {
            units += Number(h.sip.amount) / nav
            invested += Number(h.sip.amount)
            applied++
          }
          lastRun = `${y}-${String(m + 1).padStart(2, '0')}`
        }
        if (applied > 0) {
          const merged = { ...h, qty: units, avgBuy: invested / units, sip: { ...h.sip, lastRun } }
          await db.updateHolding(merged)
          dispatch({ type: 'UPDATE_HOLDING', payload: merged })
        }
      } catch { /* skip this fund on failure; retries next launch */ }
    }
  }, [])

  const deleteHolding = useCallback(async (id) => {
    await db.deleteHolding(id)
    dispatch({ type: 'DELETE_HOLDING', payload: id })
  }, [])

  // Net-worth assets (bank, cash, gold, FD, other, loan)
  const addAsset = useCallback(async (data) => {
    const asset = await db.addAsset(data)
    dispatch({ type: 'ADD_ASSET', payload: asset })
    return asset
  }, [])

  const updateAsset = useCallback(async (data) => {
    const asset = await db.updateAsset(data)
    dispatch({ type: 'UPDATE_ASSET', payload: asset })
    return asset
  }, [])

  const deleteAsset = useCallback(async (id) => {
    await db.deleteAsset(id)
    dispatch({ type: 'DELETE_ASSET', payload: id })
  }, [])

  // Fetch latest prices for every holding, cache the results. Failed fetches keep
  // their last-known cached price so one dead symbol never blanks the whole page.
  const refreshPrices = useCallback(async (holdings) => {
    const list = holdings || []
    if (!list.length) return
    dispatch({ type: 'SET_PRICES_LOADING', payload: true })
    const cache = { ...(await db.getSetting('priceCache') || {}) }
    const results = await Promise.allSettled(list.map(h => fetchHoldingPrice(h)))
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') cache[priceKey(list[i])] = r.value
    })
    const at = Date.now()
    await db.setSetting('priceCache', cache)
    await db.setSetting('pricesUpdatedAt', at)
    dispatch({ type: 'SET_PRICES', payload: { prices: cache, at } })
  }, [])

  // Fetch live ₹/gram rates for the given metals and cache them. Used to value metal assets.
  const refreshMetalRates = useCallback(async (metals) => {
    const fresh = await fetchMetalRates(metals || Object.keys(METALS))
    if (!Object.keys(fresh).length) return {}
    const merged = { ...(await db.getSetting('metalRates') || {}), ...fresh }
    await db.setSetting('metalRates', merged)
    dispatch({ type: 'SET_METAL_RATES', payload: fresh })
    return fresh
  }, [])

  const setMonthStartDay = useCallback(async (day) => {
    const d = Math.min(Math.max(Number(day) || 1, 1), 28)
    await db.setSetting('monthStartDay', d)
    dispatch({ type: 'SET_MONTH_START_DAY', payload: d })
  }, [])

  const resetAllData = useCallback(async () => {
    await db.clearAllData()
    dispatch({ type: 'RESET' })
  }, [])

  // Re-read every store and re-init state (used after bulk demo load/clear)
  const refreshAllState = useCallback(async () => {
    const [expenses, udhaar, holdings, assets, snaps, categories, budgets, priceCache, pricesAt, metalRates, demoLoaded] = await Promise.all([
      db.getAllExpenses(), db.getAllUdhaar(), db.getAllHoldings(), db.getAllAssets(), db.getAllNetWorthSnaps(),
      db.getAllCategories(), db.getAllBudgets(),
      db.getSetting('priceCache'), db.getSetting('pricesUpdatedAt'), db.getSetting('metalRates'), db.getSetting('demoLoaded'),
    ])
    dispatch({
      type: 'INIT',
      payload: {
        expenses: withMonth(expenses, startDay).sort((a, b) => new Date(b.date) - new Date(a.date)),
        udhaar: udhaar.sort((a, b) => b.createdAt - a.createdAt),
        holdings: holdings.sort((a, b) => b.createdAt - a.createdAt),
        assets: assets.sort((a, b) => a.id - b.id),
        netWorthSnaps: snaps.sort((a, b) => a.date.localeCompare(b.date)),
        categories,
        budgets: budgets.reduce((acc, b) => { acc[b.id] = b; return acc }, {}),
        prices: priceCache || {}, pricesUpdatedAt: pricesAt || null, metalRates: metalRates || {},
        demoLoaded: !!demoLoaded,
      },
    })
  }, [startDay])

  // Load the demo dataset so a new user can explore a populated app. Everything is
  // tagged demo:true; clearSampleData removes exactly these.
  const loadSampleData = useCallback(async () => {
    const d = buildDemoData()
    for (const e of d.expenses) await db.addExpense(e)
    await db.setBudget(d.budget)
    for (const h of d.holdings) await db.addHolding(h)
    for (const a of d.assets) await db.addAsset(a)
    for (const u of d.udhaar) await db.addUdhaar(u)
    for (const s of d.snaps) await db.putNetWorthSnap(s)
    await db.setSetting('priceCache', d.priceCache)
    await db.setSetting('pricesUpdatedAt', Date.now())
    await db.setSetting('metalRates', d.metalRates)
    await db.setSetting('demoLoaded', true)
    await db.setSetting('demoLoadedAt', Date.now())
    await refreshAllState()
  }, [refreshAllState])

  const clearSampleData = useCallback(async () => {
    await db.clearDemoData()
    await db.setSetting('demoLoaded', false)
    await refreshAllState()
  }, [refreshAllState])

  const importData = useCallback(async (data) => {
    await db.clearAllData()
    if (data.expenses) await db.importExpenses(data.expenses.map(({ id, ...e }) => e))
    await db.importRecords('udhaar', data.udhaar)
    await db.importRecords('holdings', data.holdings)
    await db.importRecords('assets', data.assets)
    for (const s of data.netWorthSnaps || []) await db.putNetWorthSnap(s)
    // Restore budgets and categories from the backup (put = overwrite by id)
    for (const b of data.budgets || []) await db.setBudget(b)
    for (const c of data.categories || []) await db.updateCategory(c)
    const [expenses, udhaar, holdings, assets, snaps, categories, budgets] = await Promise.all([
      db.getAllExpenses(), db.getAllUdhaar(),
      db.getAllHoldings(), db.getAllAssets(), db.getAllNetWorthSnaps(),
      db.getAllCategories(), db.getAllBudgets(),
    ])
    dispatch({
      type: 'INIT',
      payload: {
        expenses: withMonth(expenses, startDay).sort((a, b) => new Date(b.date) - new Date(a.date)),
        udhaar: udhaar.sort((a, b) => b.createdAt - a.createdAt),
        holdings: holdings.sort((a, b) => b.createdAt - a.createdAt),
        assets: assets.sort((a, b) => a.id - b.id),
        netWorthSnaps: snaps.sort((a, b) => a.date.localeCompare(b.date)),
        categories,
        budgets: budgets.reduce((acc, b) => { acc[b.id] = b; return acc }, {}),
      },
    })
  }, [startDay])

  const value = {
    ...state,
    addExpense,
    updateExpense,
    deleteExpense,
    addCategory,
    updateCategory,
    deleteCategory,
    setBudget,
    addUdhaar,
    settleUdhaarPerson,
    deleteUdhaar,
    addHolding,
    updateHolding,
    deleteHolding,
    addAsset,
    updateAsset,
    deleteAsset,
    refreshPrices,
    refreshMetalRates,
    setMonthStartDay,
    resetAllData,
    importData,
    loadSampleData,
    clearSampleData,
    setActiveMonth: (month) => dispatch({ type: 'SET_ACTIVE_MONTH', payload: month }),
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
